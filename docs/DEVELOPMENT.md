# 3.0开发与验收

源码模块：index.tsx定义六入口／原生设置；expression.ts安全表达式；pool-model.ts纯概率和状态；pool-runtime.ts宿主事务／Choice／旧池接管；host-replay.ts只读回放适配；legacy.ts及deck.ts保留旧契约；pool-inspector.tsx只读报告。状态存档poolStateV3与旧drawDecks/fixedResults并存，但接管后只有一个有效池。

执行Test.ps1：完整构建、类型、旧三组及3.0行为、postbuild、迁移和安装路由测试。Node垫片只测逻辑，React垫片只测结构。postbuild使用既有esbuild打成单ESM，SDK及React运行时外置使用宿主实例；js/mjs同字节。watch只执行tsc，不是完整构建。官方SDK保持随附原文；依赖及锁文件版本不变。

资料流程：构建后`node --import ./_test/register-sdk.mjs scripts/build-parameter-reference.mjs`同步两份指南参数表；`python scripts/build-creator-docs.py`生成人类/安装HTML、工坊介绍和Skill引用；不要手改派生文件。更新WORKSHOP-INTRO维护工坊独立简介。package.py --output-dir与build-ai-kit.py只向全新输出创建，禁止覆盖旧包。

迁移工具scripts/migrate-project.py默认只读preview，apply/restore强制原文校验、外部全新备份和路径保护。实例与测试只用合成工程；完整覆盖和局限见MIGRATION-3.0。普通异常回滚不等于断电安全事务。

当前主要宿主目标为2.4.0-beta.2；开发SDK与该宿主随附29文件一致（自报2.4.0-beta.2），清单最低要求>=1.21.0不变。资料路由、SDK类型、真实UI、播放器、存读档、导出、安装与模型读取分别验收。当前运行文件的高级反馈表单实测、此前69a16d运行文件的完整Studio／Windows案例、其他历史版本分别列于VALIDATION-3.0.md；原鼠标候选回填未证明修复。

## SDK同步与完整源码构建

sdk/保留Studio官方同步内容，不手工补文件或把旧SDK倒回。当前随附index.ts引用未随附的extension-inspector；src/sdk-inspector-compat.d.ts仅为本插件未使用的两个导出提供never类型兜底，没有运行代码，也不提供可用检查器API。未来官方补齐文件时，真实声明优先；若要新增使用该API，必须以官方真实签名和宿主实测为依据。

Test.ps1包含6组SDK声明兼容回归；类型兜底不会屏蔽其他缺失模块，也不会放宽真实声明。SDK同步后先执行类型检查与完整构建，再核对运行产物；watch仅tsc，不能替代完整构建。源包包含这份项目声明、测试、完整官方SDK及构建配置。运行包继续由宿主提供SDK/React单实例，不把本地SDK打进程序。

宣传页使用scripts/build-promo-preview.py从README和WORKSHOP生成内嵌图片HTML。说明与图片不改变游戏运行逻辑。
