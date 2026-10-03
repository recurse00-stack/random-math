import { compileExpr, tokenize, checked, type Env } from "./expression.js";
import { replayMethod as method } from "./host-replay.js";
// Random/math utilities: one runtime entry, stable public method IDs.
import { Extension, extension, method as sdkMethod, settings, defineSave, type ExtensionContext, type BlockSchema, type VariableValue, type ExtensionMethodDef, type ExtensionMethodReturns, type ExtensionMethodReturnValue } from "@avg-studio/sdk";
import { type Deck, type Item, MAX_ITEMS, deckKey, parseDecks, encodeDecks, uniqueItems, shuffle, take, report as deckReport } from './deck.js';

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
export function runExtraCalculation(ctx: Context, p: Outputs, calculate: () => number): number {
    try {
        outputs(ctx, p, 'number');
        const result = checked(calculate());
        if (p.outVar) ctx.variables.set(p.outVar, result);
        status(ctx, p);
        return result;
    } catch (e) {
        failed(ctx, p, '计算', e);
        return -1;
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
export async function functionLibrary(ctx: Context) {
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
    field: { type: 'string', label: '输出列', default: 'label', suggestions: { key: 'candidate-field' } },
    emptyPolicy: { type: 'enum', label: '剩余概率无正权重时', default: 'error', options: [{ label: '不抽取并报告错误', value: 'error' }, { label: '明确允许均匀回退', value: 'uniform' }] },
} as const satisfies BlockSchema;
type PoolInput = {
    poolScope?: string;
    pool?: string;
    field?: string;
    emptyPolicy?: string;
};
export async function poolReport(ctx: Context, p: PoolInput) {
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
    const specs = table.map((row, i) => {
        const raw = typeof row.weight === 'string' ? row.weight.trim() : row.weight;
        const kind = typeof raw === 'string' && raw.endsWith('%') ? 'fixed' : 'relative';
        const name = String(row.id ?? row.label ?? i + 1);
        if (kind === 'fixed' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?%$/.test(raw as string))
            reject(`候选「${name}」：固定概率请填写数字加 %，例如 10%`);
        return { row, raw, kind, name };
    });
    const needsLibrary = specs.some(({ raw, kind, name }) => {
        if (kind === 'fixed' || typeof raw !== 'string' || !raw)
            return false;
        try {
            return tokenize(raw).some((t, j, a) => t.t === 'id' && a[j + 1]?.t === 'lp' && !['var', 'sqrt', 'pow', 'floor', 'round', 'min', 'max', 'clamp'].includes(t.v));
        }
        catch (e) {
            return reject(`候选「${name}」：${message(e)}`);
        }
    });
    const evaluate = needsLibrary ? await functionLibrary(ctx) : (expr: string) => standalone(ctx, expr);
    const candidates = specs.map(({ row, raw, kind, name }) => {
        let weight: number;
        try {
            weight = kind === 'fixed' ? Number((raw as string).slice(0, -1))
                : unweighted ? 1 : !hasWeight(row) ? 0
                : typeof raw === 'number' ? raw : typeof raw === 'string' ? evaluate(raw) : reject('权重类型无效');
            number(weight, kind === 'fixed' ? '固定概率' : '权重');
            if (kind === 'fixed' ? weight < 0 || weight > 100 : weight < 0)
                reject(kind === 'fixed' ? '固定概率必须在 0%～100% 之间' : '权重不能为负');
        }
        catch (e) {
            return reject(`候选「${name}」：${message(e)}`);
        }
        const value = row[field];
        if (value === undefined || value === null || !['string', 'number', 'boolean'].includes(typeof value))
            reject(`候选「${name}」缺少有效列「${field}」`);
        return { id: typeof row.id === 'string' ? row.id : '', value: String(value), kind, weight, probability: 0 };
    });
    // Compensated summation keeps many small reserved percentages from drifting at 100%.
    let fixedPercent = 0, correction = 0;
    for (const c of candidates.filter(c => c.kind === 'fixed')) {
        const adjusted = c.weight - correction, total = fixedPercent + adjusted;
        correction = (total - fixedPercent) - adjusted;
        fixedPercent = total;
        c.probability = c.weight / 100;
    }
    const tolerance = Number.EPSILON * 100 * 8;
    if (fixedPercent > 100 + tolerance)
        reject('固定概率合计超过 100%，请降低固定概率或拆分候选池');
    const fixedProbability = Math.abs(fixedPercent - 100) <= tolerance ? 1 : fixedPercent / 100;
    const remainingProbability = 1 - fixedProbability;
    const relative = candidates.filter(c => c.kind === 'relative');
    let fallback = false;
    if (remainingProbability > 0) {
        if (!relative.length)
            reject('固定概率未满 100%，请添加相对权重候选来分配剩余概率（也可添加“无事发生”）');
        let max = Math.max(...relative.map(c => c.weight));
        fallback = max === 0;
        if (fallback) {
            if (policy !== 'uniform')
                reject('剩余概率没有正权重候选：所有相对权重为0');
            relative.forEach(c => { c.weight = 1; });
            max = 1;
        }
        const total = relative.reduce((sum, c) => sum + c.weight / max, 0);
        relative.forEach(c => { c.probability = remainingProbability * ((c.weight / max) / total); });
    }
    return { scope, pool, unweighted, fallback, fixedProbability, remainingProbability, candidates };
}
type DrawInput = PoolInput & { count?: number; replacement?: string; outIdVar?: string };
async function drawPool(ctx: Context, p: DrawInput, numeric = false) {
    const count = p.count ?? 1, replacement = p.replacement ?? 'with';
    if (!Number.isInteger(count) || count < 1 || count > 100) reject('抽取数量必须为1～100整数');
    if (!['with', 'without'].includes(replacement)) reject('重复规则无效');
    const report = await poolReport(ctx, p);
    let evaluate = (expr: string) => standalone(ctx, expr);
    if (numeric) {
        const needsLibrary = report.candidates.some(c => {
            try { return tokenize(c.value).some((t, i, a) => t.t === 'id' && a[i + 1]?.t === 'lp' && !['var', 'sqrt', 'pow', 'floor', 'round', 'min', 'max', 'clamp'].includes(t.v)); }
            catch (e) { return reject(`候选「${c.id || c.value}」数值：${message(e)}`); }
        });
        if (needsLibrary) evaluate = await functionLibrary(ctx);
    }
    // Resolve every numeric expression before drawing or writing output variables.
    const candidates = report.candidates.map(c => {
        let numberValue = 0;
        if (numeric) {
            try { numberValue = number(evaluate(c.value), '数值结果'); }
            catch (e) { return reject(`候选「${c.id || c.value}」数值：${message(e)}`); }
        }
        return { ...c, numberValue };
    });
    const active = candidates.filter(c => c.probability > 0);
    if (p.outIdVar && active.some(c => !c.id)) reject('候选缺少行ID');
    if (replacement === 'without' && count > active.length)
        reject(`同批不重复最多可抽${active.length}个正概率候选，请减少数量`);
    const chosen: typeof active = [];
    for (let i = 0; i < count; i++) {
        const max = Math.max(...active.map(c => c.probability));
        const total = active.reduce((sum, c) => sum + c.probability / max, 0);
        let roll = Math.random() * total;
        let index = active.findIndex(c => { roll -= c.probability / max; return roll < 0; });
        if (index < 0) index = active.length - 1;
        chosen.push(active[index]);
        if (replacement === 'without') active.splice(index, 1);
    }
    return chosen;
}
const drawFields = {
    count: { type: 'number', label: '抽取数量', default: 1, min: 1, max: 100, step: 1 },
    replacement: { type: 'enum', label: '重复规则', default: 'with', options: [{ label: '允许重复（每次概率不变）', value: 'with' }, { label: '同批不重复（按行排除，后续概率改变）', value: 'without' }] },
} as const satisfies BlockSchema;
type DeckStore = { records: Deck[]; raw: unknown; read: () => unknown; write: (decks: Deck[]) => void; restore: () => void };
const deckBusy = new WeakSet<object>();
function deckStore(owner: object): DeckStore {
    const save = (owner as { save?: { get(key: string): unknown; set(key: string, value: unknown): void } }).save;
    if (!save) reject('抽取池需要宿主槽存档上下文');
    const raw = save!.get('drawDecks'), records = parseDecks(raw);
    return { records, raw, read: () => save!.get('drawDecks'), write: next => save!.set('drawDecks', encodeDecks(next)), restore: () => save!.set('drawDecks', raw ?? []) };
}
function deckAcquire(owner: object) {
    if (deckBusy.has(owner)) reject('抽取池正在处理另一次调用，请按顺序执行');
    deckBusy.add(owner);
    return () => deckBusy.delete(owner);
}
function deckCommit(ctx: Context, store: DeckStore, next: Deck[], writes: [string, VariableValue][], p: Outputs, signal?: AbortSignal) {
    if (signal?.aborted) reject('运行已取消，未修改抽取池');
    if (JSON.stringify(store.read()) !== JSON.stringify(store.raw)) reject('存档状态已变化，请重新执行');
    if (p.successVar) writes.push([p.successVar, true]);
    if (p.errorVar) writes.push([p.errorVar, '']);
    store.write(next);
    try { writeAll(ctx, writes); }
    catch (e) { store.restore(); throw e; }
}
export async function deckCandidates(ctx: Context, p: PoolInput & { source?: string; arrayJson?: string; arrayVar?: string; valueType?: string; uniqueBy?: string }): Promise<Item[]> {
    const source = p.source ?? 'table', valueType = p.valueType ?? 'text';
    if (!['table', 'array'].includes(source) || !['text', 'number'].includes(valueType)) reject('抽取池来源或输出类型无效');
    let items: Item[];
    if (source === 'array') {
        const raw = p.arrayVar ? ctx.variables.get(p.arrayVar) : p.arrayJson;
        if (typeof raw !== 'string' || raw.length > 1_000_000) reject('数组输入必须为不超过1000000字符的JSON文本');
        const parsed: unknown = JSON.parse(raw as string);
        if (!Array.isArray(parsed) || !parsed.length || parsed.length > MAX_ITEMS) reject('数组必须包含1～10000项');
        items = (parsed as unknown[]).map((value, i) => {
            if (valueType === 'number' ? typeof value !== 'number' || !Number.isFinite(value) : typeof value !== 'string') reject('数组元素类型必须与输出类型一致，数值数组只接受有限数字');
            return { id: `array:${i + 1}`, value: value as string | number, weight: 1 };
        });
    } else {
        const candidates = (await poolReport(ctx, p)).candidates;
        let evaluate = (expr: string) => standalone(ctx, expr);
        if (valueType === 'number' && candidates.some(c => tokenize(c.value).some((t, i, a) => t.t === 'id' && a[i + 1]?.t === 'lp' && !['var', 'sqrt', 'pow', 'floor', 'round', 'min', 'max', 'clamp'].includes(t.v)))) evaluate = await functionLibrary(ctx);
        items = candidates.map(c => ({ id: c.id, value: valueType === 'number' ? number(evaluate(c.value), '数值结果') : c.value, weight: c.probability })).filter(c => c.weight > 0);
    }
    return uniqueItems(items, p.uniqueBy ?? 'value');
}
const deckKeyField = { key: { type: 'string', label: '抽取池名称（独立命名，随存档）', required: true, default: '', suggestions: { key: 'deck-key' } } } as const satisfies BlockSchema;

export class LegacyMath extends Extension {
    static saveSchema = defineSave({ drawDecks: { type: 'list', persistence: 'slot', default: [] as string[], label: '不重复抽取池' }, fixedResults: { type: 'list', persistence: 'slot', default: [] as string[], label: '固定随机记录' } });
    static settings = settings(s => ({ creatorHelp: s.string('创作者手册与 AI 指南').default('完整手册：工坊原插件详情页，或发行包 docs/creator-guide.html（可单独离线打开）。\n先看第1章术语、第3章掷骰、第4章不重复抽取；查找可直接跳到第几处并预览上下文。\nAI指南与人类手册分开：docs/AI-GUIDE.md；接入步骤见 docs/AI-INTEGRATION.md。插件安装不会自动安装AI技能。').multiline(), dslCheat: s.string('表达式语法速查').default('支持 + - * / ^、负数、比较和三元条件；幂优先且右结合。\n函数 sqrt pow floor round min max clamp、var("变量名")及表函数（禁止递归）。\n例 clamp(round(x*y),0,100)。候选表 weight 填 10% 锁定10%概率，数字或表达式分配剩余概率。% 只用于候选表数字后缀。固定结果跟随当前存档，读回抽取前存档会重抽。').multiline() }));
    static deckCreate = method({ id: 'deck-create', title: '建立不重复抽取池', description: '从候选表或JSON数组建立持久抽取池。重复建立同名池会报错，重开一轮须先重置。', schema: {
        ...deckKeyField,
        source: { type: 'enum', label: '来源', default: 'table', options: [{ label: '随机候选表', value: 'table' }, { label: 'JSON数组', value: 'array' }] },
        ...poolFields,
        arrayJson: { type: 'string', label: 'JSON数组（如 ["A","B","C"] 或 [1,2,3]）', default: '', visibleWhen: { field: 'source', equals: 'array' } },
        arrayVar: { type: 'variable', label: '从文本变量读取JSON数组（优先于上方文本）', visibleWhen: { field: 'source', equals: 'array' } },
        valueType: { type: 'enum', label: '结果类型', default: 'text', options: [{ label: '文字', value: 'text' }, { label: '数值（表中允许公式）', value: 'number' }] },
        mode: { type: 'enum', label: '抽取方式', default: 'fixed', options: [{ label: '建立时洗牌，之后依次抽取', value: 'fixed' }, { label: '每次从剩余项随机抽取（可读档重抽）', value: 'remaining' }] },
        uniqueBy: { type: 'enum', label: '相同内容处理', default: 'value', options: [{ label: '合并相同结果（权重相加，保留首项ID）', value: 'value' }, { label: '按行／数组位置区分（相同内容可再次出现）', value: 'row' }] },
        outVar: { type: 'variable', label: '初始池报告（JSON文本，可空）' }, ...resultFields,
    }, returns: { type: 'number', label: '池内项目数量；失败-1' }, async run(ctx, p) {
        let release: (() => void) | undefined;
        const signal = ctx.flow?.signal;
        try {
            release = deckAcquire(this); outputs(ctx, p, 'string');
            const key = deckKey(p.key), mode = p.mode ?? 'fixed', valueType = p.valueType ?? 'text';
            if (!['fixed', 'remaining'].includes(mode)) reject('抽取方式无效');
            const store = deckStore(this);
            if (store.records.some(d => d.key === key)) reject('同名抽取池已存在；继续抽取请用“从抽取池取出”，重开请先重置');
            const items = await deckCandidates(ctx, p);
            if (signal?.aborted) reject('运行已取消');
            const deck: Deck = { version: 1, key, mode: mode as Deck['mode'], valueType: valueType as Deck['valueType'], total: items.length, drawn: 0, items };
            // Validate limits before consuming randomness.
            encodeDecks([...store.records, deck]);
            if (mode === 'fixed') deck.items = shuffle(items);
            const writes: [string, VariableValue][] = p.outVar ? [[p.outVar, JSON.stringify(deckReport(deck))]] : [];
            deckCommit(ctx, store, [...store.records, deck], writes, p, signal);
            return deck.total;
        } catch (e) { if (!signal?.aborted) failed(ctx, p, '建立抽取池', e); return -1; }
        finally { release?.(); }
    } });
    static deckDraw = method({ id: 'deck-draw', title: '从抽取池取出', description: '跨多次调用持续不重复。抽出的项目从当前槽的池中移除；余量不足整批失败，不自动补回。返回结果JSON数组。', schema: {
        ...deckKeyField,
        count: { type: 'number', label: '本次取出数量', default: 1, min: 1, max: 100, step: 1 },
        outVar: { type: 'variable', label: '单项结果（文字／数值，与建池类型一致）', visibleWhen: { field: 'count', equals: 1 } },
        prefix: { type: 'string', label: '批量逐项前缀（可空，需预先声明 前缀_1…N）', default: '', suggestions: { key: 'deck-output-prefix' } },
        reportVar: { type: 'variable', label: '本次结果数组（JSON文本，可空）' },
        outIdVar: { type: 'variable', label: '本次行ID数组（JSON文本，可空）' },
        remainingVar: { type: 'variable', label: '剩余数量（数值，可空）' }, ...resultFields,
    }, returns: { type: 'string', label: '结果JSON数组；失败空串' }, run(ctx, p) {
        let release: (() => void) | undefined;
        const signal = ctx.flow?.signal, count = p.count ?? 1;
        const names = Number.isInteger(count) && count > 1 && count <= 100 && p.prefix?.trim() ? Array.from({ length: count }, (_, i) => `${p.prefix.trim()}_${i + 1}`) : [];
        const output = { ...p, outVar: count === 1 ? p.outVar : undefined };
        const extra = [p.reportVar, p.outIdVar, p.remainingVar, ...names].filter(Boolean);
        try {
            release = deckAcquire(this);
            const store = deckStore(this), key = deckKey(p.key), deck = store.records.find(d => d.key === key);
            if (!deck) reject('抽取池不存在，请先建立');
            const type = deck!.valueType === 'number' ? 'number' : 'string';
            outputs(ctx, output, type, extra);
            compatible(ctx, p.reportVar, 'string'); compatible(ctx, p.outIdVar, 'string'); compatible(ctx, p.remainingVar, 'number');
            for (const name of names) { if (ctx.variables.get(name) === undefined) reject(`请先声明批量变量「${name}」`); compatible(ctx, name, type); }
            if (signal?.aborted) reject('运行已取消');
            const { next, chosen } = take(deck!, count), text = JSON.stringify(chosen.map(i => i.value));
            const writes: [string, VariableValue][] = names.map((name, i) => [name, chosen[i].value]);
            if (output.outVar) writes.push([output.outVar, chosen[0].value]);
            if (p.reportVar) writes.push([p.reportVar, text]);
            if (p.outIdVar) writes.push([p.outIdVar, JSON.stringify(chosen.map(i => i.id))]);
            if (p.remainingVar) writes.push([p.remainingVar, next.items.length]);
            deckCommit(ctx, store, store.records.map(d => d.key === key ? next : d), writes, output, signal);
            return text;
        } catch (e) { if (!signal?.aborted) failed(ctx, output, '抽取池取出', e, extra); return ''; }
        finally { release?.(); }
    } });
    static deckPeek = method({ id: 'deck-peek', title: '查看抽取池／剩余数组', description: '不抽取、不洗牌。返回总数、已抽数量、剩余数值／文字数组和ID数组。', schema: {
        ...deckKeyField, outVar: { type: 'variable', label: '池报告（JSON文本，可空）' },
        arrayVar: { type: 'variable', label: '仅剩余结果数组（JSON文本，可空）' }, remainingVar: { type: 'variable', label: '剩余数量（数值，可空）' }, ...resultFields,
    }, returns: { type: 'string', label: '池报告JSON；失败空串' }, run(ctx, p) {
        try {
            if (deckBusy.has(this)) reject('抽取池正在处理另一次调用');
            outputs(ctx, p, 'string', [p.arrayVar, p.remainingVar].filter(Boolean)); compatible(ctx, p.arrayVar, 'string'); compatible(ctx, p.remainingVar, 'number');
            if (ctx.flow?.signal.aborted) reject('运行已取消');
            const key = deckKey(p.key), deck = deckStore(this).records.find(d => d.key === key);
            if (!deck) reject('抽取池不存在，请先建立');
            const report = deckReport(deck!), text = JSON.stringify(report), writes: [string, VariableValue][] = [];
            if (p.outVar) writes.push([p.outVar, text]); if (p.arrayVar) writes.push([p.arrayVar, JSON.stringify(report.values)]); if (p.remainingVar) writes.push([p.remainingVar, report.remaining]);
            if (p.successVar) writes.push([p.successVar, true]); if (p.errorVar) writes.push([p.errorVar, '']);
            writeAll(ctx, writes); return text;
        } catch (e) { if (!ctx.flow?.signal.aborted) failed(ctx, p, '查看抽取池', e, [p.arrayVar, p.remainingVar]); return ''; }
    } });
    static deckReset = method({ id: 'deck-reset', title: '重置／删除指定抽取池', description: '删除指定池记录；不清空已有结果变量。再次建立后开始新一轮。', schema: { ...deckKeyField, ...resultFields }, returns: { type: 'boolean', label: '是否成功' }, run(ctx, p) {
        let release: (() => void) | undefined;
        try {
            release = deckAcquire(this); outputs(ctx, p, 'string');
            const key = deckKey(p.key), store = deckStore(this);
            deckCommit(ctx, store, store.records.filter(d => d.key !== key), [], p, ctx.flow?.signal); return true;
        } catch (e) { if (!ctx.flow?.signal.aborted) failed(ctx, p, '重置抽取池', e); return false; }
        finally { release?.(); }
    } });

    static rand = method({ id: 'rand', title: '随机数', description: '按指定精度等概率抽取。单次返回结果，批量返回数量。固定结果随存档保存。', schema: {
            mode: { type: 'enum', label: '模式', required: true, default: 'fresh', options: [{ label: '每次重抽', value: 'fresh' }, { label: '首次抽取后固定（随存档）', value: 'sticky' }] },
            min: { type: 'number', label: '最小值', required: true, default: 0 }, max: { type: 'number', label: '最大值', required: true, default: 100 },
            digits: { type: 'number', label: '小数位数（0=整数）', default: 0, min: 0, max: 6, step: 1 },
            includeMin: { type: 'boolean', label: '包含最小端点', default: true }, includeMax: { type: 'boolean', label: '包含最大端点', default: true },
            count: { type: 'number', label: '数量（大于1批量输出）', default: 1, min: 1, max: 100, step: 1 },
            outVar: { type: 'variable', label: '单次结果变量', visibleWhen: { field: 'count', equals: 1 } }, prefix: { type: 'string', label: '批量前缀（数量大于1时使用）', default: '', suggestions: { key: 'number-output-prefix' } },
            reportVar: { type: 'variable', label: '完整结果数组（JSON文本，可空）' },
            fixedKey: { type: 'string', label: '固定记录名（空=结果变量或批量前缀）', default: '', visibleWhen: { field: 'mode', equals: 'sticky' }, suggestions: { key: 'fixed-key' } },
            fixedPolicy: { type: 'enum', label: '旧存档首次接入', default: 'fresh', visibleWhen: { field: 'mode', equals: 'sticky' }, options: [{ label: '首次生成，忽略输出默认值', value: 'fresh' }, { label: '采用完整的既有结果', value: 'adopt' }] }, ...resultFields,
        }, returns: { type: 'number', label: '单次值／批量数量；失败-1，配合成功状态' }, run(ctx, p) {
            const count = p.count ?? 1, names = count > 1 ? (Number.isInteger(count) && count <= 100 && p.prefix?.trim() ? Array.from({ length: count }, (_, i) => `${p.prefix.trim()}_${i + 1}`) : []) : p.outVar ? [p.outVar] : [];
            try {
                outputs(ctx, { ...p, outVar: count === 1 ? p.outVar : undefined }, 'number', [...(count > 1 ? names : []), p.reportVar].filter(Boolean));
                compatible(ctx, p.reportVar, 'string');
                if (!Number.isInteger(count) || count < 1 || count > 100)
                    reject('数量必须为1～100整数');
                if (count > 1 && !(p.prefix || '').trim() && !p.reportVar)
                    reject('批量抽取需要前缀或JSON数组报告变量');
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
                    const key = p.fixedKey?.trim() || (count > 1 ? (p.prefix?.trim() ? `batch:${p.prefix.trim()}` : `array:${p.reportVar || ''}`) : `value:${p.outVar || ''}`);
                    if (!p.fixedKey?.trim() && !names.length && !(count > 1 && p.reportVar))
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
                        if (policy === 'adopt' && !names.length && count > 1 && p.reportVar) {
                            const previous = ctx.variables.get(p.reportVar);
                            if (typeof previous !== 'string') reject('旧数组结果必须为JSON文本');
                            const parsed: unknown = JSON.parse(previous as string);
                            if (!Array.isArray(parsed) || !parsed.every(v => typeof v === 'number' && Number.isFinite(v))) reject('旧数组结果无效');
                            values = parsed as number[];
                        } else values = policy === 'adopt' ? names.map(n => number(ctx.variables.get(n), `旧结果「${n}」`)) : Array.from({ length: count }, draw.draw);
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
                    const writes: [string, VariableValue][] = names.map((name, i) => [name, values[i]]);
                    if (p.reportVar) writes.push([p.reportVar, JSON.stringify(values)]);
                    writeAll(ctx, writes);
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
                failed(ctx, p, '随机数', e, [...names, p.reportVar]);
                return -1;
            }
        } });
    static resetFixed = method({ id: 'reset-fixed', title: '重置固定随机', description: '移除指定固定记录，下次重抽；保留结果变量。', schema: {
            key: { type: 'string', label: '记录名（默认单次 value:变量名；批量 batch:前缀）', required: true, default: '', suggestions: { key: 'fixed-key' } }, ...resultFields,
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
    static randPick = method({ id: 'rand-pick', title: '列表随机（安科式）', description: '支持1～100次文字抽取。允许重复时每抽保持原概率；同批不重复按剩余行的原概率重新归一化。weight 填10%预留概率。', schema: { ...poolFields,
            ...drawFields,
            outVar: { type: 'variable', label: '结果变量（单条文字／批量JSON文本，可空）' },
            outIdVar: { type: 'variable', label: '行ID变量（单条ID／批量JSON文本，可空）' },
            prefix: { type: 'string', label: '批量逐条输出前缀（可空，写入 前缀_1..N 文本变量）', default: '', suggestions: { key: 'text-output-prefix' } }, ...resultFields,
        }, returns: { type: 'string', label: '单条文字／批量JSON数组；失败空串，配合成功状态' }, async run(ctx, p) {
            const count = p.count ?? 1;
            const names = Number.isInteger(count) && count > 1 && count <= 100 && p.prefix?.trim()
                ? Array.from({ length: count }, (_, i) => `${p.prefix.trim()}_${i + 1}`) : [];
            try {
                outputs(ctx, p, 'string', [p.outIdVar, ...names].filter(Boolean));
                compatible(ctx, p.outIdVar, 'string');
                for (const name of names) {
                    if (ctx.variables.get(name) === undefined)
                        reject(`请先声明批量文本变量「${name}」`);
                    compatible(ctx, name, 'string');
                }
                const chosen = await drawPool(ctx, p);
                const value = count === 1 ? chosen[0].value : JSON.stringify(chosen.map(c => c.value));
                const ids = count === 1 ? chosen[0].id : JSON.stringify(chosen.map(c => c.id));
                const writes: [string, VariableValue][] = names.map((name, i) => [name, chosen[i].value]);
                if (p.outVar) writes.push([p.outVar, value]);
                if (p.outIdVar) writes.push([p.outIdVar, ids]);
                writeAll(ctx, writes);
                status(ctx, p);
                return value;
            }
            catch (e) {
                failed(ctx, p, '列表随机', e, [p.outIdVar, ...names]);
                return '';
            }
        } });
    static randPickNumber = method({ id: 'rand-pick-number', title: '列表随机（数值／公式）', description: '按权重抽取数字或公式结果，支持整数与小数。批量结果写入前缀数值变量；可选重复规则。', schema: {
            ...poolFields, ...drawFields,
            outVar: { type: 'variable', label: '单次数值结果变量', visibleWhen: { field: 'count', equals: 1 } },
            prefix: { type: 'string', label: '批量数值前缀（数量大于1时必填）', default: '', suggestions: { key: 'number-output-prefix' } },
            reportVar: { type: 'variable', label: '完整数值数组（JSON文本，可空）' },
            outIdVar: { type: 'variable', label: '行ID变量（单条ID／批量JSON文本，可空）' }, ...resultFields,
        }, returns: { type: 'number', label: '单次数值／批量数量；失败-1，配合成功状态' }, async run(ctx, p) {
            const count = p.count ?? 1;
            const names = Number.isInteger(count) && count > 1 && count <= 100 && p.prefix?.trim()
                ? Array.from({ length: count }, (_, i) => `${p.prefix.trim()}_${i + 1}`) : [];
            const output = { ...p, outVar: count === 1 ? p.outVar : undefined };
            try {
                outputs(ctx, output, 'number', [p.reportVar, p.outIdVar, ...names].filter(Boolean));
                compatible(ctx, p.reportVar, 'string');
                compatible(ctx, p.outIdVar, 'string');
                if (count > 1 && !p.prefix?.trim()) reject('数值批量抽取需要前缀');
                for (const name of names) {
                    if (ctx.variables.get(name) === undefined) reject(`请先声明批量数值变量「${name}」`);
                    compatible(ctx, name, 'number');
                }
                const chosen = await drawPool(ctx, p, true), values = chosen.map(c => c.numberValue);
                const writes: [string, VariableValue][] = names.map((name, i) => [name, values[i]]);
                if (output.outVar) writes.push([output.outVar, values[0]]);
                if (p.reportVar) writes.push([p.reportVar, JSON.stringify(values)]);
                if (p.outIdVar) writes.push([p.outIdVar, count === 1 ? chosen[0].id : JSON.stringify(chosen.map(c => c.id))]);
                writeAll(ctx, writes);
                status(ctx, output);
                return count === 1 ? values[0] : count;
            }
            catch (e) {
                failed(ctx, output, '数值列表随机', e, [p.reportVar, p.outIdVar, ...names]);
                return -1;
            }
        } });
    static previewPool = method({ id: 'preview-pool', title: '检查候选池与概率', description: '检查固定概率与当前动态权重的分配，不抽取；返回JSON文本报告。', schema: { ...poolFields, outVar: { type: 'variable', label: '报告变量（文本，可空）' }, ...resultFields }, returns: { type: 'string', label: '概率报告JSON' }, async run(ctx, p) {
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
