import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'styles.css'), 'utf8');

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]+\\}`));
  expect(match?.[0], `Missing CSS rule for ${selector}`).toBeTruthy();
  return match![0];
}

describe('settings layout CSS', () => {
  it('styles scheduled knowledge-base selection as a dropdown', () => {
    const root = ruleFor('.getnote-knowledge-base-select');
    const trigger = ruleFor('.getnote-knowledge-base-select-trigger');
    const menu = ruleFor('.getnote-knowledge-base-select-menu');

    expect(root).toContain('position: relative');
    expect(trigger).toContain('display: flex');
    expect(trigger).toContain('justify-content: space-between');
    expect(menu).toContain('position: absolute');
    expect(menu).toContain('max-height: 220px');
    expect(menu).toContain('overflow-y: auto');
  });

  it('keeps attachment and sync-log setting rows on the same constrained layout as scheduled sync', () => {
    const attachment = ruleFor('.getnote-scheduled-options');
    const syncLog = ruleFor('.getnote-sync-log-section');
    const attachmentLabels = ruleFor('.getnote-scheduled-options .getnote-scheduled-row-label');
    const syncLogLabels = ruleFor('.getnote-sync-log-section .getnote-scheduled-row-label');

    expect(attachment).toContain('display: flex');
    expect(attachment).toContain('flex-direction: column');
    expect(attachment).toContain('max-width: var(--getnote-primary-input-width)');
    expect(attachmentLabels).toContain('text-align: right');
    expect(syncLog).toContain('display: flex');
    expect(syncLog).toContain('flex-direction: column');
    expect(syncLog).toContain('max-width: var(--getnote-primary-input-width)');
    expect(syncLogLabels).toContain('text-align: right');
  });
});
