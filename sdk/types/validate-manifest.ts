import { EXTENSION_ID_PATTERN, EXTENSION_ENTRY_DEFAULT } from "../constants";
import type {
  BuiltinComponentId,
  ExtensionContributions,
  ExtensionDialogueBoxStyleContribution,
  ExtensionInputActionContribution,
  ExtensionParagraphStyleContribution,
  ExtensionManifest,
  ExtensionNetworkDeclaration,
  ExtensionRiskTier,
  PropsSchemaField,
  PropsSchemaFieldType,
} from "./extension-manifest";
import type {
  DatabaseAssetKind,
  DatabaseCollectionSchema,
  DatabaseColumnDefinition,
  DatabaseColumnType,
  DatabaseDependencyAccess,
  DatabaseDocumentInput,
  DatabaseJsonPrimitive,
  DatabaseRuntimePolicy,
  DatabaseSchemaProperty,
  DatabaseSchemaValueType,
  ExtensionDatabaseCollectionTemplate,
  ExtensionDatabaseDependency,
} from "./database";
import { isDatabaseContractVersionCompatible } from "../database-contract";

/**
 * 允许声明 `manifest.builtin: true` 的扩展 id 前缀白名单。
 * 第三方扩展声明 builtin 会被加载阶段拒绝。
 */
const BUILTIN_ID_ALLOWED_PREFIXES: readonly string[] = [
  "avg.internal.",
];

const VALID_FIELD_TYPES: ReadonlySet<PropsSchemaFieldType> = new Set([
  "string",
  "number",
  "boolean",
  "enum",
]);

const VALID_BUILTIN_COMPONENT_IDS: ReadonlySet<BuiltinComponentId> = new Set([
  "DialogueBox",
  "Choice",
  "InputBox",
]);

const VALID_RISK_TIERS: ReadonlySet<ExtensionRiskTier> = new Set([
  "safe",
  "standard",
  "privileged",
]);

// 与 Visual UI 文件名契约保持一致，但 SDK 不能反向依赖 engine。
const VISUAL_UI_FILE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const DATA_DEPENDENCY_ALIAS_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const DATA_CONTRACT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const VERSION_RANGE_PATTERN = /^(?:\^|~|>=)?\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?$/;
const VALID_DATA_ACCESS: ReadonlySet<DatabaseDependencyAccess> = new Set([
  "read",
  "runtime-write",
]);
const VALID_RUNTIME_POLICIES: ReadonlySet<DatabaseRuntimePolicy> = new Set([
  "readonly",
  "session",
  "archive",
  "profile",
]);
const VALID_SCHEMA_TYPES: ReadonlySet<DatabaseSchemaValueType> = new Set([
  "string",
  "number",
  "boolean",
  "null",
  "array",
  "object",
]);
const VALID_DATABASE_COLUMN_TYPES: ReadonlySet<DatabaseColumnType> = new Set([
  "text",
  "long-text",
  "number",
  "boolean",
  "select",
  "image",
  "asset",
  "color",
  "character",
  "fragment",
]);
const VALID_DATABASE_ASSET_KINDS: ReadonlySet<DatabaseAssetKind> = new Set([
  "image",
  "audio",
  "video",
  "any",
]);

export class ExtensionManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtensionManifestError";
  }
}

function ensureString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ExtensionManifestError(`字段 "${field}" 必须是非空字符串`);
  }
  return value;
}

function validateField(name: string, raw: unknown): PropsSchemaField {
  if (!raw || typeof raw !== "object") {
    throw new ExtensionManifestError(
      `propsSchema."${name}" 必须是对象`,
    );
  }
  const r = raw as Record<string, unknown>;
  const type = r.type as PropsSchemaFieldType | undefined;
  if (!type || !VALID_FIELD_TYPES.has(type)) {
    throw new ExtensionManifestError(
      `propsSchema."${name}".type 必须是 string | number | boolean | enum`,
    );
  }
  if (type === "enum") {
    if (!Array.isArray(r.options) || r.options.length === 0) {
      throw new ExtensionManifestError(
        `propsSchema."${name}".options 在 type=enum 时必须是非空数组`,
      );
    }
  }
  const out: PropsSchemaField = { type };
  if (r.default !== undefined) out.default = r.default;
  if (typeof r.description === "string") out.description = r.description;
  if (Array.isArray(r.options)) out.options = r.options.map(String);
  return out;
}

