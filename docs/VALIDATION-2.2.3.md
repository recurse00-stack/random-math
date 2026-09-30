# 2.2.3 验证范围

修订日期2026-09-30，插件ID `mixing-entropy.random-math`。本轮更新说明、AI Skill、辅助安装及 Stable／Beta 资料路由；运行代码仍沿用2.2.1，十个方法、参数、随机算法、存档结构、原SDK与依赖不变。

## 新 Beta 的静态依据

- 实际安装的 Studio 完整版本为2.3.0-beta.1，通道Beta。官方更新记录已读取该完整版本；其中没有声明修复本插件的文本候选鼠标回填。
- 对照实装官方SDK2.3.0-beta.1，既有方法、变量访问、数据库依赖、`saveSchema` 与槽内存档接口静态保留。新增 `withSave`／`this.method` 属可选新写法，不需要为本轮说明更新改写运行代码。
- 在任务隔离目录复制实装官方SDK，保留原源码脚手架的 `extension-inspector.ts` 类型桩（官方SDK分发不附此桩），对现有src执行 TypeScript `--noEmit` 检查：PASS。没有将新SDK拷回自用源；原SDK1.21.0不变。
- SDK接口比较与隔离类型检查只能证明上述静态层。新Beta实际GUI、原源码关联刷新、插件新装／升级、播放器、存读档、关闭重开、导出和实际章节样本仍未完成本轮验收。

## 本轮构建与运行文件核对

`npm run build`、原SDK的 `tsc --noEmit` 与postbuild双入口回归：PASS。构建后逐文件核对src、SDK与dist的SHA-256，均与本轮写前基线一致；没有修改算法或原SDK。`dist/index.js`／`index.mjs`字节相同，运行入口SHA-256仍为 `21e5936e57bbcaf67719997cf3d1a7ae314a61998596a65ca1cbdb964f3d3223`。

本轮没有重跑全部历史算法测试，也没有把构建或SDK垫片检查写成真实Studio运行、播放器、存读档或导出通过。历史算法回归复用其原实现与原日期证据。

## 辅助安装与资料路由行为检查

最终30项行为测试：27项PASS，3项实际文件符号链接用例因当前Windows创建权限不足而SKIP，整体测试退出码0。两项实际目录junction拒绝用例及独立模拟文件reparse用例通过；模拟用例不代替3项跳过的实际文件链接检查。

覆盖完整发行清单缺失（默认／显式source）、source身份与全部文件哈希冲突、主Skill优先用户区、独立安装、默认只预览、相同内容重复执行、旧版本与索引原文保全、用户补充冲突拒绝、路径越界／重定向、多个Codex主Skill目录歧义拒绝，以及Stable／Beta和未知／冲突资料选择。只有资料路由层被这些用例覆盖，两个实际宿主运行仍为NOT_RUN。

辅助安装强制使用完整解压的GitHub Release插件ZIP或独立AI接入包，包根须包含extension.json、plugin-skill-manifest.json、skills和scripts。默认与--source均核对同一包身份与Skill全文件哈希；公开源码根没有生成的发行清单，不作为简易安装入口。发行构建自动生成清单，普通用户不需要手工生成。

## 交付与验证分层

| 部分／层次 | 本轮范围 | 边界 |
|---|---|---|
| 插件主体 | 运行实现verified-unchanged；完整构建、原SDK类型与双入口回归PASS；版本与公开说明changed | src／SDK／dist与写前基线相同；不代表宿主所有行为已验收 |
| AI Skill＋辅助安装 | changed；行为测试30项＝27PASS／3实际文件符号链接SKIP | 实际junction与模拟reparse检查不能代替跳过的实链接；安装到位、Agent发现、实际读取和答案正确分别检查 |
| 独立人类手册 | changed；保留13章、十方法参数、完整例子、存读档、排障和离线HTML | 四张图片来自2.2.0-beta.1，不是新Beta截图 |
| Stable／Beta路由 | 只读选择目标工程／完整版本／通道／SDK；未知或冲突UNKNOWN | 路由成功的compatibility_validation仍NOT_RUN，不等于双宿主验收 |
| 当前Stable真实宿主 | NOT_RUN；完整版本UNKNOWN | 不将历史1.21／2.0测试当本轮结果 |
| 2.3.0-beta.1真实宿主 | NOT_RUN | 不将SDK静态比较或旧Beta结果当本轮运行PASS |
| 包、HTML和公开下载 | 按最终生成与发布回执分别记录 | 文档生成、GitHub提交、Release上传和匿名下载不能互相替代 |
| 工坊 | 本轮未提交 | 旧2.2.2材料保持，审核状态不写成新发布 |

最终实际目标SDK路由、当前Agent安装预览、包清单及校验值按本轮交付检查记录补充；此文件不提前声称尚未执行的检查通过。公共包不包含本机绝对路径、账号、真实作品、.ai-work、.management或保护库。

## 保留的历史证据与缺口

2.2.1的运行、新装、本地升级与旧存档续抽结果见 `VALIDATION-2.2.1.md`；2.2.2的文档与包检查见 `VALIDATION-2.2.2.md`。303／17／6等历史测试计数保留其原范围，本轮不因文档更新重跑全部旧测试，也不改写为2.3新实测。

Studio2.2.0-beta.1曾确认候选鼠标回填失败，继续按疑似官方Bug披露，临时↑↓＋Enter／完整手填；新Beta未复测，未宣称修复。原工坊两张线上截图的本地原件仍缺，不以教程四图代替。LetsGal内置AI未接入；各外部Agent模型读取沿用原分层状态，本轮没有新增模型端到端验收。

资料依据：[官方更新记录](https://avg-engine.com/changelog)、[官方扩展开发入口](https://docs.avg-engine.com/extensions/develop/)以及实装SDK与本插件真实方法定义。最新在线开发文档标注v2.0，不能把整站说明当作Beta专属规范。外部发布是否完成以本轮GitHub回执和公开验证为准。
