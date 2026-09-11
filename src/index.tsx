// Random/math utilities: one runtime entry, stable public method IDs.
import { Extension, extension, method, settings, defineSave, type ExtensionContext, type BlockSchema, type VariableValue } from "@avg-studio/sdk";
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
type Tok = {
    t: "num";
    v: number;
} | {
    t: "str";
    v: string;
} | {
    t: "id";
    v: string;
} | {
    t: "op";
    v: "+" | "-" | "*" | "/" | "^";
} | {
    t: "cmp";
    v: "<" | ">" | "<=" | ">=" | "==" | "!=";
} | {
    t: "q";
    v: "?";
} | {
    t: "colon";
    v: ":";
} | {
    t: "lp";
} | {
    t: "rp";
} | {
    t: "comma";
};
function normNum(u: unknown): number | null {
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
function truthy(u: unknown): boolean {
    const n = normNum(u);
    return n !== null ? n !== 0 : !!u;
}
function tokenize(src: string): Tok[] {
    if (!src.trim() || src.length > 4096)
        throw new Error("表达式为空或超过4096字符");
    const out: Tok[] = [];
    let i = 0;
    const two = (c: string) => src.substr(i, 2) === c;
    while (i < src.length) {
        if (out.length > 1024)
            throw new Error("表达式语法单元过多");
        const c = src[i];
        if (c === " " || c === "\t" || c === "\n" || c === "\r") {
            i++;
            continue;
        }
        if ((c >= "0" && c <= "9") || c === ".") {
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
            const value: unknown = JSON.parse(matched[0]);
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
            out.push({ t: "op", v: c as "+" | "-" | "*" | "/" | "^" });
            i++;
            continue;
        }
        if (two("<=") || two(">=") || two("==") || two("!=")) {
            out.push({ t: "cmp", v: src.substr(i, 2) as "<=" | ">=" | "==" | "!=" });
            i += 2;
            continue;
        }
        if (c === "<" || c === ">") {
            out.push({ t: "cmp", v: c as "<" | ">" });
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
function parseExpr(src: string) {
    const toks = tokenize(src);
    let pos = 0;
    const peek = () => toks[pos];
    const next = () => toks[pos++];
    function expr(depth: number): (env: Env) => number {
        if (depth > MAX_DEPTH)
            throw new Error("表达式过深");
        let c = cmp(depth);
        while (peek() && (peek() as Tok).t === "q") {
            next(); // ?
            const a = expr(depth + 1);
            if (!(peek() && (peek() as Tok).t === "colon"))
                throw new Error("三元缺 :");
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
            const op = (next() as Extract<Tok, {
                t: "cmp";
            }>).v;
            const right = arith(depth);
            const l = left, r = right;
            left = (env: Env) => {
                const a = l(env), b = r(env);
                switch (op) {
                    case "==": {
                        const na = normNum(a), nb = normNum(b);
                        return (na !== null && nb !== null) ? (na === nb ? 1 : 0) : (a === b ? 1 : 0);
                    }
                    case "!=": {
                        const na = normNum(a), nb = normNum(b);
                        return (na !== null && nb !== null) ? (na !== nb ? 1 : 0) : (a !== b ? 1 : 0);
                    }
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
        while (peek() && (peek() as Tok).t === "op" && ((peek() as Extract<Tok, {
            t: "op";
        }>).v === "+" || (peek() as Extract<Tok, {
            t: "op";
        }>).v === "-")) {
            const op = (next() as Extract<Tok, {
                t: "op";
            }>).v;
            const right = term(depth);
            const l = left, r = right;
            left = op === "+" ? (env: Env) => checked(l(env) + r(env)) : (env: Env) => checked(l(env) - r(env));
        }
        return left;
    }
    function term(depth: number): (env: Env) => number {
        let left = unary(depth);
        while (peek()?.t === "op" && ["*", "/"].includes((peek() as Extract<Tok, {
            t: "op";
        }>).v)) {
            const op = (next() as Extract<Tok, {
                t: "op";
            }>).v, right = unary(depth), l = left;
            left = op === "*" ? env => checked(l(env) * right(env)) : env => {
                const d = right(env);
                if (d === 0)
                    throw new Error("除零");
                return checked(l(env) / d);
            };
        }
        return left;
    }
    function unary(depth: number): (env: Env) => number {
        if (depth > MAX_DEPTH)
            throw new Error("表达式过深");
        const tk = peek();
        if (tk?.t === "op" && (tk.v === "+" || tk.v === "-")) {
            next();
            const value = unary(depth + 1);
            return env => tk.v === "-" ? -value(env) : value(env);
        }
        const left = factor(depth);
        if (peek()?.t === "op" && (peek() as Extract<Tok, {
            t: "op";
        }>).v === "^") {
            next();
            const right = unary(depth + 1);
            return env => checked(Math.pow(left(env), right(env)));
        }
        return left;
    }
    function factor(depth: number): (env: Env) => number {
        const tk = peek();
        if (!tk)
            throw new Error("表达式意外结束");
        if (tk.t === "num") {
            next();
            const v = (tk as Extract<Tok, {
                t: "num";
            }>).v;
            return () => v;
        }
        if (tk.t === "str")
            throw new Error("字符串只能用于 var(\"变量名\")");
        if (tk.t === "id") {
            next();
            const name = (tk as Extract<Tok, {
                t: "id";
            }>).v;
            if (name === "x" || name === "y" || name === "z" || name === "w") {
                return (env: Env) => env[name];
            }
            if (name === "var") {
                if (!(peek() && (peek() as Tok).t === "lp"))
                    throw new Error("var 需要括号：var(\"变量名\")");
                next(); // (
                const arg = peek();
                if (!arg || arg.t !== "str")
                    throw new Error("var 参数必须是字符串：var(\"变量名\")");
                next();
                if (!(peek() && (peek() as Tok).t === "rp"))
                    throw new Error("var 缺右括号");
                next();
                const vname = (arg as Extract<Tok, {
                    t: "str";
                }>).v;
                return (env: Env) => {
                    const u = env.v(vname);
                    const n = normNum(u);
                    if (n === null)
                        throw new Error(`变量「${vname}」不存在或不是数值`);
                    return n;
                };
            }
            if (peek() && (peek() as Tok).t === "lp") {
                next(); // (
                const args: Array<(env: Env) => number> = [];
                if (!(peek() && (peek() as Tok).t === "rp")) {
                    while (true) {
                        args.push(expr(depth + 1));
                        if (peek() && (peek() as Tok).t === "comma") {
                            next();
                            continue;
                        }
                        break;
                    }
                }
                if (!(peek() && (peek() as Tok).t === "rp"))
                    throw new Error(`函数 ${name} 缺右括号`);
                next(); // )
                if (BUILTIN_FNS.includes(name))
                    return buildFn(name, args);
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
            if (!(peek() && (peek() as Tok).t === "rp"))
                throw new Error("缺右括号");
            next();
            return inner;
        }
        throw new Error("非法语法");
    }
    const BUILTIN_FNS = ["sqrt", "pow", "floor", "round", "min", "max", "clamp"];
    function buildFn(name: string, args: Array<(env: Env) => number>): (env: Env) => number {
        const check = (n: number) => {
            if (args.length !== n)
                throw new Error(`函数 ${name} 需要 ${n} 个参数，收到 ${args.length}`);
        };
        switch (name) {
            case "sqrt":
                check(1);
                return (env: Env) => checked(Math.sqrt(args[0](env)));
            case "pow":
                check(2);
                return (env: Env) => checked(Math.pow(args[0](env), args[1](env)));
            case "floor":
                check(1);
                return (env: Env) => Math.floor(args[0](env));
            case "round":
                check(1);
                return (env: Env) => Math.round(args[0](env));
            case "min":
                check(2);
                return (env: Env) => Math.min(args[0](env), args[1](env));
            case "max":
                check(2);
                return (env: Env) => Math.max(args[0](env), args[1](env));
            case "clamp":
                check(3);
                return (env: Env) => { const [x, lo, hi] = args.map(f => f(env)); if (lo > hi)
                    throw new Error("clamp下界大于上界"); return Math.min(hi, Math.max(lo, x)); };
            default: throw new Error(`未知函数: ${name}`);
        }
    }
    const fn = expr(0);
    if (pos !== toks.length)
        throw new Error("表达式尾部有多余内容");
    return fn;
}
function checked(value: number): number {
    if (!Number.isFinite(value))
        throw new Error("结果不是有限数值");
    return value;
}
const expressionCache = new Map<string, (env: Env) => number>();
function compileExpr(src: string): (env: Env) => number {
    const key = src.trim(), cached = expressionCache.get(key);
    if (cached)
        return cached;
    const fn = parseExpr(key);
    if (expressionCache.size >= 256)
        expressionCache.delete(expressionCache.keys().next().value!);
    const checkedFn = (env: Env) => checked(fn(env));
    expressionCache.set(key, checkedFn);
    return checkedFn;
}
type Context = ExtensionContext;
type Row = Record<string, unknown>;
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const reject = (text: string): never => { throw new Error(text); };
const number = (n: unknown, label: string): number => typeof n === 'number' && Number.isFinite(n) ? n : reject(`${label}必须是有限数值`);
type Outputs = {
    outVar?: string;
    successVar?: string;
    errorVar?: string;
};
const resultFields = {
    successVar: { type: 'variable', label: '成功状态写入（布尔，可空）' },
    errorVar: { type: 'variable', label: '错误说明写入（文本，可空）' },
} as const satisfies BlockSchema;
function unique(names: (string | undefined)[]) {
    const used = names.filter(Boolean);
    if (new Set(used).size !== used.length)
        reject('结果、状态和错误不能写入同一个变量');
}
function compatible(ctx: Context, name: string | undefined, type: string) {
    if (!name)
        return;
    const old = ctx.variables.get(name);
    if (old !== undefined && old !== null && typeof old !== type)
        reject(`输出变量「${name}」需要${type}类型`);
}
function outputs(ctx: Context, p: Outputs, resultType: string, extra: string[] = []) {
    unique([p.outVar, p.successVar, p.errorVar, ...extra]);
    compatible(ctx, p.outVar, resultType);
    compatible(ctx, p.successVar, 'boolean');
    compatible(ctx, p.errorVar, 'string');
}
function status(ctx: Context, p: Outputs, error = '') {
    if (p.successVar)
        ctx.variables.set(p.successVar, !error);
    if (p.errorVar)
        ctx.variables.set(p.errorVar, error);
}
function failed(ctx: Context, p: Outputs, label: string, error: unknown, protectedNames: string[] = []) {
    const text = `${label}：${message(error)}`;
    console.warn(`[random-math] ${text}`);
    const names = [p.outVar, ...protectedNames];
    const safe = { successVar: names.includes(p.successVar) || p.successVar === p.errorVar ? undefined : p.successVar,
        errorVar: names.includes(p.errorVar) || p.errorVar === p.successVar ? undefined : p.errorVar };
    try {
        compatible(ctx, safe.successVar, 'boolean');
        compatible(ctx, safe.errorVar, 'string');
        status(ctx, safe, text);
    }
    catch (e) {
        console.warn('[random-math] 状态输出失败', message(e));
    }
}
function writeAll(ctx: Context, writes: [
    string,
    VariableValue
][]) {
    const before = writes.map(([name]) => ctx.variables.get(name));
    let done = 0;
    try {
        for (; done < writes.length; done++)
            ctx.variables.set(...writes[done]);
    }
    catch (e) {
        for (let i = done - 1; i >= 0; i--)
            if (before[i] !== undefined)
                ctx.variables.set(writes[i][0], before[i]!);
        throw e;
    }
}
async function rows(ctx: Context, table: string, filter: Record<string, string>, limit: number): Promise<Row[]> {
    const result = await ctx.database.collection(table).find(filter, { limit: limit + 1 });
    if (result.length > limit)
        reject(`${table}超过${limit}行，请缩小范围`);
    return result;
}
async function functionLibrary(ctx: Context) {
    const table = await rows(ctx, 'funcLib', {}, 1000), lib = new Map<string, {
        fn: (env: Env) => number;
        deps: string[];
    }>();
    const reserved = new Set(['var', 'x', 'y', 'z', 'w', 'sqrt', 'pow', 'floor', 'round', 'min', 'max', 'clamp']);
    for (const row of table) {
        const name = String(row.name ?? '').trim(), expr = String(row.expr ?? '');
        if (!/^[A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5]*$/.test(name) || reserved.has(name))
            reject(`无效或保留函数名「${name}」`);
        if (lib.has(name))
            reject(`函数名重复「${name}」`);
        try {
            const tokens = tokenize(expr), deps = tokens.flatMap((t, i) => t.t === 'id' && tokens[i + 1]?.t === 'lp' && !reserved.has(t.v) ? [t.v] : []);
            lib.set(name, { fn: compileExpr(expr), deps });
        }
        catch (e) {
            reject(`函数「${name}」：${message(e)}`);
        }
    }
    const visiting = new Set<string>(), visited = new Set<string>();
    function visit(name: string, path: string[] = []) {
        if (visiting.has(name))
            reject(`函数循环引用：${[...path, name].join(' → ')}`);
        if (path.length >= 32)
            reject('函数调用链超过32层');
        if (visited.has(name))
            return;
        const item = lib.get(name);
        if (!item)
            reject(`未找到函数「${name}」`);
        visiting.add(name);
        item!.deps.forEach(dep => visit(dep, [...path, name]));
        visiting.delete(name);
        visited.add(name);
    }
    lib.forEach((_, name) => visit(name));
    return (expr: string, args: number[] = []) => {
        let budget = 4096, depth = 0;
        const call = (name: string, values: number[]): number => {
            if (--budget < 0 || ++depth > 32)
                reject('函数执行预算或调用深度超限');
            const item = lib.get(name);
            if (!item)
                reject(`未找到函数「${name}」`);
            if (values.length > 4)
                reject('函数最多接受4个参数');
            try {
                return item!.fn(env(values));
            }
            finally {
                depth--;
            }
        };
        const env = (v: number[]): Env => ({ x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0, w: v[3] ?? 0, v: n => ctx.variables.get(n), f: call });
        return compileExpr(expr)(env(args));
    };
}
function standalone(ctx: Context, expr: string) { return compileExpr(expr)({ x: 0, y: 0, z: 0, w: 0, v: n => ctx.variables.get(n) }); }
type RangeInput = {
    min: number;
    max: number;
    digits?: number;
    includeMin?: boolean;
    includeMax?: boolean;
};
function sampler(p: RangeInput) {
    const min = number(p.min, '最小值'), max = number(p.max, '最大值'), digits = p.digits ?? 0;
    if (min > max)
        reject('最小值大于最大值');
    if (!Number.isInteger(digits) || digits < 0 || digits > 6)
        reject('小数位数必须为0～6整数');
    const scale = 10 ** digits;
    const tick = (n: number) => {
        const x = n * scale, r = Math.round(x);
        if (Math.abs(x) > 2 ** 48)
            reject('数值与精度组合过大');
        return digits > 0 && Math.abs(x - r) <= Math.min(1e-7, 4 * Number.EPSILON * Math.max(1, Math.abs(x))) ? r : x;
    };
    const a = tick(min), b = tick(max), lo = p.includeMin === false ? Math.floor(a) + 1 : Math.ceil(a), hi = p.includeMax === false ? Math.ceil(b) - 1 : Math.floor(b);
    if (lo > hi)
        reject('当前端点与精度下没有可抽取数值');
    const valid = (v: number) => Number.isFinite(v) && v >= lo / scale && v <= hi / scale && Math.abs(v * scale - Math.round(v * scale)) <= 1e-7;
    return { lo, hi, scale, valid, draw: () => (lo + Math.floor(Math.random() * (hi - lo + 1))) / scale };
}
type Fixed = {
    key: string;
    signature: string;
    values: number[];
};
function fixedState(owner: unknown) {
    // method() erases the subclass's save type; narrow the public SDK boundary here only.
    const save = (owner as {
        save: {
            get(key: string): unknown;
            set(key: string, value: unknown): void;
        };
    }).save;
    if (!save)
        reject('固定随机需要宿主存档上下文');
    const raw = save.get('fixedResults');
    if (!Array.isArray(raw))
        reject('固定随机存档格式无效');
    const records: Fixed[] = (raw as unknown[]).map(item => {
        if (typeof item !== 'string')
            reject('固定记录损坏');
        const r = JSON.parse(item as string) as Partial<Fixed>;
        if (!r || typeof r.key !== 'string' || typeof r.signature !== 'string' || !Array.isArray(r.values) || !r.values.every(n => typeof n === 'number' && Number.isFinite(n)))
            reject('固定记录损坏');
        return r as Fixed;
    });
    if (new Set(records.map(r => r.key)).size !== records.length)
        reject('固定记录重名');
    return { records, write: (next: Fixed[]) => save.set('fixedResults', next.map(r => JSON.stringify(r))) };
}
const poolFields = {
    poolScope: { type: 'enum', label: '候选范围', default: 'named', options: [{ label: '指定池（空名称兼容全表）', value: 'named' }, { label: '仅未命名池', value: 'default' }, { label: '全部池', value: 'all' }] },
    pool: { type: 'string', label: '池名', default: '', visibleWhen: { field: 'poolScope', equals: 'named' }, suggestions: { key: 'pool' } },
    field: { type: 'string', label: '输出列', default: 'label' },
    emptyPolicy: { type: 'enum', label: '全部权重为零时', default: 'error', options: [{ label: '不抽取并报告错误', value: 'error' }, { label: '明确允许均匀回退', value: 'uniform' }] },
} as const satisfies BlockSchema;
type PoolInput = {
    poolScope?: string;
    pool?: string;
    field?: string;
    emptyPolicy?: string;
};
async function poolReport(ctx: Context, p: PoolInput) {
    const scope = p.poolScope || 'named', pool = (p.pool ?? '').trim(), policy = p.emptyPolicy || 'error';
    if (!['named', 'default', 'all'].includes(scope) || !['error', 'uniform'].includes(policy))
        reject('候选范围或回退策略无效');
    let table = await rows(ctx, 'pickTable', scope === 'named' && pool ? { pool } : {}, 10000);
    if (scope === 'default')
        table = table.filter(r => !String(r.pool ?? '').trim());
    if (!table.length)
        reject('候选池为空');
    const field = (p.field || 'label').trim();
    const hasWeight = (r: Row) => r.weight !== undefined && r.weight !== null && String(r.weight).trim() !== '';
    const unweighted = table.every(r => !hasWeight(r));
    const needsLibrary = table.map((r, i) => {
        if (!hasWeight(r) || typeof r.weight !== 'string')
            return false;
        try {
            return tokenize(r.weight).some((t, j, a) => t.t === 'id' && a[j + 1]?.t === 'lp' && !['var', 'sqrt', 'pow', 'floor', 'round', 'min', 'max', 'clamp'].includes(t.v));
        }
        catch (e) {
            return reject(`候选「${r.id ?? r.label ?? i + 1}」：${message(e)}`);
        }
    }).some(Boolean);
    const evaluate = needsLibrary ? await functionLibrary(ctx) : (expr: string) => standalone(ctx, expr);
    const candidates = table.map((row, i) => {
        let weight: number;
        try {
            weight = unweighted ? 1 : !hasWeight(row) ? 0 : typeof row.weight === 'number' ? row.weight : typeof row.weight === 'string' ? evaluate(row.weight) : reject('权重类型无效');
            number(weight, '权重');
            if (weight < 0)
                reject('权重不能为负');
        }
        catch (e) {
            return reject(`候选「${row.id ?? row.label ?? i + 1}」：${message(e)}`);
        }
        const value = row[field];
        if (value === undefined || value === null || !['string', 'number', 'boolean'].includes(typeof value))
            reject(`候选「${row.id ?? i + 1}」缺少有效列「${field}」`);
        return { id: typeof row.id === 'string' ? row.id : '', value: String(value), weight, probability: 0 };
    });
    let max = Math.max(...candidates.map(c => c.weight));
    const fallback = max === 0;
    if (fallback) {
        if (policy !== 'uniform')
            reject('所有候选权重为0，没有可抽取项');
        candidates.forEach(c => { c.weight = 1; });
        max = 1;
    }
    const total = candidates.reduce((sum, c) => sum + c.weight / max, 0);
    candidates.forEach(c => { c.probability = (c.weight / max) / total; });
    return { scope, pool, unweighted, fallback, candidates };
}
@extension({ id: 'random-math', label: '随机与计算系统' })
export class RandomMath extends Extension {
    static saveSchema = defineSave({ fixedResults: { type: 'list', persistence: 'slot', default: [] as string[], label: '固定随机记录' } });
    static settings = settings(s => ({ dslCheat: s.string('表达式语法速查').default('支持 + - * / ^、负数、比较和三元条件；幂优先且右结合。\n函数 sqrt pow floor round min max clamp、var("变量名")及表函数（禁止递归）。\n例 clamp(round(x*y),0,100)。固定结果跟随当前存档，读回抽取前存档会重抽。').multiline() }));
    static rand = method({ id: 'rand', title: '随机数', description: '按指定精度等概率抽取。单次返回结果，批量返回数量。固定结果随存档保存。', schema: {
            mode: { type: 'enum', label: '模式', required: true, default: 'fresh', options: [{ label: '每次重抽', value: 'fresh' }, { label: '首次抽取后固定（随存档）', value: 'sticky' }] },
            min: { type: 'number', label: '最小值', required: true, default: 0 }, max: { type: 'number', label: '最大值', required: true, default: 100 },
            digits: { type: 'number', label: '小数位数（0=整数）', default: 0, min: 0, max: 6, step: 1 },
            includeMin: { type: 'boolean', label: '包含最小端点', default: true }, includeMax: { type: 'boolean', label: '包含最大端点', default: true },
            count: { type: 'number', label: '数量（大于1批量输出）', default: 1, min: 1, max: 100, step: 1 },
            outVar: { type: 'variable', label: '单次结果变量', visibleWhen: { field: 'count', equals: 1 } }, prefix: { type: 'string', label: '批量前缀（数量大于1时使用）', default: '' },
            fixedKey: { type: 'string', label: '固定记录名（空=结果变量或批量前缀）', default: '', visibleWhen: { field: 'mode', equals: 'sticky' } },
            fixedPolicy: { type: 'enum', label: '旧存档首次接入', default: 'fresh', visibleWhen: { field: 'mode', equals: 'sticky' }, options: [{ label: '首次生成，忽略输出默认值', value: 'fresh' }, { label: '采用完整的既有结果', value: 'adopt' }] }, ...resultFields,
        }, returns: { type: 'number', label: '单次值／批量数量；失败-1，配合成功状态' }, run(ctx, p) {
            const count = p.count ?? 1, names = count > 1 && Number.isInteger(count) && count <= 100 ? Array.from({ length: count }, (_, i) => `${(p.prefix || '').trim()}_${i + 1}`) : p.outVar ? [p.outVar] : [];
            try {
                outputs(ctx, { ...p, outVar: count === 1 ? p.outVar : undefined }, 'number', count > 1 ? names : []);
                if (!Number.isInteger(count) || count < 1 || count > 100)
                    reject('数量必须为1～100整数');
                if (count > 1 && !(p.prefix || '').trim())
                    reject('批量抽取需要前缀');
                if (count > 1)
                    for (const name of names) {
                        if (ctx.variables.get(name) === undefined)
                            reject(`请先声明批量变量「${name}」`);
                        compatible(ctx, name, 'number');
                    }
                const draw = sampler(p), mode = p.mode || 'fresh';
                if (!['fresh', 'sticky'].includes(mode))
                    reject('未知随机模式');
                let values: number[], store: ReturnType<typeof fixedState> | undefined, next: Fixed[] | undefined;
                if (mode === 'sticky') {
                    const key = p.fixedKey?.trim() || (count > 1 ? `batch:${p.prefix.trim()}` : `value:${p.outVar || ''}`);
                    if (!p.fixedKey?.trim() && !names.length)
                        reject('固定随机需要记录名或结果变量');
                    store = fixedState(this);
                    const signature = JSON.stringify([draw.lo, draw.hi, draw.scale, count]);
                    const old = store.records.find(r => r.key === key);
                    if (old) {
                        if (old.signature !== signature || old.values.length !== count || !old.values.every(draw.valid))
                            reject(`固定记录「${key}」配置已变或损坏，请重置`);
                        values = old.values;
                    }
                    else {
                        const policy = p.fixedPolicy || 'fresh';
                        if (!['fresh', 'adopt'].includes(policy))
                            reject('旧存档接入方式无效');
                        values = policy === 'adopt' ? names.map(n => number(ctx.variables.get(n), `旧结果「${n}」`)) : Array.from({ length: count }, draw.draw);
                        if (values.length !== count || !values.every(draw.valid))
                            reject('既有结果不完整或不符合范围与精度');
                        if (store.records.length >= 10000)
                            reject('固定记录超过10000条，请重置不用的记录');
                        next = [...store.records, { key, signature, values }];
                    }
                }
                else
                    values = Array.from({ length: count }, draw.draw);
                // Commit the slot record first; roll it back if an output setter fails.
                if (store && next)
                    store.write(next);
                try {
                    writeAll(ctx, names.map((name, i) => [name, values[i]]));
                }
                catch (e) {
                    if (store && next)
                        store.write(store.records);
                    throw e;
                }
                status(ctx, p);
                return count === 1 ? values[0] : count;
            }
            catch (e) {
                failed(ctx, p, '随机数', e, names);
                return -1;
            }
        } });
    static resetFixed = method({ id: 'reset-fixed', title: '重置固定随机', description: '移除指定固定记录，下次重抽；保留结果变量。', schema: {
            key: { type: 'string', label: '记录名（默认单次 value:变量名；批量 batch:前缀）', required: true, default: '' }, ...resultFields,
        }, returns: { type: 'boolean', label: '是否成功' }, run(ctx, p) { try {
            outputs(ctx, p, 'number');
            const key = p.key.trim();
            if (!key)
                reject('记录名不能为空');
            const store = fixedState(this);
            store.write(store.records.filter(r => r.key !== key));
            status(ctx, p);
            return true;
        }
        catch (e) {
            failed(ctx, p, '重置固定随机', e);
            return false;
        } } });
    static randPick = method({ id: 'rand-pick', title: '列表随机（安科式）', description: '无权重均匀抽取；零权重不参与；无有效候选默认报告错误。', schema: { ...poolFields,
            outVar: { type: 'variable', label: '结果变量（可空，仅返回）' }, outIdVar: { type: 'variable', label: '行ID变量（文本，可空）' }, ...resultFields,
        }, returns: { type: 'string', label: '抽中内容；失败空串，配合成功状态' }, async run(ctx, p) {
            try {
                outputs(ctx, p, 'string', [p.outIdVar].filter(Boolean));
                compatible(ctx, p.outIdVar, 'string');
                const report = await poolReport(ctx, p), active = report.candidates.filter(c => c.probability > 0);
                if (p.outIdVar && active.some(c => !c.id))
                    reject('候选缺少行ID');
                let roll = Math.random();
                const chosen = active.find(c => { roll -= c.probability; return roll < 0; }) ?? active[active.length - 1];
                const writes: [
                    string,
                    VariableValue
                ][] = [];
                if (p.outVar)
                    writes.push([p.outVar, chosen.value]);
                if (p.outIdVar)
                    writes.push([p.outIdVar, chosen.id]);
                writeAll(ctx, writes);
                status(ctx, p);
                return chosen.value;
            }
            catch (e) {
                failed(ctx, p, '列表随机', e, [p.outIdVar]);
                return '';
            }
        } });
    static previewPool = method({ id: 'preview-pool', title: '检查候选池与概率', description: '按当前变量计算概率，不抽取；返回JSON文本报告。', schema: { ...poolFields, outVar: { type: 'variable', label: '报告变量（文本，可空）' }, ...resultFields }, returns: { type: 'string', label: '概率报告JSON' }, async run(ctx, p) {
            try {
                outputs(ctx, p, 'string');
                const text = JSON.stringify(await poolReport(ctx, p));
                if (p.outVar)
                    ctx.variables.set(p.outVar, text);
                status(ctx, p);
                return text;
            }
            catch (e) {
                failed(ctx, p, '候选池检查', e);
                return '';
            }
        } });
    static calc = method({ id: 'calc', title: '计算', description: '有限数值计算／无副作用的表函数。失败保留结果，成功状态=false。', schema: {
            op: { type: 'enum', label: '运算', required: true, default: 'add', options: [{ label: '加 +', value: 'add' }, { label: '减 −', value: 'sub' }, { label: '乘 ×', value: 'mul' }, { label: '除 ÷', value: 'div' }, { label: '幂', value: 'pow' }, { label: '开方', value: 'root' }, { label: '向下取整', value: 'floor' }, { label: '四舍五入', value: 'round' }, { label: '自定义函数', value: 'func' }] },
            a: { type: 'number', label: 'a（基础运算）', default: 0 }, b: { type: 'number', label: 'b（双目运算）', default: 1 },
            funcName: { type: 'string', label: '函数名', default: '', visibleWhen: { field: 'op', equals: 'func' }, suggestions: { key: 'function' } },
            x: { type: 'number', label: 'x', default: 0, visibleWhen: { field: 'op', equals: 'func' } }, y: { type: 'number', label: 'y', default: 0, visibleWhen: { field: 'op', equals: 'func' } }, z: { type: 'number', label: 'z', default: 0, visibleWhen: { field: 'op', equals: 'func' } }, w: { type: 'number', label: 'w', default: 0, visibleWhen: { field: 'op', equals: 'func' } },
            outVar: { type: 'variable', label: '结果变量（可空，仅返回）' }, ...resultFields,
        }, returns: { type: 'number', label: '计算结果；失败-1，配合成功状态' }, async run(ctx, p) {
            try {
                outputs(ctx, p, 'number');
                let result: number;
                if (p.op === 'func') {
                    const evaluate = await functionLibrary(ctx), name = (p.funcName || '').trim();
                    if (!/^[A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5]*$/.test(name))
                        reject('函数名无效');
                    result = evaluate(`${name}(x,y,z,w)`, [p.x ?? 0, p.y ?? 0, p.z ?? 0, p.w ?? 0].map(v => number(v, '函数参数')));
                }
                else {
                    const a = number(p.a ?? 0, 'a'), b = number(p.b ?? 1, 'b');
                    switch (p.op) {
                        case 'add':
                            result = a + b;
                            break;
                        case 'sub':
                            result = a - b;
                            break;
                        case 'mul':
                            result = a * b;
                            break;
                        case 'div':
                            if (b === 0)
                                reject('除零');
                            result = a / b;
                            break;
                        case 'pow':
                            result = Math.pow(a, b);
                            break;
                        case 'root':
                            result = Math.sqrt(a);
                            break;
                        case 'floor':
                            result = Math.floor(a);
                            break;
                        case 'round':
                            result = Math.round(a);
                            break;
                        default: return reject('未知计算操作');
                    }
                }
                checked(result);
                if (p.outVar)
                    ctx.variables.set(p.outVar, result);
                status(ctx, p);
                return result;
            }
            catch (e) {
                failed(ctx, p, '计算', e);
                return -1;
            }
        } });
}
