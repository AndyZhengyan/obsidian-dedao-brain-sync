import type { App, CachedMetadata, TFile } from 'obsidian';
import { buildCanonicalCategoryDir, formatCreatedDatePath } from './date-paths';
import { getCategoryDir } from './types';

export interface DatePathMigrationTarget {
  enabled: boolean;
  format: string;
}

export interface DatePathCategoryOrigin {
  path: string;
  category: string;
}

export interface DatePathAssetMoveEvidence {
  uid: string;
  sourcePath: string;
  targetPath: string;
}

export interface DatePathMigrationContext {
  source: DatePathMigrationTarget;
  categoryOrigins: Record<string, DatePathCategoryOrigin>;
  assetMoveEvidence: Record<string, DatePathAssetMoveEvidence>;
  beforeExecute: (
    categoryOrigins: Record<string, DatePathCategoryOrigin>,
    assetMoveEvidence: Record<string, DatePathAssetMoveEvidence>,
  ) => Promise<void>;
}

export type DatePathMigrationIssueCode =
  | 'invalid-metadata'
  | 'unsafe-path'
  | 'missing-generated-asset'
  | 'shared-asset'
  | 'duplicate-uid'
  | 'target-conflict'
  | 'inbound-link'
  | 'rename-failed'
  | 'rollback-failed';

export interface DatePathMigrationIssue {
  code: DatePathMigrationIssueCode;
  path: string;
  uid?: string;
  message: string;
}

export interface DatePathMigrationResult {
  scanned: number;
  moved: number;
  unchanged: number;
  skipped: number;
  failed: number;
  issues: DatePathMigrationIssue[];
}

type MigrationApp = Pick<App, 'vault' | 'metadataCache'>;

interface PlannedMove {
  file: TFile;
  sourcePath: string;
  targetPath: string;
}

interface NoteCandidate {
  file: TFile;
  pluginOwned: boolean;
  uid?: string;
  targetPath?: string;
  assets: PlannedMove[];
  assetClaims: Set<string>;
  blocked: boolean;
  skipped: boolean;
}

