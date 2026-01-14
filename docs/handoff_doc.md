# Readio（React + TypeScript 重写版）开发介绍 / 交接文档

面向接手开发团队：介绍当前代码的功能边界、关键模块、算法与缓存策略、持久化与测试方式，以及常见排障入口。

> 分支：`feature/react-rewrite`（React 19 + TS + Vite SPA）  
> 原版（DOM/原生 JS）参考：`main` 分支与 `original/` 目录

---

## 0. 交付假设

首次发布策略：没有 IndexedDB / localStorage 的迁移兼容层，存储结构或缓存逻辑变化时以清库/重建处理。
审计范围规则：默认只审查最近变更；如明确要求可执行全量仓库审计。

---

## 1. 项目做什么（产品/功能概述）

Readio 是一个浏览器内播客播放器，支持：
- **Files (文件)**: 拖放 MP3 + SRT 字幕文件进行播放和阅读，支持文件夹管理
- **Explore (探索)**: 全局搜索、播客搜索、订阅播客，收藏节目
- **字幕跟随**：播放时字幕自动滚动高亮
- **选词查词**：选中字幕文本可查询词典/网页搜索
- **全局搜索**：顶部侧边栏搜索，支持二级模式（历史、发现、本地）以及播放状态标识（StatusBadge）

主要入口（路由）：
- `/` - 主播放器页面（字幕阅读）
- `/search` - 全局搜索结果页
- `/explore` - 探索页面（寻找播客）
- `/subscriptions` - 订阅列表
- `/favorites` - 收藏节目
- `/history` - 播放历史
- `/files` - Files 页面（音频、字幕管理，支持文件夹、拖放）
- `/settings` - 设置页面

---

## 2. 本地开发 / 构建 / 测试

构建与测试脚本：`npm install`、`npm run dev`、`npm run build`、`npm run test:run`、`npm run test:e2e`。
代码质量工具：已迁移至 Biome（`npm run lint`、`npm run format`、`npm run check`），不再使用 ESLint/Prettier。

### UI Primitives（统一交互组件）

UI 交互控件采用 `shadcn/ui` primitives（`Button/Input/Select/DropdownMenu/Dialog/AlertDialog/Slider` 等），文件选择使用隐藏 `<input type="file" className="hidden" />` 搭配可见 `Button` 触发。

### 交互与焦点管理（当前实现）

焦点由 React `autoFocus` 与 Radix `onCloseAutoFocus` 管理；滚动状态判断使用 Virtuoso 的 `isScrolling` 等原生钩子，不依赖定时器。

### 数据变更记录 (Data Changes)

- **Source Enum**: `source`字段已更新为 `'local' | 'explore'` (原 `'gallery'` 已废弃)。
- **Provider IDs**: `collectionId` 重命名为 `providerPodcastId`，`trackId` 重命名为 `providerEpisodeId`。保留 Podcast 与 Episode ID 的区分，移除 iTunes 特定命名。
- **Routes**: 全面使用 `/explore` 作为发现页路由，`/files` 作为文件页路由。

### Icon Policy (Lucide-First)

UI 操作图标来自 `lucide-react`；SVG 仅用于 logo 与交互绑定资源。

保留的 SVG 资源：
- `src/assets/readio.svg`, `src/assets/readio.png` — App 标识
- `src/assets/selection-pin.svg` — SelectionUI pin（CSS mask，交互绑定）

图标来源统一且风格一致，UI 操作类 SVG 文件不在 `src/assets/` 中扩展。

### Global CSS（当前范围）

`src/index.css` 包含主题 token、交互类样式（reading/selection/拖拽）、Smart List Divider、以及局部滚动条样式；布局尺寸使用 Tailwind 令牌与扩展 token（`w-panel` 25rem、`w-panel-sm` 20rem、`max-w-content` 105rem/1680px、`max-w-content-wide` 112.5rem）。

**布局一致性准则**：
- **最大宽度**：核心内容页面（Explore, History, Favorites, Search, Subscriptions, Settings, Show/Episode Detail）统一使用 `max-w-content` (1680px)。
- **水平间距**：页面级容器必须使用 `px-[var(--page-margin-x)]`，以确保内容与侧边栏的 48px (3rem) 安全距离，并为单集列表的 Gutter 动效预留空间。

### Standardized Helpers & Hooks（共享基础能力）

1. **ID 生成** (`src/libs/id.ts`)
   - `createId()` - 使用 `crypto.randomUUID()` 生成唯一 ID（带降级方案）
   - `createShortId()` - 生成短 ID
   - `createSessionId()` - 生成会话 ID
   - `createToastId()` - Toast 通知 ID（语义别名）

2. **存储访问** (`src/libs/storage.ts`)
   - 基础: `getJson<T>(key)`, `setJson(key, value)`, `removeItem(key)`, `clearStorage()`
   - 命名空间: `nsKey(namespace, key)` - 构建命名空间键
   - TTL: `getJsonWithTtl<T>(key, ttlMs)`, `setJsonWithTtl(key, value)`
   - 清理: `clearNamespace(prefix)` - 按前缀清理存储

3. **事件监听** (`src/hooks/useEventListener.ts`)
   - `useEventListener(eventName, handler, element, options)` - 稳定的事件监听器，自动清理

4. **点击外部检测** (`src/hooks/useOnClickOutside.ts`)
   - `useOnClickOutside(handler, enabled)` - 检测元素外部点击

5. **外部导航** (`src/libs/openExternal.ts`)
   - `openExternal(url, target)` - 安全的外部 URL 打开（带 `noopener,noreferrer`）

6. **格式化工具** (`src/libs/formatters.ts`)
   - `formatTimestamp(timestamp, locale?)` - 统一的日期时间格式化（替代 `toLocaleDateString`）
   - `formatDuration(seconds)` - 格式化时长（MM:SS）
   - `formatTimeLabel(seconds)` - 播放时间显示（M:SS）
   - `formatBytes(bytes)` - 文件大小格式化
   - `formatCompactNumber(num)` - 大数字缩略（如 1.5K）

这套 helpers 作为基础能力被广泛复用：ID 生成、存储访问、事件监听、外链打开与时间/文件大小格式化统一由上述模块提供。

### Standardized UI Components (可复用组件)

1. **确认对话框** (`src/components/ui/confirm-alert-dialog.tsx`)
   - `ConfirmAlertDialog` - shadcn AlertDialog 的封装
   - Props: `open`, `title`, `description`, `confirmLabel`, `cancelLabel`, `variant`, `isLoading`, `onConfirm`, `onCancel`
   - 配套 Hook: `useConfirmDialog()` (`src/hooks/useConfirmDialog.ts`)
     - 返回 `{ state, openConfirm, closeConfirm }`
   - 使用位置: `settings.tsx`

2. **溢出菜单** (`src/components/ui/overflow-menu.tsx`)
   - `OverflowMenu` - 标准化的下拉菜单触发器和内容
   - 提供一致的 Button 触发器（ghost, icon）和 DropdownMenuContent 默认值
   - 支持 `disabled`（用于拖拽/重命名等状态下禁用菜单触发）
   - 使用位置: `TrackOverflowMenu.tsx`, `FolderOverflowMenu.tsx`

3. **交互式标题 (InteractiveTitle)** (`src/components/interactive/InteractiveTitle.tsx`)
   - **规则**：所有列表中的节目卡片/单集卡片，仅标题（title）部分支持点击导航（hover 时显示下划线）。
   - **优先级**：如果同时传入 `onClick` 和 `to`/`params`，`onClick` 优先执行。这确保了在单集列表中点击标题可以触发播放（如果未提供详情页跳转）。
   - **动态截断 (Line Clamping)**：支持 `maxLines` 属性（1-6 或 'none'），默认为 2 行。在列表页（如单集列表）建议保持 2 行，而在网格页（如播客卡片）应显式传入 `maxLines={1}`。
   - **排他性**：描述区域（description/subtitle）禁止包含点击操作，不得链接到节目详情。
   - **非交互渲染**：若未提供 `onClick` 或 `to`/`params`（如 podcastId 缺失），组件会自动渲染为 `<span>` 结构以保持视觉一致性但禁止点击逻辑。
   - **表现**：统一使用 `Button asChild` 封装 `Link`。
   - **标准交互文本规则 (Standardized Text Hover Rule)**：
     - **核心原则**：所有基于纯文本的交互项（如节目名、单集名、网页链接等），在 Hover 时**不得改变颜色或透明度**。
     - **视觉效果**：Hover 时仅添加**下划线**（`underline`）。
     - **排除项**：明确的功能性按钮（如 Subscribe、Favorite、Play 按钮等）不适用此规则，它们应保留各自的背景色/透明度交互反馈。
      - **统一实现**：全站下划线样式应保持一致。对于 `Button` 组件，已新增 `variant="text"`，该变体在 Hover 时不改变文字颜色/背景色，仅配合 `InteractiveTitle` 或 `Link` 实现下划线效果。
    - **鼠标指针 (Cursor)**：所有按钮及 `InteractiveTitle` 必须在 Hover 时显示 `cursor: pointer`。此规则已集成在 `src/components/ui/button.tsx` 的基础变体中。

