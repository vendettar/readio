# Instruction 017: Cloud UI 移动端 Sidebar 响应式适配 [COMPLETED]

> **⚠️ CRITICAL**: You MUST preserve the current desktop UI/UX layout and styling. Do NOT change visual appearance on desktop (≥ md breakpoint).

## 问题

当前 Cloud UI 的布局是纯桌面设计：
- Sidebar 始终 260px 固定宽度（`w-sidebar`, `flex-shrink-0`）
- 无任何响应式处理
- 在 ≤ 768px 的移动设备上，内容区域几乎不可见

## 目标

移动端（< 768px）sidebar 改为 overlay drawer 模式，桌面端保持原样。

| 屏幕 | 行为 |
|------|------|
| `< md (768px)` | Sidebar 默认隐藏，汉堡按钮触发 overlay drawer（带 backdrop） |
| `≥ md` | 保持当前固定 260px 布局，零变化 |

## 断点 contract

本任务必须 **只使用 Tailwind `md` (768px)** 作为响应式断点。

- 不使用 `BREAKPOINTS.TABLET: 800`
- 不允许 JS 与样式使用不同断点
- 所有移动端 drawer 行为与桌面端固定布局切换，都以 Tailwind `md` 为唯一断点语义

## 实现方案

### 1. `AppShell.tsx` — sidebar 状态 owner

- 添加 `const [sidebarOpen, setSidebarOpen] = useState(false)`
- `sidebarOpen` 的状态 owner 必须在 `AppShell.tsx`
- 不要把 drawer 开关状态分散到 `Sidebar.tsx` 内部 local state
- `Sidebar.tsx` 必须通过 props 接收最小必要 contract，例如：
  - `open?: boolean`（可选，默认 `true`，桌面端始终打开）
  - `onClose?: () => void`（可选，默认 no-op）
  - `onNavigate?: () => void`（可选，默认 no-op）
- 所有新 props 必须为可选，以保证桌面端向后兼容
- `SidebarItem`、底部 settings link、mobile close button 都必须回调到 `AppShell.tsx` owner
- 不允许在 `Sidebar.tsx` 或 `SidebarItem` 内再引入第二套 drawer state
- 在 `<main>` 区域上方添加汉堡菜单按钮（仅 `< md` 可见）
- 汉堡按钮必须使用 `lucide-react` 的 `Menu` 图标，保持设计系统一致
- 汉堡按钮必须放在一个 **仅移动端存在** 的 lightweight control row 中
- 当 `mode === 'full'`（full player 打开）时，汉堡按钮必须隐藏
- 不允许改变桌面端内容区 spacing / layout contract
- 不允许破坏现有 `<main>` scroll container 的高度与 overflow 结构
- 在 `<main>` 区域添加 backdrop overlay（仅 `< md` 且 `sidebarOpen` 时可见），点击关闭 sidebar

### 2. `Sidebar.tsx` — 响应式 drawer

- 添加桌面端保留类：`hidden md:flex md:w-sidebar md:flex-shrink-0`
- 添加 drawer 模式：当 `sidebarOpen` 为 true 且 `< md` 时，使用 `fixed inset-y-0 left-0 z-50 w-64` 覆盖显示
- 添加关闭按钮（仅 `< md` 可见）
- 桌面端不出现 close button

### 3. 移动端交互细节

- 点击 backdrop → 关闭 sidebar
- 按 ESC → 关闭 sidebar（仅移动端 drawer 模式）
- 点击 sidebar 内导航链接 → 关闭 sidebar（仅移动端）
- **当 route 发生变化时，如果移动端 drawer 仍开着，也必须自动关闭**
- 桌面端 sidebar 永远不可关闭

### 3.1 Route change close contract

- route change auto-close 必须使用 TanStack Router 的 `useLocation()` 监听 `pathname` 变化
- 不允许使用 `window.location` 或 `window.addEventListener('popstate')`
- route change auto-close 必须覆盖：
  - Link 点击导航
  - browser back / forward
  - programmatic navigation
  - pathname/search 变化导致的 route transition
- 不允许只依赖"点击某个 sidebar 链接时顺带关闭"来满足该需求
- route transition 监听仍应服从 `AppShell.tsx` 的 state owner 约束，不要在 `Sidebar.tsx` 内形成隐式 owner

### 4. body scroll lock

移动端 drawer 打开时必须锁定页面滚动：

- open on mobile → lock body scroll
- close / unmount → always restore body scroll
- 不允许 backdrop 打开后页面内容仍可滚动
- 该逻辑必须与 `AppShell.tsx` 现有的 full-player / immersed body overflow 管理兼容
- 不允许 close drawer 时误解锁本应继续被 full player 锁定的 body
- 必须恢复 drawer 打开前的 body overflow 值，而不是无条件恢复为空字符串
- 实现方式：在设置 body overflow 前先读取当前值并保存，close 时只在自己设置过的情况下才恢复
- 如果 body overflow 已经是 `'hidden'`（full player 已打开），drawer 不应修改它

### 5. 焦点与可访问性 contract

first pass 不要求完整 focus trap，但至少必须满足：

- hamburger button 提供 `aria-expanded`
- close button 提供明确的 accessible name
- drawer 打开后，焦点应落在 close button 或 drawer 内首个可交互元素
- ESC 关闭后，焦点返回 hamburger button
- 若使用 dialog-like 容器，应提供合理 role/label

### 5.1 Surface / stacking contract

- desktop stacking / layering contract 必须保持不变
- mobile drawer 与 backdrop 可以覆盖主内容区
- 不允许引入新的 desktop z-index 行为
- 不允许破坏以下现有 surface：
  - `MiniPlayer`
  - `PlayerSurfaceFrame`
  - `GlobalAudioController`
