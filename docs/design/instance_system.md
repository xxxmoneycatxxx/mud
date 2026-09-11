# 副本系统设计方案

## 一、系统概述

副本系统为玩家提供独立的、可重复挑战的游戏空间。每个副本拥有独立的房间、NPC 和物品，队伍之间互不干扰。

### 1.1 设计目标

- **独立副本**：每个实例拥有独立的房间、NPC 和物品，玩家之间互不影响
- **数据驱动**：副本结构由 LPC mapping 配置文件定义，无需编写房间文件
- **复用现有体系**：基于 virtual_d.c 的虚拟对象机制和 area/map.c 的坐标地图体系
- **渐进增强**：从最简单的单房间副本开始，逐步支持多房间、门/锁、程序化地形

### 1.2 设计原则

1. **文件优先**：物理文件存在时优先加载，副本系统仅在需要动态生成时介入
2. **LPC 原生**：使用 LPC mapping 作为配置格式，不引入外部数据库
3. **零侵入**：不修改任何现有房间、NPC、物品文件
4. **渐进增强**：从最简单的战斗副本开始，逐步增加机制复杂度

### 1.3 与现有系统的关系

| 现有系统 | 定位 |
|---|---|
| `mudcore/system/daemons/virtual_d.c` | 坐标虚拟房间（野外/迷宫），副本系统独立于它 |
| `mudcore/inherit/area/map.c` | 坐标地图渲染，副本房间可选继承其坐标体系 |
| `mudcore/world/area_pattern/` | 程序化地形模板，副本可引用 |
| `inherit/room/buildroom.c` | 玩家私有房屋系统，与副本不冲突 |
| `feature/user_gmcp.c` | GMCP Room.Info 推送，副本房间自动兼容 |
| `feature/action.c` | override 机制，副本用于拦截死亡/退出 |
| `feature/damage.c` | `run_override("unconcious")` 和 `run_override("die")` 已就绪 |
| `cmds/usr/quit.c` | `run_override("quit")` 已就绪 |
| `adm/daemons/npcd.c` | NPC 等级体系（26级），副本 NPC 基于此缩放 |

---

## 二、游戏数值体系参考

### 2.1 玩家等级表（来自 npcd.c）

| 等级 | combat_exp | 定位描述 |
|------|-----------|---------|
| 1 | 5万 | 初入江湖 |
| 2 | 10万 | 崭露头角 |
| 3 | 20万 | 小有所成 |
| 4 | 40万 | 登堂入室 |
| 5 | 50万 | 初窥门径 |
| 6 | 80万 | 融会贯通 |
| 7 | 120万 | 炉火纯青 |
| 8 | 160万 | 出神入化 |
| 9 | 200万 | 返璞归真 |
| 10 | 250万 | 登峰造极 |
| 11 | 300万 | 一代宗师 |
| 12 | 400万 | 武林泰斗 |
| 13 | 550万 | 绝世高手 |
| 14 | 750万 | 天下无敌 |
| 15 | 900万 | 超凡入圣 |
| 16 | 1500万 | 绝顶高手 |
| 17 | 2000万 | 传说级别 |
| 18-26 | 2800万-1.2亿 | 天花板区间 |

### 2.2 等级计算公式

```
lv = (combat_exp × 10)^(1/3)
升级所需 = (lv+1)^3 / 10 - combat_exp
```

三次方根增长曲线意味着高等级之间差距极其巨大，副本难度设计必须考虑这一点。

### 2.3 现有 NPC 战力参考

| NPC | combat_exp | 说明 |
|-----|-----------|------|
| 木人 (mu-ren) | 5万 | 少林练功最低级 |
| 马夫 (mafu) | 5万 | 普通NPC |
| 铜人 (tong-ren) | 25万 | 少林中级 |
| 杀手 (killer) | 15万 | 任务NPC |
| 铁人 (tie-ren) | 50万 | 少林高级 |
| 捕快 (xunbu) | 60万 | 城市守卫 |
| 盟主 (meng-zhu) | 50万 | 高级Boss |

