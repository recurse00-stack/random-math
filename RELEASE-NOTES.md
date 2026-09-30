# 随机与计算系统 2.2.3

本次根据 LetsGal Studio 2.3.0-beta.1 的 SDK 静态比较更新说明、插件 Skill、辅助安装与资料路由，保留原插件 ID `mixing-entropy.random-math`。新 SDK 保留本插件所用的方法、变量、数据表和存档接口，暂未发现必须修改运行代码的依据；新宿主实际运行仍须单独验收。

辅助安装先检测、预览，再由 `--apply` 明确执行。当前 Agent 有 [GitHub 版 letsgal-authoring 主 Skill](https://github.com/recurse00-stack/letsgal-authoring-kit/releases) 时，知识安装到实际用户区 `.letsgal-authoring/plugins/mixing-entropy.random-math/2.2.3/` 并补充索引；主 Skill 不存在时才独立安装。保留旧版本和用户补充，不修改公共主 Skill 包。AI 使用前按目标工程、Studio 完整版本／通道、相关 SDK 和有效样本选择一套 Stable／Beta 资料；未知或冲突明确标为 `UNKNOWN`，不自动升级宿主。

完整人类手册、独立离线 HTML 与 AI 指南分别维护。插件安装不会自动安装／加载外部 AI Skill，本版未接入 LetsGal 内置文档 AI。教程四张截图继续使用 Studio 2.2.0-beta.1 的真实截图，未改标为新 Beta。

运行代码与 2.2.1 相同；十个方法、参数、存档结构、原 SDK 和依赖版本不变。文字候选鼠标回填继续按“疑似官方 Bug”披露，临时使用 ↑↓＋Enter 或完整手填；新 Beta 尚未复测，不宣称已修复，也不承诺拼音检索。

本轮静态比较、安装／路由检查、文档与包检查的具体范围见 [2.2.3 验证范围](docs/VALIDATION-2.2.3.md)。历史运行结果保留其原日期和宿主版本，不写成新的 Studio、播放器、存读档、导出或模型端到端验收。本轮更新 GitHub；工坊旧材料保留，未执行新提交。