4. **交互式封面 (InteractiveArtwork)** (`src/components/interactive/InteractiveArtwork.tsx`)
   - **逻辑**：将“封面点击导航”与“悬浮播放按钮”逻辑封装。
   - **合规性**：通过绝对定位（Sibling）确保 `Play` 按钮不是 `Link` 的子元素，解决 A11y 嵌套元素警告。
   - **隐私/安全**：默认应用 `referrerPolicy="no-referrer"`，防止引用第三方图片资源时因 Referrer Check 导致的 403 错误（如部分 RSS 托管图源）。
   - **适用**：`PodcastCard`, `EpisodeCard`, `SearchEpisodeItem`, `PodcastEpisodesGrid` 以及收藏/历史列表。
   - **无封面兜底**：当 `artworkUrl` 为 null/undefined 时，调用方应**隐式移除**封面占位（不传 `artwork` prop 给 `BaseEpisodeRow`），并转而使用 **Gutter Play Button** 方案（见下文）。
   - **尺寸**：支持 `sm/md/lg/xl` 四种标准尺寸。
   - **交互默认**：不启用 hover 放大；如需放大需显式传 `hoverScale`。
   - **位置规则**：默认 `center`；播客卡片使用 `bottom-left`；Top Episodes 网格保持 `center`。
   - **触发规则**：在单集列表中，播放按钮应随整行 hover 显示（不是仅 hover 到封面时出现）。
   - **触发绑定**：通过 `hoverGroup` 将 hover 触发绑定到父级列表行/卡片（如 `episode`/`item`/`session`/`card`）。
   - **播放按钮可见性**：仅当调用方传入 `onPlay` 时显示播放按钮；未提供播放能力的卡片不得显示播放按钮（避免误导）。
   - **Explore 例外**：Explore 的 Top Shows / Top Subscriber / Editor's Picks 可通过 `onPlayLatest` 拉取 RSS 并播放最新一集，因此允许显示播放按钮；Top Episodes 为单集榜单，播放入口走 `onPlay`。

5. **EpisodeRow & BaseEpisodeRow** (`src/components/EpisodeRow/`)
   - **BaseEpisodeRow**: 纯展示组件 (Presentational Component)。
     - **视觉规范**：
       - **Hover 背景层**：必须使用绝对定位层 (`absolute inset-y-0`)，且左侧偏移固定为 `-left-[var(--page-gutter-x)]`。这确保了所有列表项（无论有无封面）的选中高亮区域在垂直方向上完美对齐成一个矩形柱。
       - **全高覆盖**：使用 `inset-y-0` 确保背景层完全覆盖单集行的高度，使其顶边和底边能严丝合缝地贴合分割线。
       - **分割线逻辑**：结合 `smart-divider-group` 手法。分割线组件应具备 `group-hover/episode:opacity-0`，使得当前 hover 行及其相邻行的分割线自动消失，营造流畅感。
     - **无封面单集方案 (No-Artwork Gutter Play)**：
       - **触发条件**：当单集无封面图时生效。
       - **组件表现**：不渲染封面占位符。使用 `GutterPlayButton` 原子组件在左侧 Gutter 区域渲染播放按钮。
       - **可见性**：仅在整行 `group-hover/episode` 时可见。背景层宽度会自动覆盖此按钮，确保交互区域完整且美观。
   - **GutterPlayButton**: 原子组件 (`src/components/EpisodeRow/GutterPlayButton.tsx`)。
     - **职责**：封装 Gutter 区域的播放按钮逻辑，减少跨组件重复代码。
     - **Props**：`onPlay` (点击回调), `ariaLabel` (无障碍标签)。
     - **使用位置**：`EpisodeRow`, `SearchEpisodeItem`, `HistoryPage`, `FavoritesPage`。
   - **EpisodeRow**: 业务逻辑容器 (Container Component)。
     - 职责：连接 Store 和 Hooks (`useEpisodePlayback`, `useExploreStore`)，处理播放、收藏、数据格式化。
     - 使用：在 `PodcastShowPage`, `PodcastEpisodesPage`, `SearchPage` 等场景直接使用。
     - 扩展：对于 `FavoritesPage` 和 `HistoryPage` 等有特殊交互需求的页面，直接复用 `BaseEpisodeRow` 并通过插槽注入自定义逻辑。

### App Initialization（应用初始化）

全局数据加载（收藏、订阅）已集中到根路由的 `useAppInitialization()` 钩子：

- **实现位置**：`src/routes/__root.tsx` 调用 `src/hooks/useAppInitialization.ts`
- **加载内容**：
  - `loadSubscriptions()` - 加载订阅列表
  - `loadFavorites()` - 加载收藏列表
- **架构原则**：
  - 页面组件**禁止**手动调用 `loadSubscriptions` 或 `loadFavorites`
  - 所有数据在应用启动时一次性加载，通过 Zustand store 全局共享

### 播客描述渲染 (RSS Description Rendering)

**核心策略**：使用 `@tailwindcss/typography` 插件（`prose` 类）结合自定义配置来渲染外部 RSS HTML 内容。

**Typography 配置**（`tailwind.config.js`）：
- `fontSize`: 0.875rem (14px)
- `fontWeight`: 300
- `lineHeight`: 1.4
- `paragraphMargin`: 10px (bottom), 0px (top)
- `whiteSpace`: `whitespace-pre-line`（折叠冗余空白并保留换行）
- **链接样式**：无 hover 颜色/透明度变化，仅保持下划线（符合标准交互文本规则）

**HTML 安全净化**（`src/libs/htmlUtils.ts`）：
- 使用 `DOMPurify` 进行 XSS 防护
- **DOMPurify Hooks**：
  - `afterSanitizeAttributes`: 自动为 `<a>` 标签添加 `target="_blank"` 和 `rel="noopener noreferrer"`
  - `afterSanitizeElements`: 移除视觉上为空的 `<p>` 标签（包括 `&nbsp;` 和空白字符），解决 RSS 源中常见的巨大留白问题

### Theme Accent（强调色）

- 强调色选项与 Settings UI 绑定为同一套 source of truth：`src/store/themeStore.ts`
  - `ACCENT_OPTIONS`（10 个）：`zinc/red/orange/amber/green/teal/blue/indigo/purple/pink`
  - 运行时会将未知 accent 归一化到 `DEFAULT_ACCENT`
- `src/index.css` 的 `:root[data-accent="…"]` / `.dark[data-accent="…"]` 仅保留上述 10 个选项对应的 token 覆盖

### Settings Page Hooks (Settings 页面逻辑分离)

Settings 页面已重构为"编排层"，数据加载和操作逻辑提取到独立 hooks:

1. **useSettingsData** (`src/hooks/useSettingsData.ts`)
   - 加载存储信息和播放会话
   - 返回 `{ storageInfo, sessions, isLoading, reload }`

2. **useStorageMaintenance** (`src/hooks/useStorageMaintenance.ts`)
   - 存储维护操作（删除会话、清理缓存、清空全部）
   - 返回 `{ deleteSession, clearSessionCache, wipeAll, isClearing }`

### Density Variants (密度变体)

- `ViewDensity` 类型定义: `src/components/LocalFiles/types.ts`
- `TrackCard.tsx` 使用 `cva` 定义所有密度变体:
  - `trackCardContentVariants`
  - `trackCardIconVariants`
  - `subtitleSectionVariants`
  - `subtitleRowVariants`
  - `subtitleIconContainerVariants`
