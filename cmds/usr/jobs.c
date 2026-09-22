/**
 * @file jobs.c
 * @brief 统一任务追踪命令 — 汇总显示所有任务进度
 *
 * 指令格式：
 *   jobs              显示全部任务
 *   jobs family       仅师门任务
 *   jobs jianghu      仅江湖任务
 *   jobs tianshu      仅天书任务
 *   jobs daily        仅每日任务
 */

#include <ansi.h>

inherit F_CLEAN_UP;

// 前向声明
void show_all(object me, mapping jobs);
void show_family(object me, mapping family);
void show_jianghu(object me, mapping jianghu);
void show_tianshu(object me, mapping tianshu);
void show_daily(object me, mapping daily);

int main(object me, string arg)
{
    mapping jobs;
    object jobsd;

    jobsd = find_object(JOBS_D);
    if (!jobsd)
        jobsd = load_object(JOBS_D);

    if (!jobsd)
        return notify_fail("任务精灵尚未启动。\n");

    jobs = jobsd->query_all_jobs(me);
    if (!mapp(jobs))
        return notify_fail("无法获取任务数据。\n");

    if (!arg || arg == "")
    {
        show_all(me, jobs);
    }
    else if (arg == "family")
    {
        show_family(me, jobs["family"]);
    }
    else if (arg == "jianghu")
    {
        show_jianghu(me, jobs["jianghu"]);
    }
    else if (arg == "tianshu")
    {
        show_tianshu(me, jobs["tianshu"]);
    }
    else if (arg == "daily")
    {
        show_daily(me, jobs["daily"]);
    }
    else
    {
        notify_fail("指令格式：jobs [family|jianghu|tianshu|daily]\n");
        return 0;
    }

    return 1;
}

// ============================================================
//  全部任务总览
// ============================================================
void show_all(object me, mapping jobs)
{
    string msg;
    mapping family, jianghu, tianshu, daily;
    mixed *todo;
    string *completed;
    int i, size;

    family  = jobs["family"]  || ([]);
    jianghu = jobs["jianghu"] || ([]);
    tianshu = jobs["tianshu"] || ([]);
    daily   = jobs["daily"]   || ([]);

    msg = HIB "╭" + repeat_string("═", 58) + "╮\n" NOR;
    msg += HIB "║" NOR + sprintf(" %-56s", "任 务 总 览") + HIB "║\n" NOR;
    msg += HIB "╠" + repeat_string("═", 58) + "╣\n" NOR;

    // —— 师门任务 ——
    msg += HIB "║" NOR HIR " ■ 师门任务" NOR;
    if (family["active"])
    {
        mapping qd = family["data"];
        if (qd["type"] == "kill")
            msg += sprintf(" %-44s", 
                qd["master_name"] + "吩咐杀" + qd["name"]);
        else if (qd["type"] == "letter")
            msg += sprintf(" %-44s",
                qd["master_name"] + "吩咐送信给" + qd["name"]);
        else
            msg += sprintf(" %-44s", "任务进行中");
    }
    else
        msg += sprintf(" %-48s", "暂无");
    msg += HIB "║\n" NOR;
    if ((int)family["count"] > 0)
        msg += HIB "║" NOR sprintf("   连续完成: %d 个                                    %-28s",
            family["count"], "") + HIB "║\n" NOR;

    msg += HIB "║" NOR + HIY + repeat_string("─", 58) + HIB "║\n" NOR;

    // —— 江湖任务 ——
    todo = jianghu["todo"];
    size = arrayp(todo) ? sizeof(todo) : 0;
    msg += HIB "║" NOR HIG " ■ 江湖任务" NOR;
    msg += sprintf(" (%d 项进行中)                              ", size);
    msg += HIB "║\n" NOR;
    if (size > 0)
    {
        for (i = 0; i < size && i < 3; i++)
        {
            msg += HIB "║" NOR sprintf("   %d. %-20s (Lv.%-2d)                     %-18s",
                i + 1, todo[i]["name"], todo[i]["level"], "") + HIB "║\n" NOR;
        }
        if (size > 3)
            msg += HIB "║" NOR sprintf("   ... 还有 %d 项，使用 quest2 查看详情              ",
                size - 3) + HIB "║\n" NOR;
    }
    else
        msg += HIB "║" NOR "   暂无进行中的江湖任务                                " + HIB "║\n" NOR;
    msg += HIB "║" NOR sprintf("   已完成: %d 项                                     ",
        (int)jianghu["solved_count"]) + HIB "║\n" NOR;

    msg += HIB "║" NOR + HIY + repeat_string("─", 58) + HIB "║\n" NOR;

    // —— 天书任务 ——
    msg += HIB "║" NOR HIM " ■ 天书任务" NOR;
    if (tianshu["current"])
    {
        string sub_desc = "";
        if (mapp(tianshu["sub_task"]))
            sub_desc = " | " + tianshu["sub_task"]["desc"];
        msg += sprintf(" %-44s",
            "当前: " + tianshu["current"] + sub_desc);
    }
    else
        msg += sprintf(" %-48s", "未开始");
    msg += HIB "║\n" NOR;

    completed = tianshu["completed"];
    if (arrayp(completed) && sizeof(completed) > 0)
    {
        string book_list = "";
        for (i = 0; i < sizeof(completed); i++)
        {
            if (i > 0) book_list += "、";
            book_list += completed[i];
        }
        msg += HIB "║" NOR sprintf("   进度: %d/14 (%s)",
            (int)tianshu["completed_count"], book_list);
        // 补齐空格到58字符宽
        {
            int pad = 56 - strwidth(sprintf("   进度: %d/14 (%s)",
                (int)tianshu["completed_count"], book_list));
            if (pad > 0)
                msg += sprintf("%-*s", pad, "");
        }
        msg += HIB "║\n" NOR;
    }
    else
        msg += HIB "║" NOR "   进度: 0/14                                           " + HIB "║\n" NOR;

    msg += HIB "║" NOR + HIY + repeat_string("─", 58) + HIB "║\n" NOR;

    // —— 每日任务 ——
    msg += HIB "║" NOR HIC " ■ 每日任务" NOR;
    if (daily["wumiao"])
        msg += sprintf(" %-46s", "武庙祈福: " + HIG + "已完成" + NOR);
    else
        msg += sprintf(" %-46s", "武庙祈福: " + HIR + "未领取" + NOR);
    msg += HIB "║\n" NOR;

    msg += HIB "╰" + repeat_string("═", 58) + "╯\n" NOR;

    write(msg);
}

