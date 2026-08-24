# 胶片边框参考板

`reference-board.png` 是本项目自行绘制的结构示意板，不包含远程照片、品牌标志或真实胶片扫描素材。它用于讨论“边缘结构”而不是复制某一品牌片基。

## 研究来源与观察

以下公开资料只用于确认胶片结构、齿孔和边码的位置关系：

- [SMPTE 56-2005：16mm perforation 规格](https://pub.smpte.org/latest/st56/st0056-2005_stable2015.pdf)：16mm 齿孔是规则矩形，单侧/双侧布局会影响画面边缘。
- [ISO 69 / 16mm film 资料索引](https://es.scribd.com/document/644229288/ISO-69-1998-16mm)：说明 perforated edge 是片基的参考边。
- [Contact Sheet：All about film borders](https://contactsheet.app/magazine/all-about-film-borders)：用于观察不同电影胶片齿孔和边缘结构的历史差异。
- [Negative Supply 120 full-border scanning guide](https://firstcall-photographic.co.uk/products/negative-supply-film-carrier-120-full-border-scanning-guide)：用于确认 120 扫描时边框/rebate 的存在和宽度感。
- [Beyond the Aperture：120 film edge fog / rebate](https://beyondtheaperture.com/2019/10/edge-fog-oh-those-smoky-rebates/)：用于理解 120 片基边缘和画面窗口不是 35mm 齿孔结构。
- [Contact print 概念说明](https://en.wikipedia.org/wiki/Contact_print)：用于确认接触印样的编号、裁切线和档案用途。

## 设计结论

1. 扫描保留边应以连续、窄、低频不对称为主，不能用高频噪点代替。
2. 片门边应有方向性：至少一侧明显更厚，角部出现压框堆积，而不是四边均匀加粗。
3. 35mm 的识别点是齿孔的节奏和帧号；120 的识别点是宽片基/rebate 和单侧标记，不能共用一排齿孔。
4. 16mm 的齿孔应更小、更密，并优先单侧结构；它不能只是缩小版 35mm。
5. 接触印样的核心是档案线、编号和裁切标记，数量应克制，不能变成海报排版。
6. 乳剂侵蚀应表现为少量连续缺口和局部堆积，碎屑是辅助证据，不应铺满照片。

这些结论被写入 `style-dna.md` 和 `implementation-plan.md`，候选图由 `tools/frame-design-v4/generate_candidates.py` 生成。
