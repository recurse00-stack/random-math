# 抽选与数学增强 3.0.0 · AI 使用指南

修订2026-10-03（sdk.1）。这是插件 Skill 的按需参考资料；AI知识入口是插件Skill根的 SKILL.md；本文位于其references/时向上一层查找。人工安装说明见同目录AI-INTEGRATION.md。插件ID `mixing-entropy.random-math`，模块ID `random-math`。创作者操作手册见USER-GUIDE。随机数不限六面：单个或批量操作设置min=1、max=N、digits=0并包含端点，即可生成1～N的整数；具体字段使用对应操作前缀。

## 1. 目标工程与资料路由

核对工程实际启用版本、Studio完整版本及通道、SDK、有效章节／变量／Choice绑定样本。先确定实际插件Skill根。安装后的路由命令从Skill根运行 `python scripts/select-host-guidance.py --help`，随后按实际证据传参；完整解压发行包也在包根提供同名工具。缺失标UNKNOWN；只读取所选Stable或Beta资料。不猜最新版、不自行升级宿主。

主要目标Studio 2.4.0-beta.2。开发SDK与目标Studio2.4.0-beta.2随附29文件一致；项目侧声明仅处理未随附且本插件未使用的导出，不提供新宿主能力。依赖版本保持。构建、类型检查、逻辑垫片不证明真实运行；各完整宿主版本及运行文件的证据分别记录，目标工程应核对对应验证范围。历史截图按原版本标注。历史鼠标回填仍疑似宿主问题，方向键＋Enter或完整手填后核对值，不能宣称已修复。

## 2. 六入口与配置

编辑界面的showAdvancedFeedback是纯显示开关，默认false。四项公共reportVar/statusVar/successVar/errorVar仅在展开时显示，但不论开关缺失、false还是true，已有输出绑定都照常执行；不能把收起当成停用输出，也不要在迁移时清空绑定。运行算法及结果契约不变。

|入口ID|用途|边界|
|---|---|---|
|rand|随机数／清除固定记录|旧number返回保留；完整参数generate、简洁操作single-fresh/batch-fresh/single-fixed/batch-fixed、清除reset|
|draw-replace|放回抽取|指定持久池，不减少候选|
|draw-without|不放回抽取|action=draw/batch/confirm/cancel|
|pool-update|调整抽取池|初始化、导入、增删改、批量、读取、重置删除|
|player-choice|玩家选项|等待官方Choice，不快进代选|
|calc|算术、表达式、表函数|保留旧返回和默认行为|

四个新增动作无returns，不放入If候选；rand/calc保留旧If契约。作者检查在只读面板，剧情读取状态用pool-update/inspect。

rand缺省action及generate继续读取原字段，默认不变，保证旧If和动态绑定不被切换模式。新编排选择简洁操作，参数使用`操作__字段`，例如`single-fresh__min`、`single-fresh__outVar`；successVar/errorVar仍共享。单个操作固定count=1，批量操作默认count=2；只读取所选操作的专属输入，忽略其他操作保留的隐藏值。固定操作沿用原fixedResults、固定记录名与adopt语义；reset使用resetKey，不清空输出。将既有调用改成简洁操作必须映射参数，不能只修改action。

原生设置数组：pools、candidates、adjustments。池字段id/name/kind(with或without)/valueType(text或number)/probability(weight或percent)/quantityWeight(candidate或unit)/random(fixed或fresh)。候选字段poolId/id/label/value/rate/quantity/enabled/condition/data。稳定ID区别显示名；同文字不同ID允许。调整目录同batchId按行顺序，op、candidateId或candidateIdVar、amount、when及内容字段。

首次有效使用自动初始化；读取或条件false不初始化。作者配置、运行状态、旧数据库互不回写，耗尽不补满。reset按当前配置重建，有占用拒绝。配置改名不改稳定ID。

### 计算增强

calc保持旧op和number返回契约；新增op为expr/ceil/trunc/round-digits/abs/remainder/mod/min/max/clamp。新字段只读取当前op对应的`op__字段`，可填有限数值或安全变量公式。expr__expression直接求值，无需函数规则表；单值操作用__value，双值用__a/__b，round-digits另有__digits，clamp另有__min/__max。精确字段见参数表。

