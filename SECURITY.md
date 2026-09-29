# Security Policy

## Supported versions

安全修复优先覆盖 `main` 和最新 Public Beta。

## Reporting a vulnerability

请不要在公开 Issue、Discussion 或 Pull Request 中披露尚未修复的漏洞细节、API Key、访问令牌或其他凭证。

优先使用仓库 **Security** 页面中的 **Report a vulnerability** / Private Vulnerability Reporting（如果该入口已启用）。

如果该入口暂不可用，请只创建一个不包含漏洞细节的 Issue，请求维护者提供私密联系渠道。

报告中建议包含：

- 受影响版本或 commit；
- 最小复现步骤；
- 影响范围；
- 是否需要特殊配置或用户交互；
- 建议修复方向（如有）。

## Security boundaries

Duleme 的默认部署是本地单用户应用。服务端 API 默认限制为 loopback/local access。不要把本地 Express 服务直接暴露到公网；公开互联网部署需要独立的认证、授权、用户隔离、限流和服务端数据安全设计。

第三方 AI 与转录服务仅在用户主动配置和触发相应能力时使用。不要把真实凭证提交到仓库；本地环境变量文件已由 `.gitignore` 排除。
