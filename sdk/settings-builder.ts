/**
 * SettingsBuilder — 链式 API,用于声明 Extension / BlockExtension 的 settingsSchema。
 *
 * 设计:每种字段类型一个 FieldBuilder class,modifier 是该 class 上的方法。
 * IDE 调 `.` 时只列该类型合法的 modifier(boolean 不会出现 `.range()`)。
 *
 * 使用:
 * ```ts
 * static settingsSchema(s: SettingsBuilder) {
 *   return {
 *     slotCount:   s.number("槽位数量").default(30).range(1, 200),
 *     allowDelete: s.boolean("允许删除").default(true),
 *   };
 * }
 * ```
 *
 * 平台收集时调每个 builder 的 .build() 拿到运行时 SettingsField 形态。
 */

import type {
  StringField,
  NumberField,
  BooleanField,
  EnumField,
  ShortcutField,
  UIRefField,
  FragmentRefField,
  FragmentRefValue,
  AssetField,
  CharacterField,
  ColorField,
  ArrayField,
  ArrayItemField,
  ArrayFieldTablePresentation,
  SettingsField,
  FieldEnableCondition,
} from "./types/settings-schema";

// ============================================================
// FieldBuilder classes
// ============================================================

/**
 * String 字段 builder。
 * phantom TDefault 让 .default(v) 把字面量类型带进 build() 输出,
 * 配合 SchemaOf 让上层 ctx.settings.get(key) 推断出 string default 的精确类型。
 */
class StringFieldBuilder<TDefault extends string | undefined = undefined> {
  private readonly _label: string;
  private _default?: string;
  private _multiline = false;
  private _description?: string;
  private _enabledWhen?: FieldEnableCondition;

  constructor(label: string) {
    this._label = label;
  }

  default<V extends string>(v: V): StringFieldBuilder<V> {
    this._default = v;
    return this as unknown as StringFieldBuilder<V>;
  }
  multiline(): this {
    this._multiline = true;
    return this;
  }
  describe(text: string): this {
    this._description = text;
    return this;
  }
  enabledWhen(key: string, equals: unknown = true): this {
    this._enabledWhen = { key, equals };
    return this;
  }
  build(): StringField & { default?: TDefault } {
    const f: StringField = { type: "string", label: this._label };
    if (this._default !== undefined) f.default = this._default;
    if (this._multiline) f.multiline = true;
    if (this._description) f.description = this._description;
    if (this._enabledWhen) f.enabledWhen = this._enabledWhen;
    return f as StringField & { default?: TDefault };
  }
}

class NumberFieldBuilder<TDefault extends number | undefined = undefined> {
  private readonly _label: string;
  private _default?: number;
  private _min?: number;
  private _max?: number;
  private _step?: number;
  private _description?: string;
  private _enabledWhen?: FieldEnableCondition;

  constructor(label: string) {
    this._label = label;
  }

  default<V extends number>(v: V): NumberFieldBuilder<V> {
    this._default = v;
    return this as unknown as NumberFieldBuilder<V>;
  }
  range(min: number, max: number): this {
    this._min = min;
    this._max = max;
    return this;
  }
  step(n: number): this {
    this._step = n;
    return this;
  }
  describe(text: string): this {
    this._description = text;
    return this;
  }
  enabledWhen(key: string, equals: unknown = true): this {
    this._enabledWhen = { key, equals };
    return this;
  }
  build(): NumberField & { default?: TDefault } {
    const f: NumberField = { type: "number", label: this._label };
    if (this._default !== undefined) f.default = this._default;
    if (this._min !== undefined) f.min = this._min;
    if (this._max !== undefined) f.max = this._max;
    if (this._step !== undefined) f.step = this._step;
    if (this._description) f.description = this._description;
    if (this._enabledWhen) f.enabledWhen = this._enabledWhen;
    return f as NumberField & { default?: TDefault };
  }
}

