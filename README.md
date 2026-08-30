# 随机与计算系统（mixing-entropy.random-math）

> LetsGal Studio 1.21.0 · v1.0.0 · 作者：混合熵 · 协议：MIT
> 纯数学扩展：随机数（真/伪、整数/小数、批量）、加权列表抽取（多池+复合权重+函数调用）、计算与自定义函数（白名单表达式 DSL）。无网络、无原生依赖。

## 目录

- `extension.json` — 清单（含两个数据绑定：随机候选表 pickTable / 函数规则表 funcLib）
- `src/index.tsx` — 单一源码文件（3 个方法 + 白名单表达式 DSL 内联）
- `sdk/` — Studio 1.21.0 的 SDK 副本（`extension-inspector.ts` 为类型补全桩）
- `dist/` — 构建产物（`npm run build` 生成，勿手改）

## 构建（纯 tsc，无外部子进程）

```powershell
npm run build              # tsc → dist/index.js（+ index.mjs 兼容副本）
npx tsc --noEmit           # 类型检查
node _test\run-tests.mjs   # 58 项（manifest 校验 + 确定性逻辑 + 性质抽样）
```

## 方法速查（3 个）

| 方法 | 参数要点 | 返回 |
|---|---|---|
| 随机数 | mode(fresh/sticky), min, max, digits(0=整数含端可选/1-6=小数), count(1=单值/2-100=批量写 前缀_1..N), outVar, prefix | number |
| 列表随机 | field(默认 label), outVar, outIdVar | string |
| 计算 | op(加减乘除/幂/开方/取整/四舍五入/**自定义函数**), a, b；op=自定义函数时 funcName+x/y/z/w | number |

- fresh=真随机（每次触发重掷，SL 后也重掷）；sticky=伪随机（首掷写 outVar，之后固定，读档恢复固定值）
- 错误约定：非法输入/未找到函数 → 返回 -1 + 控制台警告

## 表达式 DSL 速查（函数规则表"表达式"列用）

| 写法 | 含义 | 示例（→结果） |
|---|---|---|
| `x + y` `x - y` `x * y` `x / y` | 加减乘除 | `2 + 3` → 5 |
| `x ^ y` | 幂 | `2 ^ 10` → 1024 |
| `( )` | 括号分组 | `(x + y) / 2` |
| `sqrt(x)` | 平方根 | `sqrt(81)` → 9 |
| `pow(x, y)` | x 的 y 次方 | `pow(2, 10)` → 1024 |
| `floor(x)` | 向下取整 | `floor(3.9)` → 3 |
| `round(x)` | 四舍五入 | `round(2.5)` → 3 |
| `min(a, b)` / `max(a, b)` | 取小 / 取大 | `min(3, 9)` → 3 |
| `clamp(x, a, b)` | 夹到 [a,b] | `clamp(95, 0, 60)` → 60 |

参数固定叫 `x / y / z / w`（用不到的不填=0）。**写错时扩展日志会打印本速查表。**

## 注意事项

- **outVar 是变量下拉**：结果写入变量必须先声明再选；sticky 模式必填。
- **批量前缀是文本框**：`前缀_1..N` 运行时写入；建议先声明 `前缀_1`（或全量）。
- **weight 列可选**：候选表不建 weight 列=均匀随机；建了但全 0/空=自动回退均匀。
- **结果变量类型配对**：随机数→数值变量；列表随机→文本变量。

## Studio 验证（导入后必测）

1. 导入扩展（文件夹 / zip）→ 「加入」项目
2. 资产 → 数据集合：应自动出现「随机候选表」「函数规则表」两表
3. 剧本插入方法块：
   - 随机数（digits=0，fresh）→ F5 多次预览应每次不同
   - 随机数（digits=0，sticky）→ 首次固定；SL 读档后仍固定
   - 列表随机 → 表填 3 行 label（权重 5/2/3）→ 多次运行分布近似 50/20/30
   - 计算 → 运算=自定义函数，规则表加一行：`clamp(round(x*y),1,100)`，x=60,y=0.5 → 结果 30
4. If 直接比较：新 If 条件来源=「随机与计算系统 → 随机数」返回结果
