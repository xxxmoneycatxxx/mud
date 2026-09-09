# Web 客户端脚本功能 TODO

> 最后更新：2026-09-09
> 状态标记：✅ 已完成 · 🔲 待实现

## 已完成功能

| # | 功能 | 说明 |
|---|------|------|
| 1 | 沙箱引擎 | `ScriptEngine` 类，Function 构造器 + 闭包注入 API，脚本无法访问 window/document |
| 2 | 10 个脚本 API | `onMessage` / `sendCommand` / `getVitals` / `getCurrentRoom` / `registerTimer` / `sleep` / `log` / `isConnected` / `getStore` / `onGMCP` |
| 3 | 脚本 CRUD | 新增 / 编辑 / 删除 / 启用 / 禁用，内置规则不可修改 |
| 4 | localStorage 持久化 | 与触发器/别名同架构，内置规则仅存 enabled，用户规则存完整定义 |
| 5 | JSON 导入/导出 | 单脚本导出 + 全套配置一键导出/导入 |
| 6 | 可视化构建器 | 无代码填表生成脚本（消息触发 / 定时条件两种模式） |
| 7 | API 文档面板 | 设置面板内可折叠 API 参考 + 常见模式 |
| 8 | 独立编辑模态框 | 75vw × 80vh，左代码(65%) + 右 API 文档(35%)，独立于设置面板 |
| 9 | 脚本分组 | `group` 字段 + 列表徽章 + 编辑器 datalist 自动补全已有分组 |
| 10 | 行号显示 | 代码编辑器左侧行号列，滚动同步 |
| 11 | Tab 缩进 | Tab 键插入 4 空格 |
| 12 | 语法预检 | 保存前 `new Function()` 检查语法错误 |
| 13 | Enter 自动缩进 | 回车后复制上一行缩进，行尾 `{` 多加一级 |
| 14 | 括号自动闭合 | `(` `[` `{` `'` `"` 自动插入配对，已有闭括号时跳过 |
| 15 | getStore() API | 共享变量持久化存储，localStorage 跨会话保持 |
| 16 | onGMCP() API | 订阅 GMCP 模块推送事件，精确匹配模块名 |
| 17 | 分组折叠列表 | `<details>` 按 group 聚合，内置脚本不参与分组 |
| 18 | store 可观测性 | 「查看存储」按钮列出所有 key-value，支持清空 |
| 19 | 运行时状态摘要 | 列表中显示触发器/定时器/GMCP 数量 + 最近错误记录到 console.error |

## 待实现

### P1 — 编辑器增强

改动集中在 `_showScriptEditorModal` 的 `codeInput` 事件绑定，纯 vanilla JS，无外部依赖。

#### ✅ Enter 自动缩进

已完成。回车后复制上一行缩进，行尾为 `{` 时多加一级。

---

#### ✅ 括号自动闭合

已完成。输入 `(` `[` `{` `'` `"` 时自动插入配对符号，光标右侧已有相同闭括号时跳过而非重复插入。

---

### P2 — 脚本能力补全

#### ✅ getStore() — 共享变量持久化

已完成。所有脚本共享一个 store，`localStorage` key 为 `mud_script_store`。

---

#### ✅ onGMCP() — GMCP 事件订阅

已完成。精确匹配 GMCP 模块名，`processGMCPData` 中调用 `feedGMCP` 分发。

---

#### ✅ 分组折叠列表

已完成。`<details>` 按 group 聚合，内置脚本不参与分组。

---

#### ✅ store 可观测性

已完成。「查看存储」按钮列出所有 key-value，支持清空。

---

#### ✅ 运行时状态摘要

已完成。列表中显示触发器/定时器/GMCP 数量，`_reportError` 改为 `console.error` 并记录 lastError。

---

### P3 — 调试与进阶

全部已否决，详见「已否决项」表。

---

## 已否决项（记录原因，避免重复讨论）

| 原提案 | 否决原因 |
|--------|---------|
| API 函数前缀补全 | 本质是手写迷你 CodeMirror 补全插件（~200 行），而 API 仅 8 个且文档面板已常驻显示。若后续确实需要，直接引入 CodeMirror 5 一步到位 |
| onGMCP 通配符匹配 | 当前仅 6 个 GMCP 模块，全部精确名称，通配符无实际场景。等模块增长后再加 |
| 错误行号定位 | `e.stack` 解析在不同浏览器/Function 构造器下不可靠，且 DevTools 已提供完整堆栈+可点击行号。改为 console.error 输出完整 stack 即可 |
| 文本操作 API (gagLine/replaceText) | 需要重构消息渲染链路让引擎访问 DOM，架构代价过大。现有高亮系统已覆盖大部分场景 |
| 脚本模板库 | API 文档的「常见模式」区已有完整示例，用户复制即可。单独做模板选择 UI 无本质提升，扩充文档示例更实际 |
| inspect() 调试输出 | 终端窄屏不适合 pretty-print，用户可用 `console.log()` + F12 DevTools 查看对象详情，体验更好 |
| 错误堆栈增强 | 已完成大半：`console.error()` 已输出完整信息 + `lastError` 记录到运行时状态，剩余提示文字意义不大 |
| 脚本间通信（事件总线） | 自写自用 3-10 个脚本场景下，需要联动的逻辑写进同一个脚本更简单直接，无实际需求 |

## 技术约束

- **零依赖**：不使用 TypeScript、构建工具、npm 包
- **唯一可选库**：CodeMirror 5（~150KB），仅在 P1 编辑器增强的 vanilla 方案不够用时考虑
- **沙箱方案**：维持 Function 构造器 + 受限作用域，不切换 iframe sandbox
- **存储**：localStorage，与现有触发器/别名/定时器/高亮一致
