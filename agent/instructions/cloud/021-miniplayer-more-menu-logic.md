---
description: Contract for the MiniPlayer 3-dot more menu, including transcript import/export and audio export behavior
---

# Instruction 021: MiniPlayer More Menu Logic

# Task: 为 Cloud MiniPlayer 增加稳定的 transcript/audio More 菜单合同

## Objective

在 `MiniPlayer` 中引入一个 3-dot More 菜单，用于：

1. 导入当前播放对象的 transcript
2. 导出当前 transcript
3. 导出当前音频
4. 导出 transcript + 音频的组合包

同时保证：

- 不破坏 MiniPlayer 的尺寸、层级与交互
- 不在 `MiniPlayer.tsx` 中堆叠业务逻辑
- 与 `019` transcript-first、`020` artwork CTA contract 保持一致

## Decision Log

- **Required / Waived**: Required

## Bilingual Sync

- **Required / Not applicable**: Required

## 术语约定

本任务统一使用：

- 领域对象 / 代码语义：`transcript`

允许最终 display copy 使用：

- `文本`
- `转写文本`
- `逐字稿`

但：

- selector
- helper
- service
- review
- tests

都必须以 `transcript` 为主语义，不得回退到 `subtitle` 作为主要领域命名。

## 问题背景

当前 `MiniPlayer` 只承载基础 transport controls 与 volume utilities，没有稳定的更多操作入口。  
如果直接在 `MiniPlayer.tsx` 里堆导入/导出逻辑，容易产生以下问题：

1. 组件承担过多业务逻辑
2. transcript import/export 与当前播放 identity 绑定不清
3. local / remote / download 场景被混为一谈
4. 导出 audio / transcript 时绕开既有 repository / download contract
5. 与 `019/020` 的 transcript-first 语义冲突

## 核心原则

### 1. MiniPlayer 只拥有菜单 UI，不拥有全部业务逻辑

`MiniPlayer.tsx` 可以拥有：

- menu open/close state
- trigger button
- menu item wiring

但导入/导出动作本身必须通过：

- 明确的 helper
- service
- repository boundary

来执行。

禁止把以下复杂逻辑直接塞进 `MiniPlayer.tsx`：

- 文件解析
- transcript persistence
- zip 组装
- remote audio 导出编排
- identity 解析

### 2. 所有 action 必须绑定到“当前播放 identity”

不得使用弱标识（如 title、podcast name、artwork URL）关联导入/导出对象。

必须优先使用稳定 identity：

1. `localTrackId`
2. `episodeMetadata.originalAudioUrl`
3. 规范化后的 playback identity key

### 3. 导入 transcript 后应立即进入 transcript-first 可见路径

成功导入 transcript 后：

- 当前播放对象应立即拥有可用 transcript source
- 当前 Reading Area 应切回 transcript-visible path
- auto-follow 应开启

更具体地：

- 如果当前 Reading Area 已打开：
  - 必须立即切到 transcript-visible path
- 如果当前 Reading Area 当前关闭：
  - first-pass 不要求强制打开 Reading Area
  - 但当前 playback state / CTA / transcript-bearing state 必须立即反映 transcript 已可用

禁止：

- 导入成功后仍停留在 `Generate Transcript`
- 导入成功后继续保留 artwork CTA 作为主状态

### 4. More 菜单不得绕开现有 media/transcript contract

音频导出、transcript 导入/导出必须复用既有边界：

- transcript storage/repository
- audio download/export helpers
- current playback identity

不得在 MiniPlayer 中重新发明：

- 独立 fetch/download path
- 独立 transcript persistence path
- 独立 zip assembly stack

## UI Placement & Styling

- **Position**: MiniPlayer 最右侧 utility 区域，位于现有 volume / utility controls 之后
- **Icon**: `MoreVertical`（推荐）或 `MoreHorizontal`
- **Component**: 标准 `DropdownMenu`（Radix-based）
- **Trigger**: `Button variant="ghost" size="icon"`
- **Layer**: 保持在 `z-mini-player` 可交互层中
- **Height contract**: 不得突破 `h-mini-player`

## Overflow Menu Consistency

MiniPlayer more menu 必须遵守当前应用已有的 overflow-menu 交互模式。

这意味着：

- 复用与 Files / Downloads 卡片 3-dot 菜单相同的基础菜单组件体系
- 保持相近的分组哲学与动作排序习惯
- 不要无理由发明一套 MiniPlayer-only overflow IA

### 一致性要求

1. **基础组件一致**
   - 使用同一套 `DropdownMenu` / menu item / submenu primitives

2. **动作排序一致**
   - 常规动作优先
   - grouped export actions 可以收在二级菜单
   - destructive actions（如果未来加入）应遵循现有卡片菜单的末尾/隔离规则

