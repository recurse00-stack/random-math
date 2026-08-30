/**
 * 扩展项目级设置的 schema。
 *
 * 跟 BlockSchemaField 的区别:
 * - BlockSchemaField:每个 block 实例一份参数(剧本作者编辑)
 * - SettingsField:整个扩展在项目里的一份配置(项目设置面板编辑)
 *
 * 两者字段类型有重叠,但 SettingsField 多了 `shortcut` 和 `ui-ref` 这两个
 * 只在"项目级配置"场景下有意义的类型。
 */

/**
 * 字段启用条件 —— "仅当某个同级字段取到指定值时,本字段才可编辑"。
 *
 * 用途:在设置面板里做字段间联动。典型例子是一个"总开关"控制一组"子开关":
 * 总开关关闭时,子开关在面板里置灰(不可点),但**底层值不变** ——
 * 重新打开总开关后子开关恢复原样。
 *
 * 语义(纯 UI 层,不影响运行时取值):
 *   - 设置面板读 `key` 字段的**当前生效值**(用户设过的值,否则该字段 default)。
 *   - 该值 === `equals`(未指定 equals 时默认 `true`)→ 本字段 enabled。
 *   - 否则本字段 disabled(置灰、拦截 onChange,不写 store)。
 *
 * 注意:`key` 是同一个 settings scope 内的字段名(不加 uiId 前缀),
 * 跨 UI 子模块的联动不在此机制覆盖范围内。
 *
 * 这是纯展示约束 —— 引擎运行时仍按各字段自己的存储值取数,
 * disabled 不等于"值变 false"。要让运行时真正隐藏,扩展自己的
 * onRegister/render 仍需读总开关字段做判断(参见 default-shell toolbar)。
 */
export interface FieldEnableCondition {
  /** 依赖的同级字段名(不含 uiId 前缀)。 */
  key: string;
  /** 期望值;字段当前值与之严格相等时本字段才启用。默认 `true`。 */
  equals?: unknown;
}

export interface StringField {
  type: "string";
  label: string;
  description?: string;
  default?: string;
  multiline?: boolean;
  enabledWhen?: FieldEnableCondition;
}

export interface NumberField {
  type: "number";
  label: string;
  description?: string;
  default?: number;
  min?: number;
  max?: number;
  step?: number;
  enabledWhen?: FieldEnableCondition;
}

export interface BooleanField {
  type: "boolean";
  label: string;
  description?: string;
  default?: boolean;
  enabledWhen?: FieldEnableCondition;
}

export interface EnumField {
  type: "enum";
  label: string;
  description?: string;
  default?: string;
  options: Array<{ label: string; value: string }>;
  enabledWhen?: FieldEnableCondition;
}

/**
 * 快捷键字段。
 * 值:规范化字符串,如 "Ctrl+KeyH" / "MouseMiddle" / "F5"。
 * 解析与序列化由 SDK 提供的 parseShortcut / formatShortcut 完成。
 */
export interface ShortcutField {
  type: "shortcut";
  label: string;
  description?: string;
  default?: string;
  enabledWhen?: FieldEnableCondition;
}

/**
 * UI 引用字段(指向某个 Extension 子模块)。
 * 值:路径字符串,形如 "extensionId/uiId" 或 "uiId"(本扩展)。
 * 解析由 SDK 提供的 resolveUIRef 完成。
 */
export interface UIRefField {
  type: "ui-ref";
  label: string;
  description?: string;
  default?: string;
  enabledWhen?: FieldEnableCondition;
}

/** 跨章节剧情片段引用。Studio 以章节名 / 片段名选择，运行时保存稳定 id。 */
export interface FragmentRefValue {
  chapterId: string;
  fragmentId: string;
}

export interface FragmentRefField {
  type: "fragment-ref";
  label: string;
  description?: string;
  default?: FragmentRefValue;
  enabledWhen?: FieldEnableCondition;
}

/**
 * 资源字段(图片/音频/视频)。复用 BlockSchemaField 的资源选择器,
 * 这里只声明字段形态,实际渲染由 Studio 设置 UI 决定。
 */
export interface AssetField {
  type: "asset";
  label: string;
  description?: string;
  accepts?: Array<"image" | "audio" | "video" | "any">;
  enabledWhen?: FieldEnableCondition;
}

