// 全面验证：官方 manifest 校验 + 真实构建产物（dist/index.js）逻辑测试
import { validateExtensionManifest } from './validate.mjs';
import { RandomMath } from '../dist/index.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

// ---------- ① 官方 manifest 校验器 ----------
console.log('== ① extension.json 官方校验 ==');
const raw = JSON.parse(readFileSync('./extension.json', 'utf8'));
try {
  const m = validateExtensionManifest(raw);
  ok('validateExtensionManifest 通过', true, '');
  ok('id/entry/sdkVersion 字段', m.id === 'mixing-entropy.random-math' && m.entry === 'dist/index.js' && !!m.sdkVersion);
  ok('dataDependencies 两表', m.dataDependencies && m.dataDependencies.pickTable && m.dataDependencies.funcLib);
  console.log('   清单:', m.id, '|', m.entry, '| sdkVersion', m.sdkVersion, '| 依赖', Object.keys(m.dataDependencies ?? {}).join('+'));
} catch (e) {
  ok('validateExtensionManifest 通过', false, ':: ' + e.message);
}

// ---------- ② 逻辑测试（真实打包代码 + mock 上下文 + 固定随机） ----------
console.log('== ② 方法逻辑（确定性随机） ==');
const realRandom = Math.random;
const setRandom = (seq) => { let i = 0; Math.random = () => (i < seq.length ? seq[i++] : 0); };
const resetRandom = () => { Math.random = realRandom; };

function makeCtx(init = {}, pickRows = [], funcRows = []) {
  const store = new Map(Object.entries(init));
  const table = (rows) => ({
    find: async (filter) => {
      if (filter && typeof filter.name === 'string') return rows.filter(r => r.name === filter.name);
      if (filter && typeof filter.pool === 'string') return rows.filter(r => r.pool === filter.pool);
      return rows;
    },
  });
  return {
    variables: {
      get: (n) => store.get(n),
      set: (n, v) => store.set(n, v),
    },
    database: { collection: (alias) => table(alias === 'pickTable' ? pickRows : funcRows) },
  };
}
const M = RandomMath;

