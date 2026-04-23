---
description: 审查 cloud-api 当前暴露模型，并给出“同源前端 + 本机/内网 API + 反向代理统一暴露”的推荐硬化方案
---

# Archived 003: Cloud API Network Exposure And Same-Origin Hardening

## 1. 结论

当前 `apps/cloud-api` 已经是“同进程提供前端静态资源 + `/api/*`”的同源应用模型，但还不是“仅通过反向代理对外暴露、后端只监听本机/内网、所有浏览器入口尽量避免宽 CORS”的硬化状态。

所以：

- 不能简单改成“只允许 localhost 调用”，否则真实浏览器用户会直接失效
- 也不能把“只允许 cloud-ui 前端调用”理解成浏览器层面可被真正强校验的安全边界
- 最佳实践应是：
  - **部署层**：`cloud-api` 仅绑定 loopback / private network
  - **暴露层**：只通过反向代理统一暴露公网入口
  - **浏览器层**：默认同源，不开放不必要的跨域访问
  - **应用层**：保留 rate limit，不把 Origin 校验当成 discovery 的主要安全边界

## 2. 审查结果

### 2.1 已有的正确方向

`cloud-api` 当前直接挂载了 Cloud UI 静态资源和 `/api/*`：

- `apps/cloud-api/main.go`
  - `runCloudServer()` 解析 `cloud-ui` dist 目录
  - `newCloudMux()` 同时注册：
    - `/api/v1/discovery/*`
    - `/api/v1/asr/*`
    - `/api/proxy`
    - `/`

这说明当前架构方向已经是：

- `cloud-ui` 走同源后端
- `cloud-api` 是浏览器前端和内部 API 的统一入口

这条路线本身是对的，应继续保持。

### 2.2 当前还不够硬的地方

#### A. `cloud-api` 默认对外监听 `:PORT`

`apps/cloud-api/main.go`:

```go
addr := ":" + port
server := &http.Server{ Addr: addr, ... }
```

这意味着当前服务默认监听所有网卡，而不是只监听 `127.0.0.1` 或内网地址。

结果：

- 如果部署时直接把该端口暴露到公网，那么任何人都可以绕过前置反向代理直接访问 `cloud-api`
- 这会削弱“统一入口”和“同源部署”的价值

#### B. 仓库里的 `nginx.conf` 不是当前 Cloud 统一入口契约

仓库根目录有 `nginx.conf`，但它只是静态站点配置：

- 只服务 `/`
- `try_files ... /index.html`
- 没有任何 `/api/* -> cloud-api` 反向代理规则

这意味着当前仓库里**没有一份明确的 Cloud 生产反向代理契约**来表达：

- 外部只访问 `https://<host>/`
- `/api/*` 由反向代理转发到本机 `cloud-api`
- `cloud-api` 不直接裸露公网端口

#### C. Proxy 路径仍然显式开放 `Access-Control-Allow-Origin: *`

`apps/cloud-api/main.go`:

- proxy 成功响应设置 `Access-Control-Allow-Origin: *`
- proxy 错误响应也设置 `Access-Control-Allow-Origin: *`

这说明 `/api/proxy` 目前仍按跨域代理模型设计，而不是纯粹同源私有后端接口。

这不一定立刻错误，但它意味着：

- 即使主应用是同源，proxy 这条路由仍可被外部网页跨域利用
- 不能把“前后端同机部署”误认为已经天然阻断了浏览器滥用

#### D. Discovery 没有 Origin 校验，但这本身不是主要问题

当前 discovery 路由没有像 ASR relay 那样做 Origin 校验。

这不是第一优先级 bug，原因是：

- discovery 是匿名浏览器可访问接口
- `Origin` / `Referer` 很容易被绕开或缺失
- 真正该承担边界的是：
  - 同源部署
  - 端口不直接暴露
  - rate limit

所以这里不要走偏成“给 discovery 加 Origin 校验就安全了”。

### 2.3 ASR relay 已经比 discovery 更接近正确硬化

`apps/cloud-api/asr_relay.go` 已经有：

- allowlist / same-origin origin 校验
- same-origin fallback

这说明项目里已经有“浏览器来源约束”这套思路，但它只适合更敏感的 relay 路径，不能替代整个 cloud-api 的部署级边界。

