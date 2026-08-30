import React, { createContext, createElement } from "react";
import type { InternalAction } from "./internal-actions";
import type { InternalSystemSlot } from "./internal-system-slots";
import type {
  ArchiveSlot,
  AssetRef,
  Character,
  ChoiceContext,
  DialogueLine,
  DialogueSpeakerPortrait,
  EngineConfigKey,
  EngineConfigSnapshot,
  HistoryEntry,
  HistorySnapshot,
  SDKEvent,
  StoryChapter,
  StoryChapterMeta,
  VariableValue,
} from "./types/schema";
import type { DatabaseAPI } from "./types/database";

export interface FragmentCallOptions {
  /**
   * 目标片段所属章节。缺省时由宿主按当前章节解析。
   */
  chapterId?: string;
}

export interface FlowAPI {
  /**
   * 当前脚本运行周期的只读取消信号。
   * softReset / destroy 会取消旧信号；调用方应捕获本次操作开始时的引用。
   */
  readonly signal: AbortSignal;
  /**
   * 调用一个剧本片段，并在该片段返回后继续当前执行流。
   */
  callFragment(
    fragmentId: string,
    options?: FragmentCallOptions,
  ): Promise<void>;
  /**
   * 放弃当前片段剩余流程，并从目标片段开始新的脚本运行周期。
   *
   * 该操作不会在目标片段结束后返回调用点，因此以 unsafe 前缀显式提示。
   */
  unsafe_goToFragment(
    fragmentId: string,
    options?: FragmentCallOptions,
  ): void;
  restart(): void;
}

/**
 * 只读剧本 API。
 *
 * Player 的章节文件可能按需加载，所以读取具体章节和完整剧本始终是异步的。
 * 返回的章节是独立快照，修改它不会改动 Studio 工程或正在运行的游戏。
 */
export interface StoryAPI {
  /** 同步读取章节目录，不加载章节正文。 */
  listChapters(): StoryChapterMeta[];
  /** 按章节 id 读取完整章节；不存在时返回 null。 */
  getChapter(id: string): Promise<StoryChapter | null>;
  /** 按章节目录顺序读取完整剧本。 */
  getAllChapters(): Promise<StoryChapter[]>;
}

export interface VariablesAPI {
  get<T extends VariableValue = VariableValue>(name: string): T | undefined;
  set<T extends VariableValue = VariableValue>(name: string, value: T): void;
  useValue<T extends VariableValue = VariableValue>(
    name: string,
  ): [T | undefined, (value: T) => void];
}

export interface ArchiveAPI {
  list(): Promise<ArchiveSlot[]>;
  /**
   * 保存到指定槽位。正数槽位已有内容时默认调用标准消息框确认；只有显式
   * `confirmOverwrite: false` 才跳过。返回 false 表示玩家取消或确认窗口未能完成，
   * 此时不会写档。
   */
  save(
    slotId: number,
    options?: { userParams?: unknown; confirmOverwrite?: boolean },
  ): Promise<boolean>;
  load(slotId: number): Promise<void>;
  delete(slotId: number): Promise<void>;
  quickSave(options?: { userParams?: unknown }): Promise<void>;
  quickLoad(): Promise<boolean>;
  useSlots(): ArchiveSlot[];

  /**
   * 强制把 VariableSystem 里 persistence=shared 的变量立即落盘。
   * 通常用于"玩家点了退出游戏"等关键节点,不等 500ms debounce。
   * (2026-05-19 存档系统完善)
   */
  flushShared(): Promise<void>;

  /**
   * 清空所有跨存档(persistence=shared)变量,删除磁盘文件。
   * UI 层(Setting 画面里的"重置档案数据"按钮)调用,**不弹确认**,
   * 调用方负责"你真的要重置吗"二次确认。
   * (2026-05-19 存档系统完善)
   */
  resetShared(): Promise<void>;

  /**
   * 触发引擎截一张当前游戏画面,缓存供后续 save() 复用。
   * (2026-05-20 SaveScreen 性能 + 截图正确性)
   *
   * 典型用法:SaveScreen 在 onInit(进 DOM 之前)调一次,这时画面上还没有
   * SaveScreen 自身覆盖。后续玩家点保存时,save 直接用这张缓存,既快又能
   * 拿到"真正的游戏画面",不被 SaveScreen 的暗色蒙层污染。
   *
   * 实现:走 IScreenshotAdapter(host 注入,Studio/Player 用 Electron
   * webContents.capturePage,native 实现 ~30ms 且能拿 WebGL 像素)。
   * 失败静默(console.warn),save 会走兜底 html2canvas 现场截。
   */
  cacheGameSnapshot(): Promise<void>;

