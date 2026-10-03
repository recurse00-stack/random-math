/**
 * SaveSchema —— Extension 声明"自己要进存档的字段"。
 *
 * 2026-05-19 存档系统完善:扩展通过
 * `Extension.withSave(defineSave({...}))` 集中声明字段,SDK 在扩展加载时
 * 给它们注册 persistence + 默认值,
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
 * type 字段既用于 Studio 调试面板的语义分类，也会在扩展加载时校验默认值。
 */
interface SaveFieldSpecBase {
  persistence: VariablePersistence;
  /**
   * 可选:字段的人类可读说明,给 Studio 面板展示用(如"当前解锁的 CG 列表")。
   * 不填则面板只显示字段名。纯展示,不参与运行时。
   */
  label?: string;
}

/**
 * 字段类型与默认值通过判别联合绑定，避免声明为 number 却给出字符串默认值。
 */
export type SaveFieldSpec = SaveFieldSpecBase &
  (
    | { type: "number"; default: number }
    | { type: "string"; default: string }
    | { type: "boolean"; default: boolean }
    | { type: "list"; default: readonly unknown[] }
  );

export type SaveSchema = Record<string, SaveFieldSpec>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

interface SaveValueTraversalState {
  ancestors: Set<object>;
  seen: Set<object>;
}

function assertNoEnumerableSymbol(value: object, context: string): void {
  if (
    Object.getOwnPropertySymbols(value).some((key) =>
      Object.prototype.propertyIsEnumerable.call(value, key),
    )
  ) {
    throw new TypeError(`${context} 不能包含 Symbol 字段`);
  }
}

function assertPersistableSaveValueInternal(
  value: unknown,
  context: string,
  traversal: SaveValueTraversalState,
): void {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError(
        `${context} 必须是可稳定持久化的有限数字，且不能为 -0`,
      );
    }
    return;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${context} 不支持持久化 ${typeof value} 类型`);
  }
  if (traversal.ancestors.has(value)) {
    throw new TypeError(`${context} 不能包含循环引用`);
  }
  if (traversal.seen.has(value)) {
    throw new TypeError(`${context} 不能包含重复对象引用，请复制为独立值`);
  }

  traversal.seen.add(value);
  traversal.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      if (
        keys.length !== value.length ||
        keys.some((key, index) => key !== String(index))
      ) {
        throw new TypeError(
          `${context} 必须是连续数组，且不能包含自定义可枚举字段`,
        );
      }
      assertNoEnumerableSymbol(value, context);
      value.forEach((item, index) =>
        assertPersistableSaveValueInternal(
          item,
          `${context}[${index}]`,
          traversal,
        ),
      );
      return;
    }
    if (!isPlainRecord(value)) {
      const typeName = value.constructor?.name || "object";
      throw new TypeError(
        `${context} 不支持持久化 ${typeName}，仅支持基础值、数组和普通对象`,
      );
    }
    assertNoEnumerableSymbol(value, context);
    for (const [key, item] of Object.entries(value)) {
      assertPersistableSaveValueInternal(item, `${context}.${key}`, traversal);
    }
  } finally {
    traversal.ancestors.delete(value);
  }
}

/**
 * 断言一个值能被所有存档后端无损往返。
 *
 * 文件存档最终使用 JSON；浏览器存档使用 structured clone。这里只接受
 * 两者语义一致的交集，避免同一变量在不同平台被静默改写。
 */
export function assertPersistableSaveValue(
  value: unknown,
  context: string = "存档值",
): void {
  assertPersistableSaveValueInternal(value, context, {
    ancestors: new Set<object>(),
    seen: new Set<object>(),
  });
}

/**
 * 校验来自已编译 JavaScript 或第三方扩展的 schema。
 * TypeScript 只能保护源码作者，运行时仍需拒绝被强制断言或手写 JS 绕过的错误声明。
 */
export function assertSaveSchema(
  schema: unknown,
  context: string = "saveSchema",
): asserts schema is SaveSchema {
  if (!isPlainRecord(schema)) {
    throw new TypeError(`${context} 必须是字段定义对象`);
  }
  assertNoEnumerableSymbol(schema, context);

  for (const [key, candidate] of Object.entries(schema)) {
    if (!key.trim()) {
      throw new TypeError(`${context} 不能包含空字段名`);
    }
    if (!isPlainRecord(candidate)) {
      throw new TypeError(`${context}.${key} 必须是字段定义对象`);
    }
    assertNoEnumerableSymbol(candidate, `${context}.${key}`);

    const persistence = candidate.persistence;
    if (
      persistence !== "slot" &&
      persistence !== "session" &&
      persistence !== "shared"
    ) {
      throw new TypeError(
        `${context}.${key}.persistence 必须是 slot、session 或 shared`,
      );
    }

    const { type, default: defaultValue } = candidate;
    const validDefault =
      (type === "number" && typeof defaultValue === "number") ||
      (type === "string" && typeof defaultValue === "string") ||
      (type === "boolean" && typeof defaultValue === "boolean") ||
      (type === "list" && Array.isArray(defaultValue));
    if (!validDefault) {
      const actualType = Array.isArray(defaultValue)
        ? "list"
        : typeof defaultValue;
      throw new TypeError(
        `${context}.${key}.default 与 type=${String(type)} 不匹配（实际为 ${actualType}）`,
      );
    }
    if (type === "number" || type === "list") {
      assertPersistableSaveValue(
        defaultValue,
        `${context}.${key}.default`,
      );
    }

    if (candidate.label !== undefined && typeof candidate.label !== "string") {
      throw new TypeError(`${context}.${key}.label 必须是字符串`);
    }
  }
}

/**
 * 声明 save schema 的入口。
 *
 * `<const S>` 让 TS 把整个对象字面量类型(包括 default 的字面量类型)
 * 保留到返回值,使后续 InferSaveMap 能精确推导。
 *
 * 用法:
 * ```ts
 * const gallerySave = defineSave({
 *     lastPage:    { type: "number", persistence: "slot",   default: 0 },
 *     openedPanel: { type: "boolean", persistence: "session", default: false },
 *     unlockedCGs: { type: "list",   persistence: "shared", default: [] as string[] },
 * });
 * class GalleryExtension extends Extension.withSave(gallerySave) {
 * }
 * ```
 */
export function defineSave<const S extends SaveSchema>(schema: S): S {
  assertSaveSchema(schema);
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
  /** 写字段值(session 同步保留于本次启动,shared/slot 按各自存档策略写入) */
  set<K extends keyof M>(key: K, value: M[K]): void;
  /** React hook 形态,组件订阅字段变更并自动 re-render */
  useValue<K extends keyof M>(key: K): [M[K], (v: M[K]) => void];
}

/**
 * 扩展未声明 saveSchema 时,`this.save` 的 key 类型是 never，作者写
 * `this.save.get("anything")` 或 `set("anything", value)` 都会编译报错。语义合理 ——
 * "你这个扩展没声明任何存档字段"。
 */
export type EmptySaveAPI = SaveAPI<Record<never, never>>;