示例意图：`{"op":"expr","expr__expression":"var(\"攻击\") * 0.8 + 10","outVar":"damage","successVar":"ok","errorVar":"error"}`。变量必须是有限数值，不能把文本或布尔隐式转为数值；先声明，再按宿主实际绑定格式编排。直接公式不接受裸x/y/z/w、不调用旧表函数。支持原内置函数和ceil/trunc/abs/roundDigits/remainder/mod；旧表的同名自定义函数不受新增名称影响。池表达式没有新增这些函数，需要时先calc输出再引用。

round-digits与roundDigits的位数为0～6整数，按十进制表示舍入，半值远离零，1.005→1.01、-1.005→-1.01；安全精度溢出报错。旧round仍为Math.round规则，-1.5→-1。remainder(-7,4)=-3；mod(-7,4)=1且模数必须正数。clamp下限不得大于上限。失败返回-1且保留旧输出；合法结果也可为-1，必须看successVar/errorVar，不能只比较返回值。直接计算不推进池随机状态。

## 3. 概率、条件与事务

权重／基础百分比分离，percent合计100且不带%后缀。排除停用、条件false、无可用份数后归一化；按unit额外乘可用份数。10份A/1份B、等权重时candidate=50/50，unit=10/11和1/11。20/30/50排除第三项后40/60。空签显式配置，无隐式未中奖。

set-percent指定部分值，其余按原比例分配。set-rate/add-rate仅weight；set-quantity/add-quantity仅without，不能负数或小于占用。数值支持安全表达式和var("变量名")；新池不直接支持自定义表函数名，先用calc求值再引用变量。条件仅一个布尔变量名，复杂世界规则由外部先算布尔。缺失／错误类型明确报错。

候选rate和set-rate的amount可保留`var("好感度")`或`var("好感度") + 10`，在每个抽取动作开始读取当前数值变量；已初始化池同样生效，单次批量使用同一快照。add-rate按执行时求值并保存固定数值，set-percent及其比例重分配同样保存固定数值。不要把一次调整描述为持续绑定；需要持续加成使用set-rate表达式。候选基础百分比表达式每次求值后仍须合计100。变量缺失、类型错误或负权重必须报错；零权重不参与随机抽取。实际概率还受条件、启停、余量及份数计权影响。

批量在副本校验，全部成功提交；输出变量预先声明、类型匹配、不能别名冲突。一个批量使用同次变量快照。调整组1～100项、一个目标池；全部when=false跳过不建池。candidateIdVar填变量名，取出的值必须文本候选ID。

immediate立即消耗；deferred先占用再凭证确认／取消。相同方向重复处理幂等，不能确认后取消。取消释放占用但不回退随机。remaining包括reserved，available=remaining-reserved。占用候选不能删除，池不能重置删除。

fixed保存种子与进度，只保证建池后的同状态、条件和操作；调整候选或概率可以改变结果。建池前不保证固定；各存档独立；fresh用新随机值但不保证结果一定不同。

抽空或没有合格选项时，statusVar为empty、successVar为false、errorVar提供非空原因；完整报告保留EMPTY_POOL。抽取失败不消耗、不改写已有结果数组／单项结果。旧调用接管新池后也保留这一失败保护，旧reportVar仍是结果数组，不得当成新版完整诊断报告。先判断状态再消费输出，错误中文用于说明，不作为稳定机器标识。

## 4. 玩家选项与回放

使用internal.system.choice和项目原Choice绑定，originalIndex映射稳定候选ID。展示enabled且条件满足、有可用份数的候选，各一个按钮；**权重零也可主动选择**。无选项返回empty，不恢复条件排除项。

展示前保存pending，选择时再次验证条件和份数；过期选择不扣除、不输出成功。关闭未选skipped；运行取消保留pending供恢复。重复回调受保护，已完成runImmediately不再次扣除。rc.5在2.4.0-beta.2实测条件失效后拒绝、同请求重开双击仅扣一份、调度回退再前进无重复扣除、等待时退出调试清理UI。展示中SL及其他字节／平台的证据单列于VALIDATION-3.0，不能由这些用例推断所有自定义主题或取消组合。

输出后接剧情分支和pool-update，不内置任意变量修改或片段调用。同池多个待选点用不同requestKey。

