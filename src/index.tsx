// 随机与计算系统（独立纯数学扩展，不绑定检定模块）
// 模块：random-math
//
// 能力：
//   随机：rand（整数/小数、边界可含端、单值/批量、真/伪随机）
//   列表：randPick（数据集合+权重，安科式）
//   计算：calc（+ - * / ^ √ 取整 四舍五入；op=func 时调用自定义函数=白名单表达式，见下方 DSL）
//   官方缺口对照：剧本随机/自定义函数官方均无（已验证）；比较吃官方 If（方法 returns 可作左值）
// 注：DSL 已内联（单文件产物，避免相对分块导入 —— Studio 加载器只认单入口）

import { Extension, extension, method, settings, type SettingsBuilder, type VariablesAPI, type VariableValue } from "@avg-studio/sdk";

// ==================== 白名单表达式 DSL（无 eval） ====================
// 支持：数字、参数 x/y/z/w、运算符 + - * / ^（幂）、括号、比较 < > <= >= == !=、三元 ? :、字符串(仅 var 调用)、
//       函数 sqrt(a) pow(a,b) floor(a) round(a) min(a,b) max(a,b) clamp(a,min,max) var("变量名")
// 禁止：任何其他标识符/字符串/分号/赋值。var() 可读取项目变量（权重表达式/函数规则表通用）。

type ExprParams = Record<"x" | "y" | "z" | "w", number>;
type Env = ExprParams & {
  v: (name: string) => unknown;
  /** 自定义函数解析（函数规则表）；undefined=未找到 */
  f?: (name: string, args: number[]) => number | undefined;
};

const MAX_DEPTH = 32;

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "^" }
  | { t: "cmp"; v: "<" | ">" | "<=" | ">=" | "==" | "!=" }
  | { t: "q"; v: "?" }
  | { t: "colon"; v: ":" }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "comma" };

function normNum(u: unknown): number | null {
  if (typeof u === "number") return Number.isFinite(u) ? u : null;
  if (typeof u === "boolean") return u ? 1 : 0;
  if (typeof u === "string") { const n = Number(u.trim()); return Number.isFinite(n) ? n : null; }
  return null;
}

function truthy(u: unknown): boolean {
  const n = normNum(u);
  return n !== null ? n !== 0 : !!u;
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const two = (c: string) => src.substr(i, 2) === c;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if ((c >= "0" && c <= "9") || c === ".") {
      let s = "";
      while (i < src.length && ((src[i] >= "0" && src[i] <= "9") || src[i] === ".")) { s += src[i]; i++; }
      const v = Number(s);
      if (!Number.isFinite(v)) throw new Error(`非法数字: ${s}`);
      out.push({ t: "num", v });
      continue;
    }
    if (c === '"') {
      let s = "";
      i++;
      while (i < src.length && src[i] !== '"') { s += src[i]; i++; }
      if (src[i] !== '"') throw new Error("字符串缺少结束引号");
      i++;
      out.push({ t: "str", v: s });
      continue;
    }
    if (/[A-Za-z_\u4e00-\u9fa5]/.test(c)) {
      let s = "";
      while (i < src.length && /[A-Za-z0-9_\u4e00-\u9fa5]/.test(src[i])) { s += src[i]; i++; }
      out.push({ t: "id", v: s });
      continue;
    }
    if ("+-*/^".includes(c)) { out.push({ t: "op", v: c as "+" | "-" | "*" | "/" | "^" }); i++; continue; }
    if (two("<=") || two(">=") || two("==") || two("!=")) {
      out.push({ t: "cmp", v: src.substr(i, 2) as "<=" | ">=" | "==" | "!=" });
      i += 2; continue;
    }
    if (c === "<" || c === ">") { out.push({ t: "cmp", v: c as "<" | ">" }); i++; continue; }
    if (c === "?") { out.push({ t: "q", v: "?" }); i++; continue; }
    if (c === ":") { out.push({ t: "colon", v: ":" }); i++; continue; }
    if (c === "(") { out.push({ t: "lp" }); i++; continue; }
    if (c === ")") { out.push({ t: "rp" }); i++; continue; }
    if (c === ",") { out.push({ t: "comma" }); i++; continue; }
    throw new Error(`非法字符: ${c}`);
  }
  return out;
}