function validateDialogueBoxStyles(
  raw: unknown,
): ExtensionDialogueBoxStyleContribution[] {
  if (!Array.isArray(raw)) {
    throw new ExtensionManifestError(
      "contributes.dialogueBoxStyles 必须是数组",
    );
  }

  const styles: ExtensionDialogueBoxStyleContribution[] = [];
  const seenIds = new Set<string>();
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    const field = `contributes.dialogueBoxStyles[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ExtensionManifestError(`${field} 必须是对象`);
    }
    const value = item as Record<string, unknown>;
    const id = ensureString(value.id, `${field}.id`);
    if (seenIds.has(id)) {
      throw new ExtensionManifestError(
        `contributes.dialogueBoxStyles 出现重复 id "${id}"`,
      );
    }
    seenIds.add(id);

    const visualUI = ensureString(value.visualUI, `${field}.visualUI`);
    if (!VISUAL_UI_FILE_NAME_PATTERN.test(visualUI)) {
      throw new ExtensionManifestError(
        `${field}.visualUI "${visualUI}" 不是安全的 Visual UI 文件名`,
      );
    }

    const style: ExtensionDialogueBoxStyleContribution = {
      id,
      name: ensureString(value.name, `${field}.name`),
      visualUI,
    };
    if (value.description !== undefined) {
      if (typeof value.description !== "string") {
        throw new ExtensionManifestError(`${field}.description 必须是字符串`);
      }
      style.description = value.description;
    }
    if (value.dialogueBox !== undefined) {
      if (
        !value.dialogueBox ||
        typeof value.dialogueBox !== "object" ||
        Array.isArray(value.dialogueBox)
      ) {
        throw new ExtensionManifestError(`${field}.dialogueBox 必须是对象`);
      }
      style.dialogueBox = {
        ...(value.dialogueBox as Record<string, unknown>),
      };
    }
    styles.push(style);
  }
  return styles;
}

function validateParagraphStyles(
  raw: unknown,
): ExtensionParagraphStyleContribution[] {
  if (!Array.isArray(raw)) {
    throw new ExtensionManifestError(
      "contributes.paragraphStyles 必须是数组",
    );
  }

  const styles: ExtensionParagraphStyleContribution[] = [];
  const seenIds = new Set<string>();
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    const field = `contributes.paragraphStyles[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ExtensionManifestError(`${field} 必须是对象`);
    }
    const value = item as Record<string, unknown>;
    const id = ensureString(value.id, `${field}.id`);
    if (seenIds.has(id)) {
      throw new ExtensionManifestError(
        `contributes.paragraphStyles 出现重复 id "${id}"`,
      );
    }
    seenIds.add(id);

    const visualUI = ensureString(value.visualUI, `${field}.visualUI`);
    if (!VISUAL_UI_FILE_NAME_PATTERN.test(visualUI)) {
      throw new ExtensionManifestError(
        `${field}.visualUI "${visualUI}" 不是安全的 Visual UI 文件名`,
      );
    }

    const style: ExtensionParagraphStyleContribution = {
      id,
      name: ensureString(value.name, `${field}.name`),
      visualUI,
    };
    if (value.description !== undefined) {
      if (typeof value.description !== "string") {
        throw new ExtensionManifestError(`${field}.description 必须是字符串`);
      }
      style.description = value.description;
    }
    styles.push(style);
  }
  return styles;
}

