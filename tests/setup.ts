import { vi } from 'vitest';

vi.mock('obsidian', async () => await vi.importActual('./mocks/obsidian.ts'));

(globalThis as typeof globalThis & { activeWindow: Window }).activeWindow = window;
