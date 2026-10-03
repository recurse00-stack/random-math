// Test-only SDK shape. Real Studio/player validation is performed separately.
export class Extension {}
export const extension=()=>cls=>cls;
export const method=definition=>definition;
export const settings=build=>({build});
export const defineSave=schema=>schema;

export const useExtensionContext=()=>{throw Error("UI context requires an explicit host fixture");};
