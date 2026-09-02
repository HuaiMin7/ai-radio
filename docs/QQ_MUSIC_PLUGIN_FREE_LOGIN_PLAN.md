# Redio QQ 音乐免插件登录与播放方案

> 文档版本：v1.2  
> 日期：2026-09-02  
> 状态：PR #17 已合并并部署；本地及生产真实账号扫码播放已验证，完整浏览器矩阵待继续验收
> 适用范围：Redio 单服务器公开 Beta  
> 本期主题：免安装 Bridge 完成 QQ 音乐登录、播放授权验证和账号数据恢复

## 1. 文档目的

本文档定义 Redio 网页端从 Bridge 默认登录迁移到服务端 QQ 二维码登录的产品方案、技术架构、接口契约、安全要求、实施步骤、验收标准和回滚方式。

本期只解决一条完整链路：

```text
生成二维码
→ 用户扫码确认
→ 服务端验证 QQ 账号
→ 服务端验证播放票据
→ 签发 Redio 会话
→ 前端自动加载账号数据
→ 真实 QQ 歌曲播放
```

本期不同时重构推荐算法、8 首批量解析、双播放器或其他无关 UI，确保每项改动都直接服务于“免插件登录并播放”。

### 1.1 评审意见闭环

本版已吸收《QQ 免插件登录方案评审意见》的合并前要求：

| 评审项 | v1.1 落地方式 |
|---|---|
| 二维码归属 | 创建二维码时设置短期 `redio_login`，服务端仅保存其 SHA-256；状态查询用恒定时间比较校验，不匹配统一返回 404 |
| 会话签发 | 只有同一归属校验通过且状态为 `ready` 的查询请求，才在该响应中设置 `redio_session` |
| 密钥拆分 | 新凭据使用 `AI_RADIO_CREDENTIAL_SECRET`；旧 v1 密文仍用原会话派生密钥读取，并在首次读取后自动重写为 v2 |
| 非开发环境启动保护 | `NODE_ENV=production` 或 `AI_RADIO_PUBLIC_DEMO=1` 时，两个密钥任一少于 32 字符都拒绝启动 |
| 轮询限速 | 二维码创建和状态查询在本地、公开模式下都受独立限流；单登录会话最短 1.5 秒才访问一次 QQ 上游 |
| 异步授权 | 扫码确认后进入 `authorizing → verifying_account → verifying_playback → ready/error`；异常成为终态，不重复跑授权交换 |
| 真实播放探测 | 使用可配置的 3–5 首探测歌曲，必须取得 vkey、QQ CDN URL 和成功的 Range 响应；区分缺票据与探测歌曲均不可用 |
| Bridge 行为 | 默认二维码模式不再自动检测或同步 Bridge；Bridge 仅在设置页由用户手动触发 |
| 音频代理 | 从所有 `*.qq.com` 收紧到 `*.stream.qqmusic.qq.com`、`*.music.tc.qq.com` 与已验证的 `aqqmusic.tc.qq.com` |
| 自动化检查 | 新增 `npm run check:qq-login`，覆盖 A 创建、B 盗用同一 `loginId` 返回 404、轮询节流、异步授权和真实播放探测模拟 |

### 1.2 2026-09-02 发布记录

- Git：PR #17 已 squash 合并到 `main`，发布提交为 `a69158cf09622b6cb61e3c0a589629906c3aa054`。
- 本地真实账号：二维码登录、精确请求《来去打工》、QQ 音频代理和连续播放已验证。
- 自动化：`npm run check:qq-login`、`npm run check:multi-user`、`npm run build`、`npm run build:public`、`npm run dev:check` 均通过。
- 生产：`/app/`、`/api/health`、二维码创建、二维码归属隔离、未登录 Cookie 导入拦截和 Qwen TTS 实际生成已验证。
- 生产真实账号：用户扫码后页面自动恢复账号和 8 首队列，真实 QQ 歌曲播放进度持续推进，端到端主链路已验证。
- 未完成：Chrome、Edge、Safari、Firefox、Android Chrome 和 iPhone Safari 的完整矩阵仍待执行。

因此，当前状态是“功能已发布且关键生产边界已验证”，不能写成“所有终端端到端验收完成”。

## 2. 背景与问题

### 2.1 当前用户问题

现有网页端把 Redio Bridge 作为 QQ 音乐默认登录入口，对普通用户存在明显门槛：