- 路由层 (`files.tsx`) 仅传递 `density` prop，无内联类名分支

---

## 3. App Shell 架构

应用采用 App Shell 模式，由 `src/components/AppShell/` 组件提供：

### 布局结构

```
│ - Search (Global)  │  Main Content (flex-1)          │
│                  │                                 │
│ - Discover        │  <Outlet /> (路由内容)          │
│   - Explore       │                                 │
│ - Library        │                                 │
│   - Subscriptions│                                 │
│   - Favorites    │                                 │
│   - History      │                                 │
│   - Files        │                                 │
│ - Settings       │                                 │
├──────────────────┴─────────────────────────────────┤
│               MiniPlayer (bottom, fixed)           │
└────────────────────────────────────────────────────┘
```

### 关键组件

|组件 | 文件 | 职责 |
|------|------|------|
| AppShell | `src/components/AppShell/AppShell.tsx` | 协调布局，根据 immersion 状态决定显示内容 |
| Sidebar | `src/components/AppShell/Sidebar.tsx` | 左侧导航栏（集成了 GlobalSearchInput 和 SearchOverlay） |
| GlobalSearchInput | `src/components/GlobalSearch/GlobalSearchInput.tsx` | 侧边栏顶部的全局搜索框，支持 ⌘K 快捷键 |
| SearchOverlay | `src/components/GlobalSearch/SearchOverlay.tsx` | 搜索预览弹层（一阶段结果预览） |
| MiniPlayer | `src/components/AppShell/MiniPlayer.tsx` | 底部播控（高度 73px），采用业界领先的胶囊设计：封面图外置、拖拽进度条、动态音量等级图标 |
| FullPlayer | `src/components/AppShell/FullPlayer.tsx` | 全屏沉浸阅读模式 |

### 会话恢复机制

**策略**：播放进度通过 `playback_sessions` 表持久化，刷新页面后自动恢复。

- **Podcast 会话**：通过 `audioUrl` 索引查找上次的 session
- **本地文件会话**：通过 `localTrackId`（local_tracks.id）精确查找，避免同名文件跨文件夹冲突
- **Dexie Schema**: 单一版本（v1）定义当前全部表结构与索引，不维护历史版本。

**实现细节**：
- **本地文件播放**: `useLocalPlayback` 在播放时先设置 `sessionId`（格式：`local-track-{trackId}`），然后创建包含完整信息的 session（包括 audioId 用于 Last Played）
- **播客播放**: `setAudioUrl(..., metadata)` 将 episode metadata 写入 store，`useSession` 创建 session 时持久化到 `playback_sessions`
- **Session 恢复**: `useSession` 检查是否已有 sessionId，有则跳过；无则：
  1. **确定性守卫**：对于本地文件，先直接查询 `local-track-{trackId}` 是否存在，存在则直接复用
  2. 否则通过 `localTrackId` 或 `audioUrl` 索引查找
  3. 都未找到才创建新 session
- **防止竞态**: 先设置 sessionId + 确定性 ID 查询，完全消除重复创建风险
### Immersion Mode（沉浸模式）

- **状态管理**：`src/store/immersionStore.ts`（Zustand）
- **进入方式**：点击 MiniPlayer 区域或展开按钮
- **退出方式**：点击 FullPlayer 右上角 Minimize 按钮
- **行为**：
  - 进入时：隐藏 Sidebar，全屏显示 FullPlayer
  - 退出时：恢复正常布局
  - 播放不中断：`<audio>` 元素在 `__root.tsx` 中持久存在

---

## 4. 路由（TanStack Router + File-Based Routing）

使用 TanStack Router 实现路由，通过 Vite 插件自动生成路由树。

### 路由结构

| 路径 | 文件 | 说明 |
|------|------|------|
| `/` | `src/routes/index.tsx` | 主播放器页面（字幕阅读） |
| `/search` | `src/routes/search.tsx` | 全局搜索结果页（接受 `?q=` 参数） |
| `/explore` | `src/routes/explore.tsx` | 发现播客（搜索） |
| `/podcast/:id` | `src/routes/podcast/$id.tsx` | 播客详情页（节目列表） |
| `/podcast/:id/episode/:episodeId` | `src/routes/podcast/$id/episode/$episodeId.tsx` | 单集详情页 |
| `/subscriptions` | `src/routes/subscriptions.tsx` | 订阅列表 |
| `/favorites` | `src/routes/favorites.tsx` | 收藏节目 |
| `/history` | `src/routes/history.tsx` | 播放历史 |
| `/files` | `src/routes/files.tsx` | Files 页面（音频、字幕管理，支持文件夹、拖放） |
| `/settings` | `src/routes/settings.tsx` | 设置页面 |

### 页面导航约定

- 页面内不提供“返回上一页/返回上级”按钮；用户通过 Sidebar 导航或浏览器原生返回进行页面切换。

### 播放器基础能力

- **音频播放**：HTML5 `<audio>` 元素在 `__root.tsx` 中挂载，跨路由持久化
- **播放速率控制**: 0.8x ~ 2.0x，通过 `playerStore.playbackRate` 管理，持久化通过 `storage.ts` 的 `setJson` 写入 localStorage。FullPlayer 读取 store 状态并提供速率切换按钮。
- **音量控制**：0-1 范围，通过 `storage.ts` 持久化到 localStorage（`usePlayerStore`）
- **进度控制**：Slider 直接调用 `seekTo()` 接口，用户拖拽结束后统一 seek
- **本地文件播放**：Blob URL 临时挂载，`< 300MB` 的音频缓存到 IndexedDB 支持离线恢复
- **播客元数据**：`setAudioUrl` 可接收 EpisodeMetadata（description/podcastTitle/feedUrl/artworkUrl/publishedAt），并写入 `playerStore.episodeMetadata` 供 History/Favorites 展示

### 国际化架构

**核心原则**：所有用户可见文案必须通过 t(key) 体系处理

- **React 组件内**: 使用 `useI18n()` hook，调用 `t(key, options)`
- **Store 和工具函数**: 使用 `libs/i18nUtils.ts` 的 `translate(key, options)` 函数
  - 自动读取语言设置
  - 支持插值（如 `{size}`, `{count}`）
  - 内置 fallback 到英文
  - 防止 undefined key 崩溃
  - **仅在开发环境输出 console.warn**，生产环境静默

**示例**：
```typescript
// In React component
const { t } = useI18n();
toast.info(t('largeFileNotCached', { size: fileSize }));

// In store or non-React context
import { translate } from '../libs/i18nUtils';
toast.info(translate('largeFileNotCached', { size: fileSize }));
```
### 关键设计

- **播放器常驻**：`<audio>` 元素和播放状态在 `__root.tsx` 中挂载，路由切换不中断播放
- **路由生成**：`src/routeTree.gen.ts` 由 Vite 插件自动生成
- **路由级按需加载**：`/explore`、`/search`、播客详情/单集/历史/收藏/Files 等页面使用 `lazyRouteComponent` 拆分，减少首包体积
- **重模块按需加载**：主播放页的 `TranscriptView` 与沉浸模式 `FullPlayer` 使用 `React.lazy` 延迟加载
- **全局样式**：CSS 在 `main.tsx` 入口引入，确保所有路由可用
- **播放控制**：进度条拖动通过 `onSeek` → `store.seekTo` → `store.pendingSeek` → `__root.tsx` 的 audio element，避免直接 DOM 操作

---

## 5. i18n 国际化

使用轻量级 `t(key)` 方案，**不使用 i18next**。

### 实现

- **翻译文件**：`src/libs/translations.ts`（6 种语言：zh/en/ja/ko/de/es）
- **Hook**：`src/hooks/useI18n.tsx` 提供 `t(key)` 函数
- **Provider**：在 `main.tsx` 中包裹 `<I18nProvider>`

### 当前做法

用户可见文案通过 `t(key)` 渲染；技术信息（错误详情等）仅输出到 console，不对用户展示。

### 搜索/历史/收藏相关 i18n Keys

