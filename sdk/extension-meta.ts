/**
 * 统一模块基类(Extension)的身份声明:meta() 品牌工厂。
 *
 * 设计:docs/plans/2026-06-10-unified-extension-base-class-design.md §3.2
 *
 * 身份字段(id/label/description/category)和模块级行为声明
 * (autonomous/supportsSlot)收编成一个品牌化静态 property:
 *
 * ```ts
 * class InventorySystem extends Extension {
 *   static meta = meta({ id: "inventory", label: "背包系统" });
 * }
 * ```
 *
 * `@extension({...})` 装饰器(extension-decorator.ts)是它的语法糖,
 * 落点完全一致 —— loader 只认 property 形状。
 */

const META_BRAND = Symbol.for("avg.extension-meta");

export interface ExtensionModuleMeta {
  /**
   * 子模块 id,kebab-case。缺省由类名推导(InventorySystem → inventory-system)。
   * 发布后建议锁定 —— 老剧本通过 "extId/<id>" 引用它,改名即断链。
   */
  id?: string;
  /** 显示名,UI picker / 方法 picker 通用。缺省取 id。 */
  label?: string;
  description?: string;
  /** picker 里的分组。 */
  category?: string;
  /** true = 引擎启动即自动注册(常驻 HUD / 全局快捷键)。 */
  autonomous?: boolean;
  /**
   * false = 即使实现了 render(),也只作为控制器/方法模块加载,不向 UI host、
   * 「显示界面」选择器和系统槽位导出该 React UI。缺省为 true。
   */
  exposeUI?: boolean;
  /** 声明实现哪个内置系统槽位(internal.system.*)。 */
  supportsSlot?: string | string[];
}

export type BrandedExtensionMeta = ExtensionModuleMeta & {
  readonly [META_BRAND]: true;
};

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 声明模块身份。dev 下做基本校验,报错尽量带上下文。 */
export function meta(def: ExtensionModuleMeta): BrandedExtensionMeta {
  if (def.id !== undefined && !KEBAB_RE.test(def.id)) {
    throw new Error(
      `[meta] 模块 id "${def.id}" 不合法:只允许 kebab-case(a-z、0-9、-)。`,
    );
  }
  return Object.assign({ ...def }, { [META_BRAND]: true as const });
}

export function isExtensionMeta(v: unknown): v is BrandedExtensionMeta {
  return !!v && typeof v === "object" && META_BRAND in v;
}
