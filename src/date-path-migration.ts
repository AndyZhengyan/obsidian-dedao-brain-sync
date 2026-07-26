import type { App, CachedMetadata, TFile } from 'obsidian';
import { buildCanonicalCategoryDir } from './date-paths';
import { getCategoryDir } from './types';

export interface DatePathMigrationTarget {
  enabled: boolean;
  format: string;
}

export type DatePathMigrationIssueCode =
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

interface NotePlan {
  file: TFile;
  uid: string;
  targetPath: string;
  assets: PlannedMove[];
  blocked: boolean;
}

const RESERVED_SEGMENT_PATTERN = /[\\:*?"<>|\0]/;
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
  key: 'uid' | 'created' | 'note_type',
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
  plan: NotePlan,
  result: DatePathMigrationResult,
  code: DatePathMigrationIssueCode,
  path: string,
  message: string,
): void {
  if (!plan.blocked) {
    plan.blocked = true;
    result.skipped++;
  }
  issue(result, code, path, message, plan.uid);
}

function planAssets(
  app: MigrationApp,
  file: TFile,
  targetPath: string,
  cache: CachedMetadata,
): { assets: PlannedMove[]; missingGeneratedLink?: string } {
  const assets = new Map<string, TFile>();
  for (const link of referencedLinks(cache)) {
    const resolved = app.metadataCache.getFirstLinkpathDest(link, file.path);
    if (!resolved) {
      if (GENERATED_ASSET_PATTERN.test(link)) {
        return { assets: [], missingGeneratedLink: link };
      }
      continue;
    }
    if (isAdjacentAsset(resolved.path, file.path)) {
      assets.set(resolved.path, resolved);
    }
  }

  const targetAssetDir = `${dirname(targetPath)}/asset`;
  return {
    assets: [...assets.values()]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(asset => ({
        file: asset,
        sourcePath: asset.path,
        targetPath: `${targetAssetDir}/${basename(asset.path)}`,
      })),
  };
}

async function ensureFolder(app: MigrationApp, folderPath: string): Promise<void> {
  if (!app.vault.getAbstractFileByPath(folderPath)) {
    await app.vault.createFolder(folderPath);
  }
}

function preflightPlans(
  app: MigrationApp,
  plans: NotePlan[],
  result: DatePathMigrationResult,
): void {
  const uidOwners = new Map<string, NotePlan[]>();
  const assetOwners = new Map<string, NotePlan[]>();
  const targetOwners = new Map<string, NotePlan[]>();

  for (const plan of plans) {
    const uidPlans = uidOwners.get(plan.uid) ?? [];
    uidPlans.push(plan);
    uidOwners.set(plan.uid, uidPlans);

    for (const asset of plan.assets) {
      const owners = assetOwners.get(asset.sourcePath) ?? [];
      owners.push(plan);
      assetOwners.set(asset.sourcePath, owners);
    }

    const moves = [
      ...plan.assets,
      { file: plan.file, sourcePath: plan.file.path, targetPath: plan.targetPath },
    ];
    for (const move of moves) {
      if (move.sourcePath === move.targetPath) continue;
      const owners = targetOwners.get(move.targetPath) ?? [];
      owners.push(plan);
      targetOwners.set(move.targetPath, owners);

      if (app.vault.getAbstractFileByPath(move.targetPath)) {
        block(
          plan,
          result,
          'target-conflict',
          move.targetPath,
          `Target already exists: ${move.targetPath}`,
        );
      }
    }
  }

  for (const [uid, owners] of uidOwners) {
    if (owners.length < 2) continue;
    for (const owner of owners) {
      block(owner, result, 'duplicate-uid', owner.file.path, `UID appears in multiple notes: ${uid}`);
    }
  }

  for (const [assetPath, owners] of assetOwners) {
    if (owners.length < 2) continue;
    for (const owner of owners) {
      block(owner, result, 'shared-asset', assetPath, `Asset is referenced by multiple notes: ${assetPath}`);
    }
  }

  for (const [targetPath, owners] of targetOwners) {
    if (owners.length < 2) continue;
    for (const owner of owners) {
      block(owner, result, 'target-conflict', targetPath, `Multiple notes target the same path: ${targetPath}`);
    }
  }
}

async function executePlan(
  app: MigrationApp,
  plan: NotePlan,
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
  if (!root.split('/').every(isSafeSegment)) {
    issue(result, 'unsafe-path', rootFolder, 'Unsafe root folder');
    return result;
  }

  const files = app.vault.getMarkdownFiles()
    .filter(file => isInsideRoot(file.path, root))
    .sort((left, right) => left.path.localeCompare(right.path));
  result.scanned = files.length;

  const plans: NotePlan[] = [];
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const uid = readRequiredString(cache?.frontmatter, 'uid');
    const created = readRequiredString(cache?.frontmatter, 'created');
    const noteType = readRequiredString(cache?.frontmatter, 'note_type');
    if (!uid || !created || !noteType) {
      result.skipped++;
      issue(result, 'invalid-metadata', file.path, 'Required string metadata is missing');
      continue;
    }

    let targetPath: string;
    try {
      targetPath = desiredNotePath(file, root, created, noteType, target);
    } catch (error) {
      result.skipped++;
      issue(
        result,
        'unsafe-path',
        file.path,
        error instanceof Error ? error.message : String(error),
        uid,
      );
      continue;
    }

    const plannedAssets = planAssets(app, file, targetPath, cache ?? {});
    if (plannedAssets.missingGeneratedLink) {
      result.skipped++;
      issue(
        result,
        'missing-generated-asset',
        file.path,
        `Generated asset cannot be resolved: ${plannedAssets.missingGeneratedLink}`,
        uid,
      );
      continue;
    }
    plans.push({
      file,
      uid,
      targetPath,
      assets: plannedAssets.assets,
      blocked: false,
    });
  }

  preflightPlans(app, plans, result);
  for (const plan of plans) {
    if (!plan.blocked) await executePlan(app, plan, result);
  }
  return result;
}
