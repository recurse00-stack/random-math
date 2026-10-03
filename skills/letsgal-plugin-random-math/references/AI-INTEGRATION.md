# 抽选与数学增强 · AI Skill 安装与使用说明

适用插件：3.0.0。资料修订：2026-10-03（sdk.1）。

这份说明供创作者阅读，介绍下载、安装、让 AI 使用资料和更新方法。给 AI 的功能规则已经整理为完整 Skill：入口是 SKILL.md，详细参数、示例和版本资料放在 references/ 中，按任务读取。无需把技术指南网页逐段复制给 AI。

## 1. 下载哪一个包

- **完整插件包**：供 Studio 安装，另附 Skill、安装工具和手册。
- **AI Skill 接入包**（文件名以 -ai-kit.zip 结尾）：供已经安装插件、只需给 AI 补充知识的创作者使用。
- **人类手册**：介绍在 Studio 中配置和编排；离线网页可直接阅读。
- **AI Skill 安装说明**（-ai-install.html）：就是本说明的离线版。

完整解压 AI 接入包后，应看到：

~~~text
extension.json
plugin-skill-manifest.json
开始使用.md
开始使用.html
skills/letsgal-plugin-random-math/
    SKILL.md
    references/
    scripts/
scripts/install-skill.py
scripts/select-host-guidance.py
scripts/migrate-project.py
~~~

完整插件包中对应说明位于 docs/AI-INTEGRATION.md 和 docs/ai-install.html。保留整个解压目录；只下载 SKILL.md、脚本或 GitHub 的 Source code 压缩包不构成完整安装包。

## 2. 先预览，再安装

需要 Python 3.9 或更新版本。在解压后的包根打开终端，运行：

~~~text
python scripts/install-skill.py
~~~

默认仅检测与预览。查看它识别的 Agent、实际用户目录、主 Skill、安装目标及现有文件差异。若未识别当前客户端，显式指定，例如：

~~~text
python scripts/install-skill.py --agent codex
~~~

确认预览路径属于实际运行 AI 的环境后，使用同一组参数加 --apply：

~~~text
python scripts/install-skill.py --agent codex --apply
~~~

安装器支持的客户端选项可通过 --help 查看。自定义技能目录用 --skills-root，自定义用户主目录用 --user-root；在远程、WSL 或容器中使用 AI，就在对应环境安装。安装器不下载或升级 Studio、主 Skill、客户端及其依赖。

## 3. 安装到哪里

**已有 letsgal-authoring 主 Skill**：插件知识放入实际用户主目录的 .letsgal-authoring/plugins/mixing-entropy.random-math/3.0.0/，并更新 plugins/INDEX.md。主 Skill 按当前作品读取对应版本；公共主 Skill 文件不被替换。

**没有主 Skill**：安装器将完整 letsgal-plugin-random-math 文件夹安装到当前 Agent 的技能目录。可以独立使用，无需为了本插件额外安装主 Skill。

两种方式都应保留 SKILL.md、references/ 和 scripts/。安装知识不等于在 Studio 工程启用插件；Studio 的安装启用步骤见人类手册第2章。

## 4. 让 AI 开始使用

安装后开启该客户端的新会话，或者按其支持的方式刷新技能。告诉 AI 目标工程和需要完成的事情，例如：

> 请使用抽选与数学增强的插件 Skill。先核对这个工程启用的插件版本和 Studio 完整版本，再帮我做一个二十面骰，结果写入数值变量 dice；不要升级引擎。

有主 Skill 时，提示它读取用户插件索引中的对应版本；独立安装时可明确指定 letsgal-plugin-random-math。请 AI 列出实际读到的 SKILL.md 路径和插件版本，再开始编排。看到技能名称、实际读到文件和剧本运行正确是不同步骤。

更复杂的请求可以直接表达目的，例如“让奖池A的权重随好感度变化”“选择完成后确认消耗”。AI 会从 Skill 的参考文件中读取相关参数，不必预先加载所有资料。

## 5. Stable 与 Beta 怎么选择

Skill 按目标工程、实际 Studio 完整版本与通道、对应 SDK 和有效样本选择资料；不把本机 Beta 当成其他作品的默认版本。以下命令从完整解压包根运行，可让 AI 使用随包只读选择器：

~~~text
python scripts/select-host-guidance.py --project <目标工程> --studio-exe <实际Studio可执行文件> --sdk-root <目标SDK目录>
~~~

安装后的 Skill 也带有该选择器：先进入实际Skill根再执行同一命令，或使用它的绝对脚本路径。不要在references/目录直接运行相对的scripts/路径。版本缺失或互相冲突会报告 UNKNOWN；先补齐信息，再处理依赖版本的字段。选择资料不代表已验证目标游戏能够播放、存档或导出。当前验证范围见随包 VALIDATION-3.0.md。

## 6. 重复安装、升级与同版本资料更新

相同内容重复安装会返回 UNCHANGED。安装新版本时保留旧版知识，按作品实际使用版本选择；索引修改前会备份，不删除其他插件条目。

同一路径已有不同内容时，安装器会报告冲突并停止，包括“插件版本相同、资料修订不同”的情况。先备份已有目录与索引，再比较差异，只合并确认属于本次更新的文件，保留自定义补充；也可以请维护该工程的 AI 协助完成此步骤。不要删除旧目录、强制覆盖或改清单绕过检查。资料修订不改变插件运行版本。

## 7. 常见问题

|现象|处理方法|
|---|---|
|找不到 Python|先使用可运行 Python 3.9+ 的环境，或按当前客户端方式手工安装完整 Skill 文件夹|
|AI 说没有看到 Skill|确认安装在运行 AI 的环境，刷新／新建会话，并提供实际 SKILL.md 路径|
|提示文件哈希不一致或清单缺失|重新完整解压同一发行包，不混用不同版本的脚本和资料|
|提示已有内容冲突|先备份并比较差异，保留未知文件，再明确合并|
|路径越界、符号链接或重定向被拒绝|使用实际用户区内的普通目录，不用链接绕过保护|
|AI 会用插件但 Studio 中没有入口|在目标工程启用插件，核对稳定ID mixing-entropy.random-math|
|AI 的建议与工程实际参数不同|让它重新核对工程插件版本、路由资料和实际参数，保留未知项，不猜接口|

不支持 Skill 的聊天工具可以按需接收 SKILL.md 和它引用的相关文件。旧式项目规则模板也随包保留。采用此备用方式时，将AI接入包的“项目文件/docs/random-math/”整个目录复制到目标工程的docs/random-math/；它包含SKILL.md、references/与只读路由脚本。再比较并合并“待合并规则”中的适用模板，保留已有规则原文；不要只复制AI-GUIDE.md而遗漏参考文件。已经安装 Skill，无需再次添加重复规则。

本包不提供 LetsGal 内置 AI 的自动注册功能；安装插件不会使内置 AI 自动获得这份知识。需要 AI 协助时，使用能够读取文件或 Skill 的工具。

迁移工具与安装器相互独立。安装 Skill 不会迁移旧工程或修改存档；迁移时先阅读 MIGRATION-3.0.md，预览、备份后再应用。
