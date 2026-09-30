---
name: letsgal-plugin-random-math
description: 协助在 LetsGal 使用随机与计算系统，配置范围随机、权重事件、批量输出、不重复抽取池、数学公式和片段完成反馈。适用于 mixing-entropy.random-math 2.2.3；按目标工程与实际 Stable/Beta 宿主证据选择资料。
metadata:
  plugin_id: mixing-entropy.random-math
  plugin_version: "2.2.3"
  documentation_revision: "2026-09-30"
---

# 随机与计算系统 · 创作者协助

适用于 `mixing-entropy.random-math` 2.2.3；抽取池与数组运行功能自2.2.0已有，运行代码仍沿用2.2.1，本轮增加说明、辅助安装与资料路由。当前 Agent 有 [GitHub 版 `letsgal-authoring` 主 Skill](https://github.com/recurse00-stack/letsgal-authoring-kit/releases) 时作为独立版本化知识保存到实际用户区，由主 Skill 按项目插件版本读取；主 Skill 不存在时才独立安装到该 Agent 的技能目录。主 Skill 从 GitHub Releases 获取核心包，不以工坊安装为前提；随机插件本体不会自动安装主 Skill。不得将本插件知识塞进公共主 Skill 包。

## 使用前

读取当前作品的插件选择与实际启用版本；有 `LETSGAL.md` 时沿用其中的明确入口，不默认取资料目录的最新版本。区分插件源码、游戏安装副本和本 Skill。版本未知时继续解释通用流程，不猜测可写入的参数格式。

按目标工程、该实例实际 Studio 完整版本／通道、相关 SDK 和有效调用样本选择一套资料。优先使用随 Skill 安装的只读选择器：

```text
python <本Skill目录>/scripts/select-host-guidance.py --project <目标工程> --studio-exe <实际Studio可执行文件> --sdk-root <目标SDK目录>
```

无法读取可执行文件时，可使用有来源的 `--host-version <完整版本> --channel stable|beta`，保留声明来源；不能把输入声明当作读取进程。读取结果中的证据、缺项和冲突。退出码0仅证明资料选择，`compatibility_validation=NOT_RUN`；退出码2或未知／冲突标为 `UNKNOWN`。不要猜宿主版本、用SDK单独推断通道、沿用别的项目版本或自行升级引擎。确认后仅读取所选的 [Stable 资料](references/compatibility/stable.md) 或 [Beta 资料](references/compatibility/beta.md)，不同时载入两套作为默认规则。

对将要写入的章节结构和变量引用，另核对该完整版本实际保存的可工作样本及目标 SDK；没有对应样本就交付人工填写步骤，暂缓不确定字段。资料路由和 Stable／Beta 两个真实宿主验收分别记录，不能相互代替。

先判断用户需要一次随机、同批去重、跨调用消费、动态资格还是计算。按下面的指引读取 [完整 AI 使用指南](references/AI-GUIDE.md) 的相关章节，再提供具体参数；不能只凭技能摘要生成调用。

| 任务 | 阅读指南 |
|---|---|
| 变量、绑定、输出列、批量结果 | 第3节：数据、绑定和输出；对应方法的完整参数 |
| 权重、固定百分比、执行片段后改变资格 | 第4节及指南中的片段反馈示例 |
| 持续不重复抽取、数组、读档行为 | deck-create / deck-draw / deck-peek / deck-reset 的参数与限制 |
| 固定随机、计算或自定义函数 | rand / reset-fixed / calc 的参数与错误处理 |
| 安装或识别这份 Skill | [安装位置与接入](references/AI-INTEGRATION.md) |
| 稳定版、Beta、SDK 或证据冲突 | 先运行只读选择器，再只读选择结果指向的 compatibility 文件 |

## 不要混淆的行为

- 普通列表可在片段结尾显式改变量，下一次权重计算反映资格；插件不自动监听片段完成。
- 已建抽取池是创建时快照，修改候选表或权重变量不会更新它。每次抽之前重建会破坏跨调用不重复；`remaining` 不是硬件真随机，也不保证读档后一定换结果。
- `pool` 是当前绑定候选表里的分组；抽取池 `key` 是独立存档记录名。“全部池”不等于项目所有数据表。
- JSON 数组输出存入文本变量。先建立类型匹配的变量，检查成功状态，再使用结果；失败时旧结果可能仍保留。
- 参数对象不是可直接导入的剧本节点。写项目文件前，核实当前宿主格式和有效实例，保留节点身份；没有依据时提供人工填写步骤。
- 当前插件没有运行时候选行增删改方法。检查器下拉候选只来自剧本已填值；历史 Studio 2.2.0-beta.1 中文首字过滤通过，人工确认鼠标候选回填失败；方向键＋Enter及完整手填已验证可用，仍须核对保存值。独立扩展在干净工程同样失败，内部根因未定位，继续按“疑似官方 Bug”披露；2.3.0-beta.1 本轮未复测，不能声称下拉已修复；不支持拼音检索。

## 资料与验证

资料依据：[插件源码](https://github.com/recurse00-stack/random-math)、2.2.3 随附指南及与 2.2.1 相同的方法定义、[官方更新记录](https://avg-engine.com/changelog)、[官方扩展开发入口](https://docs.avg-engine.com/extensions/develop/)。功能和模型读取沿用各自历史证据；2026-09-30 对照实装2.3.0-beta.1的SDK，所用方法、变量、数据依赖和存档API静态保留，未改运行实现。当前官方开发文档标注v2.0，不能将整站最新说明当作Beta专属资料。

SDK静态比较、资料路由、安装检查、Agent实际读取、真实Studio、播放器、存读档和导出是不同层次。新Beta实机与当前Stable宿主实机验收均未完成，保持 `UNKNOWN`／`NOT_RUN`；既有2.2-beta结果不写成2.3新实测。发布／审核状态以实际通道为准。
