# 手册截图来源

## 2026-10-02：rc.4 · Studio 2.4.0-beta.1 导出播放器

以下均为同一纯文字合成工程的新Windows x64导出播放器原图，插件3.0.0-rc.4。沿用项目自定义Choice绑定；没有生成、裁剪、拼接或修改文字。大按钮用于长文验收，不是推荐皮肤；画面可见列表横向滚动条及对话叠加，实际作品须按自己的分辨率优化。

- `v3-choice-rc4-beta240-player.png`：原始采集`player-choice-current.png`，两份A只显示一个按钮。SHA256 `9c64ba4612c4482923182c907d888ca22aab78e0a98b123888105421777056af`。
- `v3-choice-rc4-beta240-longtext.png`：原始采集`player-long-current.png`，12项列表首项长文完整显示。SHA256 `fa73af5c345ff29254ffd351dfb6b50a3a072b352bed0660a250ecf30534d661`。

各图片仅说明其标明版本的界面。

v3-choice-rc1-beta230.png：2026-10-01，Studio 2.3.0-beta.1 导出的 Windows x64 播放器，插件3.0.0-rc.1；本项目的纯文字合成验收工程。展示候选A有两份但只显示一个按钮、等待玩家选择的状态。真实窗口原图，无生成、拼接或文字替换。SHA256 `ed8253e2631e86d1d53f08182a71c384e0efcd6c9e7bbe0a2d17f44ce16dc211`。

该图仅说明rc.1玩家选项界面，不代表后续版本的设置或检查面板。

variables.png、new-variable.png、method-picker.png、candidate-table.png：原有Studio2.2.0-beta.1历史截图，原字节保留，仅用于对应历史界面说明。cover.png是沿用的品牌封面，不是实机截图。

## 2026-10-01：rc.2 项目 UI 编排实测

三张图均为Studio 2.3.0-beta.1原生独立预览窗口原图，插件3.0.0-rc.2，纯文字合成工程。通过官方UI编辑器调整项目Choice列表安全排列及固定高度，保留原绑定和组件ID。没有生成、裁剪、拼接、改字或遮盖。固定大按钮用于长文验收，不代表推荐布局或任意长度自适应。

- `v3-choice-rc2-custom-longtext.png`：原始采集文件 `plugin-custom-ui-longtext-full.png`；SHA256 `32f538ab6cfc11745035b9e386e95b48d9ca6ff6a3a38ca7b361f9b814363e0a`。
- `v3-choice-rc2-custom-end.png`：原始采集文件 `plugin-custom-ui-keyboard-end.png`；SHA256 `16231b46342e76d423f081070367fc0f289bd4d6faa57c732707a7377e364e16`。
- `v3-choice-rc2-official-branch.png`：原始采集文件 `official-branch-custom-ui-top.png`；SHA256 `453e6b005a8e4e36169245762c2234ec498cb0f4a40e6a7dba4ff9efd66bb2b7`。

前两张分别展示插件长文完整可见、键盘End到达第12项；第三张展示同项目官方branch的相同长文。

## 2026-10-03 · Studio 2.4.0-beta.2

以下图片来自本项目纯文字合成工程的原生窗口实拍。仅按标明矩形裁取界面区域；未生成、补绘、改字或改变比例。完整原图与记录由本项目维护。裁取坐标为2560×1392原图的左、上、右、下。rc.4作者面板图标明原插件版本；rc.5新操作及Choice图分别证明所示局部。

- `v3-candidates-rc4-beta242.png`：插件3.0.0-rc.4；候选目录及变量权重提示；适用rc.4界面。裁取(442, 199, 2080, 1175)；原图SHA256 `ea492d78a53772b3c682164ab33b5b002e1b54e2c0597456424b06c527236e6e`；发布图SHA256 `88cd4e8c06120bc0ef47c49891c1e02fbd7595e1babc26365912a9ab9877199d`。
- `v3-inspector-rc4-beta242.png`：插件3.0.0-rc.4；有效池检查报告；适用rc.4界面。裁取(200, 137, 2320, 1285)；原图SHA256 `57c6ff529fafa45d7f1ebd81e78ae3ad7b09595002507fb3666dd699557f7b6f`；发布图SHA256 `167edeb68eff9d20acd5d4b52d588bca77d1f5c6556fed4d3e6779f5e4ea554e`。
- `v3-rand-form-rc5-beta242.png`：插件3.0.0-rc.5；单个随机数简洁操作的原生表单局部；不代表整张表单。裁取(676, 407, 1347, 982)；原图SHA256 `db56ede5f0c54f86a112d61cdda531b113e35252b302364315247b4f64f43df1`；发布图SHA256 `eea8b02237bc167d2b4afef94176a06943fda492477fa44185ef50cb0fa9e19c`。
- `v3-choice-rc5-beta242-longtext.png`：插件3.0.0-rc.5；项目Choice编排后长文与对白分区；运行字节c323c999。裁取(380, 113, 2136, 1140)；原图SHA256 `10533084a4ca9d33a4d6dbf5d434c6aa72ca6e1b3733560c2c73fece1fdcb1e9`；发布图SHA256 `717b96ac102a074da29e2bc59cbe99dcacf1e4275d3f1c221ebf99b10ec239dc`。

## rc.5 基础运行文件 · 手册案例实拍

2026-10-03，Studio 2.4.0-beta.2，插件3.0.0-rc.5，运行SHA256 `69a16d744168acf3b805eef4c1e5631a3f6ee68237593bacc0484c68e5d58a5e`。来自纯文字合成工程原生界面，仅矩形裁切，不补绘或改字。

- `v3-weather-candidate-rc5-beta242.png`：天气池下雪候选的完整原生字段。裁取(443, 112, 2073, 943)；原图SHA256 `d0ec54a8a8d2ef1f610e458d9948a82f8b8eeb8ff55adc63de15e9979e518d8d`；发布图SHA256 `84b4edbfadde569a5682b3075914ae2f8cbc070710774cf50b14c836c0aa6fa3`。
- `v3-weather-inspector-rc5-beta242.png`：天气池概率表局部，三候选实际概率60%/30%/10%。裁取(220, 151, 2300, 435)；原图SHA256 `df8ddb50390f7754501b96017d9004f9852d7e18b4b032a5d3cfffe1fe6b2504`；发布图SHA256 `0191700a737f81f3249c0914417cc100ec9f70875d2f38a9ee2ecd936b4a97db`。
- `v3-events-choice-rc5-beta242.png`：手册事件池实际展示；条件为假的档案室排除，零权重休息可选。裁取(380, 113, 2136, 1140)；原图SHA256 `433bc58621eaf2fec640ad03ddf1791c284ee2798007286cf6bb037c9de653df`；发布图SHA256 `d05287d032c3204b0501f4906f6984ce5ebf24d7e9647615dd3f8a93de4520ac`。

## 3.0.0 · 计算表单实拍

`v3-math-form-300-beta242.jpg`：2026-10-03，Studio 2.4.0-beta.2，插件3.0.0，纯文字合成示例工程的完整原生窗口截图。展示直接公式、数值结果和状态输出绑定；未生成、裁切、补绘、改字或遮盖。原始尺寸2560×1392，SHA256 `7f03a3f99331e83c21378bc987f316ae0b0d58a193000933b0db7ba6650308d6`。截图中的验证剧情为合成示例，不是插件运行界面的一部分。