- Chrome 扩展安装步骤复杂，普通用户容易中途放弃。
- 手机、平板、Safari、Firefox 等环境无法安装 Chrome 扩展。
- “登录账号”和“安装插件”被绑定，用户无法理解两者的区别。
- 手动导入 Cookie 不适合作为消费者产品能力，也存在安全风险。

### 2.2 Bridge 当前承担的能力

Bridge 并不是直接下载歌曲，而是：

1. 打开 QQ 音乐官方网页。
2. 读取用户浏览器中的 QQ 音乐登录 Cookie。
3. 在必要时打开 QQ 音乐播放页生成播放票据。
4. 把必要登录字段提交给 Redio 后端。
5. 后端使用播放票据请求 QQ vkey，并解析真实音频地址。

网页自身受同源策略和 HttpOnly Cookie 限制，不能直接读取 `y.qq.com` 的登录态。因此不能简单实现为“打开 QQ 音乐网页，登录后 Redio 自动读取 Cookie”。

### 2.3 当前已有基础

项目当前已经具备：

- `server/qq-login.ts`：生成 QQ 登录二维码、轮询扫码状态、完成 QQ Connect 授权。
- `server/router.ts`：二维码创建和轮询接口。
- `server/qq-music.ts`：账号验证、按账号保存凭据、搜索和 vkey 解析。
- `server/auth.ts`：Redio 签名 HttpOnly 会话和 AES-256-GCM 凭据加密。
- `web/src/App.tsx`：登录弹窗、账号数据加载和退出登录逻辑。

现有内部方案曾记录服务端扫码、vkey 和完整音频播放已经验证，但正式实施前仍必须基于最新 `origin/main`、当前服务器配置和真实 QQ 账号重新验收，不能只依赖历史记录。

## 3. 产品目标

### 3.1 核心目标

用户无需安装任何浏览器扩展，即可：

1. 在 Redio 登录弹窗中看到真实 QQ 登录二维码。
2. 使用 QQ 或 QQ 音乐扫码确认。
3. 看到明确的登录和播放授权进度。
4. 登录完成后自动加载当前 QQ 账号的数据。
5. 直接播放当前账号有权限播放的真实 QQ 歌曲。

### 3.2 成功定义

登录成功必须同时满足：

```text
账号验证通过
playbackKeyReady = true
真实歌曲 vkey 返回有效 purl
音频代理 Range 探测成功
```

只取得 QQ 账号 ID 不代表播放准备完成。前端不能把“账号已识别”提前显示为“登录成功，可以播放”。

### 3.3 非目标

本期不包含：

- 绕过 QQ 音乐会员、版权、地区或下架限制。
- 规避 QQ 音乐验证码、风控或访问限制。
- 代理池、账号轮换、设备伪装等行为。
- 网易云、酷狗等其他平台登录。
- QQ 评论、收藏、歌单写入或完整资料库同步。
- Redis、数据库、多服务器或异步消息队列。
- 直接删除 Bridge；灰度期间保留为隐藏兼容入口。

## 4. 产品体验

### 4.1 桌面端和大屏平板

用户流程：

1. 点击“登录 QQ 音乐”。
2. Redio 自动请求并显示二维码。
3. 用户使用 QQ 或 QQ 音乐扫码。
4. 页面自动更新扫码和授权状态。
5. 后端验证账号及播放能力。
6. 登录成功后自动加载头像、昵称、聊天、队列、历史、反馈和播放记忆。
7. 登录弹窗关闭，页面显示当前 QQ 音乐账号。

用户不再看到：

- Bridge 检测。
- 刷新登录状态。
- 手动导入 Cookie。
- 点击安装插件。
- Chrome 扩展安装说明。

### 4.2 手机端

同一部手机无法直接扫描自己屏幕中的二维码。当前 QQ 返回的二维码编码为 `http://txz.qq.com/p` 短期票据；从相册识别时，手机 QQ 可能把它提示为“不安全”。因此不再把“保存二维码后从相册识别”描述为可靠主路径，手机端应明确建议使用另一台设备扫码；页面在后台时暂停轮询，重新进入前台后恢复查询。

后续只有在验证到与当前二维码会话绑定的 QQ App Deep Link 后，才加入“一键打开 QQ 并返回 Redio”。普通 `https://y.qq.com/` 跳转不能作为自动登录方案，因为 Redio 无法读取该域名的登录 Cookie。

2026-09-02 的协议核对还确认：直接打开二维码里的 `txz.qq.com` 地址会跳转到 QQ 下载页并丢失当前票据参数；`mqqapi://forward/url` 只负责拉起 QQ 内置浏览器，不能替代“扫一扫”提交授权。现阶段不得把“打开 QQ”按钮标成“QQ 授权登录”，否则会造成 QQ 已打开但 Redio 永远等待扫码的假流程。