---

## 三、副本剧本设计

### 3.1 设计理念

副本剧本从金庸原著取材，按玩家等级段分层。每个副本包含：
- **背景故事**：为什么进入副本（1-2段文字）
- **战斗流程**：小怪 → 精英 → Boss 的递进
- **机制特色**：不只是血厚攻高，每个Boss有独特战斗机制
- **叙事融合**：房间描述、NPC对话推动剧情

### 3.2 低等级副本（Lv1-5，5万-50万exp）

#### 木人巷（教学副本，Lv1-3）

**背景**：少林派传统试炼。弟子须通过木人巷方可下山行走。

| 房间 | 内容 | 说明 |
|------|------|------|
| 巷口 | 少林长老交代规则 | 入口，NPC对话 |
| 第一段 | 2× 木人 (5万exp) | 教学战斗，熟悉操作 |
| 第二段 | 3× 木人 (5万exp) | 连续战斗 |
| 第三段 | 1× 铜人精英 (25万exp) | 精英战，需要用药 |
| 尽头 | Boss: 铜人长老 (40万exp) | 首次Boss体验 |
| 出口 | 长老奖励，获得称号 | 结算房间 |

**特色**：纯战斗教学，无复杂机制。让玩家熟悉副本流程。

#### 牛家村突围（Lv3-5）

**背景**：金兵入侵牛家村，村民被困。郭靖幼年好友被困村中，需要杀入救援。

| 房间 | 内容 | 说明 |
|------|------|------|
| 村口 | 金兵小队 (2× 10万exp) | 热身 |
| 村内小巷 | 金兵百夫长 (20万exp) + 2× 小兵 | 精英战 |
| 被困院落 | 救出村民NPC | 叙事节点 |
| 村尾桥头 | Boss: 金兵千夫长 (35万exp) | Boss战 |

**特色**：引入"救援"叙事，中间房间有NPC互动。

### 3.3 中等级副本（Lv6-10，80万-250万exp）

#### 桃花岛迷阵（Lv6-8）

**背景**：桃花岛上黄药师布下奇门遁甲大阵。玩家受命入岛取回被盗的《九阴真经》残页。

| 房间 | 内容 | 说明 |
|------|------|------|
| 码头 | 上岸，发现桃花阵 | 入口 |
| 桃花林·东 | 迷宫分支A，2× 桃花岛弟子 (80万exp) | 迷宫探索 |
| 桃花林·西 | 迷宫分支B，遇到黄蓉NPC给线索 | 叙事分支 |
| 竹林 | 精英: 梅超风 (150万exp) | 精英战，九阴白骨爪 |
| 石门前 | 需要找到钥匙或开锁 | 门/锁机制 |
| 内室 | Boss: 黄药师幻影 (200万exp) | Boss战，弹指神通远程攻击 |

**特色**：迷宫探索 + 门/锁机制 + Boss 远程攻击特色。

#### 少林寺地牢（Lv8-10）

**背景**：同门师兄弟被少林叛僧囚禁于地牢深处。潜入救援，一路击败守关僧人。

| 房间 | 内容 | 说明 |
|------|------|------|
| 地牢入口 | 击败守门僧 (100万exp) | 入门 |
| 第一层 | 2× 武僧 (120万exp) + 陷阱房间 | 连续战 |
| 第二层 | 精英: 达摩院首座 (180万exp) | 精英战 |
| 牢房区 | 解救NPC（限时） | 时间压力机制 |
| 最深处 | Boss: 叛僧长老 (250万exp) | Boss，两阶段 |

**特色**：限时救援机制 + Boss 两阶段战斗（50%血量切换招式）。

### 3.4 高等级副本（Lv11-16，300万-1500万exp）

#### 黑木崖密道（Lv11-13）

**背景**：日月神教总坛黑木崖。教主东方不败修炼葵花宝典走火入魔，教中大乱。玩家受正道之托攻入密道。

