/**
 * SDK 版本 —— 跟引擎(package.json)版本保持一致。
 *
 * 扩展 manifest 里的 sdkVersion 就是拿它来比的,语义是"我至少需要
 * 这个版本的引擎"。发版改 package.json 时必须同步改这里,
 * constants.test.ts 会把两者钉死,漏改会红。
 *
 * 不直接 import package.json:SDK 会被扩展打包引用,不该把整个
 * package.json 拖进 bundle。
 */
export const SDK_VERSION = "1.21.0";

export const EXTENSION_MANIFEST_FILE = "extension.json";

export const EXTENSION_ENTRY_DEFAULT = "dist/index.js";

export const EXTENSION_SRC_DIR = "src";
export const EXTENSION_DIST_DIR = "dist";

/**
 * 扩展 id 约束:长度 2-128,不能含路径分隔符 / 控制字符。
 *
 * Studio 生成的 id 是 "<扩展名>_<短uuid>" 的形式,比如 "开始画面_a3f2bc"。
 * 允许中文、字母、数字、连字符、下划线、点等,保证跨平台文件系统可用。
 * 在 URL 中使用时由调用方 encodeURIComponent。
 */
export const EXTENSION_ID_PATTERN = /^[^\s/\\:*?"<>|\x00-\x1f]{2,128}$/;