  /** 清掉 cacheGameSnapshot 缓存。SaveScreen.onClose 调用。 */
  clearGameSnapshot(): void;
}

export interface HistoryAPI {
  entries(): HistoryEntry[];
  choices(): Record<string, number>;
  ifResults(): Record<string, boolean>;
  inputs(): Record<string, string>;
  replayVoice(uri: string): Promise<void> | void;
  useSnapshot(): HistorySnapshot;
}

export type EngineConfigValue<K extends EngineConfigKey> =
  K extends "skipMode" ? "all" | "read"
    : K extends "stopVoiceOnNextDialogue" ? boolean
      : number;

export interface EngineConfigAPI {
  get<K extends EngineConfigKey>(key: K): EngineConfigValue<K>;
  set<K extends EngineConfigKey>(
    key: K,
    value: EngineConfigValue<K>,
  ): void | Promise<void>;
  /** 把设置界面管理的引擎配置一次性恢复为默认值。 */
  reset(): Promise<void>;
  snapshot(): EngineConfigSnapshot;
  useValue<K extends EngineConfigKey>(
    key: K,
  ): [EngineConfigValue<K>, (value: EngineConfigValue<K>) => void];
}

/**
 * 调 ctx.ui.show 时可选的容器配置。
 * - size / position 用 PairUnitStrings 字符串格式("(100%, 100%)" / "(center, 100)" 等)
 * - 这些字段是给 engine UI 容器用的,组件在 render 出的 React 树里仍然
 *   需要用 CSS 自由定位
 */
export interface UIShowOptions {
  /** 容器尺寸,默认 "(100%, 100%)" */
  size?: string;
  /** 容器位置,默认 "(0, 0)"(全屏覆盖) */
  position?: string;
  /** 容器是否可交互(影响 pointer-events),默认 true */
  interactable?: boolean;
  /** 作为模态界面打开，阻塞剧本主循环与底层游戏输入，直到界面关闭。 */
  modal?: boolean;
  /**
   * 让全屏根容器不接管指针，只由扩展组件内部显式启用 pointer-events 的
   * 元素接收点击。适合可点击、但不应遮住底层游戏的非模态浮层。
   * 模态打开时宿主会强制关闭穿透。
   */
  pointerEventsPassthrough?: boolean;
}

export interface UIAPI {
  show(
    id: string,
    props?: Record<string, unknown>,
    options?: UIShowOptions,
  ): Promise<void> | void;
  hide(id: string): Promise<void> | void;
  hideAll(): Promise<void> | void;
  isVisible(id: string): boolean;
}

// ---------------------------------------------------------------------------
// Visual UI API —— 扩展操作可视化界面(编辑器产物 JSON)的控件句柄。
// 2026-07-07 扩展复合容器设计:布局住在界面 JSON(编辑器编辑),
// 动态行为由扩展代码经这里操作。详见
// docs/plans/2026-07-07-extension-visual-ui-integration.md
// ---------------------------------------------------------------------------

/**
 * 单个控件的操作句柄。只有在编辑器里填了「标识符」(refId)的控件
 * 才能被代码拿到 —— 创作者显式决定暴露面。
 * 所有修改都是运行时内存态,不落盘;界面关闭后句柄失效(no-op + warn)。
 */
export interface VisualUIElementHandle {
  /** 覆写元素 props(浅合并;如按钮文字 { text: "..." })。 */
  setProps(patch: Record<string, unknown>): void;
  /** 覆写元素样式(浅合并;字段同编辑器样式面板)。 */
  setStyle(patch: Record<string, unknown>): void;
  /** 显示/隐藏(等价图层眼睛,叠加在设计值之上)。 */
  setHidden(hidden: boolean): void;
  /** 订阅点击(与界面里配置的触发事件并存,都会触发)。返回退订函数。 */
  on(event: "click", fn: () => void): () => void;
}

/** 一份已打开的可视化界面的操作句柄。 */
export interface VisualUIViewHandle {
  /** 界面名(与打开时的引用一致,如 "@avg.internal.default-shell/settings-screen")。 */
  readonly name: string;
  /** 按「标识符」取控件句柄;不存在/未填标识符返回 null。 */
  get(refId: string): VisualUIElementHandle | null;
  /** 关闭这份界面。 */
  close(): void;
  /** 界面被关闭时回调(任何关闭途径)。返回退订函数。 */
  onClose(fn: () => void): () => void;
}

