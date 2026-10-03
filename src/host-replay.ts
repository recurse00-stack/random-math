import { method as sdkMethod, type ExtensionContext, type BlockSchema, type ExtensionMethodDef, type ExtensionMethodReturns, type ExtensionMethodReturnValue } from "@avg-studio/sdk";
// Studio 2.0 replays extension actions after restoring slot variables. The SDK
// exposes getHost() as unknown; keep the optional host adaptation in one place.
// Unknown hosts conservatively preserve the snapshot during immediate replay.
export function isNavigationReplay(ctx: ExtensionContext): boolean {
    try {
        const host = ctx.getHost?.() as { application?: { scriptingSystem?: { getActiveSeekPurpose?: () => unknown } } } | undefined;
        return host?.application?.scriptingSystem?.getActiveSeekPurpose?.() === 'navigation';
    } catch { return false; }
}

export function replayMethod<const S extends BlockSchema | undefined = undefined, const R extends ExtensionMethodReturns | undefined = undefined>(def: ExtensionMethodDef<S, R>) {
    return sdkMethod<S, R>({ ...def,
        runImmediately(ctx, params) {
            if (isNavigationReplay(ctx)) return def.run.call(this, ctx, params);
            // Archived If outcomes are replayed by the host. Do not redraw,
            // reset pools, recompute formulas, or overwrite restored outputs.
            const fields = params as Record<string, unknown>;
            const output = typeof fields.outVar === 'string' ? ctx.variables.get(fields.outVar) : undefined;
            const kind = def.returns?.type;
            return (typeof output === kind ? output : kind === 'number' ? -1 : kind === 'string' ? '' : kind === 'boolean' ? false : undefined) as ExtensionMethodReturnValue<R>;
        },
        skip(ctx, params) { return def.run.call(this, ctx, params); },
    });
}
