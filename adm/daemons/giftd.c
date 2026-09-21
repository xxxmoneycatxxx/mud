// giftd.c
// Written by Vin for Heros.cn 2002/07/14.

#include <ansi.h>
#include <quest.h>
#include <localtime.h>

inherit F_DBASE;
inherit F_CLEAN_UP;

#define TIME "/cmds/usr/time"

// 动态奖励基数：节假日/周末自动提升奖励比例
nosave int cached_scale;
nosave int cached_scale_day;
nosave int admin_scale;         // 管理员手动设置的基数(0=未设置)

// 公历节日及其奖励基数
nosave mapping *solar_holidays = ({
    ([ "month" :  1, "day" :  1, "scale" : 400, "name" : "元旦" ]),
    ([ "month" :  5, "day" :  1, "scale" : 300, "name" : "劳动节" ]),
    ([ "month" : 10, "day" :  1, "scale" : 400, "name" : "国庆节" ]),
});

// 农历节日及其奖励基数
nosave mapping *lunar_holidays = ({
    ([ "month" :  1, "day" :  1, "scale" : 400, "name" : "春节" ]),
    ([ "month" :  1, "day" : 15, "scale" : 200, "name" : "元宵节" ]),
    ([ "month" :  5, "day" :  5, "scale" : 300, "name" : "端午节" ]),
    ([ "month" :  8, "day" : 15, "scale" : 200, "name" : "中秋节" ]),
});

// 定义提供给外部调用的接口函数
varargs public void bonus(object who, mapping b, int flag);
varargs public void freequest_bonus(object who);
varargs public void gift_bonus(object who, mapping b);
varargs public void work_bonus(object who, mapping b);
public void delay_bonus(object who, mapping b);
public void delay_freequest_bonus(object who);
public void delay_gift_bonus(object who, mapping b);
public void delay_work_bonus(object who, mapping b);
public int query_reward_scale();
public string query_reward_info();
public int set_reward_scale(int scale, object who);

void create()
{
    seteuid(getuid());
    set("channel_id", "奖励精灵");
    set_heart_beat(900);
}

// ----------------------------------------------------------------
// 动态奖励基数系统
// ----------------------------------------------------------------

/// 返回当前日期的奖励基数（百分比：100=普通, 150=周末, 200~400=节日）
public int query_reward_scale()
{
    int *date;
    int year, month, day, wday;
    int lunar_m, lunar_d;
    int scale;
    int i;

    // 管理员手动覆盖
    if (admin_scale > 0)
        return admin_scale;

    // 当天已计算则使用缓存
    day = localtime(time())[LT_MDAY];
    if (cached_scale_day == day)
        return cached_scale;

    date = localtime(time());
    year = date[LT_YEAR];
    month = date[LT_MON] + 1;
    day = date[LT_MDAY];
    wday = date[LT_WDAY];

    scale = 100;

    // 周末 150%
    if (wday == 0 || wday == 6)
        scale = 150;

    // 公历节日（取最高倍数）
    for (i = 0; i < sizeof(solar_holidays); i++)
    {
        if (solar_holidays[i]["month"] == month &&
            solar_holidays[i]["day"] == day &&
            solar_holidays[i]["scale"] > scale)
            scale = solar_holidays[i]["scale"];
    }

    // 农历节日（取最高倍数）
    sscanf(TIME->to_lunar(year + " " + month + " " + day),
           "%*d-%d-%d", lunar_m, lunar_d);
    for (i = 0; i < sizeof(lunar_holidays); i++)
    {
        if (lunar_holidays[i]["month"] == lunar_m &&
            lunar_holidays[i]["day"] == lunar_d &&
            lunar_holidays[i]["scale"] > scale)
            scale = lunar_holidays[i]["scale"];
    }

    cached_scale = scale;
    cached_scale_day = day;
    return scale;
}