| Key | 用途 | 示例值 (EN) |
|-----|------|-------------|
| `searchEmptyHint` | 搜索无结果时的提示 | "Try a different search term" |
| `searchEmptyTitle` | 搜索页无查询时标题 | "Search for podcasts and episodes" |
| `searchEmptyBody` | 搜索页无查询时描述 | "Use the search bar above to find content" |
| `searchResultsCount` | 搜索结果计数（支持插值） | "{count} results" |
| `historyProgressSuffix` | 历史页进度后缀 | "played" |
| `historyPlayedAt` | 历史页播放时间标签 | "Played at" |
| `historySourceLocal` | 历史来源：本地文件 | "Files" |
| `historySourcePodcast` | 历史来源：播客 | "Podcast" |
| `favoritesAddedLabel` | 收藏添加时间（支持插值） | "Added {date}" |
| `readingBgTitle` | 阅读背景设置标题 | "Reading Background" |
| `readingBgHint` | 阅读背景设置提示 | "Applied to the transcript..." |
| `ariaRemoveDownloadedAudio` | 移除已下载音频的 aria label | "Remove downloaded audio" |
| `sourceLocal` | 来源：本地 | "Local" |
| `sourcePodcast` | 来源：播客 | "Podcast" |

插值通过 `t(key, { ... })` 完成，翻译结果不做二次字符串处理，以保持多语言正确性。

## 6. 持久化与缓存（Dexie IndexedDB）

使用 Dexie.js 封装 IndexedDB，数据库名：`readio-v2`。

### 数据库 Schema

| Store | Primary Key | Indexes | 用途 |
|-------|-------------|---------|------|
| sessions | id | lastPlayedAt | 播放会话（进度、音频/字幕 ID） |
| audioBlobs | id | storedAt | 本地音频文件 Blob |
| subtitles | id | storedAt | 本地字幕文件内容 |
| folders | ++id | createdAt | 本地文件夹 |
| local_tracks | ++id | folderId, createdAt | 本地音乐库音轨（链接 audioBlobs） |
| local_subtitles | ++id | trackId | 本地音乐库字幕（链接 subtitles） |
| subscriptions | feedUrl | addedAt | 订阅的播客 |
| favorites | key | addedAt | 收藏的节目 |
| settings | key | — | 用户设置（如 country） |

### 重置策略

首次发布策略允许清库重建，不包含迁移兼容层。`clearAllData()` 使用表级清空而非删除数据库，保持 DB 实例可用。
**Dexie 版本策略**：仅保留单一版本（v1）定义，不维护历史版本或升级路径。未来 schema 变更直接清库重建；不要递增 version 号。

---

## 7. 目录结构

```
src/
├── routes/              # TanStack Router 路由文件
│   ├── __root.tsx       # 根布局（AppShell、Audio 元素、Toast）
│   ├── index.tsx        # 主页/播放器（字幕阅读）
│   ├── explore.tsx      # 发现播客
│   ├── subscriptions.tsx # 订阅列表
│   ├── favorites.tsx    # 收藏节目
│   ├── history.tsx      # 播放历史
│   ├── files.tsx        # Files 路由布局（Outlet）
│   └── files/           # Files 子路由
│       ├── index.tsx    # Files 列表/文件夹网格
│       └── folder/
│           └── $folderId.tsx # Folder view
├── routeComponents/     # 路由页面组件（路由级 lazy 加载）
│   ├── ExplorePage.tsx
│   ├── SearchPage.tsx
│   ├── FavoritesPage.tsx
│   ├── HistoryPage.tsx
│   ├── SubscriptionsPage.tsx
│   ├── SettingsPage.tsx
│   ├── podcast/
│   │   ├── PodcastShowPage.tsx
│   │   ├── PodcastEpisodesPage.tsx
│   │   └── PodcastEpisodeDetailPage.tsx
│   └── files/
│       ├── FilesIndexPage.tsx
│       └── FilesFolderPage.tsx
├── components/
│   ├── AppShell/        # App Shell 组件
│   ├── GlobalSearch/    # 全局搜索组件 (Input, Overlay, StatusBadge)
│   ├── Transcript/      # 字幕相关组件
│   ├── Selection/       # 选词/查词组件
│   ├── FollowButton/    # 跟随按钮
│   ├── ZoomControl/     # 缩放控制
│   ├── PlayerControls/  # 播放器控件
│   ├── interactive/     # Custom interaction primitives (InteractiveTitle, InteractiveArtwork)
│   ├── Explore/         # Explore page business components (Carousels, Grid)
│   └── Toast/           # Toast 通知
├── hooks/               # 自定义 Hooks
│   ├── useLocalFilesData.ts      # 本地文件数据加载
│   ├── useLocalFileProcessing.ts # 文件处理（仅暴露 handlers）
│   ├── useLocalFileDragDrop.ts   # 拖放逻辑
│   └── useLocalFolderManagement.ts # 文件夹管理
├── libs/                # 工具库
│   ├── dexieDb.ts       # Dexie 数据库封装
│   ├── exploreApi.ts    # 播客搜索/RSS 解析 API
│   ├── translations.ts  # i18n 翻译
│   └── recommended/
│       └── cache.ts     # 推荐缓存（前缀：readioExplore*）
├── store/               # Zustand stores
│   ├── playerStore.ts   # 播放器状态
│   ├── searchStore.ts   # 搜索状态管理
│   ├── exploreStore.ts  # Explore 状态
│   └── immersionStore.ts # 沉浸模式状态
├── router.tsx           # Router 实例
└── routeTree.gen.ts     # 自动生成的路由树
```

### LocalFiles Ingestion API

- 入口：`useLocalFileProcessing` hook 的 `handleAudioInputChange` 和 `handleSubtitleInputChange`
- `processFiles` 为内部实现细节，不对外暴露
- 纯模块：`src/libs/localFiles/ingest.ts`（无 React 依赖）
- **自动去重 (Auto-Rename)**：导入时若检测到同一文件夹下存在同名（不区分大小写）音频或字幕文件，会自动追加递增后缀。
    - 行为：简单追加 `(N)`，如果已存在 `Audio (2).mp3` 则生成 `Audio (2) (2).mp3`（不解析已有后缀）。
    - 音频：在目标文件夹范围内查重。
    - 字幕：在目标 Track 范围内查重。
- **字幕匹配去重（单次消耗）**：批量导入时，每个字幕文件在一次操作中仅被使用一次，防止多对一错误绑定。
    - **场景**：用户同时从不同来源（如 Folder A 和 Folder B）拖入重名文件 `Song.mp3`，并附带一个 `Song.srt`。
    - **行为**：Subtitle 只会绑定给第一个被处理的 `Song.mp3`，后续的同名 MP3 不会绑定该字幕。
    - **目的**：确保字幕匹配的一对一关系，符合直觉。

### Files UX

**文件夹卡片**：
- 显示项目计数（"X items"）
- 视觉权重低于音频卡片（更简洁的背景/边框）
- 无播放按钮、时长、字幕信息

**空状态**：
- 标题：`localFilesEmptyHeadline`
- 说明：`localFilesEmptyBody`

**文件夹辅助说明**：
- New Folder 按钮下方显示 `localFilesFolderHelperText`

**音频卡片元数据**：
- "Last played · X ago"（如有 `lastPlayedAt` 数据）
- 多字幕时首个显示 "Default" 标识

**辅助工具**：
- `src/libs/relativeTime.ts`：格式化相对时间（无外部依赖）

**数据模型**：FileTrack 现存储原始大小/时长数值（`sizeBytes`、`durationSeconds`），UI 层统一格式化显示。

**加载骨架**：
- Files 首次加载时显示简易骨架占位（合集网格 + 轨道列表），避免空白跳闪。

### View Controls Bar

Files 页面采用专用的 View Controls Bar 组件来托管所有浏览相关控件。

**页面结构**：
```
Header Row (创建操作)
  左侧: 面包屑 + 标题
  右侧: [+ 新建文件夹] [+ 添加音频]

View Controls Bar (浏览控件)
  左侧: (预留给未来 Sort/Group/Filter)
  右侧: 密度切换

Content
  文件夹区域 (仅根目录)
  音频列表
```

**组件**：`src/components/LocalFiles/ViewControlsBar.tsx`
- Props: `density`, `onDensityChange`, `leftSlot?` (未来扩展用)
- 使用 shadcn Button + Radix Tooltip
- 图标按钮模式，带 tooltip 提示

### View Density System

