# Instruction 015: 流式播放音频的 Cloud 主播放 Fallback [COMPLETED]

> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.

# Task: 为远程流式播放主链路添加 Cloud API Fallback，保留流式语义

## 问题背景

当前 CloudUI 在“仅播放远程音频、不做 transcript/ASR 下载”的场景下，主播放链路仍然直接把外部音频 URL 交给浏览器 `<audio>` 元素：

1. 前端直接使用 feed 中的原始音频 URL（如 `https://megaphone.fm/xxx.mp3`）
2. `<audio>` 元素直接向外部服务器发起媒体请求
3. 对部分外部 host / redirect 链 / 网络环境，浏览器媒体请求会长时间 `pending`
4. 对中国大陆用户，该 `pending` 可能持续 30 秒到 2 分钟，导致播放器一直无法开始播放

这不是普通 `fetch/XHR` 失败，而是 **media element 主播放请求挂起**。因此，不能把问题简单理解为“再包一层 `fetchWithFallback` 然后下载成 blob URL”。

## 当前状态

- ✅ Discovery 请求：走 `/api/v1/discovery/*` 同源路由（无浏览器 CORS 问题）
- ✅ 下载场景：已使用 `fetchWithFallback` + Cloud backend fallback
- ✅ ASR 音频获取：已使用 fallback 机制
- ✅ `/api/proxy` 已支持受限媒体代理（GET / HEAD / Range / redirect validation）
- ❌ 远程流式播放主链路：`<audio>` 仍直接使用原始外部 URL，可能长时间 pending

## 执行方式（先锁复现，再改实现）

本任务必须采用 reproducer-first：

1. 先锁定一个真实可复现的「主播放 pending 太久」host / request class
2. 先写 failing regression coverage
3. 再实现 fallback

禁止先改状态机、再补测试。

## 核心目标

为远程流式播放主链路增加 **Cloud playback fallback**：

1. 先尝试原始 remote audio URL 直连播放
2. 给直连播放一个较短的 bootstrap 时间窗口（建议 3-5 秒）
3. 如果在窗口内仍未进入可播放状态，则切换到 **same-origin proxy playback URL**
   - 目标形式：`/api/proxy?url=<encoded remote audio url>`
4. 切换后仍由浏览器 `<audio>` 元素原生处理：
   - streaming
   - buffering
   - seek
   - range
5. **禁止**把这次 fallback 实现成“先完整 fetch 音频，再生成 blob URL 给 `<audio>`”

## 非目标

- 不把流式播放重构成整段音频下载式播放
- 不为了播放而预先拉完整音频文件到前端内存 / blob URL
- 不新增新的 generic proxy contract
- 不改变 `/api/proxy` 的受限代理边界
- 不修改播放器 UI 样式或布局

## 架构原则

### 1. 主播放 fallback 不是 blob fallback

本任务要解决的是：
- `<audio src="https://remote-host/...">` 长时间 pending

不是：
- `fetch(url)` 失败后把完整音频拉下来再 `audio.src = blob:...`

流式播放必须保留浏览器原生媒体语义。phase 1 的 fallback 目标应是：
- `audio.src = /api/proxy?url=...`

而不是：
- `audio.src = blob:...`

### 1.1 主播放 source owner 必须唯一

本任务必须明确并收敛到一个主播放 `src` 决策点。

不允许以下分叉状态：
- 一个地方赋原始 remote URL
- 另一个地方异步改成 proxy URL
- 第三个地方在 replay / seek / resume 时再覆盖回 remote URL

worker 必须先找出当前主播放 source assignment 的唯一 owner，并仅在该 owner 内插入 fallback。

### 2. Go 后端只做 byte-stream relay

Cloud backend 在这个场景下只起到 **帮助代理媒体请求** 的作用：

- 客户端播放多少，后端转发多少
- 客户端 seek 时，浏览器/播放器发起什么媒体请求，后端就代理什么请求
- 客户端关闭/停止/切换播放时，请求上下文取消后，上游传输也应停止

