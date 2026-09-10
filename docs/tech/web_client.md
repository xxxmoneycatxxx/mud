# Web 客户端技术文档

本项目内置了一个功能完善的 Web MUD 客户端，通过浏览器访问 `http://localhost:8888` 即可直接游戏。客户端采用纯原生 JavaScript 实现（零构建工具、零 npm 依赖），基于 WebSocket + Telnet 子协议，完整支持 GMCP 通信。

## 目录结构

```
www/
├── index.html              # 主页面（状态栏/终端/小地图/设置面板/帮助浏览器）
├── css/
│   └── style.css           # 全局样式（暗色主题、浮动面板、动画）
└── js/
    ├── telnet.js           # Telnet 常量定义（IAC/GMCP/MSP 等）
    ├── ansi.js             # ANSI 颜色码映射表
    ├── mapper.js           # 地图组件（房间图构建 + Canvas 渲染）
    ├── pathfinder.js       # 自动寻路（BFS + 全量地图 + 自动行走）
    ├── script-engine.js    # 用户脚本沙箱引擎
    ├── client.js           # 客户端核心类（连接/心跳/五大子系统）
    ├── client-ui.js        # UI 交互层（终端渲染/事件/ANSI 解析）
    └── help.js             # 帮助浏览器（分类导航 + GMCP 检索）
```

脚本按依赖顺序加载：常量 → 地图 → 寻路 → 脚本引擎 → 核心类 → UI 层 → 帮助。

## 连接架构

### WebSocket + Telnet 子协议

```
浏览器 ──WebSocket──▶ FluffOS 驱动（端口 8888）
         │
         └─ 子协议: ['telnet']
            （驱动据此发送二进制 telnet 流，含 GMCP 子协商）
```

- **流式 UTF-8 解码**：使用持久化 `TextDecoder` + `{ stream: true }`，跨 WebSocket 帧重组被拆分的多字节中文字符，避免乱码
- **Telnet 状态跨帧续接**：`this._tn` 保存 IAC/SB 解析状态，IAC 命令和 SB..SE 子协商可跨帧续接，避免半截包丢数据或泄露成乱码
- **心跳检测**：每 30 秒发送空消息检测连接，失败则强制清理
- **自动重连**：断开后最多 3 次递增延迟重连（2s/4s/6s）

### Telnet 协商

连接建立后 500ms 执行协商，声明支持：

| 选项 | 用途 |
|------|------|
| GMCP (201) | 通用 MUD 通信协议，JSON 数据交换 |
| NAWS (31) | 窗口大小通知 |
| TERMINAL_TYPE (24) | 终端类型标识 |
| SUPPRESS_GO_AHEAD (3) | 抑制 Go Ahead |
| MSP (90) | MUD 声音协议 |

### 登录门控

「连接成功」不等于「进入游戏」。登录、注册、创建角色阶段，游戏专属 UI 与自动命令一律收起：

| 机制 | 实现 |
|------|------|
| 界面隐藏 | `body` 上的 `.logged-in` 类；CSS 以 `body:not(.logged-in)` + `display:none !important` 隐藏状态栏、小地图、地图全屏层、快捷命令、帮助按钮 |
| 面板放行 | `_markLoggedIn()`（`client-ui.js`）检测到进入游戏后加类，并给状态栏/快捷命令加 `.visible` |
| 登录信号 | 任一命中即可：① 进房自动 look 的房间描述 ② GMCP `Char.Vitals` ③ GMCP `Room.Info`（登录流程末尾服务端必推）④ `hp` 文本解析成功 |
| 自动命令 | `_canAutoSend()` = 已连接 且 已进入游戏；定时器回调、触发器匹配、脚本 `sendCommand`/`sendCommands` 统一走这一道闸 |
| 手输命令 | 不受门控影响，登录界面照常输入账号密码 |
| 断连复位 | `_resetLoginGate()` 在 `onclose`/`forceCleanup` 移除类并关闭依赖服务端数据的模态框（帮助、角色面板、任务详情）；设置面板是纯本地配置，不关 |

帮助入口（按钮 + F1）在未登录时一并屏蔽：查阅主题需向终端发送 `help <主题>`，在登录界面执行会把命令灌进账号提示。

门控不会被误触发：`gmcp()` apply 只存在于 `clone/user/user.c`（继承 `F_USER_GMCP`），登录对象没有该 apply，连接阶段客户端发出的 `Client.GUI`/`Char.Vitals.Get` 在登录前得不到响应。

## GMCP 数据流

### 初始化

连接后发送 `Client.GUI` 声明客户端身份，然后请求 `Char.Vitals.Get` 和 `Room.Info.Get`。

### 服务端推送

| GMCP 模块 | 触发时机 | 数据内容 |
|-----------|---------|----------|
| `Char.Vitals` | 属性变化时 | hp/max_hp, mp/max_mp, sp/max_sp 等 |
| `Room.Info` | 进入新房间时 | name, exits[], exit_targets{}, area, hash |
| `Client.Map` | 初始化时 | 地图数据 URL |
| `Help.Topics` | 帮助系统初始化 | 主题白名单 + 分类树 |
| `Help.Search` | 搜索请求返回 | 匹配主题列表 |

