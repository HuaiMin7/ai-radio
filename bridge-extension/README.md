# Redio Bridge

Redio Bridge 是本地开发用的 Chrome/Edge 扩展，用来把 QQ 音乐网页登录态同步给本机 Redio。

## 本地安装

1. 打开 Chrome/Edge 的扩展管理页。
2. 开启「开发者模式」。
3. 选择「加载已解压的扩展程序」。
4. 选择本目录：`bridge-extension`。
5. 回到 Redio 设置页，点击「重新检测」或刷新页面。

## 工作方式

- Redio 网页不能直接读取 `y.qq.com` 的 Cookie。
- 该扩展在用户授权后读取 `*.qq.com` Cookie。
- 扩展只回传 QQ 音乐登录和播放需要的 Cookie 字段给 `127.0.0.1:5173` 页面。
- Redio 页面再把 Cookie 保存到本机 API：`POST /api/qq/login/cookie`。

## 注意

- Cookie 只用于个人本机播放验证，不要提交到 git。
- 如果只检测到 `p_skey`，说明只是账号态；完整播放通常还需要 `qm_keyst`、`qqmusic_key`、`music_key` 或 `wxskey`。
