# AGENTS.md

本文档用于指导 AI 代码助手（Codex、Claude Code、Cursor、Copilot 等）理解本项目的结构、运行方式和开发约束。后续继续开发时，先读本文件，再读相关源码。

## 项目定位

本项目是一个本地优先的个人 AI 电台原型，当前目标不是正式商用上线，而是先跑通 MVP：

- 读取用户音乐口味、作息、歌单和情绪规则。
- 组装上下文 prompt。
- 调用大模型生成 DJ 文案、推荐歌曲、推荐理由和衔接方式。
- 通过音乐适配器解析可播放音源。
- 在 Web 播放器里播放歌曲，并保留播放历史 / 推荐记录。

当前产品名在界面中使用 `Redio`，项目名为 `AI Radio`。

## 当前技术栈

- 前端：React 19 + Vite + TypeScript。
- 后端：Node.js 原生 HTTP server + TypeScript，通过 `tsx` 运行。
- 大模型：OpenAI-compatible HTTP adapter，通过阿里云百炼调用 `deepseek-v4-flash`。
- 音乐：默认 QQ 音乐解析；QQ 失败保持显式失败并尝试可播种子曲目，不把本地测试音频伪装成推荐歌曲。旧 NetEase adapter 仅保留为显式开启的 legacy 测试路径。
- 状态：本地 JSON 文件，写入 history、queue 和 feedback。

## 目录结构

```text
.
├── web/src/              # 主前端代码
│   ├── App.tsx           # 当前主播放器、聊天浮窗、播放记忆入口
│   ├── main.tsx
│   └── styles.css
├── server/               # 本地 API server
│   ├── index.ts          # HTTP server 入口
│   ├── router.ts         # API 路由
│   ├── context.ts        # prompt 上下文组装
│   ├── brain.ts          # 大模型 adapter
│   ├── music.ts          # 音乐 adapter
│   ├── state.ts          # 当前播放状态
│   ├── history.ts        # 播放历史 / 推荐记录
│   ├── scheduler.ts      # 后续节目调度
│   └── tts.ts            # Qwen TTS / macOS say fallback
├── user/                 # 用户个人资料
│   ├── taste.md
│   ├── routines.md
│   ├── mood-rules.md
│   └── playlists.json
├── prompts/              # 系统提示词
│   └── dj-persona.md
├── public/audio/         # 本地测试音频
├── bridge-extension/     # QQ 音乐网页登录态同步扩展
├── data/                 # 本地持久化数据
└── cache/                # 后续音频缓存
```

## 本地启动

推荐一键启动本地基础服务：

```bash
npm run dev:all
```

也可以分别启动：

```bash
npm run dev:api
npm run dev
```

- 前端地址：`http://127.0.0.1:5173/`
- 本地 API：`http://127.0.0.1:8788`

如果显式启用旧 NetEase 测试路径，还需要单独启动 `NeteaseCloudMusicApi`：

```bash
npm run dev:netease
```

默认地址应为：

```text
http://127.0.0.1:3000
```

## 环境变量

不要把真实密钥写进代码、README、截图或提交记录。只允许写在本地 `.env`。

`.env.example` 当前约定：

