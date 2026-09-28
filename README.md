# 读了么 Releases

这里是 **读了么（Duleme）Desktop** 的公开下载仓库。

本仓库只用于发布桌面安装包、校验文件和简短的版本说明，不包含应用源码。

## 下载

前往 [Releases](../../releases) 获取最新 macOS 公测版。

- Apple Silicon（M1 / M2 / M3 / M4 等）：下载 `arm64` DMG
- Intel Mac：下载 `x64` DMG
- `SHA256SUMS.txt` 可用于校验下载文件

## macOS 首次打开

当前公测版暂未使用 Apple Developer ID 签名和 notarization。

如果第一次打开时 macOS 阻止启动：

1. 先尝试打开一次“读了么”；
2. 打开 **系统设置 → 隐私与安全性**；
3. 找到“读了么”被阻止的提示；
4. 点击 **仍要打开**；
5. 再确认 **打开**。

不需要执行 Terminal 命令。

## 数据

读了么采用 local-first 方式，订阅、阅读状态、收藏、笔记和播放进度默认保存在本机。

---
Desktop V0.1 · macOS public beta