3. **二级菜单使用需有充分理由**
   - 只有当多个动作天然属于同一 action family 时，才允许 sub-menu
   - `Export...` 属于合理的 grouped family
   - 不要为了“看起来高级”把原本可平铺的动作强行塞进多层菜单

4. **MiniPlayer 不得成为例外风格**
   - 即使动作集合不同，MiniPlayer more menu 的交互语气和结构层次也应让用户感觉它属于同一产品体系

如实现者认为 MiniPlayer more menu 必须明显偏离 Files / Downloads 的菜单结构，必须在 reviewer notes 中写明原因与收益。

## Menu owner / action owner

### Menu owner

`MiniPlayer.tsx` 负责：

- trigger button
- menu open state
- item disabled/enabled 状态
- 调用 action handler

### Action owner

导入/导出动作必须由专门 helper / service 承担：

- transcript import helper
- transcript export helper
- audio export / download helper
- combined export helper

first-pass 允许 `MiniPlayer.tsx` 直接调用这些 helper，但不允许把 helper 内部逻辑内联回组件。

## Menu structure

### Level 1: Main menu

1. `Import Transcript`
2. `Export...`（sub-menu）

### Level 2: Export sub-menu

1. `Export Transcript`
2. `Export Audio File`
3. `Export Transcript and Audio File`

## Action contracts

### A. `Import Transcript`

#### Allowed input

- `.json`
- `.vtt`
- `.srt`

#### Required behavior

1. 打开文件选择器
2. 解析 transcript 文件
3. 将其绑定到当前播放 identity
4. 成功后立刻让当前 transcript 成为 active transcript
5. 成功后自动开启 follow mode
6. 成功后让 Reading Area 进入 transcript-visible path

#### Identity binding contract

优先级必须明确：

1. 如果当前有 `localTrackId`
   - transcript 绑定到该 local track
2. 否则如果当前是 remote playback
   - transcript 绑定到当前规范化 playback identity（如 normalized audio URL）

禁止：

- 仅凭 title / artwork / podcast 名称绑定 transcript
- 导入到“某个大概是当前节目”的模糊目标

#### Failure contract

如果导入失败：

- 不改变当前 follow state
- 不改变当前 transcript-visible state
- 不误写入存储
- 不写入 partial / malformed transcript
- 不清空当前已有 transcript
- 不把当前 active transcript 切换到空状态

### B. `Export Transcript`

#### Required behavior

- 导出当前 active transcript version
- 不是任意缓存 transcript
- 不是“猜一个 transcript source”

#### Active transcript resolution order

first-pass 必须按如下优先级解析“当前 active transcript”：

1. 当前 session 已激活的 transcript
2. 当前播放 identity 绑定的 imported local transcript
3. 当前播放 identity 命中的 cached / ingested transcript
4. 当前播放 identity 对应的 built-in transcript source

#### Enablement

仅当当前播放 identity 存在可导出的 transcript 时 enabled。

若当前无 transcript：

- item 应 disabled
- 不应点了再报“没有 transcript”

### C. `Export Audio File`

#### Required behavior

根据 source 类型分流：

1. local / downloaded audio
   - 直接走本地可用 source / repository/export helper

2. remote-only audio
   - 复用既有 download/export path
   - 允许触发浏览器下载

#### Playback safety contract

音频导出不得影响当前活跃播放：

- 不得替换当前 playback src
- 不得暂停当前播放
- 不得重置 currentTime
- 不得触发 seek / restart side effect

#### Forbidden behavior

- 在 MiniPlayer 中自写新的 remote fetch/download stack
- 绕开既有 media fallback / proxy / export contract

### D. `Export Transcript and Audio File`

#### Required behavior

- 仅在 transcript 与 audio 都可导出时 enabled
- 组合包可使用 `.zip`
- 组装逻辑必须在 helper/service 层，不在组件内手写

#### First-pass archive contract

first-pass 推荐固定为：

- `.zip` 容器
- 当 transcript 与 audio 都存在时，zip 内恰好包含 2 个文件：
  - transcript file
  - audio file
- 文件名必须来自当前播放 identity 或统一的 normalized naming helper
- 不得仅凭原始 display title 直接拼装不稳定文件名

#### Forbidden behavior

- transcript 缺失时仍可点击
- audio 缺失时仍可点击

## Enabled / Disabled matrix

### Menu trigger

- `!hasActiveTrack` -> disabled

### `Import Transcript`

- active track exists -> enabled
- no active track -> disabled

### `Export Transcript`

- transcript exists for current playback identity -> enabled
- otherwise -> disabled

### `Export Audio File`

- exportable audio source exists -> enabled
- otherwise -> disabled

### `Export Transcript and Audio File`

- transcript exists + exportable audio exists -> enabled
- otherwise -> disabled

