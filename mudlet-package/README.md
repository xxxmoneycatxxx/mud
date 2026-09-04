# 炎黄MUD - Mudlet 官方扩展包

本目录包含炎黄MUD的 Mudlet 客户端扩展包（mpackage）源码。

## 目录结构

```
mudlet-package/
├── .mudlet/
│   └── Icon/
│       └── MudRen.png          # 扩展包图标
├── config.lua                  # 包元数据（名称、版本、描述）
├── mudren.xml                  # Mudlet 包定义（触发器/别名/脚本/定时器）
├── build.sh                    # 构建脚本（打包为 .mpackage.zip）
├── .gitignore                  # 忽略构建产物
└── README.md                   # 本文件
```

## 功能概览

| 功能 | 类型 | 说明 |
|------|------|------|
| 状态条（Gauge） | Script + GMCP | 气血/精气/内力/精力/食物/饮水实时显示 |
| 地图组件 | Script | 右侧面板嵌入地图，支持自动定位 |
| 自动寻路 | Alias | `gtr roomID` 或 `gtr 房间名` |
| 地图更新 | Alias | `load map` 从服务器下载最新地图 |
| 出口链接 | Trigger | 房间出口方向可点击移动 |
| 战斗状态刷新 | Trigger | 状态变化时自动请求 GMCP 数据更新 |
| 自动拾取 | Trigger | 仙丹掉落自动拾取 |
| 速走控制 | Trigger | 遇敌/叫船时自动暂停速走 |
| 热更新 | Alias | `mudren update` 在线更新扩展包 |

## 构建

```bash
# Linux / MSYS2
./mudlet-package/build.sh

# 指定输出目录
./mudlet-package/build.sh /path/to/output
```

构建产物为 `mudren.mpackage.zip`，可直接在 Mudlet 中通过 `File → Install Package` 安装。

## 部署

将构建产物部署到 Web 服务器，使其可通过 GMCP `Client.GUI` 协议自动下载安装：

1. 将 `mudren.mpackage.zip` 上传至 `data/.env` 中 `GUI.url` 指定的地址
2. 玩家用 Mudlet 连接游戏时，服务端自动推送下载链接
3. 也可在游戏中使用 `mudren update` 命令手动更新

## 开发说明

- 修改 `mudren.xml` 中的触发器、别名、脚本后，重新运行 `build.sh` 打包
- 版本号在 `config.lua` 的 `version` 字段维护
- 测试时可直接在 Mudlet 中 `File → Install Package` 安装本地 zip 文件