function parseExpr(src: string) {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];

  function expr(depth: number): (env: Env) => number {
    if (depth > MAX_DEPTH) throw new Error("表达式过深");
    let c = cmp(depth);
    while (peek() && (peek() as Tok).t === "q") {
      next(); // ?
      const a = expr(depth + 1);
      if (!(peek() && (peek() as Tok).t === "colon")) throw new Error("三元缺 :");
      next(); // :
      const b = expr(depth + 1);
      const cond = c;
      c = (env: Env) => (truthy(cond(env)) ? a(env) : b(env));
    }
    return c;
  }

  function cmp(depth: number): (env: Env) => number {
    let left = arith(depth);
    while (peek() && (peek() as Tok).t === "cmp") {
      const op = (next() as Extract<Tok, { t: "cmp" }>).v;
      const right = arith(depth);
      const l = left, r = right;
      left = (env: Env) => {
        const a = l(env), b = r(env);
        switch (op) {
          case "==": { const na = normNum(a), nb = normNum(b); return (na !== null && nb !== null) ? (na === nb ? 1 : 0) : (a === b ? 1 : 0); }
          case "!=": { const na = normNum(a), nb = normNum(b); return (na !== null && nb !== null) ? (na !== nb ? 1 : 0) : (a !== b ? 1 : 0); }
          case "<": return (normNum(a) ?? 0) < (normNum(b) ?? 0) ? 1 : 0;
          case ">": return (normNum(a) ?? 0) > (normNum(b) ?? 0) ? 1 : 0;
          case "<=": return (normNum(a) ?? 0) <= (normNum(b) ?? 0) ? 1 : 0;
          case ">=": return (normNum(a) ?? 0) >= (normNum(b) ?? 0) ? 1 : 0;
        }
        return 0;
      };
    }
    return left;
  }

  function arith(depth: number): (env: Env) => number {
    let left = term(depth);
    while (peek() && (peek() as Tok).t === "op" && ((peek() as Extract<Tok, { t: "op" }>).v === "+" || (peek() as Extract<Tok, { t: "op" }>).v === "-")) {
      const op = (next() as Extract<Tok, { t: "op" }>).v;
      const right = term(depth);
      const l = left, r = right;
      left = op === "+" ? (env: Env) => l(env) + r(env) : (env: Env) => l(env) - r(env);
    }
    return left;
  }

  function term(depth: number): (env: Env) => number {
    let left = factor(depth);
    while (peek() && (peek() as Tok).t === "op" && ["*", "/", "^"].includes((peek() as Extract<Tok, { t: "op" }>).v)) {
      const op = (next() as Extract<Tok, { t: "op" }>).v;
      const right = factor(depth);
      const l = left, r = right;
      if (op === "*") left = (env: Env) => l(env) * r(env);
      else if (op === "/") left = (env: Env) => { const d = r(env); if (d === 0) throw new Error("除零"); return l(env) / d; };
      else left = (env: Env) => Math.pow(l(env), r(env));
    }
    return left;
  }

  function factor(depth: number): (env: Env) => number {
    const tk = peek();
    if (!tk) throw new Error("表达式意外结束");
    if (tk.t === "num") { next(); const v = (tk as Extract<Tok, { t: "num" }>).v; return () => v; }
    if (tk.t === "str") { next(); const s = (tk as Extract<Tok, { t: "str" }>).v; return () => normNum(s) ?? NaN; }
    if (tk.t === "id") {
      next();
      const name = (tk as Extract<Tok, { t: "id" }>).v;
      if (name === "x" || name === "y" || name === "z" || name === "w") {
        return (env: Env) => env[name];
      }
      if (name === "var") {
        if (!(peek() && (peek() as Tok).t === "lp")) throw new Error("var 需要括号：var(\"变量名\")");
        next(); // (
        const arg = peek();
        if (!arg || arg.t !== "str") throw new Error("var 参数必须是字符串：var(\"变量名\")");
        next();
        if (!(peek() && (peek() as Tok).t === "rp")) throw new Error("var 缺右括号");
        next();
        const vname = (arg as Extract<Tok, { t: "str" }>).v;
        return (env: Env) => {
          const u = env.v(vname);
          const n = normNum(u);
          return n !== null ? n : (u === undefined ? 0 : NaN);
        };
      }
      if (peek() && (peek() as Tok).t === "lp") {
        next(); // (
        const args: Array<(env: Env) => number> = [];
        if (!(peek() && (peek() as Tok).t === "rp")) {
          while (true) {
            args.push(expr(depth + 1));
            if (peek() && (peek() as Tok).t === "comma") { next(); continue; }
            break;
          }
        }
        if (!(peek() && (peek() as Tok).t === "rp")) throw new Error(`函数 ${name} 缺右括号`);
        next(); // )
        if (BUILTIN_FNS.includes(name)) return buildFn(name, args);
        // 自定义函数：运行时从 env.f 解析（函数规则表）
        return (env: Env) => {
          const fn = env.f?.(name, args.map(a => a(env)));
          if (typeof fn !== "number" || !Number.isFinite(fn)) {
            throw new Error(`未找到自定义函数: ${name}`);
          }
          return fn;
        };
      }
      throw new Error(`标识符 ${name} 需要括号调用`);
    }
    if (tk.t === "lp") {
      next();
      const inner = expr(depth + 1);
      if (!(peek() && (peek() as Tok).t === "rp")) throw new Error("缺右括号");
      next();
      return inner;
    }
    throw new Error("非法语法");
  }

  const BUILTIN_FNS = ["sqrt", "pow", "floor", "round", "min", "max", "clamp"];

