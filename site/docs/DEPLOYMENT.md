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

## 回滚

部署前 `deploy.sh` 会在服务器保留一份上一版本备份：
`/var/www/halou/backup/site-<时间戳>.tgz`

回滚：

```bash
tar xzf /var/www/halou/backup/site-<时间戳>.tgz -C /var/www/halou/site
```
