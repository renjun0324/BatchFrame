# BatchFrame 片基内框的正确产品模型

本次纠偏的结论是：胶片片基属于 `Inner Frame Module`，不是第三层，也不是独立模板或新的编辑工具。

## 成片层级

```text
Output Canvas
├── Outer Background
│   └── 背景色、外层留白、输出比例
└── Inner Frame Module
    ├── Frame Outer Boundary
    ├── Film Rebate / Border Body
    ├── Aperture
    │   └── Photo Content
    ├── Perforations (optional)
    ├── Labels (optional)
    ├── Frame Numbers (optional)
    └── Markers (optional)
```

外层背景决定“成片放在什么画布上”；片基内框决定“照片周围是什么结构”。片基不能被当作外层背景，也不能成为第三个独立编辑层。

## 产品语言

BatchFrame 仍然是批量双层照片边框工具：

```text
外层背景 / 留白 → 内框模块（细线或片基） → 矩形照片窗口
```

35mm、120、16mm 和接触印样只是在“内框”栏目里选择不同的 `Inner Frame Module` 结构。它们不是胶片滤镜、相机模式或独立输出模板。

## 内框分组

一级工具只有：

```text
模板 · 画布 · 内框 · 图片
```

“内框”面板内部显示两组：

### 基础内框

- 无内框
- 经典细黑边
- 全幅扫描边
- 乳剂破损边

### 片基内框

- 35mm 完整片基
- 极简胶片边码
- 120 中画幅片基
- 16mm 电影片基
- 接触印样片基

分组只用于帮助用户理解结构，不增加新的一级导航。

## 外层留白的两种状态

同一个片基内框数据模型必须同时支持：

1. **大外层留白**：暖白或白色背景明显可见，片基模块居中，照片窗口位于片基内部。
2. **小外层留白**：片基模块几乎填满输出画布，但它仍然是 `frameRect`，不是 `outputRect`。

对应样张见：

- [35mm 大/小外层留白](candidates/film-strip-35mm-full/large-outer-margin.png)、[几何图](candidates/film-strip-35mm-full/geometry-large-margin.png)
- [极简片基大/小外层留白](candidates/film-rebate-minimal/large-outer-margin.png)、[几何图](candidates/film-rebate-minimal/geometry-large-margin.png)

## 明确禁止

- 不新增“胶片”一级工具。
- 不把片基当作外层背景颜色。
- 不用一个全画布 PNG 代替内框模块。
- 不把照片窗口裁成椭圆或胶囊。
- 不为了表达片基而引入滤镜、颗粒、漏光或调色。