QQ 互联的标准 OAuth 或原生 SDK 可以解决 Redio 自身的 QQ 身份登录，但它返回的是 Redio 应用的 OAuth 身份票据，不等于 QQ 音乐网页登录 Cookie 和播放票据。除非取得 QQ 音乐正式授权或验证到可绑定当前播放会话的官方接口，否则它不能替代本方案的真实歌曲播放授权。

### 4.3 登录弹窗状态

```text
idle
creating_qr
waiting_scan
scanned
authorizing
verifying_account
verifying_playback
ready
expired
verification_needed
playback_incomplete
rate_limited
failed
```

对应用户文案：

| 状态 | 用户文案 |
|---|---|
| `creating_qr` | 正在获取 QQ 音乐二维码 |
| `waiting_scan` | 请使用 QQ 或 QQ 音乐扫码 |
| `scanned` | 已扫码，请在手机上确认 |
| `authorizing` | 正在完成 QQ 音乐授权 |
| `verifying_account` | 正在验证 QQ 音乐账号 |
| `verifying_playback` | 账号已确认，正在准备播放权限 |
| `ready` | QQ 音乐登录成功，可以开始播放 |
| `expired` | 二维码已过期，正在刷新 |
| `verification_needed` | QQ 音乐需要安全验证，请前往官方页面完成 |
| `playback_incomplete` | 账号已确认，但播放授权暂未准备完成 |
| `rate_limited` | QQ 音乐暂时限制了本次请求，请稍后重试 |
| `failed` | QQ 音乐登录失败，请重新扫码 |

## 5. 总体技术架构

```text
React 登录弹窗
   │
   ├── 创建二维码
   └── 轮询 Redio 登录状态
          │
Node API
   │
   ├── QQ 二维码会话管理
   ├── QQ 授权码交换
   ├── 服务端 Cookie Jar
   ├── QQ 账号验证
   ├── 播放票据验证
   ├── vkey 与音频 Range 探测
   ├── 按账号加密凭据
   └── 签发 redio_session
          │
          ├── 账号聊天、队列、历史、反馈和播放记忆
          └── QQ CDN 音频代理
```

浏览器只保存 Redio 的签名 HttpOnly 会话，不接触 QQ Cookie、播放票据或凭据明文。

## 6. API 契约

### 6.1 创建登录二维码

```http
POST /api/qq/login/qr
```

响应：

```json
{
  "loginId": "opaque-login-id",
  "imageDataUrl": "data:image/png;base64,...",
  "expiresAt": "2026-09-01T12:00:00.000Z",
  "pollAfterMs": 1500
}
```

同时设置短期登录绑定 Cookie：

```text
redio_login=<random nonce>; Path=/; HttpOnly; SameSite=Lax; Secure
```

`redio_login` 只绑定二维码和发起登录的浏览器，不代表用户已登录，也不能访问账号数据。

### 6.2 查询二维码状态

建议把当前带 ID 的 GET 改为：

```http
POST /api/qq/login/qr/status
Content-Type: application/json

{
  "loginId": "opaque-login-id"
}
```

使用 POST 可以避免登录 ID 进入浏览器历史、Nginx 路径日志和外部分析日志。

进行中响应：

```json
{
  "state": "verifying_playback",
  "message": "QQ 账号已确认，正在准备播放权限",
  "pollAfterMs": 1500
}
```

成功响应：

```json
{
  "state": "ready",
  "message": "QQ 音乐登录成功",
  "pollAfterMs": 0,
  "status": {
    "provider": "qq",
    "loggedIn": true,
    "playbackKeyReady": true,
    "nickname": "用户昵称",
    "avatarUrl": "https://..."
  }
}
```

成功响应同时设置正式的 `redio_session` HttpOnly Cookie。

### 6.3 当前账号状态

继续使用：

```http
GET /api/qq/login/status
```

建议统一响应：

```json
{
  "provider": "qq",
  "loggedIn": true,
  "playbackKeyReady": true,
  "playbackProbeStatus": "ready",
  "lastPlaybackProbeAt": "2026-09-01T12:00:00.000Z",
  "nickname": "用户昵称",
  "avatarUrl": "https://..."
}
```

### 6.4 退出登录

继续使用：

```http
POST /api/qq/logout
```

退出时：