Choice显示跟随项目绑定；检查面板可只读显示宿主返回的绑定。长列表裁切需按人类资料CHOICE-UI-COMPATIBILITY.md调整项目副本；不得修改宿主安装文件、全局注入CSS或自动抢占插槽。fresh重新取随机值仍可碰巧同结果；固定进度不保证建池前读档或内容／条件改变后的相同结果。

## 5. 输出和世界状态边界

schemaVersion=1；status=ok/skipped/empty/error；poolId；items[{id,label,value,quantity,data?}]；receiptId；remaining/reserved/available；errorCode/message；检查时details。放回池remaining/available=null。successVar在ok或skipped为true；抽取／选择后先检查status=ok再消费结果；若解析完整报告，再要求items非空。初始化、读取或调整可成功且items为空。

单项变量数量1时写；批量使用valuesVar/idsVar文本JSON，prefix可选。失败旧结果可能保留，必须先查状态。数组不是直接调用片段的指令。未来世界状态通过布尔条件、数值输入、稳定ID与版本化JSON输出协作；data只透传，不执行，不假造复杂世界状态接口。

## 6. 参数意图（不是可直接导入的章节）

放回：`{"poolId":"weather","count":1,"outVar":"result","idVar":"candidate","statusVar":"status"}`。

延后消耗：`{"action":"draw","draw__poolId":"bag","draw__count":1,"draw__consumption":"deferred","draw__receiptVar":"receipt","statusVar":"status"}`。确认用action=confirm，confirm__receiptId绑定receipt的值。

调整：`{"action":"add-rate","poolId":"reward","add-rate__candidateId":"a","add-rate__amount":"2","when":"event_completed"}`。动态候选ID必须按当前宿主真实绑定格式，不能将变量名作为候选字面值。

玩家选项poolId=events、requestKey=day1-events、idVar=candidate；之后以candidate分支，完成事件后调整池。五个完整人类案例见USER-GUIDE，配套参数数据见同目录examples-v3.json（完整包位于docs/，安装后的Skill位于references/）。所有示例是字段意图，不能直接作为章节节点导入。

## 7. 升级与兼容

八个旧方法隐藏仍注册：deck-create/deck-draw/deck-peek/deck-reset/reset-fixed/rand-pick/rand-pick-number/preview-pool；showLegacyMethods默认false只控制新建列表。完整旧参数另存LEGACY-2.2.3-AI-GUIDE.md，不能用历史规则覆盖新池。

离线工具在完整解压发行包根的scripts/migrate-project.py；安装后的Skill只包含只读路由脚本，不安装迁移器到用户知识区。从包根执行：preview读取指定project/variables/extensions和chapters；apply核对原文并生成工程外全新备份；restore拒绝覆盖转换后的新编辑。不扫描或修改saves，不运行时改工程。

当前自动映射普通固定记录清除、持久取出、仅余量读取、删除及calc字段；If、动态控制值、未知输出声明、旧报告格式、旧建池重复错误／固定顺序、旧表来源与特殊概率保留隐藏兼容。当前旧表放回及旧表同批不重复不自动转换，继续兼容执行，不把临时不重复变成持久池。不宣称全部无损迁移。保留节点ID、绑定对象和未知字段；用户选择真实目标后仍先预览。

drawDecks/fixedResults旧字段保留。接管后旧调用与新调用读取同一有效状态；剩余项目、drawn、固定顺序保持；已耗候选历史UNKNOWN，不补满。主动调整已接管旧固定池后转为新版剩余抽取。新存档不保证降级，回退用升级前备份。详见MIGRATION-3.0。

## 8. 实际方法参数

<!-- PARAMETERS-BEGIN -->
### 随机数：rand

选择单个／批量及重抽／固定；完整参数保留既有调用。也可清除指定固定记录。

返回：number，单次结果／批量数量；清除成功1、失败-1。

