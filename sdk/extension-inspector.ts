/**
 * extension-inspector 类型桩。
 *
 * 官方 dist/sdk 未随附此文件（Studio 生成脚手架时补齐），此处仅提供类型声明
 * 满足 @avg-studio/sdk 入口导出解析；运行时实现由宿主提供。
 */
import type React from "react";

export interface ExtensionInspectorProps {
  [key: string]: unknown;
}

export declare const ExtensionInspector: React.FC<ExtensionInspectorProps>;
