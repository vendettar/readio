# Instruction: Monorepo CI/CD 最佳实践重构 [COMPLETED]

# Task: 重构 Readio monorepo 的 CI/CD 分层、职责与质量门

## Objective

将当前以单产品增量补丁为主的流水线，重构为适合 monorepo 的分层 CI/CD：

1. PR 阶段就能验证所有生产关键产物
2. CD 不再首次发现 build/type/package 错误
3. build、release、deploy 的职责边界清晰
4. 根脚本、语言专项检查、部署 smoke 三者职责分离

## Decision Log

- **Required / Waived**: Required

## Bilingual Sync

- **Required / Not applicable**: Not applicable

## 问题背景

当前仓库的 CI/CD 存在以下结构性问题：

1. **deploy target build 没有完全前移到 PR gate**
   - `apps/cloud-ui` 之前只在 Cloud CD 中 build，导致 deploy workflow 首次发现构建失败。

2. **Cloud CD 仍然承担 build + deploy 双职责**
   - 当前 `cd-cloud.yml` 同时做：
     - `pnpm install`
     - `apps/cloud-ui build`
     - Linux Go binary build
     - artifact staging
     - SSH publish
     - service restart
     - smoke test
   - 这会混淆 build failure、artifact failure、deploy failure 的边界。

3. **monorepo required gate 还没有被正式定义**
   - `apps/lite`、`apps/cloud-ui`、`apps/cloud-api`、`packages/core` 都是生产关键产物，但 CI 还不是按这一组明确建模。

4. **根脚本与专项检查的职责还不够明确**
   - 根 `pnpm lint/build/test/typecheck` 是有价值的统一入口
   - 但不能替代：
     - `golangci-lint`
     - `go test ./...`
     - deploy smoke
     - product-specific guards

## 当前状态

### Existing workflows

- `/Users/Leo_Qiu/Documents/dev/readio/.github/workflows/ci.yml`
  - 当前主要是 Lite checks + Cloud API Go lint
  - 已补入 `apps/cloud-ui` typecheck/build
  - 但还不是正式的 monorepo PR gate contract

- `/Users/Leo_Qiu/Documents/dev/readio/.github/workflows/cd-cloud.yml`
  - 当前仍是 build + deploy 混合型 workflow

- `/Users/Leo_Qiu/Documents/dev/readio/.github/workflows/cd-pages.yml`
  - 当前独立负责 Lite / Pages deploy

### Existing root scripts

- `/Users/Leo_Qiu/Documents/dev/readio/package.json`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm test`

这些根脚本可以作为统一入口，但当前并不自动等于：

- Go lint
- Go test
- deploy-target full gate

## 目标状态

完成重构后，CI/CD 必须具备以下结构：

### 1. PR CI（required fast gate）

职责：
- 所有生产关键产物的 lint / typecheck / build / 核心测试前移到 PR
- 只做 quality gate，不做 deploy
- 允许失败归因为代码质量或构建正确性问题

### 2. Release Build（artifact build）

职责：
- 构建 deployable artifacts
- 组装并上传 release artifact
- 不接触远程生产环境

### 3. Deploy（narrow deploy）

职责：
- 消费已经验证过的 artifact
- 发布到目标环境
- 重启服务并 smoke
- 不重新构建

### 4. Optional Heavy Verification

职责：
- E2E
- docs build
- Lighthouse
- bundle audit
- other heavy/nightly validation

这些可以是：
- optional on PR
- required on main
- nightly
- label-triggered

## Workflow 目标命名与职责

目标上建议将 workflow 收敛为以下职责模型：

### A. `pr-ci.yml`

职责：
- PR 必需的快速质量门

输入：
- 当前 commit / PR 内容

输出：
- required checks result only

禁止：
- SSH
- deploy
- remote publish
- deploy secrets

推荐触发：
- `pull_request`
- optional: `merge_group`（如果仓库使用 merge queue）

### B. `release-cloud-build.yml`

职责：
- 构建 Cloud deploy artifact

输入：
- 已通过 PR CI 的代码

输出：
- artifact containing:
  - `readio-cloud`
  - `dist/`

禁止：
- remote restart
- deploy

推荐触发：
- `push` on `main`
- optional manual `workflow_dispatch`

### C. `deploy-cloud.yml`

职责：
- 从 artifact 执行 Cloud deploy

输入：
- validated release artifact

输出：
- remote release published
- service restarted
- smoke result

禁止：
- `pnpm install`
- `pnpm -C apps/cloud-ui build`
- `go build`

推荐触发：
- consume artifact from `release-cloud-build.yml`
- optional manual `workflow_dispatch` for controlled redeploy / rollback
- 不得直接把 deploy 重新绑回普通 PR 事件

### D. `deploy-pages.yml`

职责：
- Lite / Pages build + deploy only

不得混入 Cloud deploy concerns。

## 核心 contract

### 1. 所有生产关键产物必须出现在 PR CI required gate 中

当前仓库至少应明确以下 required targets：

- `apps/lite`
- `apps/cloud-ui`
- `apps/cloud-api`
- `packages/core`

对 `apps/docs` 必须做显式决策：

- 要么纳入 required gate
- 要么明确标注为 optional/heavy verification，并说明原因

不得继续让其处于“没人知道它是否 required”的灰区。

### 2. CD 不得成为首次 build correctness 验证点

CD 允许重复做 smoke-level 验证，但不得首次发现：

- TypeScript compile errors
- Vite build failures
- missing frontend dist
- Go compile failures
- package contract drift

### 3. 根脚本只负责 JS/TS orchestration，不替代 Go checks

允许并推荐使用根脚本：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`

