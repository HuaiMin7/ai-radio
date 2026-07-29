# Redio Bridge

Redio Bridge 是 Redio 网页端使用的 Chrome/Edge 扩展，用来把 QQ 音乐网页登录态同步给 Redio。

## 本地安装

1. 打开 Chrome/Edge 的扩展管理页。
2. 开启「开发者模式」。
3. 选择「加载已解压的扩展程序」。
4. 选择本目录：`bridge-extension`。
5. 回到 Redio 设置页，点击「重新检测」或刷新页面。

## 工作方式

- Redio 网页不能直接读取 `y.qq.com` 的 Cookie。
- 该扩展在用户授权后读取 `*.qq.com` Cookie。
- 扩展只回传 QQ 音乐登录和播放需要的 Cookie 字段给 `halou.net.cn` 或本地开发页面。
- Redio 页面把登录态交给同源 API 验证；验证通过后由 Redio 签发 HttpOnly 会话。
- 聊天、推荐、播放历史、队列和反馈按验证后的 QQ 音乐账号隔离。

## 注意

- Cookie 只用于 QQ 音乐账号验证和该账号的音乐播放，不要提交到 git。
- 如果只检测到 `p_skey`，说明只是账号态；完整播放通常还需要 `qm_keyst`、`qqmusic_key`、`music_key` 或 `wxskey`。
