# 内容安全检测部署说明

本次修复同时修改了 `cloudfunctions/checkImage`。只重新编译小程序不会更新云端逻辑，必须重新上传并部署云函数。

在微信开发者工具中：

1. 打开 `cloudfunctions/checkImage`，右键选择“上传并部署：云端安装依赖”。
2. 等待部署完成后，再重新编译小程序。
3. 真机导入普通 JPG，确认图片立即进入编辑页，后台状态最终变为 `passed`。
4. 若 CDN 主机仍未被白名单识别，日志应出现 `UNTRUSTED_CDN_HOST`，随后出现 `transport: upload-fallback`；这时应确认回退检测和导出均成功。

云函数默认只信任以下精确后缀（含合法子域）：

- `tcb.qcloud.la`
- `tcloudbaseapp.com`
- `tcloudbasegateway.com`

如果部署后从脱敏日志确认了当前环境的其他精确 CDN 后缀，可在云函数环境变量 `TRUSTED_CDN_HOST_SUFFIXES` 中以逗号分隔追加。不要填写父级泛域名、任意 `.com` 或完整签名 URL。当前仓库没有预填无法确认的临时 CDN hostname。

临时审核副本使用 `temp-check/` 路径，检测完成后客户端会在 `finally` 中尝试删除 fileID；删除失败不会改变检测结果，仍应配置云端生命周期规则定期清理。