**设置 Key**：`localFiles.viewDensity`
- 存储：`DB.getSetting()` / `DB.setSetting()`
- 值：`"comfortable"` | `"compact"`
- 默认：`comfortable`

**类型定义**：`src/components/LocalFiles/types.ts`
- 导出 `ViewDensity` 类型供所有 Files 相关组件使用

**状态管理**：
- 本地状态于 `src/routes/files/index.tsx`（Folder view 复用同一 setting key）
- 挂载时从 settings 表读取
- 切换时立即更新 UI 并异步持久化

**Variant 架构**（cva 模式）：
- `TrackCard.tsx` 使用 `class-variance-authority` 定义密度变体
- 变体函数：`trackCardContentVariants`, `subtitleRowVariants`, `subtitleIconContainerVariants` 等
- 路由文件仅负责传递 `density` prop，不包含密度相关的类名逻辑
- **信息排列调整**：文件名 / 文件大小 / 时长 同行显示。文件大小与时长均采用 `Icon + Text` 风格（大小使用 `Package` 图标，时长使用 `Clock` 图标）。文件大小位于时长左侧，即使时长在 MD 以下屏幕隐藏，文件大小仍保留在右侧信息区以维持单行结构。
- **密度调整**：由于信息移至单行，Comfortable 模式下的 `TrackCard` 高度已适度压缩（Padding 从 `p-5` 减至 `py-4`，Icon 从 `w-14` 减至 `w-12`），视觉上更清爽。

**i18n Keys**：
- `navFiles` — 侧边栏标签
- `filesTitle` — 页面标题 (H1)
- `filesSubtitle` — 页面副标题
- `localFilesDensityComfortable`
- `localFilesDensityCompact`
- `ariaViewDensity`
- `ariaMoreActions`
- `tooltipComfortableView`
- `tooltipCompactView`

> **命名说明**：UI 和路由均为 "Files"（`/files`），文件 `src/routes/files.tsx`。

### Overflow Menus (Track & Folder)

**组件位置**：`src/components/LocalFiles/TrackOverflowMenu.tsx`, `src/components/LocalFiles/FolderOverflowMenu.tsx`

**行为规范**：
- 仅点击打开（hover 仅显示微弱背景）
- 点击外部或再次点击触发器关闭
- 支持键盘导航（Esc 关闭、方向键导航）
- Track 菜单使用标准化 `OverflowMenu`（shadcn `DropdownMenu` 封装）
- Folder 菜单使用 `DropdownMenu`，删除确认采用 **同一个 menu surface 内的二步确认**（`step: menu → confirm`，内容在同一 `DropdownMenuContent` 内滑动切换）。隐藏面板使用 `inert` 以避免 `aria-hidden` focus warning，同时保持靠近触发点的 UX。
- FolderOverflowMenu 的 `DropdownMenuContent` 位置固定为 `side="bottom"`、`align="start"`（避免被改偏）。
- TrackOverflowMenu 的 `DropdownMenuContent` 位置固定为 `side="bottom"`、`align="end"`（避免被改偏）。

- **Move to…**: 内推面板式选择。支持“移动到文件夹”和“所有文件”（根目录）。
1. Move to… (`localFilesMoveToFolder`)
2. 分隔线
### Track Rename

**入口**：TrackOverflowMenu 中的 "Rename" 菜单项

**交互行为**：
- 内联编辑（在卡片内直接显示 Input）
- Enter 确认，Esc 取消
- 失焦时自动确认或取消
- 输入框自动选中

**重名冲突处理**（与 Folder Rename 一致）：
- 比较方式：`trim()` + 不区分大小写 + 仅同一文件夹范围内查重
- 异常行为：如果名称冲突，显示提示并保持编辑状态 (Redio Policy)
- 冲突时：输入框上方显示错误气泡（`trackNameConflict`），输入框红框，保持编辑模式
- 如果 trimmed === 原名：直接退出编辑，不提示

### Subtitle Management

**位置**：`TrackCard.tsx` 下方的字幕列表区域

**数量限制**：
- 每个音频文件最多允许添加 **5 个字幕** (`MAX_SUBTITLES = 5`)。

**达到上限后的行为**：
- **按钮状态**：`Add Subtitle` 按钮变为 `disabled`。
- **视觉变化**：按钮图标从 `Plus` 变为 `Lock` (Lucide)，文案直接显示为限制提示（如 "最多只能添加 5 个字幕文件"）。
- **交互逻辑**：达到上限后，不再显示额外的提示段落，点击按钮不触发选择器。

**i18n Keys**：
- `trackRename` — 菜单项文字
- `trackNameConflict` — 冲突错误提示
- `toastRenameFailed` — 重命名失败时的全局 Toast 提示文案

### Folder Management

**Folder Structure (Strict)**: 
- **Single-Level**: Folders cannot be nested. Folders sit at root. Files can be in Root or Folder.
- **Drag & Drop**: Folders cannot be dragged into folders. Files drag-and-drop into folders.
- **Breadcrumbs**: No breadcrumbs. Navigation relies on "Back to All Files".

**组件位置**：`src/components/LocalFiles/FolderCard.tsx`、`src/components/LocalFiles/FolderOverflowMenu.tsx`

**功能**：
- **Rename**: 内联重命名（Enter 确认，Esc 取消）。
    - **重名冲突 (Redio Policy)**：重命名为现有文件夹名称（忽略大小写）时，输入框上方将显示**内联错误气泡** (`folderNameConflict`)，输入框显示红框并保持编辑状态供修正。
    - **自身更名**：允许在不冲突的情况下进行大小写更名（例如 "Work" -> "work"）。
- **Create Folder (Root Only)**:
    - **自动去重**：新建文件夹如果名称存在，会自动增加后缀（例如 "New Folder (2)"）。
- **Pin/Unpin**: 置顶合集，通过 `pinnedAt` 字段持久化
- **Delete**: 删除合集（移除容器）。
  - **删除文件夹**：会级联删除其中的所有文件，删除为二次确认交互。
- **移动文件**：
    - 支持将文件拖拽到文件夹中。
    - 支持通过 TrackOverflowMenu -> "移动到..." 菜单移动。
    - **同名处理**：若目标文件夹已存在同名文件（不区分大小写），会自动重命名（追加 `(N)`），并显示 Toast 提示用户。
        - 行为与导入一致：保留原扩展名，后缀插在扩展名前。
    - **移动到根目录**：支持从文件夹移动回根目录。
- **Two-step Confirmation (same menu surface)**: 点击 Delete 进入 confirm view（菜单内容滑动切换；进入 confirm 后聚焦 Cancel；取消/点击外部/Esc 安全退出，不会误删）。

**合集排序逻辑**（`src/libs/files/sortFolders.ts`）：
1. 已置顶合集优先（按 `pinnedAt` 降序）
2. 未置顶合集按名称 A→Z 排序

**数据字段**：
- `LocalFolder.pinnedAt?: number` — 置顶时间戳

**i18n Keys** (Values Updated to Folder):
- `folderPinToTop`
- `folderUnpin`
- `folderRename`
- `folderDelete`
- `folderDeleteTitle` (New)
- `folderDeleteDesc` (New)
- `folderDeleteFailed` (New)

### Confirm Dialog

Readio 的确认交互基于 shadcn/Radix primitives：

- Settings 场景：`ConfirmAlertDialog` + `useConfirmDialog`
  - 组件：`src/components/ui/confirm-alert-dialog.tsx`
  - Hook：`src/hooks/useConfirmDialog.ts`
  - 使用：`src/routes/settings.tsx`
- Files 场景（删除 Track）：3-dot 菜单内二步确认（同一 `DropdownMenuContent` + `inert` 隔离隐藏面板）
- Folder 删除：3-dot 菜单内二步确认（同一 `DropdownMenuContent` + `inert`，避免嵌套 overlay 的 ARIA 冲突）
- **单步删除例外**：对于“移除收藏”（Favorites）和“删除播放历史”（History）这种非核心、低风险且频繁的操作，直接在 3-dot 菜单中执行单步删除，不再强制二步确认。


### Folder View Route

**路由**：`/files/folder/:folderId`

**文件位置**：`src/routes/files/folder/$folderId.tsx`