### exit_targets 设计

`Room.Info` 中的 `exit_targets` 字段是精确房间关系的核心：

```json
{
  "name": "青石小路",
  "exits": ["east", "west"],
  "exit_targets": { "east": "a1b2c3...", "west": "d4e5f6..." },
  "area": "扬州城",
  "hash": "f7g8h9..."
}
```

客户端直接使用 `exit_targets` 构建房间连接图，无需依赖方向命令猜测。未探索的邻居通过 `ensureRoom()` 创建骨架房间。

## 实时状态栏

浮动面板显示在终端上方，通过 GMCP `Char.Vitals` 实时更新：

- **进度条**：气血(红)/精(蓝)/精力(绿)/内力(紫)/食物(橙)/水(青)
- **数值显示**：经验/潜能等
- **房间信息**：当前房间名 + 出口方向
- 可收起/展开，连接后自动显示，断开后隐藏

## 交互式小地图

### 渲染机制

以当前房间为中心，BFS 布局为可达房间分配网格坐标，Canvas 绘制：

- **当前房间**：亮绿实心方块 + 外发光
- **已探索房间**：空心描边 + 房间名标签
- **未探索邻居**：小圆点（骨架房间）
- **连线**：按方向着色（基本方向绿色，对角线青色，上下棕色）
- **特殊房间标记**：商店(黄)、银行(金)、客栈(蓝)、门派(紫)、副本(橙)

### 持久化与可靠性

- **localStorage 持久化**：压缩格式存储（n/a/e/c 短键），刷新后立即恢复
- **断连不清图**：旧地图保留，重连后新数据自然覆盖
- **防抖保存**：2 秒去抖，快速移动时不频繁写 localStorage
- **visibilitychange 重绘**：标签页切换回来时自动重绘
- **GMCP 防御**：`updateRoom()` 和 `processGMCPData` 添加 try/catch

### 多楼层支持

- up/down 移动自动切换 z 坐标
- 楼层指示器 + 切换按钮（发现多层时显示）
- 仅渲染当前楼层的房间

### 全屏模式

点击地图可进入全屏浏览，更大 cellSize(60) 和 viewRadius，右下角显示图例。

### 九宫格移动面板

8 方向格子 + 扩展栏（上/下/进/出/入/离），根据当前房间出口自动激活/禁用。已探索的目标房间显示房间名，特殊房间类型显示颜色标记。

## 自动寻路系统

### 地图数据加载

优先加载服务端导出的全量地图（`/storage/map.json`），24 小时 localStorage 缓存。不可用时自动回退到 mapper 增量探索数据。

### BFS 寻路

从起点出发，沿房间连接图广度优先搜索，返回最短方向命令数组。

### 自动行走

- 沿计算路径自动发送移动命令（每步 600ms 间隔）
- **智能暂停**：遇敌/叫船时自动暂停，事件结束后自动恢复
- **路径高亮**：在小地图上以黄色虚线显示寻路路径
- **房间搜索**：按名称模糊搜索，支持完全匹配/前缀匹配/包含匹配排序

## 五大自动化子系统

所有子系统均支持 localStorage 持久化 + 独立导入/导出 + 全套一键备份。

### 触发器

消息匹配正则时自动执行命令，支持冷却时间防刷。

```javascript
// 内置示例
{ name: '仙丹自动拾取', pattern: /"啪"的一声一颗仙丹掉到你面前。/, command: 'get dan' }
```

架构：内置规则（`builtin: true`）保存 enabled 状态，用户规则保存完整定义。

### 别名

输入缩写自动替换为完整命令，支持精确匹配和正则捕获两种模式。

```javascript
// 内置示例
{ name: '寻路', pattern: '^go (.+)$', command: 'gtr $1' }
{ name: '施法', pattern: '^c (.+)$', command: 'cast $1' }
```

多命令宏：以分号分隔时逐条发送（如 `wield sword;ready shield;cast armor`）。

### 定时器

按固定间隔自动发送命令，连接时启动，断开时停止。

```javascript
// 内置示例
{ name: '状态刷新', interval: 30, command: 'hp' }
```

### 高亮

关键词匹配渲染指定颜色的 `<span>`，在 ANSI 解析后的 HTML 中替换。

### 脚本

用户自定义 JavaScript 脚本，由沙箱引擎执行。

#### 沙箱引擎

使用 `new Function()` 构造器创建受限闭包，脚本内无法直接访问 `window`/`document`，仅通过注入的 7 个 API 与客户端交互：