const RESERVED_SEGMENT_PATTERN = /[\\:*?"<>|\0]/;
const PLUGIN_SOURCES = new Set(['得到大脑', 'Get笔记']);
const GENERATED_ASSET_PATTERN =
  /(?:^|\/)asset\/|_(?:image(?:_\d+)?|audio|transcript|original|file_\d+)(?:\.|$)/i;

function dirname(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator < 0 ? '' : path.slice(0, separator);
}

function basename(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator < 0 ? path : path.slice(separator + 1);
}

function normalizeVaultPath(path: string): string | null {
  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

function pathMatchesFile(path: string | null, filePath: string): boolean {
  return path === filePath || (
    Boolean(path)
    && !basename(path as string).includes('.')
    && `${path}.md` === filePath
  );
}

function isSafeSegment(segment: string): boolean {
  return Boolean(segment)
    && segment !== '.'
    && segment !== '..'
    && !RESERVED_SEGMENT_PATTERN.test(segment);
}

function isInsideRoot(path: string, rootFolder: string): boolean {
  return path.startsWith(`${rootFolder}/`) && !path.includes('/asset/');
}

function readRequiredString(
  frontmatter: Record<string, unknown> | undefined,
  key: 'uid' | 'created' | 'note_type' | 'source',
): string | null {
  const value = frontmatter?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function existingCategoryDir(
  filePath: string,
  rootFolder: string,
  created: string,
  uid: string,
  context: DatePathMigrationContext,
): string | null {
  const relativeDir = dirname(filePath).slice(rootFolder.length + 1);
  if (!relativeDir) return null;

  const origin = context.categoryOrigins[uid];
  if (origin?.path === filePath) return origin.category;

  if (context.source.enabled) {
    const sourceDatePath = formatCreatedDatePath(created, context.source.format);
    if (relativeDir.startsWith(`${sourceDatePath}/`)) {
      return relativeDir.slice(sourceDatePath.length + 1);
    }
  }

  return relativeDir;
}

function desiredNotePath(
  file: TFile,
  rootFolder: string,
  created: string,
  categoryDir: string,
  target: DatePathMigrationTarget,
): string {
  if (!categoryDir.split('/').every(isSafeSegment)) {
    throw new Error('Unsafe category path');
  }
  const desiredDir = target.enabled
    ? buildCanonicalCategoryDir(rootFolder, categoryDir, created, target.format)
    : `${rootFolder}/${categoryDir}`;
  return `${desiredDir}/${basename(file.path)}`;
}

function referencedLinks(cache: CachedMetadata): string[] {
  return [...(cache.embeds ?? []), ...(cache.links ?? [])]
    .map(link => link.link.trim())
    .filter(Boolean);
}

function isAdjacentAsset(assetPath: string, notePath: string): boolean {
  return assetPath.startsWith(`${dirname(notePath)}/asset/`);
}

function issue(
  result: DatePathMigrationResult,
  code: DatePathMigrationIssueCode,
  path: string,
  message: string,
  uid?: string,
): void {
  result.issues.push({
    code,
    path,
    ...(uid ? { uid } : {}),
    message,
  });
}

function block(
  candidate: NoteCandidate,
  result: DatePathMigrationResult,
  code: DatePathMigrationIssueCode,
  path: string,
  message: string,
): void {
  if (!candidate.skipped) {
    candidate.skipped = true;
    result.skipped++;
  }
  candidate.blocked = true;
  issue(result, code, path, message, candidate.uid);
}

function skipCandidate(
  candidate: NoteCandidate,
  result: DatePathMigrationResult,
  code: DatePathMigrationIssueCode,
  path: string,
  message: string,
): void {
  if (!candidate.skipped) {
    candidate.skipped = true;
    result.skipped++;
  }
  issue(result, code, path, message, candidate.uid);
}

interface LinkResolution {
  link: string;
  resolved: TFile | null;
}

function resolveLinks(
  app: MigrationApp,
  file: TFile,
  cache: CachedMetadata,
): LinkResolution[] {
  return referencedLinks(cache).map(link => ({
    link,
    resolved: app.metadataCache.getFirstLinkpathDest(link, file.path),
  }));
}

function targetAssetForLink(
  app: MigrationApp,
  targetPath: string,
  link: string,
): TFile | null {
  const linkPath = link.split('#', 1)[0].replace(/^\.\//, '');
  const name = basename(linkPath);
  if (!name || !isSafeSegment(name)) return null;
  const targetAssetDir = `${dirname(targetPath)}/asset`;
  for (const candidatePath of [`${targetAssetDir}/${name}`, `${targetAssetDir}/${name}.md`]) {
    const candidate = app.vault.getAbstractFileByPath(candidatePath);
    if (
      candidate
      && typeof candidate === 'object'
      && 'path' in candidate
      && 'extension' in candidate
    ) {
      return candidate as TFile;
    }
  }
  return null;
}

function planCandidateAssets(
  app: MigrationApp,
  candidate: NoteCandidate,
  links: LinkResolution[],
  result: DatePathMigrationResult,
  evidence: Record<string, DatePathAssetMoveEvidence>,
): void {
  const targetPath = candidate.targetPath;
  if (!targetPath) return;

  const assets = new Map<string, PlannedMove>();
  for (const { link, resolved } of links) {
    if (resolved && isAdjacentAsset(resolved.path, candidate.file.path)) {
      const targetAssetPath = `${dirname(targetPath)}/asset/${basename(resolved.path)}`;
      candidate.assetClaims.add(resolved.path);
      assets.set(targetAssetPath, {
        file: resolved,
        sourcePath: resolved.path,
        targetPath: targetAssetPath,
      });
      continue;
    }

    const recovered = (
      resolved && isAdjacentAsset(resolved.path, targetPath)
        ? resolved
        : GENERATED_ASSET_PATTERN.test(link)
          ? targetAssetForLink(app, targetPath, link)
          : null
    );
    if (recovered) {
      const logicalSource = `${dirname(candidate.file.path)}/asset/${basename(recovered.path)}`;
      const recorded = evidence[recovered.path];
      if (
        !candidate.uid
        || recorded?.uid !== candidate.uid
        || recorded.sourcePath !== logicalSource
        || recorded.targetPath !== recovered.path
      ) {
        skipCandidate(
          candidate,
          result,
          'target-conflict',
          recovered.path,
          `Target asset has no matching migration evidence: ${recovered.path}`,
        );
        continue;
      }
      candidate.assetClaims.add(logicalSource);
      assets.set(recovered.path, {
        file: recovered,
        sourcePath: recovered.path,
        targetPath: recovered.path,
      });
      continue;
    }

    if (GENERATED_ASSET_PATTERN.test(link)) {
      skipCandidate(
        candidate,
        result,
        'missing-generated-asset',
        candidate.file.path,
        `Generated asset cannot be resolved: ${link}`,
      );
    }
  }
  candidate.assets = [...assets.values()]
    .sort((left, right) => left.targetPath.localeCompare(right.targetPath));
}

async function ensureFolder(app: MigrationApp, folderPath: string): Promise<void> {
  if (!app.vault.getAbstractFileByPath(folderPath)) {
    await app.vault.createFolder(folderPath);
  }
}

function preflightPlans(
  app: MigrationApp,
  candidates: NoteCandidate[],
  result: DatePathMigrationResult,
): void {
  const uidOwners = new Map<string, Set<NoteCandidate>>();
  const assetOwners = new Map<string, Set<NoteCandidate>>();
  const targetOwners = new Map<string, Set<NoteCandidate>>();

  for (const candidate of candidates) {
    if (candidate.uid) {
      const uidCandidates = uidOwners.get(candidate.uid) ?? new Set();
      uidCandidates.add(candidate);
      uidOwners.set(candidate.uid, uidCandidates);
    }

    for (const assetPath of candidate.assetClaims) {
      const owners = assetOwners.get(assetPath) ?? new Set();
      owners.add(candidate);
      assetOwners.set(assetPath, owners);
    }

    if (!candidate.targetPath) continue;
    const moves = [
      ...candidate.assets,
      { file: candidate.file, sourcePath: candidate.file.path, targetPath: candidate.targetPath },
    ];
    for (const move of moves) {
      const owners = targetOwners.get(move.targetPath) ?? new Set();
      owners.add(candidate);
      targetOwners.set(move.targetPath, owners);

      if (move.sourcePath !== move.targetPath && app.vault.getAbstractFileByPath(move.targetPath)) {
        block(
          candidate,
          result,
          'target-conflict',
          move.targetPath,
          `Target already exists: ${move.targetPath}`,
        );
      }
    }
  }

  for (const [uid, owners] of uidOwners) {
    if (owners.size < 2) continue;
    for (const owner of owners) {
      block(owner, result, 'duplicate-uid', owner.file.path, `UID appears in multiple notes: ${uid}`);
    }
  }

  for (const [assetPath, owners] of assetOwners) {
    if (owners.size < 2) continue;
    for (const owner of owners) {
      if (owner.pluginOwned) {
        block(owner, result, 'shared-asset', assetPath, `Asset is referenced by multiple notes: ${assetPath}`);
      }
    }
  }

  for (const [targetPath, owners] of targetOwners) {
    if (owners.size < 2) continue;
    for (const owner of owners) {
      block(owner, result, 'target-conflict', targetPath, `Multiple notes target the same path: ${targetPath}`);
    }
  }
}

function hasPlannedMove(candidate: NoteCandidate): boolean {
  return Boolean(
    candidate.targetPath
    && (
      candidate.file.path !== candidate.targetPath
      || candidate.assets.some(asset => asset.sourcePath !== asset.targetPath)
    )
  );
}

function preflightInboundLinks(
  app: MigrationApp,
  allMarkdownFiles: TFile[],
  candidates: NoteCandidate[],
  result: DatePathMigrationResult,
): void {
  const noteOwners = new Map(candidates.map(candidate => [candidate.file.path, candidate]));
  const moveOwners = new Map<string, { owner: NoteCandidate; targetPath: string }>();
  for (const candidate of candidates) {
    if (!candidate.pluginOwned || !hasPlannedMove(candidate)) continue;
    if (candidate.targetPath && candidate.file.path !== candidate.targetPath) {
      moveOwners.set(candidate.file.path, { owner: candidate, targetPath: candidate.targetPath });
    }
    for (const asset of candidate.assets) {
      if (asset.sourcePath !== asset.targetPath) {
        moveOwners.set(asset.sourcePath, { owner: candidate, targetPath: asset.targetPath });
      }
    }
  }

  const futurePath = (path: string): string => {
    const move = moveOwners.get(path);
    return move && !move.owner.blocked ? move.targetPath : path;
  };
  const remainsResolved = (
    link: string,
    sourceBefore: string,
    sourceAfter: string,
    targetBefore: string,
    targetAfter: string,
  ): boolean => {
    const linkPath = link.split('#', 1)[0].trim();
    if (!linkPath) return true;
    const relativeBefore = normalizeVaultPath(`${dirname(sourceBefore)}/${linkPath}`);
    if (pathMatchesFile(relativeBefore, targetBefore)) {
      return pathMatchesFile(
        normalizeVaultPath(`${dirname(sourceAfter)}/${linkPath}`),
        targetAfter,
      );
    }
    const rootBefore = normalizeVaultPath(linkPath.replace(/^\/+/, ''));
    if (pathMatchesFile(rootBefore, targetBefore)) {
      return pathMatchesFile(rootBefore, targetAfter);
    }
    // A basename-only Obsidian link cannot be proven stable when either side
    // moves because source proximity can change which duplicate is selected.
    return sourceBefore === sourceAfter && targetBefore === targetAfter;
  };

  const reported = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const sourceFile of allMarkdownFiles) {
      const cache = app.metadataCache.getFileCache(sourceFile);
      for (const { link, resolved } of resolveLinks(app, sourceFile, cache ?? {})) {
        if (!resolved) continue;
        const sourceOwner = noteOwners.get(sourceFile.path);
        const targetMove = moveOwners.get(resolved.path);
        const sourceMoves = Boolean(sourceOwner?.pluginOwned && !sourceOwner.blocked
          && futurePath(sourceFile.path) !== sourceFile.path);
        const targetMoves = Boolean(targetMove && !targetMove.owner.blocked);
        if (!sourceMoves && !targetMoves) continue;

        const sourceAfter = futurePath(sourceFile.path);
        const targetAfter = futurePath(resolved.path);
        if (remainsResolved(link, sourceFile.path, sourceAfter, resolved.path, targetAfter)) {
          continue;
        }

        const relation = `${sourceFile.path}\0${resolved.path}\0${link}`;
        if (reported.has(relation)) continue;
        reported.add(relation);
        const owners = new Set<NoteCandidate>();
        if (sourceMoves && sourceOwner) owners.add(sourceOwner);
        if (targetMoves && targetMove) owners.add(targetMove.owner);
        for (const owner of owners) {
          if (owner.blocked) continue;
          block(
            owner,
            result,
            'inbound-link',
            owner.file.path,
            `Link would resolve differently after migration (${sourceFile.path}): ${link}`,
          );
          changed = true;
        }
      }
    }
  }
}

async function executePlan(
  app: MigrationApp,
  plan: NoteCandidate & { uid: string; targetPath: string },
  result: DatePathMigrationResult,
): Promise<void> {
  const moves = [
    ...plan.assets.filter(asset => asset.sourcePath !== asset.targetPath),
    ...(plan.file.path === plan.targetPath
      ? []
      : [{ file: plan.file, sourcePath: plan.file.path, targetPath: plan.targetPath }]),
  ];
  if (moves.length === 0) {
    result.unchanged++;
    return;
  }

  const completed: PlannedMove[] = [];
  try {
    await ensureFolder(app, dirname(plan.targetPath));
    if (plan.assets.some(asset => asset.sourcePath !== asset.targetPath)) {
      await ensureFolder(app, `${dirname(plan.targetPath)}/asset`);
    }
    for (const move of moves) {
      await app.vault.rename(move.file, move.targetPath);
      completed.push(move);
    }
    result.moved++;
  } catch (error) {
    result.failed++;
    issue(
      result,
      'rename-failed',
      plan.file.path,
      error instanceof Error ? error.message : String(error),
      plan.uid,
    );
    for (const move of completed.reverse()) {
      try {
        await app.vault.rename(move.file, move.sourcePath);
      } catch (rollbackError) {
        issue(
          result,
          'rollback-failed',
          move.targetPath,
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          plan.uid,
        );
      }
    }
  }
}

/**
 * Reorganize plugin-owned local notes without reading remote data or mutating
 * note contents. All planning and conflict checks finish before any rename.
 */
export async function migrateDatePaths(
  app: MigrationApp,
  rootFolder: string,
  target: DatePathMigrationTarget,
  context: DatePathMigrationContext,
): Promise<DatePathMigrationResult> {
  const result: DatePathMigrationResult = {
    scanned: 0,
    moved: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    issues: [],
  };
  const root = rootFolder.trim();
  if (root !== rootFolder || !root.split('/').every(isSafeSegment)) {
    throw new Error(`Unsafe root folder: ${rootFolder}`);
  }

  const allMarkdownFiles = app.vault.getMarkdownFiles();
  const files = allMarkdownFiles
    .filter(file => isInsideRoot(file.path, root))
    .sort((left, right) => left.path.localeCompare(right.path));
  const candidates: NoteCandidate[] = [];
  const nextCategoryOrigins = { ...context.categoryOrigins };
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const links = resolveLinks(app, file, cache ?? {});
    const candidate: NoteCandidate = {
      file,
      pluginOwned: false,
      assets: [],
      assetClaims: new Set(
        links
          .map(link => link.resolved)
          .filter((asset): asset is TFile => Boolean(asset && isAdjacentAsset(asset.path, file.path)))
          .map(asset => asset.path),
      ),
      blocked: false,
      skipped: false,
    };
    candidates.push(candidate);

    const source = readRequiredString(cache?.frontmatter, 'source');
    if (!source || !PLUGIN_SOURCES.has(source)) {
      continue;
    }
    candidate.pluginOwned = true;
    result.scanned++;

    const uid = readRequiredString(cache?.frontmatter, 'uid');
    const created = readRequiredString(cache?.frontmatter, 'created');
    const noteType = readRequiredString(cache?.frontmatter, 'note_type');
    if (uid) candidate.uid = uid;

    if (!uid || !created || !noteType) {
      skipCandidate(
        candidate,
        result,
        'invalid-metadata',
        file.path,
        'Required string metadata is missing',
      );
      continue;
    }

    try {
      const category = existingCategoryDir(file.path, root, created, uid, context)
        ?? getCategoryDir(noteType);
      candidate.targetPath = desiredNotePath(file, root, created, category, target);
      nextCategoryOrigins[uid] = { path: file.path, category };
    } catch (error) {
      skipCandidate(
        candidate,
        result,
        'unsafe-path',
        file.path,
        error instanceof Error ? error.message : String(error),
      );
      continue;
    }

    planCandidateAssets(app, candidate, links, result, context.assetMoveEvidence);
  }

  preflightPlans(app, candidates, result);
  preflightInboundLinks(app, allMarkdownFiles, candidates, result);
  const nextAssetMoveEvidence = { ...context.assetMoveEvidence };
  for (const candidate of candidates) {
    if (!candidate.pluginOwned || candidate.skipped || candidate.blocked || !candidate.uid) continue;
    for (const asset of candidate.assets) {
      if (asset.sourcePath === asset.targetPath) continue;
      nextAssetMoveEvidence[asset.targetPath] = {
        uid: candidate.uid,
        sourcePath: asset.sourcePath,
        targetPath: asset.targetPath,
      };
    }
  }
  await context.beforeExecute(nextCategoryOrigins, nextAssetMoveEvidence);
  for (const candidate of candidates) {
    if (
      !candidate.skipped
      && candidate.pluginOwned
      && candidate.uid
      && candidate.targetPath
    ) {
      await executePlan(
        app,
        candidate as NoteCandidate & { uid: string; targetPath: string },
        result,
      );
    }
  }
  return result;
}