- 清除 `redio_session`。
- 撤销当前账号的 Redio 会话。
- 删除或失效服务器保存的 QQ 凭据。
- 清空前端当前账号数据。

## 7. 后端设计

### 7.1 二维码会话

扩展 `server/qq-login.ts` 中的二维码会话：

```ts
type QqQrSession = {
  loginId: string;
  ownerNonceHash: string;
  qrsig: string;
  ptqrtoken: number;
  createdAt: number;
  expiresAt: number;
  state: QqLoginState;
  pollCount: number;
};
```

约束：

- 有效期三分钟。
- 一个浏览器同时只保留一个二维码。
- 校验 `redio_login` Cookie 与 `ownerNonceHash`。
- 不绑定 IP，避免移动网络切换造成登录失败。
- 登录成功后清除浏览器绑定 Cookie；终态会话只短暂保留，并立即清除二维码上游秘密，随后由内存清理移除。
- 定期清理超时会话，避免内存持续增长。

### 7.2 服务端 Cookie Jar

同一登录会话的所有 QQ 请求共享 Cookie Jar，包括：

- 二维码返回的 `qrsig`。
- 扫码状态响应 Cookie。
- `checkSig` 跳转 Cookie。
- QQ Connect 授权 Cookie。
- QQ Music 登录交换响应 Cookie。
- 账号和播放所需的最小必要字段。

普通日志只能记录 Cookie 字段名和状态，不允许记录 Cookie 值。

### 7.3 账号验证

继续复用现有账号验证能力：

1. 从登录凭据提取 QQ 音乐账号 ID。
2. 调用 QQ 资料接口验证凭据确实属于该账号。
3. 创建 `provider + accountId` 对应的账号存储目录。
4. 加密保存最小必要 QQ 凭据。
5. 拒绝只包含伪造 `uin`、无法读取真实账号资料的请求。

### 7.4 播放票据验证

当前播放票据候选包括：

```text
qm_keyst
qqmusic_key
music_key
wxskey
```

登录完成后执行一次不写入历史的播放探测：

1. 选择已知、非会员、当前可见的验证歌曲。
2. 使用当前账号请求 vkey。
3. 必须取得非空 `purl`。
4. 通过 Redio 音频代理请求小范围音频字节。
5. 验证 Range、Content-Type 和响应字节有效。
6. 探测歌曲不进入播放队列、历史、反馈或播放记忆。

探测成功才设置 `playbackKeyReady=true`。

如果票据不完整：

- 重新收集一次登录交换响应和 Cookie。
- 最多执行一次服务端播放初始化。
- 仍失败则进入 `playback_incomplete`。
- 停止自动重试，避免触发 QQ 风控。

第一版不引入 Playwright。只有真实验收证明纯服务端协议始终拿不到播放票据时，才评估隔离的服务端浏览器预热。

### 7.5 Redio 会话

正式会话继续使用：

```text
redio_session=<signed token>
```

生产属性：

```text
Path=/
HttpOnly
SameSite=Lax
Secure
```

登录后所有聊天、队列、历史、反馈和播放记忆均通过 Redio 会话定位 QQ 账号，前端不能提交任意账号 ID 读取其他用户数据。

### 7.6 凭据加密

现有 AES-256-GCM 加密可以保留，但建议把凭据加密密钥与会话签名密钥分开：

```env
AI_RADIO_SESSION_SECRET=
AI_RADIO_CREDENTIAL_SECRET=
```

要求：

- 两个密钥都不少于32字符。
- `AI_RADIO_SESSION_SECRET` 只签名 Redio 会话。
- `AI_RADIO_CREDENTIAL_SECRET` 只加密 QQ 凭据。
- 支持旧凭据读取和一次性迁移。
- 不把真实密钥写入源码、文档、日志或提交记录。

## 8. 前端设计

### 8.1 登录弹窗

保留当前弹窗视觉结构，替换登录行为：

- 打开弹窗时自动创建二维码。
- 二维码占位块显示后端 `imageDataUrl`。
- 显示当前状态和剩余有效时间。
- 二维码过期后停止轮询，并显示“刷新二维码”。
- 用户主动点击“刷新二维码”时终止旧会话再创建新会话。
- 状态变化使用 `aria-live` 通知辅助技术。

从普通登录弹窗移除：

- Bridge 状态和检测按钮。
- 刷新 Bridge 登录状态。
- 手动 Cookie 输入框。
- Bridge 安装下载入口。

### 8.2 轮询策略

