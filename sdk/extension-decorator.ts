/**
 * @extension 类装饰器 —— meta() 的语法糖。
 *
 * 设计:docs/plans/2026-06-10-unified-extension-base-class-design.md §3.5
 *
 * ```ts
 * @extension({ id: "inventory", label: "背包系统" })
 * export class InventorySystem extends Extension { ... }
 * ```
 *
 * 与手写 `static meta = meta({...})` 完全等价 —— 装饰器只是把品牌对象
 * 写到类的静态 meta 上,loader 只认 property 形状,两种写法可共存。
 *
 * **双模式实现**:同时兼容两种编译语义 ——
 *   - TC39 stage-3(TS 5+ 默认 / esbuild 0.21+ / babel 2023-05):
 *     装饰器收到 (value, context),context.kind === "class"
 *   - legacy(experimentalDecorators: true,NestJS/Angular 系 tsconfig 常见):
 *     装饰器收到 (constructor) 单参
 * 两种约定下首参都是类本身,直接 assign meta 即可。
 *
 * 注意:浏览器没有原生装饰器,作者构建链必须把它编译掉 ——
 * 残留裸语法会在 bundle import 时直接报语法错误(loader 报
 * "执行扩展 bundle 失败"),是响的失败,不是哑的。
 */

import { meta, type ExtensionModuleMeta } from "./extension-meta";

export function extension(def: ExtensionModuleMeta) {
  const branded = meta(def);
  return function decorate<T>(value: T, _context?: unknown): T {
    if (typeof value !== "function") {
      throw new Error(
        "[extension] @extension 只能装饰类(收到的不是构造函数)。" +
          "请确认构建链按 stage-3 或 legacy 语义正确编译了装饰器。",
      );
    }
    (value as { meta?: ExtensionModuleMeta }).meta = branded;
    return value;
  };
}
