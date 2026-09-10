# 炎黄群侠传副本系统设计方案

## 系统概述

本方案实现一个数据驱动的副本/实例系统，支持动态生成独立的副本空间（房间、NPC、物品），每个队伍或玩家拥有自己的副本实例，互不干扰。

### 设计目标

- **独立副本**：每个实例拥有独立的房间、NPC 和物品，玩家之间互不影响
- **数据驱动**：副本结构由 LPC mapping 配置文件定义，无需编写房间文件
- **复用现有体系**：基于 virtual_d.c 的虚拟对象机制和 area/map.c 的坐标地图体系

### 设计原则

1. **文件优先**：物理文件存在时优先加载，副本系统仅在需要动态生成时介入
2. **LPC 原生**：使用 LPC mapping 作为配置格式，不引入外部数据库
3. **零侵入**：不修改任何现有房间、NPC、物品文件
4. **渐进增强**：从最简单的单房间副本开始，逐步支持多房间、门/锁、程序化地形

### 与现有系统的关系

| 现有系统 | 定位 |
|---|---|
| `mudcore/system/daemons/virtual_d.c` | 坐标虚拟房间（野外/迷宫），副本系统独立于它，不修改其路由逻辑 |
| `mudcore/inherit/area/map.c` | 坐标地图渲染，副本房间可选继承其坐标体系 |
| `mudcore/world/area_pattern/` | 程序化地形模板，副本可引用 |
| `inherit/room/buildroom.c` | 玩家私有房屋系统，与副本不冲突 |
| `feature/user_gmcp.c` | GMCP Room.Info 推送，副本房间自动兼容 |

## 副本模板配置

副本模板定义为 LPC 文件，存放在 `/d/instance/templates/` 目录下，每个文件返回一个 mapping 描述副本结构。

### 模板文件结构

```lpc
// /d/instance/templates/taohua_island.c

mapping query_template()
{
    return ([
        // 基本信息
        "id"             : "taohua_island",
        "name"           : "桃花岛",
        "type"           : "instance",    // instance / dungeon / event
        "max_players"    : 6,
        "time_limit"     : 3600,          // 秒，0 = 不限时
        "reset_cooldown" : 1800,          // 重置冷却时间（秒）

        // 入口（玩家从哪里进入副本）
        "entry_room"     : "entrance",

        // 出口（离开副本回到哪里）
        "exit_to"        : ([
            "file" : "/d/taohua/dock",
            "x"    : 5,
            "y"    : 10,
        ]),

        // 房间定义
        "rooms"          : ({ /* 见下方 */ }),

        // NPC 定义（全局，可放置在任意房间）
        "npcs"           : ({ /* 见下方 */ }),

        // 物品定义（全局，可放置在任意房间）
        "items"          : ({ /* 见下方 */ }),
    ]);
}
```

### 副本类型

| 类型 | 说明 | 典型场景 |
|---|---|---|
| `instance` | 独立副本，每支队伍独立实例 | 桃花岛、黑木崖密道 |
| `dungeon` | 持久副本，所有玩家共享同一实例 | 少林寺地牢、古墓派墓穴 |
| `event` | 限时事件副本，按时间触发 | 武林大会、襄阳保卫战 |

### 房间定义

每个房间是一个 mapping，通过 `id` 互相引用出口：