- 使用服务端返回的 `pollAfterMs`，默认1.5秒。
- 弹窗关闭时使用 `AbortController` 停止请求。
- 同时只允许一个轮询任务。
- 页面进入后台时暂停低价值轮询。
- 页面重新进入前台时立即查询一次。
- `ready`、`expired`、`failed` 后停止轮询。

### 8.3 登录完成后的数据刷新

收到 `ready` 后：

1. 请求 `/api/qq/login/status`。
2. 加载当前账号的 now、history、queue、chat、playback-state、feedback 和 weather。
3. 数据加载完成后关闭登录弹窗。
4. 更新头像、昵称和 QQ 音源状态。
5. 清理旧账号的前端临时播放解析结果。

如果登录已成功但账号数据加载失败，不要求重新扫码。保留正式会话并提供“重新加载数据”。

### 8.4 高级兼容入口

设置页保留折叠入口“登录遇到问题”，包含：

- 重新生成二维码。
- 打开 QQ 音乐官方页面。
- Bridge 兼容工具，仅供桌面高级用户。
- 手动 Cookie 表单仅在本地开发构建展示；公开站的兼容接口不能创建新会话，只允许已登录用户刷新同一 QQ 账号的 Bridge 凭据，不提供普通用户手动粘贴入口。

## 9. 安全与风控要求

本期必须同时完成：

- 二维码绑定发起登录的浏览器。
- 登录状态查询使用 POST。
- 校验 Origin、短期登录 Cookie 和会话归属。
- 二维码创建按 IP 限流。
- 单会话轮询频率由服务端控制。
- 同账号携带凭据的 QQ 请求并发数限制为1。
- 403、429、验证码出现后立即停止自动请求。
- 不记录 QQ Cookie、播放票据、授权码或完整音源 URL。
- 凭据密钥和会话密钥分离。
- 只保存经过真实验证所需的最小凭据集合。
- 音频代理继续支持 Range，并逐步把域名白名单收紧到实际 QQ CDN 主机。
- 生产强制 HTTPS 和 `AI_RADIO_SECURE_COOKIES=1`。

建议初始限制：

| 项目 | 初始值 |
|---|---:|
| 二维码有效期 | 3分钟 |
| 轮询间隔 | 1.5秒 |
| 单浏览器活跃二维码 | 1个 |
| 同账号授权请求并发 | 1 |
| 播放票据自动补偿 | 最多1次 |
| 风控错误自动重试 | 0次 |

## 10. 异常处理

| 场景 | 用户提示 | 系统行为 | 用户操作 |
|---|---|---|---|
| 二维码过期 | 二维码已过期，正在刷新 | 销毁旧会话并创建新二维码 | 等待或手动刷新 |
| 已扫码未确认 | 已扫码，请在手机确认 | 继续低频轮询 | 在手机确认 |
| 账号成功、票据缺失 | 账号已确认，正在准备播放权限 | 最多自动补偿一次 | 等待 |
| 需要验证码 | QQ 音乐需要安全验证 | 停止自动检测 | 打开 QQ 音乐处理 |
| 403 | QQ 音乐暂时拒绝了本次请求 | 熔断当前账号请求 | 稍后重试 |
| 429 | QQ 音乐请求较频繁 | 进入冷却，不自动重试 | 等待冷却结束 |
| 登录失效 | QQ 音乐登录已过期 | 清除失效凭据 | 重新扫码 |
| 会员限制 | 当前歌曲需要相应会员权限 | 不判定登录失败 | 更换歌曲或在 QQ 打开 |
| 版权/地区限制 | 当前歌曲暂时无法播放 | 不判定登录失败 | 更换歌曲 |
| 网络失败 | 网络连接失败，登录结果尚未丢失 | 保留会话状态 | 手动重试查询 |

## 11. 实施阶段

### 阶段一：服务端链路重新验收

暂不修改正式 UI，使用真实账号验证：

- 二维码生成和扫码。
- QQ 账号资料验证。
- 播放票据字段。
- vkey 和非空 `purl`。
- 音频代理 Range。
- 一首歌曲真实播放。

如果不能取得播放票据或真实音频，停止进入前端阶段，先解决服务端凭据交换。

### 阶段二：后端接口和安全

主要文件：

- `server/qq-login.ts`
- `server/router.ts`
- `server/qq-music.ts`
- `server/auth.ts`
- `scripts/qq-login-check.ts`
- `scripts/multi-user-check.ts`

完成二维码归属绑定、POST 状态接口、播放探测、凭据密钥分离和结构化错误。

