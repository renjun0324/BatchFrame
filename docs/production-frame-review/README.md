# Production frame review

这些图由 `tools/generate-frame-contact-sheet.py` 生成，用于检查第一批生产 renderer 的结构差异。生产入口是 `miniprogram/core/innerFrameRenderer.js`；设计稿仍保留在 `docs/design-v3/`，不会被打包。

重新生成：

```bash
python3 tools/generate-frame-contact-sheet.py
```

包含经典细黑边、全幅扫描边、片门压框、35mm 负片、120 中画幅和乳剂破损边的完整构图、角部放大和比例对比。