**不得**把后端实现成“先完整下载整段音频再返回”。

### 3. 复用现有受限媒体 fallback 基础设施

本任务必须优先复用现有系统：

- `apps/cloud-ui/src/lib/player/remotePlayback.ts`
- `apps/cloud-ui/src/lib/fetchUtils.ts`
- `apps/cloud-api/main.go` 中的 `/api/proxy`

不要引入一套新的播放专用下载层或新的开放代理接口。

### 4. fallback 必须单向、一次性

对同一次 playback session：

- remote direct -> same-origin proxy playback 最多切换一次
- fallback 后不得自动回切到 remote direct
- 只有新 track / replay / 全新 source session 才允许重新尝试 direct

必须防止：
- remote -> proxy -> remote 的来回抖动
- 多次 bootstrap timeout 触发重复 source 切换

## 决策日志
- **Required / Waived**: Required

## 实施步骤

### 1. 先审计当前主播放拓扑

在动代码前，先确认：

1. `STREAM_WITHOUT_TRANSCRIPT` 模式下，当前是谁决定 `<audio>` 的最终 `src`
2. 当前“开始播放”依赖哪些事件或状态切换：
   - `loadstart`
   - `loadedmetadata`
   - `canplay`
   - `playing`
   - `progress`
   - `error`
3. 当前 seek / replay / next track 是否依赖原始 remote URL 行为

输出必须明确：
- 当前主播放 source assignment 点
- 可插入 fallback 的状态机位置
- 不允许破坏的播放器行为
- 当前 track identity / queue identity 由哪些状态持有
- fallback 后哪些状态必须保持不变

### 2. 定义 playback bootstrap timeout

为远程主播放定义一个 **bootstrap timeout**（建议 `3000-5000ms`）：

- 直连 remote audio URL 后开始计时
- 在时间窗口内，如果已经进入“可播放”状态，则保持直连
- 如果窗口结束后仍未进入可播放状态，则视为：
  - 直连过慢
  - media request pending too long
  - 需要切换到 Cloud proxy playback URL

这个超时判断必须基于媒体播放状态，而不是只基于普通 `fetch`。

Bootstrap success 的判定必须显式写清并固定下来。

推荐至少满足以下之一即视为 bootstrap success：
- `loadedmetadata`
- `canplay`
- `playing`

以下事件不能单独作为 success：
- `loadstart`
- 仅有 `progress`

这个 timeout 仅适用于：
- remote primary source

不适用于：
- local/blob/downloaded/media-cache source
- 已经切到 same-origin proxy 的 source

### 3. 切换到 same-origin proxy playback URL

当直连 bootstrap 超时或明确失败时：

1. 构造同源 playback URL：
   - `/api/proxy?url=<encoded remote audio url>`
2. 将 `<audio>` 的 source 切换为该同源 URL
3. 保证播放器继续使用浏览器原生流式能力：
   - 不强制读取整文件
   - 不创建 eager blob URL
   - 不改变 seek/range 语义

在真正切换前，必须先确认或补足 `/api/proxy` 对媒体元素播放所需行为的回归验证：
- GET
- HEAD（若浏览器/实现会触发）
- Range
- redirect compatibility
- seek continuity

### 4. 保留状态一致性

切换 source 时必须确保：

- 不进入永久 loading 死状态
- 不重复触发错误重置循环
- 不破坏当前 track identity
- 不错误重置用户显式播放动作
- 不因 fallback source 切换导致 UI 卡死或状态机失配
- 不额外触发“切到新 track”的副作用（history / queue index / analytics）

### 5. 增加 host/session 级 breaker

如果同一个 remote host 在当前 session 中已经连续触发主播放 bootstrap 超时：

- 后续同 host 的播放可直接优先使用 same-origin proxy playback URL
- 避免每次都先等待 3-5 秒再 fallback

