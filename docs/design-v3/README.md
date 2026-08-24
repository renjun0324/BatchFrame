# BatchFrame V3 视觉设计阶段

本目录是设计评审资料，不是生产实现。当前分支的 `pages/`、`core/`、`utils/contentSecurity.js`、`cloudfunctions/checkImage/` 和配置文件均未因本轮设计而修改。

## 重新生成

```bash
python3 tools/design-v3/generate-design-v3.py
```

脚本会重新生成：

- `ui/`：暗房工作台和画廊装裱两套方向，390×844 与 412×915 两种尺寸；包含空状态、模板、画布、内框、导出和安全异常状态。
- `frame-styles/`：九个基础/胶片概念样张、完整 contact sheet、角部细节和比例对比。

## 人工需要确认

1. UI 主方向：`darkroom` 暗房工作台或 `gallery` 画廊装裱。
2. 胶片系列是否纳入第一批生产：全幅扫描、片门压框、35mm 负片、120 中画幅、16mm 电影胶片、接触印样边、乳剂破损边。
3. 是否保留 `none` 与 `clean-black` 作为基础选项但降低宣传权重。
4. 齿孔、帧号和接触印样标记在小屏真机上的密度上限。

未经人工视觉评审，本目录不宣称最终 UI 或最终边框已经确定。
