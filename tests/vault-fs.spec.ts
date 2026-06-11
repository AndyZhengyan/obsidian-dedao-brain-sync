import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from 'obsidian';

// vi.mock factories are hoisted above all imports; vi.hoisted creates a stable
// ref that the hoisted factory can capture and that test bodies can also read.
const { writeFileMock, mkdirMock } = vi.hoisted(() => ({
  writeFileMock: vi.fn(),
  mkdirMock: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: { writeFile: writeFileMock, mkdir: mkdirMock },
  writeFile: writeFileMock,
  mkdir: mkdirMock,
}));

// Import after mock is registered
import { tryWriteBinary, hasLocalVaultBase } from '../src/utils/vault-fs';

interface WriteableAdapter {
  getBasePath?: () => string;
  writeBinary: (path: string, data: ArrayBuffer) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
}

function makeAppWithAdapter(adapter: Partial<WriteableAdapter>): Pick<App, 'vault'> {
  return {
    vault: {
      adapter: adapter as App['vault']['adapter'],
    },
  } as unknown as Pick<App, 'vault'>;
}

describe('hasLocalVaultBase', () => {
  it('returns true when adapter exposes a non-empty getBasePath()', () => {
    const app = makeAppWithAdapter({ getBasePath: () => '/Users/test/vault' });
    expect(hasLocalVaultBase(app as unknown as App)).toBe(true);
  });

  it('returns false when adapter is missing getBasePath', () => {
    const app = makeAppWithAdapter({});
    expect(hasLocalVaultBase(app as unknown as App)).toBe(false);
  });

  it('returns false when getBasePath returns an empty string', () => {
    const app = makeAppWithAdapter({ getBasePath: () => '' });
    expect(hasLocalVaultBase(app as unknown as App)).toBe(false);
  });
});

describe('tryWriteBinary', () => {
  beforeEach(() => {
    writeFileMock.mockReset();
    mkdirMock.mockReset();
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes via Node fs when adapter has getBasePath', async () => {
    const createBinarySpy = vi.fn().mockResolvedValue(undefined);
    const app = makeAppWithAdapter({
      getBasePath: () => '/Users/test/vault',
    }) as unknown as App;
    (app as unknown as { vault: { createBinary: typeof createBinarySpy } }).vault.createBinary = createBinarySpy;

    const data = new Uint8Array([1, 2, 3, 4]).buffer;
    await tryWriteBinary(app, 'subdir/file.bin', data);

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [calledPath, calledBuffer] = writeFileMock.mock.calls[0] as [string, Buffer];
    expect(calledPath.replace(/\\/g, '/')).toBe('/Users/test/vault/subdir/file.bin');
    expect(calledBuffer).toBeInstanceOf(Buffer);
    expect(Array.from(calledBuffer)).toEqual([1, 2, 3, 4]);
    expect(createBinarySpy).not.toHaveBeenCalled();
    expect(mkdirMock).toHaveBeenCalled();
  });

  it('falls back to app.vault.createBinary when getBasePath is missing', async () => {
    const createBinarySpy = vi.fn().mockResolvedValue(undefined);
    const app = makeAppWithAdapter({}) as unknown as App;
    (app as unknown as { vault: { createBinary: typeof createBinarySpy } }).vault.createBinary = createBinarySpy;

    const data = new Uint8Array([9, 9, 9]).buffer;
    await tryWriteBinary(app, 'note.md', data);

    expect(writeFileMock).not.toHaveBeenCalled();
    expect(createBinarySpy).toHaveBeenCalledTimes(1);
    expect(createBinarySpy).toHaveBeenCalledWith('note.md', data);
  });

  it('falls back to app.vault.createBinary when getBasePath is empty', async () => {
    const createBinarySpy = vi.fn().mockResolvedValue(undefined);
    const app = {
      vault: {
        adapter: { getBasePath: () => '' },
        createBinary: createBinarySpy,
      },
    } as unknown as App;

    await tryWriteBinary(app, 'note.md', new ArrayBuffer(4));

    expect(writeFileMock).not.toHaveBeenCalled();
    expect(createBinarySpy).toHaveBeenCalledTimes(1);
  });

  it('falls back when Node fs.writeFile throws (e.g. Remote vault mounted via custom adapter)', async () => {
    writeFileMock.mockRejectedValueOnce(new Error('EROFS: read-only filesystem'));
    const createBinarySpy = vi.fn().mockResolvedValue(undefined);
    const app = makeAppWithAdapter({
      getBasePath: () => '/Users/test/vault',
    }) as unknown as App;
    (app as unknown as { vault: { createBinary: typeof createBinarySpy } }).vault.createBinary = createBinarySpy;

    const data = new Uint8Array([0xff]).buffer;
    await tryWriteBinary(app, 'asset/photo.jpg', data);

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(createBinarySpy).toHaveBeenCalledTimes(1);
    expect(createBinarySpy).toHaveBeenCalledWith('asset/photo.jpg', data);
  });
});
