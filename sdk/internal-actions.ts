/**
 * Internal Actions —— 引擎硬编的"内置语义动作"。
 *
 * 每个 action 是"作品一定会响应"的语义事件的 id(如"推进对话"、"跳过到段尾")。
 * UI 子模块用 `ctx.input.onAction(id, handler)` 订阅,物理按键由作品级
 * `projectConfig.actionBindings[actionId]` 或引擎默认决定。
 *
 * 命名规则:
 * - 引擎硬编 action id 一律用 `internal.input.*` 前缀,扩展不能用
 * - 扩展贡献的 action 必须以扩展自身 id 为前缀(由 registerAction 强制校验)
 *
 * 详见 /docs/plans/2026-05-14-internal-extension-points-design.md §2.2
 */

export const INTERNAL_ACTION = {
  Advance:      "internal.input.advance",
  Skip:         "internal.input.skip",
  AutoToggle:   "internal.input.auto-toggle",
  HideDialogue: "internal.input.hide-dialogue",
  ReplayVoice:  "internal.input.replay-voice",
} as const;

/**
 * 字符串联合类型 —— SDK 用户传 action id 时类型系统据此校验拼写。
 * 拼错会被类型系统拦下;裸字符串也可以传(交由运行时校验)。
 */
export type InternalAction =
  (typeof INTERNAL_ACTION)[keyof typeof INTERNAL_ACTION];

/** 单个 internal action 的元数据。 */
export interface InternalActionDef {
  /** 显示名(中文)。Studio 输入按键面板用。 */
  label: string;
  /**
   * 该 action 生效的 channel 列表(沿用 device-input-system 的 channel 机制)。
   * 例如 ["dialogue", "paragraph"] 表示"对话"和"段落"两种场景都响应。
   */
  channels: string[];
  /** 默认物理键数组。作者未配置 actionBindings 时回退到此。 */
  defaultKeys: string[];
}

/**
 * action id → 元数据的映射表。
 *
 * 默认键值跟旧实现(action-types.ts BUILTIN_ACTIONS)严格对齐,
 * 只把 id 换成 internal.input.* 命名。具体迁移见 §11.1。
 */
/**
 * 默认键值跟旧实现(`engine/system/key-binding/action-types.ts BUILTIN_ACTIONS`)
 * 严格对齐 —— 用 `event.key` 的原生字符串("a" / " " 而不是 "KeyA" / "Space"),
 * 中键派发由 device-input-system 翻译为 "middleclick",右键派发为 "contextmenu"。
 *
 * Studio 输入按键面板渲染时需要做 "原始字符串 → 显示名"(如 "a" → "A" / " " → "空格")
 * 的映射,那是 UI 层关心的事(详见 PR3 InputBindingsTab)。
 */
export const INTERNAL_ACTIONS: Record<InternalAction, InternalActionDef> = {
  [INTERNAL_ACTION.Advance]: {
    label: "推进对话",
    channels: ["dialogue", "paragraph"],
    defaultKeys: ["mousedown", " ", "Enter", "wheeldown"],
  },
  [INTERNAL_ACTION.Skip]: {
    label: "跳过到段尾",
    channels: ["dialogue", "paragraph"],
    defaultKeys: ["Control"],
  },
  [INTERNAL_ACTION.AutoToggle]: {
    label: "切换自动播放",
    channels: ["dialogue", "paragraph"],
    defaultKeys: ["a"],
  },
  [INTERNAL_ACTION.HideDialogue]: {
    label: "临时隐藏对话框",
    channels: ["dialogue", "paragraph"],
    defaultKeys: ["contextmenu", "Delete"],
  },
  [INTERNAL_ACTION.ReplayVoice]: {
    label: "重播角色语音",
    channels: ["dialogue", "paragraph"],
    defaultKeys: ["r"],
  },
};

/** 引擎内置 action id 列表。 */
export const INTERNAL_ACTION_IDS: readonly InternalAction[] = Object.freeze(
  Object.values(INTERNAL_ACTION),
);

/** 判断一个字符串是否是引擎内置 action id。 */
export function isInternalAction(id: string): id is InternalAction {
  return (INTERNAL_ACTION_IDS as readonly string[]).includes(id);
}

/**
 * 校验扩展贡献的 action id 是否合法。
 *
 * 规则:
 * - 不能以 `internal.` 开头(引擎保留)
 * - 必须以 `<extensionId>.` 开头(强制 namespace)
 *
 * 抛错而不是返回 boolean —— 在 registerAction 入口处直接 throw,
 * 让作者立即看到拼错的 id。
 */
export function assertValidExtensionActionId(
  actionId: string,
  extensionId: string,
): void {
  if (actionId.startsWith("internal.")) {
    throw new Error(
      `[registerAction] action id "${actionId}" 使用了引擎保留前缀 "internal.*",` +
        `只有引擎本身可以注册 internal.* 命名空间的 action。`,
    );
  }
  const requiredPrefix = `${extensionId}.`;
  if (!actionId.startsWith(requiredPrefix)) {
    throw new Error(
      `[registerAction] action id "${actionId}" 不合法。` +
        `扩展 "${extensionId}" 注册的 action 必须以 "${requiredPrefix}" 开头,` +
        `例如 "${requiredPrefix}my-action"。`,
    );
  }
}
