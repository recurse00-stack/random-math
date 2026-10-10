# 抽选与数学增强 · AI Skill 安装与使用说明

适用插件：3.0.1。资料修订：2026-10-10（3.0.1）。

本说明供创作者阅读。给 AI 的功能规则是完整 Skill：SKILL.md 提供入口，references/ 保存按需读取的参数、案例和版本资料。安装 Skill 不会安装、启用或升级游戏插件。

## 1. 选择正式版或 Beta

按目标工程实际使用的 Studio 通道选择一份：

|目标 Studio|选择|AI 操作方式|
|---|---|---|
|正式版，目前资料参照 2.5.0|stable|当前已知无 MCP，直接使用原有流程|
|Beta，目前资料参照 2.6.0-beta.1|beta|MCP 可用且获准时优先使用；未启用时简短回退|
|旧 Beta，没有官方 MCP|beta|继续用该版本的资料与原有流程|

这是资料选择，不是对应宿主的完整运行验收声明。3.0.1 沿用已验收的3.0.0运行实现，统一更新插件包和资料版本；历史实测仍按原版本记录。无法确认宿主时先核完整版本，不按本机最新安装猜测其他作品。

MCP 是 Studio 给 AI 的操作接口，Skill 是使用插件的知识。没有 MCP 也能用 Skill；Beta 未启用 MCP 时，只需简短说明便按原有方式继续，不反复要求接入。工程保存并关闭后可处理文件；工程打开时使用获准界面或官方工具，没有操作能力时先给出草稿。待批准、只读或拒绝状态继续遵守权限。

## 2. 下载与解压

已有插件时，下载文件名以 **-ai-kit.zip** 结尾的接入包。完整插件包也附带相同安装工具和两套资料。完整解压后保留目录结构：

~~~text
extension.json
plugin-skill-manifest.json
channels/stable/skills/letsgal-plugin-random-math/
channels/beta/skills/letsgal-plugin-random-math/
channels/<通道>/plugin-skill-manifest.json
skill-profiles/legacy-sdk1.json
scripts/install-skill.py
scripts/skill-channels.py
scripts/select-host-guidance.py
scripts/migrate-project.py
~~~

AI 接入包另有“开始使用.md / .html”。完整插件包见 docs/AI-INTEGRATION.md 和 docs/ai-install.html。只下载 SKILL.md 或单个脚本不构成完整安装包。

## 3. 先预览，再安装

需要 Python 3.9 或更新版本。在解压包根运行，例如 Beta：

~~~text
python scripts/install-skill.py --agent codex --channel beta
~~~

正式版把 beta 换成 stable。Claude 可用 --agent claude；其他客户端可显式指定 --skills-root。也可用已确认的 --host-version 2.6.0-beta.1 选择通道；同时指定且冲突会停止。

默认仅预览，不写文件。检查 target、channel、docs_revision、changes、backup_area 和 plan_id。复制此次 plan_id，首次安装执行：

~~~text
python scripts/install-skill.py --agent codex --channel beta --apply --plan <预览返回的plan_id>
~~~

路径和文件在预览后变化时，旧 plan_id 失效，重新预览。自定义用户目录用 --user-root；远程、WSL 或容器中的 AI，应在实际运行环境安装。安装器不下载主 Skill、Studio 或 MCP，不改账号、权限与客户端配置。

## 4. 安装位置和开始使用

已有 letsgal-authoring 主 Skill 时，知识装入实际用户目录的 .letsgal-authoring/plugins/mixing-entropy.random-math/3.0.1/，索引记录通道和资料修订。没有主 Skill 才装入当前 Agent 的 skills/letsgal-plugin-random-math/。不会把插件知识写进公共主 Skill 包。

同一路径只激活一份通道。主 Skill 与插件通道不符时先核目标并选择匹配的主 Skill，安装器不代为切换主 Skill或升级 Studio。旧插件版本、其他插件和个人偏好保留。

