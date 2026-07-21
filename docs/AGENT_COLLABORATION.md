# Redio Agent Collaboration

本文档用于两边 Agent 开工前对齐分支、职责和改动边界，目标是减少冲突，保持 `main` 始终可运行。

## Branch Model

```text
main                                  # 稳定主干，只合并验证通过的代码
├── codex/<backend-or-recommendation> # Codex：后端逻辑、播放链路、推荐算法
└── Seal/<frontend-interaction>       # Seal：前端 UI、Figma 和交互细节
```

规则：

- 所有功能从 `main` 或最新稳定分支切出。
- 不直接向 `main` 提交。
- 每个功能完成后提交 PR，再合并。
- 合并前至少运行 `npm run build` 和 `npm run dev:check`。

## Ownership

### Codex 负责

- 后端播放链路：
  - QQ 音源解析
  - 本地音频代理
  - 播放状态 `full / failed / fallback`
  - queue / history / feedback 持久化
- 推荐算法：
  - LLM prompt
  - 用户品味画像
  - 可播歌曲补齐
  - 避免重复推荐
- API 契约：
  - `server/router.ts`
  - `server/music.ts`
  - `server/qq-music.ts`
  - `server/state.ts`
  - `server/queue.ts`
  - `server/history.ts`

### 外部 Agent 负责

- UI / Figma 还原：
  - 页面布局
  - 视觉样式
  - 响应式适配
  - 组件状态展示
- 前端交互细节：
  - 按钮样式
  - 空状态 / loading 状态
  - 页面切换
  - 视觉动效
- 主要文件：
  - `web/src/App.tsx`
  - `web/src/styles.css`
  - `web/src/StarfieldCanvas.tsx`
  - `public/images/*`
  - `public/fonts/*`

## Shared Boundary

`web/src/App.tsx` 是高冲突文件。外部 Agent 可以改 UI 结构，但不要改变这些业务语义：

- 不要绕过 `/api/plan`。
- 不要直接在前端拼 QQ 音源 URL。
- 不要把 `failed` 或 `fallback` 显示成完整歌源。
- 不要删除音频代理逻辑。
- 不要修改播放队列的核心状态判断，除非同步后端契约。

如果 UI 需要新字段，先在 PR 中说明字段名和用途，再由 Codex 补 API。

## API Contract

前端应依赖以下接口：

```text
GET  /api/now
GET  /api/queue
GET  /api/history
GET  /api/feedback
GET  /api/qq/login/status
GET  /api/qq/search
GET  /api/lyrics
GET  /api/audio/proxy
POST /api/plan
POST /api/resolve-track
POST /api/feedback
POST /api/qq/login/cookie
POST /api/qq/logout
```

播放状态语义：

```text
full      # 已确认可播放完整歌源
unverified # 已拿到地址，但尚未确认完整性
failed    # 当前账号 / QQ 接口没有可播放 URL
fallback  # 本地测试音频，不代表真实歌曲
```

产品上只能把 `full` 当作真正可播成功。

## Merge Checklist

每个 PR 合并前至少确认：

- `npm run build` 通过。
- `npm run dev:check` 通过。
- 前端地址可打开：`http://127.0.0.1:5173/`
- API 可打开：`http://127.0.0.1:8788/api/now`
- 如果改了播放链路，至少验证一首 QQ `full` 歌曲能通过 `/api/audio/proxy` 返回音频字节。
- 如果改了 UI，确认聊天、播放、切歌、设置页入口没有明显错位。

## Conflict Policy

- 后端逻辑冲突时，以 Codex 分支为准。
- Figma / UI 视觉冲突时，以外部 Agent 分支为准，但不得破坏 API 契约。
- 冲突文件先手动 review，不使用整文件覆盖。
- 涉及 `.env`、Cookie、密钥、本地数据文件时，不提交。
