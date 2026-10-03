---
name: letsgal-plugin-random-math
description: 在LetsGal工程中使用抽选与数学增强，配置放回或不放回抽取、剧情调整、玩家选项及计算，核对迁移、份数和存档规则。
metadata:
  plugin_id: mixing-entropy.random-math
  plugin_version: "3.0.0"
  docs_revision: "sdk.1"
---

# 抽选与数学增强 · 插件 Skill

确认工程实际插件版本、Studio完整版本／通道、SDK和真实样本。运行只读scripts/select-host-guidance.py，缺失标UNKNOWN，仅阅读选中路由：[Stable](references/compatibility/stable.md)、[Beta](references/compatibility/beta.md)。不自动升级宿主。

有letsgal-authoring主Skill时按其工程流程，知识安装到实际用户区 `.letsgal-authoring/plugins/mixing-entropy.random-math/3.0.0/` 并保留旧版和索引；没有主Skill才独立安装，不写公共主Skill包。[接入说明](references/AI-INTEGRATION.md)提供检测预览及冲突保护。

按需读取[AI指南](references/AI-GUIDE.md)：第2节六入口与配置；第3节概率／份数／凭证／SL；第4节Choice与回放；第5节世界状态输入输出；第6、8节参数意图和真实定义；第7节旧工程与迁移。

随机数不限定六面骰：用范围1～N、整数且包含端点生成N面骰。随机数新编排可选单个／批量、每次重抽／首次固定的简洁操作，输入使用操作专属前缀。缺省generate仍保留旧字段；改旧调用时不能只改action而丢掉输入及输出绑定。权重rate支持var("变量名")表达式并在每次动作读取；set-rate持续保存表达式，add-rate和set-percent仅按调整当次求值。详细参数以AI指南为准。

处理选项布局时读取[界面兼容说明](references/CHOICE-UI-COMPATIBILITY.md)，先核对实际Choice绑定。rc.5在2.4.0-beta.2使用官方UI编辑器调整项目覆盖界面，长文、滚动和键盘末项选择通过；尺寸只对应合成画布，不自动覆盖作品或修改宿主安装文件。

不放回消耗份数，同文字不同ID不合并；candidate与unit计权不同；percent基础合计100，筛选后归一化。固定只保障建池后同状态，取消不退随机，检查不建池不抽取，作者配置不覆盖运行池。条件仅布尔变量，复杂世界规则由外部计算。新动作不放If。先声明变量，先检查status再使用结果；empty也会输出原因，失败保留旧结果数组与份数。

迁移离线先preview；If、动态控制及旧表语义不明时保留兼容。不能自动改真实作品或存档，不能把参数对象当章节节点。一份原2.2合成槽经迁移后新入口接管通过，不等于所有旧存档均通过。

[验证范围](references/VALIDATION-3.0.md)记录当前候选、真实运行字节及未覆盖范围。主要目标2.4.0-beta.2；Stable完整版本UNKNOWN。安装、资料路由、当前模型阅读、独立自动发现和游戏运行分别验收，旧鼠标回填未证明修复。

四项公共执行反馈在“高级设置：执行反馈”中按需展开。showAdvancedFeedback仅控制表单显示；收起或缺省不清除、不停用旧变量绑定。需要停止输出时清空对应绑定。

计算新增直接公式和常用数学表单，先读AI指南“计算增强”。新增字段接受数值或var公式；旧表函数命名空间和旧round规则保留。指定小数位采用半值远离零；循环取模要求正模数。池表达式没有同步扩展，先计算输出再引用。3.0.0新增计算的宿主验证状态须单独核对，不能沿用rc.5实测结论。
