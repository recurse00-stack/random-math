---
name: letsgal-plugin-random-math
description: 在 Beta LetsGal Studio 中使用抽选与数学增强 3.0.0，通过可用的官方接口或原流程配置抽取池、变量、玩家选项和计算。
metadata:
  plugin_id: mixing-entropy.random-math
  plugin_version: "3.0.0"
  docs_revision: "mcp.1"
  channel: beta
---

# 抽选与数学增强 · Beta

先核目标工程实际插件版本与 Studio 完整版本，按[Beta 资料](references/compatibility/beta.md)选择用法；本机 Beta 不代表其他工程。未知只暂停依赖版本的部分，不升级宿主。

官方 MCP 可用、目标和权限匹配时优先按[插件 MCP 工作流](references/mcp-workflow.md)操作。旧 Beta 未提供 MCP，或当前未启用／未配置时，简短说明“当前未启用 MCP，按原有方式继续。”即可，保留 Beta 资料通道。同一上下文不反复探测、催促启用或展开安装教程。主动要求接入时才处理配置；服务权限待批准、只读、拒绝或工具组关闭不能当作未启用来绕过。

有 letsgal-authoring 主 Skill 时沿用其工程工作法；知识安装到实际用户区 `.letsgal-authoring/plugins/mixing-entropy.random-math/3.0.0/`。没有主 Skill 也可独立使用：先读目标规则、相关原文和恢复依据，获准的 MCP／原生界面处理活动工程；保存并关闭目标工程后才离线编辑。没有合适工具先完成草稿，不默认大量 Computer Use、不恢复退役工具，不写公共主 Skill 包。

按需读[AI 指南](references/AI-GUIDE.md)：六入口与目录、概率／份数／凭证／SL、Choice、输入输出、具体参数和迁移。MCP 中以 ext_read 返回的真实 globalType 和参数 schema 为准；离线用目标版本的真实样本。保留变量绑定、块 ID、未知字段和非目标内容。高级反馈收起不清空绑定。骰子支持 1～N；权重可用 var("变量名")，每次动作读取；计算扩展不自动扩展池表达式语法。

不放回减少份数，同文字不同 ID 不合并；candidate 与 unit 计权不同；percent 基础合计 100，筛选后归一化。作者配置不覆盖已初始化运行池；检查不建池、不推进随机。条件仅布尔变量，复杂规则由外部计算。3.0.0 不包含世界状态托管能力；新动作不放 If。先声明输出，检查 status 后再使用结果；失败时旧结果可能保留。

固定随机只保障已建立记录／池后的相应进度，不保证读回首次记录之前仍固定。取消占用不倒退随机。[迁移](references/MIGRATION-3.0.md)先离线预览、备份并核原文；不明的 If、动态参数保留兼容调用，不直接改真实存档。选项布局按[Choice 说明](references/CHOICE-UI-COMPATIBILITY.md)保留工程绑定。

写后读回；仅按改动影响验证相关路线。工具成功不证明播放、读档或导出成功。历史宿主范围见[验证记录](references/VALIDATION-3.0.md)，2.6 工具能力和插件实机兼容分别记录。人类安装步骤见[安装说明](references/AI-INTEGRATION.md)。