/**
 * 角色字段(指向项目里的某个角色)。
 * 值:角色 id 字符串。
 *
 * 为什么存 id 不存名字:作者在角色模块改了显示名之后,配置不该跟着失效。
 * 渲染由 Studio 设置 UI 提供角色选择器,跟 BlockSchemaField 的 character
 * 共用同一个控件。
 */
export interface CharacterField {
  type: "character";
  label: string;
  description?: string;
  /** 默认选中的角色 id。 */
  default?: string;
  enabledWhen?: FieldEnableCondition;
}

/**
 * 颜色字段。
 * 值:颜色字符串,如 "#8ecae6" / "rgba(0,0,0,.5)" / "transparent"。
 *
 * 渲染成取色器(色块 + 调色面板 + 精确输入),不是纯文本框 ——
 * 让作者手打十六进制既难用又容易打错。
 */
export interface ColorField {
  type: "color";
  label: string;
  description?: string;
  default?: string;
  /** 允许调透明度。默认关闭。 */
  allowAlpha?: boolean;
  enabledWhen?: FieldEnableCondition;
}

/**
 * 可作为 array 行内子字段的类型。
 *
 * 刻意排除 array 自身 —— 不支持嵌套列表。表格里再套表格,
 * 无论编辑体验还是数据结构都会失控;真需要了再单开设计。
 */
export type ArrayItemField =
  | StringField
  | NumberField
  | BooleanField
  | EnumField
  | ShortcutField
  | UIRefField
  | FragmentRefField
  | AssetField
  | CharacterField
  | ColorField;

/** 可展开二维表格里的一组详情字段。 */
export interface ArrayFieldTableSection {
  label: string;
  fields: string[];
}

/**
 * array 的可选展示方式。
 *
 * 默认不提供时仍使用传统的平铺行编辑器；expandable-table 只在声明它的
 * 大型资料目录中启用，先以二维表格摘要展示，再逐行展开完整编辑表单。
 */
export interface ArrayFieldTablePresentation {
  mode: "expandable-table";
  /** 作为每行主标题的字段。 */
  titleField: string;
  /** 可选的图片字段，会和主标题组成表格第一列。 */
  imageField?: string;
  /** 主标题之后展示在表头中的摘要字段。 */
  columns: string[];
  /** 展开行后字段的分组；没有列出的字段会自动落入“其他设置”。 */
  sections?: ArrayFieldTableSection[];
}

export type ArrayFieldPresentation = ArrayFieldTablePresentation;

/**
 * 列表字段 —— 一组可增删的行,每行有若干子字段。
 *
 * 值形态是数组,每项是「子字段名 → 值」的对象:
 * ```ts
 * [
 *   { character: "char_yuki",  color: "#8ecae6", css: "" },
 *   { character: "char_akira", color: "#ffb703", css: "" },
 * ]
 * ```
 *
 * 用于「数量不定的成组配置」—— 比如按角色配名字颜色、
 * 按变量配提示文案。固定数量的配置直接用平铺字段即可,不必用它。
 */
export interface ArrayField {
  type: "array";
  label: string;
  description?: string;
  /** 每一行的子字段定义。键名即该子字段在行对象里的属性名。 */
  itemFields: Record<string, ArrayItemField>;
  /**
   * 新增一行时的初始值。不给则各子字段用自己的 default,
   * 再没有就留空。
   */
  itemDefault?: Record<string, unknown>;
  /** 最多几行。不给表示不限。 */
  maxItems?: number;
  /** 「添加」按钮的文字,默认「添加一项」。 */
  addLabel?: string;
  /** 一行都没有时显示的提示文字。 */
  emptyHint?: string;
  /** 可选的高密度资料编辑方式；默认仍使用平铺行。 */
  presentation?: ArrayFieldPresentation;
  enabledWhen?: FieldEnableCondition;
}

export type SettingsField =
  | StringField
  | NumberField
  | BooleanField
  | EnumField
  | ShortcutField
  | UIRefField
  | FragmentRefField
  | AssetField
  | CharacterField
  | ColorField
  | ArrayField;

export type ExtensionSettingsSchema = Record<string, SettingsField>;