/** 可视化界面按次打开时的容器与交互行为。 */
export interface VisualUIOpenOptions extends UIShowOptions {
  /** 作为模态界面打开，阻塞剧本主循环与底层游戏输入。 */
  modal?: boolean;
  /**
   * 让全屏根层不接管指针，只由界面元素的矩形区域接收点击。
   * 适合便携面板、抽屉等非模态覆盖层；模态打开时宿主会强制关闭穿透。
   */
  pointerEventsPassthrough?: boolean;
}

/**
 * ctx.visualUI —— 可视化界面的打开/挂接入口。
 * 界面名两种形态(与 ShowUI 的 "ui:" 引用去前缀后一致):
 *   - "my-panel"          项目 ui/ 目录的界面
 *   - "@<扩展id>/<界面名>" 扩展包内的界面
 */
export interface VisualUIAPI {
  /** 打开一份可视化界面并返回句柄。modal=true 时阻塞剧本主循环。 */
  open(
    name: string,
    options?: VisualUIOpenOptions,
  ): Promise<VisualUIViewHandle>;
  /** 取一份已打开界面的句柄;未打开返回 null。 */
  attach(name: string): VisualUIViewHandle | null;
  /**
   * 注册“界面即将挂载”回调。回调会在界面元素进入 DOM 前执行并被等待，
   * 适合截图、冻结背景等必须避开界面自身的准备工作。
   * 返回退订函数。
   */
  onBeforeOpen(
    name: string,
    fn: () => void | Promise<void>,
  ): () => void;
  /**
   * 注册"界面被打开"回调 —— 混合扩展写控制器的标准位置:
   * 不管界面被谁打开(系统槽位/剧本/代码),回调都会拿到句柄。
   * 返回退订函数。
   */
  onOpen(name: string, fn: (view: VisualUIViewHandle) => void): () => void;
}

export interface GameWindowAPI {
  /** 当前宿主是否允许游戏 UI 切换全屏。 */
  canFullscreen(): boolean;
  /** 读取当前是否处于全屏状态。 */
  getFullscreen(): Promise<boolean>;
  /** 切换全屏状态；不支持时是 no-op。 */
  setFullscreen(value: boolean): void | Promise<void>;
  /** 在窗口 / 全屏之间切换；不支持时是 no-op。 */
  toggleFullscreen(): void | Promise<void>;
  /** React hook 形式的全屏状态。 */
  useFullscreen(): [boolean, (value: boolean) => void];
}

/**
 * 游戏壳层 API —— 跟"当前作品"相关的杂项,跟引擎核心和 UI 实现都解耦。
 *
 * 旧 `SystemAPI`(`exitGame / gameTitle`)在 2026-05 Internal Extension Points
 * 设计后改名为 `GameAPI`,挂在 `ctx.game`。
 * `ctx.system` 现在指代 System Slot API(见下方 `SystemAPI`)。
 *
 * 详见 /docs/plans/2026-05-14-internal-extension-points-design.md §4.2
 */
export interface GameAPI {
  /** 退出当前游戏(Player 端关窗,Studio Preview 端回到非播放态)。 */
  exit(): void;

  /**
   * 当前作品的标题(由宿主决定:Player 端是 player config.title,
   * 也就是项目 build 时定的 title;Studio Preview 端是当前项目名)。
   *
   * UI 扩展(如默认游戏壳的标题画面)用这个做"作品名"的最终 fallback,
   * 在用户没有显式覆盖标题文本时仍能显示真实游戏名,而不是占位字符串。
   */
  title(): string;

  /** 桌面/浏览器宿主窗口能力。 */
  window: GameWindowAPI;
}

/**
 * System Slot API —— 触发"内置系统槽位"的 UI 入口。
 *
 * 调用方(Toolbar / TitleScreen / 剧本 op)只传 slot id,不关心哪个扩展实现。
 * 具体由 `projectConfig.systemBindings[slotId]` 决定。失效时引擎走
 * ULTIMATE_FALLBACK 兜底到 DefaultShell。
 *
 * 详见 /docs/plans/2026-05-14-internal-extension-points-design.md §2.1 / §4.1
 */
