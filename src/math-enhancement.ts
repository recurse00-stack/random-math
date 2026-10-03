import type { BlockSchema, ExtensionContext } from '@avg-studio/sdk';
import { checked, compileExpr, tokenize } from './expression.js';

export const enhancedOperations = [
    ['expr', '直接公式'], ['ceil', '向上取整'], ['trunc', '去掉小数（向零取整）'],
    ['round-digits', '四舍五入到指定小数位'], ['abs', '绝对值'],
    ['remainder', '求余数（保留被除数符号）'], ['mod', '循环取模（非负结果）'],
    ['min', '取较小值'], ['max', '取较大值'], ['clamp', '限制在指定范围'],
] as const;
export const isEnhancedCalculation = (op: unknown): boolean => enhancedOperations.some(([id]) => id === op);
const finite = (value: unknown, label: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}必须是有限数值`);
    return value;
};

// Round the shortest decimal representation; ties go away from zero.
// The old round operation and expression builtin retain Math.round semantics.
export function roundDigits(value: number, digits: number): number {
    finite(value, '数值');
    if (!Number.isInteger(digits) || digits < 0 || digits > 6) throw new Error('小数位数必须为0～6整数');
    const [mantissa, exp = '0'] = Math.abs(value).toString().split('e');
    const [whole, fraction = ''] = mantissa.split('.');
    const coefficient = BigInt(whole + fraction);
    const shift = Number(exp) - fraction.length + digits;
    let scaled: bigint;
    if (shift >= 0) scaled = coefficient * 10n ** BigInt(shift);
    else {
        const divisor = 10n ** BigInt(-shift);
        scaled = coefficient / divisor;
        if ((coefficient % divisor) * 2n >= divisor) scaled += 1n;
    }
    if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('数值与小数位数组合超出安全精度');
    const result = (value < 0 ? -Number(scaled) : Number(scaled)) / 10 ** digits;
    return result === 0 ? 0 : checked(result);
}
function extendedFunction(name: string, args: number[]): number {
    const arities: Record<string, number> = { ceil: 1, trunc: 1, abs: 1, roundDigits: 2, remainder: 2, mod: 2 };
    if (!Object.hasOwn(arities, name)) throw new Error(`直接公式不支持函数「${name}」；表函数请使用自定义函数操作`);
    if (args.length !== arities[name]) throw new Error(`函数 ${name} 需要 ${arities[name]} 个参数，收到 ${args.length}`);
    const [a, b] = args;
    args.forEach(value => finite(value, '函数参数'));
    switch (name) {
        case 'ceil': return Math.ceil(a);
        case 'trunc': return Math.trunc(a);
        case 'abs': return Math.abs(a);
        case 'roundDigits': return roundDigits(a, b);
        case 'remainder':
            if (b === 0) throw new Error('余数的除数不能为0');
            return a % b;
        case 'mod': {
            if (b <= 0) throw new Error('循环取模的模数必须大于0');
            const remainder = a % b;
            const result = remainder < 0 ? remainder + b : remainder;
            return result === b || result === 0 ? 0 : result;
        }
        default: throw new Error('未知计算函数');
    }
}
export function evaluateFormula(source: string, variable: (name: string) => unknown): number {
    const tokens = tokenize(source);
    if (tokens.some(t => t.t === 'id' && ['x', 'y', 'z', 'w'].includes(t.v)))
        throw new Error('直接公式请用 var("变量名") 读取变量；x/y/z/w用于函数规则表');
    return checked(compileExpr(source)({ x: 0, y: 0, z: 0, w: 0,
        v: name => finite(variable(name), `变量「${name}」`), f: extendedFunction }));
}
export function evaluateCalculation(ctx: ExtensionContext, p: Record<string, unknown>): number {
    const op = String(p.op);
    const input = (key: string, label: string): number => {
        const raw = p[`${op}__${key}`];
        if (typeof raw === 'number') return finite(raw, label);
        if (typeof raw !== 'string' || !raw.trim()) throw new Error(`${label}不能为空`);
        return evaluateFormula(raw, name => ctx.variables.get(name));
    };
    let result: number;
    switch (op) {
        case 'expr': result = input('expression', '公式'); break;
        case 'ceil': case 'trunc': case 'abs': result = extendedFunction(op, [input('value', '数值')]); break;
        case 'round-digits': result = roundDigits(input('value', '数值'), input('digits', '小数位数')); break;
        case 'remainder': case 'mod': result = extendedFunction(op, [input('a', '被除数'), input('b', '除数／模数')]); break;
        case 'min': result = Math.min(input('a', '第一个数'), input('b', '第二个数')); break;
        case 'max': result = Math.max(input('a', '第一个数'), input('b', '第二个数')); break;
        case 'clamp': {
            const value = input('value', '数值'), lo = input('min', '下限'), hi = input('max', '上限');
            if (lo > hi) throw new Error('范围下限不能大于上限');
            result = Math.min(hi, Math.max(lo, value)); break;
        }
        default: throw new Error('未知计算操作');
    }
    return result === 0 ? 0 : checked(result);
}
export function buildCalcSchema(base: BlockSchema | undefined): BlockSchema {
    if (!base) throw new Error('计算参数定义缺失');
    const schema: BlockSchema = { ...base };
    if (base.op.type !== 'enum') throw new Error('计算操作需要枚举参数');
    schema.op = { ...base.op, options: [...base.op.options, ...enhancedOperations.map(([value, label]) => ({value, label}))] };
    schema.a = {...base.a, visibleWhen:{field:'op',equals:'add'}};
    schema.b = {...base.b, visibleWhen:{field:'op',equals:'add'}};
    for (const op of ['sub','mul','div','pow','root','floor','round']) {
        schema[`${op}A`] = {type:'number',label:'a',visibleWhen:{field:'op',equals:op}};
        if (['sub','mul','div','pow'].includes(op)) schema[`${op}B`] = {type:'number',label:'b',visibleWhen:{field:'op',equals:op}};
    }
    const field = (op:string, key:string, label:string, defaultValue:string) => {
        schema[`${op}__${key}`] = {type:'string',label,default:defaultValue,required:true,visibleWhen:{field:'op',equals:op}};
    };
    field('expr','expression','公式（如 var("攻击") * 0.8 + 10）','0');
    for (const op of ['ceil','trunc','abs','round-digits','clamp']) field(op,'value','数值／变量公式','0');
    field('round-digits','digits','保留小数位数（0～6，可填变量公式）','2');
    for (const op of ['remainder','mod','min','max']) {
        field(op,'a',op === 'min' || op === 'max' ? '第一个数／变量公式' : '被除数／变量公式','0');
        field(op,'b',op === 'mod' ? '正模数／变量公式' : op === 'remainder' ? '非零除数／变量公式' : '第二个数／变量公式','1');
    }
    field('clamp','min','下限／变量公式','0');field('clamp','max','上限／变量公式','100');
    return schema;
}

