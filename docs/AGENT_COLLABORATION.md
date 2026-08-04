# Redio Agent Collaboration (v2)

本文档用于各 Agent 开工前对齐分支、职责和改动边界，目标是减少冲突，保持 `main` 始终可运行。

v2 变更：引入 hi work 作为系统架构师与合并审核人；Codex 转为纯开发角色；新增 commit 打标规范与三方分支模型。

v2.1 变更：新增「Feature Closeout（功能收尾）」章节——引入 neat-freak skill 与单执行者收尾模式。

## Roles

| Agent | 角色 | 反馈回路 |
| --- | --- | --- |
| Codex | 后端与推荐算法开发 | 常驻仓库，秒级迭代 |
| Seal | 播放器前端 UI / 交互开发 | 会话驱动 |
| hi work | 系统架构师 + 合并审核 + 文档契约 owner | 会话/定时驱动 |
| 曾祥民（Owner） | 产品与设计决策、Figma 稿、最终裁决 | — |

## Branch Model

```text
main                                   # 稳定主干，只合并审核通过的代码
├── codex/<backend-or-recommendation>  # Codex：后端逻辑、播放链路、推荐算法
├── seal/<frontend-interaction>        # Seal：播放器前端 UI、交互细节
└── hiwork/<task>                      # hi work：文档、契约、site/ 走查修正、工具脚本
```

规则：

- 所有功能从 `main` 或最新稳定分支切出。
- 任何人不直接向 `main` 提交（含 hi work 自己的改动，同样走 PR）。
- 每个功能完成后提交 PR，由 hi work 审核后合并。
- 合并前至少运行 `npm run build` 和 `npm run dev:check`。

## Commit Tagging（新增）

所有 commit message 以 agent 标签为前缀，便于 review 定位与问题追溯：

```text
[codex] fix qq vkey retry on expired session
[seal]  polish player empty state animation
[hiwork] update api contract for lyrics offset
```

- 标签小写、方括号包裹：`[codex]` / `[seal]` / `[hiwork]`。
- Owner 手动提交用 `[owner]`。
- PR 标题同样带标签前缀。
- 一个分支内不混入他人标签的 commit；发现异源 commit 时审核会要求拆分。

## Ownership

### Codex 负责

- 后端播放链路：
  - QQ 音源解析
  - 本地音频代理
  - 播放状态 `full / unverified / failed / fallback`
  - queue / history / feedback 持久化
- 推荐算法：
  - LLM prompt
  - 用户品味画像
  - 可播歌曲补齐
  - 避免重复推荐
- API 实现（契约变更需先经 hi work 评审，见 API Contract）：
  - `server/router.ts`
  - `server/music.ts`
  - `server/qq-music.ts`
  - `server/state.ts`
  - `server/queue.ts`
  - `server/history.ts`

### Seal 负责

- 播放器 UI / Figma 还原：
  - 页面布局、视觉样式、响应式适配、组件状态展示
- 前端交互细节：
  - 按钮样式、空态 / loading、页面切换、视觉动效
- 主要文件：
  - `web/src/App.tsx`
  - `web/src/styles.css`
  - `web/src/StarfieldCanvas.tsx`
  - `public/images/*`
  - `public/fonts/*`

### hi work 负责

- 合并审核：所有进 `main` 的 PR 的唯一 merge owner。
- 架构裁决：模块边界（如 `site/` 与 `web/` 的资源共享方式）、目录结构、依赖引入的取舍。
- API 契约评审：前端需要新字段时，先在 PR 中提出字段名与用途，由 hi work 确认语义后 Codex 实现。
- 文档 owner：本协作文档、`docs/` 下契约与发布说明的维护。
- 设计走查（Design QA）：基于 Figma API 真实节点数值比对 `site/` 与 `web/` 实现，输出走查报告（如 `design-qa.md`）。
- 定时巡检：站点存活（halou.net.cn）、API 健康度、待审 PR 扫描，异常时通知 Owner。

### Owner（曾祥民）负责

- 官网 `site/` 的设计与实现（Figma 还原、Cover 动效、自定义光标、响应式）。
- 产品方向与设计稿；协作规则争议的最终裁决。

## Review & Merge Flow（新增）

1. 开发者从 `main` 切分支，完成后提 PR（标题带标签）。
2. hi work 审核，检查项：
   - 改动是否越界（见 Shared Boundary 红线）；
   - commit 打标是否符合规范；
   - `npm run build` / `npm run dev:check` 是否通过；
   - 冲突文件逐块 review，不整文件覆盖。
