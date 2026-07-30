# 哈喽官网（halou.net.cn）

TuneChat / 哈喽 的官方网站前端，与 Redio 电台应用同域部署。

- 线上地址：https://www.halou.net.cn
- 电台入口：点击首页 Hero 中间的动效 "TuneChat"，在新标签页打开 https://www.halou.net.cn/app/

## 技术栈

- React 18 + TypeScript
- Vite 5
- Tailwind CSS
- framer-motion（Cover 悬停动效）
- @tsparticles（粒子系统）

## 本地开发

```bash
cd site
npm ci
npm run dev          # http://localhost:5173
```

本地构建需要 Node.js 20.19 或更高版本。

## 构建与部署

```bash
npm run build        # 产物在 site/dist
bash scripts/deploy.sh   # 构建 + 上传到服务器（需 DEPLOY_HOST / DEPLOY_PASS）
```

部署目标：`/var/www/halou/site`（Nginx 静态托管）

## 目录结构

```
site/
├── src/
│   ├── main.tsx                      # 入口：NavBar / Hero / Placeholder / Footer
│   ├── index.css                     # 全局样式（响应式根字号、自定义光标）
│   ├── components/ui/
│   │   ├── cover.tsx                 # Aceternity Cover 悬停动效（粒子+激光+抖动）
│   │   ├── sparkles.tsx              # tsparticles 粒子层
│   │   └── custom-cursor.tsx         # 跟随光标（mix-blend-mode 反色）
│   └── lib/utils.ts
├── index.html
└── vite.config.ts
```

## 与电台（/app）的关系

官网与电台部署在**同一域名**下，通过 Nginx 路径分流：

| 路径 | 内容 | 目录 | 负责 |
|---|---|---|---|
| `/` | 官网静态站 | `/var/www/halou/site` | 怀民 |
| `/app/` | 电台前端 | `/var/www/halou/app` | Codex |
| `/api/` | 电台后端 API | 反代 `127.0.0.1:8788` | Codex |

官网侧的电台入口集中在 `src/main.tsx` 的 `APP_URL` 常量，改动只需一处。

详见 [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)。
