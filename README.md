# 读了么（Duleme）

读了么是一个本地优先的 RSS 阅读器，支持 RSS/Podcast 订阅、阅读状态、收藏、笔记、音频播放，以及可选的 AI 摘要与转录能力。

## 当前状态

项目目前处于 Public Beta 准备阶段。主线以本地单用户使用为目标，不是公开互联网多用户服务。

## 运行方式

需要 Node.js 22。

```bash
npm ci
npm run dev
```

默认本地地址：

```text
http://127.0.0.1:4387
```

也可以使用仓库中的 Docker Compose 开发环境。

## Desktop

macOS Desktop 版本使用 Electron 打包，目标包括 Apple Silicon（arm64）和 Intel（x64）。

```bash
npm run desktop:dist
```

当前 Beta 构建尚未使用 Apple Developer ID 签名或 notarization，首次打开可能需要通过 macOS 的“系统设置 → 隐私与安全性 → 仍要打开”。

## 数据与隐私

- 阅读数据主要保存在本机 IndexedDB。
- AI 摘要为可选功能；启用后，相应文章/逐字稿内容会发送给用户配置的 AI 服务商。
- 云端转录为可选功能；启用后，音频地址和转录请求会发送给对应服务商。
- AI API Key 使用独立本地 secrets store 保存，不进入业务数据备份。
- 服务端 API 默认限制为本机访问，不应直接暴露到公网。

更多 AI 配置说明见 `docs/AI_CONFIGURATION.md`。

## 开发与验证

完整质量门禁：

```bash
npm run verify
```

包括 TypeScript、ESLint、测试覆盖率、构建、bundle budget 和架构边界检查。

贡献说明见 `CONTRIBUTING.md`。

## 安全问题

请参阅 `SECURITY.md`。不要在公开 Issue 中提交 API Key、访问令牌或未公开漏洞细节。

## License

目前尚未选择开源许可证。在加入明确的 LICENSE 文件之前，本仓库的公开可见性不代表授予复制、修改或再分发代码的许可。