class BooleanFieldBuilder<TDefault extends boolean | undefined = undefined> {
  private readonly _label: string;
  private _default?: boolean;
  private _description?: string;
  private _enabledWhen?: FieldEnableCondition;

  constructor(label: string) {
    this._label = label;
  }

  default<V extends boolean>(v: V): BooleanFieldBuilder<V> {
    this._default = v;
    return this as unknown as BooleanFieldBuilder<V>;
  }
  describe(text: string): this {
    this._description = text;
    return this;
  }
  enabledWhen(key: string, equals: unknown = true): this {
    this._enabledWhen = { key, equals };
    return this;
  }
  build(): BooleanField & { default?: TDefault } {
    const f: BooleanField = { type: "boolean", label: this._label };
    if (this._default !== undefined) f.default = this._default;
    if (this._description) f.description = this._description;
    if (this._enabledWhen) f.enabledWhen = this._enabledWhen;
    return f as BooleanField & { default?: TDefault };
  }
}

/**
 * Enum 字段 builder。
 * TValues 锁住合法值列表(用 `as const` 元组才能拿到字面量联合);
 * .default(v) 只接受 TValues[number]。
 */
class EnumFieldBuilder<
  TValues extends readonly string[],
  TDefault extends TValues[number] | undefined = undefined,
> {
  private readonly _label: string;
  private readonly _values: TValues;
  private _default?: string;
  private _labels: Partial<Record<string, string>> = {};
  private _description?: string;
  private _enabledWhen?: FieldEnableCondition;

  constructor(label: string, values: TValues) {
    this._label = label;
    this._values = values;
  }

  default<V extends TValues[number]>(v: V): EnumFieldBuilder<TValues, V> {
    this._default = v;
    return this as unknown as EnumFieldBuilder<TValues, V>;
  }
  labels(map: Record<TValues[number], string>): this {
    this._labels = map as Partial<Record<string, string>>;
    return this;
  }
  describe(text: string): this {
    this._description = text;
    return this;
  }
  enabledWhen(key: string, equals: unknown = true): this {
    this._enabledWhen = { key, equals };
    return this;
  }
  build(): EnumField & { default?: TDefault } {
    const options = this._values.map((value) => ({
      value,
      label: this._labels[value] ?? value,
    }));
    const f: EnumField = { type: "enum", label: this._label, options };
    if (this._default !== undefined) f.default = this._default;
    if (this._description) f.description = this._description;
    if (this._enabledWhen) f.enabledWhen = this._enabledWhen;
    return f as EnumField & { default?: TDefault };
  }
}

class ShortcutFieldBuilder<TDefault extends string | undefined = undefined> {
  private readonly _label: string;
  private _default?: string;
  private _description?: string;
  private _enabledWhen?: FieldEnableCondition;

  constructor(label: string) {
    this._label = label;
  }

  default<V extends string>(v: V): ShortcutFieldBuilder<V> {
    this._default = v;
    return this as unknown as ShortcutFieldBuilder<V>;
  }
  describe(text: string): this {
    this._description = text;
    return this;
  }
  enabledWhen(key: string, equals: unknown = true): this {
    this._enabledWhen = { key, equals };
    return this;
  }
  build(): ShortcutField & { default?: TDefault } {
    const f: ShortcutField = { type: "shortcut", label: this._label };
    if (this._default !== undefined) f.default = this._default;
    if (this._description) f.description = this._description;
    if (this._enabledWhen) f.enabledWhen = this._enabledWhen;
    return f as ShortcutField & { default?: TDefault };
  }
}

class UIRefFieldBuilder<TDefault extends string | undefined = undefined> {
  private readonly _label: string;
  private _default?: string;
  private _description?: string;
  private _enabledWhen?: FieldEnableCondition;

  constructor(label: string) {
    this._label = label;
  }

