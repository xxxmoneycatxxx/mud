# 炎黄群侠传MUD

炎黄MUD UTF-8 版，基于 [FluffOS](https://github.com/fluffos/fluffos) 驱动。底层为炎黄2003，LIB 代码有大量借鉴国内优秀的 LIB，开源在此方便对 MUD 游戏感兴趣的玩家。

- 游戏驱动下载：https://bbs.mud.ren/threads/4
- **线上游戏体验：https://mud.ren:8888/**（浏览器直接打开，无需安装任何客户端）

---

## Web 客户端

本项目内置了一个功能完善的 **Web MUD 客户端**，通过浏览器访问 `http://localhost:8888` 即可直接游戏。客户端采用纯原生 JavaScript 实现（零构建工具、零 npm 依赖），基于 WebSocket + Telnet 子协议，完整支持 GMCP 通信。

### 核心架构

| 模块 | 文件 | 职责 |
|------|------|------|
| Telnet 协议层 | `www/js/telnet.js` | Telnet 常量定义（IAC/GMCP/MSP 等），实际解析由 client.js + client-ui.js 完成 |
| ANSI 渲染 | `www/js/ansi.js` | 完整 ANSI 转义码映射（前景/背景/高亮/斜体/下划线/闪烁） |
| 客户端核心 | `www/js/client.js` | 连接管理、心跳检测、触发器/别名/定时器/高亮/脚本五大子系统 |
| UI 交互层 | `www/js/client-ui.js` | 终端渲染、状态栏、快捷命令、设置面板、事件绑定 |
| 地图组件 | `www/js/mapper.js` | 房间图构建、Canvas 小地图渲染、楼层切换、localStorage 持久化 |
| 自动寻路 | `www/js/pathfinder.js` | BFS 寻路算法、全量地图加载、自动行走与暂停恢复 |
| 脚本引擎 | `www/js/script-engine.js` | 受限作用域沙箱，提供 7 个安全 API 供用户脚本调用 |
| 帮助浏览器 | `www/js/help.js` | 分类导航 + 模态框内阅读器 + 本地全文检索 + 交叉引用链接 |

### 功能特性

#### 实时状态栏
- 通过 GMCP `Char.Vitals` 实时显示气血/精/精力/内力/食物/水进度条
- 经验值和数值信息展示，房间信息显示
- 可收起/展开，连接后自动显示

#### 交互式小地图
- **Canvas 实时渲染**：以当前房间为中心，BFS 布局展示已探索房间拓扑
- **服务端精确数据**：利用 GMCP `Room.Info` 中的 `exit_targets` 直接构建房间连接，无需猜测
- **localStorage 持久化**：刷新后地图立即恢复，断连不清图（重连后自然更新）
- **多楼层支持**：up/down 自动切换楼层，楼层指示器和切换按钮
- **特殊房间标记**：商店(黄)、银行(金)、客栈(蓝)、门派(紫)、副本(橙) 等颜色标记
- **全屏模式**：点击地图可进入全屏浏览，更大视口 + 图例
- **九宫格移动面板**：8 方向 + 扩展栏（上/下/进/出/入/离），根据出口自动激活/禁用
- **探索进度**：底部显示已探索房间数 / 全量地图百分比

#### 自动寻路系统
- 优先加载服务端导出的全量地图数据（`/storage/map.json`），24 小时 localStorage 缓存
- 全量地图不可用时自动回退到 mapper 增量探索数据
- BFS 最短路径搜索 + 房间名称模糊搜索
- **自动行走**：沿计算路径自动移动，遇敌自动暂停、事件结束后自动恢复
- 寻路路径在小地图上以黄色虚线高亮显示

#### 五大自动化子系统
所有子系统均支持 localStorage 持久化 + 独立导入/导出 + 全套一键备份：

| 子系统 | 功能 | 内置示例 |
|--------|------|----------|
| **触发器** | 消息匹配正则时自动执行命令，支持冷却时间 | 仙丹自动拾取 |
| **别名** | 输入缩写自动替换为完整命令，支持正则和多命令宏 | `go <地名>` → `gtr`、`c` → `cast` |
| **定时器** | 按固定间隔自动发送命令（仅进入游戏后生效） | 每 30 秒 `hp` 刷新状态 |
| **高亮** | 关键词匹配渲染指定颜色 | — |
| **脚本** | 用户自定义 JavaScript 脚本，沙箱引擎提供 7 个安全 API | 自动打坐、自动疗伤、自动逃跑 |

**脚本引擎 API**：`onMessage` / `sendCommand` / `getVitals` / `getCurrentRoom` / `registerTimer` / `log` / `isConnected`

#### 设置面板
- 标签页结构：触发器 / 别名 / 定时器 / 高亮 / 脚本
- iOS 风格开关切换，增删改查操作
- 每个子系统独立导入/导出
- **全套导出/导入**：一键打包所有配置为 JSON 文件备份

#### 帮助浏览器
- 复古 ASCII 风格模态框，分类导航 + 模态框内阅读器
- **静态数据加载**：服务端 `help_export_d.c` 导出 `/storage/help.json`，前端 fetch + localStorage 24h 缓存
- **本地全文检索**：help.json 可用时即时检索 `search_text` 字段（大小写不敏感，主题名匹配优先排序）
- **阅读器模式**：点击主题在模态框内直接渲染 HTML 内容（`$XXX$` 颜色标记已转为 `<span>`），支持历史栈多级返回
- **回退兼容**：help.json 不可用时自动回退到 GMCP 全文检索 + 本地名称过滤
- **交叉引用链接**：文档正文中的 `help <主题>` 自动渲染为可点击链接
- 服务端 `Help.Topics` 动态下发，实时更新分类树和主题白名单
- 键盘操作：F1 开关、Esc 关闭、/ 聚焦搜索、↑↓ 选择、Enter 查看

#### 其他特性
- **登录门控**：未进入游戏（登录/注册/创建角色）时，状态栏、小地图、快捷命令、帮助入口均不渲染，定时器/触发器/脚本也不会发自动命令（手输账号密码不受影响）
- **完整 ANSI 渲染**：前景色(30-37)、背景色(40-47)、高亮色(1;30-1;37)、高亮背景(1;40-1;47)、斜体/下划线/暗淡/闪烁/删除线/反色
- **命令历史持久化**：localStorage 保存，↑↓ 翻阅，刷新后恢复
- **快捷命令栏**：look/资料/物品/技能/任务/玩家 + ⚙ 设置按钮，点击即发送命令
- **Telnet 协议完整支持**：GMCP、MSP、NAWS、Terminal Type、Suppress Go Ahead
- **心跳检测与自动重连**：30 秒心跳，断开后最多 3 次递增延迟重连
- **流式 UTF-8 解码**：持久化 TextDecoder 跨 WebSocket 帧重组多字节字符，避免中文乱码
- **Telnet 状态跨帧续接**：IAC 命令和 SB..SE 子协商可跨帧续接，避免半截包丢数据

---

## LIB 说明

本游戏为侠客行类文字 MUD 游戏。

## 启动说明

游戏集成了 [mudcore](https://github.com/mudcore/mudcore) 框架，请使用以下指令下载源码：

```bash
# 从 GitHub 安装（国外推荐）
git clone --recurse-submodules https://github.com/oiuv/mud.git
# 从 Gitee 安装（国内推荐）
git clone --recurse-submodules https://gitee.com/mudren/mud.git
```

如果你已经直接 clone 了项目，请使用以下指令更新子模块：

```bash
git submodule update --init
```

> 提示：国内用户 [mudcore](https://github.com/mudcore/mudcore) 子模块可使用 Gitee 镜像地址
> - https://gitee.com/mudcore/mudcore.git

### 环境要求

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) 或 [Docker Engine](https://docs.docker.com/engine/install/) (Linux)
- 首次启动会自动构建镜像，需要几分钟

### 一键部署

**Windows (PowerShell):**

```powershell
.\docker-deploy.ps1              # 启动服务
.\docker-deploy.ps1 -DebugMode   # 调试模式
.\docker-deploy.ps1 -Rebuild     # 重建镜像
.\docker-deploy.ps1 -Stop        # 停止服务
```

**Linux / Mac:**

```bash
./docker-deploy.sh               # 启动服务
./docker-deploy.sh -d            # 调试模式
./docker-deploy.sh --rebuild     # 重建镜像
./docker-deploy.sh --stop        # 停止服务
```

### 端口说明

| 端口 | 协议 | 说明 |
|------|------|------|
| 5566 | Telnet | GBK 编码 |
| 6666 | Telnet | UTF-8 编码 |
| **8888** | **WebSocket** | **Web 客户端（浏览器直接访问）** |

> 推荐使用浏览器打开 `http://localhost:8888` 体验 Web 客户端，也可使用 [Mudlet](https://github.com/Mudlet/Mudlet) 等传统客户端通过 Telnet 端口连接。推荐使用 UTF-8 编码进行游戏。

## 数据迁移

项目提供了数据导出脚本，将 `data/` 下的运行时数据（玩家、NPC、商店、门派等 `.o` 持久化文件）打包为带时间戳的 ZIP，方便服务器迁移。

**导出：**

```powershell
# Windows
.\tools\data-export.ps1
```

```bash
# Linux / Mac
./tools/data-export.sh
```

脚本会自动排除 `.env`（环境配置）和 `.gitignore`，输出到 `backup/mud-data-YYYYMMDD-HHmmss.zip`。

**迁移到新服务器：**

```bash
# 1. 克隆代码
git clone --recurse-submodules <repo-url>
cd mud

# 2. 解压数据
unzip backup/mud-data-*.zip -d .

# 3. 生成新环境配置
cp data/.env.example data/.env
# 按需修改 data/.env 中的 DB_HOST 等

# 4. 启动服务
./docker-deploy.sh
```

> 游戏内置的 `backupd` 守护进程会在每日凌晨 6:00 自动备份整个 `data/` 目录到 `backup/YYYY-M-D/`，也可作为迁移数据源。管理员可使用 `restore` 命令从备份中恢复单个玩家数据。

---

注册 ID 为 `mudren` 的帐号为游戏管理员 (admin)。

求助答疑请访问：https://bbs.mud.ren/nodes/6
