/**
 * 扩展 sdkVersion 兼容性判断。
 *
 * 项目没有 semver 库,这里是够用的最小实现
 * (见 docs/plans/2026-06-23-extension-marketplace-phase1-backend-plan.md)。
 * 这是浏览器可用的纯函数(SDK 层不依赖 Node/Electron),
 * Studio 加载链路与玩家壳都从这里 import。
 *
 * 语义:
 *   - `>=` 和历史裸版本声明表示最低版本，允许跨主版本升级
 *   - 2.x 宿主兼容旧模板生成的 `^1.x` SDK 声明
 *   - 其他 `^` / `~` 保留各自的兼容范围上限，`*` 不限制版本
 *   - 不支持的范围或无效声明保守拒绝，不截取首个数字后放行
 *
 * 也就是说 sdkVersion 表达的是"我至少需要这个版本"。老扩展声明
 * `>=1.0.0` 在 2.0.0 上照常能用;用了新 API 的扩展声明 `>=1.9.0`,
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
  if (typeof sdkVersion !== "string" || typeof current !== "string") return false;
  // SDK 既有契约将预发布版本按正式版比较。严格校验主体，避免错误文本被
  // parseVersion 的宽松数字提取误认成合法范围；不改变其他调用方的解析行为。
  const versionPattern = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/;
  if (!versionPattern.test(current.trim())) return false;
  const running = parseVersion(current);
  if (!running) return false;
  const declaration = sdkVersion.trim().replace(/^≥/, ">=");
  if (declaration === "*") return true;
  const match = declaration.match(/^(>=|\^|~)?\s*(.+)$/);
  if (!match) return false;
  const [, operator, version] = match;
  const parts = version.match(versionPattern);
  if (!parts) return false;
  const required = parseVersion(version);
  if (!required) return false;

  // 先检查完整最低版本，2.0.0 满足 >=1.9.9，1.9.9 不满足 >=2.0.0。
  const comparison = running.major - required.major
    || running.minor - required.minor
    || running.patch - required.patch;
  if (comparison < 0) return false;

  if (operator === "~") {
    return running.major === required.major
      && (parts[2] === undefined || running.minor === required.minor);
  }
  if (operator === "^") {
    // SDK_VERSION 跟随产品版本从 1.x 升到 2.x，旧扩展模板默认生成 ^1.x。
    // 为 2.x 明确保留这代 SDK 的加载兼容性；不据此放行未知的 3.x、
    // 0.x 契约，也不忽略作者通过 ~ 指定的更窄范围。
    if (running.major === 2 && required.major === 1) return true;
    if (running.major !== required.major) return false;
    if (required.major > 0 || parts[2] === undefined) return true;
    if (running.minor !== required.minor) return false;
    return required.minor > 0 || parts[3] === undefined || running.patch === required.patch;
  }
  return true;
}
