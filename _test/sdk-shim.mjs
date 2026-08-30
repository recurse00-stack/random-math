// SDK shim：仅用于测试打包（不参与真实运行）
export class Extension {
  constructor(data) { this.data = data; }
}
export const extension = (_meta) => (_cls) => _cls;
export const method = (def) => ({ __avgMethod: true, ...def });