| API | 说明 |
|-----|------|
| `onMessage(pattern, callback)` | 注册消息匹配回调（pattern 为 RegExp） |
| `sendCommand(cmd)` | 发送命令到服务端 |
| `getVitals()` | 获取当前角色状态（返回副本） |
| `getCurrentRoom()` | 获取当前房间信息（返回副本） |
| `registerTimer(ms, callback)` | 注册定时执行（至少 100ms） |
| `log(msg)` | 日志输出到终端 |
| `isConnected()` | 检查是否已连接 |

#### 内置脚本示例

- **自动打坐**：检测到「你盘膝坐下」时执行 `meditation`
- **自动疗伤**：每 5 秒检查气血，低于 50% 自动 `exert recover`
- **自动逃跑**：每 2 秒检查气血，低于 20% 自动 `flee`

异常隔离：脚本回调异常不影响其他脚本，定时器异常自动捕获。

## 设置面板

标签页结构，管理五大子系统：

```
【 设置 】
┌──────────────────────────────────────┐
│ [触发器] [别名] [定时器] [高亮] [脚本] │
├──────────────────────────────────────┤
│  列表区：iOS 风格开关 + 编辑/删除按钮  │
│  表单区：增删改操作                    │
│  导入/导出：每个子系统独立              │
├──────────────────────────────────────┤
│ Esc 关闭        [全套导出] [全套导入]  │
└──────────────────────────────────────┘
```

### 全套配置备份

一键打包所有子系统配置为 JSON 文件：

```json
{
  "version": 1,
  "triggers": [...],
  "aliases": [...],
  "scripts": [...],
  "timers": [...],
  "highlights": [...]
}
```

导出：通过 Blob + URL 下载（文件名含日期 `mud-config-YYYY-MM-DD.json`）。
导入：confirm 确认后解析覆盖，脚本/定时器自动 stop/restart。

## 帮助浏览器

复古 ASCII 风格模态框，支持分类导航 + 模态框内阅读 + 本地全文检索：

- **数据源**：优先加载 `/storage/help.json`（服务端 `help_export_d.c` 导出，fetch + localStorage 24h 缓存）；不可用时回退到 GMCP `Help.Topics` + 内置快照
- **阅读器**：点击主题在模态框内直接渲染 HTML 内容（`$XXX$` 颜色标记已在服务端转为 `<span style="...">`），不再向终端发 `help xxx`；支持历史栈多级返回
- **全文检索**：help.json 可用时本地遍历 `search_text` 字段即时检索（大小写不敏感，主题名匹配优先排序）；不可用时发送 `Help.Search.Get` GMCP 请求，3 秒无响应回退到本地名称过滤
- **交叉引用**：文档正文中的 `help <主题>` 自动渲染为可点击链接（白名单校验），点击在阅读器内跳转
- **键盘操作**：F1 开关、Esc 阅读器内返回/关闭、/ 聚焦搜索、↑↓ 选择、Enter 查看
- **登录门控**：未进入游戏时隐藏按钮并屏蔽 F1，避免把 `help` 命令灌进登录提示（见上文「登录门控」）
- **安全**：主题名/描述插入 HTML 前经 `escHtml()` 转义，防御 XSS

服务端组件：
- `adm/daemons/help_export_d.c`：启动 30 秒自动导出 `/help/` 全部文件到 `/www/storage/help.json`；`$XXX$` → HTML（`color_filter` + `help_ansi_to_html`），同时生成去色纯文本 `search_text` 供搜索；管理员可执行 `exporthelp` 手动刷新
- `adm/daemons/helpd.c`：GMCP 搜索回退路径，首次检索构建内存索引（去色 + 小写），后续直接查缓存；`reset_help_index()` 重建索引

## ANSI 渲染

完整的 ANSI 转义码支持，映射表在 `www/js/ansi.js`：

| 类别 | 码范围 | 说明 |
|------|--------|------|
| 前景色 | 30-37 | 标准 8 色 |
| 背景色 | 40-47 | 标准 8 色 |
| 高亮前景 | 1;30-1;37 | 亮色 8 色 |
| 高亮背景 | 1;40-1;47 | 亮色 8 色 |
| 样式 | 1/3/4/5/7/8/9 | 粗体/斜体/下划线/闪烁/反色/隐藏/删除线 |
| 重置 | 0/21/23/24/27 | 恢复对应样式 |
| 空码 | `\x1b[m` | 等同于 `\x1b[0m`，触发完全重置 |

## 服务端配合

Web 客户端的功能依赖服务端以下配合：

| 文件 | 职责 |
|------|------|
| `feature/user_gmcp.c` | GMCP 数据推送（Char.Vitals/Room.Info/Help.Topics 等） |
| `feature/user_mxp.c` | MXP 协议支持 |
| `adm/daemons/helpd.c` | 帮助主题管理和全文检索 |
| `adm/daemons/map_export_d.c` | 导出全量地图 JSON 供寻路使用 |

### Client.GUI 钩子

Web 客户端每次 GMCP 初始化必定发送 `Client.GUI` 消息，服务端据此延迟 1 秒重推 `Room.Info`，确保刷新后玩家环境已恢复再推送数据。
