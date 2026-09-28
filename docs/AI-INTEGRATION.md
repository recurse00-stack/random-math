# 让 AI 使用随机与计算系统

适用插件：`mixing-entropy.random-math` 2.2.1。验证资料核对日期：2026-09-26；主 Skill 获取渠道说明更新：2026-09-28。

这是 AI 接入说明，与创作者使用手册分开。**安装 LetsGal 插件、规则文件被读取、AI 实际读完指南，是三个不同的步骤。** 插件不能保证所有 AI 自动获得本地文件。

## 先确认手里的资料是哪一种

下面的步骤以独立“AI接入包”为例；完整插件包、文档包或源码中的位置不同，按此表找到同一份资料。路径均相对于你解压的目录。

| 要找的资料 | 独立 AI 接入包 | 完整插件包／文档包／源码 |
|---|---|---|
| 整个插件 Skill 文件夹 | `Skill/letsgal-plugin-random-math/` | `skills/letsgal-plugin-random-math/` |
| 统一管理索引条目 | `统一管理索引条目.md` | `docs/ai-integration/PLUGIN-INDEX.entry.md` |
| 完整 AI 使用指南 | `项目文件/docs/random-math/AI-GUIDE.md` | `docs/AI-GUIDE.md` |
| 本接入说明 | `开始使用.md` | `docs/AI-INTEGRATION.md` |
| 待合并规则模板 | `待合并规则/` | `docs/ai-integration/` 中同名模板 |
| 聊天 AI 开场说明 | `给聊天AI的开场说明.md` | `docs/ai-integration/CHAT-START.md` |

这里的完整插件包／文档包指包含本次资料的构建；旧发行包可能没有这些文件。找不到时获取本次独立 AI 接入包，不能仅凭版本号相同判断附件齐全。创作者手册包只含人类教程，不包含 Skill。

从完整插件包接入项目规则时，将 `docs/AI-GUIDE.md` 和 `docs/AI-INTEGRATION.md` 复制到目标游戏的 `docs/random-math/`，再合并相应模板。使用 Skill 时，复制表中的**整个 Skill 文件夹及其参考文件**，无需另装项目规则。

若已把 Skill 装好，正在其 `references/AI-INTEGRATION.md` 中阅读本文，回上一级即可找到 `SKILL.md`；安装包里的规则模板与索引片段没有复制进该技能目录。需要这些备用文件时使用原接入包。索引片段中的相对链接以目标 `plugins/INDEX.md` 为基准，合并且复制 Skill 后才可跳转，不能在未安装的模板位置直接测试它。

## 推荐安装位置：配合 GitHub 版主 Skill，或独立安装

本接入包已提供正式插件 Skill：`letsgal-plugin-random-math`，其中 `SKILL.md` 是入口，`references/` 保存详细指南。**安装到哪里，取决于是否已启用支持用户插件目录的 `letsgal-authoring` 主 Skill（本次以 0.1.0-preview.5 完成隔离路由验收）。** 仅看到 `.letsgal-authoring` 目录，不代表主 Skill 已启用。