| 房间 | 内容 | 说明 |
|------|------|------|
| 山脚密道 | 2× 教众 (300万exp) | 热身 |
| 暗河 | 精英: 白虎使 (450万exp) | 精英，毒攻击 |
| 机关走廊 | 需要躲避/解除机关 | 环境互动 |
| 大殿前厅 | 2× 长老 (500万exp) | 连续精英战 |
| 教主密室 | Boss: 东方不败 (700万exp) | 多阶段Boss |

**Boss 机制**：
- 阶段一（100%-50%）：葵花宝典，速度极快，每回合双攻击
- 阶段二（50%-0%）：走火入魔，攻击混乱但伤害更高，有概率自伤

#### 襄阳保卫战（Lv14-16）

**背景**：蒙古大军围攻襄阳。玩家协助郭靖守城，抵御多波进攻，最终对决金轮法王。

| 房间 | 内容 | 说明 |
|------|------|------|
| 城墙 | 第一波: 3× 蒙古先锋 (700万exp) | 多怪战 |
| 城门 | 第二波: 2× 蒙古先锋 + 1× 攻城锤 | 环境互动 |
| 城内 | 第三波: 精英 蒙古国师弟子 (1000万exp) | 精英战 |
| 帅帐前 | Boss: 金轮法王 (1500万exp) | 终极Boss |

**Boss 机制**：
- 龙象般若功：每3回合释放一次全屏AOE
- 五轮飞舞：召唤5个金轮随机攻击，需要走位躲避
- 阶段转换：70%/40%血量各触发一次，增强攻击模式

### 3.5 顶级副本（Lv17+，2000万+exp）

#### 华山论剑（Lv17-20）

**背景**：华山之巅，五绝齐聚。玩家以挑战者身份逐一迎战东邪、西毒、南帝、北丐、中神通。

| 房间 | 内容 | 说明 |
|------|------|------|
| 华山北峰 | 黄药师 (2500万exp) | 弹指神通远程，桃花阵减速 |
| 华山西峰 | 欧阳锋 (3000万exp) | 蛤蟆功高爆发，毒攻击 |
| 华山南峰 | 一灯大师 (3500万exp) | 一阳指治疗+攻击，持久战 |
| 华山东峰 | 洪七公 (4000万exp) | 降龙十八掌，高伤害单体 |
| 华山之巅 | 王重阳 (5000万exp) | 先天功全属性，最终Boss |

**特色**：连战制，每场之间只恢复30%血量，考验资源管理。

#### 光明顶密道（Lv20+）

**背景**：明教光明顶总坛。六大派围攻光明顶之际，成昆暗中布局阴谋。玩家发现密道入口，深入阻止阴谋。

| 房间 | 内容 | 说明 |
|------|------|------|
| 密道入口 | 明教哨兵 (4000万exp) | 入门 |
| 密道深处 | 2× 明教护法 (5000万exp) | 精英 |
| 成昆密室 | Boss: 成昆 (8000万exp) | 阴谋Boss |
| 隐藏宝库 | 通关奖励 | 结算 |

**Boss 机制**：
- 成昆：混元霹雳掌，每回合附加"灼伤"持续伤害
- 50%血量召唤2个幻象（半血小怪），需要先清除
- 20%血量进入狂暴，攻击翻倍但防御降低

---

## 四、难度设计机制

### 4.1 NPC 动态缩放

副本 NPC 基于 `NPC_D->check_level()` 返回的玩家等级进行缩放：

```
小怪：玩家等级 × 0.6（能打过但需要消耗资源）
精英：玩家等级 × 0.9（需要认真应对，可能受伤）
Boss：玩家等级 × 1.2（单人困难，需要策略或组队）
```

缩放通过 `NPC_D->set_from_me()` 和 `fighter.c` 的 `scale` 机制实现：
- `scale = 60` → 小怪（60%玩家实力）
- `scale = 90` → 精英
- `scale = 120` → Boss

### 4.2 Boss 独特机制（核心差异化）

Boss 不是简单的"血厚攻高"，每个 Boss 有独特战斗机制：

