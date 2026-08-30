/**
 * SaveSchema —— Extension 声明"自己要进存档的字段"。
 *
 * 2026-05-19 存档系统完善:扩展通过 `static saveSchema = defineSave({...})`
 * 集中声明字段,SDK 在扩展加载时给它们注册 persistence + 默认值,
 * 运行时通过 `this.save.get/set/useValue` 强类型访问。
 *
 * 设计要点:
 * - **对象字面量声明**(非 builder DSL):TypeScript 5+ const 类型参数把字面量类型
 *   完整保留到 SaveAPI<M> 推导,自动补全 key 名、强类型 value、编译期拦下拼写错误
 * - **list 用 readonly**:get 返回 readonly T[],push/pop 编译报错,
 *   逼迫整体替换 set(避免内部 mutation 不触发 debounce flush)
 * - **运行时实现极简**:proxy → variableSystem.get/set(`<extId>.<key>`)
 *
 * 见 /docs/plans/2026-05-19-savegame-variable-scope-design.md §7
 */

import type { VariablePersistence } from "./types/schema";

/**
 * 单个 save 字段的完整规格。
 * type 字段先做语义分类(将来 Studio 调试面板渲染类型用),不参与运行时校验。
 */
export interface SaveFieldSpec {
  type: "number" | "string" | "boolean" | "list";
  persistence: VariablePersistence;
  default: unknown;
  /**
   * 可选:字段的人类可读说明,给 Studio 面板展示用(如"当前解锁的 CG 列表")。
   * 不填则面板只显示字段名。纯展示,不参与运行时。
   */
  label?: string;
}

export type SaveSchema = Record<string, SaveFieldSpec>;

/**
 * 声明 save schema 的入口。
 *
 * `<const S>` 让 TS 把整个对象字面量类型(包括 default 的字面量类型)
 * 保留到返回值,使后续 InferSaveMap 能精确推导。
 *
 * 用法:
 * ```ts
 * class GalleryExtension extends Extension {
 *   static saveSchema = defineSave({
 *     lastPage:    { type: "number", persistence: "slot",   default: 0 },
 *     unlockedCGs: { type: "list",   persistence: "shared", default: [] as string[] },
 *   })
 * }
 * ```
 */
export function defineSave<const S extends SaveSchema>(schema: S): S {
  return schema;
}

/**
 * default 字面量类型 → 运行时实际写入/读出类型。
 * - number/string/boolean: 字面量类型宽化为通用类型(`0` → number,`true` → boolean)
 * - readonly array / array: 全部变 readonly,逼迫整体替换写入
 *
 * 注意:这里默认 array 是 readonly,所以扩展作者写 `default: [] as string[]`
 * get 出来是 `readonly string[]`,push 编译报错;set 接受 readonly string[]
 * (兼容传 readonly 参数)和 string[](因为 TS 数组到 readonly 数组是协变赋值)。
 */
export type Widen<T> =
  T extends number ? number :
  T extends string ? string :
  T extends boolean ? boolean :
  T extends readonly (infer U)[] ? readonly U[] :
  T;

/**
 * Schema → "key → value 类型" 映射。SaveAPI<M> 的 M 由它生成。
 */
export type InferSaveMap<S extends SaveSchema> = {
  [K in keyof S]: S[K] extends { default: infer D } ? Widen<D> : never;
};

/**
 * 扩展实例上的 `this.save` 接口类型。
 * 泛型 M 从 saveSchema 推导出来,key 自动补全 + value 类型自动推断。
 */
export interface SaveAPI<M extends Record<string, unknown>> {
  /** 读字段当前值 */
  get<K extends keyof M>(key: K): M[K];
  /** 写字段值(自动持久化:shared 触发 debounce flush,slot 等下次 save(slotId)) */
  set<K extends keyof M>(key: K, value: M[K]): void;
  /** React hook 形态,组件订阅字段变更并自动 re-render */
  useValue<K extends keyof M>(key: K): [M[K], (v: M[K]) => void];
}

/**
 * 扩展未声明 saveSchema 时,`this.save` 的类型是 SaveAPI<{}>,
 * 任何 key 都 never,作者写 `this.save.get("anything")` 编译报错:
 * "never is not assignable to never"。语义合理 ——
 * "你这个扩展没声明任何存档字段"。
 */
export type EmptySaveAPI = SaveAPI<Record<string, never>>;
