// postbuild：把 tsc 产物收拢到 dist 根（tsc 会把 paths 引入的 sdk 一并 emit）
import { rmSync, readdirSync, renameSync, existsSync, copyFileSync, lstatSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
// Only touch regular, project-local build output; reject redirected output trees.
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
if (!existsSync(dist) || !samePath(realpathSync(dist), path.resolve(dist))) {
  throw new Error('Expected a regular project-local dist directory');
}
function inspectOutput(dir) {
  for (const name of readdirSync(dir)) {
    const entry = path.join(dir, name);
    const info = lstatSync(entry);
    if (info.isSymbolicLink() || (info.isFile() && info.nlink !== 1)) throw new Error('Linked build output is unsupported: ' + entry);
    if (info.isDirectory()) inspectOutput(entry);
  }
}
inspectOutput(dist);
function removeGeneratedDirectory(name) {
  if (name !== 'sdk' && name !== 'src') throw new Error('Unexpected generated directory');
  const target = path.resolve(dist, name);
  if (path.dirname(target) !== dist) throw new Error('Generated output escaped dist');
  if (existsSync(target) && !samePath(realpathSync(target), target)) throw new Error('Redirected generated directory');
  rmSync(target, { recursive: true, force: true });
}
removeGeneratedDirectory('sdk');
const srcDir = path.join(dist, 'src');
if (existsSync(srcDir)) {
  for (const f of readdirSync(srcDir)) renameSync(path.join(srcDir, f), path.join(dist, f));
  removeGeneratedDirectory('src');
}
// 双保险：部分入口按 index.mjs 识别（工坊提交提示），复制一份兼容
if (existsSync(path.join(dist, 'index.js'))) {
  copyFileSync(path.join(dist, 'index.js'), path.join(dist, 'index.mjs'));
}
console.log('[postbuild] dist 已收拢（含 index.mjs 兼容副本）');
