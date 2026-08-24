# 参考图驱动的片基内框分析

上一轮的 `film-strip-35mm-full` 和 `film-rebate-minimal` 仍然保留，但概念解释已修正：两者都是 `inner frame style`。

## `film-strip-35mm-full`

- **身份**：片基内框，不是模板。
- **frameRect**：包含上下厚片基、左右窄片基、齿孔、边码和帧号的完整模块。
- **apertureRect**：frameRect 内的矩形照片窗口；照片不绘制到片基区域。
- **外层关系**：大留白时片基模块居中，小留白时片基模块接近画布边界；只改变 `innerAvailableRect`，不改变 renderer 类型。
- **卡片表现**：必须同时看到片基外边、照片窗口和至少一排齿孔，放在“内框 / 片基内框”分组。

## `film-rebate-minimal`

- **身份**：极简片基内框，不是基础模板的替代导航。
- **frameRect**：四边窄片基，上下档案线，单侧边码/圆点。
- **apertureRect**：矩形窗口，四边片基可独立表达，不退化成统一 `frameWidth`。
- **外层关系**：大留白时强调装裱感，小留白时接近扫描片基铺满画布；仍由同一个 output/frame/aperture 模型组成。
- **卡片表现**：展示一个完整角部、两条窄边和边码，名称使用“极简胶片边码”，不使用“胶片模板”。

## 与外层背景的边界

```text
outputRect = 最终图片边界
frameRect  = 内框/片基模块边界
apertureRect = 照片窗口边界
```

外层颜色只能填充 `outputRect`；齿孔、边码和片基只能绘制在 `frameRect - apertureRect` 区域。透明外层背景时片基仍然存在，不能因为背景透明而把片基当成透明装饰。
