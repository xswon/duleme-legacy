# 读了么 v21 原型

本目录是 v20 视觉基线之后的布局与视觉系统候选版本。它只用于设计评审，不修改生产业务逻辑。

## 入口

直接打开 `index.html`。可用 query 参数切换关键状态：

- `?view=timeline`：桌面时间线 + Reader
- `?view=collapsed`：52px 收起侧栏 + 360px 列表
- `?view=podcast`：Podcast Listening Workspace
- `?view=search`：Search / Tool 页面
- `?view=settings`：Settings 两栏布局
- `?view=mobile-reader`：在窄屏直接进入 Reader

建议验收宽度：390、760、761、899、900、1039、1040、1280、1440、1600。

## v21 设计约束

- Desktop：228px Sidebar + 342px Master + flexible Workspace。
- Sidebar collapsed：52px + 360px + flexible Workspace。
- 900–1039px：330px Master + Workspace，Sidebar 改 Drawer。
- 761–899px：List / Detail 单页切换。
- <=760px：Bottom Navigation，List -> Detail。
- Reader 默认最大宽度 650px，正文 16px / 1.72–1.75，标题 27px（Mobile 24px）。
- Desktop icon hit area 32px，Mobile 44px。
- 以 1px divider 和 surface 层级组织页面，不使用卡片化 Dashboard 布局。
- 单一 Lucide-style 线性图标语言，由 `prototype.js` 内置 SVG path 输出，无外部依赖。

## 说明

仓库当前 `main` 不再包含文档里提到的 `docs/prototypes/netnewswire-ui/` v20 静态原型，因此 v21 作为独立目录恢复原型评审入口；生产版中的 `src/styles/prototype-*.css` 仍可用于对照 v20 已实现视觉。

v21 在确认后再作为生产实现基线；未确认前不要直接把本目录样式复制进生产代码。