## 3. 推荐方案

### 3.1 目标架构

推荐的 Cloud 部署拓扑：

```text
Browser
  |
  v
Reverse Proxy (nginx / caddy)
  |- "/"       -> cloud-ui static entry
  |- "/api/*"  -> cloud-api (127.0.0.1 or private address)
  |
  v
cloud-api
  |- discovery
  |- asr relay
  |- proxy
```

关键要求：

- **对外只暴露反向代理**
- **`cloud-api` 只监听 `127.0.0.1` 或私网地址**
- **浏览器只通过同一域名访问**

### 3.2 必须做的事

#### 1. 把 `cloud-api` 绑定收紧

不要默认监听所有网卡的 `:PORT`。

应改成支持显式 host 绑定，例如：

- `READIO_CLOUD_BIND_ADDR=127.0.0.1:8080`
- 或 `READIO_CLOUD_HOST=127.0.0.1` + `PORT=8080`

默认推荐：

- 开发环境：可保留 `:PORT` 或 `127.0.0.1:PORT`
- 生产环境：明确绑定 `127.0.0.1:PORT` 或私网 IP

#### 2. 增加 Cloud 生产反向代理契约文档或配置模板

仓库应新增一份明确的 Cloud 反向代理模板，至少表达：

- `/` 指向 Cloud UI
- `/api/` 转发到本机 `cloud-api`
- 传递 `Host`
- 传递 `X-Forwarded-Proto`
- 传递 `X-Forwarded-For`

这样才能让“同源前端 + 内部 API”成为可执行的部署契约，而不是口头假设。

#### 3. 保留 discovery rate limit

即使完成同源 + 反向代理 + 本机绑定，也**不能**删除 discovery 的应用层限流。

原因：

- 只要匿名用户能正常打开网站，就仍然能匿名打 discovery
- 反向代理只减少直连暴露面，不解决业务层滥用

#### 4. 不要把 Origin 校验当 discovery 主防线

对于 discovery：

- 不建议把“仅允许 cloud-ui 前端”寄托在 `Origin` 判断上
- 可以把它作为观测或补充约束
- 但主防线仍应是部署层和 rate limit

### 3.3 可以考虑做但不是第一优先级的事

#### A. 收紧 `/api/proxy`

当前 `/api/proxy` 仍然返回 `Access-Control-Allow-Origin: *`。

如果 Cloud 已明确进入同源模型，后续应评估：

- 是否仍需要让外部任意网页跨域调用这个 proxy
- 是否可以改为：
  - 同源专用
  - 或最少只允许受控 Origin

这是一个值得做的后续硬化项。

#### B. 对敏感路由继续用 same-origin / allowlist

像 ASR relay 这种更敏感、更接近成本型资源消耗的接口，继续保留：

- explicit allowlist
- same-origin fallback

这是合理的。

## 4. 不推荐的方案

### 4.1 不推荐：只允许 localhost

原因：

- 浏览器用户不是从服务器本机发请求
- 这会直接让正常 Web 访问失效

### 4.2 不推荐：只靠 `Origin` 判断“是不是 cloud-ui”

原因：

- 这不是强安全边界
- 对匿名 discovery 接口意义有限
- 很容易形成“看起来很安全，实际上没解决核心问题”的假象

### 4.3 不推荐：把 discovery 当成内网专用接口

原因：

- discovery 本质上就是给浏览器前端直接消费的公开 Web API
- 它应是“公网可访问但受控”的接口，而不是“只给服务器自己调用”的接口

## 5. 推荐执行顺序

1. 为 `cloud-api` 增加显式 bind address 配置
2. 新增 Cloud 生产反向代理模板或 handoff 文档
3. 生产环境将 `cloud-api` 改为 loopback / private bind
4. 保留现有 discovery rate limit
5. 后续专题审查 `/api/proxy` 是否还应保留 `Access-Control-Allow-Origin: *`

## 6. 本次审查结论的简短版本

当前不是“只让 localhost 调就安全”，而是应该：

- **让 `cloud-api` 不直接裸露公网端口**
- **只通过同源反向代理统一暴露**
- **保留业务层限流**
- **不要把 Origin 校验当 discovery 的主要安全边界**

这才是当前 Readio Cloud 最合理的硬化方向。