这里的主 Skill 指 GitHub 上的 **letsgal-authoring**，通过 [letsgal-authoring-kit Releases](https://github.com/recurse00-stack/letsgal-authoring-kit/releases) 获取。下载正式发布的核心包 `letsgal-authoring-kit-<版本>.zip`，完整解压后按包内说明安装到所用的外部 AI 工具，再接入本插件的 Skill。主 Skill 通过 GitHub 提供，不以工坊安装为前提；安装随机与计算系统本体也不会同时安装主 Skill。

### 首选：配合 GitHub 版 LetsGal 主 Skill 的统一插件区

已从 GitHub 获取并安装支持用户插件目录的主 Skill，且当前 AI 能实际读取它时，推荐：

```text
~/.letsgal-authoring/plugins/mixing-entropy.random-math/2.2.1/
├── SKILL.md
└── references/
    ├── AI-GUIDE.md
    └── AI-INTEGRATION.md
```

1. 完整解压本包，找到 `Skill/letsgal-plugin-random-math/`。
2. 将这个文件夹的**内容**复制到上述 `2.2.1/`，不要额外套一层 `letsgal-plugin-random-math`。缺少目录可新建；已有文件先比较和备份，保留用户补充，不整目录覆盖。
3. 将包内 `统一管理索引条目.md` 合并到 `~/.letsgal-authoring/plugins/INDEX.md`，保留原有条目。不存在时新建索引。同 ID/版本已有条目时更新该条，不反复追加。
4. 在当前作品的 `LETSGAL.md` 或既有项目说明中记录“使用 mixing-entropy.random-math 2.2.1”及这份 Skill 的实际入口；已有约定时局部合并。
5. 在新会话使用 `letsgal-authoring`，让它按当前作品选择读取这个插件 Skill。该目录由主 Skill 管理读取，**不是所有 AI 工具原生扫描的技能目录**。

这里的 `~` 是实际运行 AI 的用户主目录。Windows 本机可从文件资源管理器地址栏输入 `%USERPROFILE%` 找到用户目录，再进入 `.letsgal-authoring`；远程、WSL、容器和云端要使用对应环境的用户目录。

这是首选的资料管理位置，不是 LetsGal 扩展代码安装目录。插件本体仍由 Studio 管理。主 Skill 更新或卸载应保留这里的用户插件资料；插件升级后根据实际版本新增/更新资料，保留旧项目需要的旧版本。

### 备用：没有主 Skill，安装到所用 AI 的技能目录

无需为了单独使用随机数插件而强制安装主 Skill。完整复制 `Skill/letsgal-plugin-random-math/` 到下表中的一个位置，保留该文件夹名与 `references/`。不要只复制 `SKILL.md`。

| AI 工具 | 推荐个人目录 | 仅用于一个作品时 |
|---|---|---|
| DSH / DeepSeek Harness | `<实际 DSH_HOME>/skills/letsgal-plugin-random-math/`；未自定义时为 `~/.dsh/skills/letsgal-plugin-random-math/` | `<最近 Git 根或项目目录>/.dsh/skills/letsgal-plugin-random-math/` |
| Codex | `~/.agents/skills/letsgal-plugin-random-math/` | `<项目>/.agents/skills/letsgal-plugin-random-math/` |
| Cursor | `~/.agents/skills/letsgal-plugin-random-math/` | `<项目>/.agents/skills/letsgal-plugin-random-math/` |
| Claude Code | `~/.claude/skills/letsgal-plugin-random-math/` | `<项目>/.claude/skills/letsgal-plugin-random-math/` |

`<…>` 表示你自己的真实位置，不是照抄创建的文件夹名。其他支持 Skill 的工具使用其文档指定的目录；自定义技能目录优先，不迁移或删除已有技能。

DSH 需要当前 profile 已启用文件系统技能提供器及技能工具；启动器若另设 DSH_HOME，使用实际位置，不能猜成默认目录。安装本资料包不修改 DSH 配置或重启服务。

新会话检查技能列表，必要时显式调用 `letsgal-plugin-random-math`。工具可根据描述按需选用 Skill，但不保证每次都自动调用；用下文识别问题和实际读取记录验收。只安装自己使用的路径，避免同名不同版本在多个扫描目录同时生效。独立技能目录默认只放当前选择的一个版本；多作品使用不同版本时，优先统一管理或各项目分别安装。

### 再备用：不支持 Skill 时使用项目规则或上传指南

下面保留之前的项目规则接入方法，供没有 Skill 功能的客户端使用；已经按上面安装 Skill 时，不必再把同一套规则追加一遍。普通网页 AI 可上传或粘贴指南；LetsGal 内置助手仍见其专门限制说明。

## 项目规则备用方法：每个游戏项目配置一次

接入包另保留相同指南及三种规则模板，不需要 GitHub，也不需要运行程序。请先将接入包解压到一个临时目录。

1. 找到外部 AI 实际打开的游戏项目根目录。不要只放进插件安装目录，也不要放进 Studio 程序目录。
2. 将包内 `项目文件/docs/random-math/` 目录复制到项目根目录的 `docs/random-math/`，其中包含完整指南和接入说明。如果目标已有旧指南，先保留旧副本并核对插件版本，再更新。
3. 按下表接入所用 AI。**已有规则文件时合并正文，不要用模板覆盖整份文件。** 模板文件名带 `.append`，仅供合并，不会自动生效。
4. 从这个项目重新开始 AI 会话，执行下文的识别检查。以后处理本插件相关任务时，规则会要求 AI 先读完整指南的相关章节。

| AI 工具 | 接入方式 | 生效条件 |
|---|---|---|
| Codex | 将 `待合并规则/AGENTS.append.md` 正文追加到项目根目录 `AGENTS.md` | Codex 在该根目录或其受覆盖子目录启动；该目录如已有非空 `AGENTS.override.md`，应把本段合并进实际生效的 override 文件；不要删除原规则 |
| DeepSeek Harness（DSH） | 与 Codex 共用 `AGENTS.append.md`，合并到游戏项目根目录 `AGENTS.md` | 当前 profile 启用官方 `dsh-agent-instructions`（base 默认包含），可访问项目文件且指令未被预算省略；从游戏项目启动新会话 |
| Claude Code | 将 `待合并规则/CLAUDE.append.md` 正文追加到根目录 `CLAUDE.md` | 文件包含指南导入行；项目指令没有被配置为忽略；用 `/memory` 检查实际加载文件 |
| Cursor Agent | 将 `待合并规则/random-math.mdc` 复制到根目录 `.cursor/rules/random-math.mdc` | 设置中该项目规则已启用，`alwaysApply: true`；若同名规则已存在则先合并 |
| 网页聊天 AI、其他工具 | 提供 `给聊天AI的开场说明.md` 和完整 `AI-GUIDE.md`；支持上传就上传，不支持就粘贴 | 普通聊天网页不会自动扫描本地游戏目录；有项目知识库的工具可按其支持方式添加，仍需验证 |

只需配置自己使用的工具。Codex/Cursor 的短规则自动进入上下文后，会要求 AI 读取相关指南；这不等于平台保证每次都全文注入。Claude Code 的模板使用本地文件导入。指令长度限制、规则禁用、启动目录错误和 AI 未执行读取都可能影响结果。

**DSH 特别说明：** 本次核对官方指令加载器 0.1.6-alpha.2，默认读取 `AGENTS.md`、`CLAUDE.md` 及其 `.local.md` 叠加文件。它不解析 Claude 的 `@path` 导入，所以 DSH 用户应使用 AGENTS 模板中的明确读取指令，不能只复制 Claude 模板。DSH 默认也不把 `AGENTS.override.md` 当作候选：同时使用 Codex 和 DSH 时，若 Codex 使用 override，保留 DSH 的 AGENTS 段，并同步相同内容。短规则会进入初始上下文，完整指南由 AI 按任务读取。配置禁用或预算省略时不会生效，不需要为此安装第三方 rules 插件。

若游戏目录处于更大的仓库中，从游戏目录启动 AI；从仓库上层启动时，不要假设其会预先读取所有子目录规则。需要在上层工作时，将规则合并到实际生效的上层入口，并调整指南路径。这里所有 `docs/random-math/AI-GUIDE.md` 都指游戏项目根目录下的路径。

源码开发者也应读取插件源码仓库的维护规则；本包只是创作者用法规则，不能代替维护规范。

## LetsGal 内置 AI：本版不接入

截至本次核对，官方介绍的是检索 Studio 用户手册与扩展开发文档的“文档 AI 助手”，并注明不会读取或代写当前项目剧本。本次检查的已安装 SDK 清单、扩展元信息与上下文接口中，没有找到注册插件 AI 指南的公开入口。

因此，**不能声称安装本插件后内置 AI 已自动读到指南**，也不添加宿主不支持的清单字段。把规则放进游戏根目录也不能证明内置助手会读取。

可以尝试把 `给聊天AI的开场说明.md` 和所需指南章节粘贴到助手问题中，请它依据本轮提供的内容解释；这属于手动提供上下文，不是自动接入。如果助手不接受自定义上下文、仍只返回官方文档，改用支持文件的外部 AI。当前未实测内置助手接受该指南，未接入其知识库。本版不承诺内置助手自动发现；需要 AI 协助时使用上文的外部 AI 接入方式。

## 各类 AI 工具的验证状态

本版不要求用户安装所有 AI 工具，也不为验收下载未安装的客户端。**“依据公开规则理论可行”“提供器能发现资料”“模型实际读到指南”是不同状态。** 仅使用自己已有的工具，按实际入口安装一次；没有实测的路径不承诺自动调用成功。

| 工具／方式 | 证据和状态 | 使用时需要知道 |
|---|---|---|
| Claude Code | 已有真实模型会话验证：独立 Skill、主 Skill 按工程版本定位统一区，两条路径均读取正文与参考资料 | 沿用相同结构的验收；不保证所有模型或每次自动调用 |
| DeepSeek Harness（DSH） | 本机提供器的用户／项目级发现及参考读取已验证；完整模型会话因缺可用凭据未完成 | 按本工具的技能／AGENTS 规则接入；不是已经完成端到端验证 |
| Codex | 已发现技能摘要；此前隔离会话读取正文被执行策略拒绝，端到端未通过 | 文档与路径依据公开规则可行，仍受实际权限和启动目录约束；不能把本次维护助手读取源码当成自动接入验收 |
| Cursor | 本机常规命令和安装登记未发现客户端；未安装、未实测 | 按官方 Skill／项目规则文档判断可行，仅提供理论接入步骤 |
| 网页聊天 AI／其他未安装工具 | 未逐个实测；支持文件上下文时可手动上传或粘贴 | 理论可行取决于工具接受文件／文本的能力，不是本地目录自动扫描 |
| LetsGal 内置文档 AI | 未发现注册插件指南的公开入口；本版未接入 | 不承诺自动识别；手动粘贴也未实测，详见内置 AI 限制 |

不同工具中的 DeepSeek 模型，不等于 DSH 客户端本身。未实测工具不会阻挡本版资料包交付，但必须保留以上标注；后续实际使用时再按文末识别步骤核对。

## 检查 AI 是否实际识别

新会话只提出以下问题，不把答案粘给它：

> 请先检查本项目的随机与计算系统使用规则，读取对应指南，并报告实际读到的文件路径、扩展 ID 和文档适用版本。解释片段完成后怎样让一个事件不再参与抽取；如果抽取池已经建立，改表或改权重会不会立即改变这个池？最后列出十个实际方法 ID。如果不能读取文件，明确说不能，不要猜测。

人工核对指南中十个方法：`rand`、`rand-pick`、`rand-pick-number`、`deck-create`、`deck-draw`、`deck-peek`、`deck-reset`、`preview-pool`、`reset-fixed`、`calc`。应说明普通列表可通过片段末尾显式修改变量、让权重表达式在下次调用反映资格；已有抽取池是创建时快照，不会随源表或权重变量自动刷新；`remaining` 不是硬件真随机。

答案正确只算语义核对，还应检查工具读取记录、已加载指令列表或规则面板，确认本次确实读取了文件。不要只凭 AI 自称“我已读到”判断。缺少相应证据时，记为未验证。

指南升级时，更新实际使用的统一目录、独立Skill或项目规则对应副本，重新开会话检查；单独升级插件不会自动更新这些副本。移除接入时，只删除自己添加的规则段与对应指南副本，保留项目原规则。

## 核对依据与验证范围

- [LetsGal 帮助与引导](https://docs.avg-engine.com/manual/overview/help-and-guides)：内置文档助手的公开能力边界。
- [Codex 项目指令](https://developers.openai.com/codex/guides/agents-md)：根目录到工作目录的规则发现、override 优先级与长度限制。
- [Claude Code 项目记忆](https://code.claude.com/docs/en/memory)：项目规则与文件导入。
- [Cursor 项目规则](https://cursor.com/docs/rules)：项目规则目录与 alwaysApply。
- [DSH 官方指令加载器说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/context/agent-instructions/README.zh.md)：默认候选、首轮注入、预算和不支持的导入语法。本次同时核对本机安装的 0.1.6-alpha.2 实现。

2.2.1 验证了模板路径、Skill 结构及引用，以及 DSH 0.1.6-alpha.2 官方提供器从用户和项目目录发现并读取正文与参考资料。新增两次 Claude Code 2.1.229 隔离会话实测，使用该客户端已有配置中的 DeepSeek 模型：一次自动调用独立插件 Skill，另一次按明确请求调用 letsgal-authoring 0.1.0-preview.5，再按项目声明读取统一插件区的2.2.1资料。工具记录证实实际读取了入口与完整指南；两次均正确解释片段反馈、建池快照、绑定表范围、输出列、十个方法及remaining读档边界。这里的统一插件区是隔离工程明确指定的位置，未向真实用户目录安装；不据此声称所有主目录布局或所有模型均通过。

Claude Code 内使用 DeepSeek 模型不等于 DeepSeek Harness（DSH）客户端验收。DSH隔离模型会话仍缺少可用凭据；Codex新会话发现了Skill摘要，但读取正文的只读命令被执行策略拒绝；Cursor模型会话未实测。测试没有读取、复制凭据或改变用户配置。Skill被发现、模型读到正文、答案正确、目标游戏运行应分别检查；即使本次两种接入成功，也不能保证以后每次都会自动调用。没有接入 LetsGal 内置 AI。

技能目录来源：[Codex](https://developers.openai.com/codex/skills)、[Claude Code](https://code.claude.com/docs/en/skills)、[Cursor](https://cursor.com/help/customization/skills)、[DSH官方提供器](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/skill/skill-filesystem/README.md)。统一用户区是 letsgal-authoring 主Skill的管理约定，不宣称这些客户端会原生扫描它。本修订交付可复制的Skill目录与推荐位置，没有自动执行安装，也未修改另一工程的导入器。