function validateInputActions(
  raw: unknown,
  extensionId: string,
): ExtensionInputActionContribution[] {
  if (!Array.isArray(raw)) {
    throw new ExtensionManifestError("contributes.inputActions 必须是数组");
  }

  const actions: ExtensionInputActionContribution[] = [];
  const seenIds = new Set<string>();
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    const field = `contributes.inputActions[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ExtensionManifestError(`${field} 必须是对象`);
    }
    const value = item as Record<string, unknown>;
    const id = ensureString(value.id, `${field}.id`);
    if (id.startsWith("internal.") || !id.startsWith(`${extensionId}.`)) {
      throw new ExtensionManifestError(
        `${field}.id 必须以扩展自身命名空间 "${extensionId}." 开头`,
      );
    }
    if (seenIds.has(id)) {
      throw new ExtensionManifestError(
        `contributes.inputActions 出现重复 id "${id}"`,
      );
    }
    seenIds.add(id);

    if (!Array.isArray(value.defaultKeys)) {
      throw new ExtensionManifestError(`${field}.defaultKeys 必须是字符串数组`);
    }
    const defaultKeys = value.defaultKeys.map((key, keyIndex) => {
      if (typeof key !== "string" || key.length === 0) {
        throw new ExtensionManifestError(
          `${field}.defaultKeys[${keyIndex}] 必须是非空字符串`,
        );
      }
      return key;
    });
    actions.push({
      id,
      label: ensureString(value.label, `${field}.label`),
      defaultKeys,
    });
  }
  return actions;
}

function cloneJsonValue(value: unknown, field: string): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ExtensionManifestError(`${field} 只能包含有限数字`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => cloneJsonValue(item, `${field}[${index}]`));
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      next[key] = cloneJsonValue(item, `${field}.${key}`);
    }
    return next;
  }
  throw new ExtensionManifestError(`${field} 必须是 JSON 可序列化数据`);
}

function validateSchemaProperty(
  raw: unknown,
  field: string,
  collectionRoot = false,
): DatabaseSchemaProperty {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ExtensionManifestError(`${field} 必须是对象`);
  }
  const value = raw as Record<string, unknown>;
  const schema: DatabaseSchemaProperty = {};
  if (value.type !== undefined) {
    const types = Array.isArray(value.type) ? value.type : [value.type];
    if (
      types.length === 0 ||
      !types.every(
        (type) =>
          typeof type === "string" &&
          VALID_SCHEMA_TYPES.has(type as DatabaseSchemaValueType),
      )
    ) {
      throw new ExtensionManifestError(`${field}.type 包含不支持的数据类型`);
    }
    if (collectionRoot && (types.length !== 1 || types[0] !== "object")) {
      throw new ExtensionManifestError(`${field}.type 必须是 object`);
    }
    schema.type = Array.isArray(value.type)
      ? types as DatabaseSchemaValueType[]
      : types[0] as DatabaseSchemaValueType;
  }
  if (value.description !== undefined) {
    if (typeof value.description !== "string") {
      throw new ExtensionManifestError(`${field}.description 必须是字符串`);
    }
    schema.description = value.description;
  }
  if (value.enum !== undefined) {
    if (!Array.isArray(value.enum)) {
      throw new ExtensionManifestError(`${field}.enum 必须是数组`);
    }
    schema.enum = value.enum.map((item, index) => {
      if (
        item !== null &&
        typeof item !== "string" &&
        typeof item !== "number" &&
        typeof item !== "boolean"
      ) {
        throw new ExtensionManifestError(
          `${field}.enum[${index}] 必须是 JSON 基础值`,
        );
      }
      if (typeof item === "number" && !Number.isFinite(item)) {
        throw new ExtensionManifestError(`${field}.enum[${index}] 必须是有限数字`);
      }
      return item as DatabaseJsonPrimitive;
    });
  }
  if (value.items !== undefined) {
    schema.items = validateSchemaProperty(value.items, `${field}.items`);
  }
  if (value.properties !== undefined) {
    if (
      !value.properties ||
      typeof value.properties !== "object" ||
      Array.isArray(value.properties)
    ) {
      throw new ExtensionManifestError(`${field}.properties 必须是对象`);
    }
    schema.properties = Object.fromEntries(
      Object.entries(value.properties).map(([key, property]) => [
        key,
        validateSchemaProperty(property, `${field}.properties.${key}`),
      ]),
    );
  }
  if (value.required !== undefined) {
    if (
      !Array.isArray(value.required) ||
      !value.required.every((item) => typeof item === "string" && item.trim())
    ) {
      throw new ExtensionManifestError(`${field}.required 必须是非空字符串数组`);
    }
    schema.required = [...new Set(value.required as string[])];
  }
  if (value.additionalProperties !== undefined) {
    if (typeof value.additionalProperties !== "boolean") {
      throw new ExtensionManifestError(
        `${field}.additionalProperties 必须是布尔值`,
      );
    }
    schema.additionalProperties = value.additionalProperties;
  }
  const collectionSchema = schema as DatabaseCollectionSchema;
  if (collectionRoot && value.columns !== undefined) {
    collectionSchema.columns = validateDatabaseColumns(
      value.columns,
      `${field}.columns`,
    );
  }
  if (collectionRoot && value.titleColumn !== undefined) {
    collectionSchema.titleColumn = ensureString(
      value.titleColumn,
      `${field}.titleColumn`,
    );
  }
  if (collectionRoot && value.imageColumn !== undefined) {
    collectionSchema.imageColumn = ensureString(
      value.imageColumn,
      `${field}.imageColumn`,
    );
  }
  if (collectionRoot && collectionSchema.columns) {
    const columns = new Map(
      collectionSchema.columns.map((column) => [column.key, column]),
    );
    if (
      collectionSchema.titleColumn &&
      !columns.has(collectionSchema.titleColumn)
    ) {
      throw new ExtensionManifestError(`${field}.titleColumn 必须指向已有列`);
    }
    if (
      collectionSchema.imageColumn &&
      columns.get(collectionSchema.imageColumn)?.type !== "image"
    ) {
      throw new ExtensionManifestError(`${field}.imageColumn 必须指向图片列`);
    }
  }
  return schema;
}

function validateDatabaseColumns(
  raw: unknown,
  field: string,
): DatabaseColumnDefinition[] {
  if (!Array.isArray(raw)) {
    throw new ExtensionManifestError(`${field} 必须是数组`);
  }
  const keys = new Set<string>();
  return raw.map((item, index) => {
    const itemField = `${field}[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ExtensionManifestError(`${itemField} 必须是对象`);
    }
    const value = item as Record<string, unknown>;
    const key = ensureString(value.key, `${itemField}.key`);
    if (key === "id" || key === "_id") {
      throw new ExtensionManifestError(`${itemField}.key 不能使用系统字段 id`);
    }
    if (keys.has(key)) {
      throw new ExtensionManifestError(`${field} 出现重复列 ${key}`);
    }
    keys.add(key);
    const type = ensureString(value.type, `${itemField}.type`) as DatabaseColumnType;
    if (!VALID_DATABASE_COLUMN_TYPES.has(type)) {
      throw new ExtensionManifestError(`${itemField}.type 不受支持`);
    }
    const column: DatabaseColumnDefinition = {
      key,
      label: ensureString(value.label, `${itemField}.label`),
      type,
    };
    if (value.description !== undefined) {
      column.description = ensureString(value.description, `${itemField}.description`);
    }
    if (value.default !== undefined) {
      column.default = cloneJsonValue(
        value.default,
        `${itemField}.default`,
      ) as DatabaseColumnDefinition["default"];
    }
    if (value.options !== undefined) {
      if (!Array.isArray(value.options)) {
        throw new ExtensionManifestError(`${itemField}.options 必须是数组`);
      }
      column.options = value.options.map((option, optionIndex) => {
        const optionField = `${itemField}.options[${optionIndex}]`;
        if (!option || typeof option !== "object" || Array.isArray(option)) {
          throw new ExtensionManifestError(`${optionField} 必须是对象`);
        }
        const optionValue = option as Record<string, unknown>;
        return {
          label: ensureString(optionValue.label, `${optionField}.label`),
          value: ensureString(optionValue.value, `${optionField}.value`),
        };
      });
    }
    if (value.accepts !== undefined) {
      if (type !== "asset") {
        throw new ExtensionManifestError(
          `${itemField}.accepts 只适用于资源列`,
        );
      }
      if (
        !Array.isArray(value.accepts) ||
        value.accepts.length === 0 ||
        !value.accepts.every(
          (kind) =>
            typeof kind === "string" &&
            VALID_DATABASE_ASSET_KINDS.has(kind as DatabaseAssetKind),
        )
      ) {
        throw new ExtensionManifestError(
          `${itemField}.accepts 必须是 image | audio | video | any 的非空数组`,
        );
      }
      const accepts = [...new Set(value.accepts as DatabaseAssetKind[])];
      column.accepts = accepts.includes("any") ? ["any"] : accepts;
    }
    if (type === "select" && (!column.options || column.options.length === 0)) {
      throw new ExtensionManifestError(`${itemField}.options 至少需要一个选项`);
    }
    return column;
  });
}

