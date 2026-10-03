// dist/index.js
import { Extension as Extension2, extension, settings as settings2, defineSave as defineSave2, method as sdkMethod2 } from "@avg-studio/sdk";

// dist/expression.js
var MAX_DEPTH = 32;
function normNum(u) {
  if (typeof u === "number")
    return Number.isFinite(u) ? u : null;
  if (typeof u === "boolean")
    return u ? 1 : 0;
  if (typeof u === "string" && u.trim()) {
    const n = Number(u.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function truthy(u) {
  const n = normNum(u);
  return n !== null ? n !== 0 : !!u;
}
function tokenize(src) {
  if (!src.trim() || src.length > 4096)
    throw new Error("表达式为空或超过4096字符");
  const out = [];
  let i = 0;
  const two = (c) => src.substr(i, 2) === c;
  while (i < src.length) {
    if (out.length > 1024)
      throw new Error("表达式语法单元过多");
    const c = src[i];
    if (c === " " || c === "	" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c >= "0" && c <= "9" || c === ".") {
      const matched = src.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!matched)
        throw new Error("非法数字");
      const s = matched[0];
      i += s.length;
      const v = Number(s);
      if (!Number.isFinite(v))
        throw new Error(`非法数字: ${s}`);
      out.push({ t: "num", v });
      continue;
    }
    if (c === '"') {
      const matched = src.slice(i).match(/^"(?:[^"\\]|\\.)*"/);
      if (!matched)
        throw new Error("字符串缺少结束引号");
      const value = JSON.parse(matched[0]);
      if (typeof value !== "string")
        throw new Error("字符串无效");
      i += matched[0].length;
      out.push({ t: "str", v: value });
      continue;
    }
    if (/[A-Za-z_\u4e00-\u9fa5]/.test(c)) {
      let s = "";
      while (i < src.length && /[A-Za-z0-9_\u4e00-\u9fa5]/.test(src[i])) {
        s += src[i];
        i++;
      }
      out.push({ t: "id", v: s });
      continue;
    }
    if ("+-*/^".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (two("<=") || two(">=") || two("==") || two("!=")) {
      out.push({ t: "cmp", v: src.substr(i, 2) });
      i += 2;
      continue;
    }
    if (c === "<" || c === ">") {
      out.push({ t: "cmp", v: c });
      i++;
      continue;
    }
    if (c === "?") {
      out.push({ t: "q", v: "?" });
      i++;
      continue;
    }
    if (c === ":") {
      out.push({ t: "colon", v: ":" });
      i++;
      continue;
    }
    if (c === "(") {
      out.push({ t: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ t: "rp" });
      i++;
      continue;
    }
    if (c === ",") {
      out.push({ t: "comma" });
      i++;
      continue;
    }
    throw new Error(`非法字符: ${c}`);
  }
  return out;
}
function parseExpr(src) {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  function expr(depth) {
    if (depth > MAX_DEPTH)
      throw new Error("表达式过深");
    let c = cmp(depth);
    while (peek() && peek().t === "q") {
      next();
      const a = expr(depth + 1);
      if (!(peek() && peek().t === "colon"))
        throw new Error("三元缺 :");
      next();
      const b = expr(depth + 1);
      const cond = c;
      c = (env) => truthy(cond(env)) ? a(env) : b(env);
    }
    return c;
  }
  function cmp(depth) {
    let left = arith(depth);
    while (peek() && peek().t === "cmp") {
      const op = next().v;
      const right = arith(depth);
      const l = left, r = right;
      left = (env) => {
        const a = l(env), b = r(env);
        switch (op) {
          case "==": {
            const na = normNum(a), nb = normNum(b);
            return na !== null && nb !== null ? na === nb ? 1 : 0 : a === b ? 1 : 0;
          }
          case "!=": {
            const na = normNum(a), nb = normNum(b);
            return na !== null && nb !== null ? na !== nb ? 1 : 0 : a !== b ? 1 : 0;
          }
          case "<":
            return (normNum(a) ?? 0) < (normNum(b) ?? 0) ? 1 : 0;
          case ">":
            return (normNum(a) ?? 0) > (normNum(b) ?? 0) ? 1 : 0;
          case "<=":
            return (normNum(a) ?? 0) <= (normNum(b) ?? 0) ? 1 : 0;
          case ">=":
            return (normNum(a) ?? 0) >= (normNum(b) ?? 0) ? 1 : 0;
        }
        return 0;
      };
    }
    return left;
  }
  function arith(depth) {
    let left = term(depth);
    while (peek() && peek().t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = next().v;
      const right = term(depth);
      const l = left, r = right;
      left = op === "+" ? (env) => checked(l(env) + r(env)) : (env) => checked(l(env) - r(env));
    }
    return left;
  }
  function term(depth) {
    let left = unary(depth);
    while (peek()?.t === "op" && ["*", "/"].includes(peek().v)) {
      const op = next().v, right = unary(depth), l = left;
      left = op === "*" ? (env) => checked(l(env) * right(env)) : (env) => {
        const d = right(env);
        if (d === 0)
          throw new Error("除零");
        return checked(l(env) / d);
      };
    }
    return left;
  }
  function unary(depth) {
    if (depth > MAX_DEPTH)
      throw new Error("表达式过深");
    const tk = peek();
    if (tk?.t === "op" && (tk.v === "+" || tk.v === "-")) {
      next();
      const value = unary(depth + 1);
      return (env) => tk.v === "-" ? -value(env) : value(env);
    }
    const left = factor(depth);
    if (peek()?.t === "op" && peek().v === "^") {
      next();
      const right = unary(depth + 1);
      return (env) => checked(Math.pow(left(env), right(env)));
    }
    return left;
  }
  function factor(depth) {
    const tk = peek();
    if (!tk)
      throw new Error("表达式意外结束");
    if (tk.t === "num") {
      next();
      const v = tk.v;
      return () => v;
    }
    if (tk.t === "str")
      throw new Error('字符串只能用于 var("变量名")');
    if (tk.t === "id") {
      next();
      const name = tk.v;
      if (name === "x" || name === "y" || name === "z" || name === "w") {
        return (env) => env[name];
      }
      if (name === "var") {
        if (!(peek() && peek().t === "lp"))
          throw new Error('var 需要括号：var("变量名")');
        next();
        const arg = peek();
        if (!arg || arg.t !== "str")
          throw new Error('var 参数必须是字符串：var("变量名")');
        next();
        if (!(peek() && peek().t === "rp"))
          throw new Error("var 缺右括号");
        next();
        const vname = arg.v;
        return (env) => {
          const u = env.v(vname);
          const n = normNum(u);
          if (n === null)
            throw new Error(`变量「${vname}」不存在或不是数值`);
          return n;
        };
      }
      if (peek() && peek().t === "lp") {
        next();
        const args = [];
        if (!(peek() && peek().t === "rp")) {
          while (true) {
            args.push(expr(depth + 1));
            if (peek() && peek().t === "comma") {
              next();
              continue;
            }
            break;
          }
        }
        if (!(peek() && peek().t === "rp"))
          throw new Error(`函数 ${name} 缺右括号`);
        next();
        if (BUILTIN_FNS.includes(name))
          return buildFn(name, args);
        return (env) => {
          const fn2 = env.f?.(name, args.map((a) => a(env)));
          if (typeof fn2 !== "number" || !Number.isFinite(fn2)) {
            throw new Error(`未找到自定义函数: ${name}`);
          }
          return fn2;
        };
      }
      throw new Error(`标识符 ${name} 需要括号调用`);
    }
    if (tk.t === "lp") {
      next();
      const inner = expr(depth + 1);
      if (!(peek() && peek().t === "rp"))
        throw new Error("缺右括号");
      next();
      return inner;
    }
    throw new Error("非法语法");
  }
  const BUILTIN_FNS = ["sqrt", "pow", "floor", "round", "min", "max", "clamp"];
  function buildFn(name, args) {
    const check = (n) => {
      if (args.length !== n)
        throw new Error(`函数 ${name} 需要 ${n} 个参数，收到 ${args.length}`);
    };
    switch (name) {
      case "sqrt":
        check(1);
        return (env) => checked(Math.sqrt(args[0](env)));
      case "pow":
        check(2);
        return (env) => checked(Math.pow(args[0](env), args[1](env)));
      case "floor":
        check(1);
        return (env) => Math.floor(args[0](env));
      case "round":
        check(1);
        return (env) => Math.round(args[0](env));
      case "min":
        check(2);
        return (env) => Math.min(args[0](env), args[1](env));
      case "max":
        check(2);
        return (env) => Math.max(args[0](env), args[1](env));
      case "clamp":
        check(3);
        return (env) => {
          const [x, lo, hi] = args.map((f) => f(env));
          if (lo > hi)
            throw new Error("clamp下界大于上界");
          return Math.min(hi, Math.max(lo, x));
        };
      default:
        throw new Error(`未知函数: ${name}`);
    }
  }
  const fn = expr(0);
  if (pos !== toks.length)
    throw new Error("表达式尾部有多余内容");
  return fn;
}
function checked(value) {
  if (!Number.isFinite(value))
    throw new Error("结果不是有限数值");
  return value;
}
var expressionCache = /* @__PURE__ */ new Map();
function compileExpr(src) {
  const key = src.trim(), cached = expressionCache.get(key);
  if (cached)
    return cached;
  const fn = parseExpr(key);
  if (expressionCache.size >= 256)
    expressionCache.delete(expressionCache.keys().next().value);
  const checkedFn = (env) => checked(fn(env));
  expressionCache.set(key, checkedFn);
  return checkedFn;
}

// dist/host-replay.js
import { method as sdkMethod } from "@avg-studio/sdk";
function isNavigationReplay(ctx) {
  try {
    const host = ctx.getHost?.();
    return host?.application?.scriptingSystem?.getActiveSeekPurpose?.() === "navigation";
  } catch {
    return false;
  }
}
function replayMethod(def) {
  return sdkMethod({
    ...def,
    runImmediately(ctx, params) {
      if (isNavigationReplay(ctx))
        return def.run.call(this, ctx, params);
      const fields = params;
      const output = typeof fields.outVar === "string" ? ctx.variables.get(fields.outVar) : void 0;
      const kind = def.returns?.type;
      return typeof output === kind ? output : kind === "number" ? -1 : kind === "string" ? "" : kind === "boolean" ? false : void 0;
    },
    skip(ctx, params) {
      return def.run.call(this, ctx, params);
    }
  });
}

// dist/legacy.js
import { Extension, settings, defineSave } from "@avg-studio/sdk";

// dist/deck.js
var MAX_ITEMS = 1e4;
var MAX_SAVED_ITEMS = 2e4;
var MAX_DECKS = 100;
var MAX_STATE_CHARS = 4e6;
var invalid = (text2) => {
  throw Error(text2);
};
function deckKey(key) {
  if (typeof key !== "string" || !key.trim() || key.trim().length > 128)
    invalid("抽取池名称必须为1～128字符");
  return key.trim();
}
function parseDecks(raw) {
  if (raw === void 0 || raw === null)
    return [];
  if (!Array.isArray(raw) || raw.length > MAX_DECKS || raw.some((s) => typeof s !== "string"))
    invalid("抽取池存档格式损坏");
  if (raw.reduce((n, s) => n + s.length, 0) > MAX_STATE_CHARS)
    invalid("抽取池存档过大");
  const decks = raw.map((s) => {
    const d = JSON.parse(s);
    if (!d || d.version !== 1 || deckKey(d.key) !== d.key || !["fixed", "remaining"].includes(d.mode) || !["text", "number"].includes(d.valueType) || !Number.isInteger(d.total) || d.total < 1 || d.total > MAX_ITEMS || !Number.isInteger(d.drawn) || d.drawn < 0 || d.drawn > d.total || !Array.isArray(d.items) || d.items.length !== d.total - d.drawn)
      invalid("抽取池记录损坏或版本不支持");
    const ids = /* @__PURE__ */ new Set();
    for (const item of d.items) {
      if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || !Number.isFinite(item.weight) || item.weight <= 0 || (d.valueType === "text" ? typeof item.value !== "string" : typeof item.value !== "number" || !Number.isFinite(item.value)))
        invalid("抽取池候选记录损坏");
      ids.add(item.id);
    }
    return d;
  });
  if (new Set(decks.map((d) => d.key)).size !== decks.length)
    invalid("抽取池名称重复");
  if (decks.reduce((n, d) => n + d.items.length, 0) > MAX_SAVED_ITEMS)
    invalid("抽取池剩余项目总量超过20000");
  return decks;
}
function encodeDecks(decks) {
  const raw = decks.map((d) => JSON.stringify(d));
  parseDecks(raw);
  return raw;
}
function uniqueItems(items, uniqueBy) {
  if (!["row", "value"].includes(uniqueBy))
    invalid("去重方式无效");
  if (!items.length || items.length > MAX_ITEMS)
    invalid("抽取池需要1～10000个有效候选");
  if (new Set(items.map((i) => i.id)).size !== items.length || items.some((i) => !i.id))
    invalid("候选行ID为空或重复");
  if (uniqueBy === "row")
    return items.map((i) => ({ ...i }));
  const merged = /* @__PURE__ */ new Map();
  for (const item of items) {
    const key = JSON.stringify(item.value), old = merged.get(key);
    if (old)
      old.weight += item.weight;
    else
      merged.set(key, { ...item });
  }
  return [...merged.values()];
}
function randomUnit() {
  const r = Math.random();
  if (!Number.isFinite(r) || r < 0 || r >= 1)
    invalid("随机源超出[0,1)");
  return r;
}
function weightedIndex(items) {
  if (!items.length)
    invalid("抽取池已空");
  let max = 0;
  for (const i of items)
    max = Math.max(max, i.weight);
  let total = 0;
  for (const i of items)
    total += i.weight / max;
  let roll = randomUnit() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= items[i].weight / max;
    if (roll < 0)
      return i;
  }
  return items.length - 1;
}
function shuffle(items) {
  const rest = items.map((i) => ({ ...i }));
  if (rest.every((i) => i.weight === rest[0].weight)) {
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(randomUnit() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return rest;
  }
  const ordered = [];
  while (rest.length)
    ordered.push(rest.splice(weightedIndex(rest), 1)[0]);
  return ordered;
}
function take(deck, count) {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    invalid("抽取数量必须为1～100整数");
  if (count > deck.items.length)
    invalid(`抽取池仅剩${deck.items.length}项，本次需要${count}项；请减少数量或显式重置`);
  const items = deck.items.map((i) => ({ ...i })), chosen = [];
  for (let i = 0; i < count; i++)
    chosen.push(items.splice(deck.mode === "fixed" ? 0 : weightedIndex(items), 1)[0]);
  return { next: { ...deck, drawn: deck.drawn + count, items }, chosen };
}
function report(deck) {
  return {
    key: deck.key,
    mode: deck.mode,
    valueType: deck.valueType,
    total: deck.total,
    drawn: deck.drawn,
    remaining: deck.items.length,
    values: deck.items.map((i) => i.value),
    ids: deck.items.map((i) => i.id)
  };
}

// dist/legacy.js
var message = (e) => e instanceof Error ? e.message : String(e);
var reject = (text2) => {
  throw new Error(text2);
};
var number = (n, label) => typeof n === "number" && Number.isFinite(n) ? n : reject(`${label}必须是有限数值`);
var resultFields = {
  successVar: { type: "variable", label: "成功状态写入（布尔，可空）" },
  errorVar: { type: "variable", label: "错误说明写入（文本，可空）" }
};
function unique(names) {
  const used = names.filter(Boolean);
  if (new Set(used).size !== used.length)
    reject("结果、状态和错误不能写入同一个变量");
}
function compatible(ctx, name, type) {
  if (!name)
    return;
  const old = ctx.variables.get(name);
  if (old !== void 0 && old !== null && typeof old !== type)
    reject(`输出变量「${name}」需要${type}类型`);
}
function outputs(ctx, p, resultType, extra = []) {
  unique([p.outVar, p.successVar, p.errorVar, ...extra]);
  compatible(ctx, p.outVar, resultType);
  compatible(ctx, p.successVar, "boolean");
  compatible(ctx, p.errorVar, "string");
}
function status(ctx, p, error = "") {
  if (p.successVar)
    ctx.variables.set(p.successVar, !error);
  if (p.errorVar)
    ctx.variables.set(p.errorVar, error);
}
function failed(ctx, p, label, error, protectedNames = []) {
  const text2 = `${label}：${message(error)}`;
  console.warn(`[random-math] ${text2}`);
  const names = [p.outVar, ...protectedNames];
  const safe = {
    successVar: names.includes(p.successVar) || p.successVar === p.errorVar ? void 0 : p.successVar,
    errorVar: names.includes(p.errorVar) || p.errorVar === p.successVar ? void 0 : p.errorVar
  };
  try {
    compatible(ctx, safe.successVar, "boolean");
    compatible(ctx, safe.errorVar, "string");
    status(ctx, safe, text2);
  } catch (e) {
    console.warn("[random-math] 状态输出失败", message(e));
  }
}
function runExtraCalculation(ctx, p, calculate) {
  try {
    outputs(ctx, p, "number");
    const result2 = checked(calculate());
    if (p.outVar)
      ctx.variables.set(p.outVar, result2);
    status(ctx, p);
    return result2;
  } catch (e) {
    failed(ctx, p, "计算", e);
    return -1;
  }
}
function writeAll(ctx, writes2) {
  const before = writes2.map(([name]) => ctx.variables.get(name));
  let done = 0;
  try {
    for (; done < writes2.length; done++)
      ctx.variables.set(...writes2[done]);
  } catch (e) {
    for (let i = done - 1; i >= 0; i--)
      if (before[i] !== void 0)
        ctx.variables.set(writes2[i][0], before[i]);
    throw e;
  }
}
async function rows(ctx, table, filter, limit) {
  const result2 = await ctx.database.collection(table).find(filter, { limit: limit + 1 });
  if (result2.length > limit)
    reject(`${table}超过${limit}行，请缩小范围`);
  return result2;
}
async function functionLibrary(ctx) {
  const table = await rows(ctx, "funcLib", {}, 1e3), lib = /* @__PURE__ */ new Map();
  const reserved = /* @__PURE__ */ new Set(["var", "x", "y", "z", "w", "sqrt", "pow", "floor", "round", "min", "max", "clamp"]);
  for (const row of table) {
    const name = String(row.name ?? "").trim(), expr = String(row.expr ?? "");
    if (!/^[A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5]*$/.test(name) || reserved.has(name))
      reject(`无效或保留函数名「${name}」`);
    if (lib.has(name))
      reject(`函数名重复「${name}」`);
    try {
      const tokens = tokenize(expr), deps = tokens.flatMap((t, i) => t.t === "id" && tokens[i + 1]?.t === "lp" && !reserved.has(t.v) ? [t.v] : []);
      lib.set(name, { fn: compileExpr(expr), deps });
    } catch (e) {
      reject(`函数「${name}」：${message(e)}`);
    }
  }
  const visiting = /* @__PURE__ */ new Set(), visited = /* @__PURE__ */ new Set();
  function visit(name, path = []) {
    if (visiting.has(name))
      reject(`函数循环引用：${[...path, name].join(" → ")}`);
    if (path.length >= 32)
      reject("函数调用链超过32层");
    if (visited.has(name))
      return;
    const item = lib.get(name);
    if (!item)
      reject(`未找到函数「${name}」`);
    visiting.add(name);
    item.deps.forEach((dep) => visit(dep, [...path, name]));
    visiting.delete(name);
    visited.add(name);
  }
  lib.forEach((_, name) => visit(name));
  return (expr, args = []) => {
    let budget = 4096, depth = 0;
    const call = (name, values) => {
      if (--budget < 0 || ++depth > 32)
        reject("函数执行预算或调用深度超限");
      const item = lib.get(name);
      if (!item)
        reject(`未找到函数「${name}」`);
      if (values.length > 4)
        reject("函数最多接受4个参数");
      try {
        return item.fn(env(values));
      } finally {
        depth--;
      }
    };
    const env = (v) => ({ x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0, w: v[3] ?? 0, v: (n) => ctx.variables.get(n), f: call });
    return compileExpr(expr)(env(args));
  };
}
function standalone(ctx, expr) {
  return compileExpr(expr)({ x: 0, y: 0, z: 0, w: 0, v: (n) => ctx.variables.get(n) });
}
function sampler(p) {
  const min = number(p.min, "最小值"), max = number(p.max, "最大值"), digits = p.digits ?? 0;
  if (min > max)
    reject("最小值大于最大值");
  if (!Number.isInteger(digits) || digits < 0 || digits > 6)
    reject("小数位数必须为0～6整数");
  const scale = 10 ** digits;
  const tick = (n) => {
    const x = n * scale, r = Math.round(x);
    if (Math.abs(x) > 2 ** 48)
      reject("数值与精度组合过大");
    return digits > 0 && Math.abs(x - r) <= Math.min(1e-7, 4 * Number.EPSILON * Math.max(1, Math.abs(x))) ? r : x;
  };
  const a = tick(min), b = tick(max), lo = p.includeMin === false ? Math.floor(a) + 1 : Math.ceil(a), hi = p.includeMax === false ? Math.ceil(b) - 1 : Math.floor(b);
  if (lo > hi)
    reject("当前端点与精度下没有可抽取数值");
  const valid = (v) => Number.isFinite(v) && v >= lo / scale && v <= hi / scale && Math.abs(v * scale - Math.round(v * scale)) <= 1e-7;
  return { lo, hi, scale, valid, draw: () => (lo + Math.floor(Math.random() * (hi - lo + 1))) / scale };
}
function fixedState(owner) {
  const save = owner.save;
  if (!save)
    reject("固定随机需要宿主存档上下文");
  const raw = save.get("fixedResults");
  if (!Array.isArray(raw))
    reject("固定随机存档格式无效");
  const records = raw.map((item) => {
    if (typeof item !== "string")
      reject("固定记录损坏");
    const r = JSON.parse(item);
    if (!r || typeof r.key !== "string" || typeof r.signature !== "string" || !Array.isArray(r.values) || !r.values.every((n) => typeof n === "number" && Number.isFinite(n)))
      reject("固定记录损坏");
    return r;
  });
  if (new Set(records.map((r) => r.key)).size !== records.length)
    reject("固定记录重名");
  return { records, write: (next) => save.set("fixedResults", next.map((r) => JSON.stringify(r))) };
}
var poolFields = {
  poolScope: { type: "enum", label: "候选范围", default: "named", options: [{ label: "指定池（空名称兼容全表）", value: "named" }, { label: "仅未命名池", value: "default" }, { label: "全部池", value: "all" }] },
  pool: { type: "string", label: "池名", default: "", visibleWhen: { field: "poolScope", equals: "named" }, suggestions: { key: "pool" } },
  field: { type: "string", label: "输出列", default: "label", suggestions: { key: "candidate-field" } },
  emptyPolicy: { type: "enum", label: "剩余概率无正权重时", default: "error", options: [{ label: "不抽取并报告错误", value: "error" }, { label: "明确允许均匀回退", value: "uniform" }] }
};
async function poolReport(ctx, p) {
  const scope = p.poolScope || "named", pool = (p.pool ?? "").trim(), policy = p.emptyPolicy || "error";
  if (!["named", "default", "all"].includes(scope) || !["error", "uniform"].includes(policy))
    reject("候选范围或回退策略无效");
  let table = await rows(ctx, "pickTable", scope === "named" && pool ? { pool } : {}, 1e4);
  if (scope === "default")
    table = table.filter((r) => !String(r.pool ?? "").trim());
  if (!table.length)
    reject("候选池为空");
  const field = (p.field || "label").trim();
  const hasWeight = (r) => r.weight !== void 0 && r.weight !== null && String(r.weight).trim() !== "";
  const unweighted = table.every((r) => !hasWeight(r));
  const specs = table.map((row, i) => {
    const raw = typeof row.weight === "string" ? row.weight.trim() : row.weight;
    const kind = typeof raw === "string" && raw.endsWith("%") ? "fixed" : "relative";
    const name = String(row.id ?? row.label ?? i + 1);
    if (kind === "fixed" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?%$/.test(raw))
      reject(`候选「${name}」：固定概率请填写数字加 %，例如 10%`);
    return { row, raw, kind, name };
  });
  const needsLibrary = specs.some(({ raw, kind, name }) => {
    if (kind === "fixed" || typeof raw !== "string" || !raw)
      return false;
    try {
      return tokenize(raw).some((t, j, a) => t.t === "id" && a[j + 1]?.t === "lp" && !["var", "sqrt", "pow", "floor", "round", "min", "max", "clamp"].includes(t.v));
    } catch (e) {
      return reject(`候选「${name}」：${message(e)}`);
    }
  });
  const evaluate = needsLibrary ? await functionLibrary(ctx) : (expr) => standalone(ctx, expr);
  const candidates = specs.map(({ row, raw, kind, name }) => {
    let weight;
    try {
      weight = kind === "fixed" ? Number(raw.slice(0, -1)) : unweighted ? 1 : !hasWeight(row) ? 0 : typeof raw === "number" ? raw : typeof raw === "string" ? evaluate(raw) : reject("权重类型无效");
      number(weight, kind === "fixed" ? "固定概率" : "权重");
      if (kind === "fixed" ? weight < 0 || weight > 100 : weight < 0)
        reject(kind === "fixed" ? "固定概率必须在 0%～100% 之间" : "权重不能为负");
    } catch (e) {
      return reject(`候选「${name}」：${message(e)}`);
    }
    const value = row[field];
    if (value === void 0 || value === null || !["string", "number", "boolean"].includes(typeof value))
      reject(`候选「${name}」缺少有效列「${field}」`);
    return { id: typeof row.id === "string" ? row.id : "", value: String(value), kind, weight, probability: 0 };
  });
  let fixedPercent = 0, correction = 0;
  for (const c of candidates.filter((c2) => c2.kind === "fixed")) {
    const adjusted = c.weight - correction, total = fixedPercent + adjusted;
    correction = total - fixedPercent - adjusted;
    fixedPercent = total;
    c.probability = c.weight / 100;
  }
  const tolerance = Number.EPSILON * 100 * 8;
  if (fixedPercent > 100 + tolerance)
    reject("固定概率合计超过 100%，请降低固定概率或拆分候选池");
  const fixedProbability = Math.abs(fixedPercent - 100) <= tolerance ? 1 : fixedPercent / 100;
  const remainingProbability = 1 - fixedProbability;
  const relative = candidates.filter((c) => c.kind === "relative");
  let fallback = false;
  if (remainingProbability > 0) {
    if (!relative.length)
      reject("固定概率未满 100%，请添加相对权重候选来分配剩余概率（也可添加“无事发生”）");
    let max = Math.max(...relative.map((c) => c.weight));
    fallback = max === 0;
    if (fallback) {
      if (policy !== "uniform")
        reject("剩余概率没有正权重候选：所有相对权重为0");
      relative.forEach((c) => {
        c.weight = 1;
      });
      max = 1;
    }
    const total = relative.reduce((sum, c) => sum + c.weight / max, 0);
    relative.forEach((c) => {
      c.probability = remainingProbability * (c.weight / max / total);
    });
  }
  return { scope, pool, unweighted, fallback, fixedProbability, remainingProbability, candidates };
}
async function drawPool(ctx, p, numeric2 = false) {
  const count = p.count ?? 1, replacement = p.replacement ?? "with";
  if (!Number.isInteger(count) || count < 1 || count > 100)
    reject("抽取数量必须为1～100整数");
  if (!["with", "without"].includes(replacement))
    reject("重复规则无效");
  const report2 = await poolReport(ctx, p);
  let evaluate = (expr) => standalone(ctx, expr);
  if (numeric2) {
    const needsLibrary = report2.candidates.some((c) => {
      try {
        return tokenize(c.value).some((t, i, a) => t.t === "id" && a[i + 1]?.t === "lp" && !["var", "sqrt", "pow", "floor", "round", "min", "max", "clamp"].includes(t.v));
      } catch (e) {
        return reject(`候选「${c.id || c.value}」数值：${message(e)}`);
      }
    });
    if (needsLibrary)
      evaluate = await functionLibrary(ctx);
  }
  const candidates = report2.candidates.map((c) => {
    let numberValue = 0;
    if (numeric2) {
      try {
        numberValue = number(evaluate(c.value), "数值结果");
      } catch (e) {
        return reject(`候选「${c.id || c.value}」数值：${message(e)}`);
      }
    }
    return { ...c, numberValue };
  });
  const active = candidates.filter((c) => c.probability > 0);
  if (p.outIdVar && active.some((c) => !c.id))
    reject("候选缺少行ID");
  if (replacement === "without" && count > active.length)
    reject(`同批不重复最多可抽${active.length}个正概率候选，请减少数量`);
  const chosen = [];
  for (let i = 0; i < count; i++) {
    const max = Math.max(...active.map((c) => c.probability));
    const total = active.reduce((sum, c) => sum + c.probability / max, 0);
    let roll = Math.random() * total;
    let index = active.findIndex((c) => {
      roll -= c.probability / max;
      return roll < 0;
    });
    if (index < 0)
      index = active.length - 1;
    chosen.push(active[index]);
    if (replacement === "without")
      active.splice(index, 1);
  }
  return chosen;
}
var drawFields = {
  count: { type: "number", label: "抽取数量", default: 1, min: 1, max: 100, step: 1 },
  replacement: { type: "enum", label: "重复规则", default: "with", options: [{ label: "允许重复（每次概率不变）", value: "with" }, { label: "同批不重复（按行排除，后续概率改变）", value: "without" }] }
};
var deckBusy = /* @__PURE__ */ new WeakSet();
function deckStore(owner) {
  const save = owner.save;
  if (!save)
    reject("抽取池需要宿主槽存档上下文");
  const raw = save.get("drawDecks"), records = parseDecks(raw);
  return { records, raw, read: () => save.get("drawDecks"), write: (next) => save.set("drawDecks", encodeDecks(next)), restore: () => save.set("drawDecks", raw ?? []) };
}
function deckAcquire(owner) {
  if (deckBusy.has(owner))
    reject("抽取池正在处理另一次调用，请按顺序执行");
  deckBusy.add(owner);
  return () => deckBusy.delete(owner);
}
function deckCommit(ctx, store, next, writes2, p, signal) {
  if (signal?.aborted)
    reject("运行已取消，未修改抽取池");
  if (JSON.stringify(store.read()) !== JSON.stringify(store.raw))
    reject("存档状态已变化，请重新执行");
  if (p.successVar)
    writes2.push([p.successVar, true]);
  if (p.errorVar)
    writes2.push([p.errorVar, ""]);
  store.write(next);
  try {
    writeAll(ctx, writes2);
  } catch (e) {
    store.restore();
    throw e;
  }
}
async function deckCandidates(ctx, p) {
  const source = p.source ?? "table", valueType = p.valueType ?? "text";
  if (!["table", "array"].includes(source) || !["text", "number"].includes(valueType))
    reject("抽取池来源或输出类型无效");
  let items;
  if (source === "array") {
    const raw = p.arrayVar ? ctx.variables.get(p.arrayVar) : p.arrayJson;
    if (typeof raw !== "string" || raw.length > 1e6)
      reject("数组输入必须为不超过1000000字符的JSON文本");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > MAX_ITEMS)
      reject("数组必须包含1～10000项");
    items = parsed.map((value, i) => {
      if (valueType === "number" ? typeof value !== "number" || !Number.isFinite(value) : typeof value !== "string")
        reject("数组元素类型必须与输出类型一致，数值数组只接受有限数字");
      return { id: `array:${i + 1}`, value, weight: 1 };
    });
  } else {
    const candidates = (await poolReport(ctx, p)).candidates;
    let evaluate = (expr) => standalone(ctx, expr);
    if (valueType === "number" && candidates.some((c) => tokenize(c.value).some((t, i, a) => t.t === "id" && a[i + 1]?.t === "lp" && !["var", "sqrt", "pow", "floor", "round", "min", "max", "clamp"].includes(t.v))))
      evaluate = await functionLibrary(ctx);
    items = candidates.map((c) => ({ id: c.id, value: valueType === "number" ? number(evaluate(c.value), "数值结果") : c.value, weight: c.probability })).filter((c) => c.weight > 0);
  }
  return uniqueItems(items, p.uniqueBy ?? "value");
}
var deckKeyField = { key: { type: "string", label: "抽取池名称（独立命名，随存档）", required: true, default: "", suggestions: { key: "deck-key" } } };
var LegacyMath = class extends Extension {
  static saveSchema = defineSave({ drawDecks: { type: "list", persistence: "slot", default: [], label: "不重复抽取池" }, fixedResults: { type: "list", persistence: "slot", default: [], label: "固定随机记录" } });
  static settings = settings((s) => ({ creatorHelp: s.string("创作者手册与 AI 指南").default("完整手册：工坊原插件详情页，或发行包 docs/creator-guide.html（可单独离线打开）。\n先看第1章术语、第3章掷骰、第4章不重复抽取；查找可直接跳到第几处并预览上下文。\nAI指南与人类手册分开：docs/AI-GUIDE.md；接入步骤见 docs/AI-INTEGRATION.md。插件安装不会自动安装AI技能。").multiline(), dslCheat: s.string("表达式语法速查").default('支持 + - * / ^、负数、比较和三元条件；幂优先且右结合。\n函数 sqrt pow floor round min max clamp、var("变量名")及表函数（禁止递归）。\n例 clamp(round(x*y),0,100)。候选表 weight 填 10% 锁定10%概率，数字或表达式分配剩余概率。% 只用于候选表数字后缀。固定结果跟随当前存档，读回抽取前存档会重抽。').multiline() }));
  static deckCreate = replayMethod({ id: "deck-create", title: "建立不重复抽取池", description: "从候选表或JSON数组建立持久抽取池。重复建立同名池会报错，重开一轮须先重置。", schema: {
    ...deckKeyField,
    source: { type: "enum", label: "来源", default: "table", options: [{ label: "随机候选表", value: "table" }, { label: "JSON数组", value: "array" }] },
    ...poolFields,
    arrayJson: { type: "string", label: 'JSON数组（如 ["A","B","C"] 或 [1,2,3]）', default: "", visibleWhen: { field: "source", equals: "array" } },
    arrayVar: { type: "variable", label: "从文本变量读取JSON数组（优先于上方文本）", visibleWhen: { field: "source", equals: "array" } },
    valueType: { type: "enum", label: "结果类型", default: "text", options: [{ label: "文字", value: "text" }, { label: "数值（表中允许公式）", value: "number" }] },
    mode: { type: "enum", label: "抽取方式", default: "fixed", options: [{ label: "建立时洗牌，之后依次抽取", value: "fixed" }, { label: "每次从剩余项随机抽取（可读档重抽）", value: "remaining" }] },
    uniqueBy: { type: "enum", label: "相同内容处理", default: "value", options: [{ label: "合并相同结果（权重相加，保留首项ID）", value: "value" }, { label: "按行／数组位置区分（相同内容可再次出现）", value: "row" }] },
    outVar: { type: "variable", label: "初始池报告（JSON文本，可空）" },
    ...resultFields
  }, returns: { type: "number", label: "池内项目数量；失败-1" }, async run(ctx, p) {
    let release;
    const signal = ctx.flow?.signal;
    try {
      release = deckAcquire(this);
      outputs(ctx, p, "string");
      const key = deckKey(p.key), mode = p.mode ?? "fixed", valueType = p.valueType ?? "text";
      if (!["fixed", "remaining"].includes(mode))
        reject("抽取方式无效");
      const store = deckStore(this);
      if (store.records.some((d) => d.key === key))
        reject("同名抽取池已存在；继续抽取请用“从抽取池取出”，重开请先重置");
      const items = await deckCandidates(ctx, p);
      if (signal?.aborted)
        reject("运行已取消");
      const deck = { version: 1, key, mode, valueType, total: items.length, drawn: 0, items };
      encodeDecks([...store.records, deck]);
      if (mode === "fixed")
        deck.items = shuffle(items);
      const writes2 = p.outVar ? [[p.outVar, JSON.stringify(report(deck))]] : [];
      deckCommit(ctx, store, [...store.records, deck], writes2, p, signal);
      return deck.total;
    } catch (e) {
      if (!signal?.aborted)
        failed(ctx, p, "建立抽取池", e);
      return -1;
    } finally {
      release?.();
    }
  } });
  static deckDraw = replayMethod({ id: "deck-draw", title: "从抽取池取出", description: "跨多次调用持续不重复。抽出的项目从当前槽的池中移除；余量不足整批失败，不自动补回。返回结果JSON数组。", schema: {
    ...deckKeyField,
    count: { type: "number", label: "本次取出数量", default: 1, min: 1, max: 100, step: 1 },
    outVar: { type: "variable", label: "单项结果（文字／数值，与建池类型一致）", visibleWhen: { field: "count", equals: 1 } },
    prefix: { type: "string", label: "批量逐项前缀（可空，需预先声明 前缀_1…N）", default: "", suggestions: { key: "deck-output-prefix" } },
    reportVar: { type: "variable", label: "本次结果数组（JSON文本，可空）" },
    outIdVar: { type: "variable", label: "本次行ID数组（JSON文本，可空）" },
    remainingVar: { type: "variable", label: "剩余数量（数值，可空）" },
    ...resultFields
  }, returns: { type: "string", label: "结果JSON数组；失败空串" }, run(ctx, p) {
    let release;
    const signal = ctx.flow?.signal, count = p.count ?? 1;
    const names = Number.isInteger(count) && count > 1 && count <= 100 && p.prefix?.trim() ? Array.from({ length: count }, (_, i) => `${p.prefix.trim()}_${i + 1}`) : [];
    const output = { ...p, outVar: count === 1 ? p.outVar : void 0 };
    const extra = [p.reportVar, p.outIdVar, p.remainingVar, ...names].filter(Boolean);
    try {
      release = deckAcquire(this);
      const store = deckStore(this), key = deckKey(p.key), deck = store.records.find((d) => d.key === key);
      if (!deck)
        reject("抽取池不存在，请先建立");
      const type = deck.valueType === "number" ? "number" : "string";
      outputs(ctx, output, type, extra);
      compatible(ctx, p.reportVar, "string");
      compatible(ctx, p.outIdVar, "string");
      compatible(ctx, p.remainingVar, "number");
      for (const name of names) {
        if (ctx.variables.get(name) === void 0)
          reject(`请先声明批量变量「${name}」`);
        compatible(ctx, name, type);
      }
      if (signal?.aborted)
        reject("运行已取消");
      const { next, chosen } = take(deck, count), text2 = JSON.stringify(chosen.map((i) => i.value));
      const writes2 = names.map((name, i) => [name, chosen[i].value]);
      if (output.outVar)
        writes2.push([output.outVar, chosen[0].value]);
      if (p.reportVar)
        writes2.push([p.reportVar, text2]);
      if (p.outIdVar)
        writes2.push([p.outIdVar, JSON.stringify(chosen.map((i) => i.id))]);
      if (p.remainingVar)
        writes2.push([p.remainingVar, next.items.length]);
      deckCommit(ctx, store, store.records.map((d) => d.key === key ? next : d), writes2, output, signal);
      return text2;
    } catch (e) {
      if (!signal?.aborted)
        failed(ctx, output, "抽取池取出", e, extra);
      return "";
    } finally {
      release?.();
    }
  } });
  static deckPeek = replayMethod({ id: "deck-peek", title: "查看抽取池／剩余数组", description: "不抽取、不洗牌。返回总数、已抽数量、剩余数值／文字数组和ID数组。", schema: {
    ...deckKeyField,
    outVar: { type: "variable", label: "池报告（JSON文本，可空）" },
    arrayVar: { type: "variable", label: "仅剩余结果数组（JSON文本，可空）" },
    remainingVar: { type: "variable", label: "剩余数量（数值，可空）" },
    ...resultFields
  }, returns: { type: "string", label: "池报告JSON；失败空串" }, run(ctx, p) {
    try {
      if (deckBusy.has(this))
        reject("抽取池正在处理另一次调用");
      outputs(ctx, p, "string", [p.arrayVar, p.remainingVar].filter(Boolean));
      compatible(ctx, p.arrayVar, "string");
      compatible(ctx, p.remainingVar, "number");
      if (ctx.flow?.signal.aborted)
        reject("运行已取消");
      const key = deckKey(p.key), deck = deckStore(this).records.find((d) => d.key === key);
      if (!deck)
        reject("抽取池不存在，请先建立");
      const report2 = report(deck), text2 = JSON.stringify(report2), writes2 = [];
      if (p.outVar)
        writes2.push([p.outVar, text2]);
      if (p.arrayVar)
        writes2.push([p.arrayVar, JSON.stringify(report2.values)]);
      if (p.remainingVar)
        writes2.push([p.remainingVar, report2.remaining]);
      if (p.successVar)
        writes2.push([p.successVar, true]);
      if (p.errorVar)
        writes2.push([p.errorVar, ""]);
      writeAll(ctx, writes2);
      return text2;
    } catch (e) {
      if (!ctx.flow?.signal.aborted)
        failed(ctx, p, "查看抽取池", e, [p.arrayVar, p.remainingVar]);
      return "";
    }
  } });
  static deckReset = replayMethod({ id: "deck-reset", title: "重置／删除指定抽取池", description: "删除指定池记录；不清空已有结果变量。再次建立后开始新一轮。", schema: { ...deckKeyField, ...resultFields }, returns: { type: "boolean", label: "是否成功" }, run(ctx, p) {
    let release;
    try {
      release = deckAcquire(this);
      outputs(ctx, p, "string");
      const key = deckKey(p.key), store = deckStore(this);
      deckCommit(ctx, store, store.records.filter((d) => d.key !== key), [], p, ctx.flow?.signal);
      return true;
    } catch (e) {
      if (!ctx.flow?.signal.aborted)
        failed(ctx, p, "重置抽取池", e);
      return false;
    } finally {
      release?.();
    }
  } });
  static rand = replayMethod({ id: "rand", title: "随机数", description: "按指定精度等概率抽取。单次返回结果，批量返回数量。固定结果随存档保存。", schema: {
    mode: { type: "enum", label: "模式", required: true, default: "fresh", options: [{ label: "每次重抽", value: "fresh" }, { label: "首次抽取后固定（随存档）", value: "sticky" }] },
    min: { type: "number", label: "最小值", required: true, default: 0 },
    max: { type: "number", label: "最大值", required: true, default: 100 },
    digits: { type: "number", label: "小数位数（0=整数）", default: 0, min: 0, max: 6, step: 1 },
    includeMin: { type: "boolean", label: "包含最小端点", default: true },
    includeMax: { type: "boolean", label: "包含最大端点", default: true },
    count: { type: "number", label: "数量（大于1批量输出）", default: 1, min: 1, max: 100, step: 1 },
    outVar: { type: "variable", label: "单次结果变量", visibleWhen: { field: "count", equals: 1 } },
    prefix: { type: "string", label: "批量前缀（数量大于1时使用）", default: "", suggestions: { key: "number-output-prefix" } },
    reportVar: { type: "variable", label: "完整结果数组（JSON文本，可空）" },
    fixedKey: { type: "string", label: "固定记录名（空=结果变量或批量前缀）", default: "", visibleWhen: { field: "mode", equals: "sticky" }, suggestions: { key: "fixed-key" } },
    fixedPolicy: { type: "enum", label: "旧存档首次接入", default: "fresh", visibleWhen: { field: "mode", equals: "sticky" }, options: [{ label: "首次生成，忽略输出默认值", value: "fresh" }, { label: "采用完整的既有结果", value: "adopt" }] },
    ...resultFields
  }, returns: { type: "number", label: "单次值／批量数量；失败-1，配合成功状态" }, run(ctx, p) {
    const count = p.count ?? 1, names = count > 1 ? Number.isInteger(count) && count <= 100 && p.prefix?.trim() ? Array.from({ length: count }, (_, i) => `${p.prefix.trim()}_${i + 1}`) : [] : p.outVar ? [p.outVar] : [];
    try {
      outputs(ctx, { ...p, outVar: count === 1 ? p.outVar : void 0 }, "number", [...count > 1 ? names : [], p.reportVar].filter(Boolean));
      compatible(ctx, p.reportVar, "string");
      if (!Number.isInteger(count) || count < 1 || count > 100)
        reject("数量必须为1～100整数");
      if (count > 1 && !(p.prefix || "").trim() && !p.reportVar)
        reject("批量抽取需要前缀或JSON数组报告变量");
      if (count > 1)
        for (const name of names) {
          if (ctx.variables.get(name) === void 0)
            reject(`请先声明批量变量「${name}」`);
          compatible(ctx, name, "number");
        }
      const draw2 = sampler(p), mode = p.mode || "fresh";
      if (!["fresh", "sticky"].includes(mode))
        reject("未知随机模式");
      let values, store, next;
      if (mode === "sticky") {
        const key = p.fixedKey?.trim() || (count > 1 ? p.prefix?.trim() ? `batch:${p.prefix.trim()}` : `array:${p.reportVar || ""}` : `value:${p.outVar || ""}`);
        if (!p.fixedKey?.trim() && !names.length && !(count > 1 && p.reportVar))
          reject("固定随机需要记录名或结果变量");
        store = fixedState(this);
        const signature = JSON.stringify([draw2.lo, draw2.hi, draw2.scale, count]);
        const old = store.records.find((r) => r.key === key);
        if (old) {
          if (old.signature !== signature || old.values.length !== count || !old.values.every(draw2.valid))
            reject(`固定记录「${key}」配置已变或损坏，请重置`);
          values = old.values;
        } else {
          const policy = p.fixedPolicy || "fresh";
          if (!["fresh", "adopt"].includes(policy))
            reject("旧存档接入方式无效");
          if (policy === "adopt" && !names.length && count > 1 && p.reportVar) {
            const previous = ctx.variables.get(p.reportVar);
            if (typeof previous !== "string")
              reject("旧数组结果必须为JSON文本");
            const parsed = JSON.parse(previous);
            if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "number" && Number.isFinite(v)))
              reject("旧数组结果无效");
            values = parsed;
          } else
            values = policy === "adopt" ? names.map((n) => number(ctx.variables.get(n), `旧结果「${n}」`)) : Array.from({ length: count }, draw2.draw);
          if (values.length !== count || !values.every(draw2.valid))
            reject("既有结果不完整或不符合范围与精度");
          if (store.records.length >= 1e4)
            reject("固定记录超过10000条，请重置不用的记录");
          next = [...store.records, { key, signature, values }];
        }
      } else
        values = Array.from({ length: count }, draw2.draw);
      if (store && next)
        store.write(next);
      try {
        const writes2 = names.map((name, i) => [name, values[i]]);
        if (p.reportVar)
          writes2.push([p.reportVar, JSON.stringify(values)]);
        writeAll(ctx, writes2);
      } catch (e) {
        if (store && next)
          store.write(store.records);
        throw e;
      }
      status(ctx, p);
      return count === 1 ? values[0] : count;
    } catch (e) {
      failed(ctx, p, "随机数", e, [...names, p.reportVar]);
      return -1;
    }
  } });
  static resetFixed = replayMethod({ id: "reset-fixed", title: "重置固定随机", description: "移除指定固定记录，下次重抽；保留结果变量。", schema: {
    key: { type: "string", label: "记录名（默认单次 value:变量名；批量 batch:前缀）", required: true, default: "", suggestions: { key: "fixed-key" } },
    ...resultFields
  }, returns: { type: "boolean", label: "是否成功" }, run(ctx, p) {
    try {
      outputs(ctx, p, "number");
      const key = p.key.trim();
      if (!key)
        reject("记录名不能为空");
      const store = fixedState(this);
      store.write(store.records.filter((r) => r.key !== key));
      status(ctx, p);
      return true;
    } catch (e) {
      failed(ctx, p, "重置固定随机", e);
      return false;
    }
  } });
  static randPick = replayMethod({ id: "rand-pick", title: "列表随机（安科式）", description: "支持1～100次文字抽取。允许重复时每抽保持原概率；同批不重复按剩余行的原概率重新归一化。weight 填10%预留概率。", schema: {
    ...poolFields,
    ...drawFields,
    outVar: { type: "variable", label: "结果变量（单条文字／批量JSON文本，可空）" },
    outIdVar: { type: "variable", label: "行ID变量（单条ID／批量JSON文本，可空）" },
    prefix: { type: "string", label: "批量逐条输出前缀（可空，写入 前缀_1..N 文本变量）", default: "", suggestions: { key: "text-output-prefix" } },
    ...resultFields
  }, returns: { type: "string", label: "单条文字／批量JSON数组；失败空串，配合成功状态" }, async run(ctx, p) {
    const count = p.count ?? 1;
    const names = Number.isInteger(count) && count > 1 && count <= 100 && p.prefix?.trim() ? Array.from({ length: count }, (_, i) => `${p.prefix.trim()}_${i + 1}`) : [];
    try {
      outputs(ctx, p, "string", [p.outIdVar, ...names].filter(Boolean));
      compatible(ctx, p.outIdVar, "string");
      for (const name of names) {
        if (ctx.variables.get(name) === void 0)
          reject(`请先声明批量文本变量「${name}」`);
        compatible(ctx, name, "string");
      }
      const chosen = await drawPool(ctx, p);
      const value = count === 1 ? chosen[0].value : JSON.stringify(chosen.map((c) => c.value));
      const ids = count === 1 ? chosen[0].id : JSON.stringify(chosen.map((c) => c.id));
      const writes2 = names.map((name, i) => [name, chosen[i].value]);
      if (p.outVar)
        writes2.push([p.outVar, value]);
      if (p.outIdVar)
        writes2.push([p.outIdVar, ids]);
      writeAll(ctx, writes2);
      status(ctx, p);
      return value;
    } catch (e) {
      failed(ctx, p, "列表随机", e, [p.outIdVar, ...names]);
      return "";
    }
  } });
  static randPickNumber = replayMethod({ id: "rand-pick-number", title: "列表随机（数值／公式）", description: "按权重抽取数字或公式结果，支持整数与小数。批量结果写入前缀数值变量；可选重复规则。", schema: {
    ...poolFields,
    ...drawFields,
    outVar: { type: "variable", label: "单次数值结果变量", visibleWhen: { field: "count", equals: 1 } },
    prefix: { type: "string", label: "批量数值前缀（数量大于1时必填）", default: "", suggestions: { key: "number-output-prefix" } },
    reportVar: { type: "variable", label: "完整数值数组（JSON文本，可空）" },
    outIdVar: { type: "variable", label: "行ID变量（单条ID／批量JSON文本，可空）" },
    ...resultFields
  }, returns: { type: "number", label: "单次数值／批量数量；失败-1，配合成功状态" }, async run(ctx, p) {
    const count = p.count ?? 1;
    const names = Number.isInteger(count) && count > 1 && count <= 100 && p.prefix?.trim() ? Array.from({ length: count }, (_, i) => `${p.prefix.trim()}_${i + 1}`) : [];
    const output = { ...p, outVar: count === 1 ? p.outVar : void 0 };
    try {
      outputs(ctx, output, "number", [p.reportVar, p.outIdVar, ...names].filter(Boolean));
      compatible(ctx, p.reportVar, "string");
      compatible(ctx, p.outIdVar, "string");
      if (count > 1 && !p.prefix?.trim())
        reject("数值批量抽取需要前缀");
      for (const name of names) {
        if (ctx.variables.get(name) === void 0)
          reject(`请先声明批量数值变量「${name}」`);
        compatible(ctx, name, "number");
      }
      const chosen = await drawPool(ctx, p, true), values = chosen.map((c) => c.numberValue);
      const writes2 = names.map((name, i) => [name, values[i]]);
      if (output.outVar)
        writes2.push([output.outVar, values[0]]);
      if (p.reportVar)
        writes2.push([p.reportVar, JSON.stringify(values)]);
      if (p.outIdVar)
        writes2.push([p.outIdVar, count === 1 ? chosen[0].id : JSON.stringify(chosen.map((c) => c.id))]);
      writeAll(ctx, writes2);
      status(ctx, output);
      return count === 1 ? values[0] : count;
    } catch (e) {
      failed(ctx, output, "数值列表随机", e, [p.reportVar, p.outIdVar, ...names]);
      return -1;
    }
  } });
  static previewPool = replayMethod({ id: "preview-pool", title: "检查候选池与概率", description: "检查固定概率与当前动态权重的分配，不抽取；返回JSON文本报告。", schema: { ...poolFields, outVar: { type: "variable", label: "报告变量（文本，可空）" }, ...resultFields }, returns: { type: "string", label: "概率报告JSON" }, async run(ctx, p) {
    try {
      outputs(ctx, p, "string");
      const text2 = JSON.stringify(await poolReport(ctx, p));
      if (p.outVar)
        ctx.variables.set(p.outVar, text2);
      status(ctx, p);
      return text2;
    } catch (e) {
      failed(ctx, p, "候选池检查", e);
      return "";
    }
  } });
  static calc = replayMethod({ id: "calc", title: "计算", description: "有限数值计算／无副作用的表函数。失败保留结果，成功状态=false。", schema: {
    op: { type: "enum", label: "运算", required: true, default: "add", options: [{ label: "加 +", value: "add" }, { label: "减 −", value: "sub" }, { label: "乘 ×", value: "mul" }, { label: "除 ÷", value: "div" }, { label: "幂", value: "pow" }, { label: "开方", value: "root" }, { label: "向下取整", value: "floor" }, { label: "四舍五入", value: "round" }, { label: "自定义函数", value: "func" }] },
    a: { type: "number", label: "a（基础运算）", default: 0 },
    b: { type: "number", label: "b（双目运算）", default: 1 },
    funcName: { type: "string", label: "函数名", default: "", visibleWhen: { field: "op", equals: "func" }, suggestions: { key: "function" } },
    x: { type: "number", label: "x", default: 0, visibleWhen: { field: "op", equals: "func" } },
    y: { type: "number", label: "y", default: 0, visibleWhen: { field: "op", equals: "func" } },
    z: { type: "number", label: "z", default: 0, visibleWhen: { field: "op", equals: "func" } },
    w: { type: "number", label: "w", default: 0, visibleWhen: { field: "op", equals: "func" } },
    outVar: { type: "variable", label: "结果变量（可空，仅返回）" },
    ...resultFields
  }, returns: { type: "number", label: "计算结果；失败-1，配合成功状态" }, async run(ctx, p) {
    try {
      outputs(ctx, p, "number");
      let result2;
      if (p.op === "func") {
        const evaluate = await functionLibrary(ctx), name = (p.funcName || "").trim();
        if (!/^[A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5]*$/.test(name))
          reject("函数名无效");
        result2 = evaluate(`${name}(x,y,z,w)`, [p.x ?? 0, p.y ?? 0, p.z ?? 0, p.w ?? 0].map((v) => number(v, "函数参数")));
      } else {
        const a = number(p.a ?? 0, "a"), b = number(p.b ?? 1, "b");
        switch (p.op) {
          case "add":
            result2 = a + b;
            break;
          case "sub":
            result2 = a - b;
            break;
          case "mul":
            result2 = a * b;
            break;
          case "div":
            if (b === 0)
              reject("除零");
            result2 = a / b;
            break;
          case "pow":
            result2 = Math.pow(a, b);
            break;
          case "root":
            result2 = Math.sqrt(a);
            break;
          case "floor":
            result2 = Math.floor(a);
            break;
          case "round":
            result2 = Math.round(a);
            break;
          default:
            return reject("未知计算操作");
        }
      }
      checked(result2);
      if (p.outVar)
        ctx.variables.set(p.outVar, result2);
      status(ctx, p);
      return result2;
    } catch (e) {
      failed(ctx, p, "计算", e);
      return -1;
    }
  } });
};

