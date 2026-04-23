# Readio Streaming ASR Architecture Proposal (Whisper Streaming)

*Note: This document archives a proposal for a streaming ASR architecture. It has been evaluated and intentionally deferred for the "Lite" (pure frontend/Serverless) version due to engineering complexity, client-side performance constraints, and API rate limiting risks. It serves as a blueprint for future "Pro" versions involving a dedicated backend or commercial SaaS ASR integration.*

---

## 结论

> Whisper 不需要等整个音频下载完成才开始转录。  
> 默认实现通常是“整段离线推理”，但完全可以改造成：
>
> 🎧 边播放 → 边缓冲 → 边转录 → 边生成字幕

对于 Readio 这种播客应用（接入 iTunes API + 本地上传音频），**流式 ASR 设计是完全可行且推荐的方案**。

---

## 一、为什么很多人误以为 Whisper 必须下载完整音频？

最常见的实现流程是：
`下载完整音频 -> ffmpeg 转 wav -> 整段丢给模型 -> 输出完整文本`

这是**最简单实现方式**， 不是模型的限制。 Whisper 本身支持“分段输入”。

---

## 二、Readio 推荐架构：播放与转录解耦

### 推荐数据流
`音频播放线程 -> 音频流 buffer（5~15秒） -> VAD 切段（Silero VAD） -> 分块送入 Whisper -> 逐段输出 JSON -> 前端实时显示字幕`

这样可以实现：
- 播放立即开始
- 字幕逐段生成
- 不必等待完整下载

---

## 三、实现方案

### 方案 1：固定窗口滑动切片（推荐）

- 每 20 秒作为一块
- 重叠 2 秒（防止断句）

流程：
`buffer 满 20 秒 -> 送入模型 -> 输出文本 -> 合并到总 transcript -> 继续下一块`

优点：
- 实现简单
- 兼容 Whisper
- 内存可控
- 适合 Edge / Server

### 方案 2：真实流式推理（复杂，不推荐首版）

Whisper 是 encoder-decoder 架构，不是原生 streaming 模型。
如果要做真正流式：
- 需要保存 encoder state
- 维护 KV cache
- 手动拼接时间戳

复杂度高，维护成本大。

---

## 四、用户体验效果

合理设计后：

| 阶段 | 用户体验 |
|------|----------|
| 0–3 秒 | 正常播放 |
| 5–15 秒 | 第一段字幕出现 |
| 后续 | 实时滚动字幕 |

体验类似：YouTube 自动字幕 / Apple Podcast 字幕。不会有“等待转录”的卡顿感。

---

## 五、VAD 的重要性

如果直接固定 20 秒切块：
- 可能截断句子
- 时间戳错位
- 重复文本

必须在切块前使用：**Silero VAD**，让分段落在自然停顿处。

---

## 六、流式架构的优势

### 内存优势
- 不需要加载完整 1 小时音频
- 只需保持 20~30 秒 buffer
- 降低端侧内存压力

### 可扩展性
- Server 端可并行处理
- 可对不同 chunk 使用不同模型
- 可支持 Premium 模式二次精修

---

## 七、关键技术点

### 1️⃣ 时间戳偏移
每块转录结果：`实际时间戳 = 模型输出时间 + 当前 chunk 起始时间`

### 2️⃣ 重叠去重
2 秒 overlap 需要：
- 对重叠文本进行对齐
- 删除重复片段

### 3️⃣ 标点修复（可选）
流式输出标点不完美时：
- 可用 LLM 后处理
- 或在整段完成后做一次“全文优化”

---

## 八、Readio 推荐模式
`播放立即开始 -> 后台流式转录逐段生成 -> 字幕同步进度条 -> 音频结束 -> 输出完整 Readio-Transcript-JSON`

---

## 九、总结

Whisper 不强制“下载完成再转录”。 那只是最简单实现方式。
对于 Readio：
- 必须采用流式分块策略
- 使用 VAD 优化切段
- 实现播放与转录解耦

这样可以保持播放流畅，保持 Edge 端可用，保持用户体验自然，不增加服务器成本。

> 关键原则：播放优先 / 转录后台渐进生成 / JSON 契约最终统一输出

---
---

# 架构师评估与 Lite 版暂缓说明 (Architectural Review & Lite Version Deferral)

**评估结论**：纯算法与后端工程理论上非常优秀。但**不适合当前的 Readio Lite（纯前端/无后端环境）**。

### 为什么在 Lite 版中强行落地极度危险？

1. **客户端 VAD 的性能与体积噩梦**
   要在浏览器里跑深度学习模型（如 Silero VAD），必须引入 WASM 依赖并加载模型权重，同时需要开辟 Web Worker 实时解码 PCM裸流进行推理。这将让一个轻量级 Web App 变得极度沉重，设备发热且不仅耗电。

2. **第三方 API 的“自杀式并发（DDoS）”**
   Lite 版目前的流控是一集播客 1 次 API 请求。如果按照“每15秒切块流式发送”，一小时的播客将瞬间向 Groq / OpenAI 发送 240 次独立的高频 HTTP 请求。绝大多数免费或基础层的第三方 API 会在几分钟内触发 `429 Too Many Requests` 限流，导致功能断崖式崩溃。

3. **DAI 广告时间轴漂移（致命伤）**
   流式方案主张“不等待下载，边下边播，同时后台发流给ASR”。在播客生态中，由于动态广告插入（DAI），“播放器拿到的音频串流”和“用代码后台获取的音频串流”大概率会被塞入**时常不同的广告**。如果不同步等待同一份物理文件落盘，即使有最完美的 VAD，转出来的字幕也会和播放的声音完全脱节。

4. **MSE（媒体源扩展）的前端深水区**
   用前端切片流实现平滑播放，需要手动用 MSE (Media Source Extensions) 给音频缓冲区喂数据，以绕过浏览器默认的流媒体拉取策略。这在 iOS Safari 等移动端兼容性极差，容易引发爆音与卡顿。

### 路线图建议 (Roadmap Guidance)
当前 Lite 版继续坚持 **Instruction 124 的阻塞式全量架构（等待下载与转译完成）** 以确保绝对的时间轴对齐与低客诉率。

本方案封存在此目录。当 Readio 演进出独立的 Node.js / Python 音视频处理微服务，或引入具备原生 WebSocket Streaming 接口的商业级 ASR SaaS (如 Deepgram) 时，即可解封此架构并实现极致体验。
