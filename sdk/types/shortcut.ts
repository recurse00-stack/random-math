/**
 * 快捷键的类型集合 + 解析/序列化工具。
 *
 * 主键采用 KeyboardEvent.code 标准命名(物理位置,跨布局稳定),
 * 鼠标键自定义命名空间。修饰键合并左右(ControlLeft/Right → "Ctrl")。
 *
 * 规范化字符串格式:
 *   零或多个修饰键 + 一个主键,用 "+" 连接。
 *   例:
 *     "KeyH"                  无修饰键
 *     "F5"                    功能键
 *     "MouseMiddle"           鼠标键
 *     "Ctrl+KeyH"             单修饰键
 *     "Ctrl+Shift+Alt+KeyA"   三修饰键
 *   修饰键按 "Ctrl > Shift > Alt > Meta" 顺序排列。
 */

export type ModifierKey = "Ctrl" | "Shift" | "Alt" | "Meta";

/**
 * 鼠标键命名空间。
 * 注意 Web 标准没给鼠标键 code 命名,这里采用 SDK 自定义的命名,
 * 与 KeyboardEvent.code 集合不冲突(都不以 "Mouse" 开头)。
 */
export type MouseCode =
  | "MouseLeft"
  | "MouseRight"
  | "MouseMiddle"
  | "MouseBack"
  | "MouseForward";

/**
 * 第一版支持的 KeyboardEvent.code 子集。
 * W3C 完整集合见 https://www.w3.org/TR/uievents-code/,这里只列实际能用到的。
 */
export type KeyboardCode =
  // 字母
  | "KeyA" | "KeyB" | "KeyC" | "KeyD" | "KeyE" | "KeyF" | "KeyG" | "KeyH"
  | "KeyI" | "KeyJ" | "KeyK" | "KeyL" | "KeyM" | "KeyN" | "KeyO" | "KeyP"
  | "KeyQ" | "KeyR" | "KeyS" | "KeyT" | "KeyU" | "KeyV" | "KeyW" | "KeyX"
  | "KeyY" | "KeyZ"
  // 数字(主键盘)
  | "Digit0" | "Digit1" | "Digit2" | "Digit3" | "Digit4"
  | "Digit5" | "Digit6" | "Digit7" | "Digit8" | "Digit9"
  // 功能键
  | "F1" | "F2" | "F3" | "F4" | "F5" | "F6"
  | "F7" | "F8" | "F9" | "F10" | "F11" | "F12"
  // 编辑/导航
  | "Escape" | "Enter" | "Space" | "Tab" | "Backspace" | "Delete" | "Insert"
  | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"
  | "Home" | "End" | "PageUp" | "PageDown";

export type ShortcutKey = KeyboardCode | MouseCode;

export interface ShortcutSpec {
  key: ShortcutKey;
  modifiers?: ModifierKey[];
}

/** parseShortcut 的返回类型 —— 永远带 modifiers: [] 而非 undefined */
export type ParsedShortcut = Required<ShortcutSpec>;

const MODIFIER_ORDER: ModifierKey[] = ["Ctrl", "Shift", "Alt", "Meta"];
const MODIFIER_SET: ReadonlySet<string> = new Set<string>(MODIFIER_ORDER);

/**
 * 所有合法的主键字面量集合。
 * 与 KeyboardCode + MouseCode 类型保持同步,用于 runtime 校验,
 * 把"类型谎言"封死在 SDK 边界。
 */
const VALID_KEYS: ReadonlySet<string> = new Set<string>([
  // 字母
  "KeyA", "KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH",
  "KeyI", "KeyJ", "KeyK", "KeyL", "KeyM", "KeyN", "KeyO", "KeyP",
  "KeyQ", "KeyR", "KeyS", "KeyT", "KeyU", "KeyV", "KeyW", "KeyX",
  "KeyY", "KeyZ",
  // 数字
  "Digit0", "Digit1", "Digit2", "Digit3", "Digit4",
  "Digit5", "Digit6", "Digit7", "Digit8", "Digit9",
  // 功能键
  "F1", "F2", "F3", "F4", "F5", "F6",
  "F7", "F8", "F9", "F10", "F11", "F12",
  // 编辑/导航
  "Escape", "Enter", "Space", "Tab", "Backspace", "Delete", "Insert",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown",
  // 鼠标
  "MouseLeft", "MouseRight", "MouseMiddle", "MouseBack", "MouseForward",
]);

function sortModifiers(mods: ModifierKey[]): ModifierKey[] {
  return MODIFIER_ORDER.filter((m) => mods.includes(m));
}

/**
 * 解析快捷键字符串。
 *
 * 注意:token 严格区分大小写。`"ctrl"` 不会被识别为修饰键,`"keyh"` 也不会被识别为主键。
 */
export function parseShortcut(s: string): ParsedShortcut {
  if (!s || typeof s !== "string") {
    throw new Error(`shortcut 字符串不能为空: ${JSON.stringify(s)}`);
  }
  if (s.startsWith("+")) {
    throw new Error(`shortcut 不能以 + 开头: ${s}`);
  }
  if (s.endsWith("+")) {
    throw new Error(`shortcut 不能以 + 结尾: ${s}`);
  }
  const parts = s.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`shortcut 字符串非法: ${s}`);
  }

  const mods: ModifierKey[] = [];
  let mainKey: ShortcutKey | null = null;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (MODIFIER_SET.has(p)) {
      // 修饰键不允许出现在末尾(末尾必须是主键)
      if (i === parts.length - 1) {
        throw new Error(`shortcut 缺少主键: ${s}`);
      }
      // 重复修饰键报错(避免 sortModifiers 静默去重掩盖配置笔误)
      if (mods.includes(p as ModifierKey)) {
        throw new Error(`修饰键重复: ${s}`);
      }
      mods.push(p as ModifierKey);
    } else {
      // 主键必须是最后一个
      if (i !== parts.length - 1) {
        throw new Error(`shortcut 主键必须在末尾: ${s}`);
      }
      mainKey = p as ShortcutKey;
    }
  }

  if (!mainKey) {
    throw new Error(`shortcut 没有主键: ${s}`);
  }
  if (!VALID_KEYS.has(mainKey)) {
    throw new Error(`未知主键: "${mainKey}" (in "${s}")`);
  }
  return { key: mainKey, modifiers: sortModifiers(mods) };
}

export function formatShortcut(spec: ShortcutSpec): string {
  const mods = sortModifiers(spec.modifiers ?? []);
  if (!VALID_KEYS.has(spec.key)) {
    throw new Error(`未知主键: "${spec.key}"`);
  }
  return [...mods, spec.key].join("+");
}

export function normalizeShortcut(s: string): string {
  return formatShortcut(parseShortcut(s));
}
