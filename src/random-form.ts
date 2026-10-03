import type { BlockSchema } from '@avg-studio/sdk';
import { LegacyMath } from './legacy.js';

// Keep the original default and fields: old chapters (including If bindings)
// must not acquire a new mode simply by opening or saving their form.
const legacy: BlockSchema = LegacyMath.rand.schema!;
const presets = {
    'single-fresh': { label: '单个随机数 · 每次重抽', batch: false, fixed: false },
    'batch-fresh': { label: '批量随机数 · 每次重抽', batch: true, fixed: false },
    'single-fixed': { label: '单个随机数 · 首次抽取后固定', batch: false, fixed: true },
    'batch-fixed': { label: '批量随机数 · 首次抽取后固定', batch: true, fixed: true },
} as const;
const fieldsFor = (batch: boolean, fixed: boolean) => [
    'min', 'max', 'digits', 'includeMin', 'includeMax',
    ...(batch ? ['count', 'prefix'] : ['outVar']), 'reportVar',
    ...(fixed ? ['fixedKey', 'fixedPolicy'] : []),
];

export const randSchema: BlockSchema = {
    action: { type: 'enum', label: '执行什么', default: 'generate', options: [
        ...Object.entries(presets).map(([value, p]) => ({ value, label: p.label })),
        { value: 'generate', label: '完整参数（兼容既有调用）' },
        { value: 'reset', label: '清除指定固定记录' },
    ] },
};
for (const [key, field] of Object.entries(legacy)) {
    randSchema[key] = ['successVar', 'errorVar'].includes(key)
        ? field : { ...field, visibleWhen: { field: 'action', equals: 'generate' } };
}
for (const [action, preset] of Object.entries(presets)) {
    for (const key of fieldsFor(preset.batch, preset.fixed)) {
        const field = key === 'count'
            ? { type: 'number' as const, label: '批量数量', default: 2, min: 2, max: 100, step: 1 }
            : legacy[key];
        randSchema[`${action}__${key}`] = {
            ...field,
            visibleWhen: { field: 'action', equals: action },
        };
    }
}
randSchema.resetKey = { type: 'string', label: '要清除的固定记录名', default: '', visibleWhen: { field: 'action', equals: 'reset' } };

export function randomParams(p: Record<string, unknown>): Record<string, unknown> {
    const action = String(p.action ?? 'generate');
    const preset = presets[action as keyof typeof presets];
    if (!preset) return p;
    const result: Record<string, unknown> = {
        mode: preset.fixed ? 'sticky' : 'fresh', count: preset.batch ? 2 : 1,
        successVar: p.successVar, errorVar: p.errorVar,
    };
    for (const key of fieldsFor(preset.batch, preset.fixed)) {
        const field = randSchema[`${action}__${key}`];
        const value = p[`${action}__${key}`] ?? ('default' in field ? field.default : undefined);
        if (value !== undefined) result[key] = value;
    }
    return result;
}
