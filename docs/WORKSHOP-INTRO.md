# 随机与计算系统 2.2.3

为 LetsGal 剧本提供随机数、批量数组、文字和数值候选抽取、权重与固定概率、跨调用不重复抽取池，以及数学公式计算。适合掷骰、概率事件、抽卡、奖励和事件轮换。结果写入你创建的变量，剧情分支和奖励由你的剧本接续。

## 详细指导在哪里？不需要下载源码

**第一次使用：直接往下看。本页后半部分就是完整的创作者手册，包含术语、安装与变量、第一次掷骰、三个事件各抽一次、表格绑定、输出列、动态反馈、存读档和排障。无需跳转，也不需要下载源码或 AI 接入包。**

- **在线阅读人类教程：** [打开创作者使用手册](https://github.com/recurse00-stack/random-math/blob/main/docs/USER-GUIDE.md)。浏览器直接阅读，无需登录 GitHub、下载仓库或编译。
- **单独保存离线手册：** [下载创作者手册 HTML](https://raw.githubusercontent.com/recurse00-stack/random-math/main/docs/creator-guide.html)。保存后用浏览器打开，目录、搜索、跳到第几处、结果预览和图片都可离线使用；只下载这一个文件即可。
- **让外部 AI 协助：** [在线阅读独立 AI 使用指南](https://github.com/recurse00-stack/random-math/blob/main/docs/AI-GUIDE.md)；也可[单独下载 AI 指南 HTML](https://raw.githubusercontent.com/recurse00-stack/random-math/main/docs/ai-guide.html)。人类教程与 AI 规则分开，安装插件不代表 AI 已自动接入；本版未接入 LetsGal 内置 AI，其他工具的实际验证范围见指南。

如果当前 Studio 的详情预览不能打开链接，直接阅读下方完整教程。需要独立版本时，把下面地址复制到系统浏览器（不要下载页面里的 Source code）：

创作者手册在线阅读：
https://github.com/recurse00-stack/random-math/blob/main/docs/USER-GUIDE.md

创作者手册单文件下载：
https://raw.githubusercontent.com/recurse00-stack/random-math/main/docs/creator-guide.html

独立 AI 指南在线阅读：
https://github.com/recurse00-stack/random-math/blob/main/docs/AI-GUIDE.md

工坊使用其“安装／更新”入口；手册和 AI 接入包不是插件本体。本轮2.2.3只更新GitHub，未重新提交工坊。当前条目的实际版本和审核状态以工坊为准。

**AI Skill 配合说明：** 当前 Agent 有 [GitHub 版 letsgal-authoring 主 Skill](https://github.com/recurse00-stack/letsgal-authoring-kit/releases) 时，将插件资料安装到实际用户区并补充索引；主 Skill 不存在时才独立安装。辅助安装默认预览，需要 `--apply` 才写入，保全已有内容并拒绝冲突静默覆盖。主 Skill 通过 GitHub 提供，不以工坊安装为前提。

## 2.2.3 更新与已知限制

本次根据 Studio 2.3.0-beta.1 的接口静态核对更新说明、AI 辅助安装和 Stable／Beta 资料选择，运行代码仍沿用2.2.1，保留原ID、十个方法和存档结构。资料路由与安装检查不代表真实宿主、播放器、存读档或导出已经通过。

**疑似官方 Bug：** 历史 Studio 2.2.0-beta.1 的文本候选可能“能看到候选，但鼠标点击不回填”，方向键＋Enter或完整手填可用。新Beta本轮未复测，不能宣称修复；本版不承诺拼音检索。四张教程截图继续标注真实旧Beta来源，不冒充新版截图。
