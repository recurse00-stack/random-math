import { useContext } from "react";
import {
  ExtensionContextReactContext,
  type ExtensionContext,
} from "../sdk-context";

export function useExtensionContext(): ExtensionContext {
  const ctx = useContext(ExtensionContextReactContext);
  if (!ctx) {
    throw new Error(
      "[@sdk] ExtensionContext 未注入 — 请确认 UI 扩展被 ExtensionContextProvider 包裹",
    );
  }
  return ctx;
}

export const useSDKContext = useExtensionContext;
