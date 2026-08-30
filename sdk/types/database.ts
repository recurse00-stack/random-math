/**
 * Studio 项目数据库的公开契约。
 *
 * 数据模型是文档型 NoSQL：项目包含 collection，collection 包含带稳定
 * `id` 的 JSON document。SDK 只暴露异步文档 API，不承诺底层使用 JSON、
 * IndexedDB 或其它存储实现。
 */

export type DatabaseJsonPrimitive = string | number | boolean | null;

export type DatabaseJsonValue =
  | DatabaseJsonPrimitive
  | DatabaseJsonValue[]
  | { [key: string]: DatabaseJsonValue };

export interface DatabaseDocument {
  /** Studio 自动生成的唯一标识；作者与扩展都不能修改。 */
  readonly id: string;
  [key: string]: DatabaseJsonValue;
}

/** 新增记录时的输入；id 始终由宿主补齐。 */
export type DatabaseDocumentInput = Record<string, DatabaseJsonValue>;

export type DatabaseRuntimePolicy =
  | "readonly"
  | "session"
  | "archive"
  | "profile";

export type DatabaseDependencyAccess = "read" | "runtime-write";

export type DatabaseSchemaValueType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "array"
  | "object";

export interface DatabaseSchemaProperty {
  type?: DatabaseSchemaValueType | DatabaseSchemaValueType[];
  description?: string;
  enum?: DatabaseJsonPrimitive[];
  /** 数组元素的宽松结构声明。 */
  items?: DatabaseSchemaProperty;
  /** 对象子字段的宽松结构声明。 */
  properties?: Record<string, DatabaseSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Studio 表格里对作者展示的列类型。
 * 名称刻意使用作者能理解的上层概念，底层仍保存普通 JSON 值。
 */
export type DatabaseColumnType =
  | "text"
  | "long-text"
  | "number"
  | "boolean"
  | "select"
  | "image"
  | "asset"
  | "color"
  | "character"
  | "fragment";

/** 资源列允许用户选择的项目素材种类。 */
export type DatabaseAssetKind = "image" | "audio" | "video" | "any";

export interface DatabaseColumnOption {
  label: string;
  value: string;
}

export interface DatabaseColumnDefinition {
  /** 稳定的内部字段名；Studio 创建列时自动生成，界面不要求作者填写。 */
  key: string;
  /** 作者在表头和编辑表单里看到的名称。 */
  label: string;
  type: DatabaseColumnType;
  description?: string;
  default?: DatabaseJsonValue;
  options?: DatabaseColumnOption[];
  /** 仅资源列使用；不填等同于允许任意项目资源。 */
  accepts?: DatabaseAssetKind[];
}

/**
 * Collection 的可选数据契约。它采用 JSON Schema 的一个稳定子集；
 * additionalProperties 默认 true，允许其它扩展在自己的命名空间追加字段。
 */
export interface DatabaseCollectionSchema extends DatabaseSchemaProperty {
  type?: "object";
  properties?: Record<string, DatabaseSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  /** Studio 数据表的列顺序与易用编辑器声明。 */
  columns?: DatabaseColumnDefinition[];
  /** 作为每行主标题的列。 */
  titleColumn?: string;
  /** 与主标题并排显示缩略图的图片列。 */
  imageColumn?: string;
}

/** 扩展在缺少兼容 collection 时交给 Studio 使用的创建模板。 */
export interface ExtensionDatabaseCollectionTemplate {
  /** 创建出来的集合显示名。 */
  name?: string;
  /** 模板实际实现的精确契约版本。 */
  contractVersion: string;
  runtimePolicy?: DatabaseRuntimePolicy;
  schema?: DatabaseCollectionSchema;
  documents?: DatabaseDocumentInput[];
}

/** manifest.dataDependencies.<alias> 的单项声明。 */
export interface ExtensionDatabaseDependency {
  /** 社区稳定契约 id，例如 community.avg.item-catalog。 */
  contract: string;
  /** 可接受版本，例如 ^1.0.0、~1.2.0 或 1.0.0。 */
  version: string;
  /** Studio 给用户展示的用途名称。 */
  name?: string;
  description?: string;
  access?: DatabaseDependencyAccess;
  optional?: boolean;
  /**
   * 缺少兼容集合时的默认创建模板。
   * 缺失也允许 Studio 创建一个空集合；显式 false 才要求用户手工绑定。
   */
  autoCreate?: ExtensionDatabaseCollectionTemplate | false;
}

export interface DatabaseFieldOperators {
  $eq?: DatabaseJsonValue;
  $ne?: DatabaseJsonValue;
  $gt?: DatabaseJsonPrimitive;
  $gte?: DatabaseJsonPrimitive;
  $lt?: DatabaseJsonPrimitive;
  $lte?: DatabaseJsonPrimitive;
  $in?: DatabaseJsonValue[];
  $contains?: DatabaseJsonValue;
  $exists?: boolean;
}

export interface DatabaseFilter {
  $and?: DatabaseFilter[];
  $or?: DatabaseFilter[];
  [field: string]:
    | DatabaseJsonValue
    | DatabaseFieldOperators
    | DatabaseFilter[]
    | undefined;
}

export interface DatabaseFindOptions {
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
}

export interface DatabaseUpdate {
  $set?: Record<string, DatabaseJsonValue>;
  $unset?: string[];
  $inc?: Record<string, number>;
  $push?: Record<string, DatabaseJsonValue>;
  $pull?: Record<string, DatabaseJsonValue>;
}

export interface DatabaseWriteResult {
  matchedCount: number;
  modifiedCount: number;
}

export interface DatabaseCollectionAPI<
  TDocument extends DatabaseDocument = DatabaseDocument,
> {
  getById(id: string): Promise<TDocument | null>;
  find(
    filter?: DatabaseFilter,
    options?: DatabaseFindOptions,
  ): Promise<TDocument[]>;
  insertOne(document: Omit<TDocument, "id">): Promise<TDocument>;
  updateOne(
    filter: DatabaseFilter,
    update: DatabaseUpdate,
  ): Promise<DatabaseWriteResult>;
  deleteOne(filter: DatabaseFilter): Promise<DatabaseWriteResult>;
  /** Collection 有效文档发生变化时触发；返回退订函数。 */
  watch(listener: () => void): () => void;
}

/**
 * 已绑定到当前扩展身份的数据库入口。
 * collection 接收 manifest 中的 dependency alias，而不是项目内真实集合 id。
 * 集合始终由宿主准备并保持可访问，不存在连接或打开生命周期。
 */
export interface DatabaseAPI {
  collection<TDocument extends DatabaseDocument = DatabaseDocument>(
    alias: string,
  ): DatabaseCollectionAPI<TDocument>;
}
