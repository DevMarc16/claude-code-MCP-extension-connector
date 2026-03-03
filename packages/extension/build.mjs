import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const sharedConfig = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch ? 'inline' : false,
  target: 'chrome120',
  format: 'esm',
};

const configs = [
  { ...sharedConfig, entryPoints: ['src/background.ts'], outfile: 'dist/background.js' },
  { ...sharedConfig, entryPoints: ['src/content.ts'], outfile: 'dist/content.js', format: 'iife' },
  { ...sharedConfig, entryPoints: ['src/console-hooks.ts'], outfile: 'dist/console-hooks.js', format: 'iife' },
  { ...sharedConfig, entryPoints: ['src/sidepanel.ts'], outfile: 'dist/sidepanel.js', format: 'iife' },
];

if (isWatch) {
  for (const config of configs) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
  }
  console.log('Watching...');
} else {
  for (const config of configs) {
    await esbuild.build(config);
  }
  console.log('Build complete.');
}
