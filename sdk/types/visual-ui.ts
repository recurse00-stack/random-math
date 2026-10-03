/** 文字填充支持的类型。缺省或未知值按 solid 处理。 */
export type VisualUITextFillType =
  | "solid"
  | "linear-gradient"
  | "radial-gradient"
  | "image";

/** 渐变色标的位置使用 0..100 的百分比；缺省时均匀分布。 */
export interface VisualUITextGradientStop {
  color?: string;
  position?: number;
}

/** 径向渐变中心或纹理锚点，x/y 均使用 0..100 的百分比。 */
export interface VisualUITextFillPosition {
  x?: number;
  y?: number;
}

/** 图片纹理在整段文字间连续映射，或在每个字形内独立映射。 */
export type VisualUITextTextureScope = "text" | "glyph";

/**
 * 文字填充。`color` 仍应保留为素材失效或环境不支持时的可读兜底色。
 */
export interface VisualUITextFill {
  type?: VisualUITextFillType;
  /** 线性渐变角度，单位 deg。 */
  angle?: number;
  /** 线性 / 径向渐变共用的色标，最多消费前 16 个。 */
  stops?: VisualUITextGradientStop[];
  /** 径向渐变中心或图片纹理锚点。 */
  position?: VisualUITextFillPosition;
  /** 项目内图片素材 URI。 */
  asset?: string;
  /** 图片纹理缩放百分比，100 表示基准尺寸。 */
  scale?: number;
  /** 图片纹理透明度百分比；缺省为 100，0 时只显示 `color` 兜底色。 */
  opacity?: number;
  /** 图片纹理映射范围；旧数据缺省时按整段连续处理。 */
  scope?: VisualUITextTextureScope;
  repeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
}

/** 共享文字描边；缺省或非正宽度表示不绘制。 */
export interface VisualUITextStroke {
  /** 描边宽度，单位 px。 */
  width?: number;
  color?: string;
  /** `outer` 表示不侵占字面面积的外描边。 */
  mode?: "outer";
}

/** 共享文字阴影；数组顺序即 CSS text-shadow 的绘制顺序。 */
export interface VisualUITextShadow {
  offsetX?: number;
  offsetY?: number;
  blur?: number;
  color?: string;
}

/** 可复用于普通元素和对话正文 / 名字的高级文字外观。 */
export interface VisualUITextAppearance {
  /** 纯色以及高级填充失败时的兜底色。 */
  color?: string;
  textFill?: VisualUITextFill;
  textStroke?: VisualUITextStroke;
  /** 空数组明确关闭文字阴影。 */
  textShadows?: VisualUITextShadow[];
}

/**
 * 可视化 UI 元素样式。字段与 Studio 的样式面板一致，全部可选。
 */
export interface VisualUIStyle extends VisualUITextAppearance {
  /** 透明度 0..100。 */
  opacity?: number;
  /** 圆角，单位 px。 */
  radius?: number;
  /** 元素整体绕中心旋转的角度，单位 deg。 */
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;

  fontSize?: number;
  letterSpacing?: number;
  fontWeight?: number;
  /** 完整 CSS font-family 字符串，可包含 fallback 链。 */
  fontFamily?: string;
  /** @deprecated 使用 fontFamily。 */
  serif?: boolean;
  italic?: boolean;
  underline?: boolean;
  textAlign?: "left" | "center" | "right";

  /** rect 底板或 button 底色。 */
  fill?: string;
  /** 背景模糊半径，单位 px。 */
  backdropBlur?: number;
  borderColor?: string;
  borderWidth?: number;

  /** 元素内容层的进阶 CSS；运行时会按元素 id 隔离。 */
  customCss?: string;
}

/**
 * `setStyle()` 的增量参数。已知字段提供补全和类型检查，同时保留旧扩展
 * 使用尚未被当前 SDK 声明的前向字段的兼容性。
 */
export type VisualUIStylePatch = Partial<VisualUIStyle> &
  Record<string, unknown>;
