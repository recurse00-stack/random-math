/**
 * Internal System Slots —— 引擎硬编的"内置系统槽位"。
 *
 * 每个 slot 是"作品一定会有的子系统入口"的语义化 id。调用方(Toolbar /
 * TitleScreen / 剧本 op)只引用 slot id,不关心谁实现。具体由作品级配置
 * `projectConfig.systemBindings[slotId] = "extensionId/uiId"` 决定。
 *
 * 命名规则:
 * - slot id 由**引擎**定义,扩展**不能新增**,只能"实现"
 * - 命名空间 `internal.system.*` 是引擎保留前缀,任何扩展不得占用
 *
 * 详见 /docs/plans/2026-05-14-internal-extension-points-design.md §2.1
 */

export const INTERNAL_SYSTEM_SLOT = {
  Title:    "internal.system.title",
  Toolbar:  "internal.system.toolbar",
  Save:     "internal.system.save",
  Load:     "internal.system.load",
  Settings: "internal.system.settings",
  History:  "internal.system.history",
  Gallery:  "internal.system.gallery",
  Input:    "internal.system.input",
  Choice:   "internal.system.choice",
  Message:  "internal.system.message",
} as const;

/**
 * 字符串联合类型 —— SDK 用户传 slot id 时类型系统据此校验拼写。
 * 业务代码可以用 `INTERNAL_SYSTEM_SLOT.Save` 也可以用裸字符串 `"internal.system.save"`,
 * 拼错的字符串会被类型系统拦下。
 */
export type InternalSystemSlot =
  (typeof INTERNAL_SYSTEM_SLOT)[keyof typeof INTERNAL_SYSTEM_SLOT];

/** 剧情分支传给选项系统槽位的单个可见选项。 */
export interface InternalSystemChoiceInvocationItem {
  /** `isVisible` 过滤前在剧本 choices 数组中的位置。 */
  originalIndex: number;
  text: string;
  enabled: boolean;
}

/** `internal.system.choice` 的运行时调用契约。 */
export interface InternalSystemChoiceInvocationPayload {
  branchId: string;
  choices: InternalSystemChoiceInvocationItem[];
  /** 选中后传回 originalIndex；承载该槽位的 UI 随后应关闭自身。 */
  onSelect(originalIndex: number): void | Promise<void>;
}

/** `internal.system.message` 支持的消息语义。 */
export type InternalSystemMessageTone =
  | "info"
  | "success"
  | "warning"
  | "danger";

/** `internal.system.message` 的两种运行时呈现模式。 */
export type InternalSystemMessageMode = "alert" | "confirm";

interface InternalSystemMessageInvocationBase {
  mode: InternalSystemMessageMode;
  title: string;
  message: string;
  /** 主操作按钮文案；缺省由被绑定的消息框文档提供。 */
  confirmText?: string;
  /** 缺省由被绑定的消息框文档提供。 */
  tone?: InternalSystemMessageTone;
  /** alert 是否允许按 Esc 关闭；confirm 的 Esc 始终等价于取消。 */
  dismissible?: boolean;
}

/** 单按钮提示；点击按钮后只关闭消息框。 */
export interface InternalSystemMessageAlertInvocationPayload
  extends InternalSystemMessageInvocationBase {
  mode: "alert";
}

/** 双按钮确认；确认回传 true，取消或按 Esc 回传 false。 */
export interface InternalSystemMessageConfirmInvocationPayload
  extends InternalSystemMessageInvocationBase {
  mode: "confirm";
  /** 取消按钮文案，缺省为“取消”。 */
  cancelText?: string;
  onResolve(value: boolean): void | Promise<void>;
}

/** `internal.system.message` 的运行时调用契约。 */
export type InternalSystemMessageInvocationPayload =
  | InternalSystemMessageAlertInvocationPayload
  | InternalSystemMessageConfirmInvocationPayload;

/** 单个 slot 的元数据。给 Studio 配置面板用,运行时不依赖。 */
export interface InternalSystemSlotDef {
  /** 显示名(中文)。Studio 项目设置面板用。 */
  label: string;
  /**
   * 是否必需。
   * - true:任何配置失效时引擎兜底必须有 UI 响应(走 ULTIMATE_FALLBACK)
   * - false:可被作者显式置空,空时 ctx.system.invoke 是 no-op
   */
  required: boolean;
}

/**
 * slot id → 元数据的映射表。Studio 项目设置面板渲染下拉框时按此遍历。
 * 运行时只需要 id,这张表是"展示元数据",不影响 slot 行为。
 */
export const INTERNAL_SYSTEM_SLOTS: Record<InternalSystemSlot, InternalSystemSlotDef> = {
  [INTERNAL_SYSTEM_SLOT.Title]:    { label: "标题画面", required: true  },
  [INTERNAL_SYSTEM_SLOT.Toolbar]:  { label: "对话工具栏", required: true  },
  [INTERNAL_SYSTEM_SLOT.Save]:     { label: "存档界面", required: true  },
  [INTERNAL_SYSTEM_SLOT.Load]:     { label: "读档界面", required: true  },
  [INTERNAL_SYSTEM_SLOT.Settings]: { label: "设置界面", required: false },
  [INTERNAL_SYSTEM_SLOT.History]:  { label: "历史记录", required: false },
  [INTERNAL_SYSTEM_SLOT.Gallery]:  { label: "鉴赏界面", required: false },
  [INTERNAL_SYSTEM_SLOT.Input]:    { label: "玩家输入", required: true  },
  [INTERNAL_SYSTEM_SLOT.Choice]:   { label: "选项界面", required: true  },
  [INTERNAL_SYSTEM_SLOT.Message]:  { label: "标准消息框", required: true  },
};

/** 引擎内置 slot id 列表(给运行时校验、Studio 遍历用)。 */
export const INTERNAL_SYSTEM_SLOT_IDS: readonly InternalSystemSlot[] = Object.freeze(
  Object.values(INTERNAL_SYSTEM_SLOT),
);

/** 判断一个字符串是否是引擎内置 slot id。 */
export function isInternalSystemSlot(id: string): id is InternalSystemSlot {
  return (INTERNAL_SYSTEM_SLOT_IDS as readonly string[]).includes(id);
}