export interface SystemAPI {
  /**
   * 触发一个内置系统槽位(打开对应 UI)。
   *
   * - 解析 `projectConfig.systemBindings[slotId]`,得到 `"extId/uiId"` UI 路径
   * - 配置缺失/失效时走 ULTIMATE_FALLBACK 兜底到 DefaultShell
   * - 内部转发给 `ctx.ui.show(uiRef, payload)`
   *
   * @param slotId   引擎硬编 slot id,例如 `INTERNAL_SYSTEM_SLOT.Save`
   * @param payload  透传给目标 UI 的 props(由各 UI 自己解释)
   * @param options  打开行为；modal=true 时暂停底层游戏交互，直到界面关闭。
   */
  invoke(
    slotId: InternalSystemSlot | (string & {}),
    payload?: unknown,
    options?: SystemInvokeOptions,
  ): Promise<void>;

  /**
   * 关闭此前通过该槽位打开的 UI。
   *
   * 宿主会记住实际成功打开的绑定，因此作者绑定失效并回退到内置 UI 时，
   * 这里仍能关闭真正显示出来的界面。常驻 HUD（例如对话工具栏）用它
   * 跟随游戏状态收起；普通模态界面通常由界面自身关闭。
   */
  close(slotId: InternalSystemSlot | (string & {})): Promise<void>;

  /** 查询某槽位当前生效的 UI 路径(用于调试/Studio 显示)。 */
  getBinding(
    slotId: InternalSystemSlot | (string & {}),
  ): string | undefined;

  /** 列出所有 slot 信息(Studio 项目设置面板用)。 */
  listSlots(): SystemSlotInfo[];
}

/** 扩展从代码打开系统槽位时可控制的容器行为。 */
export interface SystemInvokeOptions {
  /** 作为模态界面打开，阻止底层游戏继续交互。 */
  modal?: boolean;
  /** 可选的容器尺寸与位置。 */
  containerOptions?: UIShowOptions;
}

export interface SystemSlotInfo {
  id: string;
  label: string;
  required: boolean;
  /** 解析 systemBindings + ULTIMATE_FALLBACK 后的当前绑定 UI 路径。 */
  currentBinding: string | undefined;
}

export interface SceneAPI {
  change(sceneId: string): Promise<void> | void;
  show(sceneId: string): Promise<void> | void;
  hide(sceneId: string): Promise<void> | void;
  destroy(sceneId: string): Promise<void> | void;
  destroyAll(): Promise<void> | void;
}

export interface CharacterAPI {
  get(id: string): Character | null;
  /**
   * 同步取项目中所有角色定义(命令式 API)。
   *
   * 适合在事件处理函数 / class 方法里调用。组件 render 路径里请用 `useAll()`,
   * 那个会在角色列表变化时自动重渲染。
   */
  list(): Character[];
  show(id: string, options?: Record<string, unknown>): Promise<void> | void;
  change(id: string, options?: Record<string, unknown>): Promise<void> | void;
  hide(id: string): Promise<void> | void;
  useCharacter(id: string): Character | null;
  /**
   * React hook:订阅"全部角色"列表,在 Studio 下角色被增删改时自动触发重渲染。
   *
   * 玩家壳运行时角色数据是 build 产物,运行时不变,所以那边的 provider
   * 不订阅 — hook 拿到的列表稳定,不会重渲染。
   */
  useAll(): Character[];
}

export interface DialogueAPI {
  line(): DialogueLine | null;
  choice(): ChoiceContext | null;
  hideBox(): void;
  showBox(): void;
  /**
   * 当前项目默认对话框样式推荐的逐字间隔(ms)。
   * 注意:这是作者基础值，不是玩家当前 config.textSpeed。
   * config.textSpeed 是稳定的玩家速度设置（0～100，50 = 1x），切换样式或剧情动态改速
   * 只会改这个基础值，不会移动设置页滑块。
   */
  getDefaultTextInterval(): number | null;
  useLine(): DialogueLine | null;
  useChoice(): ChoiceContext | null;
  /**
   * 当前 Engine 的说话者头像状态。布局由独立 Visual UI 智能组件决定，
   * 没有头像或对话框隐藏时组件应保持不显示。
   */
  useSpeakerPortrait(): {
    portrait: DialogueSpeakerPortrait | null;
    hidden: boolean;
  };

  /**
   * 切换"快进/跳过"状态。
   * - engine 内部 skip 是 boolean(进行中 / 关闭),跟 config.skipMode 的
   *   "全部跳过 / 只跳已读"是两个维度 —— 前者是状态,后者是策略。
   * - engine 设计:任意按键 / 鼠标点击都会自动关闭 skip。所以 toolbar 按
   *   一次开启后,玩家继续点对话推进时就会自然关闭 —— 这是 AVG 引擎通用语义。
   * - 只在对话/段落 channel 中生效;不在对话中调用会被 engine 忽略。
   */
  toggleSkipMode(): void;