  default<V extends string>(v: V): UIRefFieldBuilder<V> {
    this._default = v;
    return this as unknown as UIRefFieldBuilder<V>;
  }
  describe(text: string): this {
    this._description = text;
    return this;
  }
  enabledWhen(key: string, equals: unknown = true): this {
    this._enabledWhen = { key, equals };
    return this;
  }
  build(): UIRefField & { default?: TDefault } {
    const f: UIRefField = { type: "ui-ref", label: this._label };
    if (this._default !== undefined) f.default = this._default;
    if (this._description) f.description = this._description;
    if (this._enabledWhen) f.enabledWhen = this._enabledWhen;
    return f as UIRefField & { default?: TDefault };
  }
}

class FragmentRefFieldBuilder {
  private readonly _label: string;
  private _default?: FragmentRefValue;
  private _description?: string;
  private _enabledWhen?: FieldEnableCondition;

  constructor(label: string) {
    this._label = label;
  }

  default(value: FragmentRefValue): this {
    this._default = { ...value };
    return this;
  }
  describe(text: string): this {
    this._description = text;
    return this;
  }
  enabledWhen(key: string, equals: unknown = true): this {
    this._enabledWhen = { key, equals };
    return this;
  }
  build(): FragmentRefField {
    const field: FragmentRefField = {
      type: "fragment-ref",
      label: this._label,
    };
    if (this._default) field.default = { ...this._default };
    if (this._description) field.description = this._description;
    if (this._enabledWhen) field.enabledWhen = this._enabledWhen;
    return field;
  }
}

type AssetKind = "image" | "audio" | "video" | "any";

class AssetFieldBuilder {
  private readonly _label: string;
  private _accepts?: AssetKind[];
  private _description?: string;
  private _enabledWhen?: FieldEnableCondition;

  constructor(label: string) {
    this._label = label;
  }

  accepts(...kinds: AssetKind[]): this {
    this._accepts = kinds;
    return this;
  }
  describe(text: string): this {
    this._description = text;
    return this;
  }
  enabledWhen(key: string, equals: unknown = true): this {
    this._enabledWhen = { key, equals };
    return this;
  }
  build(): AssetField {
    const f: AssetField = { type: "asset", label: this._label };
    if (this._accepts && this._accepts.length > 0) f.accepts = this._accepts;
    if (this._description) f.description = this._description;
    if (this._enabledWhen) f.enabledWhen = this._enabledWhen;
    return f;
  }
}

class CharacterFieldBuilder<TDefault extends string | undefined = undefined> {
  private readonly _label: string;
  private _default?: string;
  private _description?: string;
  private _enabledWhen?: FieldEnableCondition;

  constructor(label: string) {
    this._label = label;
  }

  /** 默认选中的角色 —— 传 id,不要传显示名。 */
  default<V extends string>(v: V): CharacterFieldBuilder<V> {
    this._default = v;
    return this as unknown as CharacterFieldBuilder<V>;
  }
  describe(text: string): this {
    this._description = text;
    return this;
  }
  enabledWhen(key: string, equals: unknown = true): this {
    this._enabledWhen = { key, equals };
    return this;
  }
  build(): CharacterField & { default?: TDefault } {
    const f: CharacterField = { type: "character", label: this._label };
    if (this._default !== undefined) f.default = this._default;
    if (this._description) f.description = this._description;
    if (this._enabledWhen) f.enabledWhen = this._enabledWhen;
    return f as CharacterField & { default?: TDefault };
  }
}

class ColorFieldBuilder<TDefault extends string | undefined = undefined> {
  private readonly _label: string;
  private _default?: string;
  private _allowAlpha?: boolean;
  private _description?: string;
  private _enabledWhen?: FieldEnableCondition;

  constructor(label: string) {
    this._label = label;
  }

