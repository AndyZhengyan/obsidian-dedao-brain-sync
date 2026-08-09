import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const PRIVILEGED_WORKFLOWS = [
  '.github/workflows/release.yml',
  '.github/workflows/codex-review.yml',
];

describe('privileged workflow dependencies', () => {
  it.each(PRIVILEGED_WORKFLOWS)('%s pins every action to an immutable commit', (path) => {
    const workflow = readFileSync(path, 'utf8');
    const actionRefs = [...workflow.matchAll(/^\s*-?\s*uses:\s*([^\s#]+).*$/gm)]
      .map((match) => match[1]);

    expect(actionRefs.length).toBeGreaterThan(0);
    for (const ref of actionRefs) {
      expect(ref).toMatch(/^[^@\s]+@[a-f0-9]{40}$/);
    }
  });
});
