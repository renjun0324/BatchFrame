# V3 UI prototype source

`prototype.html` 是结构说明用的静态原型，展示两套色彩方向、固定导航、预览、缩略图、四个工具标签、当前面板和导出区。

PNG 设计稿由仓库根目录执行生成：

```bash
python3 tools/design-v3/generate-design-v3.py
```

脚本使用仓库只读示例 `png/1.jpg` 中的照片局部作为内容示例，不修改原图，也不依赖网络素材。PNG 是确定性 Pillow 输出；本 HTML 用于评审信息架构和设计变量，不是生产 WXML/WXSS。