| 机制类型 | 说明 | 示例 |
|---------|------|------|
| 阶段转换 | Boss 血量降到阈值时切换攻击模式 | 东方不败走火入魔 |
| 环境互动 | 房间内有可互动物件（机关、药箱） | 襄阳城攻城锤 |
| 时间压力 | 限时完成目标，否则失败 | 少林地牢救人 |
| 召唤机制 | Boss 召唤小怪需要优先清除 | 成昆幻象 |
| 弱点窗口 | 特定阶段暴露弱点，抓住窗口输出 | 欧阳锋蛤蟆功蓄力时 |
| 连战消耗 | 多场战斗间只部分恢复 | 华山论剑连战五绝 |

### 4.3 组队难度调整

| 人数 | NPC 血量倍率 | NPC 攻击倍率 | 说明 |
|------|------------|------------|------|
| 1人 | ×1.0 | ×1.0 | 标准难度 |
| 2人 | ×1.5 | ×1.2 | 略难于单人 |
| 3人 | ×2.0 | ×1.4 | 明显难于单人 |
| 4人+ | ×2.5 | ×1.5 | 团队挑战 |

### 4.4 副本死亡处理

利用已有的 `set_override` 机制：

```lpc
// 进入副本时设置
me->set_override("die", (: call_other, INSTANCE_D, "check_out" :));
me->set_override("unconcious", (: call_other, INSTANCE_D, "check_out" :));
me->set_override("quit", (: call_other, INSTANCE_D, "check_quit" :));

// check_out: 不真死，恢复满血，传送回入口外部
// check_quit: 先清理副本状态，再执行正常 quit
```

---

## 五、奖励设计

### 5.1 首次通关奖励

| 副本等级段 | 经验奖励 | 潜能奖励 | 专属奖励 |
|-----------|---------|---------|---------|
| Lv1-5 | 5万-20万 | 2万-8万 | 称号 + 低级装备 |
| Lv6-10 | 30万-100万 | 10万-30万 | 称号 + 中级装备 |
| Lv11-16 | 150万-500万 | 50万-150万 | 称号 + 高级装备 |
| Lv17+ | 600万+ | 200万+ | 称号 + 顶级装备/秘籍 |

### 5.2 重复刷奖励

- 经验递减：首次100%，第二次50%，第三次起25%
- 副本专属货币：可兑换特殊物品
- 稀有掉落：Boss 有概率掉落专属装备/材料

### 5.3 成就系统

| 成就 | 条件 | 额外奖励 |
|------|------|---------|
| 速通 | 在限定时间的50%内通关 | 经验×1.5 |
| 无伤 | 无任何人损失通关 | 专属称号 |
| 单挑 | 单人通关组队副本 | 经验×2 |
| 全灭 | 不死亡通关 | 潜能×1.5 |

---

## 六、副本模板配置

### 6.1 模板文件结构

副本模板定义为 LPC 文件，存放在 `/d/instance/templates/` 目录下：

```lpc
// /d/instance/templates/muren_xiang.c
mapping query_template()
{
    return ([
        "id"             : "muren_xiang",
        "name"           : "木人巷",
        "type"           : "instance",
        "min_level"      : 1,
        "max_players"    : 4,
        "time_limit"     : 1800,
        "reset_cooldown" : 900,

        "entry_room"     : "entrance",
        "exit_to"        : ([ "file" : "/d/shaolin/road3" ]),

        "rooms" : ({
            ([
                "id"    : "entrance",
                "short" : "木人巷入口",
                "long"  : "少林派传统的试炼通道。两排木人静静矗，似乎在等待挑战者。",
                "exits" : ([ "north" : "section1" ]),
            ]),
            ([
                "id"    : "section1",
                "short" : "木人巷·第一段",
                "long"  : "狭窄的巷道中，数个木人突然转动起来。",
                "exits" : ([ "south" : "entrance", "north" : "section2" ]),
                "npcs"  : ({
                    ([ "base" : "/clone/npc/mu-ren", "count" : 2 ]),
                }),
            ]),
            ([
                "id"    : "section2",
                "short" : "木人巷·第二段",
                "long"  : "更多的木人从墙壁中弹出，铜制的躯体泛着冷光。",
                "exits" : ([ "south" : "section1", "north" : "boss_room" ]),
                "npcs"  : ({
                    ([ "base" : "/clone/npc/mu-ren", "count" : 3 ]),
                }),
            ]),
            ([
                "id"    : "boss_room",
                "short" : "木人巷尽头",
                "long"  : "巷道尽头，一尊高大的铜人拦住了去路。",
                "exits" : ([ "south" : "section2" ]),
                "npcs"  : ({
                    ([ "base" : "/clone/npc/tong-ren", "scale" : 150 ]),
                }),
            ]),
        }),
    ]);
}
```