function validateCollectionTemplate(
  raw: unknown,
  field: string,
): ExtensionDatabaseCollectionTemplate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ExtensionManifestError(`${field} 必须是对象或 false`);
  }
  const value = raw as Record<string, unknown>;
  const contractVersion = ensureString(
    value.contractVersion,
    `${field}.contractVersion`,
  );
  if (!EXACT_VERSION_PATTERN.test(contractVersion)) {
    throw new ExtensionManifestError(
      `${field}.contractVersion 必须是完整的三段版本号`,
    );
  }
  const template: ExtensionDatabaseCollectionTemplate = { contractVersion };
  if (value.name !== undefined) {
    template.name = ensureString(value.name, `${field}.name`);
  }
  if (value.runtimePolicy !== undefined) {
    if (
      typeof value.runtimePolicy !== "string" ||
      !VALID_RUNTIME_POLICIES.has(value.runtimePolicy as DatabaseRuntimePolicy)
    ) {
      throw new ExtensionManifestError(
        `${field}.runtimePolicy 必须是 readonly | session | archive | profile`,
      );
    }
    template.runtimePolicy = value.runtimePolicy as DatabaseRuntimePolicy;
  }
  if (value.schema !== undefined) {
    template.schema = validateSchemaProperty(
      value.schema,
      `${field}.schema`,
      true,
    ) as DatabaseCollectionSchema;
  }
  if (value.documents !== undefined) {
    if (!Array.isArray(value.documents)) {
      throw new ExtensionManifestError(`${field}.documents 必须是数组`);
    }
    template.documents = value.documents.map((document, index) => {
      const documentField = `${field}.documents[${index}]`;
      const cloned = cloneJsonValue(document, documentField);
      if (!cloned || typeof cloned !== "object" || Array.isArray(cloned)) {
        throw new ExtensionManifestError(`${documentField} 必须是文档对象`);
      }
      return cloned as DatabaseDocumentInput;
    });
  }
  return template;
}

