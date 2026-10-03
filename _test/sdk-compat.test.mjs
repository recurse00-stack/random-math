import { mkdtempSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tsc = path.join(root, 'node_modules/typescript/bin/tsc');
const folder = mkdtempSync(path.join(tmpdir(), 'random-math-sdk-'));
const write = (name, text) => writeFileSync(path.join(folder, name), text);
function compile(files) {
  const result = spawnSync(process.execPath, [tsc, '--noEmit', '--strict', '--skipLibCheck',
    '--target', 'ES2022', '--moduleResolution', 'Bundler', '--module', 'ESNext', ...files],
    { cwd: folder, encoding: 'utf8' });
  assert.ifError(result.error);
  return { code: result.status, output: result.stdout + result.stderr };
}
try {
  write('sdk-entry.ts', 'export {ExtensionInspector, type ExtensionInspectorProps} from "./extension-inspector";');
  assert.match(compile(['sdk-entry.ts']).output, /TS2307/);
  copyFileSync(path.join(root, 'src/sdk-inspector-compat.d.ts'), path.join(folder, 'compat.d.ts'));
  assert.equal(compile(['sdk-entry.ts', 'compat.d.ts']).code, 0);
  write('misuse.ts', 'import {ExtensionInspector, type ExtensionInspectorProps} from "./sdk-entry"; const props: ExtensionInspectorProps = {}; ExtensionInspector(props);');
  const misuse = compile(['misuse.ts', 'compat.d.ts']);
  assert.notEqual(misuse.code, 0);
  assert.match(misuse.output, /TS2322/);
  assert.match(misuse.output, /TS2349/);
  write('unrelated.ts', 'export {other} from "./different-missing-api";');
  assert.match(compile(['unrelated.ts', 'compat.d.ts']).output, /TS2307/);
  write('extension-inspector.ts', 'export type ExtensionInspectorProps = {message: string}; export function ExtensionInspector(props: ExtensionInspectorProps): string {return props.message;}');
  write('real-api.ts', 'import {ExtensionInspector, type ExtensionInspectorProps} from "./sdk-entry"; const props: ExtensionInspectorProps = {message:"official"}; const value: string = ExtensionInspector(props);');
  const supplied = compile(['real-api.ts', 'compat.d.ts']);
  assert.equal(supplied.code, 0, supplied.output);
  write('bad-real-api.ts', 'import {ExtensionInspector} from "./sdk-entry"; ExtensionInspector({message:123});');
  assert.match(compile(['bad-real-api.ts', 'compat.d.ts']).output, /TS2322/);
  console.log('PASS: missing export reproduced; fallback resolves only unused exports; runtime misuse rejected; unrelated errors retained; supplied declarations win; real types enforced (6 cases).');
} finally {
  // Only remove the exact fresh temporary directory created above.
  assert.equal(path.dirname(folder), path.resolve(tmpdir()));
  assert.ok(path.basename(folder).startsWith('random-math-sdk-'));
  rmSync(folder, { recursive: true, force: true });
}