这个 breaker 必须是：
- session-scoped
- bounded
- 可清理
- key 必须明确（first pass 建议使用 hostname）
- 只对 bootstrap-timeout 类型失败生效，不扩大到任意播放错误
- first pass 必须有容量上限（例如 50 hosts 量级），不得无限增长

不要把它做成长期持久化“黑名单”。

### 6. 与现有媒体路径隔离

本任务不得破坏以下已有路径：

- `audioPrefetch`
- ASR audio fetch
- 下载逻辑
- 现有 `fetchWithFallback` 的非播放场景

即：
- 这是 **主播放 source fallback**
- 不是全局媒体 transport 重写

## 测试与验证

### 必须新增的自动化测试

至少覆盖以下场景：

1. **直连主播放成功**
   - 在 bootstrap timeout 内进入可播放状态
   - 不切到 proxy playback URL

2. **直连主播放长时间 pending**
   - 超时后切到 same-origin proxy playback URL
   - 不生成整段 blob URL

3. **fallback 后仍保留流式语义**
   - seek 时仍能继续请求媒体数据
   - 不要求整段预先下载完成

4. **同 host breaker**
   - 连续 pending 后，后续同 host 可直接走 proxy playback

5. **状态机完整性**
   - fallback 不导致永久 loading
   - fallback 不导致播放/暂停/切歌状态错误
   - fallback 不改变 track identity / queue index / active episode identity

6. **与其它媒体逻辑隔离**
   - 不破坏 `audioPrefetch`
   - 不破坏 ASR audio fetch

7. **`/api/proxy` 兼容性基线**
   - 主播放 fallback 使用的 same-origin proxy URL 仍保留媒体元素可用的 streaming / seek 语义

### 手动验证

1. 海外/正常网络环境
   - 远程直连能快速播放
   - 不会无意义切 proxy

2. 大陆/受限网络环境
   - 原始 remote URL 主播放长时间 pending 时
   - 能在 bootstrap timeout 后切到 proxy playback URL 并开始播放

3. 长音频手动 seek
   - fallback 后仍然可以拖动进度条继续播放

4. 中途关闭/切歌
   - 不要求后端完整下载整段音频
   - 后端只做按需转发

## 风险与边界

### 风险 1：把播放错误地变成下载
禁止用“完整 fetch -> blob URL”替代主播放 fallback。那会破坏 streaming 本质。

### 风险 2：播放状态机死循环
source 切换时，必须防止：
- 直连 pending -> proxy -> 又回到直连
- 重复 fallback 循环
- 永久 loading

### 风险 3：误伤正常网络
bootstrap timeout 不应过短，否则会让本来可直连的用户频繁被切到 proxy，增加不必要的后端流量。

### 风险 4：与 `/api/proxy` 的媒体 contract 不一致
如果主播放切到 same-origin proxy URL，必须验证：
- GET
- Range
- redirect
- seek
都与当前 `/api/proxy` 行为兼容

## 最小可观测性要求

实现中必须保留一个最小、可调试的播放 source mode 信号，至少能区分：
- `remote-direct`
- `remote-proxy-fallback`

目的不是做产品埋点，而是帮助确认：
- fallback 是否真的发生
- breaker 是否生效
- 是否出现异常重复切换

## Completion Standards

该任务仅在以下条件全部满足时可标记完成：

- 远程流式播放主链路已支持直连 -> proxy playback fallback
- fallback 目标是 same-origin playback URL，而非整段 blob 下载
- 直连 pending 场景在短时间内可恢复为可播放状态
- seek/range 语义保持正常
- 不破坏 `audioPrefetch` / ASR / 下载路径
- 自动化测试和手动验证通过

---

## Documentation
- Update `apps/docs/content/docs/general/technical-roadmap.mdx` (after Reviewer sign-off)

## Completion
- **Completed by**:
- **Commands**:
- **Date**: 2026-04-03
- **Reviewed by**:
