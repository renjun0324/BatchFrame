# 当前生产边框审计

审计基线：分支 `feat/film-inner-frame-system`，生产目录 `miniprogram/`，配置见 `miniprogram/core/innerFrameStyles.js`，绘制入口见 `miniprogram/core/innerFrameRenderer.js`。本轮只记录现状，不修改这些文件。

## 总体判断

当前生产实现已经把风格分派拆成 `clean`、`segmented-mask`、`film-gate`、`perforated-film`、`medium-format-rebate` 和 `emulsion-mask`，但完整成片的主要视觉仍由“黑色矩形片基 + 照片”决定。`docs/production-frame-review/full-contact-sheet.png` 和 `shape-regression.png` 中，A 系列边框在缩小后只剩线宽和边缘起伏，B 系列的齿孔/编号才有较强识别度。

## 逐项审查

| styleId | 当前识别特征 | 手机/完整成片可见性 | 具体问题 | 决策 |
|---|---|---|---|---|
| `clean-black` | `drawCleanFrame()` 用 `fillRect()` 绘制四边一致的 8px 基准黑线 | 手机清楚，但只表达“装裱线” | 没有材料信息，也没有角部语言；这是合理的基础项，不应伪装成胶片 | 保留为基础项 |
| `full-frame-scan` | `segmented-mask` 加八分片 mask；`buildFramePaths()` 产生低幅边缘起伏 | 完整成片中起伏很容易消失，角部比经典线只略显不齐 | 仍是连续矩形黑边，辨识度主要来自宽度/起伏；三档强度是同一结构的轻重变化 | 重做为独立候选变体，不直接沿用现名 |
| `film-gate` | `drawFilmGateFrame()` 使用四边不同宽度和两个角部堆积 | 角部在手机上可见，但大多数边仍像加粗矩形 | 片门压力的方向性不够明确，缺少“压框/遮挡”的一侧主导关系 | 保留概念，重做方向性 |
| `negative-35mm` | `drawPerforatedFilmFrame()` 程序绘制上下齿孔和通用帧号 | 齿孔是最容易识别的结构；完整构图中片基可能压过照片 | 仍然是上下对称齿孔，和电影胶片/接触印样的档案感没有清晰区分 | 保留为胶片结构系列 |
| `medium-format-120` | `drawMediumFormatFrame()` 左侧更宽、圆点和 `120` 标记 | 左侧宽片基可见；方图比横图更自然 | 当前只用一个圆点和帧号表达 120，材料特征弱；在 9:16 等比例没有明确策略 | 保留概念，优先方形/竖幅 |
| `emulsion-damage` | `emulsion-mask` 加不规则边和 `drawFragments()` 碎屑 | 强档可见，轻档接近普通不规则黑边 | 侵蚀形状仍像随机毛刺，缺少成片的“剥落区域”和稳定角部；完整成片容易喧宾夺主 | 重做为少量完整破损变体 |

## 关键问题

1. `full-frame-scan` 和 `emulsion-damage` 虽然 renderer 不同，但在缩小预览中仍主要表现为边缘扰动强度差异；如果去掉名称，候选之间的识别依赖不足。
2. `film-gate`、`negative-35mm`、`medium-format-120` 的结构区别是可见的，但前两者仍共享同样的“黑片基包住照片”轮廓，片门的压迫方向和 120 的宽 rebate 需要更明确。
3. 所有当前样式都继续服务于“大外层背景 + 内层照片”的产品定位；不应把 A 系列做成覆盖照片的复古滤镜。
4. 当前生产预览截图是开发审查资产，不是真机截图；真机比例、字体和 Canvas 抗锯齿仍需人工复核。

## 建议保留/重做/删除

- 保留：`clean-black`，作为稳定的基础装裱线。
- 重做：全幅扫描、片门压框、乳剂破损；本轮以 A 系列候选先进行盲评。
- 保留并分组：35mm 负片、120 中画幅；它们属于 B 系列“胶片结构边”，不应和细黑边并列解释。
- 候选补充：16mm 电影胶片和接触印样只进入设计评审，不进入当前生产。
- 删除策略：任何在 `blind-without-labels.png` 中无法靠形态区分、或在手机预览中压过照片的候选，都不进入下一轮 renderer 接入。
