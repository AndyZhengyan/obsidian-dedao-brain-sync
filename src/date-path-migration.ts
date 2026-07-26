import type { App, CachedMetadata, TFile } from 'obsidian';
import { buildCanonicalCategoryDir } from './date-paths';
import { getCategoryDir } from './types';

export interface DatePathMigrationTarget {
  enabled: boolean;
  format: string;
}

export type DatePathMigrationIssueCode =
  | 'not-plugin-owned'
  | 'invalid-metadata'
  | 'unsafe-path'
  | 'missing-generated-asset'
  | 'shared-asset'
  | 'duplicate-uid'
  | 'target-conflict'
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

function knowledgeBaseCategory(filePath: string, rootFolder: string): string | null {
  const relativeSegments = filePath.slice(rootFolder.length + 1).split('/');
  const knowledgeBaseIndex = relativeSegments.indexOf('知识库');
  if (
    knowledgeBaseIndex < 0
    || knowledgeBaseIndex + 1 >= relativeSegments.length - 1
  ) {
    return null;
  }
  const name = relativeSegments[knowledgeBaseIndex + 1];
  return isSafeSegment(name) ? `知识库/${name}` : null;
}

function desiredNotePath(
  file: TFile,
  rootFolder: string,
  created: string,
  noteType: string,
  target: DatePathMigrationTarget,
): string {
  const knowledgeBaseDir = knowledgeBaseCategory(file.path, rootFolder);
  const categoryDir = knowledgeBaseDir ?? getCategoryDir(noteType);
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
      block(owner, result, 'shared-asset', assetPath, `Asset is referenced by multiple notes: ${assetPath}`);
    }
  }

  for (const [targetPath, owners] of targetOwners) {
    if (owners.size < 2) continue;
    for (const owner of owners) {
      block(owner, result, 'target-conflict', targetPath, `Multiple notes target the same path: ${targetPath}`);
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
    issue(result, 'unsafe-path', rootFolder, 'Unsafe root folder');
    return result;
  }

  const files = app.vault.getMarkdownFiles()
    .filter(file => isInsideRoot(file.path, root))
    .sort((left, right) => left.path.localeCompare(right.path));
  result.scanned = files.length;

  const candidates: NoteCandidate[] = [];
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const source = readRequiredString(cache?.frontmatter, 'source');
    if (!source || !PLUGIN_SOURCES.has(source)) {
      result.skipped++;
      issue(result, 'not-plugin-owned', file.path, 'Plugin ownership marker is missing or invalid');
      continue;
    }

    const uid = readRequiredString(cache?.frontmatter, 'uid');
    const created = readRequiredString(cache?.frontmatter, 'created');
    const noteType = readRequiredString(cache?.frontmatter, 'note_type');
    const links = resolveLinks(app, file, cache ?? {});
    const candidate: NoteCandidate = {
      file,
      ...(uid ? { uid } : {}),
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
      candidate.targetPath = desiredNotePath(file, root, created, noteType, target);
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

    planCandidateAssets(app, candidate, links, result);
  }

  preflightPlans(app, candidates, result);
  for (const candidate of candidates) {
    if (
      !candidate.skipped
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
