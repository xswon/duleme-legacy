# AI configuration

duleme treats AI as an optional enhancement. Reading RSS feeds does not require an AI account.

## Article summaries

Open **设置 → AI 设置 → AI 摘要** and configure:

- **服务商** — choose a common provider or a custom OpenAI-compatible endpoint.
- **API Key** — your provider key. It may be empty for loopback services such as local Ollama.
- **AI 摘要模型** — duleme tries to load the provider's model catalog and shows a short list of text models suitable for article and podcast summarization.

For common providers, the Base URL is filled automatically and kept under **高级设置**. If a provider does not expose a compatible `/models` endpoint, model discovery is non-blocking: open **高级设置** and enter the Base URL or model identifier manually.

The application sends model discovery and article summary requests through the local duleme server:

```text
GET  {Base URL}/models
POST {Base URL}/chat/completions
```

The browser does not call the provider's model catalog directly. This keeps the existing local API boundary and avoids making cross-origin model discovery a requirement.

Provider presets only fill common values. The stored configuration remains provider-neutral, so compatible gateways such as OneAPI/NewAPI and local vLLM can be entered with **自定义**.

## Local models

Example Ollama configuration:

```text
Base URL: http://127.0.0.1:11434/v1
API Key:  (empty)
Model:    your installed model name
```

## Environment defaults

Desktop/container deployments may provide:

```env
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
```

A saved user configuration takes precedence. When no local configuration is enabled, duleme can use the environment default.

## Security and backups

The Base URL and model are normal application settings. The API Key is stored in a separate IndexedDB `secrets` object store.

The API Key is deliberately excluded from the JSON business-data backup and is not returned in AI status/error responses.

## Transcription

Podcast transcription is separate from article-summary AI configuration. Configure it under **设置 → AI 设置 → 逐字稿**.

The current cloud transcription configuration and article-summary endpoint do not share credentials. Existing cloud, local NextEcho, or provider transcripts remain readable even when the service that originally generated them is no longer configured.