- 如果 full player surface 已处于主导状态，实现不得引入与其冲突的第二套 overlay 语义
- first pass 不要求专门为 full player 设计新交互，但必须保证“不变坏”

### 6. SSR / hydration safety

- 不允许在 render 期直接用 `window.innerWidth` 做分支
- 不允许引入 hydration mismatch 风险的 viewport 判断
- 优先使用 Tailwind 响应式类
- 如需事件逻辑，仅在 client-safe effect / interaction 中处理

## 技术约束

- 使用 Tailwind 响应式类和已有 z-index tokens，不引入新 CSS 或任意值语法
- 不使用第三方 drawer/modal 库
- drawer 使用 `z-overlay`（60），高于 MiniPlayer（50），低于 full-player（100）
- backdrop 使用 `bg-black/50` + `z-sidebar`（40）— 移动端 sidebar 为 `hidden`，该层级空闲可用
- 禁止使用 `z-[...]` 任意值语法（违反 design system zero-arbitrary-values 规则）
- 不改变 `--sidebar-width` CSS 变量
- 不改变 MiniPlayer、PlayerSurfaceFrame、GlobalAudioController 的行为
- desktop stacking / layering contract 必须保持不变
- mobile overlay 可以覆盖内容区，但不能引入新的 desktop z-index 行为

## 执行范围

**必须修改**：
1. `apps/cloud-ui/src/components/AppShell/AppShell.tsx`
2. `apps/cloud-ui/src/components/AppShell/Sidebar.tsx`

**必须创建或更新**：
3. `apps/cloud-ui/src/components/AppShell/__tests__/MobileSidebar.test.tsx`

**不得修改**：
- `apps/cloud-ui/src/components/AppShell/GlobalAudioController.tsx`
- `apps/cloud-ui/src/components/AppShell/PlayerSurfaceFrame.tsx`
- `apps/cloud-ui/src/components/MiniPlayer.tsx`
- `apps/cloud-ui/src/constants/layout.ts`
- `apps/cloud-ui/tailwind.config.js`
- `apps/cloud-ui/src/index.css`
- 不得重排 sidebar 信息架构，不得调整现有导航项顺序、分组或文案

## 验证

### 测试
必须覆盖：

- 桌面端（≥ md）sidebar 始终可见，无 hamburger 按钮
- 桌面端无 backdrop、无 close button、无 drawer state side effect
- 移动端（< md）sidebar 默认隐藏
- 点击 hamburger 按钮 → sidebar 以 drawer 模式弹出
- 点击 backdrop → sidebar 关闭
- 按 ESC → sidebar 关闭
- 点击导航链接 → sidebar 关闭（移动端）
- route change → sidebar 自动关闭（移动端）
- 关闭按钮在移动端 drawer 中可见
- drawer 打开时 body scroll 被锁定，关闭后恢复
- hamburger button `aria-expanded` 正确变化
- route transition 关闭不能只靠点击事件覆盖，必须验证真实 route state change 情况
- body scroll lock 恢复必须在“初始 body overflow 非空”场景下也正确

### 测试实现要求
- 测试不能只断言静态 class 名
- 必须验证交互状态变化
- 必须 mock / 控制移动端条件，而不是依赖真实浏览器宽度
- 不允许只做“有无按钮”的浅层测试就结束
- class 名断言只能作为辅助，不能作为 drawer 正确性的唯一证据
- 必须至少有一条 regression test 覆盖：
  - drawer close 不会错误清空原有 `document.body.style.overflow`
- 必须至少有一条测试覆盖：
  - 非点击触发的 route change 也会关闭移动端 drawer

### 命令
```bash
pnpm -C apps/cloud-ui test:run -- MobileSidebar
pnpm -C apps/cloud-ui lint
pnpm -C apps/cloud-ui typecheck
```

## Review focus

Reviewer 必须重点检查：
1. 桌面端（≥ md）布局是否零变化
2. Sidebar 在移动端是否正确隐藏/显示
3. Backdrop 点击是否正确关闭 sidebar
4. ESC 键是否正确关闭 sidebar
5. 导航链接点击与 route change 是否都能正确关闭 sidebar（移动端）
6. body scroll lock 是否正确设置与恢复
7. 焦点是否在 open / close 时合理流转
8. 不引入新的 z-index 冲突
9. 不改变 MiniPlayer 或播放器行为
10. 不引入 render-time viewport branching / hydration 风险
11. `Sidebar.tsx` 是否偷偷引入了第二套 local drawer state
12. body scroll lock 是否与 full-player 现有 overflow 管理发生冲突

## Non-goals

- 不做 Lite 版本适配（仅限 Cloud UI）
- 不做内容区域的响应式重排（sidebar 是唯一问题）
- 不做横屏/竖屏特殊处理
- 不做 PWA/安装提示
- 不做复杂动画设计；first pass 可无动画或仅极简 transition
- 不重构 sidebar 内部信息架构
- 不顺手改 command palette、theme toggle、播放器交互语义

## Documentation

- Not applicable (UI-only change, no docs update needed)

## Completion
- **Completed by**: Worker (Execution Engine)
- **Commands**:
  - `pnpm -C apps/cloud-ui test:run -- --testNamePattern="MobileSidebar"` (23 tests PASS)
  - `pnpm -C apps/cloud-ui lint` (PASS)
  - `pnpm -C apps/cloud-ui typecheck` (PASS)
- **Date**: 2026-04-05
- **Reviewed by**: Reviewer
