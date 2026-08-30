import type { ExtensionDatabaseDependency } from "./database";

/**
 * UI 扩展 manifest 形态。对应每个扩展目录里的 extension.json。
 * 由 Studio 在加载时校验。
 */

/**
 * 内置可被扩展接管(override)的组件 ID。
 *
 * 扩展通过 `manifest.overrides` 声明它接管哪些内置组件,以及通过
 * `export const overrides = { DialogueBox: MyComponent, ... }`
 * 提供具体的 React 组件实现。
 *
 * 同一个内置组件全局只能被一个扩展接管(由 Studio 加载阶段冲突检测保证)。
 *
 * 详见 docs/plans/2026-05-11-personalization-extension-coexistence.md。
 */
export type BuiltinComponentId = "DialogueBox" | "Choice" | "InputBox";

/** 扩展声明的权限(阶段一只声明不强制;枚举开放,词表见设计文档 §6.1)。 */
export type ExtensionPermission = string;

/** 风险分级,给市场审核/安装确认弹窗用。 */
export type ExtensionRiskTier = "safe" | "standard" | "privileged";

/** 扩展的网络声明(阶段二 CSP connect-src 白名单的落点)。 */
export interface ExtensionNetworkDeclaration {
  domains?: string[];
}

/**
 * 扩展贡献的一套可选对话框样式。
 *
 * `visualUI` 是扩展自身 `ui/` 目录下的文件名（不含 `.json`）。`id` 是扩展
 * 内稳定的样式标识，不要求与文件名一致，因此作者可以在不破坏项目引用的前提下
 * 调整资源文件名。
 */
export interface ExtensionDialogueBoxStyleContribution {
  id: string;
  name: string;
  visualUI: string;
  description?: string;
  /** 可选的对话框行为配置；具体字段由消费方解释。 */
  dialogueBox?: Record<string, unknown>;
}

/**
 * 扩展贡献的一套可选段落样式。
 *
 * `visualUI` 是扩展自身 `ui/` 目录下的文件名（不含 `.json`），文档内使用
 * 唯一的 `paragraph` 智能层描述整屏段落外观。`id` 是扩展内稳定的样式标识，
 * 不要求与文件名一致。
 */
export interface ExtensionParagraphStyleContribution {
  id: string;
  name: string;
  visualUI: string;
  description?: string;
}

/**
 * 扩展贡献给统一输入系统的语义动作。
 *
 * 运行时仍由 `ctx.input.registerAction()` 真正注册；这里提供同一份静态元数据，
 * 让 Studio 在没有启动游戏引擎时也能把项目扩展动作显示在“输入按键”页。
 */
export interface ExtensionInputActionContribution {
  /** 必须以 `<extension-id>.` 开头，与运行时 registerAction 契约一致。 */
  id: string;
  label: string;
  defaultKeys: string[];
}

/** 扩展向 Studio 声明的资源型贡献。 */
export interface ExtensionContributions {
  dialogueBoxStyles?: ExtensionDialogueBoxStyleContribution[];
  paragraphStyles?: ExtensionParagraphStyleContribution[];
  inputActions?: ExtensionInputActionContribution[];
}

export interface ExtensionManifest {
  /** 全局唯一,形如 <author>.<name>,小写 + 数字 + 连字符。也可以是单段。 */
  id: string;
  /** 显示名称(可中文)。 */
  name: string;
  /** 简介,Inspector 里展示。 */
  description?: string;
  /** 作者标识。 */
  author: string;
  /** semver 版本号。 */
  version: string;
  /** bundle 入口相对路径,默认 "dist/index.js"。 */
  entry: string;
  /**
   * 这个扩展是否有程序(代码 bundle)。
   * = 原始 manifest 是否显式声明了 entry。纯资源扩展(只做可视化界面)的
   * manifest 不写 entry,此值为 false;validate 仍会把 entry 补成默认值以保持
   * 契约,但 hasProgram 记录真实意图,供"要不要引导初始化程序 / 要不要尝试
   * 加载 bundle"判断。缺失时按 true(兼容:老 manifest 都是带程序的)。
   */
  hasProgram?: boolean;
  /** 期望的 SDK 版本范围(npm semver range)。 */
  sdkVersion: string;
  /** 列表缩略图相对路径(可选)。 */
  icon?: string;
  /** 可被 Studio 枚举和选择的资源型贡献。 */
  contributes?: ExtensionContributions;
  /**
   * 扩展需要的项目数据集合。key 是扩展代码使用的逻辑别名；Studio 负责把
   * 别名自动绑定到项目里实现兼容契约的 collection，扩展不接触真实路径。
   */
  dataDependencies?: Record<string, ExtensionDatabaseDependency>;
  /** 这个扩展接受的 props,Studio Inspector 据此自动生成表单。 */
  propsSchema?: Record<string, PropsSchemaField>;
  /**
   * 这个扩展接管哪些内置组件(DialogueBox / Choice / InputBox)。
   *
   * 声明后:
   *   - 运行时:引擎用扩展提供的 React 组件渲染,不再使用内置组件 + 内置 schema
   *   - Studio:个性化 tab 里对应组件的编辑面板灰显,提示作者打开扩展配置
   *   - 内置 schema 旧值依然保留在项目里,扩展卸载后自动恢复
   *
   * 同一个内置组件全局只能被一个扩展接管,加载时检测冲突。
   *
   * 接管粒度是"整个组件",不能只接管样式不接管渲染(没有"中间态"的概念)。
   * 想做精细化样式定制 → 用内置 schema 的字段化字段 + extra_css 逃生口。
   * 想换交互逻辑、加新状态、加新动画 → 写扩展 override。
   */
  overrides?: BuiltinComponentId[];

  /**
   * 内置扩展标记。`true` 时:
   * - 不可禁用(Studio 隐藏禁用按钮,project.json 中 `enabled=false` 时引擎强制改回 `true`)
   * - 不可卸载
   * - 作为 ULTIMATE_FALLBACK 的提供者(若引擎硬编了对应 fallback)
   *
   * 仅 `avg.internal.*` namespace 的扩展可使用此字段。第三方扩展声明
   * `builtin: true` 会被加载阶段拒绝。
   *
   * 详见 /docs/plans/2026-05-14-internal-extension-points-design.md §5.1
   */
  builtin?: boolean;

  /**
   * 阶段二权限模型的声明槽。阶段一只声明不强制,加载链路不读它放行/拦截。
   * 枚举开放(不锁定具体值),词表见设计文档 §6.1。
   */
  permissions?: ExtensionPermission[];
  /** 网络声明,阶段二 CSP 白名单落点。 */
  network?: ExtensionNetworkDeclaration;
  /** 风险分级(默认按 standard 处理)。 */
  riskTier?: ExtensionRiskTier;
  /** 最低宿主版本(semver);权限模型上线后防旧宿主静默忽略权限声明。 */
  minHostVersion?: string;
}

export type PropsSchemaFieldType =
  | "string"
  | "number"
  | "boolean"
  | "enum";

export interface PropsSchemaField {
  type: PropsSchemaFieldType;
  default?: unknown;
  description?: string;
  /** 仅当 type === "enum" 时使用。 */
  options?: string[];
}
