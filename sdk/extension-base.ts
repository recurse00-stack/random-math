import type React from "react";
import type { ExtensionContext } from "./sdk-context";
import type {
  SaveAPI,
  SaveSchema,
  InferSaveMap,
  EmptySaveAPI,
} from "./save-schema";

/**
 * 占位的 save proxy,在 __attachHost 之前访问会抛错。
 * 运行时由 host 在挂载前调用 attachSaveProxy 替换为真实实现。
 */
function createUninitializedSaveProxy(): SaveAPI<any> {
  const err = () => {
    throw new Error(
      "扩展的 save 在挂载到宿主前不可用。" +
        "确保扩展已经通过宿主注册,且在 onShow/onInit 之后再访问 this.save。",
    );
  };
  return {
    get: err,
    set: err,
    useValue: err,
  };
}

export interface ExtensionProps {
  readonly id?: string;
}

export interface ExtensionRenderData<P extends ExtensionProps> {
  component: React.FC<P>;
  props: P;
}

/**
 * Extension(统一模块基类)的实例管线基座。
 *
 * 持有宿主挂载契约(__attachHost / __attachSaveProxy)、强类型 save 代理、
 * data / context / id / close 访问器和可选生命周期钩子。
 *
 * 扩展作者不直接继承这个类 —— 继承 Extension(见 extension-module.ts)。
 */
export abstract class ExtensionBase<
  P extends ExtensionProps = ExtensionProps,
> {
  protected data?: P;
  private host?: {
    id: string;
    context: ExtensionContext;
    close: () => void | Promise<void>;
  };

  /**
   * 强类型的存档字段访问 proxy。
   *
   * 类型从子类的 `static saveSchema` 推导:子类声明
   * `static saveSchema = defineSave({ lastPage: {...} })`,
   * `this.save` 自动变成 `SaveAPI<{ lastPage: number }>`,
   * IDE 自动补全 key、值类型校验、错的 key 编译期报错。
   *
   * 未声明 saveSchema 的扩展,这里是 EmptySaveAPI(任何 get/set 都编译报错)。
   *
   * 运行时由宿主在实例化时通过 __attachSaveProxy 注入。在挂载之前
   * 访问 this.save 会抛错。
   */
  readonly save: this extends { constructor: { saveSchema: infer S } }
    ? S extends SaveSchema
      ? SaveAPI<InferSaveMap<S>>
      : EmptySaveAPI
    : EmptySaveAPI = createUninitializedSaveProxy() as never;

  constructor(data?: P) {
    this.data = data;
  }

  get id(): string {
    return this.getHostOrThrow().id;
  }

  protected get context(): ExtensionContext {
    return this.getHostOrThrow().context;
  }

  close(): void {
    void this.getHostOrThrow().close();
  }

  __attachHost(host: {
    id: string;
    context: ExtensionContext;
    close: () => void | Promise<void>;
  }): void {
    this.host = host;
  }

  /**
   * 内部 API:宿主挂载时把真实的 save proxy 注入到实例。
   * 把 readonly 字段强制覆写;调用方负责确保 schema 与 proxy 形状一致。
   */
  __attachSaveProxy(proxy: SaveAPI<any>): void {
    (this as { save: SaveAPI<any> }).save = proxy;
  }

  private getHostOrThrow(): {
    id: string;
    context: ExtensionContext;
    close: () => void | Promise<void>;
  } {
    if (!this.host) {
      throw new Error("扩展尚未挂载到宿主，无法访问 id/context/close");
    }
    return this.host;
  }

  onInit?(): void;
  onShow?(): void;
  onClose?(): void;
}