|字段|填写含义|类型|默认|选项|显示条件|
|---|---|---|---|---|---|
|action|执行什么|enum|"generate"|single-fresh：单个随机数 · 每次重抽；batch-fresh：批量随机数 · 每次重抽；single-fixed：单个随机数 · 首次抽取后固定；batch-fixed：批量随机数 · 首次抽取后固定；generate：完整参数（兼容既有调用）；reset：清除指定固定记录|始终|
|mode|模式|enum，必填|"fresh"|fresh：每次重抽；sticky：首次抽取后固定（随存档）|action = "generate"|
|min|最小值|number，必填|0||action = "generate"|
|max|最大值|number，必填|100||action = "generate"|
|digits|小数位数（0=整数）|number|0||action = "generate"|
|includeMin|包含最小端点|boolean|true||action = "generate"|
|includeMax|包含最大端点|boolean|true||action = "generate"|
|count|数量（大于1批量输出）|number|1||action = "generate"|
|outVar|单次结果变量|variable|—||action = "generate"|
|prefix|批量前缀（数量大于1时使用）|string|""||action = "generate"|
|reportVar|完整结果数组（JSON文本，可空）|variable|—||action = "generate"|
|fixedKey|固定记录名（空=结果变量或批量前缀）|string|""||action = "generate"|
|fixedPolicy|旧存档首次接入|enum|"fresh"|fresh：首次生成，忽略输出默认值；adopt：采用完整的既有结果|action = "generate"|
|successVar|成功状态写入（布尔，可空）|variable|—||始终|
|errorVar|错误说明写入（文本，可空）|variable|—||始终|
|single-fresh__min|最小值|number，必填|0||action = "single-fresh"|
|single-fresh__max|最大值|number，必填|100||action = "single-fresh"|
|single-fresh__digits|小数位数（0=整数）|number|0||action = "single-fresh"|
|single-fresh__includeMin|包含最小端点|boolean|true||action = "single-fresh"|
|single-fresh__includeMax|包含最大端点|boolean|true||action = "single-fresh"|
|single-fresh__outVar|单次结果变量|variable|—||action = "single-fresh"|
|single-fresh__reportVar|完整结果数组（JSON文本，可空）|variable|—||action = "single-fresh"|
|batch-fresh__min|最小值|number，必填|0||action = "batch-fresh"|
|batch-fresh__max|最大值|number，必填|100||action = "batch-fresh"|
|batch-fresh__digits|小数位数（0=整数）|number|0||action = "batch-fresh"|
|batch-fresh__includeMin|包含最小端点|boolean|true||action = "batch-fresh"|
|batch-fresh__includeMax|包含最大端点|boolean|true||action = "batch-fresh"|
|batch-fresh__count|批量数量|number|2||action = "batch-fresh"|
|batch-fresh__prefix|批量前缀（数量大于1时使用）|string|""||action = "batch-fresh"|
|batch-fresh__reportVar|完整结果数组（JSON文本，可空）|variable|—||action = "batch-fresh"|
|single-fixed__min|最小值|number，必填|0||action = "single-fixed"|
|single-fixed__max|最大值|number，必填|100||action = "single-fixed"|
|single-fixed__digits|小数位数（0=整数）|number|0||action = "single-fixed"|
|single-fixed__includeMin|包含最小端点|boolean|true||action = "single-fixed"|
|single-fixed__includeMax|包含最大端点|boolean|true||action = "single-fixed"|
|single-fixed__outVar|单次结果变量|variable|—||action = "single-fixed"|
|single-fixed__reportVar|完整结果数组（JSON文本，可空）|variable|—||action = "single-fixed"|
|single-fixed__fixedKey|固定记录名（空=结果变量或批量前缀）|string|""||action = "single-fixed"|
|single-fixed__fixedPolicy|旧存档首次接入|enum|"fresh"|fresh：首次生成，忽略输出默认值；adopt：采用完整的既有结果|action = "single-fixed"|
|batch-fixed__min|最小值|number，必填|0||action = "batch-fixed"|
|batch-fixed__max|最大值|number，必填|100||action = "batch-fixed"|
|batch-fixed__digits|小数位数（0=整数）|number|0||action = "batch-fixed"|
|batch-fixed__includeMin|包含最小端点|boolean|true||action = "batch-fixed"|
|batch-fixed__includeMax|包含最大端点|boolean|true||action = "batch-fixed"|
|batch-fixed__count|批量数量|number|2||action = "batch-fixed"|
|batch-fixed__prefix|批量前缀（数量大于1时使用）|string|""||action = "batch-fixed"|
|batch-fixed__reportVar|完整结果数组（JSON文本，可空）|variable|—||action = "batch-fixed"|
|batch-fixed__fixedKey|固定记录名（空=结果变量或批量前缀）|string|""||action = "batch-fixed"|
|batch-fixed__fixedPolicy|旧存档首次接入|enum|"fresh"|fresh：首次生成，忽略输出默认值；adopt：采用完整的既有结果|action = "batch-fixed"|
|resetKey|要清除的固定记录名|string|""||action = "reset"|