/// 返回今日奖励基数的说明文本
public string query_reward_info()
{
    int *date;
    int year, month, day, wday;
    int lunar_m, lunar_d;
    int scale, i;
    string name;
    string desc;

    date = localtime(time());
    year = date[LT_YEAR];
    month = date[LT_MON] + 1;
    day = date[LT_MDAY];
    wday = date[LT_WDAY];

    if (admin_scale > 0)
        return sprintf("当前奖励基数：%d%%（管理员设定）", admin_scale);

    scale = 100;
    name = "";

    if (wday == 0 || wday == 6)
    {
        scale = 150;
        name = "周末";
    }

    for (i = 0; i < sizeof(solar_holidays); i++)
    {
        if (solar_holidays[i]["month"] == month &&
            solar_holidays[i]["day"] == day &&
            solar_holidays[i]["scale"] > scale)
        {
            scale = solar_holidays[i]["scale"];
            name = solar_holidays[i]["name"];
        }
    }

    sscanf(TIME->to_lunar(year + " " + month + " " + day),
           "%*d-%d-%d", lunar_m, lunar_d);
    for (i = 0; i < sizeof(lunar_holidays); i++)
    {
        if (lunar_holidays[i]["month"] == lunar_m &&
            lunar_holidays[i]["day"] == lunar_d &&
            lunar_holidays[i]["scale"] > scale)
        {
            scale = lunar_holidays[i]["scale"];
            name = lunar_holidays[i]["name"];
        }
    }

    if (scale == 100)
        desc = "今天是普通日子";
    else
        desc = "今天是" + name;

    return sprintf("%s，奖励基数：%d%%", desc, scale);
}

/// 管理员设置奖励基数（50~500），设 0 恢复自动检测
public int set_reward_scale(int scale, object who)
{
    if (scale != 0 && (scale < 50 || scale > 500))
        return notify_fail("奖励基数必须在 50% 到 500% 之间，或设为 0 恢复自动。\n");

    admin_scale = scale;
    cached_scale = 0;
    cached_scale_day = 0;

    if (scale == 0)
        CHANNEL_D->do_channel(this_object(), "sys",
            "奖励基数已恢复自动检测（" + query_reward_info() + "）。");
    else
        CHANNEL_D->do_channel(this_object(), "sys",
            sprintf("管理员%s已将奖励基数调整为 %d%%。",
                    who ? who->name(1) : "系统", scale));

    return 1;
}

/// 对奖励数值应用动态基数缩放
protected void apply_scale(mapping b, int scale)
{
    if (scale == 100) return;
    if (b["exp"])      b["exp"]      = b["exp"]      * scale / 100;
    if (b["pot"])      b["pot"]      = b["pot"]      * scale / 100;
    if (b["mar"])      b["mar"]      = b["mar"]      * scale / 100;
    if (b["shen"])     b["shen"]     = b["shen"]     * scale / 100;
    if (b["score"])    b["score"]    = b["score"]    * scale / 100;
    if (b["weiwang"])  b["weiwang"]  = b["weiwang"]  * scale / 100;
    if (b["gongxian"]) b["gongxian"] = b["gongxian"] * scale / 100;
}

// 延迟奖励：因为有时给出奖励的时候应该是在某些事件发生以后，
// 但是在该事件发生时给与奖励更易于书写程序，所以奖励生成的
// 地方在事件正在发生的时候，但是要让玩家看起来是在事件发生
// 以后。比如杀人，人死亡的时候给与奖励是容易做的，但是我希
// 望玩家在看到NPC 的死亡信息以后才看到奖励的信息，这时候就
// 用delay_bonus了。

public void delay_bonus(object who, mapping b)
{
    who->start_call_out((: call_other, __FILE__, "bonus", who, b :), 1);
}

public void delay_work_bonus(object who, mapping b)
{
    who->start_call_out((: call_other, __FILE__, "work_bonus", who, b :), 1);
}

public void delay_freequest_bonus(object who)
{
    who->start_call_out((: call_other, __FILE__, "freequest_bonus", who :), 3);
}

public void delay_gift_bonus(object who, mapping b)
{
    who->start_call_out((: call_other, __FILE__, "gift_bonus", who, b :), 1);
}