### 6.2 NPC 缩放配置

模板中 NPC 支持以下配置：

| 字段 | 说明 |
|------|------|
| `base` | 基础 NPC 文件路径 |
| `count` | 数量（默认1） |
| `scale` | 实力缩放百分比（相对于玩家等级） |
| `room` | 放置在哪个房间（全局NPC定义时使用） |
| `respawn` | 死亡后重生时间（0=不重生） |

---

## 七、副本守护进程

### 7.1 核心接口

新增 `/adm/daemons/instance_d.c`：

```lpc
// 创建副本实例
string create_instance(string template_id, object team_leader);

// 玩家进入副本
int enter_instance(object player, string instance_id);

// 玩家离开副本（传送到出口外部）
int exit_instance(object player);

// 副本内死亡/昏迷处理
int check_out(object player);

// 副本内退出处理
int check_quit(object player);

// 销毁副本实例
int destroy_instance(string instance_id);

// 查询副本状态
mapping query_instance_info(string instance_id);
```

### 7.2 生命周期

```
create_instance()          玩家触发副本入口
    │                      │
    ▼                      ▼
加载模板 ──► 创建房间对象 ──► 设置 override ──► 传送玩家
    │                                              │
    ▼                                              ▼
spawn NPC/物品                              玩家在副本内活动
    │                                              │
    ▼                                              ▼
心跳检查 ◄────────────────────────── 玩家离开/超时/全员退出
    │
    ├── 全员离开 ──► destroy_instance()
    ├── 超时 ──► destroy_instance()
    └── 死亡 ──► check_out() 传送回入口外部
```

### 7.3 心跳与自动清理

```lpc
protected int heart_beat()
{
    set_heart_beat(60);  // 每分钟检查一次

    foreach (string id in keys(instances))
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
        object *alive = filter(inst["players"],
            (: objectp($1) && userp($1) :));
        if (!sizeof(alive))
        {
            destroy_instance(id);
            continue;
        }

        inst["players"] = alive;
    }
    return 1;
}
```

---

## 八、虚拟房间实现

### 8.1 副本房间对象

新增 `/d/instance/room.c`，继承 ROOM：

```lpc
inherit ROOM;

void create(mapping room_data, string instance_id)
{
    set("short", room_data["short"]);
    set("long", room_data["long"]);

    if (room_data["outdoors"])
        set("outdoors", room_data["outdoors"]);

    // 出口解析
    if (mapp(room_data["exits"]))
    {
        mapping exits = ([ ]);
        foreach (string dir, string target_id in room_data["exits"])
            exits[dir] = sprintf("/d/instance/room/%s/%s",
                instance_id, target_id);
        set("exits", exits);
    }

    // 副本标记
    set("instance_id", instance_id);
    set("room_id", room_data["id"]);

    setup();

    // 放置 NPC
    if (arrayp(room_data["npcs"]))
    {
        foreach (mapping npc_def in room_data["npcs"])
        {
            int count = npc_def["count"] || 1;
            for (int i = 0; i < count; i++)
            {
                object ob = new(npc_def["base"]);
                if (ob) ob->move(this_object());
            }
        }
    }
}
```

### 8.2 路径约定

