/**
 * string 参数的编辑期候选值声明。
 *
 * Studio 会把「同一扩展内声明了相同 key 的所有参数」在当前项目剧本里
 * 已填过的值汇成一个候选池，渲染成可输入 + 可下拉选择的控件 —— 作者
 * 第一次在某处填过"小美"，其它指令的同类参数就能直接下拉选到，不用
 * 手敲、也不会敲错。声明处即收集处：写这个 key 的地方既是数据源也是
 * 下拉消费者。
 *
 * 运行时行为不受影响：值仍是普通字符串，扩展照常收到作者填的文本。
 */
export interface BlockFieldSuggestions {
  /** 候选池分组名（扩展内唯一即可，如 "contact"、"track"）。 */
  key: string;
  /**
   * 额外把角色库的所有角色名并入候选。适合"这个参数通常就是某个角色"
   * 的场景（手机联系人、称呼等）：项目里还没有任何历史值时，下拉里
   * 直接就有全部角色可选。
   */
  includeCharacterNames?: boolean;
}

export interface BlockFieldVisibility {
  /**
   * 仅在另一个参数等于指定字面量时显示该字段。控制参数绑定变量时，
   * Studio 会保留字段可见，避免创作者无法编辑运行时可能启用的配置。
   */
  visibleWhen?: {
    field: string;
    equals: string | number | boolean;
  };
}

export type BlockSchemaField = BlockFieldVisibility & (
  | {
      type: "string";
      label?: string;
      default?: string;
      multiline?: boolean;
      required?: boolean;
      /** 编辑期候选值下拉（见 BlockFieldSuggestions）。多行文本不建议声明。 */
      suggestions?: BlockFieldSuggestions;
    }
  | {
      type: "number";
      label?: string;
      default?: number;
      min?: number;
      max?: number;
      step?: number;
      /** 数值输入旁显示的单位，例如 `%`、`px` 或 `秒`。 */
      unit?: string;
      /** Slider 仍以 max 为上限，但允许输入框填写更大的自定义值。 */
      allowOverflowInput?: boolean;
      /** 修改字面量时，把同一个数值同步写入这些同级参数。 */
      mirrorFields?: string[];
      required?: boolean;
    }
  | {
      type: "boolean";
      label?: string;
      default?: boolean;
      required?: boolean;
    }
  | {
      type: "enum";
      label?: string;
      default?: string;
      options: Array<{ label: string; value: string }>;
      required?: boolean;
    }
  | {
      /**
       * 游戏画面内的二维位置。Studio 在扩展方法检查器中渲染可点击、可拖拽
       * 的 16:9 位置选择器，值以 `(x%,y%)` 字符串传给扩展。
       */
      type: "position";
      label?: string;
      default?: string;
      required?: boolean;
      /** 位置选择器中的对象预览语义；默认只显示定位点。 */
      previewKind?: "content" | "image" | "point";
      /**
       * 可选：关联同 schema 的 enum 字段，用 PositionAnchorPicker 自带的九宫格
       * 入口编辑锚点。关联字段仍会作为普通参数传给扩展，但不重复渲染下拉框。
       */
      anchorField?: string;
    }
  | {
      type: "asset";
      label?: string;
      assetType?: "image" | "audio" | "video" | "any";
      required?: boolean;
    }
  | { type: "character"; label?: string; required?: boolean }
  | {
      type: "characterPortrait";
      label?: string;
      /**
       * 可选：关联同 schema 的 character 字段。Studio 会按该字段当前选择
       * 的角色筛选立绘；未关联时列出工程内所有去重后的立绘 id。
       */
      characterField?: string;
      required?: boolean;
    }
  | { type: "scene"; label?: string; required?: boolean }
  | {
      type: "fragment";
      label?: string;
      required?: boolean;
      /**
       * 可选：选择片段时，把其所属章节 id 同步写入指定的辅助参数。
       * 片段值本身仍只保存稳定的 fragment id。辅助参数不必在 schema 中另行
       * 声明；省略它即可让检查器只显示片段选择器，不暴露原始章节 ID 输入框。
       */
      chapterField?: string;
    }
  | {
      type: "variable";
      label?: string;
      required?: boolean;
      /**
       * 可选：选择变量时，把面向创作者的显示名同步写入同 schema 的另一个
       * string 字段。扩展运行时既能拿稳定 key，也能拿“好感度”这类友好名称。
       */
      displayNameField?: string;
    }
  | { type: "uiExtension"; label?: string; required?: boolean }
);

export type BlockSchema = Record<string, BlockSchemaField>;

export type BlockParams = Record<string, unknown>;