但必须保留显式专项：

- `apps/cloud-api` `golangci-lint`
- `apps/cloud-api` `go test ./...`
- deploy smoke
- repo-specific guards

不得用根 `pnpm test` 假装覆盖 Go tests。

### 4. Artifact 是 deploy 的输入，不是 deploy 内部的临时副产物

Cloud deploy contract 必须明确：

- build workflow 产出 artifact
- deploy workflow 消费 artifact
- deploy workflow 不重新 build

artifact 必须至少包含：

- `readio-cloud`
- `dist/`
- commit SHA
- build timestamp
- workflow run id / artifact origin identifier

建议同时包含：

- manifest file
- checksum / digest

deploy reviewer 必须能证明：

- 被部署的 artifact 就是 release build workflow 产出的那一份
- 不是 deploy workflow 临时重新拼装的新产物

### 5. Build / Release / Deploy 必须可独立失败与重试

必须能够区分：

- build failure
- artifact assembly failure
- transfer/publish failure
- remote restart failure
- smoke failure

否则 reviewer 应判定本次重构未真正完成职责解耦。

### 6. Install / lockfile contract

CI 必须使用 lockfile-consistent install。

要求：

- JS/TS workflow 使用 lockfile 严格安装
- Go module resolution 以仓库声明为准，不得在 deploy 内重新做依赖漂移式解析
- cache 仅用于加速，不得成为 correctness 前提

deploy workflow 不得重新做 dependency resolution。

### 7. Secret / permissions boundary

workflow 必须按职责最小化 secrets / permissions：

- `pr-ci.yml`
  - 不得持有 SSH deploy secrets
  - 不得持有 production publish secrets
- `release-cloud-build.yml`
  - 默认不持有 deploy/restart secrets
  - 若确有 upload/release 所需 token，范围必须最小化
- `deploy-cloud.yml`
  - 才允许持有 publish / restart / smoke 所需 secrets

不得把 production deploy capability 暴露给纯质量门 workflow。

### 8. Smoke contract

deploy smoke 必须明确最小检查面，不能只做“首页 200”。

至少应覆盖：

- backend health / process reachable
- Cloud frontend static asset serving
- `/env.js` 可访问且 shape 正常
- 一个后端 route（如 discovery 或 admin-disabled 404 contract）可访问

必须明确：

- smoke failure 是否阻断 deploy success 判定
- smoke 日志是否足以区分 publish success 与 runtime failure

### 9. Rollback contract

rollback 必须基于已构建 artifact，而不是临时重新 build 旧 commit。

要求：

- deploy 使用可识别的 artifact / release id
- rollback 指向上一份已知成功 artifact
- rollback 路径必须与正常 deploy 路径共享同一 publish contract

## Required gate matrix

first-pass 建议 required matrix 如下：

### JavaScript / TypeScript

- `apps/lite`
  - lint
  - typecheck
  - build
  - key unit/integration tests

- `apps/cloud-ui`
  - lint
  - typecheck
  - build
  - key unit/integration tests

- `packages/core`
  - lint
  - typecheck
  - build

### Go

- `apps/cloud-api`
  - `golangci-lint`
  - `go test ./...`
  - optional build smoke

### Docs

必须做显式选择：

- Option A: required build in PR CI
- Option B: non-required heavy verification

不得省略决策。

## 根脚本与专项检查边界

### 推荐目标

