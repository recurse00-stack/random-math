// SDK entry — UI 扩展作者从这里 import 一切公开 API。
//
// 严禁让本目录下的代码 import src/engine 或 src/studio。

export * from "./constants";
export * from "./version-compat";
export * from "./types";
// ExtensionProps / ExtensionRenderData 由 extension-module 显式 re-export,
// extension-base 这里只导出类本身,避免两个 export * 撞名被静默剔除。
export { ExtensionBase } from "./extension-base";
export * from "./block-extension";
// 扩展统一基类:一个类 = UI + 设置 + 存档 + 方法
export * from "./extension-module";
export * from "./extension-meta";
export * from "./extension-method";
export * from "./schedule-strategy";
export * from "./extension-settings";
export * from "./extension-decorator";
export {
  ExtensionInspector,
  type ExtensionInspectorProps,
} from "./extension-inspector";
export * from "./sdk-context";
export * from "./hooks";
export * from "./scope-extension-context";
export * from "./database-contract";
export * from "./settings-builder";
export * from "./save-schema";
export * from "./internal-system-slots";
export * from "./internal-actions";