```lpc
"rooms" : ({
    ([
        "id"       : "entrance",
        "short"    : "桃花岛码头",
        "long"     : @LONG
你踏上了一座海岛。海风带着咸味拂面而来，码头上停泊着
几艘小渔船。北面是一条蜿蜒的山路，通往岛深处。
LONG,
        "outdoors" : "taohua_island",
        "exits"    : ([
            "north" : "path1",           // 引用同副本内其他房间 id
        ]),
        "objects"  : ([
            "/clone/npc/fisher" : 2,     // 文件路径 : 数量
        ]),
    ]),
    ([
        "id"       : "path1",
        "short"    : "山间小路",
        "long"     : "一条蜿蜒的山间小路，两旁桃花盛开。",
        "outdoors" : "taohua_island",
        "exits"    : ([
            "south" : "entrance",
            "north" : "secret_door",
        ]),
        "objects"  : ([
            "/clone/npc/peach_bird" : 1 + random(2),  // 支持 LPC 表达式
        ]),
    ]),
    ([
        "id"       : "secret_door",
        "short"    : "石门前",
        "long"     : "你来到一扇巨大的石门前，门上刻着奇异的符文。",
        "outdoors" : "taohua_island",
        "exits"    : ([
            "south" : "path1",
            "enter" : "treasure_room",   // 需要满足门/锁条件
        ]),
        "door"     : ([                  // 门/锁配置
            "name"       : "石门",
            "desc"       : "一扇巨大的石门，上面刻着奇异的符文。",
            "status"     : "locked",      // open / closed / locked / hidden
            "key_id"     : "taohua_key",
            "difficulty" : 5,
        ]),
    ]),
    ([
        "id"       : "treasure_room",
        "short"    : "藏宝室",
        "long"     : "室内金光闪闪，到处是珍贵的宝物。",
        "outdoors" : 0,
        "exits"    : ([
            "out" : "secret_door",
        ]),
        "objects"  : ([
            "/clone/weapon/jian" : 1,
            "/clone/herb/lingzhi" : 2 + random(3),
        ]),
    ]),
})
```

### NPC 定义

NPC 可在模板中预定义属性覆盖，无需单独创建 NPC 文件：

```lpc
"npcs" : ({
    ([
        "id"     : "guard",
        "base"   : "/clone/npc/guard",    // 基础 NPC 文件
        "name"   : "桃花岛弟子",           // 覆盖名称
        "short"  : "一个手持长剑的桃花岛弟子",
        "level"  : 30,
        "combat_exp" : 50000,
        "skills" : ([
            "sword"  : 80,
            "dodge"  : 60,
            "force"  : 70,
        ]),
        "room"   : "entrance",            // 放置在哪个房间
        "respawn": 300,                   // 死亡后多少秒重生，0 = 不重生
    ]),
    ([
        "id"     : "boss",
        "base"   : "/clone/npc/master",
        "name"   : "黄药师",
        "level"  : 80,
        "combat_exp" : 500000,
        "room"   : "treasure_room",
        "respawn": 0,                     // Boss 不重生
    ]),
})
```

### 物品定义

物品同样支持属性覆盖：

```lpc
"items" : ({
    ([
        "id"     : "taohua_sword",
        "base"   : "/clone/weapon/changjian",
        "name"   : "桃花剑",
        "value"  : 5000,
        "weapon_prop/damage" : 35,
        "room"   : "treasure_room",
        "respawn": 600,
    ]),
})
```

### 门/锁配置

门配置挂在房间的 `exits` 中特定方向上，支持以下状态：

| 状态 | 说明 | 玩家行为 |
|---|---|---|
| `open` | 门已开放 | 直接通过 |
| `closed` | 门已关闭 | `open door` 打开后通过 |
| `locked` | 门已上锁 | 需要对应 `key_id` 的钥匙，或满足 `difficulty` 的开锁技能 |
| `hidden` | 隐藏出口 | 需要 `search` 命令发现，或满足特定条件 |

```lpc
"door" : ([
    "name"       : "石门",
    "desc"       : "一扇巨大的石门，上面刻着奇异的符文。",
    "status"     : "locked",
    "key_id"     : "taohua_key",       // 钥匙物品 id
    "difficulty" : 5,                  // 开锁难度（对应开锁技能等级）
])
```

## 副本守护进程

新增 `/adm/daemons/instance_d.c`，管理所有副本实例的生命周期。

### 核心接口

```lpc
// 创建副本实例
// 返回 instance_id，失败返回 0
string create_instance(string template_id, object team_leader);

// 玩家进入副本
// 将玩家传送到副本入口房间
int enter_instance(object player, string instance_id);

// 玩家离开副本
// 将玩家传送到副本出口（exit_to 指定的外部房间）
int exit_instance(object player);

// 重置副本（NPC/物品刷新）
int reset_instance(string instance_id);

// 销毁副本实例
int destroy_instance(string instance_id);

// 查询副本状态
mapping query_instance_info(string instance_id);

// 查询玩家当前所在副本
string query_player_instance(object player);
```

### 内部数据结构

