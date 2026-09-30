# 随机与计算系统 2.2.3 · AI 使用指南

适用扩展：`mixing-entropy.random-math`，插件版本2.2.3。文档修订：2026-09-30。运行代码仍沿用 2.2.1；2.3.0-beta.1 本轮完成 SDK 静态审计与隔离类型检查，未完成本插件实机兼容验收。

本文件供协助创作者编排 LetsGal 剧本的 AI 阅读，不是插件源码维护记录。人类教程另见 `USER-GUIDE.md` 或离线 `creator-guide.html`。将本文件提供给 AI，或由有文件访问能力的工具读取；文件随包提供不代表 Studio 的 AI 助手必然会自动加载它。

推荐安装步骤见 [AI 接入说明](AI-INTEGRATION.md)：已安装 [GitHub 版 letsgal-authoring 主 Skill](https://github.com/recurse00-stack/letsgal-authoring-kit/releases) 时，优先放入其按插件 ID/版本分开的统一用户区；没有时，独立安装 letsgal-plugin-random-math 到所用 AI 的技能目录。项目规则和上传指南保留为备用。主 Skill 从 GitHub 核心包按随附说明安装，不以工坊安装为前提。安装 LetsGal 插件本体不等于安装主 Skill，也不等于安装或加载了这份插件 Skill；本版不接入 LetsGal 内置文档助手。

## 1. 使用前核对

1. 核对项目实际启用的扩展 ID 与版本，再读取当前宿主提供的方法及参数。本文以 2.2.3 参数为准，与 2.2.1 相同；本轮更新资料、辅助安装和 Stable／Beta 路由，没有改写运行算法。抽取池和数组功能在2.2.0已经提供；2.2.1主要补充候选提示、手册与AI资料，不要把这些运行功能误写成新版本首次新增。其他旧版本仍须核对其实际方法。
2. 先理解用户需要的是一次判定、同批去重、跨调用抽取消费、动态事件资格，还是计算。不要把它们合并成同一种“随机”。
3. 确认项目现有变量的名字、类型、作用域与保存范围；只补缺少的变量，不覆盖同名变量和已有存档。输出变量必须存在且类型正确，同一调用的输出名称不能冲突。
4. 使用宿主公开的编辑/调用接口。需要写剧本文件时，先读取该版本剧本格式及一个实际可工作的“调用扩展方法”块，保留原节点身份。下文的参数对象是语义示例，不是可以直接导入的完整剧本 JSON。
5. 变量选择参数应按当前宿主的变量引用格式填写。不要把本文的示例名称直接冒充内部 UUID；也不要把结果值填到变量选择位置。
6. 表功能需要数据库依赖绑定。仅看到数据表或方法选项，不等于预览与导出运行接口已通过。
7. 按目标工程、实际 Studio 完整版本／通道、相关 SDK 与有效样本选择一套资料。主 Skill 已存在时读取版本化用户区；没有时才使用独立插件 Skill。未知或矛盾记录 `UNKNOWN`，不沿用上个项目的 Beta 结论，不升级引擎、替换 SDK 或写入未经核实的新字段。

### 1.1 升级时区分本机库与工程发行物

以下为历史证据，本轮 2.2.3 未重跑：Studio 2.2.0-beta.1 曾实测本地2.2.0→2.2.1升级：当前工程已含同ID发行物时，复制导入ZIP可能报重复ID；在未加入本插件的临时工程导入新版并确认覆盖本机库，然后切回原工程，通过“改用这份本机源码 → 替换项目发行物”更新。必须核对两边版本及来源，先保留工程和旧存档；不要改ID、删项目插件目录或重建游戏来绕过错误。源码关联用户须先核对自有修改，不盲目覆盖。

本机库已更新不等于工程已经使用新版。合成验收中，旧卡片／变量文件哈希保持一致，旧存档读回 first=B、left=2，续抽 second=C、left=1、ok=true。只证明此前本地更新与这一固定池续抽案例；不冒充工坊在线升级、全部固定序列或其他平台验收。完整人类步骤见 USER-GUIDE.md 第2.1节。AI资料副本仍须按 AI-INTEGRATION.md 单独更新。

### 1.2 Stable／Beta 资料选择

优先读取当前作品 `LETSGAL.md` 中的明确版本选择，再核对实际实例的完整 FileVersion／关于页、通道、项目启用插件、目标 SDK 与可工作样本。`project.json` 中任意名为 `version` 的字段不能单独证明 Studio 版本；SDK 版本也不能单独证明宿主通道。实际启用插件与资料版本不一致时先说明差异，不默认选择最新目录。

随资料包的只读选择器示例：

```text
python scripts/select-host-guidance.py --project <目标工程目录> --studio-exe <实际Studio可执行文件> --sdk-root <该目标SDK目录>
```

也可显式提供 `--host-version 2.3.0-beta.1 --channel beta` 替代可执行文件；这属于输入声明，不能写成已读取进程或关于页。选择器只读工程和版本证据，不改变 Studio、SDK、作品或账号。使用安装后的 Skill 时，执行其随附选择器，并用 `--skill-root <实际Skill目录>` 明确资料入口。`--sample-file <有效调用样本>`可重复使用，只记录样本来源与哈希，不证明样本schema通过。

读取 JSON 结果中的来源、缺项、冲突、所选资料和 `compatibility_validation`。退出码0仅表示资料路由成功，运行验收仍为 `NOT_RUN`；退出码2表示 `UNKNOWN`，不得继续猜测版本相关字段。成功后仅阅读 `references/compatibility/stable.md` 或 `beta.md` 中与当前工程匹配的一份。有效调用样本、实际参数、真实宿主／播放器行为仍须另核；样本没有出现新字段也不能单独证明该字段不支持。

2026-09-30 本插件对照实装 Studio 2.3.0-beta.1 的 SDK，所用方法、变量、数据库依赖和 saveSchema 接口静态保留；在隔离目录采用该官方SDK并保留原脚手架类型桩，对现有src的TypeScript无输出检查通过。新版可选保存声明与调度入口不要求现有插件改写。原SDK1.21.0与实现保留，不拷入 Beta SDK 为旧稳定版升级接口。官方 2.3.0-beta.1 更新记录没有声明修复本插件的文字候选鼠标回填；当前在线开发文档标注 v2.0，不能把整站最新说明视为 Beta 专属规范。上述检查不证明新宿主实际运行通过。

## 2. 功能选择与边界

| 用户意图 | 采用方案 | 不能误写成 |
|---|---|---|
| 掷骰、范围数值 | `rand`，`mode=fresh` | 读取结果变量就会再次随机 |
| 第一次抽定，当前存档沿用 | `rand`，`mode=sticky`，独立 `fixedKey` | 跨存档全局防重、不可读档重抽 |
| 一次抽多项，本批不重复 | `rand-pick` / `rand-pick-number`，`replacement=without` | 下一次调用仍记住上一批 |
| 多次调用持续移除已抽项 | `deck-create` → 多次 `deck-draw` | 每次抽前重建池 |
| 洗牌一次，按顺序抽 | 抽取池 `mode=fixed` | 不管读回哪个时点都固定相同结果 |
| 读档后允许从剩余项重新随机 | 抽取池 `mode=remaining` | 真随机/硬件熵、保证下次不同 |
| 执行片段后改变事件资格 | 普通列表的权重表达式读变量；片段结束时显式修改变量 | 插件自动监听任意片段完成，或自动修改已建抽取池 |
| 运行时随意增删改候选行 | 当前插件没有对应方法；先解释限制 | 凭空调用 `add-item`、`remove-item`、`update-weight` |
| 读JSON数组中的第几项 | 使用宿主已验证的数组能力；或建立抽取池逐项取出 | 凭空增加本插件的数组下标方法 |

扩展方法的完整引用采用 `<扩展ID>/<方法ID>`，例如 `mixing-entropy.random-math/deck-draw`。宿主调用块的字段名和参数封装必须以实际格式为准。

## 3. 数据、绑定和输出

### 3.1 数据表依赖

| 逻辑别名 | 显示名 | 契约 | 接受版本 | 读写 |
|---|---|---|---|---|
| `pickTable` | 随机候选表 | `mixing-entropy.random-math.pick-table` | `^1.0.0` | 只读 |
| `funcLib` | 函数规则表 | `mixing-entropy.random-math.func-lib` | `^1.0.0` | 只读 |

宿主负责寻找兼容表、创建模板和绑定。别名不是文件路径或表标题，重命名普通数据表不会自动让它兼容。当前插件只有一个 `pickTable` 绑定位置，不能在每个方法卡片任意指定一张不同的表。不要绕过绑定直接读取项目数据库文件。

候选表基础字段为 `pool`（分组文字）、`label`（候选内容）、`weight`（数字、表达式或固定百分比），记录还有宿主生成的稳定 `id`。函数表字段为 `name`、`expr`、`desc`。`field` 默认 `label`，指定的是读取哪列，不是结果变量或池名。额外输出列必须使用表中真实字段名。

`poolScope=named` 按 `pool` 筛选，但 `pool` 空时兼容全表；`default` 仅空池名；`all` 是已绑定候选表的全部池，不是项目所有表。编辑器的“搜索这张表”是多字段关键词筛选，不能当作运行时精确池选择。

### 3.2 变量与错误

每次调用建议填写开关 `successVar` 和文本 `errorVar`。成功清空错误；正常配置失败保留旧结果，所以不能把结果不为空当成成功，也不能只凭返回值 `-1` 判错（合法计算也可能得到-1）。先检查状态，再使用结果。

数值方法使用数值变量；文字结果、JSON数组和报告使用文本变量。JSON数组不是宿主原生数组变量。例如文本值 `"[1,2,3]"` 描述存储类型，实际字段中填写 `[1,2,3]`，不能多包一层字符串引号。数组输入只支持同一结果类型的值，不接受任意对象；`arrayVar` 选定后优先于 `arrayJson`，不是两者合并。

批量前缀 `item` 对应 `item_1`、`item_2`……；必须预先建立全部逐项变量。四种输出规则不能混用：

| 方法 | `count=1` | `count>1` |
|---|---|---|
| `rand` | 数值 `outVar`；`reportVar`也是JSON数组 | `prefix`或`reportVar`至少一个；返回数量 |
| `rand-pick` | 文本 `outVar` | `outVar`写JSON文本；可加文本`prefix`；返回JSON文本 |
| `rand-pick-number` | 数值 `outVar` | 数值`prefix`必填，即使已填`reportVar`；返回数量 |
| `deck-draw` | `outVar`取决于池的数值/文字类型；返回JSON数组文本 | 逐项`prefix`和/或JSON`reportVar`接结果；不要把多项塞进单项`outVar` |

列表单次 `outIdVar` 是普通ID文本；列表批量及抽取池 `outIdVar` 是JSON ID数组。报告变量和方法返回值并不总是相同：建池的 `outVar` 是完整池报告，而返回值是数量。

## 4. 权重与概率规则

- 全部权重未填时均匀抽取；部分填写时空权重按0。
- `10` 是相对权重，`10%` 是固定概率。百分号后缀只接受数字，不能写 `var("rate")%`；计算表达式没有取模运算。
- 先分配固定概率，余量由相对权重分摊。例如 `10%`、`2`、`3` 对应10%、36%、54%。
- `var("变量名")` 每次普通列表调用读取当前变量；缺变量、坏表达式、负数和非有限值会失败。
- 固定概率总和超过100%失败；恰好100%时相对权重不参与。剩余概率大于0却没有正相对权重时默认失败。
- `emptyPolicy=uniform` 只能在明确需要时采用；它不会修复坏表达式或负权重，也不会覆盖固定概率使 `0%` 重新参与。
- 同批无放回抽取的后续概率会变化，重复规则按行区分；同内容不等于同一行。
- 概率检查用 `preview-pool`，不消耗抽取池。少量试抽不用于证明概率正确。

## 5. 抽取池、保存和片段反馈

### 5.1 生命周期

给每轮/事件池设置明确 `key`（1～128字符）。建立一次，然后按需要取出；同名池已存在时再次建立报错。取完不会自动补回；要求数量大于余量时整次失败，不部分扣除。`deck-peek` 不消耗；`deck-reset` 删除对应池后才能开始新轮，不清空结果变量。

建池时将候选内容、权重和公式结果做成快照；之后原表、原数组变量、权重变量变化均不修改已建池。默认 `uniqueBy=value` 合并相同结果并合并权重；`row` 保留相同内容的不同副本。数值按计算结果去重，文字区分大小写和空格。

`fixed` 在建池时确定完整顺序，之后依次取出；`remaining` 在每次取出时从剩余候选中随机选择并移除。均是伪随机，不提供安全随机保证。池状态随当前槽存档；读回抽取前存档会恢复当时未消费的内容。普通文本源数组不会被插件改写。

`sticky` 的固定数值记录与抽取池是两套状态。`fixedKey` 为空时按 `value:outVar`、`batch:prefix`、`array:reportVar` 派生；复用输出变量可能意外复用固定记录，因此独立事件建议显式命名。`fixedPolicy=adopt` 只在明确继承合法旧结果时使用，不能把默认值当作已抽结果。

### 5.2 执行片段后的自动反馈范例

目标：完成“调查房间”片段后不再抽到它，并解锁“查看线索”。采用普通列表和变量权重，不采用冻结候选的不重复抽取池。

准备当前存档数值变量 `room_available=1`、`clue_available=0`，以及文本 `picked`、开关 `ok`、文本 `error`。表数据：

| pool | label | weight |
|---|---|---|
| explore | 调查房间 | `var("room_available")` |
| explore | 查看线索 | `var("clue_available")` |
| explore | 结束探索 | `1` |

调用 `rand-pick`，`poolScope=named`、`pool=explore`、`field=label`、`count=1`、`outVar=picked`、`successVar=ok`、`errorVar=error`。先判断 `ok`，成功后根据 `picked` 显式分支到片段。候选文字或行ID不会自动变成片段跳转。

在“调查房间”真正完成的出口，使用宿主的设置变量操作将 `room_available=0`、`clue_available=1`，然后返回抽取处。中断/放弃的出口不要误执行完成反馈。下一次普通列表调用才应用新权重；已抽出的当前结果不会回溯改变。保留“结束探索”权重1可避免全部事件关闭后全零报错。

若事件允许再次解锁，再由用户指定的剧情条件恢复变量。不要宣称插件有片段完成监听器、自动回调注册接口或运行时行修改功能。修改变量是作者显式配置的剧情操作。

## 6. 可复制的参数意图范例

以下对象用于核对参数含义，**不是完整剧本文件或可直接导入的节点**；变量项需转换成宿主实际引用形式。

### 六面骰

```json
{"method":"mixing-entropy.random-math/rand","params":{"mode":"fresh","min":1,"max":6,"digits":0,"includeMin":true,"includeMax":true,"count":1,"outVar":"roll","successVar":"ok","errorVar":"error"}}
```

准备数值`roll=0`、开关`ok=false`、文本`error=""`；先判断`ok`，再判断`roll>=4`进入成功剧情。测试范围反向时应报错并保留旧roll。

### 三事件一轮不重复

```json
{"method":"mixing-entropy.random-math/deck-create","params":{"key":"events","source":"array","arrayJson":"[\"调查\",\"休息\",\"交谈\"]","valueType":"text","mode":"fixed","uniqueBy":"value","successVar":"ok","errorVar":"error"}}
```

建池成功后才进入循环。文本`picked`、数值`left`预先创建，每次调用：

```json
{"method":"mixing-entropy.random-math/deck-draw","params":{"key":"events","count":1,"outVar":"picked","remainingVar":"left","successVar":"ok","errorVar":"error"}}
```

成功时按picked显式分支；完成后left>0继续，left=0结束。不要再次经过建池卡片。新轮使用`deck-reset`且key仍为events，再建池。要允许读档重抽剩余项，只将建池mode改为remaining，已有池需先按用户意图结束/重置。

## 7. 公式和计算

`calc`支持加、减、乘、除、幂、平方根、向下取整、四舍五入，以及函数表中的自定义函数。普通计算传`a/b`，平方根/取整只使用`a`；自定义函数用`op=func`、`funcName`和`x/y/z/w`。

表达式只支持白名单：数值、`x/y/z/w`、`+ - * / ^`、括号、比较与三元条件、`sqrt/pow/floor/round/min/max/clamp`、`var("name")`和已定义表函数。幂右结合且优先于负号；负数底数应加括号。禁止递归，不是JavaScript环境，无任意脚本、网络或文件能力。

例：函数`damage`的expr为`max(0,round(x*y-z))`；x=20、y=1.5、z=4得到26。不能用数值字符串拼接文本或把任意对象传给公式。

## 8. 验证与交付给用户

规模边界：单次抽取1～100整数；范围随机精度0～6且每个放大后端点绝对值不超过2^48。单表/单池最多10000项，同一存档最多100个抽取池、剩余项合计最多20000；空池仍占名额，删除需明确调用重置。数组输入最多1000000字符，池存档合计最多4000000字符。固定随机记录最多10000条。不要并行操作同一实例的抽取池方法。

函数表最多1000行，表达式最多4096字符，解析深度和调用深度最多32，每次求值最多4096次函数调用。除零、非有限结果和非法定义必须走错误分支。数值列表会先验证候选公式，不能假设权重为0就可以保留坏公式。

- 最小验证先查成功状态、变量类型、范围；再测试无效参数时旧结果没有冒充新结果。
- 表格案例查绑定和概率报告；片段反馈案例核对修改前后候选资格，不能只看参数文字。
- 抽取池查数量、去重、抽空、重置和真实存读档。需导出时再查目标播放器。
- 程序模拟只能证明插件逻辑在该模拟上下文下通过，不能证明Studio数据库接口、界面操作、存档或导出可用。不要写没有执行过的PASS。
- Studio 2.0.0曾存在“当前宿主没有为数据依赖提供项目数据库能力”的已复现问题。历史2.2.0-beta.1合成工程的实时预览及此前验收的Windows独立播放器已通过文字／数值批量与函数表求和的条件检查；这不是本轮2.3.0-beta.1实测，其他宿主／平台仍须单独验证。出错时保留信息，不修改SDK或绕过项目数据权限。
- 最终向创作者说明增加了哪些变量、表行、调用与分支，反馈发生在哪个出口，失败走哪里，以及哪些检查尚未执行。不要以“已写文档”冒充功能已发布。

## 9. 方法与参数完整索引

以下索引沿用 2.2.1 实际方法定义，2.2.3 未改变这些方法。`variable`表示变量选择项；省略可选输出表示不写该变量。显示条件只控制编辑器显示，不代表可以忽略类型或运行约束。没有默认值的参数不应凭空补一个。

### 建立不重复抽取池 `deck-create`

从候选表或JSON数组建立持久抽取池。重复建立同名池会报错，重开一轮须先重置。

返回：`number`；池内项目数量；失败-1。

| 参数 | 类型／默认值 | 用途与条件 |
|---|---|---|
| `key` | string；默认`""` | 抽取池名称（独立命名，随存档）；必填 |
| `source` | enum；默认`"table"` | 来源；选项 `table` 随机候选表、`array` JSON数组 |
| `poolScope` | enum；默认`"named"` | 候选范围；选项 `named` 指定池（空名称兼容全表）、`default` 仅未命名池、`all` 全部池 |
| `pool` | string；默认`""` | 池名；显示条件`{"field": "poolScope", "equals": "named"}` |
| `field` | string；默认`"label"` | 输出列 |
| `emptyPolicy` | enum；默认`"error"` | 剩余概率无正权重时；选项 `error` 不抽取并报告错误、`uniform` 明确允许均匀回退 |
| `arrayJson` | string；默认`""` | JSON数组（如 ["A","B","C"] 或 [1,2,3]）；显示条件`{"field": "source", "equals": "array"}` |
| `arrayVar` | variable；未声明默认值 | 从文本变量读取JSON数组（优先于上方文本）；显示条件`{"field": "source", "equals": "array"}` |
| `valueType` | enum；默认`"text"` | 结果类型；选项 `text` 文字、`number` 数值（表中允许公式） |
| `mode` | enum；默认`"fixed"` | 抽取方式；选项 `fixed` 建立时洗牌，之后依次抽取、`remaining` 每次从剩余项随机抽取（可读档重抽） |
| `uniqueBy` | enum；默认`"value"` | 相同内容处理；选项 `value` 合并相同结果（权重相加，保留首项ID）、`row` 按行／数组位置区分（相同内容可再次出现） |
| `outVar` | variable；未声明默认值 | 初始池报告（JSON文本，可空） |
| `successVar` | variable；未声明默认值 | 成功状态写入（布尔，可空） |
| `errorVar` | variable；未声明默认值 | 错误说明写入（文本，可空） |

### 从抽取池取出 `deck-draw`

跨多次调用持续不重复。抽出的项目从当前槽的池中移除；余量不足整批失败，不自动补回。返回结果JSON数组。

返回：`string`；结果JSON数组；失败空串。

| 参数 | 类型／默认值 | 用途与条件 |
|---|---|---|
| `key` | string；默认`""` | 抽取池名称（独立命名，随存档）；必填 |
| `count` | number；默认`1` | 本次取出数量；最小1；最大100 |
| `outVar` | variable；未声明默认值 | 单项结果（文字／数值，与建池类型一致）；显示条件`{"field": "count", "equals": 1}` |
| `prefix` | string；默认`""` | 批量逐项前缀（可空，需预先声明 前缀_1…N） |
| `reportVar` | variable；未声明默认值 | 本次结果数组（JSON文本，可空） |
| `outIdVar` | variable；未声明默认值 | 本次行ID数组（JSON文本，可空） |
| `remainingVar` | variable；未声明默认值 | 剩余数量（数值，可空） |
| `successVar` | variable；未声明默认值 | 成功状态写入（布尔，可空） |
| `errorVar` | variable；未声明默认值 | 错误说明写入（文本，可空） |

### 查看抽取池／剩余数组 `deck-peek`

不抽取、不洗牌。返回总数、已抽数量、剩余数值／文字数组和ID数组。

返回：`string`；池报告JSON；失败空串。

| 参数 | 类型／默认值 | 用途与条件 |
|---|---|---|
| `key` | string；默认`""` | 抽取池名称（独立命名，随存档）；必填 |
| `outVar` | variable；未声明默认值 | 池报告（JSON文本，可空） |
| `arrayVar` | variable；未声明默认值 | 仅剩余结果数组（JSON文本，可空） |
| `remainingVar` | variable；未声明默认值 | 剩余数量（数值，可空） |
| `successVar` | variable；未声明默认值 | 成功状态写入（布尔，可空） |
| `errorVar` | variable；未声明默认值 | 错误说明写入（文本，可空） |

### 重置／删除指定抽取池 `deck-reset`

删除指定池记录；不清空已有结果变量。再次建立后开始新一轮。

返回：`boolean`；是否成功。

| 参数 | 类型／默认值 | 用途与条件 |
|---|---|---|
| `key` | string；默认`""` | 抽取池名称（独立命名，随存档）；必填 |
| `successVar` | variable；未声明默认值 | 成功状态写入（布尔，可空） |
| `errorVar` | variable；未声明默认值 | 错误说明写入（文本，可空） |

### 随机数 `rand`

按指定精度等概率抽取。单次返回结果，批量返回数量。固定结果随存档保存。

返回：`number`；单次值／批量数量；失败-1，配合成功状态。

| 参数 | 类型／默认值 | 用途与条件 |
|---|---|---|
| `mode` | enum；默认`"fresh"` | 模式；必填；选项 `fresh` 每次重抽、`sticky` 首次抽取后固定（随存档） |
| `min` | number；默认`0` | 最小值；必填 |
| `max` | number；默认`100` | 最大值；必填 |
| `digits` | number；默认`0` | 小数位数（0=整数）；最小0；最大6 |
| `includeMin` | boolean；默认`true` | 包含最小端点 |
| `includeMax` | boolean；默认`true` | 包含最大端点 |
| `count` | number；默认`1` | 数量（大于1批量输出）；最小1；最大100 |
| `outVar` | variable；未声明默认值 | 单次结果变量；显示条件`{"field": "count", "equals": 1}` |
| `prefix` | string；默认`""` | 批量前缀（数量大于1时使用） |
| `reportVar` | variable；未声明默认值 | 完整结果数组（JSON文本，可空） |
| `fixedKey` | string；默认`""` | 固定记录名（空=结果变量或批量前缀）；显示条件`{"field": "mode", "equals": "sticky"}` |
| `fixedPolicy` | enum；默认`"fresh"` | 旧存档首次接入；选项 `fresh` 首次生成，忽略输出默认值、`adopt` 采用完整的既有结果；显示条件`{"field": "mode", "equals": "sticky"}` |
| `successVar` | variable；未声明默认值 | 成功状态写入（布尔，可空） |
| `errorVar` | variable；未声明默认值 | 错误说明写入（文本，可空） |

### 重置固定随机 `reset-fixed`

移除指定固定记录，下次重抽；保留结果变量。

返回：`boolean`；是否成功。

| 参数 | 类型／默认值 | 用途与条件 |
|---|---|---|
| `key` | string；默认`""` | 记录名（默认单次 value:变量名；批量 batch:前缀）；必填 |
| `successVar` | variable；未声明默认值 | 成功状态写入（布尔，可空） |
| `errorVar` | variable；未声明默认值 | 错误说明写入（文本，可空） |

### 列表随机（安科式） `rand-pick`

支持1～100次文字抽取。允许重复时每抽保持原概率；同批不重复按剩余行的原概率重新归一化。weight 填10%预留概率。

返回：`string`；单条文字／批量JSON数组；失败空串，配合成功状态。

| 参数 | 类型／默认值 | 用途与条件 |
|---|---|---|
| `poolScope` | enum；默认`"named"` | 候选范围；选项 `named` 指定池（空名称兼容全表）、`default` 仅未命名池、`all` 全部池 |
| `pool` | string；默认`""` | 池名；显示条件`{"field": "poolScope", "equals": "named"}` |
| `field` | string；默认`"label"` | 输出列 |
| `emptyPolicy` | enum；默认`"error"` | 剩余概率无正权重时；选项 `error` 不抽取并报告错误、`uniform` 明确允许均匀回退 |
| `count` | number；默认`1` | 抽取数量；最小1；最大100 |
| `replacement` | enum；默认`"with"` | 重复规则；选项 `with` 允许重复（每次概率不变）、`without` 同批不重复（按行排除，后续概率改变） |
| `outVar` | variable；未声明默认值 | 结果变量（单条文字／批量JSON文本，可空） |
| `outIdVar` | variable；未声明默认值 | 行ID变量（单条ID／批量JSON文本，可空） |
| `prefix` | string；默认`""` | 批量逐条输出前缀（可空，写入 前缀_1..N 文本变量） |
| `successVar` | variable；未声明默认值 | 成功状态写入（布尔，可空） |
| `errorVar` | variable；未声明默认值 | 错误说明写入（文本，可空） |

### 列表随机（数值／公式） `rand-pick-number`

按权重抽取数字或公式结果，支持整数与小数。批量结果写入前缀数值变量；可选重复规则。

返回：`number`；单次数值／批量数量；失败-1，配合成功状态。

| 参数 | 类型／默认值 | 用途与条件 |
|---|---|---|
| `poolScope` | enum；默认`"named"` | 候选范围；选项 `named` 指定池（空名称兼容全表）、`default` 仅未命名池、`all` 全部池 |
| `pool` | string；默认`""` | 池名；显示条件`{"field": "poolScope", "equals": "named"}` |
| `field` | string；默认`"label"` | 输出列 |
| `emptyPolicy` | enum；默认`"error"` | 剩余概率无正权重时；选项 `error` 不抽取并报告错误、`uniform` 明确允许均匀回退 |
| `count` | number；默认`1` | 抽取数量；最小1；最大100 |
| `replacement` | enum；默认`"with"` | 重复规则；选项 `with` 允许重复（每次概率不变）、`without` 同批不重复（按行排除，后续概率改变） |
| `outVar` | variable；未声明默认值 | 单次数值结果变量；显示条件`{"field": "count", "equals": 1}` |
| `prefix` | string；默认`""` | 批量数值前缀（数量大于1时必填） |
| `reportVar` | variable；未声明默认值 | 完整数值数组（JSON文本，可空） |
| `outIdVar` | variable；未声明默认值 | 行ID变量（单条ID／批量JSON文本，可空） |
| `successVar` | variable；未声明默认值 | 成功状态写入（布尔，可空） |
| `errorVar` | variable；未声明默认值 | 错误说明写入（文本，可空） |

### 检查候选池与概率 `preview-pool`

检查固定概率与当前动态权重的分配，不抽取；返回JSON文本报告。

返回：`string`；概率报告JSON。

| 参数 | 类型／默认值 | 用途与条件 |
|---|---|---|
| `poolScope` | enum；默认`"named"` | 候选范围；选项 `named` 指定池（空名称兼容全表）、`default` 仅未命名池、`all` 全部池 |
| `pool` | string；默认`""` | 池名；显示条件`{"field": "poolScope", "equals": "named"}` |
| `field` | string；默认`"label"` | 输出列 |
| `emptyPolicy` | enum；默认`"error"` | 剩余概率无正权重时；选项 `error` 不抽取并报告错误、`uniform` 明确允许均匀回退 |
| `outVar` | variable；未声明默认值 | 报告变量（文本，可空） |
| `successVar` | variable；未声明默认值 | 成功状态写入（布尔，可空） |
| `errorVar` | variable；未声明默认值 | 错误说明写入（文本，可空） |

### 计算 `calc`

有限数值计算／无副作用的表函数。失败保留结果，成功状态=false。

返回：`number`；计算结果；失败-1，配合成功状态。

| 参数 | 类型／默认值 | 用途与条件 |
|---|---|---|
| `op` | enum；默认`"add"` | 运算；必填；选项 `add` 加 +、`sub` 减 −、`mul` 乘 ×、`div` 除 ÷、`pow` 幂、`root` 开方、`floor` 向下取整、`round` 四舍五入、`func` 自定义函数 |
| `a` | number；默认`0` | a（基础运算） |
| `b` | number；默认`1` | b（双目运算） |
| `funcName` | string；默认`""` | 函数名；显示条件`{"field": "op", "equals": "func"}` |
| `x` | number；默认`0` | x；显示条件`{"field": "op", "equals": "func"}` |
| `y` | number；默认`0` | y；显示条件`{"field": "op", "equals": "func"}` |
| `z` | number；默认`0` | z；显示条件`{"field": "op", "equals": "func"}` |
| `w` | number；默认`0` | w；显示条件`{"field": "op", "equals": "func"}` |
| `outVar` | variable；未声明默认值 | 结果变量（可空，仅返回） |
| `successVar` | variable；未声明默认值 | 成功状态写入（布尔，可空） |
| `errorVar` | variable；未声明默认值 | 错误说明写入（文本，可空） |


## 检查器文字候选的边界

string 参数的 suggestions 只声明编辑期历史候选：池名 pool、输出列 candidate-field、抽取池名称 deck-key、固定记录 fixed-key、数值前缀 number-output-prefix、文字前缀 text-output-prefix、抽取池前缀 deck-output-prefix、函数 function。同 key 在插件内复用，不能跨不同语义混用。实际候选由 Studio 从项目剧本已填值收集，不是数据库或存档实时枚举；变量仍用官方选择器。所用 SDK 没有本插件采用的自定义筛选或拼音匹配入口。历史 Studio 2.2.0-beta.1 中文首字动态过滤已观察通过，人工已确认候选显示后鼠标点选不能回填。2.3.0-beta.1 本轮未复测，不能宣称回填已修复。

2026-09-26 真实宿主专项核查：官方示例式独立诊断扩展在原合成工程和仅启用必要组件的干净工程均各连续复现 3 次；另有 3 次鼠标失败逐次核对了磁盘旧值。直接定义、复用字段、默认值、必填、条件显示、检查器停靠位置、条件参数弹窗、新卡片和项目重开均未消除问题。对用户统一表述为“疑似 Studio 官方 Bug，等待官方修复”。独立复现证据指向扩展 string.suggestions 鼠标选择路径，尚未定位宿主内部代码原因，不能写成已确认某个焦点事件或插件已修复。

展开候选后用 ↑／↓ 选择高亮项并按 Enter，或完整手填；键盘回填、保存、切卡和项目重开已核对，诊断方法在编辑器预览收到的字符串也与保存值一致。该结果不是全部 19 字段逐项 GUI 验收，也不是独立游戏运行／导出验收。Esc 关闭候选但不撤销输入；不要用直接写 JSON 或设置控件值冒充鼠标通过。

当前公开方法 schema 未提供替换其选择处理的接口，不能以动态检查器或固定枚举接管任意文本。全拼和拼音首字母不在本版范围。运行时方法、参数类型与取值不变；旧存档和手填名称继续有效。

资料依据：[插件公开源码](https://github.com/recurse00-stack/random-math)、随包实际方法定义与原 SDK、[官方更新记录](https://avg-engine.com/changelog)、[官方扩展开发入口](https://docs.avg-engine.com/extensions/develop/)。本轮 SDK 静态比较、路由与运行验收边界见 `VALIDATION-2.2.3.md`；引用网址不代表目标版本实机通过。
