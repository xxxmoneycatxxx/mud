// reward_scale.c
// 查看或设置全局动态奖励基数

#include <ansi.h>

inherit F_CLEAN_UP;

int main(object me, string arg)
{
    object giftd;
    int scale;

    giftd = find_object(GIFT_D);
    if (!giftd)
        return notify_fail("奖励精灵尚未启动。\n");

    if (!arg)
    {
        write(HIC "【动态奖励基数】" NOR + giftd->query_reward_info() + "\n");
        return 1;
    }

    if (arg == "reset" || arg == "0")
    {
        giftd->set_reward_scale(0, me);
        write(HIG "奖励基数已恢复自动检测。\n" NOR);
        return 1;
    }

    scale = to_int(arg);
    if (scale < 50 || scale > 500)
        return notify_fail("格式：reward_scale [50-500|reset]\n"
                           "当前：" + giftd->query_reward_info() + "\n");

    giftd->set_reward_scale(scale, me);
    write(HIG "奖励基数已设置为 " + scale + "%。\n" NOR);
    return 1;
}

int help(object me)
{
    write(@HELP
指令格式 : reward_scale [数值|reset]

查看或设置当前全局奖励基数。

不带参数：查看当前奖励基数（根据日期自动计算）。
reward_scale 200  ：手动设置为 200%。
reward_scale reset：恢复自动检测。

基数范围：50% ~ 500%，设 0 或 reset 恢复自动。
自动检测规则：
  普通日 100%  周末 150%
  端午/中秋/元宵 200%  劳动节 300%
  元旦/国庆/春节 400%
HELP
    );
    return 1;
}