```lpc
// 所有活跃副本实例
nosave mapping instances = ([
    /*
    "inst_001" : ([
        "template_id"  : "taohua_island",
        "instance_id"  : "inst_001",
        "leader"       : <object>,        // 队长
        "players"      : ({ <object>, ... }),
        "rooms"        : ([
            "entrance"      : <object>,    // room_id -> room object
            "path1"         : <object>,
            "secret_door"   : <object>,
            "treasure_room" : <object>,
        ]),
        "created_at"   : 1726000000,
        "status"       : "active",        // active / resetting / destroyed
        "time_limit"   : 3600,
        "reset_cooldown": 1800,
    ]),
    */
]);

// 玩家 -> 副本实例 的反向索引
nosave mapping player_instances = ([
    /*
    <player_object> : "inst_001",
    */
]);
```

### 生命周期

```
create_instance()          玩家触发副本入口
    │                      │
    ▼                      ▼
加载模板 ──► 创建房间对象 ──► 传送玩家到入口房间
    │                           │
    ▼                           ▼
spawn NPC/物品            玩家在副本内活动
    │                           │
    ▼                           ▼
心跳检查 ◄────────────── 玩家离开 / 超时
    │
    ├── 全员离开 ──► destroy_instance()
    ├── 超时 ──► destroy_instance()
    └── 需要重置 ──► reset_instance()
```

### 心跳与自动清理

```lpc
protected int heart_beat()
{
    set_heart_beat(60);  // 每分钟检查一次

    string *ids = keys(instances);
    foreach (string id in ids)
    {
        mapping inst = instances[id];

        // 检查超时
        if (inst["time_limit"] > 0 &&
            time() - inst["created_at"] > inst["time_limit"])
        {
            destroy_instance(id);
            continue;
        }

        // 检查是否还有玩家
        object *alive_players = filter(inst["players"], (: objectp($1) && userp($1) :));
        if (!sizeof(alive_players))
        {
            destroy_instance(id);
            continue;
        }

        // 更新玩家列表（清除已断线的）
        inst["players"] = alive_players;
    }

    return 1;
}
```

## 虚拟房间实现

新增 `/d/instance/room.c`，继承 ROOM，由 instance_d 在创建实例时动态实例化。

### 实现要点

```lpc
// /d/instance/room.c
inherit ROOM;

void create(mapping room_data, string instance_id, object daemon)
{
    // 基本属性
    set("short", room_data["short"]);
    set("long", room_data["long"]);

    if (room_data["outdoors"])
        set("outdoors", room_data["outdoors"]);

    // 出口（此时指向同副本内其他房间的路径）
    if (mapp(room_data["exits"]))
    {
        mapping exits = ([ ]);
        foreach (string dir, string target_id in room_data["exits"])
        {
            // 出口目标在 instance_d 创建完所有房间后统一解析
            exits[dir] = sprintf("/d/instance/room/%s/%s", instance_id, target_id);
        }
        set("exits", exits);
    }

    // 门/锁
    if (mapp(room_data["door"]))
    {
        // 门的状态存储在房间的 temp dbase 中
        set("door", room_data["door"]);
    }

    // 副本标记
    set("instance_id", instance_id);
    set("room_id", room_data["id"]);

    setup();

    // 放置 NPC 和物品
    if (mapp(room_data["objects"]))
    {
        foreach (string file, int count in room_data["objects"])
        {
            for (int i = 0; i < count; i++)
            {
                object ob = new(file);
                if (ob) ob->move(this_object());
            }
        }
    }
}
```

### 路径约定

副本房间的 object path 格式为：

```
/d/instance/room/{instance_id}/{room_id}
```

例如：`/d/instance/room/inst_001/entrance`

这确保了：
- 每个副本实例的房间路径唯一，不会互相冲突
- GMCP `Room.Info` 的 hash 计算基于 `base_name()`，自然唯一
- 与现有 `virtual_d.c` 的坐标虚拟房间路径格式不冲突

### 地图渲染集成

副本房间可选支持坐标体系，复用 `mudcore/inherit/area/map.c` 的地图渲染：

```lpc
// 在模板的房间定义中增加坐标字段
([
    "id"    : "entrance",
    "short" : "桃花岛码头",
    // ...
    "coord" : ([ "x" : 5, "y" : 10, "z" : 0 ]),
    "icon"  : "🏠",
    "block" : 0,
])
```