function validateDataDependencies(
  raw: unknown,
): Record<string, ExtensionDatabaseDependency> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ExtensionManifestError("dataDependencies 必须是对象");
  }
  const dependencies: Record<string, ExtensionDatabaseDependency> = {};
  for (const [alias, item] of Object.entries(raw)) {
    const field = `dataDependencies.${alias}`;
    if (!DATA_DEPENDENCY_ALIAS_PATTERN.test(alias)) {
      throw new ExtensionManifestError(
        `${field} 的别名必须以字母开头，且只包含字母、数字、-、_`,
      );
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ExtensionManifestError(`${field} 必须是对象`);
    }
    const value = item as Record<string, unknown>;
    const contract = ensureString(value.contract, `${field}.contract`);
    if (!DATA_CONTRACT_ID_PATTERN.test(contract)) {
      throw new ExtensionManifestError(
        `${field}.contract 必须是小写的稳定命名空间 id`,
      );
    }
    const version = ensureString(value.version, `${field}.version`);
    if (!VERSION_RANGE_PATTERN.test(version)) {
      throw new ExtensionManifestError(`${field}.version 必须包含可解析的版本号`);
    }
    const dependency: ExtensionDatabaseDependency = { contract, version };
    if (value.name !== undefined) {
      dependency.name = ensureString(value.name, `${field}.name`);
    }
    if (value.description !== undefined) {
      if (typeof value.description !== "string") {
        throw new ExtensionManifestError(`${field}.description 必须是字符串`);
      }
      dependency.description = value.description;
    }
    if (value.access !== undefined) {
      if (
        typeof value.access !== "string" ||
        !VALID_DATA_ACCESS.has(value.access as DatabaseDependencyAccess)
      ) {
        throw new ExtensionManifestError(
          `${field}.access 必须是 read | runtime-write`,
        );
      }
      dependency.access = value.access as DatabaseDependencyAccess;
    }
    if (value.optional !== undefined) {
      if (typeof value.optional !== "boolean") {
        throw new ExtensionManifestError(`${field}.optional 必须是布尔值`);
      }
      dependency.optional = value.optional;
    }
    if (value.autoCreate !== undefined) {
      dependency.autoCreate =
        value.autoCreate === false
          ? false
          : validateCollectionTemplate(value.autoCreate, `${field}.autoCreate`);
      if (
        dependency.autoCreate !== false &&
        !isDatabaseContractVersionCompatible(
          dependency.version,
          dependency.autoCreate.contractVersion,
        )
      ) {
        throw new ExtensionManifestError(
          `${field}.autoCreate.contractVersion 不满足依赖版本 ${dependency.version}`,
        );
      }
    }
    dependencies[alias] = dependency;
  }
  return dependencies;
}

