/**
 * 统一模块基类(Extension)的项目设置声明:settings() 品牌工厂。
 *
 * 设计:docs/plans/2026-06-10-unified-extension-base-class-design.md §3.4
 *
 * ```ts
 * class InventorySystem extends Extension {
 *   static settings = settings((s) => ({
 *     maxSlots: s.number("背包格数").default(20),
 *   }));
 * }
 * ```
 *
 * 与类静态 settingsSchema 同义 —— loader 归一化时把品牌对象里的
 * build 函数 assign 到 cls.settingsSchema,后续采集管线零改动。
 * 命名差异:存档 schema 保持叫 saveSchema(实例侧有 this.save 代理,
 * static 叫 save 会混淆);settingsSchema → settings 无此冲突,缩短。
 */

import type { AnyFieldBuilder, SettingsBuilder } from "./settings-builder";

const SETTINGS_BRAND = Symbol.for("avg.extension-settings");

export type SettingsBuildFn = (
  s: SettingsBuilder,
) => Record<string, AnyFieldBuilder>;

export interface BrandedExtensionSettings {
  readonly [SETTINGS_BRAND]: true;
  readonly build: SettingsBuildFn;
}

export function settings(build: SettingsBuildFn): BrandedExtensionSettings {
  return { [SETTINGS_BRAND]: true, build };
}

export function isExtensionSettings(
  v: unknown,
): v is BrandedExtensionSettings {
  return !!v && typeof v === "object" && SETTINGS_BRAND in v;
}