### 放回抽取：draw-replace

从指定放回池抽取，候选不会因抽取而减少。

返回：剧情动作；通过变量输出，不作为If条件候选。

|字段|填写含义|类型|默认|选项|显示条件|
|---|---|---|---|---|---|
|poolId|目标池ID（见扩展设置的池目录）|string，必填|—||始终|
|count|抽取数量|number|1||始终|
|outVar|单项结果（与池结果类型一致，可空）|variable|—||始终|
|idVar|单项候选ID（文本，可空）|variable|—||始终|
|valuesVar|结果数组JSON（文本，可空）|variable|—||始终|
|idsVar|候选ID数组JSON（文本，可空）|variable|—||始终|
|prefix|逐项输出前缀（可空，预先声明 前缀_1…N）|string|""||始终|
|showAdvancedFeedback|高级设置：执行反馈（可选）|boolean|false||始终|
|reportVar|完整报告（文本，可空）|variable|—||showAdvancedFeedback = true|
|statusVar|结果状态 ok/skipped/empty/error（文本，可空）|variable|—||showAdvancedFeedback = true|
|successVar|成功状态（布尔，可空）|variable|—||showAdvancedFeedback = true|
|errorVar|错误说明（文本，可空）|variable|—||showAdvancedFeedback = true|

### 不放回抽取：draw-without

抽取并消耗或占用份数；也可确认消耗、取消占用。

返回：剧情动作；通过变量输出，不作为If条件候选。

|字段|填写含义|类型|默认|选项|显示条件|
|---|---|---|---|---|---|
|action|执行什么|enum|"draw"|draw：从池中抽取；batch：仅本次批量不放回（JSON数组）；confirm：确认消耗；cancel：取消占用|始终|
|draw__poolId|目标池ID（见扩展设置的池目录）|string，必填|—||action = "draw"|
|draw__count|抽取数量|number|1||action = "draw"|
|draw__outVar|单项结果（与池结果类型一致，可空）|variable|—||action = "draw"|
|draw__idVar|单项候选ID（文本，可空）|variable|—||action = "draw"|
|draw__valuesVar|结果数组JSON（文本，可空）|variable|—||action = "draw"|
|draw__idsVar|候选ID数组JSON（文本，可空）|variable|—||action = "draw"|
|draw__prefix|逐项输出前缀（可空，预先声明 前缀_1…N）|string|""||action = "draw"|
|draw__receiptVar|占用凭证（文本，延后消耗时填写）|variable|—||action = "draw"|
|draw__remainingVar|剩余份数（数值，可空）|variable|—||action = "draw"|
|draw__availableVar|可用份数（数值，可空）|variable|—||action = "draw"|
|draw__consumption|消耗时机|enum|"immediate"|immediate：立即消耗；deferred：先占用，完成后确认|action = "draw"|
|batch__poolId|本次操作名称|string，必填|—||action = "batch"|
|batch__arrayJson|JSON数组|string|"[]"||action = "batch"|
|batch__valueType|结果类型|enum|"text"|text：文字；number：数值或公式|action = "batch"|
|batch__count|抽取数量|number|1||action = "batch"|
|batch__outVar|单项结果（与池结果类型一致，可空）|variable|—||action = "batch"|
|batch__idVar|单项候选ID（文本，可空）|variable|—||action = "batch"|
|batch__valuesVar|结果数组JSON（文本，可空）|variable|—||action = "batch"|
|batch__idsVar|候选ID数组JSON（文本，可空）|variable|—||action = "batch"|
|batch__prefix|逐项输出前缀（可空，预先声明 前缀_1…N）|string|""||action = "batch"|
|batch__remainingVar|剩余份数（数值，可空）|variable|—||action = "batch"|
|batch__availableVar|可用份数（数值，可空）|variable|—||action = "batch"|
|confirm__receiptId|抽取凭证|string|""||action = "confirm"|
|confirm__outVar|单项结果（与池结果类型一致，可空）|variable|—||action = "confirm"|
|confirm__idVar|单项候选ID（文本，可空）|variable|—||action = "confirm"|
|confirm__valuesVar|结果数组JSON（文本，可空）|variable|—||action = "confirm"|
|confirm__idsVar|候选ID数组JSON（文本，可空）|variable|—||action = "confirm"|
|confirm__prefix|逐项输出前缀（可空，预先声明 前缀_1…N）|string|""||action = "confirm"|
|confirm__receiptVar|占用凭证（文本，延后消耗时填写）|variable|—||action = "confirm"|
|confirm__remainingVar|剩余份数（数值，可空）|variable|—||action = "confirm"|
|confirm__availableVar|可用份数（数值，可空）|variable|—||action = "confirm"|
|cancel__receiptId|抽取凭证|string|""||action = "cancel"|
|cancel__outVar|单项结果（与池结果类型一致，可空）|variable|—||action = "cancel"|
|cancel__idVar|单项候选ID（文本，可空）|variable|—||action = "cancel"|
|cancel__valuesVar|结果数组JSON（文本，可空）|variable|—||action = "cancel"|
|cancel__idsVar|候选ID数组JSON（文本，可空）|variable|—||action = "cancel"|
|cancel__prefix|逐项输出前缀（可空，预先声明 前缀_1…N）|string|""||action = "cancel"|
|cancel__receiptVar|占用凭证（文本，延后消耗时填写）|variable|—||action = "cancel"|
|cancel__remainingVar|剩余份数（数值，可空）|variable|—||action = "cancel"|
|cancel__availableVar|可用份数（数值，可空）|variable|—||action = "cancel"|
|showAdvancedFeedback|高级设置：执行反馈（可选）|boolean|false||始终|
|reportVar|完整报告（文本，可空）|variable|—||showAdvancedFeedback = true|
|statusVar|结果状态 ok/skipped/empty/error（文本，可空）|variable|—||showAdvancedFeedback = true|
|successVar|成功状态（布尔，可空）|variable|—||showAdvancedFeedback = true|
|errorVar|错误说明（文本，可空）|variable|—||showAdvancedFeedback = true|