**导航行为**：
- 点击 FolderCard → 导航到 `/files/folder/{folderId}`
- "← Back to All Files" 按钮 → 导航回 `/files`
- **无层级**: 不使用面包屑导航

**布局**：
- Header: 返回按钮 + 文件夹名称 H1 + `{count} items` 副标题 + Add Audio 按钮
- Content: 复用 `TrackCard` 组件（与 root view 完全相同）
- Empty State: 使用 `folderEmptyTitle` + `folderEmptyHint` i18n keys

**Drag & Drop**：
- 文件夹视图内容区域是 drop target
- 拖放 track 到此视图会将其移入当前文件夹
- 拖放时显示轻微高亮轮廓
- **移动失败反馈**：使用 `toastMoveFailed` 提供自然语言提示

**组件复用**：
- `TrackCard` — 完全相同的 props 和行为
- `ViewControlsBar` — 密度切换
- Track 删除确认：3-dot 菜单内二步确认（同 root view）

**i18n Keys（新增）**：
- `folderEmptyTitle` — 空文件夹标题
- `folderEmptyHint` — 空文件夹提示

---

## 8. 测试

### 单元测试（Vitest）

- 测试文件：`src/__tests__/*.test.ts`
- 使用 `fake-indexeddb` 模拟 IndexedDB
- 共 119 个测试用例
- 脚本：`npm run test:run`

### E2E 测试（Playwright）

- 脚本：`npm run test:e2e`

---

## 9. 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript + Vite |
| 路由 | TanStack Router (file-based) |
| 状态 | Zustand |
| 持久化 | Dexie (IndexedDB) |
| 网络缓存 | TanStack Query |
| 弹层/Toast/Tooltip | Radix UI |
| 样式 | Tailwind CSS + shadcn/ui |
| 测试 | Vitest + Playwright |
| i18n | 轻量 t(key) 方案 |

---

## 9.1 TanStack Query（网络缓存）

**QueryClient** 位于 `src/main.tsx`，配置：
- `staleTime`: 5 分钟
- `gcTime`: 30 分钟
- `retry`: 1
- `refetchOnWindowFocus`: false

当前使用：
- `/explore` 搜索：`usePodcastSearch` (`src/hooks/usePodcastSearch.ts`)

`usePodcastSearch` 目前用于 `/explore` 搜索。

---

## 9.2 Radix UI (Toast/Tooltip)

### Toast

Provider 位于 `src/components/Toast/ToastContainer.tsx`，配合 `src/libs/toast.ts` 命令式 API。

### Tooltip

Provider 位于 `src/main.tsx`（`Tooltip.Provider`）。

---

## 9.3 Zod 数据验证与边界保护

应用使用 Zod 进行运行时数据验证，主要用于处理外部 API 响应、环境配置以及路由参数，确保数据进入应用核心逻辑前符合预期。

### 核心范围
1. **外部 API 响应** (`src/libs/discovery/providers/apple.ts`):
   - 使用 `src/libs/schemas/discovery.ts` 中定义的模式（`PodcastSchema`, `EpisodeSchema` 等）对 Provider API 和 RSS 解析结果进行强校验。
   - **严格校验规则**: 对核心 ID（`providerPodcastId/providerEpisodeId`）和 URL 字段强制 `min(1)` 或 `url()` 约束。
   - **错误处理**: 映射层（Mapping Layer）不再提供伪造的兜底值（如空字符串或 0）。验证失败时，列表接口会过滤掉无效项，单项接口返回 `null`。错误信息记录到 `console.warn`。
2. **环境配置** (`src/libs/runtimeConfig.ts`):
   - `getAppConfig` 对 `window.__READIO_ENV__` 和环境变量执行**逐字段校验**。
   - **颗粒度降级**: 若某个配置项非法（校验失败），仅该项回退到 Schema 定义的默认值，其它有效的覆盖配置将继续生效。
3. **路由参数** (TanStack Router):
   - 在播客详情（`$id`）和单集详情（`$id/episode/$episodeId`）路由中使用 `beforeLoad` 验证路径参数。
   - **重定向策略**: 若参数无效（如为空），统一重定向至 `/explore`。

### 验证策略
- **数据真实性**: 拒绝“凑数”对象，核心字段缺失即视为整条数据无效。
- **颗粒度降级**: 在配置校验中实现“局部损坏、整体可用”，增强系统鲁棒性。
- **非侵入性**: 不在 UI 组件内部或性能敏感的循环（如字幕渲染）中使用 Zod。
- **类型同步**: 使用 `z.infer<T>` 自动导出 TypeScript 类型。

---

## 10. Transcript（字幕渲染约束与虚拟列表）

产品要求：
- **字幕每个单词都可见**（多行显示，不做省略号截断）。

当前实现：
- 使用 `react-virtuoso` 实现动态高度虚拟列表。
- 移除了固定行高约束和文本截断。
- CSS 改为 `word-wrap: break-word; overflow-wrap: break-word; line-height: 1.5`，支持多行显示。
- **Zoom 支持**：通过 `useEffect` 监听 `zoomScale` 变化并触发 Virtuoso 重新测量。

实现细节：
- 组件：`src/components/Transcript/TranscriptView.tsx`
- FullPlayer 中也使用相同的 TranscriptView
- Following 模式：使用 `virtuosoRef.scrollToIndex()` 自动滚动到当前字幕行，居中对齐

---

## 10.1 Selection（选词/查词）

- UI 组件：`src/components/Selection/SelectionUI.tsx`（ContextMenu / LookupPopover / hover overlay）
- 用户可见错误信息使用 i18n：查词失败等通过 `TranslationKey`（如 `lookupNotFound`）映射为 `t(key)` 文案
- 动态定位：仅使用 `left/top` 或 CSS 变量注入来表达动态布局，避免在 `style={{...}}` 中直接写 `width/height/transform`

---

## 11. 架构加固 (Architecture Hardening)

### 代码分割

- **Vendor 分块**：`vite.config.ts` 使用 `manualChunks` 将大型依赖拆分

### 错误隔离

| 边界 | 覆盖范围 | 回退 UI |
|------|----------|---------|
| `RootErrorBoundary` | 整个应用 | 全屏错误页面 + 刷新按钮 |
| TranscriptView ErrorBoundary | 字幕视图 | 友好错误提示 + 复制诊断信息按钮 |

### 播放不中断

`<audio>` 元素挂载在 `__root.tsx`，路由切换不影响播放

### Architecture Consistency Status (架构一致性落地)

以下是 `docs/best_practice.md` 第 6 节定义的五项架构一致性原则的当前落地状态：

| 原则 | 状态 | 说明 |
|------|------|------|
| **A. 边界校验** | ✅ 已实现 | Discovery 模块通过 `src/libs/schemas/*` 实现 Zod 校验；`runtimeConfig` 实现配置校验。 |
| **B. 请求生命周期** | ⚠️ 部分实现 | 基础设施就绪（`requestManager`, `fetchUtils`）；Explore/Search 尚需统一 AbortSignal policy。 |
| **C. 缓存一致性** | ✅ 已实现 | `discovery` 与 `recommended` 均已统一使用 `storage.ts` 工具（satisfied Principle C）。 |
| **D. 错误处理分级** | ✅ 已实现 | User Error → Toast (i18n)；System Error → `console.warn/error`。 |
| **E. 类型领域分离** | ⚠️ 待完善 | `DiscoveryPodcast` (API) 与 `Podcast` (Domain) 共存，部分字段混用，需明确命名后缀。 |

**下一步改进方向**：
1. 为所有异步请求统一挂载 `AbortSignal`。
2. 明确 API DTO 与 Domain Model 的命名约定（如 `Api*Response` / `*`）。

---

## 12. 常见排障

### 路由不生效

`src/routeTree.gen.ts` 由 Vite 插件在开发启动时生成。

### 数据库错误

数据库名为 `readio-v2`，可在浏览器 IndexedDB 面板中查看与清理。

### Tailwind 样式不生效

PostCSS 管线使用 `@tailwindcss/postcss`（Tailwind v4）。

---

## 13. 全局搜索架构 (Global Search)

搜索系统作为全局入口，采用两阶段工作流：

