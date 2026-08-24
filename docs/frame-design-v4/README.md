# BatchFrame V4 胶片边框视觉候选

这是人工评审资料，不是生产功能。当前提交没有修改 `miniprogram/`，也不会改变小程序包体。

## 重新生成

```bash
python3 tools/frame-design-v4/generate_candidates.py
python3 tools/frame-design-v4/generate_reference_board.py
```

生成内容：

- `reference-board.png`：结构参考示意板；
- `styles/<style-id>/`：横图、竖图、方图、角部/长边局部、手机模拟和选择卡片；
- `blind-review/`：系列全图、角部细节、选择卡片和匿名盲评图。

## 评审顺序

1. 先看 `blind-review/blind-without-labels.png`，只按形态记录匿名编号；
2. 再看 `series-a-*` 和 `series-b-*`，判断系列边界是否清楚；
3. 打开各候选目录的 `phone-preview.png`，确认手机尺寸下仍能区分；
4. 最后结合 `style-dna.md` 和 `implementation-plan.md` 选择第一批，最多六个。

候选图使用仓库已有 `docs/readme-assets/example.jpg`，通过固定 Pillow 脚本生成。它们是视觉方案样张，不是对生产 Canvas 的像素级承诺；接入生产前仍需用真实 renderer 重新生成并进行真机检查。