### 调整抽取池：pool-update

剧情运行时调整指定池，或读取状态。批量调整全部成功后才提交。

返回：剧情动作；通过变量输出，不作为If条件候选。

|字段|填写含义|类型|默认|选项|显示条件|
|---|---|---|---|---|---|
|action|执行什么|enum|"inspect"|initialize：从配置初始化池（已存在时保留）；import-array：从JSON数组初始化（已存在时保留）；import-table：从旧候选表初始化快照（已存在时保留）；reset：重置为当前创作配置；delete：删除池；add：新增候选；remove：移除候选；enable：启用候选；disable：停用候选；set-rate：设置权重；add-rate：增减权重；set-percent：设置基础百分比（其他候选按比例分配）；set-quantity：设置剩余份数；add-quantity：增减剩余份数；set-condition：修改参与条件；set-content：修改显示和结果内容；batch-adjust：执行一组批量调整；inspect：读取状态和概率报告|始终|
|poolId|目标池ID（见扩展设置的池目录）|string，必填|—||始终|
|when|仅当此布尔变量为真时执行（可空）|variable|—||始终|
|import-array__arrayJson|JSON数组|string|"[]"||action = "import-array"|
|import-array__kind|导入池类型|enum|"without"|with：放回；without：不放回|action = "import-array"|
|import-array__valueType|导入结果类型|enum|"text"|text：文字；number：数值或公式|action = "import-array"|
|import-array__random|导入随机策略|enum|"fixed"|fixed：同一进度固定；fresh：允许读档重抽|action = "import-array"|
|import-table__tablePool|旧表池名|string|""||action = "import-table"|
|import-table__field|结果列|string|"label"||action = "import-table"|
|import-table__kind|导入池类型|enum|"without"|with：放回；without：不放回|action = "import-table"|
|import-table__valueType|导入结果类型|enum|"text"|text：文字；number：数值或公式|action = "import-table"|
|import-table__random|导入随机策略|enum|"fixed"|fixed：同一进度固定；fresh：允许读档重抽|action = "import-table"|
|add__candidateId|目标候选ID|string|""||action = "add"|
|add__label|显示文字|string|""||action = "add"|
|add__value|结果内容（数值池可填公式）|string|""||action = "add"|
|add__rate|权重／基础百分比（可填 var("好感度")）|string|"1"||action = "add"|
|add__quantity|初始份数（不放回池）|number|1||action = "add"|
|add__condition|参与条件的布尔变量名（空=始终）|string|""||action = "add"|
|add__data|附加JSON数据（可空）|string|""||action = "add"|
|remove__candidateId|目标候选ID|string|""||action = "remove"|
|enable__candidateId|目标候选ID|string|""||action = "enable"|
|disable__candidateId|目标候选ID|string|""||action = "disable"|
|set-rate__candidateId|目标候选ID|string|""||action = "set-rate"|
|set-rate__amount|数值／变量表达式（如 var("好感度")）|string|"0"||action = "set-rate"|
|add-rate__candidateId|目标候选ID|string|""||action = "add-rate"|
|add-rate__amount|数值／变量表达式（如 var("好感度")）|string|"0"||action = "add-rate"|
|set-percent__candidateId|目标候选ID|string|""||action = "set-percent"|
|set-percent__amount|数值／变量表达式（如 var("好感度")）|string|"0"||action = "set-percent"|
|set-quantity__candidateId|目标候选ID|string|""||action = "set-quantity"|
|set-quantity__amount|数值／变量表达式（如 var("好感度")）|string|"0"||action = "set-quantity"|
|add-quantity__candidateId|目标候选ID|string|""||action = "add-quantity"|
|add-quantity__amount|数值／变量表达式（如 var("好感度")）|string|"0"||action = "add-quantity"|
|set-condition__candidateId|目标候选ID|string|""||action = "set-condition"|
|set-condition__condition|布尔变量名（空=始终）|string|""||action = "set-condition"|
|set-content__candidateId|目标候选ID|string|""||action = "set-content"|
|set-content__label|显示文字|string|""||action = "set-content"|
|set-content__value|结果内容|string|""||action = "set-content"|
|batch-adjust__batchId|批量调整组ID|string|""||action = "batch-adjust"|
|inspect__remainingVar|剩余份数（数值，可空）|variable|—||action = "inspect"|
|inspect__availableVar|可用份数（数值，可空）|variable|—||action = "inspect"|
|showAdvancedFeedback|高级设置：执行反馈（可选）|boolean|false||始终|
|reportVar|完整报告（文本，可空）|variable|—||showAdvancedFeedback = true|
|statusVar|结果状态 ok/skipped/empty/error（文本，可空）|variable|—||showAdvancedFeedback = true|
|successVar|成功状态（布尔，可空）|variable|—||showAdvancedFeedback = true|
|errorVar|错误说明（文本，可空）|variable|—||showAdvancedFeedback = true|