### 一阶段：预览 (Preview Overlay)
- **触发**：Sidebar 搜索框聚焦或输入时。
- **展示**：`SearchOverlay` 组件以悬浮窗形式出现在搜索框下方。
- **内容**：展示高置信度的 Top Matches，每个类型（节目、单集、本地文件）限额 3-5 条。
- **状态标识**：使用 `StatusBadge` 实时显示内容与用户的关系（Subscribed, Favorited, Played, Local）。
- SearchOverlay 宽度使用 `w-96`，日期显示统一使用 `formatTimestamp`。

### 二阶段：结果页 (Full Search Page)
- **触发**：回车键或点击 "View all results"。
- **路由**：`/search?q=query`。
- **职责**：全面展示所有匹配项，支持分页处理。

### 核心行为
- 搜索作为独立内容检索系统，不是页面内过滤器。
- 结果按内容类型分组，用户关系作为元数据标记（Badges）。
- `⌘K` (meta+K) 作为全局快捷键。

### 性能与数据一致性规范
- **加载顺序**：任何依赖 `useExploreStore` 中 `subscriptions` / `favorites` 的搜索场景（Search Overlay、Full Search Page、自定义 hooks）都必须在访问前调用 `loadSubscriptions()` / `loadFavorites()`。若在 store 中仍未加载成功，需要回退到 Dexie 查询，而不是直接假设列表已就绪。
- **实时刷新**：搜索结果必须订阅 `useExploreStore` 的状态变化（例如通过 selector + Zustand subscription），而不是仅在挂载时读取一次 `getState()`。用户在搜索过程中若执行收藏/取关操作，Overlay/结果页需要即时刷新标记。
- **统一上限**：`useGlobalSearch(query, enabled, limits?)` 在 hook 层对四类本地结果（Subscriptions/Favorites/History/Local Files）做了统一上限控制（默认 5）。调用方不得在 UI 层随意扩展数量，如需特殊情况（例如 Search 页展示完整列表）必须显式传入 `limits` 覆盖。这样 Overlay / Spotlight / 结果页都共用同一套策略。
- **避免全表扫描**：本地历史 (`playback_sessions`) 和本地文件 (`local_tracks`) 表可能非常大，不允许在每次键入时 `getAll*()` 全量扫描。`useGlobalSearch` 已使用 Dexie 的 `searchPlaybackSessionsByTitle` / `searchLocalTracksByName` 并配合节流读取最近 N 条；新增场景必须遵循同样策略（基于索引、分页或 Worker），禁止再写新的全表扫描。
- **竞态防护**：本地 Dexie 搜索使用 200ms debounce + requestId 失效机制；清空查询会立即清空结果并阻止旧请求回写，避免短时间“闪回旧结果”。
- **一致动作**：所有 Local 结果（subscription/favorite/history/file）必须调用 `executeLocalSearchAction` 触发与列表页一致的行为（直接播放或定位到具体节目），而不是导航到聚合页让用户再次操作。
- **整行点按禁令**：SearchOverlay / 结果页等所有列表项，禁止将整行（包含描述区域）包装在同一个 `Link` 或 `Button` 中。
- **标题唯一导航**：点击描述区域（desc）不应触发导航；仅标题（通过 `InteractiveTitle`）和封面图（通过 `Button asChild`）允许导航。
- **状态回退**：当 iTunes 搜索/Lookup 返回的单集缺少 `feedUrl` 时，播放/收藏逻辑必须先尝试补充（例如再 lookup 一次或从 RSS 解析）；若最终仍无法拿到 `feedUrl`，应改为跳转至节目详情页（`handleSelectEpisode`）或提示错误，绝不能在缺少 feed 元数据的情况下写入播放 Session，否则 History/Favorites 会失去与节目的关联。
    - 注意：当 Overlay/全局搜索通过 `useGlobalSearch` 访问 store 数据时，必须保证 `loadSubscriptions()` / `loadFavorites()` 至少被调用过一次（可以在 Search Overlay mount 时触发）以防止 `getState()` 读到空列表。

---

## 14. Explore 页面 (播客发现)

### 定位与原则
- Explore 是播客发现/推荐页（搜索在侧边栏）
- 以 Podcasts 为核心，包含 Top Episodes 模块
- 页面风格：安静、克制、阅读优先
- 页面文案不包含 “Trending / Hot / Popular Now / 热门”

### 页面结构

| 模块 | 组件 | 数据来源 |
|------|------|----------|
| Header | 标题 "Explore" + 副标题 | i18n |
| Module D: Editor's Picks | 小卡片网格 | Discovery Provider Lookup API (固定 providerPodcastId[]) |
| Module A: Top Shows | Horizontal Carousel | Discovery Provider (Top Charts) |

| Module C: Top Episodes | Horizontal Grid | Discovery RSS Top Episodes (providerEpisodeId matching) |

### 组件位置

- `src/routes/explore.tsx` — 页面主体
- `src/components/Explore/TopShowsCarousel.tsx`
- `src/components/Explore/TopEpisodesGrid.tsx`
- `src/components/Explore/TopChannelsCarousel.tsx`

### 数据获取
- **Modules**: Editor's Picks、Top Shows 等模块使用 Discovery Provider (RSS/Search) 数据。
- **架构 (Provider Agnostic)**: 
  - **Facade**: `src/libs/discovery/index.ts` 是单一入口，对外屏蔽具体 Provider 实现。
  - **Interface**: `src/libs/discovery/providers/types.ts` 定义了标准 `DiscoveryProvider` 接口。
  - **Implementations**: 目前实现为 Apple Provider (`src/libs/discovery/providers/apple.ts`)，支持扩展其他 Provider (e.g., PodcastIndex)。
- **配置与数据源**: `src/constants/app.ts` (`EDITOR_PICKS_BY_REGION`) 和 `src/libs/discovery/`。
  - `fetchTopPodcasts()`, `fetchTopEpisodes()` — 调用 Provider 的榜单接口
  - `searchPodcasts()`, `getPodcast()` — 调用 Provider 的搜索/详情接口
  - `fetchPodcastFeed()` — 统一 RSS 解析
- `src/hooks/useDiscoveryPodcasts.ts` — TanStack Query hooks for Explore
- `src/hooks/usePodcastSearch.ts` — TanStack Query hook for Search

### 缓存策略

| 层级 | TTL | 用途 |
|------|-----|------|
| Memory | 1 小时 | 当前会话复用 |
| localStorage | 12 小时 | 跨会话持久化 |
| TanStack Query | staleTime 6h, gcTime 24h | 请求去重与刷新 |

### 导航行为（已更新）

- 点击 Top Shows / Editor's Picks 卡片 → 导航到 `/podcast/:id` Show Page
- Top Episodes / Top Channels → 尝试解析播客 ID，成功则导航，否则打开外部播客平台链接

### i18n Keys
- `exploreTitle`, `exploreSubtitle`, `editorPicksTitle`
- `topShowsTitle`, `topSubscriberShowsTitle`, `topEpisodesTitle`, `topChannelsTitle`
- `subscribe`, `subscribed`, `unsubscribe`

---

## 15. Podcast Show Page (播客详情页)

### 路由

| 路径 | 文件 | 说明 |
|------|------|------|
| `/podcast/:id` | `src/routes/podcast/$id.tsx` | 播客详情页（精致列表风格） |

### 数据流

1. **Lookup API**: 使用 `lookupPodcastFull(id)` 获取播客元数据（`collectionName`, `artistName`, `feedUrl`, `artworkUrl600`）
2. **RSS Feed**: 使用 `fetchPodcastFeed(feedUrl)` 解析 RSS 获取节目列表
3. **TanStack Query**: 两层查询实现缓存与去重

数据流：Show Page 先通过 Lookup API 获取元数据，再用 feedUrl 拉取 RSS 并渲染 Episodes。

### 页面布局（精致风格）

| 区域 | 内容 |
|------|------|
| Hero（桌面双栏/移动堆叠） | 大封面 + 标题 + Publisher + Subscribe 按钮 + 描述（可展开）+ Genres 标签 |
| Episodes List | 节目标题 + 摘要 + 发布日期 + 播放按钮 |

### 导航行为

- **Show Cards**（Editor's Picks / Top Shows）: 使用 `Link` 组件直接导航到 `/podcast/:id`
- **Top Episodes / Top Channels**: 尝试从 URL 提取播客 ID（正则 `/id(\d+)/`），成功则导航，否则打开外部链接
- **返回导航**: 使用 TanStack Router `Link` 返回 `/explore`，浏览器前进后退正常工作