  /**
   * 切换"自动播放"状态。同 skip,boolean 状态,任意输入关闭。
   */
  toggleAutoMode(): void;

  /**
   * 直接设定"快进/跳过"状态(true=进入,false=退出;已处于目标状态则无副作用)。
   * 与 toggleSkipMode 同一底层:受"是否允许快进"检查约束,任意输入自动退出。
   */
  setSkipMode(on: boolean): void;

  /** 直接设定"自动播放"状态。语义同 setSkipMode。 */
  setAutoMode(on: boolean): void;

  /** React hook:订阅"当前是否处于快进模式"。 */
  useSkipMode(): boolean;

  /** React hook:订阅"当前是否处于自动模式"。 */
  useAutoMode(): boolean;

  /**
   * 参与决定每句对话的样式。
   *
   * 每句对话上屏前(写名字/正文之前)调用,拿到这句话的信息和当前样式配置,
   * 返回想改的部分。返回值跟原配置深合并 —— 只写想改的字段即可,
   * 没提到的保持原样;返回 undefined / null 表示不改。
   *
   * 典型用法是按角色改名字颜色:
   *
   * ```ts
   * ctx.dialogue.useStyle((line, _style) => {
   *   const color = palette[line.characterId ?? ""];
   *   if (!color) return null;                  // 没配的角色保持默认
   *   return { styles: { name_card: { text_styles: { color } } } };
   * });
   * ```
   *
   * 注意:
   * - 多个扩展可以同时用,互不覆盖;改同一字段时后注册的赢
   * - 这是同步调用,不要在里面做耗时操作 —— 会拖慢每一句对话
   * - 单个 hook 抛错只跳过它自己,不会搞垮对话框
   *
   * @returns 撤销函数。扩展卸载时应调用它摘掉自己这一份。
   */
  useStyle(hook: DialogueStyleHook): () => void;
}

/**
 * 对话样式 hook。
 *
 * `style` 是当前这句话算出来的完整样式配置(对话框背景、正文、布局、名字牌
 * 都在里面)。返回想改的部分即可,会跟原配置深合并。
 *
 * 常用字段路径:
 * - 名字颜色: `styles.name_card.text_styles.color`
 * - 正文颜色: `styles.dialogue.text_styles.color`
 */
export type DialogueStyleHook = (
  line: DialogueLine,
  style: Record<string, unknown>
) => Record<string, unknown> | undefined | null;

export interface SoundAPI {
  /** 传项目内的原始素材 URI；宿主会统一完成 hash 映射和资源根解析。 */
  play(uri: string, options?: Record<string, unknown>): Promise<void> | void;
  stop(idOrUri: string): Promise<void> | void;
  pause(idOrUri: string): Promise<void> | void;
  resume(idOrUri: string): Promise<void> | void;
}

export interface CurtainAPI {
  fadeIn(options?: Record<string, unknown>): Promise<void> | void;
  fadeOut(options?: Record<string, unknown>): Promise<void> | void;
  show(options?: Record<string, unknown>): Promise<void> | void;
  hide(options?: Record<string, unknown>): Promise<void> | void;
}

export interface CameraAPI {
  pan(options: Record<string, unknown>): Promise<void> | void;
  shake(options: Record<string, unknown>): Promise<void> | void;
  reset(): Promise<void> | void;
}

export interface AssetAPI {
  resolve(uri: string): AssetRef;
}

/**
 * 当前扩展发行目录里的资源。
 *
 * 路径始终相对扩展发行根目录，例如 `assets/cover.png`、`dist/worker.js`；
 * 需要随项目和 Player 发布的静态资源应放在 `assets/`，或由构建输出到 `dist/`。
 * 宿主负责把它映射到 Studio 随机端口或 Player 构建产物，扩展不应感知
 * AppData、file:// 或 localhost 端口。
 */
export interface ExtensionResourceAPI {
  /** 把扩展内相对路径解析成当前宿主可访问的绝对 URL。 */
  url(path: string): string;

  /** 原生动态导入扩展内的 ESM 模块。 */
  importModule<T = unknown>(path: string): Promise<T>;

  /**
   * 创建扩展内 Worker。默认按 module Worker 加载；宿主会处理入口跨域，
   * 扩展不要再对返回的资源 URL 直接调用 `new Worker(url)`。
   */
  createWorker(path: string, options?: WorkerOptions): Worker;
}