### 玩家选项：player-choice

展示合格候选，等待玩家选择；输出结果接续后面的剧情。

返回：剧情动作；通过变量输出，不作为If条件候选。

|字段|填写含义|类型|默认|选项|显示条件|
|---|---|---|---|---|---|
|poolId|目标池ID（见扩展设置的池目录）|string，必填|—||始终|
|requestKey|选项请求名（空=池ID；同池多个待选点请分别命名）|string|""||始终|
|consumption|消耗时机|enum|"immediate"|immediate：立即消耗；deferred：先占用，完成后确认|始终|
|outVar|单项结果（与池结果类型一致，可空）|variable|—||始终|
|idVar|单项候选ID（文本，可空）|variable|—||始终|
|valuesVar|结果数组JSON（文本，可空）|variable|—||始终|
|idsVar|候选ID数组JSON（文本，可空）|variable|—||始终|
|prefix|逐项输出前缀（可空，预先声明 前缀_1…N）|string|""||始终|
|receiptVar|占用凭证（文本，延后消耗时填写）|variable|—||始终|
|remainingVar|剩余份数（数值，可空）|variable|—||始终|
|availableVar|可用份数（数值，可空）|variable|—||始终|
|showAdvancedFeedback|高级设置：执行反馈（可选）|boolean|false||始终|
|reportVar|完整报告（文本，可空）|variable|—||showAdvancedFeedback = true|
|statusVar|结果状态 ok/skipped/empty/error（文本，可空）|variable|—||showAdvancedFeedback = true|
|successVar|成功状态（布尔，可空）|variable|—||showAdvancedFeedback = true|
|errorVar|错误说明（文本，可空）|variable|—||showAdvancedFeedback = true|

### 计算：calc

基础运算、直接公式、取整精度、余数及范围限制。输入支持数值变量；失败保留结果。

