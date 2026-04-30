import { buildSync } from 'esbuild'

const result = buildSync({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist-server/index.js',
  format: 'esm',
  external: [],
  minify: true,
})

if (result.errors.length > 0) {
  console.error('Build failed:', result.errors)
  process.exit(1)
}

console.log('Server build complete: dist-server/index.js')