/**
 * 宿主提供的 Node.js 模块入口。
 *
 * SDK 只声明浏览器可用的类型契约，具体实现由 Studio / Player 宿主注入；
 * 扩展作者不需要感知 Electron 主进程、渲染进程或 IPC。首版只接受显式
 * `node:` 内置模块，第三方 npm 依赖仍应由扩展自己的构建流程打进 bundle。
 */
export interface NativeNodeAPI {
  // 与 NodeJS.Require 一致，缺省返回 any，作者可按需用泛型补强具体模块类型。
  require<T = any>(specifier: `node:${string}`): T;
  import<T = any>(specifier: `node:${string}`): Promise<T>;
}

/** 宿主原生能力。能力不可用时调用会抛出带审核指引的明确错误。 */
export interface NativeAPI {
  /**
   * Node 内置模块桥。作者可以直接调用，不需要额外 manifest 声明。
   * 是否允许执行由宿主根据扩展来源与服务端审核结果决定。
   */
  readonly node: NativeNodeAPI;
}

/**
 * 场景图层的最小数据快照 —— 鉴赏(GalleryScreen)从「场景」选定后,
 * 存进存档条目里供后续重建场景使用。字段命名跟 Studio 侧 SceneLayer 对齐
 * (`assetPath` 相对 assets/),宿主在 SceneRenderAPI 实装里映射成
 * 引擎要的 `uri`。
 */
export interface GalleryLayer {
  /** 相对 assets/ 的图片路径(对应 SceneLayer.assetPath)。 */
  assetPath: string;
  /** 视差距离,>0;默认 1。 */
  distance?: number;
  /** 初始偏移 "(x%,y%)"。 */
  offset?: string;
  /** 层名(可选,调试/日志用)。 */
  name?: string;
}

/**
 * `ctx.sceneRender.mount` 返回的句柄。调用方在关闭对应大图/Lightbox 时
 * 调用 `dispose()`,宿主据此销毁临时引擎实例并释放容器。幂等。
 */
export interface SceneRenderHandle {
  dispose(): void;
}

/**
 * SceneRender API —— 鉴赏大图等"扩展里要实时渲染一个场景"的能力,
 * 由宿主(Studio runtime / Player runtime)实装。
 *
 * 关键约束:
 *  - 起一个**隔离的**临时引擎实例渲染场景,不污染玩家当前游戏的场景/存档状态
 *    (主引擎 `ctx.scene.change` 会进存档,鉴赏需求是只读预览)。
 *  - default-shell 等 SDK 扩展不能 import engine,通过这条 API 走宿主通道。
 *  - 为后续天气特效(下雪/下雨等)预留:options 字段可扩展。
 */
export interface SceneRenderAPI {
  /**
   * 把一组场景图层渲染到指定 DOM 容器里。
   *
   * @param container 宿主把临时引擎挂到这个元素
   * @param layers    场景图层快照(通常来自 GalleryEntry.layers)
   * @param options   显示模式等(预留扩展)
   */
  mount(
    container: HTMLElement,
    layers: readonly GalleryLayer[],
    options?: { displayType?: string },
  ): Promise<SceneRenderHandle>;
}

export interface SettingsAPI {
  /**
   * 读取当前扩展的 setting。fallback 顺序:
   * 1. project.json.extensionSettings[selfId][key]
   * 2. settingsSchema[key].default
   * 3. undefined
   *
   * key 路径规则(scope 到 (extId, uiId?) 时):
   * - key.includes(".") → 视为完整路径(uiId.field 或扩展级 key),不补前缀
   * - 否则 → 补 `<uiId>.` 前缀(如果 ctx 已 scope 到某 uiId);否则原样
   */
  get<T = unknown>(key: string): T | undefined;

  /**
   * 写当前扩展的 setting。Studio 端会持久化到 project.json,
   * Player 端只写运行时内存(不允许玩家改项目数据)。
   * key 路径规则同 get。
   */
  set<T = unknown>(key: string, value: T): void;

  /** 当前扩展所有 setting 的快照(已合并 default) */
  snapshot(): Record<string, unknown>;

  /** React hook:订阅单个 setting 变化 */
  useValue<T = unknown>(key: string): [T | undefined, (v: T) => void];

  /** React hook:订阅整个 settings snapshot 变化 */
  useSnapshot(): Record<string, unknown>;