根 `package.json` 负责统一入口：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`

但 workflow 层仍需保留专项步骤：

- Go lint
- Go test
- deploy smoke
- Pages deploy

### 审查标准

如果实现者把 workflow 全部粗暴替换成：

- `pnpm lint`
- `pnpm build`
- `pnpm test`

但遗漏了：

- `go test ./...`
- `golangci-lint`
- release artifact build
- deploy smoke

则该实现不合格。

## 分阶段实施计划

### Phase 1: 收口 PR CI

目标：
- 定义并落实 required gate

必须完成：

1. `apps/cloud-ui` required checks 前移到 PR CI
2. `apps/cloud-api` `go test ./...` 纳入 required gate
3. `packages/core` 的 CI 位置被明确
4. `apps/docs` 的 required / optional 状态被明确

### Phase 2: 拆出 release build workflow

目标：
- 将 artifact build 与 deploy 解耦

必须完成：

1. 新增 Cloud release build workflow
2. 构建并上传 artifact
3. artifact contract 被文档化

### Phase 3: 收窄 Cloud deploy

目标：
- deploy workflow 只做 deploy

必须完成：

1. deploy workflow 下载 artifact
2. deploy workflow 不再 build
3. 远程发布、restart、smoke 逻辑保留

### Phase 4: 再决定是否收敛为 root-level required gate

可选，但应在前三阶段稳定后进行。

如要实施，应明确：

1. 哪些 workspace 被根 `pnpm build` 视为 required
2. `docs` 是否会引入不可接受的 PR gate 膨胀
3. 是否需要 path filters / split jobs / matrix

## 迁移与回滚策略

workflow 重构必须允许小步切换，不允许一次性删光旧流程再赌新流程正确。

推荐策略：

1. 先新增 release build workflow
2. 保留旧 `cd-cloud.yml` 作为过渡
3. 验证新 artifact contract 稳定后，再把旧 Cloud CD 收窄或替换

若新流程不稳定，必须可回滚到：

- 旧 deploy workflow
- 旧 artifact publish path

不得把 deploy 可用性绑定到一次性大迁移上。

## 风险

### 1. Required gate 膨胀

风险：
- PR CI 时间暴涨
- unrelated changes 被无关 app 阻塞

控制方法：
- first-pass 先覆盖生产关键产物
- heavy checks 留到 optional/nightly

### 2. Artifact/deploy 解耦不彻底

风险：
- 新建 release workflow，但 deploy 仍重新 build

控制方法：
- reviewer 必须检查 deploy workflow 中是否还存在 `pnpm install`、`go build`、frontend build

### 4. Artifact identity 漂移

风险：
- deploy 下载到的 artifact 与被验证的 commit/artifact 不一致

控制方法：
- artifact 内含 SHA / manifest / origin metadata
- deploy 日志打印 artifact identity

### 5. Secret boundary 退化

风险：
- PR CI 误持有 deploy secrets

控制方法：
- reviewer 必须检查 workflow permissions / secrets 使用范围

### 3. 根脚本误用

风险：
- 用根 `pnpm test` 替代 Go tests

控制方法：
- instruction 明确要求 Go checks 继续显式保留

## Non-goals

本次不要求：

1. 一次性重写所有 workflows
2. 一次性把所有 optional checks 变 required
3. 第一阶段就做 path filters / matrix / nightly
4. 修改业务代码以适配 workflow 改动

## Review Focus

Reviewer 必须重点检查：

1. deploy target 是否已前移到 PR CI
2. Cloud CD 是否仍在首次 build `apps/cloud-ui` 或 `readio-cloud`
3. artifact 与 deploy 是否真正解耦
4. Go lint / Go test 是否仍被显式保留
5. `apps/docs` 的 required / optional 状态是否被明确
6. 是否避免了不必要的 required gate 膨胀
7. artifact identity 是否可追溯
8. secrets / permissions 是否按职责收口
9. smoke contract 是否足以区分 publish 与 runtime failure

## Verification

至少应包含：

1. workflow 结构审查
2. 明确审查以下 YAML changed zone：
   - `.github/workflows/ci.yml`
   - `.github/workflows/release-cloud-build.yml`（若新增）
   - `.github/workflows/deploy-cloud.yml` / 旧 `cd-cloud.yml` 收窄结果
   - `.github/workflows/cd-pages.yml`（若受影响）
3. 确认 PR CI 会在 deploy 之前发现：
   - `apps/cloud-ui` build failure
   - Go test failure
4. 确认 deploy workflow 可在不重新 build 的情况下完成 remote publish
5. 确认 release artifact 确实包含：
   - `readio-cloud`
   - `dist/`
   - SHA / manifest / origin metadata
6. 确认 deploy workflow 中不再存在：
   - frontend build
   - `go build`
   - dependency install / dependency resolution
7. 确认失败归因可区分：
   - build
   - artifact
   - deploy
   - smoke
8. 确认 rollback 是基于既有 artifact，而不是 rebuild old commit

---
## Documentation

- 如果最终改动落地到 Cloud deploy contract，更新：
  - `/Users/Leo_Qiu/Documents/dev/readio/apps/docs/content/docs/apps/cloud/deployment.mdx`
  - `/Users/Leo_Qiu/Documents/dev/readio/apps/docs/content/docs/apps/cloud/deployment.zh.mdx`

- 如果根级 CI policy 明显变化，更新：
  - `/Users/Leo_Qiu/Documents/dev/readio/apps/docs/content/docs/general/decision-log.mdx`
  - `/Users/Leo_Qiu/Documents/dev/readio/apps/docs/content/docs/general/decision-log.zh.mdx`

## Completion

- **Completed by**: Readio Worker
- **Commands**: YAML syntax review, workflow structure verification
- **Date**: 2026-04-07
- **Reviewed by**: Reviewer (QA) — All 9 Review Focus items verified.

When finished: append `[COMPLETED]` to the H1 and fill Completion fields. Do not mark completed until:

1. required PR gate has been explicitly defined and implemented
2. Cloud release build and deploy responsibilities are separated
3. reviewer confirms CD is no longer the first place that can discover deploy-target build failures