// dist/math-enhancement.js
var enhancedOperations = [
  ["expr", "直接公式"],
  ["ceil", "向上取整"],
  ["trunc", "去掉小数（向零取整）"],
  ["round-digits", "四舍五入到指定小数位"],
  ["abs", "绝对值"],
  ["remainder", "求余数（保留被除数符号）"],
  ["mod", "循环取模（非负结果）"],
  ["min", "取较小值"],
  ["max", "取较大值"],
  ["clamp", "限制在指定范围"]
];
var isEnhancedCalculation = (op) => enhancedOperations.some(([id2]) => id2 === op);
var finite = (value, label) => {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${label}必须是有限数值`);
  return value;
};
function roundDigits(value, digits) {
  finite(value, "数值");
  if (!Number.isInteger(digits) || digits < 0 || digits > 6)
    throw new Error("小数位数必须为0～6整数");
  const [mantissa, exp = "0"] = Math.abs(value).toString().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const coefficient = BigInt(whole + fraction);
  const shift = Number(exp) - fraction.length + digits;
  let scaled;
  if (shift >= 0)
    scaled = coefficient * 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    scaled = coefficient / divisor;
    if (coefficient % divisor * 2n >= divisor)
      scaled += 1n;
  }
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("数值与小数位数组合超出安全精度");
  const result2 = (value < 0 ? -Number(scaled) : Number(scaled)) / 10 ** digits;
  return result2 === 0 ? 0 : checked(result2);
}
function extendedFunction(name, args) {
  const arities = { ceil: 1, trunc: 1, abs: 1, roundDigits: 2, remainder: 2, mod: 2 };
  if (!Object.hasOwn(arities, name))
    throw new Error(`直接公式不支持函数「${name}」；表函数请使用自定义函数操作`);
  if (args.length !== arities[name])
    throw new Error(`函数 ${name} 需要 ${arities[name]} 个参数，收到 ${args.length}`);
  const [a, b] = args;
  args.forEach((value) => finite(value, "函数参数"));
  switch (name) {
    case "ceil":
      return Math.ceil(a);
    case "trunc":
      return Math.trunc(a);
    case "abs":
      return Math.abs(a);
    case "roundDigits":
      return roundDigits(a, b);
    case "remainder":
      if (b === 0)
        throw new Error("余数的除数不能为0");
      return a % b;
    case "mod": {
      if (b <= 0)
        throw new Error("循环取模的模数必须大于0");
      const remainder = a % b;
      const result2 = remainder < 0 ? remainder + b : remainder;
      return result2 === b || result2 === 0 ? 0 : result2;
    }
    default:
      throw new Error("未知计算函数");
  }
}
function evaluateFormula(source, variable) {
  const tokens = tokenize(source);
  if (tokens.some((t) => t.t === "id" && ["x", "y", "z", "w"].includes(t.v)))
    throw new Error('直接公式请用 var("变量名") 读取变量；x/y/z/w用于函数规则表');
  return checked(compileExpr(source)({
    x: 0,
    y: 0,
    z: 0,
    w: 0,
    v: (name) => finite(variable(name), `变量「${name}」`),
    f: extendedFunction
  }));
}
function evaluateCalculation(ctx, p) {
  const op = String(p.op);
  const input = (key, label) => {
    const raw = p[`${op}__${key}`];
    if (typeof raw === "number")
      return finite(raw, label);
    if (typeof raw !== "string" || !raw.trim())
      throw new Error(`${label}不能为空`);
    return evaluateFormula(raw, (name) => ctx.variables.get(name));
  };
  let result2;
  switch (op) {
    case "expr":
      result2 = input("expression", "公式");
      break;
    case "ceil":
    case "trunc":
    case "abs":
      result2 = extendedFunction(op, [input("value", "数值")]);
      break;
    case "round-digits":
      result2 = roundDigits(input("value", "数值"), input("digits", "小数位数"));
      break;
    case "remainder":
    case "mod":
      result2 = extendedFunction(op, [input("a", "被除数"), input("b", "除数／模数")]);
      break;
    case "min":
      result2 = Math.min(input("a", "第一个数"), input("b", "第二个数"));
      break;
    case "max":
      result2 = Math.max(input("a", "第一个数"), input("b", "第二个数"));
      break;
    case "clamp": {
      const value = input("value", "数值"), lo = input("min", "下限"), hi = input("max", "上限");
      if (lo > hi)
        throw new Error("范围下限不能大于上限");
      result2 = Math.min(hi, Math.max(lo, value));
      break;
    }
    default:
      throw new Error("未知计算操作");
  }
  return result2 === 0 ? 0 : checked(result2);
}
function buildCalcSchema(base) {
  if (!base)
    throw new Error("计算参数定义缺失");
  const schema = { ...base };
  if (base.op.type !== "enum")
    throw new Error("计算操作需要枚举参数");
  schema.op = { ...base.op, options: [...base.op.options, ...enhancedOperations.map(([value, label]) => ({ value, label }))] };
  schema.a = { ...base.a, visibleWhen: { field: "op", equals: "add" } };
  schema.b = { ...base.b, visibleWhen: { field: "op", equals: "add" } };
  for (const op of ["sub", "mul", "div", "pow", "root", "floor", "round"]) {
    schema[`${op}A`] = { type: "number", label: "a", visibleWhen: { field: "op", equals: op } };
    if (["sub", "mul", "div", "pow"].includes(op))
      schema[`${op}B`] = { type: "number", label: "b", visibleWhen: { field: "op", equals: op } };
  }
  const field = (op, key, label, defaultValue) => {
    schema[`${op}__${key}`] = { type: "string", label, default: defaultValue, required: true, visibleWhen: { field: "op", equals: op } };
  };
  field("expr", "expression", '公式（如 var("攻击") * 0.8 + 10）', "0");
  for (const op of ["ceil", "trunc", "abs", "round-digits", "clamp"])
    field(op, "value", "数值／变量公式", "0");
  field("round-digits", "digits", "保留小数位数（0～6，可填变量公式）", "2");
  for (const op of ["remainder", "mod", "min", "max"]) {
    field(op, "a", op === "min" || op === "max" ? "第一个数／变量公式" : "被除数／变量公式", "0");
    field(op, "b", op === "mod" ? "正模数／变量公式" : op === "remainder" ? "非零除数／变量公式" : "第二个数／变量公式", "1");
  }
  field("clamp", "min", "下限／变量公式", "0");
  field("clamp", "max", "上限／变量公式", "100");
  return schema;
}

// dist/pool-model.js
var PoolError = class extends Error {
  code;
  constructor(code, message2) {
    super(message2);
    this.code = code;
    this.name = "PoolError";
  }
};
function fail(code, text2) {
  throw new PoolError(code, text2);
}
var clone = (v) => JSON.parse(JSON.stringify(v));
var blankStore = () => ({ schemaVersion: 3, pools: [], receipts: [], pendingChoices: [], nextToken: 1, tombstones: [] });
function id(v, label = "ID") {
  if (typeof v !== "string" || !v.trim() || v.trim().length > 128)
    fail("INVALID_ID", `${label}需要1～128个字符`);
  return v.trim();
}
function finite2(v, label) {
  if (typeof v !== "number" || !Number.isFinite(v))
    fail("INVALID_NUMBER", `${label}必须是有限数值`);
  return v;
}
function integer(v, label, max = 1e4) {
  const n = finite2(v, label);
  if (!Number.isSafeInteger(n) || n < 0 || n > max)
    fail("INVALID_QUANTITY", `${label}必须是0～${max}整数`);
  return n;
}
function numeric(v, read) {
  return typeof v === "number" ? finite2(v, "数值") : compileExpr(v)({ x: 0, y: 0, z: 0, w: 0, v: read });
}
function allows(condition, read) {
  if (!condition)
    return true;
  const v = read(condition);
  if (typeof v !== "boolean")
    fail("INVALID_CONDITION", `条件变量「${condition}」缺失或不是布尔值`);
  return v;
}
function payload(raw) {
  if (raw === void 0 || raw === "")
    return void 0;
  const v = typeof raw === "string" ? JSON.parse(raw) : clone(raw);
  const text2 = JSON.stringify(v);
  if (!text2 || text2.length > 8192)
    fail("INVALID_DATA", "附加数据超过8192字符或不是JSON");
  return v;
}
function candidate(raw, kind) {
  if (raw.enabled !== void 0 && typeof raw.enabled !== "boolean")
    fail("INVALID_VALUE", "启用状态必须是布尔值");
  if (raw.condition !== void 0 && typeof raw.condition !== "string")
    fail("INVALID_CONDITION", "条件必须是布尔变量名文本");
  const quantity = integer(raw.quantity ?? raw.initial ?? 1, "初始份数");
  const value = raw.value ?? raw.label ?? "";
  if (typeof value !== "string" && typeof value !== "number")
    fail("INVALID_VALUE", "候选结果需要文字或数值");
  const rate = raw.rate ?? 1;
  if (typeof rate !== "string" && typeof rate !== "number")
    fail("INVALID_RATE", "权重或基础百分比类型错误");
  const data = payload(raw.data);
  return { id: id(raw.id, "候选ID"), label: String(raw.label ?? value), value, rate, enabled: raw.enabled !== false, condition: String(raw.condition ?? "").trim(), initial: kind === "without" ? quantity : 0, remaining: kind === "without" ? quantity : 0, reserved: 0, ...data === void 0 ? {} : { data } };
}
function configuredPool(raw, rows2, seed2 = 1) {
  const kind = raw.kind ?? "with";
  if (kind !== "with" && kind !== "without")
    fail("INVALID_KIND", "池类型无效");
  const pool = { id: id(raw.id, "池ID"), name: String(raw.name || raw.id), kind, valueType: raw.valueType ?? "text", probability: raw.probability ?? "weight", quantityWeight: raw.quantityWeight ?? "candidate", random: raw.random || (kind === "without" ? "fixed" : "fresh"), seed: seed2 >>> 0, cursor: 0, revision: 0, items: rows2.map((r) => candidate(r, kind)) };
  pool.configSource = raw.configSource ?? "settings";
  const definition = JSON.stringify([pool.id, pool.name, pool.kind, pool.valueType, pool.probability, pool.quantityWeight, pool.random, pool.items]);
  let fingerprint = 2166136261;
  for (let i = 0; i < definition.length; i++)
    fingerprint = Math.imul(fingerprint ^ definition.charCodeAt(i), 16777619);
  pool.configVersion = `cfg1-${(fingerprint >>> 0).toString(16).padStart(8, "0")}`;
  validatePool(pool);
  return pool;
}
function validatePool(p) {
  id(p.id, "池ID");
  if (p.configVersion !== void 0 && (!/^cfg1-[0-9a-f]{8}$/.test(p.configVersion) || typeof p.configVersion !== "string") || p.configSource !== void 0 && !["settings", "array", "table", "legacy"].includes(p.configSource))
    fail("CORRUPT_STATE", "配置来源记录损坏");
  if (!["with", "without"].includes(p.kind) || !["text", "number"].includes(p.valueType) || !["weight", "percent"].includes(p.probability) || !["candidate", "unit"].includes(p.quantityWeight) || !["fresh", "fixed"].includes(p.random))
    fail("CORRUPT_STATE", "池配置无效");
  if (!Array.isArray(p.items) || p.items.length > 1e4 || new Set(p.items.map((x) => x.id)).size !== p.items.length)
    fail("CORRUPT_STATE", "候选重复或超过10000项");
  integer(p.seed, "随机状态", 4294967295);
  integer(p.cursor, "随机进度", Number.MAX_SAFE_INTEGER);
  integer(p.revision, "池修订", Number.MAX_SAFE_INTEGER);
  for (const c of p.items) {
    id(c.id, "候选ID");
    if (typeof c.label !== "string" || !["string", "number"].includes(typeof c.value) || !["string", "number"].includes(typeof c.rate) || typeof c.enabled !== "boolean" || typeof c.condition !== "string")
      fail("CORRUPT_STATE", "候选字段损坏");
    if (typeof c.value === "number")
      finite2(c.value, "候选值");
    if (typeof c.rate === "number")
      finite2(c.rate, "候选权重");
    integer(c.initial, "初始份数");
    integer(c.remaining, "剩余份数");
    integer(c.reserved, "占用份数");
    if (c.reserved > c.remaining)
      fail("CORRUPT_STATE", "占用超过剩余份数");
    if (p.kind === "with" && (c.remaining !== 0 || c.reserved !== 0 || c.initial !== 0))
      fail("CORRUPT_STATE", "放回池不记录份数");
    if (c.data !== void 0)
      payload(c.data);
  }
  if (p.legacy) {
    if (!["fixed", "remaining"].includes(p.legacy.mode) || !Array.isArray(p.legacy.order) || new Set(p.legacy.order).size !== p.legacy.order.length || p.legacy.order.some((x) => !p.items.some((c) => c.id === x)))
      fail("CORRUPT_STATE", "旧池顺序损坏");
    integer(p.legacy.total, "旧池总量");
    integer(p.legacy.drawn, "旧池已抽");
  }
}
function validateStore(s) {
  if (!s || s.schemaVersion !== 3 || !Array.isArray(s.pools) || s.pools.length > 100 || !Array.isArray(s.receipts) || s.receipts.length > 1e4 || !Array.isArray(s.pendingChoices) || s.pendingChoices.length > 100 || !Array.isArray(s.tombstones))
    fail("CORRUPT_STATE", "池存档格式损坏或版本不支持");
  if (new Set(s.pools.map((p) => p.id)).size !== s.pools.length || new Set(s.receipts.map((r) => r.id)).size !== s.receipts.length || new Set(s.pendingChoices.map((p) => p.key)).size !== s.pendingChoices.length)
    fail("CORRUPT_STATE", "池、凭证或待选键重复");
  integer(s.nextToken, "凭证序号", Number.MAX_SAFE_INTEGER);
  if (s.tombstones.length > 1e4 || new Set(s.tombstones).size !== s.tombstones.length)
    fail("CORRUPT_STATE", "已删除池记录错误");
  s.tombstones.forEach((x) => id(x));
  s.pools.forEach(validatePool);
  if (s.pools.reduce((n, p) => n + p.items.length, 0) > 2e4)
    fail("LIMIT", "存档候选总数超过20000");
  const reserved = /* @__PURE__ */ new Map();
  for (const r of s.receipts) {
    id(r.id, "凭证ID");
    id(r.poolId, "凭证池");
    if (!["pending", "confirmed", "cancelled"].includes(r.state) || !Array.isArray(r.items) || !r.items.length || r.items.length > 100)
      fail("CORRUPT_STATE", "凭证格式错误");
    for (const item of r.items) {
      id(item.id);
      integer(item.quantity, "凭证数量", 100);
      if (!item.quantity || typeof item.label !== "string" || !["string", "number"].includes(typeof item.value))
        fail("CORRUPT_STATE", "凭证结果错误");
      if (r.state === "pending") {
        const k = JSON.stringify([r.poolId, item.id]);
        reserved.set(k, (reserved.get(k) || 0) + item.quantity);
      }
    }
    if (r.state === "pending" && !s.pools.some((p) => p.id === r.poolId))
      fail("CORRUPT_STATE", "占用池缺失");
  }
  for (const p of s.pools)
    for (const c of p.items) {
      const k = JSON.stringify([p.id, c.id]);
      if ((reserved.get(k) || 0) !== c.reserved)
        fail("CORRUPT_STATE", "凭证与占用数量不一致");
      reserved.delete(k);
    }
  if (reserved.size)
    fail("CORRUPT_STATE", "凭证候选缺失");
  for (const pending of s.pendingChoices) {
    id(pending.key);
    if (pending.requestId !== void 0)
      id(pending.requestId, "待选请求ID");
    if (!s.pools.some((p) => p.id === pending.poolId) || !Array.isArray(pending.ids) || pending.ids.some((x) => typeof x !== "string") || !["immediate", "deferred"].includes(pending.consumption))
      fail("CORRUPT_STATE", "待选状态损坏");
  }
}
function decode(raw) {
  if (raw === void 0 || raw === null || raw === "")
    return blankStore();
  if (typeof raw !== "string" || raw.length > 4e6)
    fail("CORRUPT_STATE", "池存档不是有效JSON文本");
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    fail("CORRUPT_STATE", "池存档JSON损坏");
  }
  validateStore(s);
  return s;
}
function encode(s) {
  validateStore(s);
  const text2 = JSON.stringify(s);
  if (text2.length > 4e6)
    fail("LIMIT", "池存档超过400万字符");
  return text2;
}
function rates(p, read) {
  const values = p.items.map((c) => {
    const n = numeric(c.rate, read);
    if (n < 0 || p.probability === "percent" && n > 100)
      fail("INVALID_RATE", `候选「${c.id}」权重或基础百分比无效`);
    return n;
  });
  if (p.probability === "percent" && p.items.length && Math.abs(values.reduce((a, b) => a + b, 0) - 100) > 1e-8)
    fail("INVALID_PERCENT", "基础百分比合计必须为100%");
  return values;
}
function distribution(p, read) {
  const base = rates(p, read);
  const rows2 = p.items.map((c, i) => {
    const available = p.kind === "without" ? c.remaining - c.reserved : null;
    const reason = !c.enabled ? "disabled" : !allows(c.condition, read) ? "condition" : available === 0 ? "exhausted" : base[i] === 0 ? "zero-rate" : "";
    const weight = reason ? 0 : base[i] * (p.kind === "without" && p.quantityWeight === "unit" ? available : 1);
    if (!Number.isFinite(weight))
      fail("INVALID_RATE", "权重乘份数溢出");
    return { id: c.id, label: c.label, base: base[i], remaining: p.kind === "without" ? c.remaining : null, reserved: c.reserved, available, reason, weight, probability: 0 };
  });
  const max = Math.max(0, ...rows2.map((r) => r.weight));
  const total = max ? rows2.reduce((n, r) => n + r.weight / max, 0) : 0;
  rows2.forEach((r) => r.probability = total ? r.weight / max / total : 0);
  return rows2;
}
function counts(p) {
  return { remaining: p.kind === "without" ? p.items.reduce((n, c) => n + c.remaining, 0) : null, reserved: p.items.reduce((n, c) => n + c.reserved, 0), available: p.kind === "without" ? p.items.reduce((n, c) => n + c.remaining - c.reserved, 0) : null };
}
function result(p, items = [], receiptId = "") {
  return { schemaVersion: 1, status: "ok", poolId: p.id, items, receiptId, ...counts(p), errorCode: "", message: "" };
}
function emptyResult(poolId = "", status2 = "ok", message2 = "", errorCode = "") {
  return { schemaVersion: 1, status: status2, poolId, items: [], receiptId: "", remaining: null, reserved: 0, available: null, errorCode, message: message2 };
}
function inspect(p, read) {
  return { ...result(p), details: { name: p.name, kind: p.kind, probability: p.probability, quantityWeight: p.quantityWeight, random: p.random, cursor: p.cursor, revision: p.revision, configVersion: p.configVersion ?? "UNKNOWN", configSource: p.configSource ?? "UNKNOWN", candidates: distribution(p, read), ...p.legacy ? { legacyHistory: "unknown", legacyOrder: p.legacy.order } : {} } };
}
function random(p, source) {
  let n;
  if (p.random === "fixed") {
    let t = p.seed = p.seed + 1831565813 >>> 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    n = ((t ^ t >>> 14) >>> 0) / 4294967296;
  } else
    n = source();
  if (!Number.isFinite(n) || n < 0 || n >= 1)
    fail("RANDOM", "随机源超出[0,1)");
  p.cursor++;
  return n;
}
function selected(p, c, read) {
  return { id: c.id, label: c.label, value: p.valueType === "number" ? numeric(c.value, read) : String(c.value), quantity: 1, ...c.data === void 0 ? {} : { data: clone(c.data) } };
}
function consume(s, p, items, consumption2) {
  if (p.kind === "with")
    return "";
  for (const item of items) {
    const c = p.items.find((c2) => c2.id === item.id);
    if (c.remaining - c.reserved < item.quantity)
      fail("INSUFFICIENT", "可用份数不足");
    if (consumption2 === "deferred")
      c.reserved += item.quantity;
    else
      c.remaining -= item.quantity;
  }
  if (p.legacy && consumption2 === "immediate")
    p.legacy.drawn += items.length;
  if (consumption2 === "immediate")
    return "";
  if (s.receipts.length >= 1e4)
    fail("LIMIT", "抽取凭证达到10000条");
  const rid = `r${s.nextToken++}`;
  s.receipts.push({ id: rid, poolId: p.id, state: "pending", items: clone(items) });
  return rid;
}
function draw(s, p, count, read, consumption2 = "immediate", source = Math.random) {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    fail("INVALID_COUNT", "抽取数量必须为1～100");
  if (!["immediate", "deferred"].includes(consumption2))
    fail("INVALID_CONSUMPTION", "消耗时机无效");
  const initial2 = distribution(p, read), active = initial2.filter((r) => r.probability > 0);
  if (!active.length)
    fail("EMPTY_POOL", "没有符合条件且可抽取的候选");
  if (p.kind === "without" && active.reduce((n, r) => n + r.available, 0) < count)
    fail("INSUFFICIENT", "可用份数不足，本批未抽取");
  const activeIds = new Set(active.map((c) => c.id));
  const resolved = new Map(p.items.filter((c) => activeIds.has(c.id)).map((c) => [c.id, selected(p, c, read)]));
  const chosen = [];
  for (let i = 0; i < count; i++) {
    const rows2 = distribution(p, read).filter((r) => r.probability > 0);
    let chosenId;
    if (p.legacy?.mode === "fixed") {
      chosenId = p.legacy.order.find((k) => rows2.some((r) => r.id === k)) || fail("EMPTY_POOL", "旧固定顺序中没有可抽取项目");
    } else {
      let roll = random(p, source);
      chosenId = rows2[rows2.length - 1].id;
      for (const r of rows2) {
        roll -= r.probability;
        if (roll < 0) {
          chosenId = r.id;
          break;
        }
      }
    }
    chosen.push(clone(resolved.get(chosenId)));
    if (p.kind === "without")
      p.items.find((c) => c.id === chosenId).reserved++;
  }
  if (p.kind === "without")
    for (const item of chosen)
      p.items.find((c) => c.id === item.id).reserved--;
  const rid = consume(s, p, chosen, consumption2);
  p.revision++;
  return result(p, chosen, rid);
}
function choiceIds(p, read) {
  return p.items.filter((c) => c.enabled && allows(c.condition, read) && (p.kind === "with" || c.remaining > c.reserved)).map((c) => c.id);
}
function choose(s, p, candidateId, read, consumption2) {
  if (!["immediate", "deferred"].includes(consumption2))
    fail("INVALID_CONSUMPTION", "消耗时机无效");
  const valid = choiceIds(p, read).includes(candidateId);
  if (!valid)
    fail("STALE_CHOICE", "选项已不可用，请重新展示");
  const item = selected(p, p.items.find((c) => c.id === candidateId), read);
  const rid = consume(s, p, [item], consumption2);
  p.revision++;
  return result(p, [item], rid);
}
function settle(s, receiptId, action) {
  const r = s.receipts.find((r2) => r2.id === receiptId);
  if (!r)
    fail("MISSING_RECEIPT", "未找到抽取凭证");
  const p = s.pools.find((p2) => p2.id === r.poolId);
  if (!p)
    fail("MISSING_POOL", "凭证所属池不存在");
  const target2 = action === "confirm" ? "confirmed" : "cancelled";
  if (r.state === target2)
    return { ...result(p, r.items, r.id), message: "该凭证已经处理，本次未重复扣除" };
  if (r.state !== "pending")
    fail("SETTLED_RECEIPT", "该凭证已经以另一方式结束");
  for (const item of r.items) {
    const c = p.items.find((c2) => c2.id === item.id);
    if (!c || c.reserved < item.quantity)
      fail("CORRUPT_STATE", "占用候选或份数不一致");
    c.reserved -= item.quantity;
    if (action === "confirm")
      c.remaining -= item.quantity;
  }
  if (p.legacy && action === "confirm")
    p.legacy.drawn += r.items.length;
  r.state = target2;
  p.revision++;
  return result(p, r.items, r.id);
}
function adjust(p, changes, read) {
  if (!changes.length || changes.length > 100)
    fail("INVALID_BATCH", "批量调整需要1～100项");
  const percent = /* @__PURE__ */ new Map();
  let percentageMembership = false, applied = 0;
  for (const change of changes) {
    if (!allows(change.when || "", read))
      continue;
    applied++;
    const cid = change.candidateIdVar ? id(read(change.candidateIdVar), "变量中的候选ID") : id(change.candidateId, "候选ID");
    const c = p.items.find((c2) => c2.id === cid);
    if (change.op === "add") {
      if (c)
        fail("DUPLICATE", "候选ID已存在");
      const added = candidate({ ...change, id: cid }, p.kind);
      allows(added.condition, read);
      p.items.push(added);
      if (p.probability === "percent")
        percent.set(cid, numeric(added.rate, read));
      continue;
    }
    if (!c)
      fail("MISSING_CANDIDATE", `候选「${cid}」不存在`);
    switch (change.op) {
      case "remove":
        if (c.reserved)
          fail("RESERVED", "候选仍有占用份数");
        p.items = p.items.filter((x) => x.id !== cid);
        if (p.legacy)
          p.legacy.order = p.legacy.order.filter((k) => k !== cid);
        percent.delete(cid);
        percentageMembership = true;
        break;
      case "enable":
        c.enabled = true;
        break;
      case "disable":
        c.enabled = false;
        break;
      case "set-rate":
      case "add-rate": {
        if (p.probability !== "weight")
          fail("WRONG_PROBABILITY", "百分比池请使用调整基础百分比");
        c.rate = change.op === "set-rate" ? change.amount ?? 0 : numeric(c.rate, read) + numeric(change.amount ?? 0, read);
        if (numeric(c.rate, read) < 0)
          fail("INVALID_RATE", "权重不能为负");
        break;
      }
      case "set-percent":
        if (p.probability !== "percent")
          fail("WRONG_PROBABILITY", "权重池请使用调整权重");
        percent.set(cid, numeric(change.amount ?? 0, read));
        break;
      case "set-quantity":
      case "add-quantity": {
        if (p.kind !== "without")
          fail("WRONG_KIND", "放回池没有份数");
        const n = integer(change.op === "set-quantity" ? numeric(change.amount ?? 0, read) : c.remaining + numeric(change.amount ?? 0, read), "剩余份数");
        if (n < c.reserved)
          fail("RESERVED", "剩余份数不能少于占用");
        c.remaining = n;
        break;
      }
      case "set-condition":
        c.condition = String(change.condition || "").trim();
        allows(c.condition, read);
        break;
      case "set-content":
        if (change.value === void 0)
          fail("INVALID_VALUE", "结果内容未填写");
        c.value = change.value;
        if (change.label !== void 0)
          c.label = change.label;
        break;
      default:
        fail("INVALID_OPERATION", `未知调整操作「${change.op}」`);
    }
  }
  if (p.probability === "percent" && (percent.size || percentageMembership)) {
    let specified = 0;
    for (const [key, value] of percent) {
      if (value < 0 || value > 100)
        fail("INVALID_PERCENT", "基础百分比必须在0～100之间");
      specified += value;
      p.items.find((c) => c.id === key).rate = value;
    }
    if (specified > 100 + 1e-8)
      fail("INVALID_PERCENT", "指定百分比合计超过100%");
    const rest = p.items.filter((c) => !percent.has(c.id));
    const total = rest.reduce((n, c) => n + numeric(c.rate, read), 0);
    const left = Math.max(0, 100 - specified);
    if (p.items.length && left > 1e-8 && (!rest.length || total <= 0))
      fail("INVALID_PERCENT", "剩余百分比没有正比例候选可以分配");
    for (const c of rest)
      c.rate = total ? left * numeric(c.rate, read) / total : 0;
  }
  if (applied && p.legacy) {
    p.legacy.mode = "remaining";
    p.legacy.order = p.items.map((c) => c.id);
  }
  validatePool(p);
  rates(p, read);
  if (applied)
    p.revision++;
  return { ...inspect(p, read), status: applied ? "ok" : "skipped" };
}

// dist/pool-runtime.js
var FIELD = "poolStateV3";
var busy = /* @__PURE__ */ new WeakSet();
var activeChoices = /* @__PURE__ */ new WeakMap();
function lockKey(ctx) {
  return ctx.variables;
}
function lock(ctx) {
  const key = lockKey(ctx);
  if (busy.has(key))
    fail("BUSY", "抽取池正在处理另一次调用");
  busy.add(key);
  return () => busy.delete(key);
}
function snapshotRead(ctx) {
  const cache = /* @__PURE__ */ new Map();
  return (name) => {
    if (!cache.has(name))
      cache.set(name, ctx.variables.get(name));
    return cache.get(name);
  };
}
function configuration(ctx, key) {
  const value = ctx.settings?.get(key) ?? [];
  if (!Array.isArray(value))
    fail("INVALID_CONFIG", `${key}不是列表`);
  return value;
}
function configurationIssues(ctx) {
  const issues = [], pools = configuration(ctx, "pools"), rows2 = configuration(ctx, "candidates"), ids = /* @__PURE__ */ new Set(), candidates = /* @__PURE__ */ new Set();
  if (pools.length > 100)
    issues.push("池目录超过100个");
  for (const [index, p] of pools.entries()) {
    if (!p || typeof p.id !== "string" || !p.id.trim() || p.id.length > 128 || p.id !== p.id.trim()) {
      issues.push(`池目录第${index + 1}行：稳定ID为空、过长或带首尾空格`);
      continue;
    }
    if (ids.has(p.id))
      issues.push(`池目录：稳定ID「${p.id}」重复`);
    ids.add(p.id);
  }
  for (const [index, c] of rows2.entries()) {
    if (!c || typeof c.id !== "string" || !c.id.trim() || c.id.length > 128 || c.id !== c.id.trim()) {
      issues.push(`候选目录第${index + 1}行：稳定ID为空、过长或带首尾空格`);
      continue;
    }
    if (typeof c.poolId !== "string" || !ids.has(c.poolId))
      issues.push(`候选「${c.id}」（第${index + 1}行）引用了不存在的池「${String(c.poolId ?? "")}」`);
    const key = JSON.stringify([c.poolId, c.id]);
    if (candidates.has(key))
      issues.push(`池「${String(c.poolId)}」中的候选ID「${c.id}」重复`);
    candidates.add(key);
  }
  return issues;
}
function initial(ctx, poolId, read) {
  const issues = configurationIssues(ctx);
  if (issues.length)
    fail("INVALID_CONFIG", issues.join("；"));
  const pools = configuration(ctx, "pools");
  const spec = pools.find((p2) => p2.id === poolId);
  if (!spec)
    fail("MISSING_POOL", `池「${poolId}」未配置`);
  const rows2 = configuration(ctx, "candidates").filter((c) => c.poolId === poolId);
  const p = configuredPool(spec, rows2);
  rates(p, read);
  return p;
}
function seed() {
  const n = Math.random();
  if (!Number.isFinite(n) || n < 0 || n >= 1)
    fail("RANDOM", "初始化随机源无效");
  return Math.floor(n * 4294967296);
}
function legacySeed(text2) {
  let h = 2166136261;
  for (let i = 0; i < text2.length; i++)
    h = Math.imul(h ^ text2.charCodeAt(i), 16777619);
  return h >>> 0;
}
function lift(d) {
  const p = configuredPool({ id: d.key, name: d.key, kind: "without", configSource: "legacy", valueType: d.valueType, random: d.mode === "fixed" ? "fixed" : "fresh" }, d.items.map((c) => ({ id: c.id, label: String(c.value), value: c.value, rate: c.weight, quantity: 1 })), legacySeed(JSON.stringify(d)));
  p.legacy = { mode: d.mode, total: d.total, drawn: d.drawn, history: "unknown", order: d.items.map((c) => c.id) };
  return p;
}
function ensure(owner, ctx, s, poolId, read) {
  let pool = s.pools.find((p) => p.id === poolId);
  if (pool)
    return pool;
  if (s.tombstones.includes(poolId))
    fail("DELETED_POOL", "该池已显式删除，需要初始化后再使用");
  const old = parseDecks(owner.save.get("drawDecks")).find((d) => d.key === poolId);
  pool = old ? lift(old) : initial(ctx, poolId, read);
  if (!old)
    pool.seed = seed();
  s.pools.push(pool);
  return pool;
}
var text = (v) => typeof v === "string" ? v.trim() : "";
function parameters(input) {
  const p = { ...input }, prefix = `${text(input.action)}__`;
  for (const [k, v] of Object.entries(input))
    if (k.startsWith(prefix) && v !== void 0)
      p[k.slice(prefix.length)] = v;
  return p;
}
function writes(ctx, p, r) {
  const out = [];
  const put = (field, value) => {
    const name = text(p[field]);
    if (name && value !== void 0)
      out.push([name, value]);
  };
  if (r.status === "ok") {
    if (r.items.length === 1) {
      put("outVar", r.items[0].value);
      put("idVar", r.items[0].id);
    }
    put("valuesVar", JSON.stringify(r.items.map((c) => c.value)));
    put("idsVar", JSON.stringify(r.items.map((c) => c.id)));
    put("receiptVar", r.receiptId);
    if (r.remaining !== null)
      put("remainingVar", r.remaining);
    if (r.available !== null)
      put("availableVar", r.available);
    const prefix = text(p.prefix);
    if (prefix)
      r.items.forEach((item, i) => out.push([`${prefix}_${i + 1}`, item.value]));
  } else if (r.status === "empty") {
    put("valuesVar", "[]");
    put("idsVar", "[]");
    put("receiptVar", "");
  }
  put("reportVar", JSON.stringify(r));
  put("statusVar", r.status);
  put("successVar", r.status === "ok" || r.status === "skipped");
  put("errorVar", r.status === "error" || r.status === "empty" ? r.message : "");
  if (new Set(out.map((w) => w[0])).size !== out.length)
    fail("OUTPUT_COLLISION", "结果、报告和状态不能写到同一变量");
  for (const [name, value] of out) {
    const old = ctx.variables.get(name);
    if (old === void 0 || old === null)
      fail("MISSING_VARIABLE", `请先声明输出变量「${name}」`);
    if (typeof old !== typeof value)
      fail("OUTPUT_TYPE", `输出变量「${name}」类型应为${typeof value}`);
  }
  return out;
}
function applyWrites(ctx, out) {
  const previous = out.map(([name]) => ctx.variables.get(name));
  let done = 0;
  const undo = () => {
    for (let i = done - 1; i >= 0; i--)
      ctx.variables.set(out[i][0], previous[i]);
  };
  try {
    for (; done < out.length; done++)
      ctx.variables.set(...out[done]);
  } catch (e) {
    undo();
    throw e;
  }
  return undo;
}
function commit(owner, ctx, before, s, p, r, signal, extra) {
  const encoded = encode(s), out = writes(ctx, p, r);
  if (signal?.aborted)
    fail("CANCELLED", "运行已取消");
  if (owner.save.get(FIELD) !== before)
    fail("CONFLICT", "存档状态已改变，本次操作未提交");
  let undo;
  let extraDone = false;
  try {
    owner.save.set(FIELD, encoded);
    if (extra) {
      owner.save.set(extra.key, extra.value);
      extraDone = true;
    }
    undo = applyWrites(ctx, out);
    if (signal?.aborted)
      fail("CANCELLED", "运行已取消");
  } catch (e) {
    undo?.();
    if (extra && extraDone)
      owner.save.set(extra.key, extra.before);
    owner.save.set(FIELD, before ?? "");
    throw e;
  }
}
function outputOnly(ctx, p, r) {
  applyWrites(ctx, writes(ctx, p, r));
}
function failure(ctx, p, e) {
  const code = e instanceof PoolError ? e.code : "INVALID_INPUT";
  const message2 = e instanceof Error ? e.message : String(e);
  const r = emptyResult(text(p.poolId), code === "EMPTY_POOL" ? "empty" : "error", message2, code);
  const protectedNames = new Set(["outVar", "idVar", "valuesVar", "idsVar", "receiptVar", "remainingVar", "availableVar"].map((k) => text(p[k])).filter(Boolean));
  const used = /* @__PURE__ */ new Set();
  const safe = {};
  for (const k of ["reportVar", "statusVar", "successVar", "errorVar"]) {
    const v = text(p[k]);
    if (v && !protectedNames.has(v) && !used.has(v)) {
      safe[k] = v;
      used.add(v);
    }
  }
  try {
    outputOnly(ctx, safe, r);
  } catch {
  }
  console.warn(`[random-math] ${code}: ${message2}`);
  return r;
}
function checkOutputs(ctx, p, pool, count) {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    fail("INVALID_COUNT", "抽取数量必须为1～100");
  const sample = result(pool, Array.from({ length: count }, () => ({ id: "check", label: "check", value: pool.valueType === "number" ? 0 : "", quantity: 1 })));
  writes(ctx, p, sample);
}
function getChange(p) {
  return { op: text(p.action), candidateId: text(p.candidateId), candidateIdVar: text(p.candidateIdVar), amount: p.amount ?? 0, value: p.value, label: p.label === void 0 ? void 0 : String(p.label), condition: text(p.condition), quantity: p.quantity === void 0 ? void 0 : Number(p.quantity), rate: p.rate ?? 1, data: p.data, when: text(p.when) };
}
async function runAction(owner, ctx, input, type) {
  const p = parameters(input), signal = ctx.flow?.signal;
  let release;
  try {
    release = lock(ctx);
    if (signal?.aborted)
      fail("CANCELLED", "运行已取消");
    const read = snapshotRead(ctx);
    const before = owner.save.get(FIELD), s = decode(before);
    const action = text(p.action) || (type === "update" ? "inspect" : "draw");
    if (type === "update" && !allows(text(p.when), read)) {
      const r2 = emptyResult(text(p.poolId), "skipped", "执行条件未满足");
      outputOnly(ctx, p, r2);
      return r2;
    }
    if (type === "without" && (action === "confirm" || action === "cancel")) {
      const r2 = settle(s, id(p.receiptId, "抽取凭证"), action);
      commit(owner, ctx, before, s, p, r2, signal);
      return r2;
    }
    const poolId = id(p.poolId, "池ID");
    if (type === "update" && action === "inspect") {
      const pool2 = s.pools.find((p2) => p2.id === poolId) ?? parseDecks(owner.save.get("drawDecks")).filter((d) => d.key === poolId).map(lift)[0] ?? initial(ctx, poolId, read);
      const r2 = inspect(pool2, read);
      r2.details = { ...r2.details, initialized: s.pools.some((p2) => p2.id === poolId) || parseDecks(owner.save.get("drawDecks")).some((d) => d.key === poolId) };
      outputOnly(ctx, p, r2);
      return r2;
    }
    if (type === "update" && ["initialize", "import-array", "import-table", "reset", "delete"].includes(action)) {
      const initializing = ["initialize", "import-array", "import-table"].includes(action);
      if (initializing && !s.pools.some((p2) => p2.id === poolId)) {
        const legacy2 = parseDecks(owner.save.get("drawDecks")).find((d) => d.key === poolId);
        if (legacy2)
          s.pools.push(lift(legacy2));
      }
      const old = s.pools.find((p2) => p2.id === poolId);
      if (!initializing && old?.items.some((c) => c.reserved))
        fail("RESERVED", "池还有未处理的占用凭证");
      if (initializing && old) {
        const r3 = inspect(old, read);
        commit(owner, ctx, before, s, p, r3, signal);
        return r3;
      }
      if (action === "reset" || action === "delete") {
        s.pools = s.pools.filter((p2) => p2.id !== poolId);
        s.pendingChoices = s.pendingChoices.filter((p2) => p2.poolId !== poolId);
      }
      let r2;
      if (action === "delete") {
        if (!s.tombstones.includes(poolId))
          s.tombstones.push(poolId);
        r2 = emptyResult(poolId);
      } else {
        s.tombstones = s.tombstones.filter((x) => x !== poolId);
        let pool2;
        if (action === "import-array" || text(p.source) === "array") {
          const raw2 = JSON.parse(String(p.arrayJson || "[]"));
          if (!Array.isArray(raw2) || raw2.length > 1e4)
            fail("INVALID_ARRAY", "初始化需要不超过10000项的JSON数组");
          const items = raw2.map((v, i) => typeof v === "object" && v !== null ? { ...v, id: v.id || `array:${i + 1}` } : { id: `array:${i + 1}`, value: v, label: String(v), quantity: 1 });
          pool2 = configuredPool({ id: poolId, kind: p.kind || "without", configSource: "array", valueType: p.valueType || "text", random: p.random || "fixed", probability: p.probability || "weight", quantityWeight: p.quantityWeight || "candidate" }, items);
        } else if (action === "import-table" || text(p.source) === "table") {
          const report2 = await poolReport(ctx, { pool: text(p.tablePool), poolScope: "named", field: text(p.field) || "label" });
          pool2 = configuredPool({ id: poolId, kind: p.kind || "without", configSource: "table", valueType: p.valueType || "text", random: p.random || "fixed" }, report2.candidates.map((c, i) => ({ id: c.id || `row:${i + 1}`, value: c.value, label: c.value, rate: c.probability, quantity: 1 })));
        } else
          pool2 = initial(ctx, poolId, read);
        rates(pool2, read);
        pool2.seed = seed();
        s.pools.push(pool2);
        r2 = inspect(pool2, read);
      }
      const raw = owner.save.get("drawDecks");
      const next = parseDecks(raw).filter((d) => d.key !== poolId).map((d) => JSON.stringify(d));
      commit(owner, ctx, before, s, p, r2, signal, { key: "drawDecks", before: raw ?? [], value: next });
      return r2;
    }
    if (type === "without" && action === "batch") {
      const raw = JSON.parse(String(p.arrayJson || "[]"));
      if (!Array.isArray(raw))
        fail("INVALID_ARRAY", "本次批量来源需要JSON数组");
      const pool2 = configuredPool({ id: poolId, kind: "without", valueType: p.valueType || "text", random: "fresh" }, raw.map((v, i) => typeof v === "object" && v !== null ? { ...v, id: v.id || `array:${i + 1}` } : { id: `array:${i + 1}`, value: v, label: String(v), quantity: 1 }));
      checkOutputs(ctx, p, pool2, Number(p.count ?? 1));
      const r2 = draw(blankStore(), pool2, Number(p.count ?? 1), read, "immediate");
      if (signal?.aborted)
        fail("CANCELLED", "运行已取消");
      outputOnly(ctx, p, r2);
      return r2;
    }
    const changes = type === "update" ? action === "batch-adjust" ? configuration(ctx, "adjustments").filter((row) => row.batchId === text(p.batchId)).map((row) => ({ ...row, op: row.op })) : [getChange(p)] : [];
    if (type === "update") {
      if (!changes.length || changes.length > 100)
        fail("INVALID_BATCH", "批量调整需要1～100项");
      if (!changes.some((c) => allows(c.when || "", read))) {
        const r2 = emptyResult(poolId, "skipped", "本组执行条件均未满足");
        outputOnly(ctx, p, r2);
        return r2;
      }
    }
    const pool = ensure(owner, ctx, s, poolId, read);
    let r;
    if (type === "update") {
      r = adjust(pool, changes, read);
    } else {
      if (pool.kind !== type)
        fail("WRONG_KIND", `池类型与${type === "with" ? "放回" : "不放回"}入口不符`);
      checkOutputs(ctx, p, pool, Number(p.count ?? 1));
      r = draw(s, pool, Number(p.count ?? 1), read, p.consumption || "immediate");
    }
    commit(owner, ctx, before, s, p, r, signal);
    return r;
  } catch (e) {
    if (signal?.aborted)
      return emptyResult(text(p.poolId), "skipped", "运行已取消", "CANCELLED");
    return failure(ctx, p, e);
  } finally {
    release?.();
  }
}
async function showChoices(owner, ctx, input, resumeOnly = false) {
  const p = parameters(input), signal = ctx.flow?.signal, key = text(p.requestKey) || text(p.poolId);
  let release, opened = false, done = false, accepting = false;
  const identity = lockKey(ctx);
  const existing = activeChoices.get(identity) ?? /* @__PURE__ */ new Set();
  if (existing.size) {
    failure(ctx, p, new PoolError("BUSY", "已有玩家选项正在展示"));
    return;
  }
  existing.add(key);
  activeChoices.set(identity, existing);
  const outputsContext = Object.fromEntries(["outVar", "idVar", "valuesVar", "idsVar", "prefix", "receiptVar", "reportVar", "statusVar", "successVar", "errorVar", "remainingVar", "availableVar"].map((k) => [k, p[k]]));
  try {
    if (!ctx.system?.invoke || !ctx.system?.close)
      fail("UNSUPPORTED_HOST", "宿主缺少Choice系统插槽接口");
    release = lock(ctx);
    if (signal?.aborted)
      fail("CANCELLED", "运行已取消");
    const before = owner.save.get(FIELD), s = decode(before);
    let pending = s.pendingChoices.find((x) => x.key === key);
    if (resumeOnly && !pending)
      return;
    const poolId = pending?.poolId || id(p.poolId, "池ID"), read = snapshotRead(ctx), pool = ensure(owner, ctx, s, poolId, read);
    checkOutputs(ctx, p, pool, 1);
    let ids = choiceIds(pool, read);
    if (pending)
      ids = pending.ids.filter((k) => ids.includes(k));
    if (!ids.length) {
      s.pendingChoices = s.pendingChoices.filter((x) => x.key !== key);
      const r = emptyResult(poolId, "empty", "没有符合条件的玩家选项", "EMPTY_POOL");
      commit(owner, ctx, before, s, p, r, signal);
      return;
    }
    if (!pending) {
      pending = { key: id(key, "选项请求名"), requestId: `q${s.nextToken++}`, poolId, ids, revision: pool.revision, consumption: p.consumption || "immediate" };
      s.pendingChoices.push(pending);
    }
    commit(owner, ctx, before, s, {}, result(pool), signal);
    release();
    release = void 0;
    ctx.dialogue?.setSkipMode?.(false);
    ctx.dialogue?.setAutoMode?.(false);
    const pendingSnapshot = clone(pending);
    const choices = ids.map((candidateId, originalIndex) => ({ originalIndex, text: pool.items.find((c) => c.id === candidateId).label, enabled: true }));
    const abort = () => {
      void ctx.system.close("internal.system.choice");
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      opened = true;
      accepting = true;
      await ctx.system.invoke("internal.system.choice", { branchId: `mixing-entropy.random-math:${key}`, choices, onSelect: async (index) => {
        if (!accepting || done || signal?.aborted)
          return;
        if (!Number.isInteger(index) || index < 0 || index >= ids.length) {
          failure(ctx, p, new PoolError("INVALID_CHOICE", "界面返回了无效选项序号"));
          return;
        }
        let unlock;
        try {
          unlock = lock(ctx);
          const prior = owner.save.get(FIELD), next = decode(prior), request = next.pendingChoices.find((x) => x.key === key);
          if (!request || JSON.stringify(request) !== JSON.stringify(pendingSnapshot))
            fail("STALE_CHOICE", "待选请求已改变，请重新展示");
          const current = next.pools.find((x) => x.id === poolId);
          if (!current)
            fail("MISSING_POOL", "选项池不存在");
          const r = choose(next, current, ids[index], snapshotRead(ctx), request.consumption);
          next.pendingChoices = next.pendingChoices.filter((x) => x.key !== key);
          commit(owner, ctx, prior, next, outputsContext, r, signal);
          done = true;
        } catch (e) {
          if (!signal?.aborted)
            failure(ctx, p, e);
          done = true;
          const prior = owner.save.get(FIELD), next = decode(prior);
          next.pendingChoices = next.pendingChoices.filter((x) => x.key !== key);
          if (!signal?.aborted)
            commit(owner, ctx, prior, next, {}, emptyResult(poolId), signal);
        } finally {
          unlock?.();
          if (!signal?.aborted)
            await ctx.system.close("internal.system.choice");
        }
      } }, { modal: true });
    } finally {
      accepting = false;
      signal?.removeEventListener("abort", abort);
    }
    if (!done && !signal?.aborted) {
      const before2 = owner.save.get(FIELD), s2 = decode(before2);
      s2.pendingChoices = s2.pendingChoices.filter((x) => x.key !== key);
      commit(owner, ctx, before2, s2, p, emptyResult(poolId, "skipped", "玩家未选择，未消耗份数"), signal);
    }
  } catch (e) {
    if (!signal?.aborted)
      failure(ctx, p, e);
  } finally {
    accepting = false;
    release?.();
    existing.delete(key);
    if (!existing.size)
      activeChoices.delete(identity);
    if (opened && !signal?.aborted)
      await ctx.system.close("internal.system.choice");
  }
}
function readInspection(owner, ctx, poolId) {
  try {
    const s = decode(owner.save.get(FIELD)), read = snapshotRead(ctx), issues = configurationIssues(ctx);
    if (issues.length)
      fail("INVALID_CONFIG", issues.join("；"));
    const pool = s.pools.find((p) => p.id === poolId) ?? parseDecks(owner.save.get("drawDecks")).filter((d) => d.key === poolId).map(lift)[0] ?? initial(ctx, poolId, read);
    return inspect(pool, read);
  } catch (e) {
    return emptyResult(poolId, "error", e instanceof Error ? e.message : String(e), e instanceof PoolError ? e.code : "INVALID_INPUT");
  }
}
async function legacyDeck(owner, ctx, p, name, original) {
  const s = decode(owner.save.get(FIELD)), key = text(p.key), pool = s.pools.find((p2) => p2.id === key);
  if (!pool) {
    const value = await original(owner);
    if (name === "create" && typeof value === "number" && value >= 0 && s.tombstones.includes(key)) {
      s.tombstones = s.tombstones.filter((x) => x !== key);
      owner.save.set(FIELD, encode(s));
    }
    return value;
  }
  const fallback = name === "create" ? -1 : name === "reset" ? false : "";
  let release;
  try {
    release = lock(ctx);
    const before = owner.save.get(FIELD), state = decode(before), current = state.pools.find((x) => x.id === key);
    let r, ret, out = { successVar: p.successVar, errorVar: p.errorVar };
    if (name === "create")
      fail("DUPLICATE", "同名抽取池已存在；请先重置");
    if (name === "draw") {
      if (current.kind !== "without")
        fail("WRONG_KIND", "旧取出调用需要不放回池");
      r = draw(state, current, Number(p.count ?? 1), snapshotRead(ctx), "immediate");
      ret = JSON.stringify(r.items.map((x) => x.value));
      out = { ...out, outVar: Number(p.count ?? 1) === 1 ? p.outVar : void 0, valuesVar: p.reportVar, idsVar: p.outIdVar, remainingVar: p.remainingVar, prefix: Number(p.count ?? 1) > 1 ? p.prefix : void 0 };
    } else if (name === "peek") {
      if (current.items.reduce((n, c) => n + c.remaining - c.reserved, 0) > 1e4)
        fail("LIMIT", "旧数组报告最多10000项，请改用新版状态报告");
      const values = current.items.flatMap((c) => Array.from({ length: c.remaining - c.reserved }, () => c.value));
      const ids = current.items.flatMap((c) => Array.from({ length: c.remaining - c.reserved }, () => c.id));
      const report2 = { key, mode: current.legacy?.mode || (current.random === "fixed" ? "fixed" : "remaining"), valueType: current.valueType, total: current.legacy?.total ?? current.items.reduce((n, c) => n + c.initial, 0), drawn: current.legacy?.drawn ?? current.items.reduce((n, c) => n + c.initial - c.remaining, 0), remaining: values.length, values, ids };
      ret = JSON.stringify(report2);
      const w = [];
      if (text(p.outVar))
        w.push([text(p.outVar), ret]);
      if (text(p.arrayVar))
        w.push([text(p.arrayVar), JSON.stringify(values)]);
      if (text(p.remainingVar))
        w.push([text(p.remainingVar), values.length]);
      const statusWrites = writes(ctx, out, result(current));
      const all = [...w, ...statusWrites];
      if (new Set(all.map((x) => x[0])).size !== all.length)
        fail("OUTPUT_COLLISION", "旧报告变量冲突");
      for (const [n, v] of all) {
        const prior = ctx.variables.get(n);
        if (prior !== void 0 && typeof prior !== typeof v)
          fail("OUTPUT_TYPE", "旧报告输出类型错误");
      }
      applyWrites(ctx, all);
      return ret;
    } else if (name === "reset") {
      if (current.items.some((c) => c.reserved))
        fail("RESERVED", "池还有未处理的占用");
      state.pools = state.pools.filter((x) => x.id !== key);
      state.pendingChoices = state.pendingChoices.filter((x) => x.poolId !== key);
      if (!state.tombstones.includes(key))
        state.tombstones.push(key);
      r = emptyResult(key);
      ret = true;
    } else
      fail("INVALID_OPERATION", "未知旧池调用");
    const raw = owner.save.get("drawDecks"), legacy2 = parseDecks(raw).filter((d) => d.key !== key).map((d) => JSON.stringify(d));
    commit(owner, ctx, before, state, out, r, ctx.flow?.signal, { key: "drawDecks", before: raw ?? [], value: legacy2 });
    return ret;
  } catch (e) {
    const failureParams = {
      poolId: key,
      successVar: p.successVar,
      errorVar: p.errorVar,
      outVar: name === "draw" && Number(p.count ?? 1) !== 1 ? void 0 : p.outVar,
      valuesVar: name === "draw" ? p.reportVar : p.arrayVar,
      idsVar: p.outIdVar,
      remainingVar: p.remainingVar
    };
    failure(ctx, failureParams, e);
    return fallback;
  } finally {
    release?.();
  }
}

// dist/pool-inspector.js
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
function PoolInspector({ owner }) {
  const ctx = useExtensionContext();
  const [pool, setPool] = useState("");
  const [report2, setReport] = useState(null);
  let choiceBinding = "UNKNOWN";
  try {
    choiceBinding = ctx.system?.getBinding?.("internal.system.choice") || "宿主默认／未返回绑定";
  } catch {
  }
  return _jsxs("section", { style: { padding: 24, fontFamily: "system-ui", lineHeight: 1.7, color: "var(--text-primary, #ddd)" }, children: [_jsx("h2", { children: "抽取池检查" }), _jsx("p", { children: "只读查看当前状态与概率；未初始化时检查创作配置。不会抽取、建池或改变随机进度。" }), _jsx("p", { children: "配置顺序：池目录 → 候选目录（填写所属池ID） → 剧情入口。已有存档中的池需用剧情调整或明确重置，修改作者配置不会直接覆盖它。" }), _jsxs("details", { children: [_jsx("summary", { children: "玩家选项界面与显示排查" }), _jsxs("p", { children: ["当前 Choice 绑定：", _jsx("code", { children: choiceBinding }), "。本插件使用此绑定，不替换项目界面。长文本或大量选项需检查滚动与按钮高度；兼容说明见随包 docs/CHOICE-UI-COMPATIBILITY.md。"] })] }), _jsxs("label", { children: ["池ID ", _jsx("input", { value: pool, onChange: (e) => setPool(e.target.value) })] }), " ", _jsx("button", { onClick: () => owner && setReport(readInspection(owner, ctx, pool)), children: "检查" }), report2 && _jsxs(_Fragment, { children: [_jsx("p", { role: "status", children: report2.status === "error" ? report2.message : `剩余：${report2.remaining ?? "不限制"}　占用：${report2.reserved}　可用：${report2.available ?? "不限制"}` }), report2.details?.candidates && _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsx("tr", { children: ["候选", "基础值", "实际概率", "可用份数", "未参与原因"].map((x) => _jsx("th", { style: { textAlign: "left", padding: 6 }, children: x }, x)) }) }), _jsx("tbody", { children: report2.details.candidates.map((c) => _jsxs("tr", { children: [_jsxs("td", { children: [c.label, "（", c.id, "）"] }), _jsx("td", { children: c.base }), _jsxs("td", { children: [(c.probability * 100).toFixed(3), "%"] }), _jsx("td", { children: c.available ?? "不限制" }), _jsx("td", { children: { disabled: "已停用", condition: "条件未满足", exhausted: "无可用份数", "zero-rate": "权重为零" }[c.reason] || "参与" })] }, c.id)) })] }), _jsxs("details", { children: [_jsx("summary", { children: "完整报告" }), _jsx("pre", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" }, children: JSON.stringify(report2, null, 2) })] })] })] });
}

// dist/random-form.js
var legacy = LegacyMath.rand.schema;
var presets = {
  "single-fresh": { label: "单个随机数 · 每次重抽", batch: false, fixed: false },
  "batch-fresh": { label: "批量随机数 · 每次重抽", batch: true, fixed: false },
  "single-fixed": { label: "单个随机数 · 首次抽取后固定", batch: false, fixed: true },
  "batch-fixed": { label: "批量随机数 · 首次抽取后固定", batch: true, fixed: true }
};
var fieldsFor = (batch, fixed) => [
  "min",
  "max",
  "digits",
  "includeMin",
  "includeMax",
  ...batch ? ["count", "prefix"] : ["outVar"],
  "reportVar",
  ...fixed ? ["fixedKey", "fixedPolicy"] : []
];
var randSchema = {
  action: { type: "enum", label: "执行什么", default: "generate", options: [
    ...Object.entries(presets).map(([value, p]) => ({ value, label: p.label })),
    { value: "generate", label: "完整参数（兼容既有调用）" },
    { value: "reset", label: "清除指定固定记录" }
  ] }
};
for (const [key, field] of Object.entries(legacy)) {
  randSchema[key] = ["successVar", "errorVar"].includes(key) ? field : { ...field, visibleWhen: { field: "action", equals: "generate" } };
}
for (const [action, preset] of Object.entries(presets)) {
  for (const key of fieldsFor(preset.batch, preset.fixed)) {
    const field = key === "count" ? { type: "number", label: "批量数量", default: 2, min: 2, max: 100, step: 1 } : legacy[key];
    randSchema[`${action}__${key}`] = {
      ...field,
      visibleWhen: { field: "action", equals: action }
    };
  }
}
randSchema.resetKey = { type: "string", label: "要清除的固定记录名", default: "", visibleWhen: { field: "action", equals: "reset" } };
function randomParams(p) {
  const action = String(p.action ?? "generate");
  const preset = presets[action];
  if (!preset)
    return p;
  const result2 = {
    mode: preset.fixed ? "sticky" : "fresh",
    count: preset.batch ? 2 : 1,
    successVar: p.successVar,
    errorVar: p.errorVar
  };
  for (const key of fieldsFor(preset.batch, preset.fixed)) {
    const field = randSchema[`${action}__${key}`];
    const value = p[`${action}__${key}`] ?? ("default" in field ? field.default : void 0);
    if (value !== void 0)
      result2[key] = value;
  }
  return result2;
}

// dist/index.js
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
  function accept(f) {
    if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
    return f;
  }
  var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
  var target2 = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
  var descriptor = descriptorIn || (target2 ? Object.getOwnPropertyDescriptor(target2, contextIn.name) : {});
  var _, done = false;
  for (var i = decorators.length - 1; i >= 0; i--) {
    var context = {};
    for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
    for (var p in contextIn.access) context.access[p] = contextIn.access[p];
    context.addInitializer = function(f) {
      if (done) throw new TypeError("Cannot add initializers after decoration has completed");
      extraInitializers.push(accept(f || null));
    };
    var result2 = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
    if (kind === "accessor") {
      if (result2 === void 0) continue;
      if (result2 === null || typeof result2 !== "object") throw new TypeError("Object expected");
      if (_ = accept(result2.get)) descriptor.get = _;
      if (_ = accept(result2.set)) descriptor.set = _;
      if (_ = accept(result2.init)) initializers.unshift(_);
    } else if (_ = accept(result2)) {
      if (kind === "field") initializers.unshift(_);
      else descriptor[key] = _;
    }
  }
  if (target2) Object.defineProperty(target2, contextIn.name, descriptor);
  done = true;
};
var __runInitializers = function(thisArg, initializers, value) {
  var useValue = arguments.length > 2;
  for (var i = 0; i < initializers.length; i++) {
    value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
  }
  return useValue ? value : void 0;
};
var feedbackVisibility = { field: "showAdvancedFeedback", equals: true };
var common = {
  showAdvancedFeedback: { type: "boolean", label: "高级设置：执行反馈（可选）", default: false },
  reportVar: { type: "variable", label: "完整报告（文本，可空）", visibleWhen: feedbackVisibility },
  statusVar: { type: "variable", label: "结果状态 ok/skipped/empty/error（文本，可空）", visibleWhen: feedbackVisibility },
  successVar: { type: "variable", label: "成功状态（布尔，可空）", visibleWhen: feedbackVisibility },
  errorVar: { type: "variable", label: "错误说明（文本，可空）", visibleWhen: feedbackVisibility }
};
var resultFields2 = { outVar: { type: "variable", label: "单项结果（与池结果类型一致，可空）" }, idVar: { type: "variable", label: "单项候选ID（文本，可空）" }, valuesVar: { type: "variable", label: "结果数组JSON（文本，可空）" }, idsVar: { type: "variable", label: "候选ID数组JSON（文本，可空）" }, prefix: { type: "string", label: "逐项输出前缀（可空，预先声明 前缀_1…N）", default: "" }, receiptVar: { type: "variable", label: "占用凭证（文本，延后消耗时填写）" }, remainingVar: { type: "variable", label: "剩余份数（数值，可空）" }, availableVar: { type: "variable", label: "可用份数（数值，可空）" } };
var poolField = { poolId: { type: "string", label: "目标池ID（见扩展设置的池目录）", required: true, suggestions: { key: "v3-pool" } } };
var drawFields2 = { ...poolField, count: { type: "number", label: "抽取数量", default: 1, min: 1, max: 100, step: 1 }, ...resultFields2 };
var { receiptVar: unusedReceipt, remainingVar: unusedRemaining, availableVar: unusedAvailable, ...replacementFields } = drawFields2;
var { receiptVar: batchReceipt, ...temporaryResults } = resultFields2;
var consumption = { consumption: { type: "enum", label: "消耗时机", default: "immediate", options: [{ label: "立即消耗", value: "immediate" }, { label: "先占用，完成后确认", value: "deferred" }] } };
var fieldString = (label, defaultValue = "") => ({ type: "string", label, default: defaultValue });
function operationSchema(operations, first, shared = {}) {
  const schema = { action: { type: "enum", label: "执行什么", default: first, options: Object.entries(operations).map(([value, x]) => ({ label: x.label, value })) }, ...shared };
  for (const [action, { fields }] of Object.entries(operations))
    for (const [key, field] of Object.entries(fields))
      schema[`${action}__${key}`] = { ...field, visibleWhen: { field: "action", equals: action } };
  return { ...schema, ...common };
}
var drawWithoutSchema = operationSchema({ draw: { label: "从池中抽取", fields: { ...drawFields2, ...consumption } }, batch: { label: "仅本次批量不放回（JSON数组）", fields: { poolId: { ...poolField.poolId, label: "本次操作名称" }, arrayJson: { ...fieldString("JSON数组", "[]"), multiline: true }, valueType: { type: "enum", label: "结果类型", default: "text", options: [{ label: "文字", value: "text" }, { label: "数值或公式", value: "number" }] }, count: drawFields2.count, ...temporaryResults } }, confirm: { label: "确认消耗", fields: { receiptId: fieldString("抽取凭证"), ...resultFields2 } }, cancel: { label: "取消占用", fields: { receiptId: fieldString("抽取凭证"), ...resultFields2 } } }, "draw");
var target = { candidateId: { ...fieldString("目标候选ID"), suggestions: { key: "v3-candidate" } } };
var amount = { ...target, amount: fieldString('数值／变量表达式（如 var("好感度")）', "0") };
var importFields = { kind: { type: "enum", label: "导入池类型", default: "without", options: [{ label: "放回", value: "with" }, { label: "不放回", value: "without" }] }, valueType: { type: "enum", label: "导入结果类型", default: "text", options: [{ label: "文字", value: "text" }, { label: "数值或公式", value: "number" }] }, random: { type: "enum", label: "导入随机策略", default: "fixed", options: [{ label: "同一进度固定", value: "fixed" }, { label: "允许读档重抽", value: "fresh" }] } };
var updateSchema = operationSchema({
  initialize: { label: "从配置初始化池（已存在时保留）", fields: {} },
  "import-array": { label: "从JSON数组初始化（已存在时保留）", fields: { arrayJson: { ...fieldString("JSON数组", "[]"), multiline: true }, ...importFields } },
  "import-table": { label: "从旧候选表初始化快照（已存在时保留）", fields: { tablePool: fieldString("旧表池名"), field: fieldString("结果列", "label"), ...importFields } },
  reset: { label: "重置为当前创作配置", fields: {} },
  delete: { label: "删除池", fields: {} },
  add: { label: "新增候选", fields: { ...target, label: fieldString("显示文字"), value: fieldString("结果内容（数值池可填公式）"), rate: fieldString('权重／基础百分比（可填 var("好感度")）', "1"), quantity: { type: "number", label: "初始份数（不放回池）", default: 1, min: 0, max: 1e4, step: 1 }, condition: fieldString("参与条件的布尔变量名（空=始终）"), data: { ...fieldString("附加JSON数据（可空）"), multiline: true } } },
  remove: { label: "移除候选", fields: target },
  enable: { label: "启用候选", fields: target },
  disable: { label: "停用候选", fields: target },
  "set-rate": { label: "设置权重", fields: amount },
  "add-rate": { label: "增减权重", fields: amount },
  "set-percent": { label: "设置基础百分比（其他候选按比例分配）", fields: amount },
  "set-quantity": { label: "设置剩余份数", fields: amount },
  "add-quantity": { label: "增减剩余份数", fields: amount },
  "set-condition": { label: "修改参与条件", fields: { ...target, condition: fieldString("布尔变量名（空=始终）") } },
  "set-content": { label: "修改显示和结果内容", fields: { ...target, label: fieldString("显示文字"), value: fieldString("结果内容") } },
  "batch-adjust": { label: "执行一组批量调整", fields: { batchId: fieldString("批量调整组ID") } },
  inspect: { label: "读取状态和概率报告", fields: { remainingVar: resultFields2.remainingVar, availableVar: resultFields2.availableVar } }
}, "inspect", { ...poolField, when: { type: "variable", label: "仅当此布尔变量为真时执行（可空）" } });
var hide = (definition) => ({ ...definition, enabledWhen: "showLegacyMethods" });
var oldDeck = (definition, name) => hide({ ...definition, run(ctx, p) {
  return legacyDeck(this, ctx, p, name, (owner) => definition.run.call(owner, ctx, p));
}, skip(ctx, p) {
  return legacyDeck(this, ctx, p, name, (owner) => definition.run.call(owner, ctx, p));
}, runImmediately(ctx, p) {
  return isNavigationReplay(ctx) ? legacyDeck(this, ctx, p, name, (owner) => definition.run.call(owner, ctx, p)) : definition.runImmediately.call(this, ctx, p);
} });
var calcSchema = buildCalcSchema(LegacyMath.calc.schema);
var RandomMath = (() => {
  let _classDecorators = [extension({ id: "random-math", label: "抽选与数学增强" })];
  let _classDescriptor;
  let _classExtraInitializers = [];
  let _classThis;
  let _classSuper = Extension2;
  var RandomMath2 = class extends _classSuper {
    static {
      _classThis = this;
    }
    static {
      const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
      __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
      RandomMath2 = _classThis = _classDescriptor.value;
      if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
    }
    static saveSchema = defineSave2({ ...LegacyMath.saveSchema, poolStateV3: { type: "string", persistence: "slot", default: "", label: "3.0池、占用凭证与待选状态" } });
    static settings = settings2((s) => ({
      ...LegacyMath.settings.build(s),
      creatorHelp: s.string("使用说明").default("六入口：随机数、放回抽取、不放回抽取、调整抽取池、玩家选项、计算。先在池目录添加池，再在候选目录填写所属池ID；首次抽取或展示时自动初始化。改作者配置不会覆盖已经开始游玩的池；剧情调整只改当前存档。检查配置和概率使用检查面板；剧情需要余量时使用“调整抽取池→读取状态”。完整案例见 docs/creator-guide.html；AI资料独立安装。").multiline(),
      dslCheat: s.string("旧版速查（仅旧候选表与随机数记录，不用于3.0池）").default("旧候选表的10%与数字混合、随机数的首次结果记录继续兼容。3.0池的规则请阅读下方新池规则。已有工程保存的旧速查原文保留。").multiline(),
      poolRulesV3: s.string("3.0池：表达式、概率与读档规则").default('表达式：支持 + - * / ^、比较、三元条件，以及 sqrt、pow、floor、round、min、max、clamp、var("变量名")。表函数用于“计算”；新池需先计算再引用变量。\n新池：权重支持数值或变量表达式，如 var("好感度") + 10；每次抽取读取当前变量，已经初始化的池也会生效。设置权重保留表达式，增减权重按执行时计算一次；基础百分比填0～100，不加百分号，基础合计100。条件、份数和计权方式会改变本次实际概率。旧候选表的10%与数字混合仅属于兼容规则。\n池的“同一进度固定”保存随机进度；在池已建立且状态、条件与操作相同时，读档结果相同。读回建池前或调整内容、条件后不保证相同。“允许读档重抽”重新产生随机值，但仍可能抽到相同结果。\n“随机数”的“首次抽取后固定”保留旧记录规则，与池的固定进度不同；读回首次记录产生前可重新抽取。').multiline(),
      showLegacyMethods: s.boolean("显示旧版入口（已有调用始终可执行）").default(false),
      pools: s.array("池目录", (i) => ({ id: i.string("稳定池ID"), name: i.string("显示名称"), kind: i.enum("抽取类型", ["with", "without"]).labels({ with: "放回", without: "不放回" }).default("with"), valueType: i.enum("结果类型", ["text", "number"]).labels({ text: "文字", number: "数值或公式" }).default("text"), probability: i.enum("概率规则", ["weight", "percent"]).labels({ weight: "相对权重", percent: "基础百分比" }).default("weight"), quantityWeight: i.enum("份数计权（不放回）", ["candidate", "unit"]).labels({ candidate: "按候选计权", unit: "按每份计权" }).default("candidate").enabledWhen("kind", "without"), random: i.enum("随机策略", ["fixed", "fresh"]).labels({ fixed: "同一进度固定", fresh: "允许读档重抽" }).default("fixed") })).maxItems(100).addLabel("添加池").table({ titleField: "name", columns: ["id", "kind"], sections: [{ label: "结果与概率", fields: ["valueType", "probability", "quantityWeight", "random"] }] }),
      candidates: s.array("候选目录", (i) => ({ poolId: i.string("所属池ID"), id: i.string("稳定候选ID"), label: i.string("选项显示文字"), value: i.string("结果内容（数值池可填公式）"), rate: i.string("权重／基础百分比（支持变量）").default("1").describe('可填10、var("好感度")或var("好感度") + 10。每次抽取读取当前数值变量；基础百分比每次求值后合计100，不加%。'), quantity: i.number("初始份数（仅不放回）").default(1).range(0, 1e4), enabled: i.boolean("启用").default(true), condition: i.string("条件布尔变量名（空=始终）").default(""), data: i.string("附加JSON数据（可空）").multiline() })).maxItems(2e4).addLabel("添加候选").table({ titleField: "label", columns: ["poolId", "id", "rate"], sections: [{ label: "结果与份数", fields: ["value", "quantity"] }, { label: "参与条件", fields: ["enabled", "condition"] }, { label: "外部系统数据", fields: ["data"] }] }),
      adjustments: s.array("批量调整目录（同组按行顺序执行）", (i) => ({ batchId: i.string("调整组ID"), op: i.enum("操作", ["add", "remove", "enable", "disable", "set-rate", "add-rate", "set-percent", "set-quantity", "add-quantity", "set-condition", "set-content"]).labels({ "add": "新增", "remove": "移除", "enable": "启用", "disable": "停用", "set-rate": "设置权重", "add-rate": "增减权重", "set-percent": "设置基础百分比", "set-quantity": "设置剩余份数", "add-quantity": "增减剩余份数", "set-condition": "修改条件", "set-content": "修改内容" }).default("set-rate"), candidateId: i.string("候选ID"), candidateIdVar: i.string("从文本变量读取候选ID（可空，优先）"), amount: i.string("数值／变量表达式").default("0").describe('例如var("好感度")。设置权重保留表达式；增减权重、份数与设置百分比按执行时求值。'), when: i.string("执行条件布尔变量名（可空）"), label: i.string("新增或修改：显示文字"), value: i.string("新增或修改：结果内容"), rate: i.string("新增：权重／百分比（支持变量）").default("1").describe('例如var("好感度") + 10；变量必须为数值。'), quantity: i.number("新增：份数").default(1).range(0, 1e4), condition: i.string("新增或修改：参与条件") })).maxItems(1e4).table({ titleField: "batchId", columns: ["op", "candidateId"], sections: [{ label: "输入", fields: ["candidateIdVar", "amount", "when"] }, { label: "候选内容", fields: ["label", "value", "rate", "quantity", "condition"] }] })
    }));
    static rand = replayMethod({ id: "rand", title: "随机数", description: "选择单个／批量及重抽／固定；完整参数保留既有调用。也可清除指定固定记录。", schema: randSchema, returns: { type: "number", label: "单次结果／批量数量；清除成功1、失败-1" }, run(ctx, p) {
      if (p.action === "reset")
        return LegacyMath.resetFixed.run.call(this, ctx, { key: String(p.resetKey || ""), successVar: p.successVar, errorVar: p.errorVar }) ? 1 : -1;
      return LegacyMath.rand.run.call(this, ctx, randomParams(p));
    } });
    static drawReplace = replayMethod({ id: "draw-replace", title: "放回抽取", description: "从指定放回池抽取，候选不会因抽取而减少。", schema: { ...replacementFields, ...common }, async run(ctx, p) {
      await runAction(this, ctx, p, "with");
    } });
    static drawWithout = replayMethod({ id: "draw-without", title: "不放回抽取", description: "抽取并消耗或占用份数；也可确认消耗、取消占用。", schema: drawWithoutSchema, async run(ctx, p) {
      await runAction(this, ctx, p, "without");
    } });
    static poolUpdate = replayMethod({ id: "pool-update", title: "调整抽取池", description: "剧情运行时调整指定池，或读取状态。批量调整全部成功后才提交。", schema: updateSchema, async run(ctx, p) {
      await runAction(this, ctx, p, "update");
    } });
    static playerChoice = sdkMethod2({ id: "player-choice", title: "玩家选项", description: "展示合格候选，等待玩家选择；输出结果接续后面的剧情。", schema: { ...poolField, requestKey: fieldString("选项请求名（空=池ID；同池多个待选点请分别命名）"), ...consumption, ...resultFields2, ...common }, async run(ctx, p) {
      await showChoices(this, ctx, p);
    }, async skip(ctx, p) {
      await showChoices(this, ctx, p);
    }, async runImmediately(ctx, p) {
      if (isNavigationReplay(ctx))
        return;
      await showChoices(this, ctx, p, true);
    } });
    static calc = replayMethod({ id: LegacyMath.calc.id, title: LegacyMath.calc.title, description: "基础运算、直接公式、取整精度、余数及范围限制。输入支持数值变量；失败保留结果。", returns: LegacyMath.calc.returns, schema: calcSchema, run(ctx, p) {
      if (isEnhancedCalculation(p.op))
        return runExtraCalculation(ctx, p, () => evaluateCalculation(ctx, p));
      const op = String(p.op);
      return LegacyMath.calc.run.call(this, ctx, { ...p, a: p[`${op}A`] ?? p.a, b: p[`${op}B`] ?? p.b });
    } });
    static deckCreate = oldDeck(LegacyMath.deckCreate, "create");
    static deckDraw = oldDeck(LegacyMath.deckDraw, "draw");
    static deckPeek = oldDeck(LegacyMath.deckPeek, "peek");
    static deckReset = oldDeck(LegacyMath.deckReset, "reset");
    static resetFixed = hide(LegacyMath.resetFixed);
    static randPick = hide(LegacyMath.randPick);
    static randPickNumber = hide(LegacyMath.randPickNumber);
    static previewPool = hide(LegacyMath.previewPool);
    render() {
      return { component: PoolInspector, props: { id: "random-math-inspector", owner: this } };
    }
    static {
      __runInitializers(_classThis, _classExtraInitializers);
    }
  };
  return RandomMath2 = _classThis;
})();
export {
  RandomMath
};
