/**
 * Schema 类型 — Studio / Engine / 扩展三方共用的业务数据契约。
 *
 * 这些类型描述的是 Studio 编辑器里编辑过的对象在运行时的形状,
 * 不含编辑器内部的额外字段(选中态、UI 标志等)。
 */

export interface Character {
  id: string;
  name: string;
  avatarUri?: string;
  portraits: CharacterPortrait[];
  customFields: Record<string, unknown>;
  /**
   * 角色在 Studio 角色编辑器里选的「预设颜色」。
   *
   * 三层各有用途:`fg` 是作者在预设色块上实际看到的那个颜色(也是
   * 选中判定用的),`bg` 是浅底,`ring` 是描边。要"跟角色代表色一致"
   * 时用 `fg`。
   *
   * 作者没选过颜色的角色没有这个字段。
   */
  themeColor?: CharacterThemeColor;
}

/** 角色预设颜色的三层色值。 */
export interface CharacterThemeColor {
  /** 浅色背景。 */
  bg: string;
  /** 前景/文字色 —— 预设色块显示的就是它,代表这个角色的颜色。 */
  fg: string;
  /** 边框/线条色。 */
  ring: string;
}

export interface CharacterPortrait {
  id: string;
  uri: string;
  name?: string;
}

export type VariableValue = string | number | boolean | null;

/** 当前对白提供给头像智能组件的语义图片数据，不包含任何布局或边框配置。 */
export interface DialogueSpeakerPortrait {
  uri: string;
  expression?: string;
  crop?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface DialogueLine {
  characterId: string | null;
  /** 当前实际显示在对话框中的名字，可能是固定别名或变量值。 */
  speakerName?: string;
  text: string;
  voiceUri?: string;
}

export interface ChoiceItem {
  id: string;
  text: string;
  enabled: boolean;
}

export interface ChoiceContext {
  id: string;
  choices: ChoiceItem[];
  onSelect(index: number): void;
}

export interface AssetRef {
  url: string;
  mime?: string;
}

export interface ArchiveSlot {
  id: number;
  createdTime: number;
  modifiedTime: number;
  snapshotDataUri: string;
  currentSpeaker: string;
  currentDialogueText: string;
  isQuickSave?: boolean;
  userParams?: unknown;
}

export interface HistoryEntry {
  uuid?: string;
  text: string;
  /** 说话角色的稳定 id；显示名变化时保持不变。 */
  characterId?: string;
  name?: string;
  voiceUri?: string;
  isReadBefore?: boolean;
  isChoice?: boolean;
}

export interface HistorySnapshot {
  entries: HistoryEntry[];
  choices: Record<string, number>;
  ifResults: Record<string, boolean>;
  inputs: Record<string, string>;
}

/**
 * 剧本中的原始 Block 数据。
 *
 * 内置块和扩展块都使用同一份开放结构：常用字段有 id / type / content /
 * props / children，扩展块还可以携带自己的额外字段。
 */
export interface StoryBlock {
  id?: string;
  type?: string;
  content?: unknown[] | string;
  props?: Record<string, unknown>;
  children?: StoryBlock[];
  [key: string]: unknown;
}

/** 章节目录中的轻量元数据，不包含片段和 Block。 */
export interface StoryChapterMeta {
  id: string;
  name: string;
  disabled?: boolean;
}

/** 剧本片段及其原始 Block 数据。 */
export interface ScheduleEventFragmentMetadata {
  /** 提供这份事件配置语义的调度策略全局 id。 */
  strategyTarget: string;
  /** false 时保留配置但不加入项目调度事件池。缺省视为 true。 */
  enabled?: boolean;
  /** 由项目扩展定义并校验；Studio 只负责按 schema 编辑和原样持久化。 */
  config: Record<string, unknown>;
}

export interface StoryFragmentMetadata extends Record<string, unknown> {
  /** 调度选中 Fragment 前读取的非执行配置，不会编译成 OP。 */
  scheduleEvent?: ScheduleEventFragmentMetadata;
}

export interface StoryFragment {
  id: string;
  name: string;
  blocks: StoryBlock[];
  metadata?: StoryFragmentMetadata;
}

/** 一章完整剧本。 */
export interface StoryChapter extends StoryChapterMeta {
  fragments: StoryFragment[];
}

export type EngineConfigKey =
  | "skipMode"
  | "textSpeed"
  | "autoModeTextSpeed"
  | "stopVoiceOnNextDialogue"
  | "masterVolume"
  | "bgmVolume"
  | "seVolume"
  | "voiceVolume";

export interface EngineConfigSnapshot {
  skipMode: "all" | "read";
  /** 玩家速度设置：0=.5x、50=1x、75=2x、99≈4x、100=瞬间显示。 */
  textSpeed: number;
  /** Auto 播放的独立速度设置，数值语义同 textSpeed。 */
  autoModeTextSpeed: number;
  stopVoiceOnNextDialogue: boolean;
  masterVolume?: number;
  bgmVolume?: number;
  seVolume?: number;
  voiceVolume?: number;
}

/** 已知的 SDK 事件,可用于 SDKContext.subscribe。 */
export type SDKEvent =
  | "dialogue:changed"
  | "choice:opened"
  | "choice:closed"
  | "variable:changed"
  | "archive:changed"
  | "history:changed"
  | "config:changed"
  | "fragment:entered"
  | "fragment:exited";

// ===========================================================================
// 变量作用域(2026-05-19 存档系统完善)
//
// 两个独立维度,Studio 和 Engine 共用同一份取值集合:
//   - VariableScope:变量逻辑分组(Studio 编辑期分类、运行时引用方式)
//   - VariablePersistence:数据落到哪个存档文件(slot 跟槽位 / shared 跨存档)
//
// 详见 /docs/plans/2026-05-19-savegame-variable-scope-design.md
// ===========================================================================

/**
 * 变量的逻辑作用域 —— "这个变量属于谁"。
 *
 * - "project":项目级全局变量,不绑角色不绑场景。 旧称 "global",2026-05 重命名。
 * - "character":角色绑定变量,通过 (characterId, attr) 引用。
 * - "scene":场景绑定变量,通过 (sceneId, attr) 引用(尚未在引擎接通)。
 * - "system":引擎自动维护的只读变量(游玩时长 / 存档读取次数等)。
 */
export type VariableScope = "project" | "character" | "scene" | "system";

/**
 * 变量的持久化作用域 —— "数据存到哪里"。
 *
 * - "slot":跟着存档槽位走,槽位 N 改值只影响槽位 N。最常见。
 * - "shared":跨所有存档共享,写到 userData/<gameId>/profile/shared.save。
 *            CG 解锁集合 / 成就 / 玩家昵称这类"档案级"数据。
 */
export type VariablePersistence = "slot" | "shared";
