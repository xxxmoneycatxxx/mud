#include <ansi.h>

inherit F_CLEAN_UP;

int help(object me);

// 区域名 -> 世界地图入口坐标 {x, y}
// 新增区域只需在此追加一行
mapping recall_map = ([
    "beijing"  : ({69, 47}),
    "changan"  : ({59, 63}),
    "chengdu"  : ({50, 74}),
    "city"     : ({75, 69}),
    "dali"     : ({44, 86}),
    "emei"     : ({50, 75}),
    "foshan"   : ({64, 95}),
    "fuzhou"   : ({74, 86}),
    "guanwai"  : ({81, 41}),
    "gumu"     : ({58, 68}),
    "hangzhou" : ({77, 75}),
    "hengshan" : ({64, 84}),
    "hengyang" : ({64, 84}),
    "huashan"  : ({59, 63}),
    "jiaxing"  : ({77, 75}),
    "jingzhou" : ({62, 75}),
    "kaifeng"  : ({66, 61}),
    "kunlun"   : ({33, 59}),
    "kunming"  : ({47, 90}),
    "lanzhou"  : ({49, 60}),
    "lingjiu"  : ({24, 34}),
    "lingzhou" : ({53, 53}),
    "luoyang"  : ({66, 62}),
    "mingjiao" : ({33, 59}),
    "nanyang"  : ({64, 67}),
    "qingcheng": ({50, 74}),
    "quanzhen" : ({58, 68}),
    "quanzhou" : ({73, 89}),
    "ruzhou"   : ({64, 67}),
    "shaolin"  : ({66, 66}),
    "songshan" : ({66, 66}),
    "suzhou"   : ({76, 73}),
    "taishan"  : ({71, 58}),
    "tianshan" : ({24, 34}),
    "wudang"   : ({61, 68}),
    "wugong"   : ({56, 66}),
    "xiangyang": ({62, 70}),
    "xingxiu"  : ({24, 34}),
    "xiyu"     : ({21, 36}),
    "yili"     : ({19, 38}),
    "zhongnan" : ({58, 68}),
]);

// 区域名 -> 中文显示名
mapping recall_names = ([
    "beijing"  : "北  京", "changan"  : "长  安", "chengdu"  : "成  都",
    "city"     : "扬  州", "dali"     : "大  理", "emei"     : "峨眉山",
    "foshan"   : "佛  山", "fuzhou"   : "福  州", "guanwai"  : "关  外",
    "gumu"     : "古  墓", "hangzhou" : "杭  州", "hengshan" : "衡  山",
    "hengyang" : "衡  阳", "huashan"  : "华  山", "jiaxing"  : "嘉  兴",
    "jingzhou" : "荆  州", "kaifeng"  : "开  封", "kunlun"   : "昆仑山",
    "kunming"  : "昆  明", "lanzhou"  : "兰  州", "lingjiu"  : "灵鹫宫",
    "lingzhou" : "灵  州", "luoyang"  : "洛  阳", "mingjiao" : "光明顶",
    "nanyang"  : "南  阳", "qingcheng": "青城山", "quanzhen" : "全真教",
    "quanzhou" : "泉  州", "ruzhou"   : "汝  州", "shaolin"  : "少林寺",
    "songshan" : "嵩  山", "suzhou"   : "苏  州", "taishan"  : "泰  山",
    "tianshan" : "天  山", "wudang"   : "武当山", "wugong"   : "武功镇",
    "xiangyang": "襄  阳", "xingxiu"  : "星宿海", "xiyu"     : "西  域",
    "yili"     : "伊  犁", "zhongnan" : "终南山",
]);

int do_recall(object me, string target);
int show_list(object me);

