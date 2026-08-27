import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import manifest from '../manifest.json';
import packageJson from '../package.json';

const NEW_REPO = 'obsidian-dedao-brain-sync';
const OLD_REPO = 'obsidian-getnote-importer';

describe('plugin manifest', () => {
  it('uses sync wording for the bidirectional plugin name', () => {
    expect(manifest.name).toBe('Dedao Brain Sync');
    expect(manifest.name).not.toContain('Importer');
    expect(manifest.name).toMatch(/^[\x20-\x7E]+$/);
  });

  it('keeps legacy and current brand terms searchable in the description', () => {
    expect(manifest.description).toContain('GetNote');
    expect(manifest.description).toContain('得到大脑');
    expect(manifest.description).toContain('Get笔记');
    expect(manifest.description).toContain('得到大脑（原Get笔记）');
    expect(manifest.description.toLowerCase()).toContain('sync');
    expect(manifest.description).not.toContain('migration');
  });

  it('uses the renamed project package name', () => {
    expect(packageJson.name).toBe(NEW_REPO);
  });

  it('points project documentation and settings links at the renamed GitHub repository', () => {
    for (const path of ['README.md', 'README_EN.md', 'src/i18n.ts']) {
      const content = readFileSync(path, 'utf8');
      expect(content).toContain(NEW_REPO);
      expect(content).not.toContain(`github.com/AndyZhengyan/${OLD_REPO}`);
      expect(content).not.toContain(`github/v/release/AndyZhengyan/${OLD_REPO}`);
    }
  });
});