  /**
   * 命令式订阅 —— 值变化时调 cb,返回 unsubscribe 函数。
   *
   * 跟 useValue 的区别:这个 API 给非 React 上下文用(尤其 onRegister 钩子)。
   * key 路径规则同 get。
   *
   * 典型场景:autonomous handler 启动时绑了一个 shortcut,用户在 Studio 设置面板
   * 改了字段值 → 这个 subscribe 回调里 unbind 旧 shortcut + bind 新 shortcut,
   * 实现热更新无需重启 Preview。
   */
  subscribe<T = unknown>(key: string, cb: (next: T | undefined) => void): () => void;

  /**
   * 跨 UI 子模块/扩展访问出口 —— 显式声明跨边界,避免误用。
   *
   * 99% 的代码用不到。read/写自己 UI 的字段用 get/set 即可。
   * 跨子模块需要时:`ctx.settings.cross.get("save-screen", "quickSaveShortcut")`。
   */
  cross: {
    get<T = unknown>(uiId: string, key: string): T | undefined;
    set<T = unknown>(uiId: string, key: string, value: T): void;
    subscribe<T = unknown>(
      uiId: string,
      key: string,
      cb: (next: T | undefined) => void,
    ): () => void;
  };
}

/**
 * 扩展声明的"语义动作"。引擎/Studio 用 ActionDef 跟内置动作(advance.next 等)
 * 统一管理:
 *   - 出现在 Studio "输入按键" tab 里(可玩家重映射)
 *   - 玩家偏好跨存档持久化
 *   - 跟引擎内置动作共用同一个键位冲突检测
 *
 * 区别于 bindShortcut:
 *   - bindShortcut 是"硬绑某个 keystroke",扩展私有,不参与统一管理
 *   - registerAction 是"声明语义",真正的键由用户(或作者默认) 决定
 *
 * 推荐:扩展定义自己的快捷键时优先用 registerAction + onAction。
 * bindShortcut 保留作底层逃生口(例如 modal 内部临时键)。
 */
export interface ExtensionActionDef {
  /**
   * 动作 ID。建议格式 `<extension-id>.<action-name>`(例如 `default-shell.quick-save`)。
   * 不强制带前缀,但同一 id 在 registry 里只能存在一个。
   */
  id: string;
  /** 显示给玩家看的标签(中文或 i18n key)。 */
  label: string;
  /**
   * 默认物理键。可一个或多个(多键任意一个触发都生效)。
   * 格式跟 bindShortcut 一致:"F5" / "Ctrl+KeyH" / "MouseMiddle" / "ArrowUp" 等。
   */
  defaultKeys: string[];
}

export interface InputAPI {
  /**
   * 绑定快捷键。
   * shortcut 可以是规范化字符串("Ctrl+KeyH" / "MouseMiddle")。
   * 当 document.activeElement 为 input/textarea/contenteditable 时,
   * 键盘类快捷键不触发(避免在编辑文本时误触);鼠标类快捷键不受此限制。
   * 返回 unbind 函数。
   *
   * 注:对于"应该出现在 Studio 输入按键 tab、允许玩家重映射" 的快捷键,
   * 优先用 registerAction + onAction。bindShortcut 是底层 API,只适合
   * 短生命周期的临时绑定(例如 modal 打开期间的 Escape 关闭)。
   */
  bindShortcut(shortcut: string, handler: () => void): () => void;

  /**
   * 注册一个语义动作。
   *
   * 命名空间强制规则(由实现层 `assertValidExtensionActionId` 校验):
   * - **不允许** `internal.*` 前缀(引擎专用)
   * - **必须**以扩展自身 id 为前缀。例如扩展 id 为 `"user.achievement-pack"`,
   *   合法 action id 形如 `"user.achievement-pack.open-wall"`
   * - 违反者抛 `Error`,在 onRegister 阶段立即报错
   *
   * 重复注册同一 id 会 `console.warn` 并覆盖(通常意味着扩展自身的 bug)。
   * 通常在扩展的 onRegister 中调用一次。
   */
  registerAction(action: ExtensionActionDef): void;

  /**
   * 反注册一个语义动作。会移除所有订阅 + 玩家覆盖。
   * 通常只在扩展卸载时调用。
   */
  unregisterAction(actionId: string): void;

  /**
   * 订阅一个动作。玩家按下当前生效的键(玩家级 / 作者级 / 默认 三级 fallback)
   * → 触发 handler。返回 unsubscribe 函数。
   *
   * 注:订阅一个未 registerAction 过的 id 会得到 console.warn 但不抛错
   * (允许引擎/扩展先订阅、后注册的顺序)。
   */
  onAction(
    actionId: InternalAction | (string & {}),
    handler: () => void,
  ): () => void;

