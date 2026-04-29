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
  external: ['obsidian'],
});