function buildFn(name: string, args: Array<(env: Env) => number>): (env: Env) => number {
    const check = (n: number) => {
      if (args.length !== n) throw new Error(`函数 ${name} 需要 ${n} 个参数，收到 ${args.length}`);
    };
    switch (name) {
      case "sqrt": check(1); return (env: Env) => Math.sqrt(args[0](env));
      case "pow": check(2); return (env: Env) => Math.pow(args[0](env), args[1](env));
      case "floor": check(1); return (env: Env) => Math.floor(args[0](env));
      case "round": check(1); return (env: Env) => Math.round(args[0](env));
      case "min": check(2); return (env: Env) => Math.min(args[0](env), args[1](env));
      case "max": check(2); return (env: Env) => Math.max(args[0](env), args[1](env));
      case "clamp": check(3); return (env: Env) => Math.min(args[2](env), Math.max(args[0](env), args[1](env)));
      default: throw new Error(`未知函数: ${name}`);
    }
  }

  const fn = expr(0);
  if (pos !== toks.length) throw new Error("表达式尾部有多余内容");
  return fn;
}

function compileExpr(src: string): (env: Env) => number {
  return parseExpr(src.trim());
}

/** 计算权重：数字直接返回；字符串尝试 Number，否则解析为表达式（可引用项目变量与函数规则表函数） */
function resolveWeight(raw: unknown, get: (name: string) => unknown, funcs?: (name: string, args: number[]) => number | undefined): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw !== "string") return 0;
  const s = raw.trim();
  if (s === "") return 0;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  try {
    const fn = compileExpr(s);
    const v = fn({ x: 0, y: 0, z: 0, w: 0, v: get, f: funcs });
    return Number.isFinite(v) ? v : 0;
  } catch (e) {
    console.warn(`[random-math] 权重表达式无效（按 0 处理，不参与抽取）: "${s}"`, e);
    return 0;
  }
}

