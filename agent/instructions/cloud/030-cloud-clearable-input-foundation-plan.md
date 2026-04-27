# Instruction 030: Cloud Clearable Input Foundation Plan

## 1. Goal

为 Cloud UI 建立一套共享的 `clearable input` 能力，用于改善输入框的可用性，避免在各个页面零散地重复实现“清空输入”按钮。

这次工作的目标不是只给某一个搜索框打补丁，而是明确一套组件层方案，优先覆盖：

- 基础文本输入组件 `Input`
- `cmdk` 包装组件 `CommandInput`

首个直接受益场景：

- 全局搜索框 `CommandPalette`

---

## 2. Decision

采用：

- 在共享组件层新增可选 `clearable` 能力
- 保持默认关闭，由调用方显式开启
- 清空按钮只在“聚焦且有值”时出现
- 清空后保留焦点，不打断继续输入
- 对 `Input` 和 `CommandInput` 统一交互规则

明确不采用：

- 在每个页面单独拼一个 `x` 按钮
- 用绝对定位临时覆盖某一个输入框
- 一次性改动所有输入场景
- 为 file input / hidden input 强行加入 clearable 语义

---

## 3. Why This Plan

### 3.1 当前问题

目前项目里已经存在至少两类共享输入抽象：

- `apps/cloud-ui/src/components/ui/input.tsx`
- `apps/cloud-ui/src/components/ui/command.tsx`

如果直接在某个业务页面单独加清空按钮，会出现：

- 交互不一致
- 样式重复
- 可访问性规则分散
- 后续更多输入框还要重复造轮子

### 3.2 为什么要从共享组件层解决

这类能力本质上属于输入组件 contract，而不是某个页面的私有逻辑。

如果要做到：

- 全局搜索可清空
- 普通表单输入以后也能复用
- 行为一致

那么最佳实践就是在共享输入层提供能力，由页面按需启用。

### 3.3 为什么不一口气全量替换

当前代码里非测试环境下的原生 `<input>` 使用面并不大，但也不是所有输入都适合立即接入：

- 有些是 file input
- 有些是 hidden input
- 有些输入场景的布局约束特殊

因此更合理的方式是：

- 先做组件能力
- 先接入最明确的文本输入场景
- 再按页面逐步 rollout

---

## 4. Scope

### In Scope

- 调查并定义 `Input` 的 clearable contract
- 调查并定义 `CommandInput` 的 clearable contract
- 首批接入 `CommandPalette`
- 明确交互规则、可访问性规则、测试要求

### Out of Scope

- file input clear button
- hidden input clear button
- 一次性改动所有页面所有输入框
- 改写输入状态管理模式
- 对非文本类控件统一做“清空能力”

---

## 5. Investigation Summary

当前相关实现如下：

- 基础输入组件：
  - `apps/cloud-ui/src/components/ui/input.tsx`
- `cmdk` 输入包装：
  - `apps/cloud-ui/src/components/ui/command.tsx`
- 全局搜索使用点：
  - `apps/cloud-ui/src/components/GlobalSearch/CommandPalette.tsx`

调查结论：

- `Input` 目前是一个较薄的原生输入封装，适合作为 clearable 能力的基础入口
- `CommandInput` 当前已有左侧 search icon 包装，但没有右侧 action slot，也没有 clearable 能力
- `CommandPalette` 已经是受控输入，具备：
  - `value`
  - `onValueChange`
  - `ref`

因此它非常适合作为第一批 clearable 接入场景

---

## 6. UX Contract

### 6.1 Visibility Rule

清空按钮只在以下条件同时满足时显示：

- input 处于 focus 状态
- 当前 value 非空
- input 非 disabled
- input 非 readOnly

以下情况必须隐藏：

- value 为空
- blur 状态
- disabled
- readOnly

### 6.2 Interaction Rule

点击清空按钮时：

- 清空当前值
- 触发正常的受控更新
- 焦点保留在输入框
- 不关闭当前弹层或命令面板

### 6.3 Accessibility Rule

清空按钮必须：

- 是可聚焦或可操作的真实按钮元素
- 提供明确 `aria-label`
- 不影响现有 placeholder / label 语义

推荐文案：

- `Clear input`

### 6.4 Visual Rule

清空按钮应位于输入框右侧内部区域，与左侧图标和平衡间距一起考虑。

要求：

- 不遮挡文本
- 不遮挡光标
- 不破坏现有高度与圆角
- hover / focus-visible 状态明确

---

## 7. Engineering Contract

### 7.1 Component API

建议在共享组件层新增可选能力，而不是引入业务耦合命名。

推荐方向：

- `Input` 支持布尔型 `clearable`
- `CommandInput` 支持布尔型 `clearable`

必要时允许补充：

- `onClear`

但只有在“调用方确实需要区分 `clear` 与普通 `onChange`”时才加；默认应优先复用现有受控更新 contract，避免 API 膨胀。

### 7.2 Controlled First

第一阶段优先保证受控输入行为正确。

原因：

- `CommandPalette` 已是受控模式
- clearable 的值回写语义在受控模式下最清晰

如果后续要支持非受控输入，也应在组件层明确设计，而不是靠 DOM 直接改值。

### 7.3 No Page-Level Hacks

不允许：

- 只在 `CommandPalette` 页面内部加一个绝对定位按钮
- 复制一套“focus + value + clear”状态逻辑到业务组件
- 在不同输入框里各自决定按钮位置和交互

这次工作的价值就在于收敛成共享 contract。

---

## 8. Rollout Plan

### Phase 1

先建立共享能力：

- `Input`
- `CommandInput`

并补齐基础测试。

### Phase 2

首批接入：

- `CommandPalette`

原因：

- 使用频率高
- 已经是受控输入
- 用户感知最直接

### Phase 3

再评估是否接入其他普通文本输入场景。

判断标准：

- 是否真的是文本输入
- 是否已有共享组件承载
- 是否不会和特殊布局冲突

---

## 9. Testing Requirements

至少覆盖以下场景：

1. value 为空时不显示 clear 按钮
2. focus 且 value 非空时显示 clear 按钮
3. blur 后隐藏 clear 按钮
4. 点击 clear 后触发值清空
5. 点击 clear 后输入框仍保留 focus
6. disabled / readOnly 时不显示 clear 按钮
7. `CommandPalette` 中点击 clear 不关闭面板

如果实现方式涉及 pointer 事件或按钮显隐切换，还应覆盖：

8. clear 按钮不会阻塞正常输入和光标定位

---

## 10. Non-Goals And Guardrails

这份 instruction 明确不要求：

- 当场把所有输入框都改成 clearable
- 为 textarea 同步设计同一套能力
- 把“清空”扩展成复杂 trailing action system

如果后续要支持更通用的 trailing slot，应另开独立 instruction，不应在这次 clearable 基础能力里顺手扩 scope。

---

## 11. Recommended Execution Order

1. 审核 `Input` 与 `CommandInput` 的现有结构，确定右侧按钮落位方式
2. 先为共享组件建立 clearable contract 与测试
3. 只接入 `CommandPalette`
4. 人工验证键盘输入、清空、焦点保留、弹层不关闭
5. 再决定是否继续 rollout 到其他输入

---

## 12. Expected Outcome

完成后应得到：

- 一套共享、可复用的 clearable input contract
- 全局搜索框可以在 focus 且有值时一键清空
- 后续普通文本输入接入成本显著降低
- 不需要在业务页面反复复制交互逻辑
