export interface KeyboardShortcut {
  id: string;
  /** 每个按键或组合键渲染成一个 kbd；同一动作有多个可选组合时用 joiner 连接。 */
  keys: string[];
  /** 多个替代组合之间的连接词，例如“或”。 */
  joiner?: string;
  label: string;
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { id: "navigate", keys: ["J", "K"], label: "切换文章" },
  { id: "navigate-detail", keys: ["←", "→"], label: "详情内切换上一篇 / 下一篇" },
  { id: "star", keys: ["S"], label: "收藏或取消收藏" },
  { id: "read", keys: ["M"], label: "标记已读或未读" },
  { id: "refresh", keys: ["R"], label: "刷新全部订阅源" },
  { id: "add-feed", keys: ["A"], label: "打开添加订阅" },
  { id: "search", keys: ["⌘K", "Ctrl+K"], joiner: "或", label: "搜索" },
  { id: "help", keys: ["?"], label: "打开快捷键列表" },
  { id: "close", keys: ["Esc"], label: "关闭设置、详情或退出沉浸阅读" },
];
