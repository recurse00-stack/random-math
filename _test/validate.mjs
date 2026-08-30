// sdk/constants.ts
var EXTENSION_ENTRY_DEFAULT = "dist/index.js";
var EXTENSION_ID_PATTERN = /^[^\s/\\:*?"<>|\x00-\x1f]{2,128}$/;

// sdk/version-compat.ts
function parseVersion(version) {
  if (typeof version !== "string") return null;
  const m = version.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = m[2] === void 0 ? 0 : Number(m[2]);
  const patch = m[3] === void 0 ? 0 : Number(m[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }
  return { major, minor, patch };
}

// sdk/database-contract.ts
function isDatabaseContractVersionCompatible(requirement, actual) {
  const required = parseVersion(requirement);
  const current = parseVersion(actual);
  if (!required || !current) return false;
  const atLeast = current.major > required.major || current.major === required.major && current.minor > required.minor || current.major === required.major && current.minor === required.minor && current.patch >= required.patch;
  const range = requirement.trim();
  if (range.startsWith("~")) {
    return current.major === required.major && current.minor === required.minor && atLeast;
  }
  if (range.startsWith("^")) {
    if (required.major > 0) {
      return current.major === required.major && atLeast;
    }
    if (required.minor > 0) {
      return current.major === 0 && current.minor === required.minor && atLeast;
    }
    return current.major === 0 && current.minor === 0 && current.patch === required.patch;
  }
  if (range.startsWith(">=")) return atLeast;
  return current.major === required.major && current.minor === required.minor && current.patch === required.patch;
}

// sdk/types/validate-manifest.ts
var BUILTIN_ID_ALLOWED_PREFIXES = [
  "avg.internal."
];
var VALID_FIELD_TYPES = /* @__PURE__ */ new Set([
  "string",
  "number",
  "boolean",
  "enum"
]);
var VALID_BUILTIN_COMPONENT_IDS = /* @__PURE__ */ new Set([
  "DialogueBox",
  "Choice",
  "InputBox"
]);
var VALID_RISK_TIERS = /* @__PURE__ */ new Set([
  "safe",
  "standard",
  "privileged"
]);
var VISUAL_UI_FILE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
var DATA_DEPENDENCY_ALIAS_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
var DATA_CONTRACT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/;
var EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
var VERSION_RANGE_PATTERN = /^(?:\^|~|>=)?\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?$/;
var VALID_DATA_ACCESS = /* @__PURE__ */ new Set([
  "read",
  "runtime-write"
]);
var VALID_RUNTIME_POLICIES = /* @__PURE__ */ new Set([
  "readonly",
  "session",
  "archive",
  "profile"
]);
var VALID_SCHEMA_TYPES = /* @__PURE__ */ new Set([
  "string",
  "number",
  "boolean",
  "null",
  "array",
  "object"
]);
var VALID_DATABASE_COLUMN_TYPES = /* @__PURE__ */ new Set([
  "text",
  "long-text",
  "number",
  "boolean",
  "select",
  "image",
  "asset",
  "color",
  "character",
  "fragment"
]);
var VALID_DATABASE_ASSET_KINDS = /* @__PURE__ */ new Set([
  "image",
  "audio",
  "video",
  "any"
]);
var ExtensionManifestError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ExtensionManifestError";
  }
};
function ensureString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ExtensionManifestError(`\u5B57\u6BB5 "${field}" \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32`);
  }
  return value;
}
function validateField(name, raw) {
  if (!raw || typeof raw !== "object") {
    throw new ExtensionManifestError(
      `propsSchema."${name}" \u5FC5\u987B\u662F\u5BF9\u8C61`
    );
  }
  const r = raw;
  const type = r.type;
  if (!type || !VALID_FIELD_TYPES.has(type)) {
    throw new ExtensionManifestError(
      `propsSchema."${name}".type \u5FC5\u987B\u662F string | number | boolean | enum`
    );
  }
  if (type === "enum") {
    if (!Array.isArray(r.options) || r.options.length === 0) {
      throw new ExtensionManifestError(
        `propsSchema."${name}".options \u5728 type=enum \u65F6\u5FC5\u987B\u662F\u975E\u7A7A\u6570\u7EC4`
      );
    }
  }
  const out = { type };
  if (r.default !== void 0) out.default = r.default;
  if (typeof r.description === "string") out.description = r.description;
  if (Array.isArray(r.options)) out.options = r.options.map(String);
  return out;
}
function validateDialogueBoxStyles(raw) {
  if (!Array.isArray(raw)) {
    throw new ExtensionManifestError(
      "contributes.dialogueBoxStyles \u5FC5\u987B\u662F\u6570\u7EC4"
    );
  }
  const styles = [];
  const seenIds = /* @__PURE__ */ new Set();
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    const field = `contributes.dialogueBoxStyles[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ExtensionManifestError(`${field} \u5FC5\u987B\u662F\u5BF9\u8C61`);
    }
    const value = item;
    const id = ensureString(value.id, `${field}.id`);
    if (seenIds.has(id)) {
      throw new ExtensionManifestError(
        `contributes.dialogueBoxStyles \u51FA\u73B0\u91CD\u590D id "${id}"`
      );
    }
    seenIds.add(id);
    const visualUI = ensureString(value.visualUI, `${field}.visualUI`);
    if (!VISUAL_UI_FILE_NAME_PATTERN.test(visualUI)) {
      throw new ExtensionManifestError(
        `${field}.visualUI "${visualUI}" \u4E0D\u662F\u5B89\u5168\u7684 Visual UI \u6587\u4EF6\u540D`
      );
    }
    const style = {
      id,
      name: ensureString(value.name, `${field}.name`),
      visualUI
    };
    if (value.description !== void 0) {
      if (typeof value.description !== "string") {
        throw new ExtensionManifestError(`${field}.description \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
      }
      style.description = value.description;
    }
    if (value.dialogueBox !== void 0) {
      if (!value.dialogueBox || typeof value.dialogueBox !== "object" || Array.isArray(value.dialogueBox)) {
        throw new ExtensionManifestError(`${field}.dialogueBox \u5FC5\u987B\u662F\u5BF9\u8C61`);
      }
      style.dialogueBox = {
        ...value.dialogueBox
      };
    }
    styles.push(style);
  }
  return styles;
}
function validateParagraphStyles(raw) {
  if (!Array.isArray(raw)) {
    throw new ExtensionManifestError(
      "contributes.paragraphStyles \u5FC5\u987B\u662F\u6570\u7EC4"
    );
  }
  const styles = [];
  const seenIds = /* @__PURE__ */ new Set();
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    const field = `contributes.paragraphStyles[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ExtensionManifestError(`${field} \u5FC5\u987B\u662F\u5BF9\u8C61`);
    }
    const value = item;
    const id = ensureString(value.id, `${field}.id`);
    if (seenIds.has(id)) {
      throw new ExtensionManifestError(
        `contributes.paragraphStyles \u51FA\u73B0\u91CD\u590D id "${id}"`
      );
    }
    seenIds.add(id);
    const visualUI = ensureString(value.visualUI, `${field}.visualUI`);
    if (!VISUAL_UI_FILE_NAME_PATTERN.test(visualUI)) {
      throw new ExtensionManifestError(
        `${field}.visualUI "${visualUI}" \u4E0D\u662F\u5B89\u5168\u7684 Visual UI \u6587\u4EF6\u540D`
      );
    }
    const style = {
      id,
      name: ensureString(value.name, `${field}.name`),
      visualUI
    };
    if (value.description !== void 0) {
      if (typeof value.description !== "string") {
        throw new ExtensionManifestError(`${field}.description \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
      }
      style.description = value.description;
    }
    styles.push(style);
  }
  return styles;
}
function validateInputActions(raw, extensionId) {
  if (!Array.isArray(raw)) {
    throw new ExtensionManifestError("contributes.inputActions \u5FC5\u987B\u662F\u6570\u7EC4");
  }
  const actions = [];
  const seenIds = /* @__PURE__ */ new Set();
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    const field = `contributes.inputActions[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ExtensionManifestError(`${field} \u5FC5\u987B\u662F\u5BF9\u8C61`);
    }
    const value = item;
    const id = ensureString(value.id, `${field}.id`);
    if (id.startsWith("internal.") || !id.startsWith(`${extensionId}.`)) {
      throw new ExtensionManifestError(
        `${field}.id \u5FC5\u987B\u4EE5\u6269\u5C55\u81EA\u8EAB\u547D\u540D\u7A7A\u95F4 "${extensionId}." \u5F00\u5934`
      );
    }
    if (seenIds.has(id)) {
      throw new ExtensionManifestError(
        `contributes.inputActions \u51FA\u73B0\u91CD\u590D id "${id}"`
      );
    }
    seenIds.add(id);
    if (!Array.isArray(value.defaultKeys)) {
      throw new ExtensionManifestError(`${field}.defaultKeys \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4`);
    }
    const defaultKeys = value.defaultKeys.map((key, keyIndex) => {
      if (typeof key !== "string" || key.length === 0) {
        throw new ExtensionManifestError(
          `${field}.defaultKeys[${keyIndex}] \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32`
        );
      }
      return key;
    });
    actions.push({
      id,
      label: ensureString(value.label, `${field}.label`),
      defaultKeys
    });
  }
  return actions;
}
function cloneJsonValue(value, field) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ExtensionManifestError(`${field} \u53EA\u80FD\u5305\u542B\u6709\u9650\u6570\u5B57`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => cloneJsonValue(item, `${field}[${index}]`));
  }
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === void 0) continue;
      next[key] = cloneJsonValue(item, `${field}.${key}`);
    }
    return next;
  }
  throw new ExtensionManifestError(`${field} \u5FC5\u987B\u662F JSON \u53EF\u5E8F\u5217\u5316\u6570\u636E`);
}
function validateSchemaProperty(raw, field, collectionRoot = false) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ExtensionManifestError(`${field} \u5FC5\u987B\u662F\u5BF9\u8C61`);
  }
  const value = raw;
  const schema = {};
  if (value.type !== void 0) {
    const types = Array.isArray(value.type) ? value.type : [value.type];
    if (types.length === 0 || !types.every(
      (type) => typeof type === "string" && VALID_SCHEMA_TYPES.has(type)
    )) {
      throw new ExtensionManifestError(`${field}.type \u5305\u542B\u4E0D\u652F\u6301\u7684\u6570\u636E\u7C7B\u578B`);
    }
    if (collectionRoot && (types.length !== 1 || types[0] !== "object")) {
      throw new ExtensionManifestError(`${field}.type \u5FC5\u987B\u662F object`);
    }
    schema.type = Array.isArray(value.type) ? types : types[0];
  }
  if (value.description !== void 0) {
    if (typeof value.description !== "string") {
      throw new ExtensionManifestError(`${field}.description \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
    }
    schema.description = value.description;
  }
  if (value.enum !== void 0) {
    if (!Array.isArray(value.enum)) {
      throw new ExtensionManifestError(`${field}.enum \u5FC5\u987B\u662F\u6570\u7EC4`);
    }
    schema.enum = value.enum.map((item, index) => {
      if (item !== null && typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") {
        throw new ExtensionManifestError(
          `${field}.enum[${index}] \u5FC5\u987B\u662F JSON \u57FA\u7840\u503C`
        );
      }
      if (typeof item === "number" && !Number.isFinite(item)) {
        throw new ExtensionManifestError(`${field}.enum[${index}] \u5FC5\u987B\u662F\u6709\u9650\u6570\u5B57`);
      }
      return item;
    });
  }
  if (value.items !== void 0) {
    schema.items = validateSchemaProperty(value.items, `${field}.items`);
  }
  if (value.properties !== void 0) {
    if (!value.properties || typeof value.properties !== "object" || Array.isArray(value.properties)) {
      throw new ExtensionManifestError(`${field}.properties \u5FC5\u987B\u662F\u5BF9\u8C61`);
    }
    schema.properties = Object.fromEntries(
      Object.entries(value.properties).map(([key, property]) => [
        key,
        validateSchemaProperty(property, `${field}.properties.${key}`)
      ])
    );
  }
  if (value.required !== void 0) {
    if (!Array.isArray(value.required) || !value.required.every((item) => typeof item === "string" && item.trim())) {
      throw new ExtensionManifestError(`${field}.required \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u6570\u7EC4`);
    }
    schema.required = [...new Set(value.required)];
  }
  if (value.additionalProperties !== void 0) {
    if (typeof value.additionalProperties !== "boolean") {
      throw new ExtensionManifestError(
        `${field}.additionalProperties \u5FC5\u987B\u662F\u5E03\u5C14\u503C`
      );
    }
    schema.additionalProperties = value.additionalProperties;
  }
  const collectionSchema = schema;
  if (collectionRoot && value.columns !== void 0) {
    collectionSchema.columns = validateDatabaseColumns(
      value.columns,
      `${field}.columns`
    );
  }
  if (collectionRoot && value.titleColumn !== void 0) {
    collectionSchema.titleColumn = ensureString(
      value.titleColumn,
      `${field}.titleColumn`
    );
  }
  if (collectionRoot && value.imageColumn !== void 0) {
    collectionSchema.imageColumn = ensureString(
      value.imageColumn,
      `${field}.imageColumn`
    );
  }
  if (collectionRoot && collectionSchema.columns) {
    const columns = new Map(
      collectionSchema.columns.map((column) => [column.key, column])
    );
    if (collectionSchema.titleColumn && !columns.has(collectionSchema.titleColumn)) {
      throw new ExtensionManifestError(`${field}.titleColumn \u5FC5\u987B\u6307\u5411\u5DF2\u6709\u5217`);
    }
    if (collectionSchema.imageColumn && columns.get(collectionSchema.imageColumn)?.type !== "image") {
      throw new ExtensionManifestError(`${field}.imageColumn \u5FC5\u987B\u6307\u5411\u56FE\u7247\u5217`);
    }
  }
  return schema;
}
function validateDatabaseColumns(raw, field) {
  if (!Array.isArray(raw)) {
    throw new ExtensionManifestError(`${field} \u5FC5\u987B\u662F\u6570\u7EC4`);
  }
  const keys = /* @__PURE__ */ new Set();
  return raw.map((item, index) => {
    const itemField = `${field}[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ExtensionManifestError(`${itemField} \u5FC5\u987B\u662F\u5BF9\u8C61`);
    }
    const value = item;
    const key = ensureString(value.key, `${itemField}.key`);
    if (key === "id" || key === "_id") {
      throw new ExtensionManifestError(`${itemField}.key \u4E0D\u80FD\u4F7F\u7528\u7CFB\u7EDF\u5B57\u6BB5 id`);
    }
    if (keys.has(key)) {
      throw new ExtensionManifestError(`${field} \u51FA\u73B0\u91CD\u590D\u5217 ${key}`);
    }
    keys.add(key);
    const type = ensureString(value.type, `${itemField}.type`);
    if (!VALID_DATABASE_COLUMN_TYPES.has(type)) {
      throw new ExtensionManifestError(`${itemField}.type \u4E0D\u53D7\u652F\u6301`);
    }
    const column = {
      key,
      label: ensureString(value.label, `${itemField}.label`),
      type
    };
    if (value.description !== void 0) {
      column.description = ensureString(value.description, `${itemField}.description`);
    }
    if (value.default !== void 0) {
      column.default = cloneJsonValue(
        value.default,
        `${itemField}.default`
      );
    }
    if (value.options !== void 0) {
      if (!Array.isArray(value.options)) {
        throw new ExtensionManifestError(`${itemField}.options \u5FC5\u987B\u662F\u6570\u7EC4`);
      }
      column.options = value.options.map((option, optionIndex) => {
        const optionField = `${itemField}.options[${optionIndex}]`;
        if (!option || typeof option !== "object" || Array.isArray(option)) {
          throw new ExtensionManifestError(`${optionField} \u5FC5\u987B\u662F\u5BF9\u8C61`);
        }
        const optionValue = option;
        return {
          label: ensureString(optionValue.label, `${optionField}.label`),
          value: ensureString(optionValue.value, `${optionField}.value`)
        };
      });
    }
    if (value.accepts !== void 0) {
      if (type !== "asset") {
        throw new ExtensionManifestError(
          `${itemField}.accepts \u53EA\u9002\u7528\u4E8E\u8D44\u6E90\u5217`
        );
      }
      if (!Array.isArray(value.accepts) || value.accepts.length === 0 || !value.accepts.every(
        (kind) => typeof kind === "string" && VALID_DATABASE_ASSET_KINDS.has(kind)
      )) {
        throw new ExtensionManifestError(
          `${itemField}.accepts \u5FC5\u987B\u662F image | audio | video | any \u7684\u975E\u7A7A\u6570\u7EC4`
        );
      }
      const accepts = [...new Set(value.accepts)];
      column.accepts = accepts.includes("any") ? ["any"] : accepts;
    }
    if (type === "select" && (!column.options || column.options.length === 0)) {
      throw new ExtensionManifestError(`${itemField}.options \u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u9009\u9879`);
    }
    return column;
  });
}
function validateCollectionTemplate(raw, field) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ExtensionManifestError(`${field} \u5FC5\u987B\u662F\u5BF9\u8C61\u6216 false`);
  }
  const value = raw;
  const contractVersion = ensureString(
    value.contractVersion,
    `${field}.contractVersion`
  );
  if (!EXACT_VERSION_PATTERN.test(contractVersion)) {
    throw new ExtensionManifestError(
      `${field}.contractVersion \u5FC5\u987B\u662F\u5B8C\u6574\u7684\u4E09\u6BB5\u7248\u672C\u53F7`
    );
  }
  const template = { contractVersion };
  if (value.name !== void 0) {
    template.name = ensureString(value.name, `${field}.name`);
  }
  if (value.runtimePolicy !== void 0) {
    if (typeof value.runtimePolicy !== "string" || !VALID_RUNTIME_POLICIES.has(value.runtimePolicy)) {
      throw new ExtensionManifestError(
        `${field}.runtimePolicy \u5FC5\u987B\u662F readonly | session | archive | profile`
      );
    }
    template.runtimePolicy = value.runtimePolicy;
  }
  if (value.schema !== void 0) {
    template.schema = validateSchemaProperty(
      value.schema,
      `${field}.schema`,
      true
    );
  }
  if (value.documents !== void 0) {
    if (!Array.isArray(value.documents)) {
      throw new ExtensionManifestError(`${field}.documents \u5FC5\u987B\u662F\u6570\u7EC4`);
    }
    template.documents = value.documents.map((document, index) => {
      const documentField = `${field}.documents[${index}]`;
      const cloned = cloneJsonValue(document, documentField);
      if (!cloned || typeof cloned !== "object" || Array.isArray(cloned)) {
        throw new ExtensionManifestError(`${documentField} \u5FC5\u987B\u662F\u6587\u6863\u5BF9\u8C61`);
      }
      return cloned;
    });
  }
  return template;
}
function validateDataDependencies(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ExtensionManifestError("dataDependencies \u5FC5\u987B\u662F\u5BF9\u8C61");
  }
  const dependencies = {};
  for (const [alias, item] of Object.entries(raw)) {
    const field = `dataDependencies.${alias}`;
    if (!DATA_DEPENDENCY_ALIAS_PATTERN.test(alias)) {
      throw new ExtensionManifestError(
        `${field} \u7684\u522B\u540D\u5FC5\u987B\u4EE5\u5B57\u6BCD\u5F00\u5934\uFF0C\u4E14\u53EA\u5305\u542B\u5B57\u6BCD\u3001\u6570\u5B57\u3001-\u3001_`
      );
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ExtensionManifestError(`${field} \u5FC5\u987B\u662F\u5BF9\u8C61`);
    }
    const value = item;
    const contract = ensureString(value.contract, `${field}.contract`);
    if (!DATA_CONTRACT_ID_PATTERN.test(contract)) {
      throw new ExtensionManifestError(
        `${field}.contract \u5FC5\u987B\u662F\u5C0F\u5199\u7684\u7A33\u5B9A\u547D\u540D\u7A7A\u95F4 id`
      );
    }
    const version = ensureString(value.version, `${field}.version`);
    if (!VERSION_RANGE_PATTERN.test(version)) {
      throw new ExtensionManifestError(`${field}.version \u5FC5\u987B\u5305\u542B\u53EF\u89E3\u6790\u7684\u7248\u672C\u53F7`);
    }
    const dependency = { contract, version };
    if (value.name !== void 0) {
      dependency.name = ensureString(value.name, `${field}.name`);
    }
    if (value.description !== void 0) {
      if (typeof value.description !== "string") {
        throw new ExtensionManifestError(`${field}.description \u5FC5\u987B\u662F\u5B57\u7B26\u4E32`);
      }
      dependency.description = value.description;
    }
    if (value.access !== void 0) {
      if (typeof value.access !== "string" || !VALID_DATA_ACCESS.has(value.access)) {
        throw new ExtensionManifestError(
          `${field}.access \u5FC5\u987B\u662F read | runtime-write`
        );
      }
      dependency.access = value.access;
    }
    if (value.optional !== void 0) {
      if (typeof value.optional !== "boolean") {
        throw new ExtensionManifestError(`${field}.optional \u5FC5\u987B\u662F\u5E03\u5C14\u503C`);
      }
      dependency.optional = value.optional;
    }
    if (value.autoCreate !== void 0) {
      dependency.autoCreate = value.autoCreate === false ? false : validateCollectionTemplate(value.autoCreate, `${field}.autoCreate`);
      if (dependency.autoCreate !== false && !isDatabaseContractVersionCompatible(
        dependency.version,
        dependency.autoCreate.contractVersion
      )) {
        throw new ExtensionManifestError(
          `${field}.autoCreate.contractVersion \u4E0D\u6EE1\u8DB3\u4F9D\u8D56\u7248\u672C ${dependency.version}`
        );
      }
    }
    dependencies[alias] = dependency;
  }
  return dependencies;
}
function validateExtensionManifest(raw) {
  if (!raw || typeof raw !== "object") {
    throw new ExtensionManifestError("manifest \u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  }
  const r = raw;
  const id = ensureString(r.id, "id");
  if (!EXTENSION_ID_PATTERN.test(id)) {
    throw new ExtensionManifestError(
      `id "${id}" \u4E0D\u5408\u6CD5:\u4E0D\u80FD\u5305\u542B\u7A7A\u683C / \\ : * ? " < > | \u7B49\u8DEF\u5F84\u7279\u6B8A\u5B57\u7B26,\u957F\u5EA6 2-128`
    );
  }
  const declaredEntry = typeof r.entry === "string" && r.entry.length > 0;
  const manifest = {
    id,
    name: ensureString(r.name, "name"),
    // author 可以为空(新建扩展时 UI 没强制填)
    author: typeof r.author === "string" ? r.author : "",
    version: ensureString(r.version, "version"),
    entry: declaredEntry ? r.entry : EXTENSION_ENTRY_DEFAULT,
    // 声明了 entry = 带程序;没声明 = 纯资源扩展。老 manifest 都声明了 entry。
    hasProgram: declaredEntry,
    sdkVersion: ensureString(r.sdkVersion, "sdkVersion")
  };
  if (typeof r.description === "string") manifest.description = r.description;
  if (typeof r.icon === "string") manifest.icon = r.icon;
  if (r.dataDependencies !== void 0) {
    manifest.dataDependencies = validateDataDependencies(r.dataDependencies);
  }
  if (r.contributes !== void 0) {
    if (!r.contributes || typeof r.contributes !== "object" || Array.isArray(r.contributes)) {
      throw new ExtensionManifestError("contributes \u5FC5\u987B\u662F\u5BF9\u8C61");
    }
    const rawContributions = r.contributes;
    const contributes = {};
    if (rawContributions.dialogueBoxStyles !== void 0) {
      contributes.dialogueBoxStyles = validateDialogueBoxStyles(
        rawContributions.dialogueBoxStyles
      );
    }
    if (rawContributions.paragraphStyles !== void 0) {
      contributes.paragraphStyles = validateParagraphStyles(
        rawContributions.paragraphStyles
      );
    }
    if (rawContributions.inputActions !== void 0) {
      contributes.inputActions = validateInputActions(
        rawContributions.inputActions,
        id
      );
    }
    manifest.contributes = contributes;
  }
  if (r.propsSchema !== void 0) {
    if (typeof r.propsSchema !== "object" || r.propsSchema === null) {
      throw new ExtensionManifestError("propsSchema \u5FC5\u987B\u662F\u5BF9\u8C61");
    }
    const out = {};
    for (const [key, val] of Object.entries(r.propsSchema)) {
      out[key] = validateField(key, val);
    }
    manifest.propsSchema = out;
  }
  if (r.overrides !== void 0) {
    if (!Array.isArray(r.overrides)) {
      throw new ExtensionManifestError("overrides \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4");
    }
    const overrides = [];
    const seen = /* @__PURE__ */ new Set();
    for (const o of r.overrides) {
      if (typeof o !== "string" || !VALID_BUILTIN_COMPONENT_IDS.has(o)) {
        throw new ExtensionManifestError(
          `overrides \u9879 "${String(o)}" \u4E0D\u662F\u5DF2\u77E5\u7684\u5185\u7F6E\u7EC4\u4EF6 ID(\u5141\u8BB8:DialogueBox / Choice / InputBox)`
        );
      }
      if (seen.has(o)) {
        throw new ExtensionManifestError(
          `overrides \u51FA\u73B0\u91CD\u590D\u9879 "${o}"`
        );
      }
      seen.add(o);
      overrides.push(o);
    }
    manifest.overrides = overrides;
  }
  if (r.builtin !== void 0) {
    if (typeof r.builtin !== "boolean") {
      throw new ExtensionManifestError("builtin \u5FC5\u987B\u662F\u5E03\u5C14\u503C");
    }
    if (r.builtin === true && !BUILTIN_ID_ALLOWED_PREFIXES.some((prefix) => id.startsWith(prefix))) {
      throw new ExtensionManifestError(
        `\u6269\u5C55 "${id}" \u58F0\u660E builtin: true,\u4F46 id \u4E0D\u5728\u767D\u540D\u5355\u524D\u7F00(` + BUILTIN_ID_ALLOWED_PREFIXES.join(", ") + `)\u5185\u3002builtin \u4EC5\u4F9B avg.internal.* \u6269\u5C55\u4F7F\u7528\u3002`
      );
    }
    manifest.builtin = r.builtin;
  }
  if (r.permissions !== void 0) {
    if (!Array.isArray(r.permissions)) {
      throw new ExtensionManifestError("permissions \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4");
    }
    const perms = [];
    for (const p of r.permissions) {
      if (typeof p !== "string") {
        throw new ExtensionManifestError(`permissions \u9879 "${String(p)}" \u4E0D\u662F\u5B57\u7B26\u4E32`);
      }
      perms.push(p);
    }
    manifest.permissions = perms;
  }
  if (r.network !== void 0) {
    if (typeof r.network !== "object" || r.network === null) {
      throw new ExtensionManifestError("network \u5FC5\u987B\u662F\u5BF9\u8C61");
    }
    const net = r.network;
    const decl = {};
    if (net.domains !== void 0) {
      if (!Array.isArray(net.domains) || net.domains.some((d) => typeof d !== "string")) {
        throw new ExtensionManifestError("network.domains \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4");
      }
      decl.domains = net.domains;
    }
    manifest.network = decl;
  }
  if (r.riskTier !== void 0) {
    if (typeof r.riskTier !== "string" || !VALID_RISK_TIERS.has(r.riskTier)) {
      throw new ExtensionManifestError(
        `riskTier "${String(r.riskTier)}" \u975E\u6CD5(\u5141\u8BB8:safe / standard / privileged)`
      );
    }
    manifest.riskTier = r.riskTier;
  }
  if (r.minHostVersion !== void 0) {
    if (typeof r.minHostVersion !== "string") {
      throw new ExtensionManifestError("minHostVersion \u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
    }
    manifest.minHostVersion = r.minHostVersion;
  }
  return manifest;
}
export {
  ExtensionManifestError,
  validateExtensionManifest
};