### 阶段三：前端登录弹窗

主要文件：

- `web/src/App.tsx`
- `web/src/styles.css`

接入真实二维码、状态机、自动轮询和登录后数据刷新，隐藏普通用户的 Bridge 与 Cookie 入口。

### 阶段四：跨设备验收

至少验证：

- Chrome。
- Edge。
- Safari。
- Firefox。
- Android Chrome。
- iPhone Safari。
- 手机保存二维码后从 QQ 相册识别。

### 阶段五：生产灰度

2026-09-02 已经用户确认执行生产发布，线上默认登录入口已切换为免插件二维码。Bridge 仍只作为设置中的手动兼容入口，没有删除代码和安装包。

生产发布已完成服务健康、二维码会话边界、公开 Cookie 导入防护、Qwen TTS、页面可视检查，以及真实账号扫码、8 首队列恢复和真实歌曲播放。完整浏览器矩阵仍是独立验收项；完成前不得把“线上主链路已通过”扩大描述为“全终端验收通过”。

发布顺序：

1. 本地真实账号。
2. 测试环境。
3. 少量 Beta 用户。
4. 全量替换 Bridge 默认入口。

灰度期间保留 Bridge 兼容入口。关闭开关即可恢复旧入口，不在同一次发布中删除 Bridge 代码和安装包。

## 12. 验收标准

### 12.1 登录

- 未安装 Bridge 的浏览器可以生成二维码。
- 扫码结果只能被发起登录的浏览器领取。
- 二维码过期和刷新不会串联旧会话。
- 登录成功后返回真实昵称和头像。
- 前端不能读取或获得 QQ Cookie。
- 页面刷新后仍保持同一 Redio 账号会话。

### 12.2 播放

- `loggedIn=true`。
- `playbackKeyReady=true`。
- 至少一首非会员歌曲解析为 `full`。
- 音频代理支持 Range。
- 完成一次真实歌曲播放验证。
- 登录探测歌曲不写入用户历史、队列、反馈或播放记忆。
- 会员、版权和地区限制不会错误显示为登录失败。

### 12.3 账号隔离

- A、B 两个 QQ 账号数据目录不同。
- A 账号不能读取 B 的聊天、队列、历史、反馈和播放状态。
- 退出登录后不能继续读取原账号数据。
- 登录回同一账号后可以恢复该账号的播放记忆。
- API 重启后凭据仍可解密和验证。

### 12.4 错误与安全

- 二维码过期、取消、验证码、403、429 均有明确用户提示。
- 日志不包含 Cookie、播放票据、授权码或完整音源 URL。
- 轮询停止后没有残留定时器和持续请求。
- 登录会话过期后及时从内存清理。
- 公开环境强制稳定密钥和 Secure Cookie。

### 12.5 工程检查

至少运行：

```bash
npm run build
npm run build:public
npm run check:multi-user
npm run dev:check
```

并实际完成：

- 打开 `http://127.0.0.1:5173/` 检查登录弹窗。
- 扫码登录。
- 自动加载账号数据。
- 播放真实 QQ 歌曲。
- 退出并重新登录。
- 移动宽度布局检查。

## 13. 回滚方案

如果服务端扫码在生产出现大面积风控、验证码或播放票据缺失：

1. 回退到上一份已验证的服务器源码和前端构建产物。
2. 恢复 Bridge 兼容入口为临时主入口。
3. 不删除已验证的账号数据和加密凭据。
4. 不自动降级到手动 Cookie。
5. 保留结构化错误和诊断统计，定位失败阶段。

登录入口、代码合并、生产部署和 Bridge 清理必须作为不同确认节点，不在一次操作中同时完成。

## 14. 风险与边界

- 当前 QQ 音乐接入依赖网页内部接口和 Cookie，存在接口调整、验证码和账号风控风险。
- 登录成功不代表账号有权限播放所有歌曲。
- 服务端二维码协议不能替代 QQ 音乐正式商业授权。
- 手机同设备一键跳转需要额外验证 QQ App Deep Link，第一版不承诺。
- 第一版继续使用单服务器内存二维码会话；未来多实例部署前必须改为共享会话存储。

## 15. 最终范围结论

第一版交付边界为：

> Redio 后端生成二维码，用户扫码后由后端取得并加密保存 QQ 音乐登录凭据，验证真实播放能力，签发 Redio 会话，前端自动刷新当前账号数据并允许播放真实歌曲。

Bridge 保留为隐藏兼容工具，不再是普通用户登录 Redio 的前置条件。
