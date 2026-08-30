/**
 * ui-ref 路径解析。
 *
 * 路径语法:
 *   - 不含 "/" → 整个字符串视为本扩展的 uiId
 *   - 含 "/" → 切分为 [extensionId, uiId]
 *   - 空字符串 / 多个 "/" → 抛错(歧义)
 *
 * 字符约束:
 *   - extensionId: 禁 "/" (其他字符不强约束,以 manifest.id 现状为准)
 *   - uiId: 程序变量名规则,字母数字 + "-" + "_",禁 "." 和 "/"
 */

const UI_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface ResolvedUIRef {
  extensionId: string;
  uiId: string;
}

export function resolveUIRef(path: string, selfId: string): ResolvedUIRef {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("ui-ref path 不能为空");
  }
  if (!path.includes("/")) {
    if (!UI_ID_PATTERN.test(path)) {
      throw new Error(`ui-ref uiId 含非法字符: "${path}"`);
    }
    return { extensionId: selfId, uiId: path };
  }
  const idx = path.indexOf("/");
  // 不允许多个 / —— 避免歧义
  if (path.indexOf("/", idx + 1) !== -1) {
    throw new Error(`ui-ref path 含多个 "/": "${path}"`);
  }
  const extensionId = path.slice(0, idx);
  const uiId = path.slice(idx + 1);
  if (!extensionId) {
    throw new Error(`ui-ref extensionId 段为空: "${path}"`);
  }
  if (!uiId) {
    throw new Error(`ui-ref uiId 段为空: "${path}"`);
  }
  if (!UI_ID_PATTERN.test(uiId)) {
    throw new Error(`ui-ref uiId 含非法字符: "${uiId}"`);
  }
  return { extensionId, uiId };
}