  default<V extends string>(v: V): ColorFieldBuilder<V> {
    this._default = v;
    return this as unknown as ColorFieldBuilder<V>;
  }
  /** 允许调透明度。 */
  allowAlpha(v: boolean = true): this {
    this._allowAlpha = v;
    return this;
  }
  describe(text: string): this {
    this._description = text;
    return this;
  }
  enabledWhen(key: string, equals: unknown = true): this {
    this._enabledWhen = { key, equals };
    return this;
  }
  build(): ColorField & { default?: TDefault } {
    const f: ColorField = { type: "color", label: this._label };
    if (this._default !== undefined) f.default = this._default;
    if (this._allowAlpha !== undefined) f.allowAlpha = this._allowAlpha;
    if (this._description) f.description = this._description;
    if (this._enabledWhen) f.enabledWhen = this._enabledWhen;
    return f as ColorField & { default?: TDefault };
  }
}

/**
 * array 行内可用的 builder —— 是 SettingsBuilder 的子集。
 *
 * 不含 array(不支持嵌套)；快捷键和界面引用需要由 Studio 传入当前扩展及
 * 行字段路径，供冲突检测和 self UI 引用解析。
 */
export interface ArrayItemBuilder {
  string(label: string): StringFieldBuilder;
  number(label: string): NumberFieldBuilder;
  boolean(label: string): BooleanFieldBuilder;
  enum<T extends readonly string[]>(
    label: string,
    values: T,
  ): EnumFieldBuilder<T>;
  shortcut(label: string): ShortcutFieldBuilder;
  uiRef(label: string): UIRefFieldBuilder;
  fragmentRef(label: string): FragmentRefFieldBuilder;
  asset(label: string): AssetFieldBuilder;
  character(label: string): CharacterFieldBuilder;
  color(label: string): ColorFieldBuilder;
}

function createArrayItemBuilder(): ArrayItemBuilder {
  return {
    string: (label) => new StringFieldBuilder(label),
    number: (label) => new NumberFieldBuilder(label),
    boolean: (label) => new BooleanFieldBuilder(label),
    enum: (label, values) => new EnumFieldBuilder(label, values),
    shortcut: (label) => new ShortcutFieldBuilder(label),
    uiRef: (label) => new UIRefFieldBuilder(label),
    fragmentRef: (label) => new FragmentRefFieldBuilder(label),
    asset: (label) => new AssetFieldBuilder(label),
    character: (label) => new CharacterFieldBuilder(label),
    color: (label) => new ColorFieldBuilder(label),
  };
}

/** array 行内子字段的 builder 集合 —— 键名即行对象里的属性名。 */
type ArrayItemBuilders = Record<string, { build(): ArrayItemField }>;

class ArrayFieldBuilder {
  private readonly _label: string;
  private readonly _itemFields: Record<string, ArrayItemField>;
  private _itemDefault?: Record<string, unknown>;
  private _maxItems?: number;
  private _addLabel?: string;
  private _emptyHint?: string;
  private _presentation?: ArrayFieldTablePresentation;
  private _description?: string;
  private _enabledWhen?: FieldEnableCondition;

  constructor(label: string, buildItem: (item: ArrayItemBuilder) => ArrayItemBuilders) {
    this._label = label;
    const builders = buildItem(createArrayItemBuilder());
    this._itemFields = Object.fromEntries(
      Object.entries(builders).map(([key, builder]) => [key, builder.build()]),
    );
  }

