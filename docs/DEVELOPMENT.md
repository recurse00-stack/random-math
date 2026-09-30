# 开发与验收：关联源码长期迭代

## 一个源码根，一个长期验收工程

在Studio中使用关联源码方式接入插件，保留一个专用验收工程及其变量、候选表、函数表和测试存档。日常开发修改同一份源码，构建后由Studio同步。无需每次重新导入插件，也无需为每个功能重建项目。

验收工程使用合成数据，逐步添加回归场景；真实游戏剧情和存档不作为测试夹具。历史验收工程可以保留，但不作为日常默认入口。

## 每次修改后的步骤

1. 修改 src/index.tsx、src/deck.ts 或说明；涉及功能时先备份。
2. 功能修改后执行完整构建与必要测试：`./Test.ps1`。该入口覆盖构建、类型检查、逻辑回归和postbuild双入口检查。
3. 等待Studio同步关联源码。确认加载版本、扩展方法列表和实际构建入口一致；必要时核对dist/index.js的SHA-256。
4. 在同一验收工程中检查创作者参数、玩家流程、错误分支及相关存读档场景。仅在同步状态不正确时进行重载排查。
5. 本次只改文档时核对版本、链接、打包清单和文件同步，无须重复运行未改变的算法测试。

开发使用Node.js 24。首次安装依赖可运行 `npm ci --ignore-scripts`。`npm run build`执行TypeScript编译和postbuild；postbuild使用已有Vite依赖中的esbuild，将本地模块打成单文件ESM，只保留SDK外部导入。当前`npm run watch`仅运行TypeScript监视，不执行postbuild，不能把它当成完整交付构建。运行入口为dist/index.js，兼容入口index.mjs在完整构建后应与其一致。

## 长期保留的回归场景

- 范围随机：整数、小数、端点、批量、非法输入。
- 固定结果：独立记录名、复用、重置、保存后读取及生成前读取。
- 候选分布：普通权重、动态变量、多个固定百分比、零权重、错误报告。
- 文字/数值批量：两种重复规则、逐条变量、JSON、公式输出与后续计算。
- 失败保护：数量不足、类型不符、缺变量时不冒充成功结果。

## 关联源码验收与发行包验收

关联源码用于日常迭代。准备正式发布时，再额外检查独立发行包的安装和更新、公开文件内容及目标导出平台。关联源码已同步不等于发行ZIP已更新，也不表示远端版本已发布。

`scripts/package.py`仅从白名单生成插件包、文档包和SHA256SUMS.txt。发行包不包含本机路径、私有工程、维护记录、测试存档、Git、SDK或node_modules。用户明确要求“先不发布”时，只生成本地文件，不提交GitHub或工坊。

## 2.2回放与兼容边界

runImmediately与普通run分离；skip显式转发run。通过SDK的getHost()只读探测当前宿主的application.scriptingSystem.getActiveSeekPurpose()；只有明确navigation才执行定位计算，archive-restore、snapshot-restore及未知宿主保留恢复状态。该宿主适配集中在isNavigationReplay，升级Studio须重新测试。不要依赖实例字段保存状态，宿主可能每次调用新建实例。

完整Test.ps1包括58项原逻辑、173项既有回归、72项抽取池／数组／生命周期回归，以及类型与双入口构建检查。Node垫片不证明真实宿主数据库接口可用。Studio2.0.0数据接口缺失已在原2.1和本次2.2的Windows导出对照中复现；不得修改SDK或绕开数据绑定去直接读用户工程文件。范围与JSON数组路径独立验证。

## 2.2.3 资料维护

当前使用说明在USER-GUIDE.md，AI正文在AI-GUIDE.md及AI-INTEGRATION.md。先运行 scripts/build-creator-docs.py，生成HTML、工坊正文、Skill references和Skill内只读资料选择器；不要手改派生副本。WORKSHOP-INTRO.md独立维护渠道前言，生成器在完整人类正文前保留它。人类资料与AI包分别交付。

扩展设置新增creatorHelp，仅提供阅读位置，不参与随机算法或存档。检查器通过SDK的suggestions复用已填值；首字过滤由宿主完成，没有私有筛选器、实时表枚举或拼音接口。整条选择链路须依实际宿主证据核实。

scripts/package.py --output-dir <新目录> 和 scripts/build-ai-kit.py <新ZIP> 均拒绝覆盖旧包；正文与Skill副本不一致时拒绝生成。完整包使用dist/index.js，工坊候选清单使用dist/index.mjs，两入口必须同字节。工坊README采用完整人类教程，图片路径以根目录docs/images为准；保持原插件ID，只更新原条目。

2.2.3对照实装SDK2.3.0-beta.1，在隔离目录保留脚手架类型桩后完成现有src的TypeScript无输出检查；自用源码原SDK1.21.0、运行实现及依赖不变。新SDK的withSave／this.method为可选入口，本轮没有采用。静态审计与类型通过不表示新宿主实际运行或调度行为通过。

本轮文档／版本与验证边界见 VALIDATION-2.2.3.md；2.2.1运行证据和2.2.2资料检查保留其原版本，不能改写为本轮实测。辅助安装scripts/install-skill.py默认预览、--apply才写入；当前Agent有主Skill时安装到版本化用户区并补索引，主Skill不存在时才独立安装，公共主Skill包不改。只读scripts/select-host-guidance.py按目标工程、实际Studio完整版本／通道、SDK与样本记录选择Stable或Beta资料；缺失或冲突UNKNOWN，不升级宿主。资料路由与Stable／Beta两个真实宿主分别验收。

打包、安装、Agent实际读取、宿主运行、播放器、存读档、导出、GitHub发布与工坊审核分别记录。2.2.3本轮GitHub获授权，工坊不重新提交，旧2.2.2版本材料不覆盖。辅助安装、AI指南与独立人类手册三部分都随发行核对；原工坊两张线上截图本地原件缺口保留。