// 自由任务的奖励
varargs public void bonus(object who, mapping b, int flag)
{
    int exp;                // 奖励的经验
    int pot;                // 奖励的潜能
    int mar;                // 奖励的实战体会
    int shen;               // 奖励的神
    int score;              // 奖励的江湖阅历
    int weiwang;            // 奖励的江湖威望
    int gongxian;           // 奖励的门派贡献
    int pot_limit;          // 潜能的界限
    int mar_limit;          // 实战体会的界限
    int percent;            // 奖励的有效百分比
    int scale;              // 动态奖励基数
    string msg;             // 奖励的描述信息
    string league_name;
    int weiwang2, league_weiwang;

    league_weiwang = who->query("league/set/weiwang");
    // 获得奖励的百分比
    percent = b["percent"];
    if (percent < 1 || percent > 100)
        percent = 100;

    exp = b["exp"] * percent / 100;
    pot = b["pot"] * percent / 100;
    mar = b["mar"] * percent / 100;
    shen = b["shen"] * percent / 100;
    score = b["score"] * percent / 100;
    weiwang = b["weiwang"] * percent / 100;
    gongxian = b["gongxian"] * percent / 100;

    // 应用动态奖励基数
    scale = query_reward_scale();
    if (scale != 100)
    {
        exp      = exp      * scale / 100;
        pot      = pot      * scale / 100;
        mar      = mar      * scale / 100;
        shen     = shen     * scale / 100;
        score    = score    * scale / 100;
        weiwang  = weiwang  * scale / 100;
        gongxian = gongxian * scale / 100;
    }

    // 玩家经验太高，削弱奖励。
    if (who->query("combat_exp") >= 3000000)
    {
        exp /= 8;
        pot /= 8;
        mar /= 8;
    }
    else if (who->query("combat_exp") >= 2000000)
    {
        exp /= 4;
        pot /= 4;
        mar /= 4;
    }
    else if (who->query("combat_exp") >= 1000000)
    {
        exp /= 2;
        pot /= 2;
        mar /= 2;
    }

    if (! flag)
    {
        pot_limit = who->query_potential_limit() - who->query("potential");
        if (pot > pot_limit) pot = pot_limit;
        if (pot < 1) pot = 0;

        mar_limit = who->query_experience_limit() - who->query("experience");
        if (mar > mar_limit) mar = mar_limit;
        if (mar < 1) mar = 0;
    }
    else
    {
        if (who->query_potential_limit() < who->query("potential"))
            pot = 1 + random(2);

        if (who->query_experience_limit() < who->query("experience"))
            mar = 1;
    }

    // 生成提示信息
    if (stringp(msg = b["prompt"]))
        msg = HIG + msg + HIG "，你获得了";
    else
        msg = HIG "通过这次锻炼，你获得了";

    if (exp > 0) msg += chinese_number(exp) + "点经验、";
    if (pot > 0) msg += chinese_number(pot) + "点潜能、";
    if (mar > 0) msg += chinese_number(mar) + "点实战体会、";
    if (shen > 0) msg += chinese_number(shen) + "点正神、";
    if (shen < 0) msg += chinese_number(-shen) + "点负神、";
    if (score > 0) msg += chinese_number(score) + "点江湖阅历、";

    if (stringp(league_name = who->query("league/league_name"))
        && league_weiwang)
    {
        if (weiwang > 0)
        {
            weiwang2 = weiwang * league_weiwang / 100;
            weiwang = weiwang - weiwang2;
            if (weiwang <= 0 )weiwang = 0;
            if (weiwang > 0)msg += chinese_number(weiwang) + "点江湖威望、";
            msg += "你所在同盟的威望提升了" + chinese_number(weiwang2) + "点，";
        }
    }
    else if (weiwang > 0)
        msg += chinese_number(weiwang) + "点江湖威望，";

    msg += "能力得到了提升。\n" NOR;
    tell_object(who, sort_msg(msg));

    // bonus
    who->add("combat_exp", exp);
    who->add("potential", pot);
    who->add("experience", mar);
    who->add("shen", shen);
    who->add("score", score);
    who->add("weiwang", weiwang);
    if (weiwang2 > 0)LEAGUE_D->add_league_fame(league_name, weiwang2);
    who->add("gongxian", gongxian);
}

