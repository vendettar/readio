---
description: Cloud 后端可观测性方案：内网 VPS 自建 Grafana + Loki，通过 Tailscale 组网采集公网 VPS 的结构化日志
---

# Archived 002: Cloud Observability — Grafana + Loki + Tailscale

## 1. 背景

Cloud 后端（`apps/cloud-api`）当前可观测性依赖：

- Go `slog` 结构化日志输出到 stdout
- systemd journal 收集（`journalctl -u readio-cloud`）
- 无集中式日志查询、无可视化、无告警

结构化日志已覆盖 discovery、ASR relay、rate-limit 等关键路径，字段包括：`route`、`upstream_kind`、`upstream_host`、`elapsed_ms`、`error_class`、`upstream_status`、`timed_out`。但这些数据只能通过命令行查看，无法追溯和聚合分析。

## 2. 方案概述

| 组件 | 部署位置 | 作用 |
|---|---|---|
| **Promtail** | 公网 VPS（与 `readio-cloud` 同机） | 从 systemd journal 采集 stdout 日志 |
| **Loki** | 内网 VPS（Docker） | 日志存储和索引 |
| **Grafana** | 内网 VPS（Docker） | 日志查询 UI |
| **Tailscale** | 两台 VPS | 内网通信隧道 |

架构：

```
[公网 VPS]                         [内网 VPS]
readio-cloud ──stdout──► systemd journal
                              │
                         promtail
                              │
                         Tailscale (100.x.y.z → 100.a.b.c:3100)
                              │
                            loki ◄──grafana (:3000)
                                       │
                                  你访问 Grafana UI
                                 (Tailscale IP 直连)
```

## 3. 为什么选这个方案

| 对比项 | Grafana Cloud | 自建 (本方案) |
|---|---|---|
| 数据隐私 | 在 Grafana 服务器上 | 完全在你的网络内 |
| 免费额度 | 50GB/月 | 无限 |
| 维护成本 | 0 | Docker 更新（低频） |
| 告警 | 内置 | 同样内置 |
| 访问方式 | grafana.com 登录 | Tailscale IP 直连 |
| 网络要求 | 公网出口 | 仅 Tailscale 组网 |

选择自建的理由：
- 已有内网 VPS 和 Tailscale 组网
- 单 VPS 日志量远小于 50GB/月，自建无成本压力
- 数据不出网

## 4. 部署步骤

### 4.1 内网 VPS — Docker Compose

```yaml
# docker-compose.yml
services:
  loki:
    image: grafana/loki:3.4.2
    ports:
      - "3100:3100"
    volumes:
      - loki-data:/loki
    command: -config.file=/etc/loki/local-config.yaml
    restart: unless-stopped

  grafana:
    image: grafana/grafana:11.6.0
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=<CHANGE_ME>
    volumes:
      - grafana-data:/var/lib/grafana
    depends_on:
      - loki
    restart: unless-stopped

volumes:
  loki-data:
  grafana-data:
```

```bash
docker compose up -d
```

### 4.2 两台 VPS — 安装 Tailscale

```bash
# 两台都执行
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
```

假设组网后：
- 公网 VPS Tailscale IP: `100.x.y.z`
- 内网 VPS Tailscale IP: `100.a.b.c`

### 4.3 公网 VPS — 安装 Promtail

```bash
curl -sL https://github.com/grafana/loki/releases/download/v3.4.2/promtail-linux-amd64.zip -o /tmp/promtail.zip
cd /tmp && unzip promtail.zip && mv promtail-linux-amd64 /usr/local/bin/promtail
chmod +x /usr/local/bin/promtail
```

### 4.4 公网 VPS — Promtail 配置

```yaml
# /etc/promtail/config.yml
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://100.a.b.c:3100/loki/api/v1/push

scrape_configs:
  - job_name: readio-cloud
    journal:
      max_age: 12h
      labels:
        job: readio-cloud
        instance: vps-readio
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        regex: 'readio-cloud.service'
        action: keep
```

### 4.5 公网 VPS — Promtail Systemd Service

```ini
# /etc/systemd/system/promtail.service
[Unit]
Description=Promtail
After=network.target

[Service]
ExecStart=/usr/local/bin/promtail -config.file=/etc/promtail/config.yml
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now promtail
```

### 4.6 Grafana — 配置 Loki 数据源

1. 访问 `http://100.a.b.c:3000`（通过 Tailscale）
2. 登录（admin / `<CHANGE_ME>`）
3. Connections → Data sources → Add Loki
4. URL: `http://localhost:3100`（Docker 内部网络）
5. Save & Test

## 5. 常用 LogQL 查询

```logql
# 所有错误
{job="readio-cloud"} |= "error"

# discovery 请求且有上游错误
{job="readio-cloud"} |= "discovery request" | json | error_class != "none"

# 超过 5 秒的慢请求
{job="readio-cloud"} |= "discovery request" | json | elapsed_ms > 5000

# ASR relay 请求
{job="readio-cloud"} |= "asr-relay"

# 限速禁用告警
{job="readio-cloud"} |= "rate limiting disabled"

# SSRF 拒绝
{job="readio-cloud"} |= "ssrf" | json
```

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| Loki 磁盘爆满 | 最常见问题 | 必须配置 `retention_period`（建议 14-30 天） |
| 内网 VPS 挂掉 | Grafana + Loki 不可用 | `restart: unless-stopped`，确保内网 VPS 有自启动 |
| Tailscale 断连 | Promtail 推送失败 | Promtail 有本地 positions 文件，重连后追补；极端情况有间隙 |
| Loki 单节点无副本 | 数据无冗余 | 接受（单 VPS 场景，日志丢失不致命） |

## 7. 资源需求

| 组件 | RAM | 磁盘 |
|---|---|---|
| Loki | ~200MB | 取决于日志量和保留期 |
| Grafana | ~150MB | 几 MB |
| Promtail | ~50MB | — |
| **总计** | ~400MB | 建议 10GB+ 可用 |

内网 VPS 需要 2GB+ RAM。

## 8. 不需要做的事

- 不需要 Prometheus / Mimir（当前只有日志需求）
- 不需要 Grafana Agent（Promtail 更轻量）
- 不需要告警（现阶段先看明白日志）
- 不需要修改 `apps/cloud-api` 代码（Promtail 读 systemd journal）

## 9. 执行后验证

1. `systemctl status promtail` — 确认 Promtail 运行
2. `curl -s http://100.a.b.c:3100/ready` — Loki 就绪
3. Grafana Explore 页面能查到 `{job="readio-cloud"}` 日志
4. 触发一次 ASR 请求，确认日志中出现 `upstream_kind: "asr-relay"` 条目