  // ── 新增 API(Internal Extension Points 2026-05) ──

  /**
   * 列出所有已注册的 action(引擎硬编 + 运行时 registerAction 的合集)。
   * 主要给 Studio 项目设置 → 输入按键 面板用。
   *
   * 数据源是运行时 registry 的活快照,manifest 静态声明已经在 2026-05
   * 设计中废弃,作者必须真正 `registerAction` 才能让 action 出现在这里。
   */
  listActions(): ActionInfo[];

  /**
   * 获取某 action 当前生效的物理键数组(经过 fallback 链解析后的结果)。
   *
   * Fallback 链(优先级从高到低):
   *  1. 玩家级 `gameSettings.userKeyBindings[actionId]`
   *  2. 作者级 `projectConfig.actionBindings[actionId]`
   *  3. 引擎/扩展默认 `defaultKeys`
   *
   * 用于 Studio 显示当前生效键、或扩展自身需要展示快捷键标签时。
   */
  getActiveKeys(
    actionId: InternalAction | (string & {}),
  ): string[];
}

/**
 * `ctx.input.listActions()` 返回的单条 action 元数据。
 * 包含运行时 registry 里能查到的所有维度,供 Studio 输入按键面板渲染。
 */
export interface ActionInfo {
  id: string;
  label: string;
  /** 注册时声明的默认物理键。 */
  defaultKeys: string[];
  /** 经过 fallback 链解析后实际生效的物理键。 */
  activeKeys: string[];
  /** action 来源:引擎硬编 vs 扩展运行时注册。 */
  source: "engine" | "extension";
  /** source === "extension" 时存在,标识贡献该 action 的扩展 id。 */
  extensionId?: string;
}

export interface ExtensionContext {
  flow: FlowAPI;
  story: StoryAPI;
  variables: VariablesAPI;
  archive: ArchiveAPI;
  history: HistoryAPI;
  config: EngineConfigAPI;
  ui: UIAPI;
  /**
   * 游戏壳层 API(exit / title)。
   * 原名 `ctx.system`,2026-05 Internal Extension Points 设计后改名为 `ctx.game`。
   */
  game: GameAPI;
  /**
   * System Slot API —— 触发内置系统槽位(标题/存档/读档/设置/历史)。
   * 2026-05 新增,跟旧 `ctx.system` 是完全不同的概念,详见 §4.1。
   */
  system: SystemAPI;
  scene: SceneAPI;
  character: CharacterAPI;
  dialogue: DialogueAPI;
  sound: SoundAPI;
  curtain: CurtainAPI;
  camera: CameraAPI;
  asset: AssetAPI;

  /** 当前扩展包内的图片、CSS、WASM、动态模块和 Worker 资源。 */
  extensionResource: ExtensionResourceAPI;

  /** 当前扩展通过 manifest.dataDependencies 声明并由项目绑定的数据集合。 */
  database: DatabaseAPI;

  /**
   * 统一的宿主原生能力入口。
   * 本地扩展默认可用；工坊扩展由宿主根据服务端审核结果决定是否注入。
   */
  native: NativeAPI;

  /**
   * 场景渲染能力 —— 扩展可在自己的 DOM 容器里临时渲染一个场景,
   * 不影响玩家当前游戏的场景状态。鉴赏(GalleryScreen)大图就用这个。
   */
  sceneRender: SceneRenderAPI;

  /**
   * 可视化界面操作 —— 打开/挂接编辑器产物界面,按「标识符」操作控件。
   * 混合扩展(JSON 布局 + 控制器代码)的核心通道,2026-07-07。
   */
  visualUI: VisualUIAPI;

  /** 当前扩展的项目级设置(scoped 到调用方 extensionId) */
  settings: SettingsAPI;

  /** 输入绑定(快捷键等) */
  input: InputAPI;

  subscribe(event: SDKEvent, handler: () => void): () => void;
  getHost(): unknown;
}

export type SDKContext = ExtensionContext;

export const ExtensionContextReactContext =
  createContext<ExtensionContext | null>(null);
ExtensionContextReactContext.displayName = "ExtensionContext";

export const SDKContextReactContext = ExtensionContextReactContext;

export interface ExtensionContextProviderProps {
  context: ExtensionContext;
  children: React.ReactNode;
}

export const ExtensionContextProvider: React.FC<ExtensionContextProviderProps> =
  ({ context, children }) =>
    createElement(ExtensionContextReactContext.Provider, {
      value: context,
      children,
    });

export const SDKContextProvider = ExtensionContextProvider;
