# 纠偏后的实现契约（设计阶段）

本契约供下一轮生产接入使用，本轮不修改 renderer。

## 统一数据结构

```javascript
{
  id: 'film-strip-35mm-full',
  name: '35mm 完整片基',
  category: 'film-rebate',
  renderer: 'film-rebate-layout',
  geometry: {
    frameAspectPolicy: 'derived-from-aperture',
    rebates: {
      topRatio: 0.154,
      rightRatio: 0.027,
      bottomRatio: 0.154,
      leftRatio: 0.027
    },
    apertureCornerRadiusRatio: 0.01
  },
  perforations: {
    enabled: true,
    sides: ['top', 'bottom'],
    shape: 'rounded-rect',
    widthRatio: 0.055,
    heightRatio: 0.077,
    cornerRadiusRatio: 0.018
  },
  labels: { enabled: true, position: 'top-left', textPreset: 'BATCHFRAME COLOR 400' },
  frameNumbers: { enabled: true, positions: ['bottom-left', 'bottom-center'] },
  markers: { enabled: true, positions: ['bottom-right'] }
}
```

基础风格也遵守同一契约，只是没有齿孔和边码：

```javascript
{
  id: 'clean-black',
  category: 'basic-frame',
  renderer: 'clean-frame',
  geometry: {
    rebates: {
      topPxAt1800: 8,
      rightPxAt1800: 8,
      bottomPxAt1800: 8,
      leftPxAt1800: 8
    }
  }
}
```

## 必须暴露的纯几何接口

```javascript
layoutInnerFrame({
  outputRect,
  outerLayout,
  imageAspect,
  innerFrameStyle,
  frameSizePreset
})

// 返回
{
  outputRect,
  innerAvailableRect,
  frameRect,
  apertureRect,
  decorationRects: {
    perforations,
    labels,
    frameNumbers,
    markers
  }
}
```

## 强制顺序

1. 创建 `outputRect`。
2. 由外层留白得到 `innerAvailableRect`。
3. 用内框风格和尺寸预设得到完整 `frameRect`。
4. 从片基 rebates 和方向得到 `apertureRect`。
5. 对照片执行 contain/cover 并裁切到矩形 `apertureRect`。
6. 绘制 `frameRect - apertureRect` 的片基主体。
7. 在 frameRect 内绘制齿孔、边码、帧号和标记。

禁止使用“先把照片放满画布，再从 photoRect 向外加统一 `frameWidth`”作为片基内框的主模型。该旧模型无法表达上下厚片基、单侧 rebate 和独立外层留白。

## 回退和一致性

- 片基素材缺失时回退到同一内框体系中的 `clean-black`，不能回退到无内框。
- 预览和导出使用同一个 `layoutInnerFrame` 结果，只有输出分辨率不同。
- `frameRect` 和 `apertureRect` 必须保持矩形；除非人工确认，小圆角半径不得超过窗口短边的 1%。
- `outputRect` 的背景颜色不改变片基颜色、齿孔和边码。
- 设计卡片只是低分辨率调用同一几何契约的静态证据，不能成为另一套布局规则。
