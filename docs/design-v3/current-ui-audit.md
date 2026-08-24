# BatchFrame 当前 UI 审查

审查基线：`pages/frame/frame.wxml`、`pages/frame/frame.wxss`、`app.json`（本轮只读，不修改）。

## 具体问题

1. **导航标题重复**：`app.json` 的 `navigationBarTitleText` 是“批量边框助手”，页面内 `.top-bar` 又渲染 `.app-name`“批量装裱”，形成原生标题与内部标题两层品牌入口。V3 应二选一；本方案采用自定义导航栏并隐藏重复原生标题的方向，需下一轮接入时再决定具体微信配置。
2. **品牌色是通用工具蓝紫**：`.btn.primary`、`.export-btn` 使用 `#607cff`，选中态使用 `#7188ff` / `rgba(113,136,255,.18)`，`switch` 和 `slider` 也使用 `#6f8cff`。这组高饱和冷色更像开发者工具或后台面板，和胶片、暖黑暗房、纸基装裱没有材料关联。
3. **描边和卡片层级过多**：`.btn.ghost`、`.choice-chip`、`.small-input`、`.template-card`、`.frame-style-card`、`.color-item` 都同时使用边框；`.top-bar`、`.thumbnail-strip`、`.tool-tabs`、`.setting-sheet`、`.bottom-actions` 又各自有分割线，视觉被大量矩形边界切碎。
4. **字号偏小**：`.panel-hint` 11px、`.field-label` 11px、`.choice-chip` 11px、`.template-card`/`.frame-style-card` 10px、`.setting-row` 12px。尤其 10–11px 文案在 390px 屏幕上既难读，也无法传达摄影工具的安静层级。
5. **预览优先级被控制区稀释**：`.preview-stage` 虽然 `flex: 1`，但 68px `.thumbnail-strip`、48px `.tool-tabs`、最多 225px `.setting-sheet` 和 60px `.bottom-actions` 固定占位；当面板展开或设备高度较短时，照片预览变成“剩余空间”，而不是工作台主体。
6. **缩略图偏像状态列表**：`.thumbnail` 固定 52×52px、圆角 6px，仅用 2px 蓝色边框表示当前项；正常照片、检测状态和顺序关系缺少摄影接触印样的节奏。安全角标 `.security-dot` 只有 13px，`?`/`!` 的工程感强。
7. **“收起”不应是第五个工具标签**：`.tool-tabs` 里 `.panel-toggle` 与四个 `.tool-tab` 并列，但它不是内容工具；且 `flex: 0 0 42px`、11px 文案让用户误以为有第五类编辑能力。V3 应改成面板动作（拖动把手/箭头），从工具导航中移出。
8. **95% 标记不应长期显示**：`.preview-badge` 永久渲染 `{{zoomPct}}%`，定位在预览右上角，且 11px 黑底白字；它是编辑反馈，不是成片信息。V3 只在图片缩放交互后短暂显示，随后淡出，避免持续污染照片观看。
9. **风格卡片无法表达实际效果**：`.template-preview`/`.frame-card-sample` 高度只有 46px，`.template-card`/`.frame-style-card` 宽 94px；`.frame-card-photo` 是 CSS `linear-gradient`，`darkroom-scan` 只是 `rotate(-1deg)` 加四边宽度差，`rough-emulsion` 是虚线边，`.frame-card-mask` 只占样张 20% 高度。卡片并未展示真实角部、长边、齿孔、片基、帧号或侵蚀结构。
10. **空状态与编辑状态语言不统一**：空状态 `.empty-title` 16px、`.empty-copy` 12px，编辑面板标题 `.panel-heading` 14px，主操作却仍是冷蓝 `选择照片`/`批量导出`；产品名称、照片数量和设置标签没有统一的摄影档案语气。
11. **导出按钮抢占视觉权重**：`.export-btn` 42px 高、整宽且使用高饱和蓝色；在照片优先的工具中，按钮应稳定但克制，状态和进度可见，不应比预览更“亮”。
12. **短屏与长屏风险**：页面用 `100vh` + `env(safe-area-inset-bottom)`，但 `.setting-sheet` 的 `min-height:118px`、`max-height:225px` 与顶部/缩略图/工具栏/底部固定区没有按可用高度重新分配；在 390×844 和较矮 Android 屏上，设置面板可能挤压预览，键盘或自定义颜色面板还会进一步改变可见高度。

## V3 设计结论

- 信息架构保持“预览 → 缩略图 → 四个工具 → 当前面板 → 导出”，但只保留一层自定义品牌导航。
- 暗房方向使用暖黑、纸基灰、低饱和赭红；画廊方向使用暖白控制区 + 深色预览舞台。两套方案都把照片本身放在视觉中心。
- 内框选择卡片必须来自同一套设计样张生成脚本，而不是 CSS 渐变占位。
- 本轮所有 PNG 是概念稿；未接入生产页面，需人工选定方向和风格后再进入生产改造。