export function validateExtensionManifest(raw: unknown): ExtensionManifest {
  if (!raw || typeof raw !== "object") {
    throw new ExtensionManifestError("manifest 必须是 JSON 对象");
  }
  const r = raw as Record<string, unknown>;

  const id = ensureString(r.id, "id");
  if (!EXTENSION_ID_PATTERN.test(id)) {
    throw new ExtensionManifestError(
      `id "${id}" 不合法:不能包含空格 / \\ : * ? " < > | 等路径特殊字符,长度 2-128`,
    );
  }

  // 原始 manifest 是否显式声明了 entry —— 决定 hasProgram(纯资源扩展不写 entry)。
  const declaredEntry = typeof r.entry === "string" && r.entry.length > 0;

  const manifest: ExtensionManifest = {
    id,
    name: ensureString(r.name, "name"),
    // author 可以为空(新建扩展时 UI 没强制填)
    author: typeof r.author === "string" ? r.author : "",
    version: ensureString(r.version, "version"),
    entry: declaredEntry ? (r.entry as string) : EXTENSION_ENTRY_DEFAULT,
    // 声明了 entry = 带程序;没声明 = 纯资源扩展。老 manifest 都声明了 entry。
    hasProgram: declaredEntry,
    sdkVersion: ensureString(r.sdkVersion, "sdkVersion"),
  };

  if (typeof r.description === "string") manifest.description = r.description;
  if (typeof r.icon === "string") manifest.icon = r.icon;

  if (r.dataDependencies !== undefined) {
    manifest.dataDependencies = validateDataDependencies(r.dataDependencies);
  }

  if (r.contributes !== undefined) {
    if (
      !r.contributes ||
      typeof r.contributes !== "object" ||
      Array.isArray(r.contributes)
    ) {
      throw new ExtensionManifestError("contributes 必须是对象");
    }
    const rawContributions = r.contributes as Record<string, unknown>;
    const contributes: ExtensionContributions = {};
    if (rawContributions.dialogueBoxStyles !== undefined) {
      contributes.dialogueBoxStyles = validateDialogueBoxStyles(
        rawContributions.dialogueBoxStyles,
      );
    }
    if (rawContributions.paragraphStyles !== undefined) {
      contributes.paragraphStyles = validateParagraphStyles(
        rawContributions.paragraphStyles,
      );
    }
    if (rawContributions.inputActions !== undefined) {
      contributes.inputActions = validateInputActions(
        rawContributions.inputActions,
        id,
      );
    }
    manifest.contributes = contributes;
  }

  if (r.propsSchema !== undefined) {
    if (typeof r.propsSchema !== "object" || r.propsSchema === null) {
      throw new ExtensionManifestError("propsSchema 必须是对象");
    }
    const out: Record<string, PropsSchemaField> = {};
    for (const [key, val] of Object.entries(r.propsSchema)) {
      out[key] = validateField(key, val);
    }
    manifest.propsSchema = out;
  }

  if (r.overrides !== undefined) {
    if (!Array.isArray(r.overrides)) {
      throw new ExtensionManifestError("overrides 必须是字符串数组");
    }
    const overrides: BuiltinComponentId[] = [];
    const seen = new Set<string>();
    for (const o of r.overrides) {
      if (
        typeof o !== "string" ||
        !VALID_BUILTIN_COMPONENT_IDS.has(o as BuiltinComponentId)
      ) {
        throw new ExtensionManifestError(
          `overrides 项 "${String(o)}" 不是已知的内置组件 ID(允许:DialogueBox / Choice / InputBox)`,
        );
      }
      if (seen.has(o)) {
        throw new ExtensionManifestError(
          `overrides 出现重复项 "${o}"`,
        );
      }
      seen.add(o);
      overrides.push(o as BuiltinComponentId);
    }
    manifest.overrides = overrides;
  }

  if (r.builtin !== undefined) {
    if (typeof r.builtin !== "boolean") {
      throw new ExtensionManifestError("builtin 必须是布尔值");
    }
    if (
      r.builtin === true &&
      !BUILTIN_ID_ALLOWED_PREFIXES.some((prefix) => id.startsWith(prefix))
    ) {
      throw new ExtensionManifestError(
        `扩展 "${id}" 声明 builtin: true,但 id 不在白名单前缀(` +
          BUILTIN_ID_ALLOWED_PREFIXES.join(", ") +
          `)内。builtin 仅供 avg.internal.* 扩展使用。`,
      );
    }
    manifest.builtin = r.builtin;
  }

  // 阶段二权限模型的声明字段:阶段一只静态校验"形状",不锁 permissions 枚举、不 gating。
  if (r.permissions !== undefined) {
    if (!Array.isArray(r.permissions)) {
      throw new ExtensionManifestError("permissions 必须是字符串数组");
    }
    const perms: string[] = [];
    for (const p of r.permissions) {
      if (typeof p !== "string") {
        throw new ExtensionManifestError(`permissions 项 "${String(p)}" 不是字符串`);
      }
      perms.push(p);
    }
    manifest.permissions = perms;
  }

  if (r.network !== undefined) {
    if (typeof r.network !== "object" || r.network === null) {
      throw new ExtensionManifestError("network 必须是对象");
    }
    const net = r.network as { domains?: unknown };
    const decl: ExtensionNetworkDeclaration = {};
    if (net.domains !== undefined) {
      if (!Array.isArray(net.domains) || net.domains.some((d) => typeof d !== "string")) {
        throw new ExtensionManifestError("network.domains 必须是字符串数组");
      }
      decl.domains = net.domains as string[];
    }
    manifest.network = decl;
  }

  if (r.riskTier !== undefined) {
    if (typeof r.riskTier !== "string" || !VALID_RISK_TIERS.has(r.riskTier as ExtensionRiskTier)) {
      throw new ExtensionManifestError(
        `riskTier "${String(r.riskTier)}" 非法(允许:safe / standard / privileged)`,
      );
    }
    manifest.riskTier = r.riskTier as ExtensionRiskTier;
  }

  if (r.minHostVersion !== undefined) {
    if (typeof r.minHostVersion !== "string") {
      throw new ExtensionManifestError("minHostVersion 必须是字符串");
    }
    manifest.minHostVersion = r.minHostVersion;
  }

  return manifest;
}
