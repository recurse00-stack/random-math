# 本插件的 MCP 用法

只在需要操作工程时读取本页。有通用 letsgal-authoring 时复用其连接、项目保护和内容保真规则；否则先 status，核目标、完整版本、权限和用户输入状态，再读官方 instructions / quickstart。相关指导本上下文已读且未变可复用；换工程、重连或异常时刷新。按实际工具 schema 工作，不安装客户端服务、不自动开工具组或改权限。

## 选择路径

- 未启用／未配置／不支持：一句“当前未启用 MCP，按原有方式继续。”后采用获准界面或合法离线流程，保留 Beta 资料，不循环检查。没有界面工具则先草稿；离线写入前确认已保存并关闭目标工程，或有官方有效外部编辑会话返回的范围。
- 待批准、只读、拒绝、工具组关闭：不是能力缺口。只做获准读取、草稿或独立源码资料；需要工程权限时说明具体缺项，不用文件或界面绕过。
- 意外断线：必要时复核一次状态；提交结果未知先核结果，不重新抽取、重复追加或盲目重试写入。恢复状态不能由缺失进程列表推定。

## 读取和配置

ext_read 按目标扩展 mixing-entropy.random-math 读取实际启用版本、methods 或 settings。方法的 globalType、参数 schema、returns 和 selectable 决定真实调用方式，不能从插件 ID 猜方法路径。隐藏兼容方法仍可能被旧剧本使用，不自动转换。

settings 的 key、模块、isDefault 和 value 是改池目录、候选目录、批量调整目录的依据。valueTruncated 时按 key 读完整值；保留其他行、稳定 ID、未知字段。ext_settings_set 使用刚读取的 expected，先 dryRun，提交后读回。REVISION_CONFLICT 时重新比较，不覆盖并发修改。配置保存不等于已开始游玩的池被重置；不直接修改运行池、抽取凭证或存档。

## 编排和核对

读取相关片段和变量后，用实际契约构建 callExtensionFunction；target 来自 globalType，paramsJson 的常量 / 变量使用实际支持的 lit / var 绑定。操作切换不能丢操作专属字段及原有输出。高级反馈只控制显示，收起后绑定仍有效。新动作不作为 If 条件。

精确编辑块使用刚读取的 revision 和支持的 dryRun / opId；脚本格式仅用于能保真表达的内容。保留原块 ID、富文本、未知字段和非目标内容，写后读回，再按受影响流程观察结果。必要时 ext_dev_read 读取目标扩展日志 / 构建状态；不为资料更新触发源码构建。

独立扩展源码、Skill、安装工具和发行材料仍使用文件与开发工具。迁移工具继续离线预览、备份、原文校验和恢复，不在运行过程中改工程。MCP 不改变抽取、固定随机、存档或 If 的语义；2.6 工具接入不能当作旧 If 缓存修复。

官方依据：[MCP](https://docs.avg-engine.com/manual/overview/mcp)、[扩展开发](https://docs.avg-engine.com/extensions/ai-development)。工具名称和字段以当前可用 schema 为准，只读任务需要的对象。
