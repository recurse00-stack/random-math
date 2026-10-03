// ==================== 白名单表达式 DSL（无 eval） ====================
// 支持：数字、参数 x/y/z/w、运算符 + - * / ^（幂）、括号、比较 < > <= >= == !=、三元 ? :、字符串(仅 var 调用)、
//       函数 sqrt(a) pow(a,b) floor(a) round(a) min(a,b) max(a,b) clamp(a,min,max) var("变量名")
// 禁止：任何其他标识符/字符串/分号/赋值。var() 可读取项目变量（权重表达式/函数规则表通用）。
type ExprParams = Record<"x" | "y" | "z" | "w", number>;
export type Env = ExprParams & {
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
export function tokenize(src: string): Tok[] {
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
export function checked(value: number): number {
    if (!Number.isFinite(value))
        throw new Error("结果不是有限数值");
    return value;
}
const expressionCache = new Map<string, (env: Env) => number>();
export function compileExpr(src: string): (env: Env) => number {
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