3. 审核通过 → hi work 合并；不通过 → PR 中给出具体修改点，退回开发者。
4. 播放链路改动的端到端实测（QQ `full` 歌源经 `/api/audio/proxy` 出音频字节）需要真实 QQ 登录态，由 Codex 或 Owner 在有登录态的机器上执行并在 PR 中贴结论；hi work 只验证到构建与接口结构层。

## Shared Boundary

`web/src/App.tsx` 是高冲突文件。Seal 可以改 UI 结构，但不要改变这些业务语义：

- 不要绕过 `/api/plan`。
- 不要直接在前端拼 QQ 音源 URL。
- 不要把 `failed` 或 `fallback` 显示成完整歌源。
- 不要删除音频代理逻辑。
- 不要修改播放队列的核心状态判断，除非同步后端契约。

如果 UI 需要新字段，先在 PR 中说明字段名和用途，经 hi work 评审后由 Codex 补 API。

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
full       # 已确认可播放完整歌源
unverified # 已拿到地址，但尚未确认完整性
failed     # 当前账号 / QQ 接口没有可播放 URL
fallback   # 本地测试音频，不代表真实歌曲
```

产品上只能把 `full` 当作真正可播成功。

契约变更流程：提案（PR 描述中写明字段名、类型、语义）→ hi work 评审 → Codex 实现 → 本节同步更新。契约与实现不一致时，以本文档评审通过的版本为准。

## Feature Closeout（功能收尾，v2.1 新增）

功能开发合入 main 并部署后，执行一次「知识与治理收尾」：核对代码、线上运行态、文档、规则文件与工作区残留是否一致，清理过期说法与已合并分支。收尾使用 neat-freak skill 执行。

### Skill 来源

- 仓库地址：https://github.com/KKKKhazix/khazix-skills/tree/main/neat-freak
- 各 Agent 在自己环境安装（skill 不进本仓库；安装前先审查 SKILL.md 与 scripts，确认无网络外传与未授权删除逻辑）。
- 已确认安装：Codex、hi work。Seal 使用前自行安装。

### 单执行者原则（重要）

**一次收尾只由一个 Agent 执行，其余角色审报告——禁止多个 Agent 并发对同一仓库跑收尾流程**（并发会互相覆盖文档改写、把对方改到一半的状态误判为残留）。

分工方式：

| 角色 | 收尾时做什么 |
| --- | --- |
| 执行者（该功能的主开发方） | 跑 neat-freak，输出收尾报告与删除候选清单 |
| hi work | 审收尾报告：删除候选是否误伤、文档改写是否符合事实、未合并分支是否被误列 |
| Owner | 对删除候选做最终确认；未确认前不执行任何删除 |

执行者选择：后端功能收尾由 Codex 执行，前端功能收尾由 Seal 执行，跨端/架构类由 hi work 执行。

### 收尾红线

- 删除分支、清理文件等破坏性动作，必须在 Owner 确认删除候选清单之后执行。
- 未合并进 main 的分支不得列为「垃圾分支」清理；备份类分支（如 `backup/*`）在其内容正式合回 main 之前必须保留。
- 收尾产生的文档改动照常走 PR + 打标（如 `[codex] docs: closeout after queue animation release`），不豁免审核。

## Merge Checklist

每个 PR 合并前至少确认：

- commit 与 PR 标题打标规范。
- `npm run build` 通过。
- `npm run dev:check` 通过。
- 前端地址可打开：`http://127.0.0.1:5173/`
- API 可打开：`http://127.0.0.1:8788/api/now`
- 如果改了播放链路，至少验证一首 QQ `full` 歌曲能通过 `/api/audio/proxy` 返回音频字节（由有 QQ 登录态的一方执行）。
- 如果改了 UI，确认聊天、播放、切歌、设置页入口没有明显错位。

## Conflict Policy

- 后端逻辑冲突时，以 Codex 分支为准。
- Figma / UI 视觉冲突时，以 Seal 分支为准，但不得破坏 API 契约。
- 架构 / 契约 / 目录边界争议，由 hi work 裁决；产品与设计争议由 Owner 裁决。
- 冲突文件先手动 review，不使用整文件覆盖。
- 涉及 `.env`、Cookie、密钥、本地数据文件时，不提交。
