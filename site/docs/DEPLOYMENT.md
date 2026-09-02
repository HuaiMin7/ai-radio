# 部署说明（halou.net.cn）

记录官网与电台在同一台服务器、同一域名下的部署结构，避免两边改动互相覆盖。

## 服务器

| 项 | 值 |
|---|---|
| 云厂商 | 阿里云 ECS（华东2·上海） |
| 系统 | Ubuntu 22.04.5 LTS |
| 公网 IP | 47.116.189.8 |
| Web 服务 | Nginx 1.18.0 |

## 域名与证书

| 项 | 值 |
|---|---|
| 主域名 | www.halou.net.cn（主站，所有访问最终落到这里） |
| 裸域名 | halou.net.cn → 301 跳转到 www |
| HTTP | 80 端口 301 跳转到 HTTPS |
| SSL | Let's Encrypt，certbot 自动续期 |
| 证书路径 | `/etc/letsencrypt/live/halou.net.cn/` |
| ICP 备案 | 皖ICP备2026023953号（已展示在页面底部） |
| 公安备案 | 办理中，代码位置已在 `main.tsx` 的 Footer 预留 |

## 路径分流（关键约定）

Nginx 配置文件：`/etc/nginx/sites-available/halou`

| 路径 | 用途 | 物理目录 / 上游 | 负责人 |
|---|---|---|---|
| `/` | 官网静态站 | `/var/www/halou/site` | 怀民 |
| `/app/` | 电台前端 | `/var/www/halou/app` | Codex |
| `/api/` | 电台后端 API | `proxy_pass http://127.0.0.1:8788` | Codex |

> 注意：电台 API 的实际路径是 **`/api/`**（不是早期预留注释里的 `/app/api/`），
> 以线上现状为准。

电台 Node 后端只监听 `127.0.0.1:8788`，不对公网开放，只能经 Nginx 访问。

## 协作边界（建议）

为避免两边覆盖对方配置：

**怀民（官网）**
- ✅ `/var/www/halou/site/*`
- ✅ Nginx 中 `location /` 段、SSL、www 跳转
- ❌ 不改 `/var/www/halou/app/*`、不动 Node 服务

**Codex（电台）**
- ✅ `/var/www/halou/app/*`
- ✅ Nginx 中 `location /app/`、`location /api/` 段
- ✅ Node 后端与 systemd 单元
- ❌ 不覆盖整个 Nginx 配置文件，不改 `location /` 与 SSL 段

> 2026-07-29 实测：Codex 部署电台时以增量方式追加了 `/app/` 与 `/api/`，
> 官网的 `location /`、SSL、跳转配置均未被破坏，协作方式有效。

## 电台部署流程

电台发布必须区分 Git、服务器源码、静态产物和线上响应，不能用其中任意一个状态代替完整发布结果。

1. 从当前 `origin/main` 构建并记录完整提交 SHA。
2. 运行 `npm run build`、`npm run build:public` 和本次改动相关的检查脚本。
3. 备份 `/opt/redio` 源码、`/var/www/halou/app` 前端和 `/opt/redio/.env`。
4. 同步源码到 `/opt/redio`，必须排除并保留 `.env`、`data/`、`cache/`、`node_modules/`、`.venv/`、`backups/` 和 `RELEASE`。
5. 把新的公开前端产物切换到 `/var/www/halou/app`，保留上一版目录或压缩包用于回滚。
6. 重启 `redio.service`，检查 systemd 状态、启动日志和本机 `/api/health`。
7. 从公网检查 `/app/`、`/api/health` 和本次发布涉及的关键接口及 UI。
8. 所有必需检查通过后，才更新 `/opt/redio/RELEASE`。

公开环境中的 `AI_RADIO_SESSION_SECRET` 和 `AI_RADIO_CREDENTIAL_SECRET` 都必须是至少 32 字符的稳定独立值；只允许保存在权限为 `600` 的 `/opt/redio/.env`，不得进入源码、日志、截图或发布标记。

`/opt/redio/RELEASE` 至少记录：

```text
commit=<完整 Git SHA>
pr=<PR 编号>
deployed_at=<UTC ISO 时间>
scope=<发布范围>
```

### 当前电台发布

2026-09-02 已部署 PR #17：

```text
commit=a69158cf09622b6cb61e3c0a589629906c3aa054
pr=17
scope=qq-plugin-free-login
```

已验证公开页面、健康接口、二维码创建和归属隔离、未登录 Cookie 导入拦截、生产 Qwen TTS 与登录弹窗。真实用户扫码后页面已自动恢复账号和 8 首队列，真实 QQ 歌曲播放进度持续推进；完整浏览器矩阵仍单独记录为待验收项。

## 官网部署流程

官网是纯静态站，**没有热更新**，每次改动都需要重新构建并上传：

```bash
cd site
npm ci
npm run build                 # 产物 dist/
bash scripts/deploy.sh        # 打包 → 上传 → 替换 → 修正属主
```

`deploy.sh` 可在 macOS 和 Linux 运行。部署失败会直接退出，不会继续用旧页面的
HTTP 200 状态误报成功。

手工等价操作：

```bash
tar czf site.tgz -C dist .
# 上传到服务器后
find /var/www/halou/site -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
tar xzf site.tgz -C /var/www/halou/site
chown -R www-data:www-data /var/www/halou/site
```

不需要 reload Nginx（静态文件直接生效）。

## 官网回滚

部署前 `deploy.sh` 会在服务器保留一份上一版本备份：
`/var/www/halou/backup/site-<时间戳>.tgz`

回滚：

```bash
tar xzf /var/www/halou/backup/site-<时间戳>.tgz -C /var/www/halou/site
```

## 电台回滚

1. 恢复发布前的 `/opt/redio` 源码备份，但保留当前 `.env`、`data/`、`cache/` 和账号凭据。
2. 把 `/var/www/halou/app` 恢复为发布前静态备份或保留的上一版目录。
3. 重启 `redio.service`，确认本机和公网 `/api/health`。
4. 恢复并核对上一版 `/opt/redio/RELEASE`，不要只凭 HTTP 200 判断回滚完成。

Nginx 配置未参与普通电台发布，不应在回滚时整文件覆盖。