```env
AI_RADIO_BRAIN_PROVIDER=custom-http
AI_RADIO_SESSION_SECRET=
AI_RADIO_SECURE_COOKIES=0
AI_RADIO_MODEL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_RADIO_MODEL_NAME=deepseek-v4-flash
AI_RADIO_MODEL_API_KEY=

AI_RADIO_MUSIC_PROVIDER=qq
AI_RADIO_NETEASE_API_BASE_URL=http://127.0.0.1:3000
# Hidden legacy mode. Keep disabled unless explicitly testing the old NetEase adapter.
AI_RADIO_ENABLE_NETEASE_PROVIDER=0
AI_RADIO_ENABLE_NETEASE_SERVICE=0

AI_RADIO_QWEATHER_HOST=https://api.qweather.com
AI_RADIO_QWEATHER_LOCATION=
AI_RADIO_QWEATHER_API_KEY=
AI_RADIO_QWEATHER_TOKEN=

AI_RADIO_TTS_PROVIDER=aliyun-qwen-tts
AI_RADIO_TTS_MODEL=qwen3-tts-instruct-flash-realtime
AI_RADIO_TTS_VOICE=Cherry
AI_RADIO_TTS_INSTRUCTIONS=语速自然偏慢，声音温暖，有夜间电台 DJ 的陪伴感。
AI_RADIO_TTS_WEBSOCKET_URL=wss://dashscope.aliyuncs.com/api-ws/v1/realtime
AI_RADIO_TTS_PYTHON=
AI_RADIO_TTS_MACOS_VOICE=
AI_RADIO_TTS_MACOS_RATE=
DASHSCOPE_API_KEY=
```

说明：

- `AI_RADIO_BRAIN_PROVIDER=custom-http`：走 OpenAI-compatible 接口。
- `AI_RADIO_SESSION_SECRET`：签名本站会话并派生账号凭据加密密钥；公开部署必须使用至少 32 字符的稳定随机值。
- `AI_RADIO_SECURE_COOKIES=1`：公开 HTTPS 部署必须启用，确保本站会话 Cookie 只通过 HTTPS 发送。
- `AI_RADIO_MODEL_BASE_URL`：模型服务 base URL。
- `AI_RADIO_MODEL_NAME`：模型名，例如 `deepseek-v4-flash`。
- `AI_RADIO_MODEL_API_KEY`：本地填写，不要提交。
- `AI_RADIO_MUSIC_PROVIDER=qq | local | netease`：音乐来源；默认 `qq`，`netease` 需要同时启用 legacy 开关。
- `AI_RADIO_NETEASE_API_BASE_URL`：旧 NetEase 本地服务地址。
- `AI_RADIO_ENABLE_NETEASE_PROVIDER`：设为 `1` 时才允许 `AI_RADIO_MUSIC_PROVIDER=netease` 生效。
- `AI_RADIO_ENABLE_NETEASE_SERVICE`：设为 `1` 时 `npm run dev:all` / `npm run dev:check` 才会纳入 NetEase 服务。
- `AI_RADIO_QWEATHER_LOCATION`：和风天气 location，可填城市 ID 或经纬度。
- `AI_RADIO_QWEATHER_API_KEY`：和风天气 API KEY，本地填写即可。
- `AI_RADIO_QWEATHER_TOKEN`：和风天气 JWT Token，可选；本项目优先使用 API KEY。
- `AI_RADIO_TTS_PROVIDER=aliyun-qwen-tts`：默认走阿里云百炼实时 TTS；不可用时保留 macOS `say` fallback。

## 当前 API 契约

后端路由集中在 `server/router.ts`。

```text
GET  /api/profile       # 读取 user/ 下的用户资料
GET  /api/now           # 当前播放状态
GET  /api/history       # 播放历史 / 推荐记录
GET  /api/chat          # 当前音乐账号的普通聊天 / 推荐对话
GET  /api/queue         # 播放队列
GET  /api/feedback      # 歌曲反馈记录
GET  /api/weather       # 天气上下文
GET  /api/audio/proxy   # 代理远端音频并保留 Range 请求
GET  /api/qq/login/status # QQ 音乐登录状态
POST /api/qq/login/qr   # 生成服务端 QQ 登录二维码
GET  /api/qq/login/qr/:id # 轮询并完成 QQ 登录
GET  /api/qq/search     # QQ 音乐搜索
GET  /api/lyrics        # 当前歌曲歌词
GET  /api/context       # 当前组装后的 prompt 上下文
POST /api/plan          # 根据用户输入生成新节目段落
POST /api/tts           # 生成 DJ 语音
POST /api/resolve-track # 解析单曲可播放状态
POST /api/feedback      # 记录喜欢 / 跳过 / 重播
POST /api/qq/login/cookie # 仅本地开发可手动保存 QQ Cookie，公开站禁用
POST /api/qq/logout     # 清除本地 QQ Cookie
```