// rand（整数：digits=0；小数：digits>=1）
{
  const ctx = makeCtx();
  setRandom([0]);
  ok('rand 整数最小端', M.rand.run(ctx, { mode: 'fresh', min: 1, max: 100, digits: 0, includeMin: true, includeMax: true, outVar: 'r' }) === 1);
  setRandom([0.999999]);
  ok('rand 整数最大端', M.rand.run(ctx, { mode: 'fresh', min: 1, max: 100, digits: 0, includeMin: true, includeMax: true, outVar: '' }) === 100);
  setRandom([0]);
  ok('rand 整数不含最小端 → 2', M.rand.run(ctx, { mode: 'fresh', min: 1, max: 10, digits: 0, includeMin: false, includeMax: true, outVar: '' }) === 2);
  setRandom([0.999999]);
  ok('rand 整数不含最大端 → 9', M.rand.run(ctx, { mode: 'fresh', min: 1, max: 10, digits: 0, includeMin: true, includeMax: false, outVar: '' }) === 9);
  ok('rand 整数非法范围 → -1', M.rand.run(ctx, { mode: 'fresh', min: 5, max: 3, digits: 0, includeMin: true, includeMax: true, outVar: '' }) === -1);
  ok('rand 整数 fresh 写 outVar', ctx.variables.get('r') === 1);
  // 小数
  setRandom([0.5]);
  ok('rand 小数 2 位中值', M.rand.run(ctx, { mode: 'fresh', min: 0, max: 1, digits: 2, includeMin: true, includeMax: true, outVar: '' }) === 0.5);
  setRandom([0.999999]);
  ok('rand 小数不含最大端回退', M.rand.run(ctx, { mode: 'fresh', min: 0, max: 1, digits: 2, includeMin: true, includeMax: false, outVar: '' }) === 0.99);
  setRandom([0.25]);
  ok('rand 小数 3 位', M.rand.run(ctx, { mode: 'fresh', min: 0, max: 1, digits: 3, includeMin: true, includeMax: true, outVar: '' }) === 0.25);
}
// sticky 语义
{
  const ctx = makeCtx();
  setRandom([0, 0.9]);
  const a = M.rand.run(ctx, { mode: 'sticky', min: 1, max: 10, digits: 0, includeMin: true, includeMax: true, outVar: 'st' });
  const b = M.rand.run(ctx, { mode: 'sticky', min: 1, max: 10, digits: 0, includeMin: true, includeMax: true, outVar: 'st' });
  ok('sticky 首次生成且写变量', a === 1 && ctx.variables.get('st') === 1);
  ok('sticky 二次返回旧值（不再掷）', b === 1);
  const ctx2 = makeCtx({ st: 7 }); // 模拟读档恢复
  setRandom([0.5]);
  ok('sticky 读档后仍固定旧值', M.rand.run(ctx2, { mode: 'sticky', min: 1, max: 10, digits: 0, includeMin: true, includeMax: true, outVar: 'st' }) === 7);
}
// randPick 均匀 + 加权 + 池筛选（async → await）
{
  const rows = [{ id: 'r1', label: 'A' }, { id: 'r2', label: 'B' }, { id: 'r3', label: 'C' }];
  const ctx = makeCtx({}, rows);
  setRandom([0]);
  ok('randPick 均匀第一行', (await M.randPick.run(ctx, { pool: '', field: 'label', outVar: 'p' })) === 'A' && ctx.variables.get('p') === 'A');
  setRandom([0.999999]);
  ok('randPick 均匀末行', (await M.randPick.run(ctx, { pool: '', field: 'label', outVar: 'p' })) === 'C');
  const wrows = [
    { id: 'w1', label: '高', weight: 5, pool: '村口' }, { id: 'w2', label: '中', weight: 2, pool: '村口' }, { id: 'w3', label: '低', weight: 3, pool: '老宅' },
  ];
  const ctxW = makeCtx({}, wrows);
  setRandom([0]);            // 0 落在高(0-5)
  ok('randPick 加权 0 → 高', (await M.randPick.run(ctxW, { pool: '村口', field: 'label', outVar: 'p' })) === '高');
  setRandom([0.6]);          // 池内权重 5+2=7；0.6*7=4.2 → 高
  ok('randPick 池内加权 0.6 → 高', (await M.randPick.run(ctxW, { pool: '村口', field: 'label', outVar: 'p' })) === '高');
  setRandom([0.8]);          // 0.8*7=5.6-5=0.6 → 中
  ok('randPick 池内加权 0.8 → 中', (await M.randPick.run(ctxW, { pool: '村口', field: 'label', outVar: 'p' })) === '中');
  setRandom([0.999999]);
  ok('randPick 池筛选：另一池', (await M.randPick.run(ctxW, { pool: '老宅', field: 'label', outVar: 'p' })) === '低');
  setRandom([0.5]);          // 全表均匀：6 行中抽
  const ctxAll = makeCtx({}, wrows);
  const v = await M.randPick.run(ctxAll, { pool: '', field: 'label', outVar: 'p' });
  ok('randPick 空池=全表', ['高', '中', '低'].includes(v));
  const ctxNoOut = makeCtx({}, rows);
  ok('randPick 缺 outVar 时仅返回', (await M.randPick.run(ctxNoOut, { pool: '', field: 'label', outVar: '' })) === 'A');
}
// rand 批量（count>1 → 前缀_1..N）
{
  const ctx = makeCtx();
  setRandom([0, 0.5, 0.999999]);
  const n = M.rand.run(ctx, { mode: 'fresh', min: 10, max: 10, digits: 0, includeMin: true, includeMax: true, count: 3, outVar: '', prefix: 'bx' });
  ok('rand 批量返回数量', n === 3);
  ok('rand 批量全 10', ctx.variables.get('bx_1') === 10 && ctx.variables.get('bx_2') === 10 && ctx.variables.get('bx_3') === 10);
  setRandom([0]);
  ok('rand 批量夹取 100', M.rand.run(ctx, { mode: 'fresh', min: 1, max: 2, digits: 0, includeMin: true, includeMax: true, count: 999, outVar: '', prefix: 'by' }) === 100);
  ok('rand 批量缺前缀 → -1', M.rand.run(ctx, { mode: 'fresh', min: 1, max: 2, digits: 0, includeMin: true, includeMax: true, count: 3, outVar: '', prefix: '' }) === -1);
  const ctxS = makeCtx({ by_1: 7, by_2: 7, by_3: 7 });
  ok('rand 批量 sticky 已存在 → 不重写', M.rand.run(ctxS, { mode: 'sticky', min: 1, max: 99, digits: 0, includeMin: true, includeMax: true, count: 3, outVar: '', prefix: 'by' }) === 3);
}
// calc
{
  const C = M.calc;
  const P = (op, a, b = 1) => ({ op, a, b });
  ok('calc add', (await C.run(makeCtx(), P('add', 2, 3))) === 5);
  ok('calc sub', (await C.run(makeCtx(), P('sub', 10, 3))) === 7);
  ok('calc mul', (await C.run(makeCtx(), P('mul', 4, 5))) === 20);
  ok('calc div', (await C.run(makeCtx(), P('div', 7, 2))) === 3.5);
  ok('calc div0 → -1', (await C.run(makeCtx(), P('div', 7, 0))) === -1);
  ok('calc pow', (await C.run(makeCtx(), P('pow', 2, 10))) === 1024);
  ok('calc root', (await C.run(makeCtx(), P('root', 81))) === 9);
  ok('calc floor', (await C.run(makeCtx(), P('floor', 3.9))) === 3);
  ok('calc round', (await C.run(makeCtx(), P('round', 3.5))) === 4);
}
// calc 自定义函数分支（op=func）
{
  const funcRows = [{ name: 'dv', expr: 'clamp(round(x*y),0,100)', desc: '难度换算' }];
  const ctx = makeCtx({}, [], funcRows);
  ok('calc func 正常', (await M.calc.run(ctx, { op: 'func', a: 0, b: 1, funcName: 'dv', x: 60, y: 0.5, z: 0, w: 0 })) === 30);
  ok('calc func 未找到 → -1', (await M.calc.run(ctx, { op: 'func', a: 0, b: 1, funcName: 'nope', x: 1, y: 1, z: 0, w: 0 })) === -1);
  const ctxBad = makeCtx({}, [], [{ name: 'bad', expr: 'pi + 1', desc: '' }]);
  ok('calc func 表达式错误 → -1', (await M.calc.run(ctxBad, { op: 'func', a: 0, b: 1, funcName: 'bad', x: 1, y: 1, z: 0, w: 0 })) === -1);
}
resetRandom();
console.log('\n== ③ 性质测试（真实随机抽样） ==');
{
  // 整数界内性：200 次 [-5,5]
  const ctx = makeCtx();
  let okInt = true;
  for (let i = 0; i < 200; i++) {
    const v = M.rand.run(ctx, { mode: 'fresh', min: -5, max: 5, digits: 0, includeMin: true, includeMax: true, outVar: '' });
    if (!Number.isInteger(v) || v < -5 || v > 5) { okInt = false; break; }
  }
  ok('整数抽样 200 次均在 [-5,5] 且为整数', okInt);
  // 整数均匀性（min0 max1 → 0/1 各约 50%）
  let zeros = 0;
  for (let i = 0; i < 400; i++) { if (M.rand.run(ctx, { mode: 'fresh', min: 0, max: 1, digits: 0, includeMin: true, includeMax: true, outVar: '' }) === 0) zeros++; }
  ok('整数均匀性（0/1 各约 50%，实测 ' + (zeros / 4).toFixed(1) + '%）', zeros > 130 && zeros < 270);
  // 小数界内性+位数：200 次 [0.5,1.5] digits=2
  let okFloat = true;
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const v = M.rand.run(ctx, { mode: 'fresh', min: 0.5, max: 1.5, digits: 2, includeMin: true, includeMax: true, outVar: '' });
    const s = String(v);
    const dec = s.includes('.') ? s.split('.')[1].length : 0;
    if (v < 0.5 || v > 1.5 || dec > 2) { okFloat = false; break; }
    seen.add(s);
  }
  ok('小数抽样 200 次均在 [0.5,1.5] 且 ≤2 位小数', okFloat);
  ok('小数多样性（出现 ≥10 种不同值）', seen.size >= 10);
  // 加权分布 1000 次近似 50/20/30（±6%）
  const wr = [
    { id: 'w1', label: '高', weight: 5 }, { id: 'w2', label: '中', weight: 2 }, { id: 'w3', label: '低', weight: 3 },
  ];
  const ctxW = makeCtx({}, wr);
  const cnt = { '高': 0, '中': 0, '低': 0 };
  for (let i = 0; i < 1000; i++) { cnt[(await M.randPick.run(ctxW, { field: 'label', outVar: '' }))]++; }
  const dh = Math.abs(cnt['高'] - 500), dz = Math.abs(cnt['中'] - 200), dl2 = Math.abs(cnt['低'] - 300);
  ok(`加权分布 1000 次 → 高${cnt['高']} 中${cnt['中']} 低${cnt['低']}（期望 500/200/300 ±60）`, dh <= 60 && dz <= 60 && dl2 <= 60);
  // 批量一致性（sticky：值在 SL 后保持）
  const ctxB = makeCtx();
  setRandom([0.1, 0.2, 0.3]);
  M.rand.run(ctxB, { mode: 'sticky', min: 1, max: 9, digits: 0, includeMin: true, includeMax: true, count: 3, outVar: '', prefix: 'q' });
  const snap = [ctxB.variables.get('q_1'), ctxB.variables.get('q_2'), ctxB.variables.get('q_3')];
  const ctxB2 = makeCtx({ q_1: snap[0], q_2: snap[1], q_3: snap[2] }); // 模拟读档
  setRandom([0.9, 0.9, 0.9]);
  const n2 = M.rand.run(ctxB2, { mode: 'sticky', min: 1, max: 9, digits: 0, includeMin: true, includeMax: true, count: 3, outVar: '', prefix: 'q' });
  ok('批量 sticky 读档后保持原值', n2 === 3 && ctxB2.variables.get('q_1') === snap[0] && ctxB2.variables.get('q_2') === snap[1] && ctxB2.variables.get('q_3') === snap[2]);
}
// —— DSL v2：三元/比较/var()、复合权重 ——
{
  // 函数表表达式支持三元与 var()
  const funcRows = [
    { name: 'cmp', expr: 'x > y ? 10 : 20', desc: '' },
    { name: 'vr', expr: 'var("理智值")', desc: '' },
  ];
  const ctxF = makeCtx({ 理智值: 30 }, [], funcRows);
  ok('DSL 三元', (await M.calc.run(ctxF, { op: 'func', funcName: 'cmp', x: 5, y: 3 })) === 10);
  ok('DSL 三元否则支', (await M.calc.run(ctxF, { op: 'func', funcName: 'cmp', x: 1, y: 3 })) === 20);
  ok('DSL var() 读变量', (await M.calc.run(ctxF, { op: 'func', funcName: 'vr', x: 0, y: 0 })) === 30);
  // 复合权重：见过=1 → X:5 Y:1；见过=0 → X:2 Y:8
  const wrows2 = [
    { id: 'x1', label: 'X', weight: 'var("见过")==1 ? 5 : 2', pool: '' },
    { id: 'y1', label: 'Y', weight: 'var("见过")==1 ? 1 : 8', pool: '' },
  ];
  const ctxA = makeCtx({ 见过: 1 }, wrows2);
  setRandom([0]);
  ok('复合权重(见过=1) 0 → X', (await M.randPick.run(ctxA, { pool: '', field: 'label', outVar: '' })) === 'X');
  setRandom([0.9]); // 0.9*6=5.4-5=0.4 ≤1 → Y
  ok('复合权重(见过=1) 0.9 → Y', (await M.randPick.run(ctxA, { pool: '', field: 'label', outVar: '' })) === 'Y');
  const ctxB = makeCtx({ 见过: 0 }, wrows2);
  setRandom([0.3]); // 0.3*10=3-2=1 ≤8 → Y
  ok('复合权重(见过=0) 0.3 → Y', (await M.randPick.run(ctxB, { pool: '', field: 'label', outVar: '' })) === 'Y');
  setRandom([0]); // 0 → X
  ok('复合权重(见过=0) 0 → X', (await M.randPick.run(ctxB, { pool: '', field: 'label', outVar: '' })) === 'X');
  // 字符串数字权重兼容
  const wrows3 = [{ id: 'n1', label: 'Only', weight: '3', pool: '' }];
  const ctxC = makeCtx({}, wrows3);
  ok('权重字符串数字兼容', (await M.randPick.run(ctxC, { pool: '', field: 'label', outVar: '' })) === 'Only');
  // 表达式错误 → 权重 0；全部无效 → 回退均匀
  const wrows4 = [{ id: 'bad', label: 'B', weight: '1 +', pool: '' }];
  const ctxD = makeCtx({}, wrows4);
  setRandom([0]);
  ok('无效权重表达式 → 回退均匀(仍可抽中)', (await M.randPick.run(ctxD, { pool: '', field: 'label', outVar: '' })) === 'B');
  // 权重调用函数表函数：高权重(x>50)=5 否则 2
  const funcRows2 = [{ name: '高权重', expr: 'x > 50 ? 5 : 2', desc: '' }];
  const wrows5 = [
    { id: 'h1', label: 'H', weight: '高权重(var("观察"))', pool: '' },
    { id: 'h2', label: 'L', weight: '2', pool: '' },
  ];
  const ctxH = makeCtx({ 观察: 70 }, wrows5, funcRows2);
  setRandom([0]); // 高权重=5, L=2 → 0 → H
  ok('权重调用函数(观察70→权重5) 0 → H', (await M.randPick.run(ctxH, { pool: '', field: 'label', outVar: '' })) === 'H');
  setRandom([0.8]); // 0.8*7=5.6-5=0.6 ≤2 → L
  ok('权重调用函数 0.8 → L', (await M.randPick.run(ctxH, { pool: '', field: 'label', outVar: '' })) === 'L');
  const ctxL = makeCtx({ 观察: 30 }, wrows5, funcRows2);
  setRandom([0.9]); // 高权重=2, L=2, 0.9*4=3.6-2=1.6 ≤2 → L
  ok('权重调用函数(观察30→权重2) 0.9 → L', (await M.randPick.run(ctxL, { pool: '', field: 'label', outVar: '' })) === 'L');
}
resetRandom();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