first-pass 不要求 hidden matrix，优先 disabled 而不是条件消失。

## Menu interaction contract

- 打开文件选择器前，menu 应关闭
- action 完成后，menu 不应残留为打开状态
- disabled item 不得触发任何副作用

## 与 019 / 020 的对齐

### 与 019 transcript-first playback 对齐

导入 transcript 成功后：

- 当前播放对象应立即被视为 transcript-bearing
- 不应继续落到 automatic ASR branch

### 与 020 artwork CTA 对齐

导入 transcript 成功后：

- artwork CTA 不应继续显示 `Generate Transcript`
- 应进入 transcript-visible path 或至少进入 `Transcript available` + `Show Transcript`

### Pure listening mode

如果当前是 `stream_without_transcript`：

- import transcript success 后，允许显式退出 pure listening mode
- first-pass 推荐直接切回 transcript-visible state

不得出现：

- transcript 已导入，但 UI 仍表现得像 transcript 不存在

## Local vs remote transcript precedence

如果当前 episode 同时存在：

- built-in remote transcript
- newly imported local transcript

first-pass 推荐合同：

- 用户刚导入的 transcript 成为当前 session 的 active transcript
- 对当前 session 显示优先级高于 built-in remote transcript

如果实现采用不同优先级，必须在 reviewer notes 里明确说明，并证明不会造成用户点击导入后仍看到旧 transcript。

## Technical references

可参考但不得机械复制：

- `hasStoredTranscriptSource`
- `tryApplyCachedAsrTranscript`
- `PlayerDownloadAction.tsx`
- current transcript storage / export repository boundaries

## Required localization keys

- `miniPlayerMore`
  - EN: `More`
  - ZH: `更多`

- `importTranscript`
  - EN: `Import transcript`
  - ZH: `导入 transcript`

- `exportOptions`
  - EN: `Export...`
  - ZH: `导出...`

- `exportTranscript`
  - EN: `Export transcript`
  - ZH: `导出 transcript`

- `exportAudio`
  - EN: `Export audio file`
  - ZH: `导出音频文件`

- `exportAll`
  - EN: `Export transcript and audio`
  - ZH: `导出 transcript 与音频`

如果最终中文 display copy 想改成：

- `文本`
- `转写文本`

这是允许的；但 key 语义与实现合同仍应保持 `transcript`。

## Required tests

至少覆盖：

1. no active track -> menu trigger disabled
2. import transcript success -> transcript applied + follow enabled
3. import transcript failure -> no follow mutation, no mode corruption
4. transcript exists -> export transcript enabled
5. no transcript -> export transcript disabled
6. local/downloaded track -> export audio uses local/export helper path
7. remote-only track -> export audio delegates to existing remote download/export path
8. combined export disabled unless both transcript and audio are exportable
9. import transcript success aligns current CTA/transcript-visible path with `019/020`
10. menu does not break MiniPlayer height / layout / z-layer contract
11. importing transcript while built-in remote transcript exists makes the imported transcript active for the current session
12. export audio does not pause, restart, or replace the active playback source
13. menu closes before file picker / action flow and disabled items produce no side effect

## Review focus

Reviewer 必须重点检查：

1. `MiniPlayer.tsx` 是否只保留 menu wiring，而不是吞下全部业务逻辑
2. transcript import/export 是否绑定到当前播放 identity，而不是弱标识
3. import transcript success 后是否立即进入 transcript-bearing path
4. local / remote audio export 是否按 source type 正确分流
5. combined export 是否有正确的 enablement contract
6. 是否与 `019/020` 的 transcript-first / CTA 语义保持一致
7. 是否遵守了与 Files / Downloads 现有 3-dot 菜单一致的 overflow-menu 结构与分组习惯
7. import 成功后若 Reading Area 已打开，是否立即显示 transcript；若未打开，是否至少即时更新 CTA/state
8. built-in transcript 与 imported local transcript 并存时，当前 session 是否优先显示刚导入版本

## Non-goals

本任务不要求：

1. 重写 transcript storage schema
2. 重新设计 MiniPlayer 整体布局
3. 修改 backend `/api/proxy` contract
4. 大规模重写下载体系

## Verification

- 运行 MiniPlayer focused tests
- 运行 transcript import/export focused tests
- 运行 current-session transcript precedence focused tests
- 手工验证：
  - active track 有/无时菜单状态
  - import transcript 后当前 UI 是否切到 transcript-bearing path
  - local / remote audio export 是否走正确路径
  - 导出音频时当前播放是否持续不中断

## Completion

- **Completed by**:
- **Commands**:
- **Date**: 2026-04-07
- **Reviewed by**:

When finished: append `[COMPLETED]` to the H1 and fill Completion fields.