@extension({ id: "random-math", label: "随机与计算系统" })
export class RandomMath extends Extension {
  static settings = settings((s: SettingsBuilder) => ({
    dslCheat: s
      .string("表达式语法速查（函数规则表「表达式」列用）")
      .default(
        "可用：数字 / 参数 x y z w / 运算符 + - * / ^ / 括号 ( )\n" +
        "函数：sqrt(x) pow(x,y) floor(x) round(x) min(a,b) max(a,b) clamp(x,min,max)\n" +
        "示例：\n  clamp(round(x*y),0,100)   ← 检定难度换算（x=基础值, y=难度系数）\n" +
        "  sqrt(pow(x,2)+pow(y,2))      ← 两点距离\n" +
        "  min(x, 100)                  ← 上限封顶\n" +
        "写错时扩展日志会打印本速查表。",
      )
      .multiline(),
  }));

  // ---------- 工具 ----------

  /** sticky 模式：outVar 已有值（首次已生成）则直接返回旧值 */
  private static sticky<T extends VariableValue>(ctx: { variables: VariablesAPI }, outVar: string | undefined, gen: () => T): T {
    if (outVar) {
      const existing = ctx.variables.get<T>(outVar);
      if (existing !== undefined) return existing;
      const v = gen();
      ctx.variables.set(outVar, v);
      return v;
    }
    return gen();
  }

  // ---------- 随机数（整数=0 位小数 / 小数 1-6 位 合一） ----------
  static rand = method({
    title: "随机数",
    description: "指定范围内随机数：小数位数=0 为整数（含端可选），1-6 位为小数；fresh=每次重掷，sticky=首次生成后固定（含读档）",
    schema: {
      mode: {
        type: "enum", label: "模式", required: true,
        options: [
          { label: "真随机 fresh（每次重掷）", value: "fresh" },
          { label: "伪随机 sticky（生成一次后固定）", value: "sticky" },
        ],
      },
      min: { type: "number", label: "最小值", required: true, default: 0 },
      max: { type: "number", label: "最大值", required: true, default: 100 },
      digits: { type: "number", label: "小数位数（0=整数，1-6=小数）", default: 0, min: 0, max: 6, step: 1 },
      includeMin: { type: "boolean", label: "含最小值端", default: true, visibleWhen: { field: "digits", equals: 0 } },
      includeMax: { type: "boolean", label: "含最大值端", default: true },
      count: { type: "number", label: "数量（1=单值；>1 批量写 前缀_1..N）", default: 1, min: 1, max: 100, step: 1 },
      outVar: { type: "variable", label: "结果写入变量（单值；sticky 必填）" },
      prefix: { type: "string", label: "批量前缀（count>1 时用）", default: "" },
    },
    returns: { type: "number", label: "随机结果" },
    run(ctx, params) {
      const count = Math.min(100, Math.max(1, Math.round(params.count ?? 1)));
      // 批量模式
      if (count > 1) {
        const pre = (params.prefix || "").trim();
        if (!pre) { console.warn("[random-math] rand: 批量模式需要填写批量前缀"); return -1; }
        if (params.mode === "sticky" && ctx.variables.get<number>(`${pre}_1`) !== undefined) return count;
        const digits = Math.round(params.digits ?? 0);
        for (let i = 1; i <= count; i++) {
          const one = digits === 0
            ? Math.floor(params.min + Math.random() * (params.max - params.min + 1))
            : Number((params.min + Math.random() * (params.max - params.min)).toFixed(Math.min(6, Math.max(1, digits))));
          ctx.variables.set(`${pre}_${i}`, one);
        }
        return count;
      }
      const digits = Math.round(params.digits ?? 0);
      const gen = () => {
        if (digits === 0) {
          // 整数：离散，含端语义精确
          const lo = Math.ceil(params.includeMin ? params.min : params.min + 1);
          const hi = Math.floor(params.includeMax ? params.max : params.max - 1);
          if (lo > hi) { console.warn(`[random-math] rand: 整数取值范围无效 [${lo},${hi}]`); return null; }
          return lo + Math.floor(Math.random() * (hi - lo + 1));
        }
        // 小数：连续，仅"不含最大端"有意义
        const d = Math.min(6, Math.max(1, digits));
        const lo = params.min;
        const hi = params.max;
        if (lo > hi) { console.warn(`[random-math] rand: 小数取值范围无效 [${lo},${hi}]`); return null; }
        const raw = lo + Math.random() * (hi - lo);
        const v = Number(raw.toFixed(d));
        if (!params.includeMax && v >= hi) return Number((hi - Math.pow(10, -d)).toFixed(d));
        return v;
      };
      if (params.mode === "sticky") {
        if (!params.outVar) { console.warn("[random-math] rand: sticky 模式需要结果写入变量，已退化为 fresh"); return gen() as number; }
        return RandomMath.sticky<number>(ctx, params.outVar, () => gen() as number);
      }
      const v = gen();
      if (v === null) return -1;
      if (params.outVar) ctx.variables.set(params.outVar, v);
      return v;
    },
  });