安装后按客户端支持的方式刷新 Skill 或开启新会话，可告诉 AI：

> 使用抽选与数学增强的插件 Skill，核对这个工程的实际版本，帮我配置一个二十面骰，将结果写入数值变量 dice。

有主 Skill 时按用户插件索引读取；独立安装时可指定 letsgal-plugin-random-math。请 AI 核对实际读取路径、通道和资料修订。文件安装、当前 AI 读取、客户端自动发现、Studio 启用及游戏运行分别验证。

## 5. 更新、切换通道与恢复

相同资料重复安装返回 UNCHANGED。同版本资料更新或切换通道也先预览；确认变更后，使用相同参数加 --update：

~~~text
python scripts/install-skill.py --agent codex --channel beta --apply --update --plan <预览返回的plan_id>
~~~

安装器核验原文、保全旧目录与索引、提交后读回，并返回 backup。已知 sdk.1 原件可直接接续；个人改动或未知来源会报告冲突，保留原文等待比较。额外文件不会被删掉，新文件与个人文件撞名时停止。不要删除收据、改清单或强制覆盖来消除提示。

备份放在 Skill 自动发现目录之外。恢复也先预览，使用安装返回的完整 backup 路径：

~~~text
python scripts/install-skill.py --restore <backup路径>
python scripts/install-skill.py --restore <backup路径> --apply --plan <恢复预览的plan_id>
~~~

恢复前会核对当前文件和索引；安装后已有编辑时停止，避免覆盖新内容。恢复保留替换前后的资料。安装新插件版本不会覆盖旧版本知识。

## 6. 版本核对与工作范围

随包只读选择器可帮助 AI 读取工程、完整 EXE 版本、对应 SDK 与样本：

~~~text
python scripts/select-host-guidance.py --project <工程> --studio-exe <实际Studio文件> --sdk-root <SDK目录> --skill-root channels/beta/skills/letsgal-plugin-random-math
~~~

选择器参数以 --help 为准；安装后也可在实际 Skill 根运行 scripts/select-host-guidance.py。缺失或冲突标 UNKNOWN，只暂停依赖该信息的工作。资料路由不证明播放、存档、导出通过；历史范围见 VALIDATION-3.0.md。

官方 MCP 获准时，AI 可读取插件真实方法和设置、编辑池目录和相关剧本调用。作者配置不直接覆盖已开始游玩的池，也不会改变随机、占用凭证和存档规则。MCP 接入不是 If 缓存问题的修复。

## 7. 常见问题

|现象|处理|
|---|---|
|没有 MCP 或尚未启用|继续原流程，不必为 Skill 强制接入|
|MCP 待批准、只读或被拒绝|遵守对应权限；可先做草稿，不换工具绕过|
|未选择通道|补 --channel stable / beta，或已确认的 --host-version|
|主 Skill 通道不符|核对目标工程并选择匹配主 Skill；不自动改变宿主|
|预览过期|重新预览差异，使用新的 plan_id|
|已有文件被修改或来源未知|保留文件，比较个人修改；不要强行替换|
|哈希错误或清单缺失|完整重新解压同一个包，不混用修订|
|链接、重定向或路径越界被拒绝|使用实际用户区的普通目录|
|AI 看不到资料|核安装环境，刷新／新会话，并提供实际 SKILL.md 路径|
|Studio 没有插件入口|在目标工程启用插件，核对 mixing-entropy.random-math|

不支持 Skill 的工具可按需读取对应通道的完整 Skill 文件夹。AI 接入包的“项目文件/<通道>/docs/random-math/”是备用工程资料；选择一份完整复制到关闭并已保护的工程，再比较合并“待合并规则”中的模板。已安装 Skill 时无需添加重复规则。本包不提供 Studio 内置 AI 的自动注册。

迁移工具仍随包提供，与 Skill 安装独立。旧工程转换前读 MIGRATION-3.0.md，先预览、备份，再按原文校验应用；安装资料不会迁移作品或修改存档。
