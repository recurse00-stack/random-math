// Structural test shim only; not a browser/React acceptance test.
export const jsx=(type,props,key)=>({type,props,key});
export const jsxs=jsx;
export const useState=value=>[value,()=>{}];
export default {createElement:jsx};
export const Fragment=Symbol.for("test.react.fragment");