  /** 新增一行时的初始值。 */
  itemDefault(v: Record<string, unknown>): this {
    this._itemDefault = v;
    return this;
  }
  /** 最多几行。 */
  maxItems(n: number): this {
    this._maxItems = n;
    return this;
  }
  /** 「添加」按钮的文字。 */
  addLabel(text: string): this {
    this._addLabel = text;
    return this;
  }
  /** 一行都没有时的提示。 */
  emptyHint(text: string): this {
    this._emptyHint = text;
    return this;
  }
  /** 把大型资料数组显示为“二维表格摘要 + 逐行展开详情”。 */
  table(options: Omit<ArrayFieldTablePresentation, "mode">): this {
    this._presentation = { mode: "expandable-table", ...options };
    return this;
  }
  describe(text: string): this {
    this._description = text;
    return this;
  }
  enabledWhen(key: string, equals: unknown = true): this {
    this._enabledWhen = { key, equals };
    return this;
  }
  build(): ArrayField {
    const f: ArrayField = {
      type: "array",
      label: this._label,
      itemFields: this._itemFields,
    };
    if (this._itemDefault !== undefined) f.itemDefault = this._itemDefault;
    if (this._maxItems !== undefined) f.maxItems = this._maxItems;
    if (this._addLabel) f.addLabel = this._addLabel;
    if (this._emptyHint) f.emptyHint = this._emptyHint;
    if (this._presentation) f.presentation = this._presentation;
    if (this._description) f.description = this._description;
    if (this._enabledWhen) f.enabledWhen = this._enabledWhen;
    return f;
  }
}

// ============================================================
// SettingsBuilder interface + factory
// ============================================================

export interface SettingsBuilder {
  string(label: string): StringFieldBuilder;
  number(label: string): NumberFieldBuilder;
  boolean(label: string): BooleanFieldBuilder;
  enum<T extends readonly string[]>(label: string, values: T): EnumFieldBuilder<T>;
  shortcut(label: string): ShortcutFieldBuilder;
  uiRef(label: string): UIRefFieldBuilder;
  fragmentRef(label: string): FragmentRefFieldBuilder;
  asset(label: string): AssetFieldBuilder;
  /** 角色选择器 —— 值是角色 id。 */
  character(label: string): CharacterFieldBuilder;
  /** 取色器 —— 值是颜色字符串。 */
  color(label: string): ColorFieldBuilder;
  /**
   * 可增删的行列表 —— 值是数组,每项一个「子字段名 → 值」对象。
   *
   * ```ts
   * palette: s.array("角色配色", (item) => ({
   *   character: item.character("角色"),
   *   color:     item.string("颜色").default("#ffffff"),
   * })).maxItems(20)
   * ```
   */
  array(
    label: string,
    buildItem: (item: ArrayItemBuilder) => Record<string, AnyArrayItemBuilder>,
  ): ArrayFieldBuilder;
}

/** array 行内任意子字段 builder 的最简公共接口。 */
export interface AnyArrayItemBuilder {
  build(): ArrayItemField;
}

/** 任意 FieldBuilder 的最简公共接口 —— 暴露 build() 即可。 */
export interface AnyFieldBuilder {
  build(): SettingsField;
}

export function createSettingsBuilder(): SettingsBuilder {
  return {
    string: (label) => new StringFieldBuilder(label),
    number: (label) => new NumberFieldBuilder(label),
    boolean: (label) => new BooleanFieldBuilder(label),
    enum: (label, values) => new EnumFieldBuilder(label, values),
    shortcut: (label) => new ShortcutFieldBuilder(label),
    uiRef: (label) => new UIRefFieldBuilder(label),
    fragmentRef: (label) => new FragmentRefFieldBuilder(label),
    asset: (label) => new AssetFieldBuilder(label),
    character: (label) => new CharacterFieldBuilder(label),
    color: (label) => new ColorFieldBuilder(label),
    array: (label, buildItem) => new ArrayFieldBuilder(label, buildItem),
  };
}

/**
 * 类型工具:从一组 builder 反推 settings schema 的 build 输出形状。
 *
 * ```ts
 * const fields = {
 *   slotCount: s.number("x").default(30),
 *   allowDelete: s.boolean("y").default(true),
 * };
 * type Schema = SchemaOf<typeof fields>;
 * // {
 * //   slotCount: NumberField & { default?: 30 },
 * //   allowDelete: BooleanField & { default?: true },
 * // }
 * ```
 */
export type SchemaOf<T extends Record<string, AnyFieldBuilder>> = {
  [K in keyof T]: ReturnType<T[K]["build"]>;
};
