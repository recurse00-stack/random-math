/**
 * 扩展 sdkVersion 兼容性判断。
 *
 * 项目没有 semver 库,这里是够用的最小实现
 * (见 docs/plans/2026-06-23-extension-marketplace-phase1-backend-plan.md)。
 * 这是浏览器可用的纯函数(SDK 层不依赖 Node/Electron),
 * Studio 加载链路与玩家壳都从这里 import。
 *
 * 语义:
 *   - 主版本必须相同 —— 大版本是破坏性变更的分界,高低都不放行
 *   - 主版本相同时按 `>=` 判定:扩展声明的版本 <= 当前版本才放行
 *
 * 也就是说 sdkVersion 表达的是"我至少需要这个版本"。老扩展声明
 * `>=1.0.0` 在 1.9.0 上照常能用;用了新 API 的扩展声明 `>=1.9.0`,
 * 装到 1.5.0 上会被挡在加载之前,而不是跑起来才崩。
 */

/** 版本号的三段数字。 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

/** 从 "2.0.0" / ">=2.0.0" / "^2.1" / "~2.0" 之类里宽松抽出 major 数字。无法解析返回 null。 */
export function parseMajor(version: string): number | null {
  return parseVersion(version)?.major ?? null;
}

/**
 * 宽松解析版本号,支持 range 前缀(>= ^ ~ 等)和缺省段。
 *
 * 预发布后缀按正式版处理 —— 引擎版本形如 "1.9.0-beta.1",
 * 不能因为带后缀就判成比 "1.9.0" 低,否则 beta 期间所有声明
 * `>=1.9.0` 的扩展都装不上。
 */
export function parseVersion(version: string): ParsedVersion | null {
  if (typeof version !== "string") return null;

  // 只取版本号主体:跳过前缀,遇到 "-" / "+" 就停(预发布 / 构建元数据)
  const m = version.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;

  const major = Number(m[1]);
  const minor = m[2] === undefined ? 0 : Number(m[2]);
  const patch = m[3] === undefined ? 0 : Number(m[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }
  return { major, minor, patch };
}

/**
 * candidate 是否是比 base 更新的版本(严格大于)。
 *
 * 给扩展工坊的「有新版可更新」判定用:candidate = 市场最新版,
 * base = 本机安装时记下的版本。相等或更低都返回 false —— 本地
 * 与市场一致(甚至更新)时不该出现更新入口。
 * 任一侧解析不了保守返回 false:宁可不提示更新,也别拿坏数据误导。
 */
export function isNewerVersion(candidate: string, base: string): boolean {
  const next = parseVersion(candidate);
  const cur = parseVersion(base);
  if (!next || !cur) return false;

  if (next.major !== cur.major) return next.major > cur.major;
  if (next.minor !== cur.minor) return next.minor > cur.minor;
  return next.patch > cur.patch;
}

/**
 * 扩展声明的 sdkVersion 是否兼容当前 SDK 版本。
 *
 * @param sdkVersion 扩展 manifest 里声明的版本要求,如 ">=1.9.0"
 * @param current    当前运行的 SDK 版本(= 引擎版本),如 "1.9.0-beta.1"
 */
export function isSdkCompatible(sdkVersion: string, current: string): boolean {
  const required = parseVersion(sdkVersion);
  const running = parseVersion(current);
  // 任一侧解析不了都保守判不兼容 —— 宁可拦住也别放进来崩
  if (!required || !running) return false;

  // 大版本必须一致
  if (required.major !== running.major) return false;

  // 同主版本内按 ">=" 比:要求的版本不能高于当前
  if (required.minor !== running.minor) return required.minor < running.minor;
  return required.patch <= running.patch;
}
