/**
 * Studio 2.4.0-beta.2's distributed SDK re-exports ./extension-inspector,
 * but does not ship that declaration. Keep sdk/ byte-identical to Studio.
 *
 * This project does not consume either export. `never` deliberately prevents
 * using this fallback as an invented host API. There is no runtime code here.
 * A real SDK declaration takes precedence when the host supplies the file.
 */
declare module "*/extension-inspector" {
  export type ExtensionInspectorProps = never;
  export const ExtensionInspector: never;
}
