import { registerHooks } from 'node:module';
registerHooks({resolve(specifier, context, next) {
  if (specifier === '@avg-studio/sdk') return {url:new URL('./runtime-sdk.mjs',import.meta.url).href,shortCircuit:true};
  return next(specifier,context);
}});