  // ---------- 列表随机（数据集合 + 权重） ----------
  static randPick = method({
    id: "rand-pick",
    title: "列表随机（安科式）",
    description: "从「随机候选表」数据集合按权重抽一行；无权重列/全 0 时均匀随机",
    schema: {
      pool: { type: "string", label: "候选池（按池名筛选；可空=全表）", default: "" },
      field: { type: "string", label: "抽中写出的列（默认 label）", default: "label" },
      outVar: { type: "variable", label: "结果写入变量", required: true },
      outIdVar: { type: "variable", label: "行 ID 写入变量（可空）" },
    },
    returns: { type: "string", label: "选中值" },
    async run(ctx, params) {
      try {
        const col = ctx.database.collection("pickTable");
        const pool = (params.pool || "").trim();
        const rows = await col.find(pool ? { pool } : {}, { limit: 10000 });
        if (!rows || rows.length === 0) { console.warn("[random-math] randPick: 随机候选表为空"); return ""; }
        const field = params.field || "label";
        const getVar = (name: string) => ctx.variables.get(name);
        // 载入函数规则表 → 供权重表达式调用自定义函数
        let funcs: ((name: string, args: number[]) => number | undefined) | undefined;
        try {
          const flib = ctx.database.collection("funcLib");
          const frows = await flib.find({}, { limit: 1000 });
          const fmap = new Map<string, (env: Env) => number>();
          for (const f of frows) {
            const nm = String(f.name ?? "").trim();
            if (!nm) continue;
            try { fmap.set(nm, compileExpr(String(f.expr ?? ""))); }
            catch (e) { console.warn(`[random-math] 函数「${nm}」表达式无效，无法在权重中调用`, e); }
          }
          funcs = (name, args) => {
            const hit = fmap.get(name);
            if (!hit) return undefined;
            return hit({ x: args[0] ?? 0, y: args[1] ?? 0, z: args[2] ?? 0, w: args[3] ?? 0, v: getVar, f: funcs });
          };
        } catch (e) {
          console.warn("[random-math] 函数规则表读取失败（权重内将无法调用自定义函数）", e);
        }
        const weighted = rows
          .map((r: Record<string, unknown>) => ({ row: r, w: resolveWeight(r.weight, getVar, funcs) }))
          .filter((x: { w: number }) => x.w > 0);
        let chosen: Record<string, unknown> | undefined;
        if (weighted.length > 0) {
          const total = weighted.reduce((s: number, x: { w: number }) => s + x.w, 0);
          let roll = Math.random() * total;
          for (const x of weighted) { roll -= x.w; if (roll <= 0) { chosen = x.row; break; } }
          if (chosen === undefined) chosen = weighted[weighted.length - 1].row;
        } else {
          chosen = rows[Math.floor(Math.random() * rows.length)];
        }
        const value = chosen[field] !== undefined ? String(chosen[field]) : "";
        ctx.variables.set(params.outVar, value);
        if (params.outIdVar && typeof chosen.id === "string") ctx.variables.set(params.outIdVar, chosen.id);
        return value;
      } catch (e) {
        console.warn("[random-math] randPick 失败", e);
        return "";
      }
    },
  });

