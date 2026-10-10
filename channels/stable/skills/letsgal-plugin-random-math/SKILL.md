---
name: letsgal-plugin-random-math
description: 在正式版 LetsGal Studio 中使用抽选与数学增强 3.0.1，配置抽取池、变量、玩家选项和计算，处理旧工程迁移与随机状态。
metadata:
  plugin_id: mixing-entropy.random-math
  plugin_version: "3.0.1"
  docs_revision: "3.0.1"
  channel: stable
---

# 抽选与数学增强 · 正式版

先核目标工程实际插件版本与 Studio 完整版本，按[正式版资料](references/compatibility/stable.md)选择用法。当前已知正式版不提供 MCP 时直接使用原流程，不要求启用或安装 MCP。未知只暂停依赖版本的部分，不升级宿主。

有 letsgal-authoring 主 Skill 时沿用其工程工作法；本资料放在实际用户区的 `.letsgal-authoring/plugins/mixing-entropy.random-math/3.0.1/`，不写公共主 Skill 包。没有主 Skill 时本 Skill 可独立使用。先读目标工程规则、相关原文和恢复依据；活动工程使用获准的原生界面，工程保存并关闭后才离线编辑。缺操作能力先交付草稿；不恢复退役工具，不把没有 MCP 变成大量 Computer Use。授权、只读和拒绝边界不因换操作方式而消失。

按需读[AI 指南](references/AI-GUIDE.md)：六入口与目录、概率／份数／凭证／SL、Choice、输入输出、具体参数和迁移。先核实际 ID、变量类型及绑定，保留未知字段和非目标内容。高级执行反馈只影响显示，收起不清空旧绑定。骰子支持范围 1～N；权重可用 var("变量名")，每次动作读取。计算扩展不自动扩展池表达式的语法。

不放回减少份数，同文字不同 ID 不合并；candidate 与 unit 计权不同；percent 基础合计 100，筛选后归一化。作者配置不覆盖已初始化运行池；检查不建池、不推进随机。条件仅布尔变量，复杂规则由外部计算。3.0.1 不包含世界状态托管能力；新动作不放 If。先声明输出，检查 status 后再使用结果；失败时旧结果可能保留。

固定随机只保障已建立记录／池后的相应进度，不保证读回首次记录之前仍固定。取消占用不倒退随机。[迁移](references/MIGRATION-3.0.md)先离线预览、备份并核原文，不能自动改真实作品或存档；不明的 If、动态参数保留兼容调用。选项布局按[Choice 说明](references/CHOICE-UI-COMPATIBILITY.md)保留工程绑定。

写后读回实际改动；播放、存读档和导出仅按影响验证，不能用文件检查替代。历史宿主范围见[验证记录](references/VALIDATION-3.0.md)，新增正式版运行兼容仍须另验。人类安装步骤见[安装说明](references/AI-INTEGRATION.md)。