// ============================================================
//  单独显示各子系统
// ============================================================
void show_family(object me, mapping family)
{
    string msg;

    msg = HBRED "\n= 师门任务 =" NOR "\n";
    if ((int)family["count"] > 0)
        msg += sprintf("你已经连续完成了 %d 个。\n", family["count"]);

    if (family["active"] && mapp(family["data"]))
    {
        mapping qd = family["data"];
        switch (qd["type"])
        {
        case "kill":
            msg += qd["master_name"] + "吩咐你在" +
                   CHINESE_D->chinese_monthday(qd["limit"]) +
                   "之前割下" HIR + qd["name"] + NOR +
                   "(" + HIG + qd["id"] + NOR + ")的人头，回" +
                   qd["family"] + "交差。\n" +
                   "据说此人前不久曾经在" + HIC + qd["place"] + NOR + "出没。\n";
            break;
        case "letter":
            msg += qd["master_name"] + "吩咐你在" +
                   CHINESE_D->chinese_monthday(qd["limit"]) +
                   "之前把信件送到" HIC + qd["name"] + NOR +
                   "(" + HIG + qd["id"] + NOR + ")手中，取回执交差。\n" +
                   "据说此人前不久曾经在" + HIC + qd["place"] + NOR + "出没。\n";
            break;
        default:
            msg += "任务进行中。\n";
            break;
        }
    }
    else
        msg += "你现在没有领任何师门任务。\n";

    write(msg);
}

void show_jianghu(object me, mapping jianghu)
{
    // 直接委托给 quest2 命令
    write("请使用 " HIY "quest2" NOR " 命令查看江湖任务详情。\n");
}

void show_tianshu(object me, mapping tianshu)
{
    // 直接委托给 tianshu 命令
    write("请使用 " HIY "tianshu status" NOR " 命令查看天书任务详情。\n");
}

void show_daily(object me, mapping daily)
{
    string msg;

    msg = HBYEL "\n= 每日任务 =" NOR "\n";
    msg += "扬州武庙二楼祈福：";
    if (daily["wumiao"])
        msg += HIG "已完成" NOR "。\n";
    else
        msg += HIR "未领取" NOR "。\n";

    write(msg);
}

int help(object me)
{
    write(@HELP
指令格式：jobs [family|jianghu|tianshu|daily]

不加参数则显示全部任务进度总览。
加参数可单独查看某一类任务的详细信息。

任务类型：
  family   师门任务（向门派师长领取）
  jianghu  江湖任务（笑傲江湖任务系统）
  tianshu  天书任务（十四部天书收集）
  daily    每日任务（武庙祈福等）
HELP);
    return 1;
}
