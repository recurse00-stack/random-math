import type { ExtensionContext } from "./sdk-context";
import type { SaveSchema } from "./save-schema";
import {
  ExtensionBase,
  type ExtensionProps,
  type ExtensionRenderData,
} from "./extension-base";

// 公开契约:这两个类型从这里 re-export(模块基类即扩展唯一基类后唯一出口)。
export type { ExtensionProps, ExtensionRenderData };
import type { BrandedExtensionMeta } from "./extension-meta";
import type { BrandedExtensionSettings } from "./extension-settings";
import {
  createExtensionMethodFactory,
  type ExtensionMethodFactory,
} from "./extension-method";

/** `Extension.withSave()` 返回的公开、可继续继承的泛型基类形状。 */
export type ExtensionWithSaveConstructor<Schema extends SaveSchema> =
  (abstract new <Props extends ExtensionProps = ExtensionProps>(
    data?: Props,
  ) => Extension<Props, Schema>) & {
    readonly extensionKind: "module";
    readonly saveSchema: Schema;
    readonly name: string;
    meta?: BrandedExtensionMeta;
    settings?: BrandedExtensionSettings;
    onRegister?(ctx: ExtensionContext): void | Promise<void>;
    readonly method: ExtensionMethodFactory;
  };

/**
 * 扩展统一基类 —— 一个类 = 一个完整游戏子模块。
 *
 * 设计:docs/plans/2026-06-10-unified-extension-base-class-design.md
 *
 * 一个 Extension 子类同时承载:
 *   - 身份:`@extension({...})` 装饰器,或 `static meta = meta({...})`
 *   - UI:  实现 render() 即有界面,Action block「显示界面」可见;
 *          不实现 = 纯方法模块
 *   - 方法:`static xxx = this.method({...})`,Action block「调用方法」可见
 *   - 存档:`Extension.withSave(defineSave({...}))`,UI 和方法共享 this.save
 *   - 设置:`static settings = settings((s) => ({...}))`
 *
 * ```ts
 * const inventorySave = defineSave({
 *     items: { type: "list", persistence: "slot", default: [] as string[] },
 * });
 *
 * @extension({ id: "inventory", label: "背包系统" })
 * export class InventorySystem extends Extension.withSave(inventorySave) {
 *
 *   static addItem = this.method({
 *     title: "增加物品",
 *     schema: { itemId: { type: "string", label: "物品 ID", required: true } },
 *     async run(ctx, params) {
 *       this.save.set("items", [...this.save.get("items"), params.itemId]);
 *     },
 *   });
 *
 *   render() {
 *     return { component: InventoryView, props: {} };
 *   }
 * }
 * ```
 *
 * 状态铁律:方法每次调用拿新实例,`this` 上的临时字段不持久 ——
 * 状态只能放 `this.save`(随存档)或 `ctx.variables`。
 */
export abstract class Extension<
  P extends ExtensionProps = ExtensionProps,
  S extends SaveSchema | undefined = undefined,
> extends ExtensionBase<P, S> {
  static readonly extensionKind = "module";

  /** 身份声明(meta() 品牌或 @extension 装饰器写入)。缺省全部走推导。 */
  static meta?: BrandedExtensionMeta;

  /** 项目设置声明(settings() 品牌)。loader 归一化为 settingsSchema。 */
  static settings?: BrandedExtensionSettings;

  /** 存档字段声明(defineSave)。 */
  static saveSchema?: SaveSchema;

  /**
   * 声明扩展静态方法。必须以 `this.method({...})` 调用，接收者的 polymorphic
   * static this 会把实际子类实例类型带进 run/runImmediately/skip 回调。
   */
  static readonly method = createExtensionMethodFactory();

  /**
   * 创建带强类型存档 schema 的 Extension 基类。
   *
   * TypeScript 无法从实例侧自动读取子类的 static saveSchema；这个工厂把同一份
   * schema 同时放到返回基类的 static saveSchema、实例泛型和绑定 method() 上，
   * 因此 UI/实例方法与 `static xxx = this.method({...})` 回调中的 get/set key、
   * value 都来自真实运行时声明。返回类保留 Props 泛型：有自定义 UI props
   * 时可写 `class X extends Extension.withSave(schema)<XProps>`。
   */
  static withSave<const Schema extends SaveSchema>(
    schema: Schema,
  ): ExtensionWithSaveConstructor<Schema> {
    abstract class ExtensionWithSave<
      Props extends ExtensionProps = ExtensionProps,
    > extends Extension<Props, Schema> {
      static readonly saveSchema = schema;
    }
    return ExtensionWithSave as ExtensionWithSaveConstructor<Schema>;
  }

  /**
   * 模块级初始化钩子,引擎启动期统一调用一次(无论是否 autonomous)——
   * 模块即系统,注册快捷键/订阅事件等天然属于启动期。
   * ctx 已 scope 到 (extensionId, moduleId)。
   */
  static onRegister?(ctx: ExtensionContext): void | Promise<void>;

  /**
   * 返回界面(可选)。实现了 = 该模块出现在「显示界面」picker;
   * 不实现 = 纯方法模块。
   */
  render?(): ExtensionRenderData<P>;
}

/** Extension 子类的构造器形状(loader / host 用)。 */
export type ExtensionModuleConstructor = {
  new (data?: any): Extension<any, any>;
  readonly extensionKind: "module";
  name: string;
  meta?: BrandedExtensionMeta;
  settings?: BrandedExtensionSettings;
  saveSchema?: SaveSchema;
  onRegister?(ctx: ExtensionContext): void | Promise<void>;
};