// 普通工作任务的奖励
varargs public void work_bonus(object who, mapping b, int flag)
{
    int exp;                // 奖励的经验
    int pot;                // 奖励的潜能
    int mar;                // 奖励的实战体会
    int shen;               // 奖励的神
    int score;              // 奖励的江湖阅历
    int weiwang;            // 奖励的江湖威望
    int gongxian;           // 奖励的门派贡献
    int pot_limit;          // 潜能的界限
    int mar_limit;          // 实战体会的界限
    int percent;            // 奖励的有效百分比
    int scale;              // 动态奖励基数
    string msg;             // 奖励的描述信息
    string league_name;
    int weiwang2, league_weiwang;


    league_weiwang = who->query("league/set/weiwang");
    // 获得奖励的百分比
    percent = b["percent"];
    if (percent < 1 || percent > 100)
            percent = 100;

    exp = b["exp"] * percent / 100;
    pot = b["pot"] * percent / 100;
    mar = b["mar"] * percent / 100;
    shen = b["shen"] * percent / 100;
    score = b["score"] * percent / 100;
    weiwang = b["weiwang"] * percent / 100;
    gongxian = b["gongxian"] * percent / 100;

    // 应用动态奖励基数
    scale = query_reward_scale();
    if (scale != 100)
    {
        exp      = exp      * scale / 100;
        pot      = pot      * scale / 100;
        mar      = mar      * scale / 100;
        shen     = shen     * scale / 100;
        score    = score    * scale / 100;
        weiwang  = weiwang  * scale / 100;
        gongxian = gongxian * scale / 100;
    }

    if (! flag)
    {
        pot_limit = who->query_potential_limit() - who->query("potential");
        if (pot > pot_limit) pot = pot_limit;
        if (pot < 1) pot = 0;

        mar_limit = who->query_experience_limit() - who->query("experience");
        if (mar > mar_limit) mar = mar_limit;
        if (mar < 1) mar = 0;
    }
    else
    {
        if (who->query_potential_limit() < who->query("potential"))
            pot = 1 + random(2);

        if (who->query_experience_limit() < who->query("experience"))
            mar = 1;
    }

    // 生成提示信息
    if (stringp(msg = b["prompt"]))
        msg = HIC "\n" + msg + HIC "，你获得了";
    else
        msg = HIC "\n通过这次锻炼，你获得了";

    if (exp > 0) msg += chinese_number(exp) + "点经验、";
    if (pot > 0) msg += chinese_number(pot) + "点潜能、";
    if (mar > 0) msg += chinese_number(mar) + "点实战体会、";
    if (shen > 0) msg += chinese_number(shen) + "点正神、";
    if (shen < 0) msg += chinese_number(-shen) + "点负神、";
    if (score > 0) msg += chinese_number(score) + "点江湖阅历、";

    if (stringp(league_name = who->query("league/league_name"))
        && league_weiwang)
    {
        if (weiwang > 0)
        {
            weiwang2 = weiwang * league_weiwang / 100;
            weiwang = weiwang - weiwang2;
            if (weiwang <= 0 )weiwang = 0;
            if (weiwang > 0)msg += chinese_number(weiwang) + "点江湖威望、";
            msg += "你所在同盟的威望提升了" + chinese_number(weiwang2) + "点，";
        }
    }
    else if (weiwang > 0)
        msg += chinese_number(weiwang) + "点江湖威望，";

    msg += "能力得到了提升。\n\n" NOR;
    tell_object(who, sort_msg(msg));

    // bonus
    who->add("combat_exp", exp);
    who->add("potential", pot);
    who->add("experience", mar);
    who->add("shen", shen);
    who->add("score", score);
    who->add("weiwang", weiwang);
    if (weiwang2 > 0)LEAGUE_D->add_league_fame(league_name, weiwang2);
    who->add("gongxian", gongxian);
}

// 中断性质自由任务的奖励
varargs public void freequest_bonus(object who)
{
    object gift;
    int quest;              // 当前任务数量
    int exp;                // 奖励的经验
    int pot;                // 奖励的潜能
    int mar;                // 奖励的实战体会
    int scale;              // 动态奖励基数
    string msg;             // 奖励的描述信息

    quest = who->query("quest_count");

    exp = random(quest) + 500;

    // 因为获得奖励较多且无法累及中断任务，所以暂时不做
    // 上限的限制。
    pot = random(quest / 2) + 250;
    mar = random(quest / 2) + 250;

    // 应用动态奖励基数
    scale = query_reward_scale();
    if (scale != 100)
    {
        exp = exp * scale / 100;
        pot = pot * scale / 100;
        mar = mar * scale / 100;
    }

    msg = HIC "\n你在这次的历练过程中，对武学似乎又"
            "有了新的突破。你获得了" +
            chinese_number(exp) + "点经验、" +
            chinese_number(pot) + "点潜能及" +
            chinese_number(mar) + "点实战体会。\n" NOR;

    tell_object(who, sort_msg(msg));

    // bonus
    who->add("combat_exp", exp);
    who->add("potential", pot);
    who->add("experience", mar);
    who->add("quest/freequest", -1);

    if (who->query("quest/freequest") < 1)
    {
        who->delete("quest");
        message_sort(HIW "\n正在这时，只见一位" +
                        who->query("family/family_name") +
                        "弟子急急忙忙赶到$N" HIW "身边，说"
                        "道：“原来你在这里啊，师傅正到处派"
                        "人找你呢。听说有要紧事交给你办，你"
                        "赶快回去吧！这个包裹是师傅让我转交"
                        "给你的。”\n" NOR, who);

        message_sort("\n" + who->query("family/family_name") +
                        "弟子拿出一个包裹递给$N。\n\n" +
                        who->query("family/family_name") +
                        "弟子急急忙忙地离开了。\n" NOR, who);

        gift = new("/clone/fam/bag");
        gift->move(who, 1);
    }
}