int main(object me, string arg)
{
    object env = environment(me);
    string outdoors = env->query("outdoors");
    string *no_recall = ({"gaochang"});
    int *coord;

    // 安全检查：对齐 rideto 的限制
    if (me->is_fighting())
        return notify_fail(HIR "战斗中不能使用recall指令！\n" NOR);
    if (me->over_encumbranced())
        return notify_fail(HIR "你的负荷过重，无法传送。\n" NOR);
    if (me->is_busy() || me->query("doing"))
        return notify_fail(HIR "你的动作还没有完成，不能使用recall指令。\n" NOR);
    if (me->is_in_prison())
        return notify_fail(HIR "你正在坐牢呢，不能使用recall指令！\n" NOR);
    if (me->query_condition("killer"))
        return notify_fail(HIR "你有命案在身，不能使用recall指令！\n" NOR);

    // 环境检查（所有用法通用）
    if (!outdoors || member_array(outdoors, no_recall) != -1)
        return notify_fail(HIR "你所在环境不能使用recall指令。\n" NOR);
    if (env->is_area())
        return notify_fail(HIR "你目前不能使用recall指令。\n" NOR);
    if (env->query("maze"))
        return notify_fail(HIR "你目前不能使用recall指令。\n" NOR);

    // recall list - 显示可传送地点列表
    if (arg == "list")
        return show_list(me);

    // recall <地点> - 传送到指定地点
    if (arg && arg != "")
        return do_recall(me, arg);

    // recall (无参数) - 传送到当前区域对应的世界地图入口
    coord = recall_map[outdoors];
    if (!arrayp(coord) || sizeof(coord) != 2)
        return notify_fail(HIR "你所在的区域暂不支持recall指令。\n" NOR);

    message("vision", CYN + me->name() + "身形一晃，施展绝顶轻功，转眼间已没了踪影。\n" NOR,
            environment(me), ({me}));
    tell_object(me, HIC "你暗运真气，施展轻功绝学，身形如电般疾驰而去——\n" NOR
                          "一路跋山涉水，终於到了世界地图的" +
                          (recall_names[outdoors] ? recall_names[outdoors] : "未知区域") +
                          "附近。\n");

    if (area_move(load_object("/world/area/world"), me, coord[0], coord[1]))
    {
        message("vision", CYN + me->name() + "从远处疾步而来，身形微微有些气喘。\n" NOR,
                environment(me), ({me}));
        return 1;
    }
    return 0;
}

// 传送到指定地点
int do_recall(object me, string target)
{
    int *coord;
    string key = 0;

    // 支持中文名称匹配
    foreach (key in keys(recall_names))
        if (recall_names[key] == target || key == target)
            break;

    if (!key)
        return notify_fail(HIR "没有这个目的地，请用 recall list 查看可传送地点。\n" NOR);

    coord = recall_map[key];
    if (!arrayp(coord) || sizeof(coord) != 2)
        return notify_fail(HIR "该目的地暂不可用。\n" NOR);

    message("vision", CYN + me->name() + "身形一晃，施展绝顶轻功，转眼间已没了踪影。\n" NOR,
            environment(me), ({me}));
    tell_object(me, HIC "你暗运真气，施展轻功绝学，朝" + recall_names[key] +
                          "方向疾驰而去——\n" NOR
                          "一路马不停蹄，终於到了" + recall_names[key] + "附近。\n");

    if (area_move(load_object("/world/area/world"), me, coord[0], coord[1]))
    {
        message("vision", CYN + me->name() + "从远处疾步而来，身形微微有些气喘。\n" NOR,
                environment(me), ({me}));
        return 1;
    }
    return 0;
}

// 显示可传送地点列表
int show_list(object me)
{
    string *keys = keys(recall_names);
    string line;
    int i, col;

    write(HIC "\n═══ recall 可传送地点列表 ═══\n\n" NOR);

    keys = sort_array(keys, 1);
    col = 0;
    for (i = 0; i < sizeof(keys); i++)
    {
        line = sprintf("%-10s : %s", keys[i], recall_names[keys[i]]);
        write(line + "    ");
        col++;
        if (col >= 3)
        {
            write("\n");
            col = 0;
        }
    }
    if (col != 0) write("\n");

    write(HIC "\n═══ 共 " + sizeof(keys) + " 个地点 ═══\n" NOR);
    write("\n用法：recall          - 传送到当前区域对应的世界地图入口\n");
    write("      recall <地点>   - 传送到指定地点\n");
    write("      recall list     - 显示本列表\n\n");

    return 1;
}

int help(object me)
{
    write(@HELP
指令格式 : recall [list|<地点>]

这个指令可以将你传送到世界地图上的各个地点。

  recall          传送到当前区域对应的世界地图入口
  recall list     查看所有可传送的地点列表
  recall <地点>   传送到指定地点（支持英文 key 或中文名称）

示例：
  recall beijing   传送到北京
  recall 北  京    传送到北京（中文名称）

使用限制：
  - 必须在室外环境
  - 不能在区域地图、迷宫中使用
  - 战斗中、负重过重、动作未完成、有命案时不能使用

注意：recall 是 rideto 的简化版，落点在世界地图上，
      需要自行步行前往目的地。rideto 需要坐骑但可直达。
HELP
    );
    return 1;
}
