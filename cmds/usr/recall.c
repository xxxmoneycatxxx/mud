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

    if (!outdoors || member_array(outdoors, no_recall) != -1)
        return notify_fail(HIR "你所在环境不能使用recall指令。\n" NOR);
    if (env->is_area())
        return notify_fail(HIR "你目前不能使用recall指令。\n" NOR);
    if (env->query("maze"))
        return notify_fail(HIR "你目前不能使用recall指令。\n" NOR);

    coord = recall_map[outdoors];
    if (!arrayp(coord) || sizeof(coord) != 2)
        return notify_fail(HIR "你所在的区域暂不支持recall指令。\n" NOR);

    message("vision", me->name() + "化作一道光芒消失了。\n",
            environment(me), ({me}));
    tell_object(me, "你凝神运气，身形一晃，瞬间转移到了一处新地方。\n");

    if (area_move(load_object("/world/area/world"), me, coord[0], coord[1]))
    {
        message("vision", me->name() + "凭空出现在这里。\n",
                environment(me), ({me}));
        return 1;
    }
    return 0;
}

int help(object me)
{
    write(@HELP
指令格式 : recall

这个指令可以将你瞬间传送到当前所在区域的世界地图入口处。

使用限制：
  - 必须在室外环境
  - 不能在区域地图、迷宫中使用
  - 战斗中、负重过重、动作未完成时不能使用

注意：并非所有区域都支持此指令。
HELP
    );
    return 1;
}
