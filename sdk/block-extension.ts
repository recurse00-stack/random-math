import type { ExtensionContext } from "./sdk-context";
import type { BlockParams, BlockSchema } from "./types/block-schema";

export abstract class BlockExtension<
  P extends BlockParams = BlockParams,
> {
  static readonly extensionKind = "block";

  static readonly type: string;
  static readonly title: string;
  static readonly description?: string;
  static readonly category?: string;
  static readonly schema?: BlockSchema;

  abstract run(
    ctx: ExtensionContext,
    params: P,
  ): Promise<void> | void;

  runImmediately?(
    ctx: ExtensionContext,
    params: P,
  ): Promise<void> | void;

  skip?(
    ctx: ExtensionContext,
    params: P,
  ): Promise<void> | void;
}

export type BlockExtensionConstructor<
  P extends BlockParams = BlockParams,
> = {
  new (): BlockExtension<P>;
  readonly extensionKind: "block";
  readonly type: string;
  readonly title: string;
  readonly description?: string;
  readonly category?: string;
  readonly schema?: BlockSchema;
};
