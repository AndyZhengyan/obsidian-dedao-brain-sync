import * as esbuild from 'esbuild';

const isDev = process.argv.includes('--dev');

await esbuild.build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  outfile: 'main.js',
  sourcemap: isDev ? 'inline' : false,
  minify: !isDev,
  format: 'cjs',
  // Obsidian's desktop build runs in Electron's renderer, which exposes Node
  // builtins. Mobile (Capacitor) does not, so anything Node-specific must
  // guard with `hasLocalVaultBase()` or feature-detect `getBasePath()`.
  external: [
    'obsidian',
    'electron',
    'fs',
    'fs/promises',
    'path',
    'os',
    'crypto',
  ],
});