### 订阅逻辑

- 使用 `exploreStore.subscribe()` / `unsubscribe()` 管理订阅状态
- 按钮状态根据 `subscriptions.some(s => s.feedUrl === podcast.feedUrl)` 切换

### 播放逻辑

- 点击节目调用 `playerStore.setAudioUrl(episode.audioUrl, episode.title, coverArt, metadata)` + `play()`
- 复用现有 MiniPlayer / FullPlayer，不创建新播放器

### UI 细节 (Pixel Perfect)

- **Smart Divider**: 列表项 Hover 时通过 `:has()` 选择器隐藏上方分割线，提供精致交互感。
- **EpisodeCard**: 使用 `group/episode` 配合 `relative` 布局实现深度定制的 Hover 区域和固定宽度的右侧 Action 区。
- **Tokens Over Pixels**: 布局类使用 Tailwind tokens（如 `max-w-md`, `ml-24`），不使用 `max-w-[450px]` 等任意值类名。
- **MiniPlayer**: 胶囊高度 48px，高度变量 `--mini-player-height` 设为 73px（含 Padding），封面图 48x48 带阴影并支持 Hover 展开。

### i18n Keys

- `episodesTitle`, `latestEpisodes`, `errorFeedLoadFailed`, `loadingPodcast`, `podcastLabel`
- 复用: `subscribe`, `subscribed`, `unsubscribe`, `showMore`, `showLess`, `commonBack`, `noEpisodes`

---

## 15.1 Episode Detail Page (单集详情页)

### 路由

| 路径 | 文件 | 说明 |
|------|------|------|
| `/podcast/:id/episode/:episodeId` | `src/routes/podcast/$id/episode/$episodeId.tsx` | 单集详情页 |

### 数据流

1. **Lookup API**: 使用 `lookupPodcastFull(id)` 获取播客元数据
2. **RSS Feed**: 使用 `fetchPodcastFeed(feedUrl)` 获取节目列表
3. **Episode Matching**: 通过多步骤匹配机制找到目标单集（见下方详细说明）

### Episode Lookup & Matching 机制（核心业务逻辑）

由于 iTunes API 和 RSS Feed 的数据格式差异，episode 匹配需要多层 fallback 策略：

#### 场景一：Episode Detail Page 恢复匹配

**文件**: `src/routes/podcast/$id/episode/$episodeId.tsx`

**步骤**:

1. **STEP 1 - Direct GUID Match (最快)**: 在 RSS feed 中直接匹配 `episode.id === episodeId`
2. **STEP 2 - Provider Lookup Fallback**: 如果 STEP 1 失败，使用 `lookupPodcastEpisodes(id, 'us', 50)` 获取 Provider 数据
3. **STEP 3 - Provider Metadata Match**: 在 Provider 结果中通过 `episodeGuid` 或 `providerEpisodeId` 匹配
4. **STEP 4 - Cross-Reference Match**: 用 Provider 元数据（标题或音频 URL）在 RSS feed 中匹配
5. **STEP 5 - Virtual Episode Creation**: 如果仍找不到（旧 episode 可能已从 RSS 删除），直接用 Provider 数据创建 "Virtual Episode"

**设计原因**:
- Provider API 的 `episodeGuid` 与 RSS feed 的 `<guid>` 可能有细微差异
- 部分旧 episode 可能已从 RSS feed 中移除，但 iTunes 仍有记录
- 保证用户分享的链接即使指向旧 episode 也能正常访问

#### 场景二：Top Episodes 收藏

**文件**: `src/routes/explore.tsx` - `handleToggleFavoriteEpisode()`

**问题**:
- RSS Charts API 返回的 `DiscoveryPodcast` 对象只有基础信息，没有 `audioUrl`
- Provider Lookup API 不支持直接用 episode `providerEpisodeId` 查找单个 episode（`id` 参数只接受 podcast `providerPodcastId`）

**解决方案 - 两步 fallback**:

1. **STEP 1 - iTunes Podcast Episodes**: 使用 `lookupPodcastEpisodes(podcastId, 'us', 50)` 获取 podcast 的 episode 列表
   - 通过 `providerEpisodeId` 或标题模糊匹配找到目标 episode
   - 获取完整 episode 数据（包括 `episodeUrl`）

2. **STEP 2 - RSS Feed Fallback**: 如果 iTunes 找不到（episode 可能超出 limit 范围），尝试从 RSS Feed 匹配
   - 通过标题模糊匹配（支持子串匹配）
   - 从 RSS 获取 `audioUrl` 和其他元数据

**代码示例**:
```typescript
// STEP 1: Provider Lookup (fast, limit=50)
const providerEpisodes = await lookupPodcastEpisodes(podcastId, 'us', 50);
let fullEpisode = providerEpisodes.find(ep =>
    String(ep.providerEpisodeId) === episode.id ||
    ep.trackName.toLowerCase().includes(episode.name.toLowerCase())
);

// STEP 2: RSS Fallback (comprehensive)
if (!fullEpisode && podcast.feedUrl) {
    const feed = await fetchPodcastFeed(podcast.feedUrl);
    const rssEpisode = feed.episodes.find(ep => /* title fuzzy match */);
    if (rssEpisode) {
        await store.addFavorite(podcast, rssEpisode);
        return;
    }
}
```

#### ⚠️ API Episode 数量限制（重要发现）

**实测结果**（2026-01-09）：

| 数据源 | The Daily (id: 1200361736) | 说明 |
|--------|---------------------------|------|
| `trackCount` | 2475 | Apple 知道的总 episode 数 |
| iTunes Lookup API (limit=300) | **23 episodes** | 实际返回数量 |
| RSS Feed | **28 episodes** | 节目方提供 |

**关键结论**：
- **iTunes Lookup API 并不比 RSS Feed 返回更多 episodes** - 对于大多数 podcast，两者返回数量相近（~25 条）
- `limit` 参数设置多大都无效，API 只返回节目方在 RSS 中提供的最近 episodes
- Apple 可能只是从 RSS feed 中提取并缓存最近的 episodes
- **无法通过公开 API 获取节目的完整历史档案**

**对 Readio 的影响**：
- 当前 `limit=50` 已足够覆盖大多数场景
- 两步 fallback（iTunes → RSS）策略仍然必要，因为两个数据源的 episode 列表可能略有差异
- 如果用户想收藏/播放一个很旧的 episode，两个方案都可能无法找到

### 页面布局

| 区域 | 内容 |
|------|------|
| Hero（桌面双栏/移动堆叠） | 封面图 + 单集标题 + 播客名称（链接到节目页）+ 发布日期 + 时长 |
| 操作区 | 播放按钮 + 收藏按钮 |
| 描述区 | 完整单集描述（可展开） |

### 导航行为

- **入口**: `EpisodeCard` 组件的标题是指向单集详情页的 `Link`
- **返回**: "Back to Show" 链接返回 `/podcast/:id`
- **播客名称**: 链接到节目页 `/podcast/:id`

### i18n Keys

- `backToShow`, `episodeNotFound`, `descriptionTitle`
- 复用: `playEpisode`, `showMore`, `showLess`, `ariaAddFavorite`, `ariaRemoveFavorite`

---

## 16. Runtime Configuration (运行配置)

### 集中化配置 (`public/env.js`)

应用采用动态运行配置，而非仅依赖编译时环境变量：
- **文件**: `public/env.js` (由 `index.html` 直接引入)
- **职责**: 管理 API 地址 (iTunes, Dictionary)、存储限制 (Audio Max Size, Cache Limit)、UI 参数 (Zoom, Click Delay)。
- **默认值**: 包含生产环境默认值，可在部署环境注入覆盖值。

### 配置访问 (`src/libs/runtimeConfig.ts`)

- `getAppConfig()` 提供类型安全的配置访问，支持 string-to-number 转换。
- `Window.__READIO_ENV__` 定义运行时配置结构。

---

## 17. i18n 增强 (interpolation)

- **支持变量替换**: `t(key, options)` 支持 `{count}` 等模板语法。
- **类型宽松化**: 为了兼容动态生成的 key，`t` 函数接受 `string` 类型，内部处理回退。
