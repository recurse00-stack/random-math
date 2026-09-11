// Regression: rebuilding must replace a stale compatibility entry.
import assert from 'node:assert/strict';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const project = process.argv[2] ? path.resolve(process.argv[2]) : path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const run = path.join(project, '.ai-work', 'tasks', 'postbuild', `${Date.now()}-${process.pid}`);
mkdirSync(path.join(run, 'dist', 'src'), { recursive: true });
mkdirSync(path.join(run, 'dist', 'sdk'), { recursive: true });
copyFileSync(path.join(project, '_postbuild.mjs'), path.join(run, '_postbuild.mjs'));
writeFileSync(path.join(run, 'dist', 'index.mjs'), 'export const generation = "stale";\n');
for (const generation of ['first', 'second']) {
  mkdirSync(path.join(run, 'dist', 'src'), { recursive: true });
  const expected = `export const generation = "${generation}";\n`;
  writeFileSync(path.join(run, 'dist', 'src', 'index.js'), expected);
  await import(pathToFileURL(path.join(run, '_postbuild.mjs')).href + '?generation=' + generation);
  assert.equal(readFileSync(path.join(run, 'dist', 'index.js'), 'utf8'), expected);
  assert.equal(readFileSync(path.join(run, 'dist', 'index.mjs'), 'utf8'), expected, 'index.mjs retained stale code');
  assert.equal(existsSync(path.join(run, 'dist', 'src')), false);
  assert.equal(existsSync(path.join(run, 'dist', 'sdk')), false);
}
console.log(JSON.stringify({ status: 'PASS', check: 'stale compatibility entry refreshed on two builds', fixture: run }));
