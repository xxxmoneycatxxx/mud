#include <ansi.h>
#include <localtime.h>

inherit ROOM;

#define TIME "/cmds/usr/time"
#define GIFT "/clone/fam/max/naobaijin"

void create()
{
    set("short", "武庙二楼");
    set("long", @LONG
这里是岳王庙的二楼，这里供的是岳飞的长子岳云和义子
张宪，两尊塑像金盔银铠，英气勃勃。听说在炎黄子孙的传统
节假日来这里祈祷(指令：pray)会得到祝福。
LONG);
    set("no_fight", 1);
    set("no_steal", 1);
    set("no_beg", 1);
    set("no_sleep_room", 1);

    set("exits", ([
        "down" : __DIR__"wumiao",
    ]));

    set("objects", ([
        "/adm/daemons/task/npc/zixu" : 1,
    ]));
    setup();
}

void init()
{
    add_action("do_pray", "pray");
}

int do_pray(string arg)
{
    object me = this_player();
    int exp, pot, day, month, year, *date;
    string festival;
    int scale, i;

    date = localtime(time());
    year = date[LT_YEAR];
    month = date[LT_MON] + 1;
    day = date[LT_MDAY];

    exp = me->query("combat_exp");

    festival = "festival/" + year + "/" + month;

    if (me->is_busy())
    {
        return notify_fail("你现在正忙着呢，没法静下心来祈祷。\n");
    }

    message_vision(HIG "$N" HIG "跪在神像前，恭恭敬敬的磕了三个响头，然后默默的祈祷着。\n" NOR, me);

    if (me->query(festival) == day)
    {
        return notify_fail(HIR "但是你今天已经被祝福过了（请明天再来吧）。\n" NOR);
    }
    else
    {
        // 使用全局动态奖励基数（祈祷基础倍率 2x）
        scale = GIFT_D->query_reward_scale();
        i = scale / 100 * 2;
        if (i < 2) i = 2;

        // 节日提示
        if (scale > 100)
        {
            string info = GIFT_D->query_reward_info();
            tell_object(me, HIM + info + "，奖励提升^_^\n" NOR);
        }

        // 农历节日额外赠送礼物
        {
            int lunar_m, lunar_d;
            sscanf(TIME->to_lunar(year + " " + month + " " + day), "%*d-%d-%d", lunar_m, lunar_d);
            if (scale >= 200 && exp >= 100000)
            {
                object gift = new(GIFT);
                gift->move(me);
                tell_object(me, "你得到节日礼物" + gift->short() + "^_^\n");
            }
        }

        // 增加积分
        me->add("state/jifen", i);
        // 记录祈福次数
        me->add("state/pray", 1);

        // 潜能下限5K
        pot = exp / 100;
        if (pot < 5000)
            pot = 5000;

        // 按奖励基数缩放，上限5万
        pot *= i;
        if (pot > 50000)
            pot = 50000;

        pot = me->improve_potential(pot);
        if (me->query("skybook/guard/death") < i)
            me->set("skybook/guard/death", i);
        me->set(festival, day);
        // 祈福完成后，主动推送 GMCP 任务数据以更新客户端任务面板
        if (userp(me) && interactive(me))
            me->gmcp_quest_update();
        message_vision(HIW "$N获得了" + chinese_number(pot) + "点潜能奖励和" + chinese_number(i) + "点积分。\n" NOR, me);
        me->start_busy(3);
    }

    return 1;
}
