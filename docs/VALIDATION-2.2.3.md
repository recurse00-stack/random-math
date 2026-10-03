# 2.2.3 历史验证范围

记录日期：2026-09-30。稳定ID为mixing-entropy.random-math，执行逻辑、10个方法与存档结构沿用2.2.1；本文不是3.0的宿主验收结果。

## SDK与运行文件

对照Studio 2.3.0-beta.1随附SDK，既有方法、变量、数据库依赖、saveSchema与槽内接口经过静态比较与类型检查。withSave和this.method属于可选写法；开发SDK仍为1.21.0。SDK分发缺少的extension-inspector类型桩沿用源码脚手架，不推定该桩能证明真实检查器运行。

完整构建、原SDK类型检查和postbuild双入口回归通过。运行SHA256为 `21e5936e57bbcaf67719997cf3d1a7ae314a61998596a65ca1cbdb964f3d3223`。静态与构建结果不等于2.3.0-beta.1的安装、播放器、存读档或导出通过。

## Skill安装与资料路由

安装和路由行为检查27项通过，3项实际文件符号链接场景未验证。覆盖包清单缺失、包身份和文件哈希、主Skill优先用户区、独立安装、默认预览、重复安装、旧版与索引保留、冲突拒绝、路径越界与重定向、多个主Skill目录歧义，以及Stable／Beta和未知版本选择。

完整解压包根需要extension.json、plugin-skill-manifest.json、skills和scripts。安装器核对身份与全部Skill文件哈希；公共源码不是简易安装入口，无需创作者手工生成清单。

## 适用边界

- 2.3.0-beta.1只有上述静态结果，真实宿主运行未验证；Stable完整版本UNKNOWN。
- 运行、新装、本地升级与旧存档续抽只引用[2.2.1历史结果](VALIDATION-2.2.1.md)，资料检查另见[2.2.2历史范围](VALIDATION-2.2.2.md)。
- 人类手册的四张图来自Studio 2.2.0-beta.1，不能证明新版界面。
- 鼠标候选回填未证明修复，可用方向键＋Enter或完整手填；LetsGal内置AI未接入，外部模型使用须分别验证。

资料依据：随包实际方法、对应SDK、[官方更新记录](https://avg-engine.com/changelog)与[扩展开发入口](https://docs.avg-engine.com/extensions/develop/)。通用文档不是任意Beta实现的保证。