  // ---------- 计算（含自定义函数） ----------
  static calc = method({
    title: "计算",
    description: "基础计算（加减乘除/幂/开方/取整/四舍五入）或调用自定义函数（op=自定义函数时按函数名+参数 x/y/z/w）",
    schema: {
      op: {
        type: "enum", label: "运算", required: true,
        options: [
          { label: "加 +", value: "add" },
          { label: "减 -", value: "sub" },
          { label: "乘 ×", value: "mul" },
          { label: "除 ÷", value: "div" },
          { label: "幂 ^（a 的 b 次方）", value: "pow" },
          { label: "开方 √（a 的平方根）", value: "root" },
          { label: "取整（向下）", value: "floor" },
          { label: "四舍五入", value: "round" },
          { label: "自定义函数", value: "func" },
        ],
      },
      a: { type: "number", label: "a", required: true, default: 0 },
      b: { type: "number", label: "b（除/幂用；默认 1）", default: 1 },
      funcName: { type: "string", label: "函数名（op=自定义函数时）", default: "", visibleWhen: { field: "op", equals: "func" } },
      x: { type: "number", label: "x", default: 0, visibleWhen: { field: "op", equals: "func" } },
      y: { type: "number", label: "y", default: 0, visibleWhen: { field: "op", equals: "func" } },
      z: { type: "number", label: "z", default: 0, visibleWhen: { field: "op", equals: "func" } },
      w: { type: "number", label: "w", default: 0, visibleWhen: { field: "op", equals: "func" } },
      outVar: { type: "variable", label: "结果写入变量（可空；空则仅 If 比较用）" },
    },
    returns: { type: "number", label: "计算结果" },
    async run(ctx, params) {
      let result: number;
      // 自定义函数分支（读函数规则表）
      if (params.op === "func") {
        try {
          const col = ctx.database.collection("funcLib");
          const rows = await col.find({ name: params.funcName ?? "" }, { limit: 1 });
          if (!rows || rows.length === 0) {
            console.warn(`[random-math] calc: 未找到函数「${params.funcName}」（请检查函数规则表）`);
            return -1;
          }
          const expr = String(rows[0].expr ?? "");
          const fn = compileExpr(expr);
          const env = { x: params.x ?? 0, y: params.y ?? 0, z: params.z ?? 0, w: params.w ?? 0, v: (n: string) => ctx.variables.get(n) };
          const r = fn(env);
          if (!Number.isFinite(r)) { console.warn("[random-math] calc: 函数结果非有限数"); return -1; }
          result = r;
        } catch (e) {
          console.warn(`[random-math] calc: 函数「${params.funcName}」执行失败`, e);
          console.warn("[random-math] 表达式语法速查: 数字 + 参数 x/y/z/w + 运算符 + - * / ^ ( ) + 函数 sqrt() pow() floor() round() min() max() clamp() — 例如 clamp(round(x*y),0,100)");
          return -1;
        }
      } else {
        const a = params.a;
        const b = params.b ?? 1;
        switch (params.op) {
          case "add": result = a + b; break;
          case "sub": result = a - b; break;
          case "mul": result = a * b; break;
          case "div": result = b === 0 ? (console.warn("[random-math] calc: 除零"), -1) : a / b; break;
          case "pow": result = Math.pow(a, b); break;
          case "root": result = a < 0 ? (console.warn("[random-math] calc: 负数开方"), -1) : Math.sqrt(a); break;
          case "floor": result = Math.floor(a); break;
          case "round": result = Math.round(a); break;
          default: result = -1;
        }
      }
      if (params.outVar) ctx.variables.set(params.outVar, result);
      return result;
    },
  });
}