// 特殊事件的奖励
varargs public void gift_bonus(object who, mapping b)
{
    int exp;                // 奖励的经验
    int pot;                // 奖励的潜能
    int mar;                // 奖励的实战体会
    int score;              // 奖励的江湖阅历
    int weiwang;            // 奖励的江湖威望
    int gongxian;           // 奖励的门派贡献
    int percent;            // 奖励的有效百分比
    int scale;              // 动态奖励基数
    string msg;             // 奖励的描述信息
    string temp;            // 进程记录信息
    int league_weiwang;     // 分给同盟的威望百分比
    int weiwang2;           // 同盟因该得的威望点
    string league_name;

    league_weiwang = who->query("league/set/weiwang");

    // 获得奖励的百分比
    percent = b["percent"];

    if (percent < 1 || percent > 100)
        percent = 100;

    // 进程记录，针对第一次完成有奖励的情节
    temp = b["temp"];

    exp = b["exp"] * percent / 100;
    pot = b["pot"] * percent / 100;
    mar = b["mar"] * percent / 100;
    score = b["score"] * percent / 100;
    weiwang = b["weiwang"] * percent / 100;
    gongxian = b["gongxian"] * percent / 100;

    // 应用动态奖励基数
    scale = query_reward_scale();
    if (scale != 100)
    {
        exp      = exp      * scale / 100;
        pot      = pot      * scale / 100;
        mar      = mar      * scale / 100;
        score    = score    * scale / 100;
        weiwang  = weiwang  * scale / 100;
        gongxian = gongxian * scale / 100;
    }

    // 生成谣言信息
    if (stringp(msg = b["rumor"]))
    {
        shout(HIR "【武林传闻】" NOR + WHT "听说" +
                who->name() + WHT "[" + who->query("id") +
                WHT "]" + msg + WHT "。\n" NOR);
    }

    if (! stringp(temp) || ! who->query(temp))
    {
        // 生成提示信息
        if (stringp(msg = b["prompt"]))
            msg = HIW "\n" + msg + HIW "，你获得了";
        else
            msg = HIW "\n通过此次经历，你获得了";

        // 记录下进程
        if (stringp(temp))
            who->add(temp, 1);

        if (exp > 0) msg += chinese_number(exp) + "点经验、";
        if (pot > 0) msg += chinese_number(pot) + "点潜能、";
        if (mar > 0) msg += chinese_number(mar) + "点实战体会、";
        if (score > 0) msg += chinese_number(score) + "点江湖阅历、";
        if (gongxian > 0) msg += chinese_number(gongxian) + "点门派贡献、";

        if (stringp(league_name = who->query("league/league_name"))
            && league_weiwang)
        {
            if (weiwang > 0)
            {
                weiwang2 = weiwang * league_weiwang / 100;
                weiwang = weiwang - weiwang2;
                if (weiwang <= 0 )weiwang = 0;
                if (weiwang > 0)msg += chinese_number(weiwang) + "点江湖威望、";
                msg += "你所在同盟的威望提升了" + chinese_number(weiwang2) + "点，";
            }
        }
        else if (weiwang > 0)
            msg += chinese_number(weiwang) + "点江湖威望，";

        msg += "能力得到了提升。\n" NOR;
        tell_object(who, sort_msg(msg));

        // bonus
        who->add("combat_exp", exp);
        who->add("potential", pot);
        who->add("experience", mar);
        who->add("score", score);
        who->add("weiwang", weiwang);
        if (weiwang2 > 0)LEAGUE_D->add_league_fame(league_name, weiwang2);
        who->add("gongxian", gongxian);
    }
}