```
/d/instance/room/{instance_id}/{room_id}
```

例如：`/d/instance/room/inst_001/entrance`

- 每个副本实例的房间路径唯一
- GMCP Room.Info 的 hash 基于 `base_name()` 自然唯一
- 与现有 `virtual_d.c` 坐标虚拟房间不冲突

### 8.3 virtual_d.c 路由扩展

在 `compile_object()` 中增加副本房间路由：

```lpc
if (!strsrch(file, "/d/instance/room/"))
{
    return INSTANCE_D->query_room_object(file);
}
```

---

## 九、命令接口

### 9.1 玩家命令

| 命令 | 说明 |
|---|---|
| `enter <副本名>` | 进入副本（在入口房间使用） |
| `leave` | 离开副本，返回入口外部 |
| `instance info` | 查看当前副本信息（剩余时间、玩家数等） |

### 9.2 入口房间设置

在普通房间的 `create()` 中标记副本入口：

```lpc
set("instance_entry/muren_xiang", "木人巷");
```

房间自动显示入口提示。

---

## 十、兼容性保证

### 10.1 GMCP Room.Info

副本房间 `base_name()` 格式为 `/d/instance/room/inst_001/entrance`，经 hash 计算后自然唯一。Web 客户端无需修改即可正确显示。

### 10.2 自动寻路

副本房间使用标准 `set("exits")` 设置出口，Web 客户端 `pathfinder.js` 基于 `Room.Info` 的 `exits` 和 `exit_targets` 构建图，无需特殊处理。

### 10.3 自动拾取

副本中的物品由标准 LPC 对象承载，现有自动拾取触发器可正常识别。

---

## 十一、分阶段实施计划

### 第一阶段：最小可用副本（核心骨架）

**目标**：木人巷副本跑通完整链路。

- [ ] `globals.h` 新增 `INSTANCE_D` 宏
- [ ] 创建 `/adm/daemons/instance_d.c`（create/enter/exit/destroy/heart_beat）
- [ ] 创建 `/d/instance/room.c`（副本房间对象）
- [ ] 创建 `/d/instance/templates/muren_xiang.c`（木人巷模板）
- [ ] 创建 `/cmds/usr/enter.c` 和 `/cmds/usr/leave.c`
- [ ] 在 `virtual_d.c` 增加副本房间路由
- [ ] 在少林区域某房间设置副本入口

**验收**：玩家可进入木人巷，击败木人和铜人，`leave` 返回，超时自动销毁，死亡/quit 不真死。

### 第二阶段：NPC/物品动态生成 + 入口集成

- [ ] instance_d 增加 NPC 缩放逻辑（基于 `NPC_D->check_level`）
- [ ] 房间入口自动显示提示（修改 room.c 的 look 逻辑）
- [ ] 创建桃花岛迷阵模板（含迷宫分支）
- [ ] 副本内物品掉落和拾取

### 第三阶段：门/锁 + 冷却 + 组队

- [ ] 门/锁机制（open/closed/locked/hidden 状态）
- [ ] 副本冷却（`reset_cooldown`）
- [ ] 组队进入（队长创建，队员跟随）
- [ ] 创建少林寺地牢模板（含限时救援）

### 第四阶段：Boss 机制 + 奖励 + 高级副本

- [ ] Boss 阶段转换机制
- [ ] 首次通关/重复刷/成就奖励系统
- [ ] 创建黑木崖密道、襄阳保卫战等高级副本
- [ ] 华山论剑连战机制

### 第五阶段：地图集成 + 程序化地形

- [ ] 副本内坐标体系（复用 area/map.c）
- [ ] 程序化地形生成（引用 area_pattern）
- [ ] GMCP 增强（副本状态字段）

---

## 十二、附录：设计参考

副本系统的核心设计思路：
- 使用 `set_override` 劫持玩家行为（死亡/退出/下线）
- 内存中动态创建对象，实现副本实例隔离
- 基于 `NPC_D->check_level` 实现 NPC 动态缩放
- 首次/重复/成就三层奖励系统