返回：number，计算结果；失败-1，配合成功状态。

|字段|填写含义|类型|默认|选项|显示条件|
|---|---|---|---|---|---|
|op|运算|enum，必填|"add"|add：加 +；sub：减 −；mul：乘 ×；div：除 ÷；pow：幂；root：开方；floor：向下取整；round：四舍五入；func：自定义函数；expr：直接公式；ceil：向上取整；trunc：去掉小数（向零取整）；round-digits：四舍五入到指定小数位；abs：绝对值；remainder：求余数（保留被除数符号）；mod：循环取模（非负结果）；min：取较小值；max：取较大值；clamp：限制在指定范围|始终|
|a|a（基础运算）|number|0||op = "add"|
|b|b（双目运算）|number|1||op = "add"|
|funcName|函数名|string|""||op = "func"|
|x|x|number|0||op = "func"|
|y|y|number|0||op = "func"|
|z|z|number|0||op = "func"|
|w|w|number|0||op = "func"|
|outVar|结果变量（可空，仅返回）|variable|—||始终|
|successVar|成功状态写入（布尔，可空）|variable|—||始终|
|errorVar|错误说明写入（文本，可空）|variable|—||始终|
|subA|a|number|—||op = "sub"|
|subB|b|number|—||op = "sub"|
|mulA|a|number|—||op = "mul"|
|mulB|b|number|—||op = "mul"|
|divA|a|number|—||op = "div"|
|divB|b|number|—||op = "div"|
|powA|a|number|—||op = "pow"|
|powB|b|number|—||op = "pow"|
|rootA|a|number|—||op = "root"|
|floorA|a|number|—||op = "floor"|
|roundA|a|number|—||op = "round"|
|expr__expression|公式（如 var("攻击") * 0.8 + 10）|string，必填|"0"||op = "expr"|
|ceil__value|数值／变量公式|string，必填|"0"||op = "ceil"|
|trunc__value|数值／变量公式|string，必填|"0"||op = "trunc"|
|abs__value|数值／变量公式|string，必填|"0"||op = "abs"|
|round-digits__value|数值／变量公式|string，必填|"0"||op = "round-digits"|
|clamp__value|数值／变量公式|string，必填|"0"||op = "clamp"|
|round-digits__digits|保留小数位数（0～6，可填变量公式）|string，必填|"2"||op = "round-digits"|
|remainder__a|被除数／变量公式|string，必填|"0"||op = "remainder"|
|remainder__b|非零除数／变量公式|string，必填|"1"||op = "remainder"|
|mod__a|被除数／变量公式|string，必填|"0"||op = "mod"|
|mod__b|正模数／变量公式|string，必填|"1"||op = "mod"|
|min__a|第一个数／变量公式|string，必填|"0"||op = "min"|
|min__b|第二个数／变量公式|string，必填|"1"||op = "min"|
|max__a|第一个数／变量公式|string，必填|"0"||op = "max"|
|max__b|第二个数／变量公式|string，必填|"1"||op = "max"|
|clamp__min|下限／变量公式|string，必填|"0"||op = "clamp"|
|clamp__max|上限／变量公式|string，必填|"100"||op = "clamp"|
<!-- PARAMETERS-END -->

## 9. 交付与证据

分别报告代码、自动化、真实Beta、真实Stable、候选完整性、外部发布；主体、AI Skill＋辅助安装、人类手册分别标注changed/verified-unchanged/missing。路由不是双宿主实测，安装不等于模型读取。当前验收以VALIDATION-3.0为准。SL从对应章节读档后直接推进；切换章节或运行检查器引发的预览重建不能当作同一存档状态。

来源：随包真实方法、原SDK、官方method/settings-schema/system-slots及目标工程样本。

## rc.4 接续修复

关闭后的Choice回调不再有效；重新展示同名请求有独立requestId，旧存档缺少该字段仍可恢复。新旧混用时旧单次取出继续忽略批量前缀。已有占用时重复初始化保留原池，重置／删除仍拒绝。检查面板指出候选引用不存在的池。configVersion是初始化定义指纹，configSource是来源；旧存档缺失时UNKNOWN，不由当前作者配置补造。sdkVersion声明最低要求>=1.21.0；当前编译SDK为2.4.0-beta.2，实际最低宿主未核定，Stable仍未验。
