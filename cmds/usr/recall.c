#include <ansi.h>

inherit F_CLEAN_UP;

int help(object me);

// 区域名 -> 入口房间路径
// 新增区域只需在此追加一行
mapping recall_map = ([
    "beijing"  : "/d/beijing/tiananmen",
    "changan"  : "/d/changan/bridge2",
    "chengdu"  : "/d/chengdu/guangchang",
    "city"     : "/d/city/guangchang",
    "dali"     : "/d/dali/center",
    "emei"     : "/d/emei/huayanding",
    "foshan"   : "/d/foshan/street3",
    "fuzhou"   : "/d/fuzhou/dongjiekou",
    "guanwai"  : "/d/guanwai/jishi",
    "gumu"     : "/d/gumu/mumen",
    "hangzhou" : "/d/hangzhou/road10",
    "hengshan" : "/d/hengyang/nantian",
    "hengyang" : "/d/hengyang/hengyang",
    "huashan"  : "/d/huashan/shaluo",
    "jiaxing"  : "/d/quanzhou/jiaxing",
    "jingzhou" : "/d/jingzhou/guangchang",
    "kaifeng"  : "/d/kaifeng/zhuque",
    "kunlun"   : "/d/kunlun/klshanlu",
    "kunming"  : "/d/kunming/jinrilou",
    "lanzhou"  : "/d/lanzhou/guangchang",
    "lingjiu"  : "/d/lingjiu/jian",
    "lingzhou" : "/d/lingzhou/center",
    "luoyang"  : "/d/luoyang/center",
    "mingjiao" : "/d/mingjiao/shanjiao",
    "nanyang"  : "/d/shaolin/nanyang",
    "qingcheng": "/d/qingcheng/qcroad1",
    "quanzhen" : "/d/quanzhen/damen",
    "quanzhou" : "/d/quanzhou/zhongxin",
    "ruzhou"   : "/d/kaifeng/zhuque",
    "shaolin"  : "/d/shaolin/shanmen",
    "songshan" : "/d/songshan/fengchantai",
    "suzhou"   : "/d/suzhou/canlangting",
    "taishan"  : "/d/taishan/taishanjiao",
    "tianshan" : "/d/lingjiu/jian",
    "wudang"   : "/d/wudang/jiejianyan",
    "wugong"   : "/d/quanzhen/zhongxin",
    "xiangyang": "/d/xiangyang/guangchang",
    "xingxiu"  : "/d/xiyu/xxh1",
    "xiyu"     : "/d/xiyu/xxh1",
    "yili"     : "/d/xiyu/xxh1",
    "zhongnan" : "/d/quanzhen/shanjiao",
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
    object room;
    string where;

    // 安全检查
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

    // recall (无参数) - 传送到当前区域对应的入口
    if (!recall_map[outdoors])
        return notify_fail(HIR "你所在的区域暂不支持recall指令。\n" NOR);

    room = get_object(recall_map[outdoors]);
    if (!room)
        return notify_fail(HIR "目的地出现异常，请通知巫师处理。\n" NOR);

    where = room->query("short");
    message("vision", CYN + me->name() + "身形一晃，施展绝顶轻功，转眼间已没了踪影。\n" NOR,
            environment(me), ({me}));
    tell_object(me, HIC "你暗运真气，施展轻功绝学，身形如电般疾驰而去——\n" NOR
                          "一路跋山涉水，终於到了" + where + "。\n");

    if (!me->move(room))
    {
        tell_object(me, HIR "传送途中出了岔子，传送失败！\n" NOR);
        return 0;
    }

    message("vision", CYN + me->name() + "从远处疾步而来，身形微微有些气喘。\n" NOR,
            environment(me), ({me}));
    return 1;
}

// 传送到指定地点
int do_recall(object me, string target)
{
    string found_key = 0;
    object room;
    string where;

    // 支持中文名称匹配（修复：使用独立变量保存匹配结果）
    foreach (string k in keys(recall_names))
    {
        if (recall_names[k] == target || k == target)
        {
            found_key = k;
            break;
        }
    }

    if (!found_key)
        return notify_fail(HIR "没有这个目的地，请用 recall list 查看可传送地点。\n" NOR);

    room = get_object(recall_map[found_key]);
    if (!room)
        return notify_fail(HIR "该目的地出现异常，请通知巫师处理。\n" NOR);

    where = room->query("short");
    message("vision", CYN + me->name() + "身形一晃，施展绝顶轻功，转眼间已没了踪影。\n" NOR,
            environment(me), ({me}));
    tell_object(me, HIC "你暗运真气，施展轻功绝学，朝" + recall_names[found_key] +
                          "方向疾驰而去——\n" NOR
                          "一路马不停蹄，终於到了" + where + "。\n");

    if (!me->move(room))
    {
        tell_object(me, HIR "传送途中出了岔子，传送失败！\n" NOR);
        return 0;
    }

    message("vision", CYN + me->name() + "从远处疾步而来，身形微微有些气喘。\n" NOR,
            environment(me), ({me}));
    return 1;
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
    write("\n用法：recall          - 传送到当前区域对应的入口\n");
    write("      recall <地点>   - 传送到指定地点\n");
    write("      recall list     - 显示本列表\n\n");

    return 1;
}

int help(object me)
{
    write(@HELP
指令格式 : recall [list|<地点>]

这个指令可以将你直接传送到各个区域的入口房间。

  recall          传送到当前区域对应的入口
  recall list     查看所有可传送的地点列表
  recall <地点>   传送到指定地点（支持英文 key 或中文名称）

示例：
  recall beijing   传送到北京
  recall 北  京    传送到北京（中文名称）

使用限制：
  - 必须在室外环境
  - 不能在区域地图、迷宫中使用
  - 战斗中、负重过重、动作未完成、有命案时不能使用

注意：recall 会直接传送到目的地的入口房间，无需坐骑。
      与 rideto 不同，rideto 需要坐骑但支持更多特殊目的地。
HELP
    );
    return 1;
}