instance_d 在创建房间时，如果模板包含 `coord` 字段，则额外继承 area/map.c 的坐标能力，使副本内也能显示小地图。

## 与现有系统的集成

### GMCP Room.Info 兼容

副本房间的 `base_name()` 格式为 `/d/instance/room/inst_001/entrance`，经 `send_room_info()` 中的 hash 计算后自然唯一。Web 客户端无需任何修改即可正确显示副本房间信息。

`exit_targets` 同样正常工作：副本内部出口指向同实例的其他房间路径，跨副本/外部出口（如 `exit_to`）指向外部真实房间路径，hash 均正确。

### 自动寻路兼容

副本房间使用标准的 `set("exits", ([ ... ]))` 设置出口，与现有房间完全一致。Web 客户端的 `pathfinder.js` 基于 `Room.Info` 的 `exits` 和 `exit_targets` 构建图，无需特殊处理副本场景。

### 自动拾取兼容

副本中的物品由标准 LPC 对象承载，现有的自动拾取触发器可正常识别和操作。

## 使用指南

### 创建新副本模板

1. 在 `/d/instance/templates/` 下创建模板文件：

```lpc
// /d/instance/templates/heimu_climb.c
mapping query_template()
{
    return ([
        "id"          : "heimu_climb",
        "name"        : "黑木崖密道",
        "type"        : "dungeon",
        "max_players" : 4,
        "time_limit"  : 7200,
        "entry_room"  : "cave_entrance",
        "exit_to"     : ([
            "file" : "/d/heimuya/road3",
        ]),
        "rooms"       : ({
            ([
                "id"    : "cave_entrance",
                "short" : "山洞入口",
                "long"  : "一个阴暗的山洞入口，空气中弥漫着潮湿的气息。",
                "exits" : ([ "east" : "tunnel1" ]),
            ]),
            ([
                "id"    : "tunnel1",
                "short" : "地下通道",
                "long"  : "曲折的地下通道，墙壁上有微弱的火光。",
                "exits" : ([
                    "west"  : "cave_entrance",
                    "north" : "boss_room",
                ]),
                "objects" : ([
                    "/clone/npc/ cultist" : 2 + random(2),
                ]),
            ]),
            ([
                "id"    : "boss_room",
                "short" : "密室",
                "long"  : "一间宽敞的密室，中央端坐着一个黑衣人。",
                "exits" : ([ "south" : "tunnel1" ]),
            ]),
        }),
        "npcs"        : ({
            ([
                "id"   : "boss",
                "base" : "/clone/npc/leader",
                "name" : "魔教长老",
                "room" : "boss_room",
            ]),
        }),
        "items"       : ({
            ([
                "id"   : "heimu_token",
                "base" : "/clone/misc/token",
                "name" : "黑木令",
                "room" : "boss_room",
            ]),
        }),
    ]);
}
```

### 入口房间设置

在普通区域中放置副本入口，例如在 `/d/heimuya/road3.c` 中添加：

```lpc
// 在 create() 中添加
set("instance_entry/heimu_climb", "黑木崖密道");
```

玩家看到入口提示后，使用命令进入：

```
> enter 黑木崖密道
```

### 命令接口

| 命令 | 说明 |
|---|---|
| `enter <副本名>` | 进入副本（在入口房间使用） |
| `leave` | 离开副本，返回入口外部 |
| `instance info` | 查看当前副本信息（剩余时间、玩家数等） |
| `instance reset` | 重置副本（需队长权限） |

## 兼容性保证

1. **文件房间优先**：物理文件存在时直接加载，副本系统仅在需要动态生成时介入
2. **零侵入**：不修改任何现有房间、NPC、物品文件
3. **路径隔离**：副本房间路径 `/d/instance/room/` 与现有 `/d/{area}/` 完全隔离
4. **渐进扩展**：
   - 第一阶段：支持基本多房间副本（房间 + 出口 + NPC/物品放置）
   - 第二阶段：增加门/锁机制和钥匙系统
   - 第三阶段：集成 area/map.c 坐标体系，支持副本内地图渲染
   - 第四阶段：支持 area_pattern 程序化地形生成
