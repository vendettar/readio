---
description: 初步方案：为 Apple search/episodes 第一跳之后的第二跳补全建立统一的 adapter / resolver owner，收口后续 PI / RSS / route / action 语义
---

# 026: Search Episodes Second-Hop Owner Draft

## 1. 问题定义

当前 `search/episodes` 第一跳返回的是轻量 DTO。这个 DTO 足够支撑搜索结果展示，但不足以直接承载所有后续能力。

后续一旦进入这些行为：

- 跳节目/单集详情
- 播放
- 收藏
- 下载
- PI 补全
- RSS 补全

第二跳语义目前分散在多个消费点自行推断，而不是由一个统一 owner 收口。

这会带来 3 个问题：

1. 不同消费点对同一个 `SearchEpisode` 的后续处理可能不一致
2. 一旦 first-hop contract 变化，容易出现只改一处漏改其他处
3. 系统中没有明确的 “SearchEpisode 后续补全责任归属”

## 2. 目标

建立一个统一的 second-hop owner，使 `SearchEpisode` 在进入后续能力前，先经过同一层 adapter / resolver。

目标不是一次性做完整重构，而是先明确职责边界与最小落点。

## 3. 设计原则

### 3.1 第一跳和第二跳分离

- 第一跳负责：
  - 展示搜索结果
  - 提供最小可识别字段
- 第二跳负责：
  - 把轻量 `SearchEpisode` 转成后续行为真正需要的上下文

不要把第二跳需求反推回第一跳 schema。

### 3.2 统一 owner，不允许消费点各自推断

以下语义不应继续散落在 UI 组件或多个 helper 中：

- 从 `SearchEpisode` 推导 show route / detail route
- 什么时候必须先查 PI podcast
- 什么时候必须查 PI episodes
- 什么时候需要 feed-level fallback
- 哪些动作只依赖 show-level context，哪些动作必须拿到 episode-level context

### 3.3 先收语义 owner，再考虑是否收网络 owner

第一阶段重点不是把所有网络请求都搬到一个函数里，而是先把“决策权”集中。

也就是说：

- 可以先统一“该走哪一步”
- 再逐步统一“由谁真正发请求”

这样风险更低。

## 4. 推荐 owner 形态

推荐增加一个统一层，例如：

- `searchEpisodeSecondHop.ts`
- 或 `searchEpisodeResolver.ts`
- 或 `searchEpisodeAdapter.ts`

建议职责名称偏 `resolver`，因为这里不是简单字段映射，而是后续解析决策。

推荐暴露的不是多个零散函数，而是一组围绕 `SearchEpisode` 的明确入口。

例如：

```ts
type SearchEpisodeSecondHopIntent =
  | 'open_show'
  | 'open_episode'
  | 'play'
  | 'favorite'
  | 'download'

type SearchEpisodeSecondHopContext = {
  searchEpisode: SearchEpisode
  podcastItunesId: string
  showTitle: string
}
```

再提供类似：

```ts
resolveSearchEpisodeSecondHop(...)
buildSearchEpisodeShowRoute(...)
ensureSearchEpisodePlaybackContext(...)
ensureSearchEpisodePersistenceContext(...)
```

这里的关键不是名字，而是：

- 以后 `SearchEpisode` 的第二跳语义从这里进
- 组件不再自己拼

## 5. 责任边界

统一 owner 应负责：

- 定义 `SearchEpisode` 后续动作所需的最小上下文
- 定义每类动作的 second-hop 起点
- 统一 route / playback / persistence 之前的补全策略
- 明确哪些动作只需要 show-level context
- 明确哪些动作需要 episode-level PI / RSS 补全

统一 owner 不应负责：

- 直接渲染 UI
- 承担所有最终网络实现细节
- 混入播放 UI 状态或组件状态

## 6. 推荐分层

### 6.1 第一层：纯决策层

输入：

- `SearchEpisode`
- 目标 intent
- 已有 cache / query 能力的抽象入口

输出：

- 该走哪一条 second-hop 路线
- 是否需要 show-level PI
- 是否需要 episode-level PI
- 是否需要 feed fallback

这层尽量保持纯逻辑、可测试。

### 6.2 第二层：执行层

把第一层决策落到实际能力：

- 查 `podcasts/byitunesid`
- 查 `episodes/byitunesid`
- 查 feed
- 生成 route
- 构造 playback / favorite / download 所需 payload

第一阶段不一定要完整抽出来，但长期建议往这层收。

## 7. 动作级建议

### 7.1 Open Show

这是最简单的 second-hop。

只需要：

- `podcastItunesId`
- route 所需最小 show context

原则：

- 不应为 open show 额外要求 episode-level identity

### 7.2 Open Episode

这是最容易分散的地方。

原则：

- 不要由页面/组件自行决定是直接跳、先查 PI、还是先查 feed
- 应由统一 owner 决定 episode detail resolution 的进入方式

### 7.3 Play

原则：

- 不要由多个消费点自己决定播放前是否需要补 PI / feed 信息
- 播放路径应统一依赖 resolver 返回的 playback-ready context

### 7.4 Favorite / Download

原则：

- 持久化动作需要的 identity 必须统一定义
- 不要一个地方存 show-level 信息，另一个地方再用 episodeUrl 临时顶替 provider identity

## 8. 第一阶段建议范围

第一阶段不要大拆，只做最小收口：

1. 新增统一 second-hop owner 文件
2. 先把 `SearchEpisodeItem`
3. 再把 `CommandPalette`
4. 再把 `episodeRowModel`

这三处改为调用统一入口，而不是自己推断

第一阶段目标不是“抽象到完美”，而是先建立唯一 owner。

## 9. 推荐最小 API 草案

初步建议如下：

```ts
export type SearchEpisodeIntent =
  | 'open_show'
  | 'open_episode'
  | 'play'
  | 'favorite'
  | 'download'

export async function resolveSearchEpisodeIntent(
  episode: SearchEpisode,
  intent: SearchEpisodeIntent,
  deps: SearchEpisodeResolverDeps
): Promise<SearchEpisodeResolvedIntent>
```

返回值由 intent 决定，可以是：

- show route context
- episode route context
- playback-ready payload
- persistence-ready payload

重点是：

- 所有 second-hop 决策都从这一入口走

## 10. 不建议的方案

### 10.1 不建议继续把逻辑留在组件里

原因：

- 组件应消费能力，不应拥有 second-hop 语义

### 10.2 不建议为了统一而把第一跳 schema 强行加宽

原因：

- 第一跳的职责不是满足所有后续能力
- second-hop owner 的存在就是为了避免这种反向污染

### 10.3 不建议直接做一个大而全的“万能 episode service”

原因：

- 太重
- 难落地
- 第一阶段不需要

## 11. 第一阶段验收标准

- `SearchEpisode` 的第二跳决策有唯一 owner
- 上述 3 个主要消费点不再各自推断 second-hop 路线
- route / playback / persistence 的 second-hop 语义在代码层可以被统一搜索和审查
- first-hop schema 不因 second-hop 收口而被无原则加宽

## 12. 当前判断

这个问题真实存在，但不是当前 first-hop contract 的阻断 bug。

它更像是：

- second-hop 责任边界尚未收口
- 适合在后续第二跳 walkthrough 中系统处理

因此，本 instruction 的定位是：

- 先定义方向
- 后续在第二跳相关 walkthrough / refactor 中落地