`POST /api/plan` 请求体：

```json
{
  "message": "给我来一段适合晚上放松的电台"
}
```

大模型应返回的核心结构：

```json
{
  "say": "DJ 文案",
  "play": [
    {
      "title": "歌曲名",
      "artist": "歌手",
      "intro": "这首歌独立的 DJ 文案，60-100 个中文字符"
    }
  ],
  "reason": "推荐原因",
  "segue": "fade"
}
```

`segue` 只允许：

- `fade`
- `cut`
- `silence`

后端会补充：

- `episode`
- `audioUrl`
- `audioLabel`
- `source`
- `matchedTitle`
- `matchedArtist`
- `externalUrl`
- `coverUrl`
- `playbackStatus`
- `failureReason`

## 当前已完成能力

- 前端播放器主界面。
- 聊天输入和发送。
- 通过百炼调用 DeepSeek 生成 DJ 文案和歌曲推荐。
- `custom-http` 大模型 adapter。
- `local` 音乐 adapter。
- `qq` 音乐 adapter，依赖本地 QQ 登录 Cookie 才能尽量拿到完整播放 URL。
- Redio Bridge 浏览器扩展和桌面登录窗口可同步本地 QQ 音乐登录态。
- 公开站通过服务端 QQ 扫码授权建立签名 HttpOnly 会话。
- `netease` 音乐 adapter 仍在代码中，但默认禁用，只作为 legacy 测试路径。
- `aliyun-qwen-tts` TTS adapter，保留 `macos-say` fallback。
- 歌曲播放、暂停、上一首、下一首、进度条、音量浮层。
- 每首歌有独立 DJ 文案，目标 60-100 个中文字符，后端硬上限 100。
- 歌曲与 DJ 文案同时开始；DJ 播报期间歌曲音量缓降到 50%，结束后恢复。
- 普通聊天、推荐对话、播放历史、队列和反馈按 QQ 音乐账号写入 `data/users/<account-hash>/`。
- QQ 音乐凭据按账号加密写入，不再以全局明文 Cookie 作为公开站身份。
- 前端“播放记忆”面板展示最近记录。

## 当前限制

- QQ 音乐完整播放通常依赖本地登录 Cookie；无可播放 URL 时必须明确显示失败，可尝试替换为已验证可播种子曲目，但不得把本地测试音频显示成原推荐歌曲。
- NetEase 是 legacy 测试路径，默认不启动、不作为产品主路径。
- 当前已有单服务器、多音乐账号隔离，但仍是文件型存储，不是云数据库。
- `user/` 下的初始口味资料仍是共享种子配置，尚未同步每个 QQ 账号的完整音乐资料库。
- TTS 默认使用阿里云百炼实时接口，本地环境或密钥不可用时才退回 macOS `say`。
- 现在重点是验证 MVP，不要提前做复杂部署和权限系统。

## 推荐的下一步

当前下一步优先稳定真实音源链路：

1. 提高 QQ 搜索、匹配和 vkey 解析成功率。
2. 验证 Redio Bridge 登录同步和退出登录闭环。
3. 保持每首歌的 DJ `intro` 随歌曲连续播放。
4. 新增其他 provider 前先定义明确的登录、解析和失败语义。

## 开发原则

- 先保证 MVP 跑通，再做视觉 polish 和云部署。
- 不要把 API Key 写入源码。
- 不要为了未来扩展提前写复杂抽象。
- 优先修改最小范围文件。
- 涉及大模型返回结构时，必须保持 JSON 校验。
- 涉及音乐播放时，必须保留显式本地测试路径；不得把 fallback 标成真实推荐歌曲。
- 前端中文界面优先，避免中英文混杂，除非是品牌名或技术名。
- 修改后至少运行：

```bash
npm run build
```

## 每次功能完成后的自查要求

