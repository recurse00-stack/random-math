import { assertValidExtensionActionId } from "./internal-actions";
import type { DatabaseAPI } from "./types/database";
import type {
  ExtensionResourceAPI,
  ExtensionContext,
  InputAPI,
  NativeAPI,
  SettingsAPI,
  UIAPI,
} from "./sdk-context";

/**
 * 工厂签名 —— 给 scopeExtensionContext 注入 SettingsAPI 实现。
 *
 * SDK 层不知道 settings 怎么读写(那是宿主的事),由 caller 提供工厂。
 * Studio 端的 createScopedSettings(extId, uiId?) 实现这个接口。
 * Player 端可以传不同实现(比如只读的)。
 */
export type ScopedSettingsFactory = (
  extensionId: string,
  uiId?: string,
) => SettingsAPI;

/** 宿主按扩展身份决定是否授予原生能力。 */
export type ScopedNativeFactory = (extensionId: string) => NativeAPI;

/** 宿主把项目数据能力按扩展身份收窄后的工厂。 */
export type ScopedDatabaseFactory = (extensionId: string) => DatabaseAPI;

/** 宿主把扩展发行目录资源按扩展身份绑定后的工厂。 */
export type ScopedExtensionResourceFactory = (
  extensionId: string,
) => ExtensionResourceAPI;

const scopedDatabaseFactoryKey = Symbol("avg.scoped-database-factory");
const scopedExtensionResourceFactoryKey = Symbol(
  "avg.scoped-extension-resource-factory",
);

type DatabaseFactoryContext = ExtensionContext & {
  [scopedDatabaseFactoryKey]?: ScopedDatabaseFactory;
};

type ExtensionResourceFactoryContext = ExtensionContext & {
  [scopedExtensionResourceFactoryKey]?: ScopedExtensionResourceFactory;
};

/**
 * 宿主内部使用：把按扩展隔离的数据 API 工厂挂到无身份的基础 context。
 * 该能力不会作为 ExtensionContext 字段暴露给扩展。
 */
export function attachScopedDatabaseFactory(
  context: ExtensionContext,
  factory: ScopedDatabaseFactory,
): ExtensionContext {
  Object.defineProperty(context, scopedDatabaseFactoryKey, {
    configurable: false,
    enumerable: false,
    value: factory,
    writable: false,
  });
  return context;
}

/**
 * 宿主内部使用：把扩展资源工厂挂到无身份基础 context。
 * Symbol + non-enumerable 避免把宿主工厂作为 SDK 公共字段泄露给扩展。
 */
export function attachScopedExtensionResourceFactory(
  context: ExtensionContext,
  factory: ScopedExtensionResourceFactory,
): ExtensionContext {
  Object.defineProperty(context, scopedExtensionResourceFactoryKey, {
    configurable: false,
    enumerable: false,
    value: factory,
    writable: false,
  });
  return context;
}

export const UNAVAILABLE_DATABASE_API: DatabaseAPI = {
  collection(alias) {
    throw new Error(
      `[sdk] 当前宿主没有为数据依赖 "${alias}" 提供项目数据库能力`,
    );
  },
};

function unavailableExtensionResource(): never {
  throw new Error("[sdk] 当前宿主没有提供扩展发行目录资源能力");
}

export const UNAVAILABLE_EXTENSION_RESOURCE_API: ExtensionResourceAPI = {
  url: unavailableExtensionResource,
  importModule: unavailableExtensionResource,
  createWorker: unavailableExtensionResource,
};

/**
 * 把一个"全局" ExtensionContext 包成"绑定到 (extensionId, uiId?)"的 scoped 版本。
 *
 * 做的事:
 *   - ctx.ui.show / hide / isVisible 自动把无 "/" 的路径补成 "${selfId}/path"
 *     (uiId 不影响 ui 路径,只影响 settings)
 *   - ctx.settings 调用 settingsFactory(selfId, uiId) 生成绑定到 (selfId, uiId) 的实例
 *   - 若没传 settingsFactory(罕见),settings 直接 pass-through base.settings
 *
 * 双层 scope:
 *   - 一级:extensionId(必传)
 *   - 二级:uiId(可选,UI 子模块级,settings 自动加 `<uiId>.` 前缀)
 *
 * 其他 API pass-through。
 */
export function scopeExtensionContext(
  base: ExtensionContext,
  selfId: string,
  uiId?: string,
  settingsFactory?: ScopedSettingsFactory,
  nativeFactory?: ScopedNativeFactory,
): ExtensionContext {
  const absolutize = (path: string): string =>
    path.includes("/") ? path : `${selfId}/${path}`;

  const ui: UIAPI = {
    show: (path, props, options) =>
      base.ui.show(absolutize(path), props, options),
    hide: (path) => base.ui.hide(absolutize(path)),
    hideAll: () => base.ui.hideAll(),
    isVisible: (path) => base.ui.isVisible(absolutize(path)),
  };

  const settings: SettingsAPI = settingsFactory
    ? settingsFactory(selfId, uiId)
    : base.settings;
  const native = nativeFactory ? nativeFactory(selfId) : base.native;
  const databaseFactory = (base as DatabaseFactoryContext)[
    scopedDatabaseFactoryKey
  ];
  const database = databaseFactory
    ? databaseFactory(selfId)
    : base.database;
  const extensionResourceFactory = (base as ExtensionResourceFactoryContext)[
    scopedExtensionResourceFactoryKey
  ];
  const extensionResource = extensionResourceFactory
    ? extensionResourceFactory(selfId)
    : base.extensionResource;

  // 2026-05 Internal Extension Points:registerAction 校验命名空间,要求
  // 扩展 action id 必须以扩展自身 id 为前缀。在 scope 包装时拦截,因为只有这里
  // 拿得到 selfId(base context 是无身份的)。
  const input: InputAPI = {
    ...base.input,
    registerAction(action) {
      assertValidExtensionActionId(action.id, selfId);
      base.input.registerAction(action);
    },
  };

  return {
    ...base,
    ui,
    settings,
    input,
    native,
    database,
    extensionResource,
  };
}
