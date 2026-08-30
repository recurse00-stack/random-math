import { parseVersion } from "./version-compat";

let fallbackDocumentSerial = 0;

/** 创建不可读写语义、仅用于内部关联的记录 id。 */
export function createDatabaseDocumentId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  fallbackDocumentSerial += 1;
  return [
    "row",
    Date.now().toString(36),
    fallbackDocumentSerial.toString(36),
    Math.random().toString(36).slice(2, 10),
  ].join("-");
}

/** Studio、Player 与 manifest 校验共用的数据契约版本判断。 */
export function isDatabaseContractVersionCompatible(
  requirement: string,
  actual: string,
): boolean {
  const required = parseVersion(requirement);
  const current = parseVersion(actual);
  if (!required || !current) return false;
  const atLeast =
    current.major > required.major ||
    (current.major === required.major && current.minor > required.minor) ||
    (current.major === required.major &&
      current.minor === required.minor &&
      current.patch >= required.patch);
  const range = requirement.trim();
  if (range.startsWith("~")) {
    return current.major === required.major &&
      current.minor === required.minor &&
      atLeast;
  }
  if (range.startsWith("^")) {
    if (required.major > 0) {
      return current.major === required.major && atLeast;
    }
    if (required.minor > 0) {
      return current.major === 0 &&
        current.minor === required.minor &&
        atLeast;
    }
    return current.major === 0 &&
      current.minor === 0 &&
      current.patch === required.patch;
  }
  if (range.startsWith(">=")) return atLeast;
  return current.major === required.major &&
    current.minor === required.minor &&
    current.patch === required.patch;
}
