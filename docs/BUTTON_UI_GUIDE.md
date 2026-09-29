# Button UI 规范

本项目的按钮统一由 `src/styles/button-system.css` 提供基础交互规范和通用 action primitive。现有导航、播放器、分段筛选等专用控件可以保留自己的视觉，但必须继承统一的 focus、disabled 和交互状态。

## 设计原则

- 相同语义使用相同视觉：主操作、次操作、幽灵操作、危险操作、文本操作分别固定一套样式。
- 普通 action 按钮只使用 3 档高度：30 / 36 / 40px。
- 普通圆角只使用 6 / 8 / 10px；圆形 icon control 使用 999px。
- 主色、危险色、hover、focus、disabled 统一由 CSS token 管理，不在组件中重复写颜色值。
- 所有按钮必须有可见的键盘 focus 状态。
- disabled 状态保持可读，但降低视觉权重，并统一使用 `not-allowed`。
- 只有播放器、导航、segmented control、card toggle 这类有独立交互模型的控件使用专用样式。

## 通用 action primitive

| 场景 | Class |
| --- | --- |
| 默认基础 | `wreader-btn` |
| 主操作 | `wreader-btn wreader-btn-primary` |
| 次操作 | `wreader-btn wreader-btn-secondary` |
| 轻量操作 | `wreader-btn wreader-btn-ghost` |
| 危险操作 | `wreader-btn wreader-btn-danger` |
| 中性文本操作 | `wreader-btn-link` |
| 强调文本操作 | `wreader-btn-link wreader-btn-link-accent` |
| 小尺寸 | `wreader-btn-sm` |
| 大尺寸 | `wreader-btn-lg` |
| 通栏 | `wreader-btn-block` |
| 方形图标按钮 | `wreader-btn-icon` |
| 圆形图标按钮 | `wreader-btn-icon wreader-btn-icon-round` |

示例：

```tsx
<button type="submit" className="wreader-btn wreader-btn-primary">
  保存
</button>

<button type="button" className="wreader-btn wreader-btn-secondary">
  取消
</button>

<button type="button" className="wreader-btn wreader-btn-danger">
  删除
</button>

<button type="button" className="wreader-btn-icon" aria-label="关闭">
  <X />
</button>
```

## 尺寸

- `sm`: 30px，高密度行内操作。
- 默认：36px，设置、表单、弹窗等常规操作。
- `lg`: 40px，欢迎页、主要 CTA。
- icon action 默认 32 × 32px。
- 移动端普通 action 会自动提高到 44px；`sm` 提高到 40px；icon action 提高到 40 × 40px。

## 颜色和状态

颜色统一读取 `--wreader-btn-*` token：

- Primary: `#3175c6`
- Primary hover: `#286aa9`
- Secondary: `#edf1f5`
- Danger: `#b55353`
- Focus: `#4b86cc`
- Disabled opacity: `.52`

不要在新的普通 action 按钮中重复写 `bg-blue-600 hover:bg-blue-700`、`rounded-lg px-* py-*` 等组合；需要新的语义时优先扩展 `button-system.css`。

## 专用按钮

以下控件可以保留独立样式，因为它们不是普通 action button：

- 左侧导航和移动端 tab。
- 时间线筛选 segmented control。
- 阅读器阅读设置和主题 swatch。
- 音频播放器 transport control。
- 搜索结果、订阅源、精选订阅等整行/card toggle。
- 数据管理 action card。

这些控件仍需遵守统一的 focus、disabled、transition 规则。

## 维护要求

新增按钮时优先判断它属于哪一种既有语义。只有在交互模型确实不同的情况下才新增专用 selector。修改通用按钮尺寸、颜色或状态时，应只调整 `button-system.css` 中的 token 或 primitive，避免在多个组件中同步修改。
