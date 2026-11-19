// Gera a extensão pronta para carregar a partir de src/.
//   node build.mjs                 -> dist/
//   OMNI_TEST_REPORT=<url> node build.mjs dist-test  -> build do e2e (com testhook)
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const outdir = process.argv[2] || 'dist';
const report = process.env.OMNI_TEST_REPORT || '';

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir);
await esbuild.build({
  entryPoints: ['src/background.ts', 'src/viewer.ts'],
  bundle: true,
  format: 'iife',
  target: 'firefox115',
  outdir,
  define: {
    'process.env.NODE_ENV': '"production"',
    OMNI_TEST_REPORT: JSON.stringify(report),
  },
  logLevel: 'warning',
});
for (const f of ['manifest.json', 'viewer.html', 'viewer.css']) cpSync(`src/${f}`, `${outdir}/${f}`);
