# Instruction 140: Lite 错误处理与日志标准化

# Task: 完善 Lite 版本错误处理、错误码与文档体系

## 问题背景

当前 Lite 版本的错误处理存在以下问题：

1. **前端生产日志缺失或不稳定**
   - `logger.ts` 中 `log()`、`info()`、`warn()` 在生产环境默认不输出
   - 只有 `error()` / `logError()` 会稳定输出
   - 一些 operator-relevant 的关键失败仍使用 `log()`，生产环境不可见

2. **前端错误语义不统一**
   - 某些模块有 `code` / typed error 概念
   - 某些模块只有字符串 message 或 console-style logging
   - `error_class`、`code`、message 在不同模块中的职责不清晰

3. **错误码文档缺失**
   - 没有 Lite 错误码索引页
   - operator / reviewer 无法快速定位 code、触发场景与排查建议

4. **日志脱敏 contract 不明确**
   - 如果直接扩大日志覆盖面，可能把 token / secret / query 参数 / transcript 内容打进 console

## 当前状态

### 前端（Lite）
- 一些关键模块已经有 typed error / `code` 概念
- `logError()` 在生产环境可见
- 但关键路径仍存在：
  - 使用不会在生产环境稳定输出的日志接口
  - 不同模块对错误码、错误日志和用户提示的边界不一致

### 后端
- Lite 本 instruction **不涉及 Cloud API backend error contract**
- 不要把本次任务扩展为 Cloud backend 错误码统一

## 目标

1. **统一 Lite 前端关键路径的错误日志 contract**
2. **统一 Lite 高价值前端 surface 的稳定 `code` 命名**
3. **明确 `error_class` 与 `code` 的职责边界**
4. **建立 Lite 错误码文档**
5. **在整个改动中坚持脱敏日志 contract**

## 核心 contract

### 1. 区分 `error_class` 与 `code`

必须明确：

- `error_class`
  - 用于 observability / grouping / analytics-friendly 聚合
  - 应保持低基数、稳定、适合分桶
  - 例如：`timeout`, `rate_limit`, `unauthorized`, `network`, `invalid_request`

- `code`
  - 用于前端逻辑判断、operator 排查文档、错误响应/对象稳定命名
  - 应为稳定、精确、可文档化的错误码
  - 例如：`ASR_PAYLOAD_TOO_LARGE`, `TRANSCRIPT_FETCH_TIMEOUT`, `DOWNLOAD_WRITE_FAILED`

这两者不得混用或互相替代。

### 2. Lite 错误对象 contract

first-pass standardization must require a stable error shape for the Lite surfaces touched by this task.

至少应稳定包含：

- `code`: machine-readable stable error code
- `message`: safe operator-readable message
- optional `error_class`: for grouping where current module already uses it
- optional `details`: only for safe, non-secret supplemental debugging fields

如果某些现有模块暂时无法统一到完整 shape，instruction 必须要求实现者明确记录差异与原因。

### 3. 日志脱敏 contract

扩大错误日志覆盖面时，必须遵守以下规则：

- 不记录 API keys、Bearer tokens、shared secrets、admin token
- 不记录完整 `Authorization` header
- 不记录完整 transcript 原文、音频二进制、multipart body
- 对带敏感 query 参数的 URL 做脱敏或截断
- 错误日志允许记录 route/module、code、error_class、status、provider、host、size bucket、elapsed_ms 等安全维度

### 4. 前端生产日志 contract

不要把“所有失败”都改成 `logError()`。

只对以下失败使用生产可见的错误日志：

- operator-relevant
- production-debuggable
- user-facing critical failure
- terminal failure（而不是预期重试中间态）

以下情况通常不应升级为 `logError()`：

- 用户主动取消
- retry 中间态
- 已知 fallback 将继续接管的瞬时失败
- 预期 EOF / aborted / transient state noise

## 执行范围（first pass only）

本次只要求标准化 Lite 高价值 frontend/runtime surface：

1. transcript / remote transcript changed zones
2. ASR client / provider interaction changed zones
3. download / file write / media fallback changed zones
4. fetch fallback / transport terminal failures
5. 其他当前 Lite 中已经存在 typed error 但日志 contract 不稳定的高价值路径

不要尝试一次性清洗整个 Lite 仓库的所有历史错误字符串。

## 命名规范（first pass）

建议前缀：

- `ASR_*`：ASR / transcription related
- `TRANSCRIPT_*`：transcript fetch / parsing related
- `DOWNLOAD_*`：download / file / persistence related
- `FETCH_*`：transport / fallback related
- `AUTH_*`：authentication / token / permission related（仅在当前 touched surfaces 确实需要时使用）

命名要求：

- 全大写 snake case
- 稳定、可文档化
- 避免把 HTTP 状态码直接塞进 code 名称
- 避免过于泛化的 `UNKNOWN_ERROR` 覆盖太多场景

## 步骤

### 1. 先做 contract audit

1.1 盘点当前高价值 Lite surfaces 的错误对象 shape
1.2 标出哪些地方已有 `error_class`，哪些地方已有或缺少 `code`
1.3 明确本次 first-pass 的统一目标，不扩大到全仓库

### 2. 前端生产日志修复

2.1 审计以下 changed zone（按实际代码为准，不要机械硬扩）：
- remote transcript
- ASR client
- download service
- fetch fallback / transport helpers

2.2 仅将 **operator-relevant terminal failures** 改为 `logError()`
2.3 不要把 retry 中间态、预期 fallback、用户取消升级成 error noise
2.4 所有新增前端错误日志必须遵守脱敏规则

### 3. Lite 错误码与错误对象收敛

3.1 为本次 first-pass 触达的 Lite surfaces 统一稳定 `code`
3.2 保持 `error_class` 继续服务于 grouping，而不是替代 `code`
3.3 对关键 typed error / client error mapping 做最小必要收敛
3.4 如果不能一次性统一到完整 error shape，必须在 docs 中记录剩余差异

### 4. 错误码文档

4.1 创建：
- `apps/docs/content/docs/apps/lite/error-codes.mdx`

4.2 若 Lite docs 当前要求双语，则同步创建：
- `apps/docs/content/docs/apps/lite/error-codes.zh.mdx`

4.3 每个文档条目至少包含：
- `code`
- 适用 module / route / feature
- 触发场景
- 排查建议
- 是否会出现在前端日志中（如适用）

## Non-goals

本次不做：

- 全站 UI 错误文案重设计
- Sentry / remote log ingestion 接入
- 整个 Lite 仓库所有历史错误字符串的一次性迁移
- Cloud backend error code contract 改造
- 为了统一而重写现有 observability 或 logger 架构

## 验证

必须有 focused tests / verification，而不只是人工看 console：

### Frontend
- 关键路径在 production-mode logger contract 下仍会调用 `logError()` 的测试
- 确认非 terminal / retry / cancel 不会被错误升级为 `logError()`
- 关键 typed error / client error mapping 测试

### Docs
- `error-codes.mdx`（以及如适用的 `error-codes.zh.mdx`）内容完整
- 文档与当前实际 code 命名一致

## Documentation

- Update `apps/docs/content/docs/general/technical-roadmap.mdx` **only after Reviewer sign-off**
- Create `apps/docs/content/docs/apps/lite/error-codes.mdx`
- Create `apps/docs/content/docs/apps/lite/error-codes.zh.mdx` if Lite docs remain bilingual for this surface

## Completion
- **Completed by**:
- **Commands**:
- **Date**: 2026-04-04
- **Reviewed by**:
