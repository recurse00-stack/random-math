# Beta资料 · 抽选与数学增强3.0.0

修订2026-10-03。依据目标工程、实际Studio完整版本和通道、目标SDK与真实样本运行只读选择器；缺失或冲突标UNKNOWN，不升级宿主。

当前实测目标为2.4.0-beta.2。开发SDK现与该版本官方随附29个文件逐字节一致，依赖锁版本不变；清单最低要求>=1.21.0与开发SDK版本分别记录。项目侧纯类型声明处理官方未随附的检查器导出，禁止据此使用未核验API；SDK原文件不修改。完整构建和声明兼容回归通过，生成运行文件与此前验收字节一致。资料路由成功只证明选中本文件，不能证明类型检查、章节有效或真实运行通过。2.4.0-beta.1随附SDK的历史隔离类型检查也不当作beta.2新验收。

本版使用enabledWhen、原生列表、单字段visibleWhen、saveSchema和internal.system.choice。动态组合表单采用操作专属字段，不推测复杂显隐接口。读取[AI指南](../AI-GUIDE.md)和[验证范围](../VALIDATION-3.0.md)确认当前运行字节的实测；历史2.3及其他2.4版本单列，不能按Beta名称继承结论。

权重支持var("变量名")和安全表达式。池检查不推进随机；玩家选项沿用项目Choice绑定，回调必须稳定映射originalIndex及候选ID。其他主题、取消组合、导出平台仍按各自证据验收。

旧鼠标候选回填未证明修复，可用方向键＋Enter或完整手填并读回。验证使用合成工程，不自动升级宿主或SDK。

官方资料：[方法](https://docs.avg-engine.com/extensions/method)、[设置](https://docs.avg-engine.com/extensions/settings-schema)、[系统插槽](https://docs.avg-engine.com/extensions/system-slots)。通用文档不等于任意Beta实现。