每次完成一个功能、修复一个 Bug 或调整 UI 后，必须做真实自查，而不是只口头说明。自查目标是尽早发现影响用户使用的问题。

最低检查项：

1. 前端构建
   - 运行 `npm run build`。
   - 如果 TypeScript 或 Vite 构建失败，先修复再交付。

2. 后端接口
   - 对本次涉及的接口做实际请求验证。
   - 重点检查 500、404、JSON 结构不一致、模型调用失败、音乐解析失败等问题。
   - 常用接口包括 `/api/now`、`/api/plan`、`/api/history`、`/api/profile`、`/api/context`。

3. 页面 UI
   - 打开 `http://127.0.0.1:5173/` 实际查看页面。
   - 检查明显错位、内容遮挡、文字溢出、按钮被盖住、浮层位置异常、移动宽度下布局崩坏。

4. 核心交互
   - 验证本次改动相关按钮可以点击。
   - 验证输入框可以输入和提交。
   - 验证生成节目、播放 / 暂停、切歌、音量、聊天、播放记忆等关键路径没有失效。

5. AI 生成链路
   - 如果本次改动涉及大模型、prompt、context 或 `/api/plan`，必须实际触发一次生成。
   - 检查是否返回合法 JSON、是否有 DJ 文案、推荐歌曲、推荐原因和衔接方式。

6. 音乐播放链路
   - 如果本次改动涉及音乐 adapter 或播放器，必须确认至少一种音源可以播放。
   - QQ 音乐不可播放时，必须确认失败状态清晰；涉及 fallback 时确认本地测试音频仍然可用。

发现明确 Bug 时，可以直接修复；修复后重新执行相关自查。最终回复用户时输出简短检测报告，至少包含：

- 改了什么。
- 检查了什么。
- 是否发现并修复 Bug。
- 仍然存在的限制或未验证项。

## 常见故障排查

### 前端打不开

确认：

```bash
npm run dev
```

然后访问：

```text
http://127.0.0.1:5173/
```

### API 请求失败

确认：

```bash
npm run dev:api
```

然后检查：

```text
http://127.0.0.1:8788/api/now
```

### 大模型没有回复

检查 `.env`：

```env
AI_RADIO_BRAIN_PROVIDER=custom-http
AI_RADIO_MODEL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_RADIO_MODEL_NAME=deepseek-v4-flash
AI_RADIO_MODEL_API_KEY=
```

不要把密钥打印到聊天里。

### QQ 音乐不能播放

确认本地 QQ 登录状态：

```text
http://127.0.0.1:8788/api/qq/login/status
```

完整播放通常需要本地 Cookie 中包含 `qm_keyst`、`qqmusic_key`、`music_key` 或 `wxskey`。Cookie 只允许保存在本地 `data/qq-cookie.txt`，不要提交。

### 旧 NetEase 音乐不能播放

仅在 legacy 测试时启用：

```env
AI_RADIO_ENABLE_NETEASE_PROVIDER=1
AI_RADIO_ENABLE_NETEASE_SERVICE=1
AI_RADIO_MUSIC_PROVIDER=netease
```

然后确认本地 NetEase API 服务：

```text
http://127.0.0.1:3000/search?keywords=周杰伦&limit=1
```

如果 `/song/url` 没有返回可播放 URL，legacy 路径应 fallback 到本地测试音频。

## 给后续 AI 助手的注意事项

- 先读 `AGENTS.md`、`README.md`、`server/README.md`、`web/README.md`。
- 不要默认用户想要上线部署；当前阶段默认本地 MVP。
- 不要改 `.env` 或泄露 `.env` 内容。
- 如果需要新增 provider，优先在 `server/brain.ts` 或 `server/music.ts` 做 adapter，不要把 provider 逻辑散落到前端。
- 如果新增持久化字段，同时更新 `server/history.ts` 的类型和前端展示。
- 如果要改 UI，先确认是否是产品功能必需；当前优先级低于“能对话、能推荐、能播放、能发声”。
