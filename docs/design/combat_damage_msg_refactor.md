# 战斗伤害消息数据驱动化重构

> 将 `combatd.c` 的 `damage_msg()` 从 switch-case 硬编码改为 mapping 数据驱动。
> 来源：创意池 #1

---

## 一、现状分析

### 当前实现（`adm/daemons/combatd.c` L109-281）

```lpc
string damage_msg(int damage, string type)
{
    switch (type) {
    case "擦伤":
    case "割伤":
        if (damage < 15) return "...";
        else if (damage < 40) return "...";
        // ... 6-8 级描述
        break;
    case "刺伤": ...
    case "瘀伤":
    case "震伤": ...
    case "内伤": ...
    case "点穴": ...
    case "抽伤": ...
    case "反震伤": ...
    case "砸伤": ...
    case "枪伤": ...
    default: ...  // 通用 fallback
    }
}
```

**问题**：
- 170 行 switch-case，新增伤害类型需修改函数体
- 各类型阈值不一致（有的 6 级，有的 8 级，断点也不统一）
- 类型合并（“擦伤”/“割伤” 共用、“瘀伤”/“震伤” 共用）增加了理解成本
- **已有漏洞**：“挫伤”和“抓伤”两种类型已被技能使用，但 `damage_msg()` 未处理，走 default 分支显示通用文案

### 参考实现（数据驱动方案）

```lpc
mapping damage_msgs = ([
    "擦伤" : ({ "轻微", "较轻", "中等", "较重", "严重", "极重" }),
    "砍伤" : ({ ... }),
    "挫伤" : ({ ... }),   // 已有漏洞，需补齐
    "抓伤" : ({ ... }),   // 已有漏洞，需补齐
    // 每种统一 6 级
]);

string damage_msg(int damage, string type) {
    if (damage == 0) return "结果没有造成任何伤害。\n";
    if (member_array(type, keys(damage_msgs)) == -1) type = "其他";
    if (damage < 10)      return damage_msgs[type][0];
    else if (damage < 20) return damage_msgs[type][1];
    else if (damage < 40) return damage_msgs[type][2];
    else if (damage < 60) return damage_msgs[type][3];
    else if (damage < 80) return damage_msgs[type][4];
    else                  return damage_msgs[type][5];
}
```

**优势**：函数体仅 15 行；新增类型只需追加 mapping 条目；阈值统一。

---

## 二、重构方案

### 2.1 数据结构

```lpc
// 置于 combatd.c 顶部（函数体外），或拆出独立头文件
mapping damage_msgs = ([
    "擦伤" : ({
        "结果只是轻轻地划破$p的皮肉。\n",
        "结果在$p$l划出一道细长的血痕。\n",
        "结果「嗤」地一声，$w已在$p$l划出一道伤口！\n",
        "结果「嗤」地一声，$w已在$p$l划出一道血淋淋的伤口！\n",
        "结果「嗤」地一声，$w已在$p$l划出一道又长又深的伤口，溅得$N满脸鲜血！\n",
        "结果只听见$n一声惨嚎，$w已在$p$l划出一道深及见骨的可怕伤口！\n",
    }),
    "刺伤" : ({ ... }),
    "瘀伤" : ({ ... }),
    "震伤" : ({ ... }),
    "内伤" : ({ ... }),
    "点穴" : ({ ... }),
    "抽伤" : ({ ... }),
    "反震伤" : ({ ... }),
    "砸伤" : ({ ... }),
    "枪伤" : ({ ... }),
    "其他" : ({ ... }),
]);

// 统一阈值（可后续调整为配置）
int *damage_thresholds = ({ 10, 30, 60, 100, 200 });
```

### 2.2 函数重写

```lpc
string damage_msg(int damage, string type)
{
    string *msgs;
    int i;

    if (damage == 0)
        return "结果没有造成任何伤害。\n";

    if (undefinedp(damage_msgs[type]))
        type = "其他";

    msgs = damage_msgs[type];

    for (i = 0; i < sizeof(damage_thresholds); i++)
        if (damage < damage_thresholds[i])
            return msgs[i];

    return msgs[sizeof(damage_thresholds)];
}
```

### 2.3 阈值设计

当前各类型的阈值不统一，重构时有两个选择：

| 方案 | 阈值 | 说明 |
|------|------|------|
| **A：统一阈值** | 10/30/60/100/200 | 简单一致，易于维护 |
| **B：保留差异** | 按类型保留原阈值 | 兼容现有体验，但 mapping 结构更复杂 |

**建议方案 A**：统一阈值。理由：
- 当前阈值差异是历史累积而非有意设计
- 统一后便于平衡调整（改一处即可全局生效）
- 实际战斗中伤害分布范围大，5-10 的阈值差异几乎无感知

---

## 三、迁移步骤

### Step 1：提取现有消息文本

从当前 switch-case 中逐类型提取消息文本，按伤害从低到高排列。

**注意**：当前部分类型有 8 级描述（如瘀伤/内伤），需压缩为 6 级。
- 策略：合并相邻的相似描述，保留最有区分度的 6 条

### Step 2：补齐已有漏洞 + 新增缺失类型

**已在使用但 damage_msg() 未处理的类型（必须补齐）**：

| 类型 | 使用它的武功 | 当前表现 |
|------|------------|----------|
| 挫伤 | 醉仙古藤棍、银狐掌、降魔杵、无常杖等 | 走 default，显示“结果造成一处挫伤” |
| 抓伤 | 云龙爪、云龙手、岳照功等 | 走 default，显示“结果造成一处抓伤” |

**当前未使用但值得新增的类型（可选）**：

| 类型 | 适用场景 |
|------|----------|
| 砍伤 | 大刀/斧类武器 |
| 掌伤 | 掌法类武功 |
| 拳伤 | 拳法类武功 |
| 鞭伤 | 鞭类武器（与抽伤区分或合并） |

> 注：项目当前无法术系伤害类型，无需预留“法术”条目。

### Step 3：编写并测试

1. 在 `combatd.c` 顶部声明 `damage_msgs` mapping
2. 重写 `damage_msg()` 函数
3. 用 `eval` 命令逐类型测试各级描述是否正确输出
4. 进入实战测试，观察实际战斗消息

### Step 4：清理

删除原 switch-case 代码，确认无其他文件直接引用旧结构。

---

## 四、风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 消息文本迁移遗漏 | 中 | 逐类型对比原文本，确保无遗漏 |
| 阈值变化影响体验 | 低 | 5-10 的阈值差异在实战中几乎无感知 |
| 其他代码依赖 damage_msg 签名 | 低 | 函数签名不变，仅内部实现改变 |
| 8 级压缩为 6 级丢失描述 | 低 | 合并相似描述，保留区分度 |

---

## 五、工时估算

| 步骤 | 工时 |
|------|------|
| 提取 + 整理消息文本 | 1h |
| 编写 mapping + 重写函数 | 30min |
| 测试验证 | 30min |
| **合计** | **2h** |

---

## 六、后续扩展

数据驱动化后可低成本实现：
- **消息分级显示**（创意池 #2）：根据 `env/brief_message` 截取前 N 级描述
- **门派特色消息**（创意池 #16）：按门派覆盖默认描述
- **新伤害类型**：新增武功时直接追加 mapping 条目，无需改函数
