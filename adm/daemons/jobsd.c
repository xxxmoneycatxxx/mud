/**
 * @file jobsd.c
 * @brief 统一任务追踪守护进程 — 只读聚合各任务系统数据
 * @version 1.0
 *
 * 聚合以下四类任务：
 *   1. 师门任务 (family)  — me->query("quest")
 *   2. 江湖任务 (jianghu) — me->getToDoList() / getSolved()
 *   3. 天书任务 (tianshu) — me->query("tianshu") + 心愿
 *   4. 每日任务 (daily)   — me->query("festival/...")
 *
 * 本 daemon 只读取数据，不修改任何状态。
 */

#include <localtime.h>

inherit F_CLEAN_UP;

// 十四部天书名称（与 tianshu.c 一致）
nosave string *tianshu_books = ({
    "飞狐外传", "雪山飞狐", "连城决", "天龙八部",
    "射雕英雄传", "白马啸西风", "鹿鼎记", "笑傲江湖",
    "书剑恩仇录", "神雕侠侣", "侠客行", "倚天屠龙记",
    "碧血剑", "鸳鸯刀",
});

void create()
{
    seteuid(getuid());
}

// ============================================================
//  师门任务
// ============================================================
public mapping query_family_quest(object me)
{
    mapping q;
    int quest_count;
    mapping result;

    if (!objectp(me))
        return ([]);

    result = (["active": 0, "data": 0, "count": 0]);

    quest_count = (int)me->query("quest_count");
    result["count"] = quest_count;

    q = me->query("quest");
    if (mapp(q) && q["type"])
    {
        result["active"] = 1;
        result["data"] = ([
            "type"       : q["type"],
            "master_name": q["master_name"] || "",
            "name"       : q["name"] || "",
            "id"         : q["id"] || "",
            "place"      : q["place"] || "",
            "family"     : q["family"] || "",
            "limit"      : q["limit"] || 0,
        ]);
    }

    return result;
}

// ============================================================
//  江湖任务
// ============================================================
public mapping query_jianghu_jobs(object me)
{
    mapping toDoList;
    string *solved;
    string *keys;
    mixed *todo_list;
    int i, size;
    mapping result;

    if (!objectp(me))
        return ([]);

    result = (["todo": ({}), "solved_count": 0]);

    // 进行中任务
    toDoList = me->getToDoList();
    if (mapp(toDoList) && sizeof(toDoList))
    {
        keys = keys(toDoList);
        size = sizeof(keys);
        todo_list = allocate(size);
        for (i = 0; i < size; i++)
        {
            object qob;
            catch(qob = load_object(keys[i]));
            if (objectp(qob))
            {
                todo_list[i] = ([
                    "name"  : remove_ansi(qob->getName()) || "",
                    "level" : qob->getLevel() || 0,
                ]);
                destruct(qob);
            }
            else
            {
                todo_list[i] = ([
                    "name"  : keys[i],
                    "level" : 0,
                ]);
            }
        }
        result["todo"] = todo_list;
    }

    // 已完成任务数
    solved = me->getSolved();
    if (arrayp(solved))
        result["solved_count"] = sizeof(solved);

    return result;
}

// ============================================================
//  天书任务
// ============================================================
public mapping query_tianshu_job(object me)
{
    string current;
    mapping sub_task;
    string *completed;
    int i, completed_count;
    mapping result;

    if (!objectp(me))
        return ([]);

    result = (["current": 0, "sub_task": 0, "completed": ({}),
               "completed_count": 0, "total": sizeof(tianshu_books)]);

    // 当前进行的天书
    current = me->query("tianshu");
    if (stringp(current) && current != "")
    {
        // 如果该天书已完成（值为 int 1），则视为无进行中
        if (me->query(current))
            result["current"] = 0;  // 刚完成，尚未选择新的
        else
            result["current"] = current;
    }

    // 当前子任务
    sub_task = me->query("心愿");
    if (mapp(sub_task) && sub_task["class"])
    {
        string desc;
        switch (sub_task["class"])
        {
        case "kill":
            desc = "杀 " + sub_task["name"];
            break;
        case "find":
            desc = "找 " + sub_task["name"];
            break;
        case "song":
            desc = "送信给 " + sub_task["name"];
            break;
        case "baohu":
            desc = "保护 " + me->query("xiansuo");
            break;
        default:
            desc = sub_task["name"];
            break;
        }
        result["sub_task"] = ([
            "class": sub_task["class"],
            "name" : sub_task["name"],
            "desc" : desc,
            "knower": me->query("xiansuo") || "",
        ]);
    }

    // 已完成的天书
    completed = ({});
    completed_count = 0;
    for (i = 0; i < sizeof(tianshu_books); i++)
    {
        if (me->query(tianshu_books[i]))
        {
            completed += ({tianshu_books[i]});
            completed_count++;
        }
    }
    result["completed"] = completed;
    result["completed_count"] = completed_count;

    return result;
}

// ============================================================
//  每日任务
// ============================================================
public mapping query_daily_jobs(object me)
{
    int *date;
    int year, month, day;
    string festival;
    int done;
    mapping result;

    if (!objectp(me))
        return ([]);

    result = (["wumiao": 0]);

    date = localtime(time());
    year = date[LT_YEAR];
    month = date[LT_MON] + 1;
    day = date[LT_MDAY];

    festival = "festival/" + year + "/" + month;
    done = ((int)me->query(festival) == day) ? 1 : 0;
    result["wumiao"] = done;

    return result;
}

// ============================================================
//  聚合接口：返回全部任务摘要
// ============================================================
public mapping query_all_jobs(object me)
{
    mapping family, jianghu, tianshu, daily;

    if (!objectp(me))
        return ([]);

    // 各子系统独立获取，互不影响
    catch(family = query_family_quest(me));
    if (!mapp(family)) family = (["active": 0, "data": 0, "count": 0]);

    catch(jianghu = query_jianghu_jobs(me));
    if (!mapp(jianghu)) jianghu = (["todo": ({}), "solved_count": 0]);

    catch(tianshu = query_tianshu_job(me));
    if (!mapp(tianshu)) tianshu = (["current": 0, "sub_task": 0,
                                    "completed": ({}), "completed_count": 0,
                                    "total": sizeof(tianshu_books)]);

    catch(daily = query_daily_jobs(me));
    if (!mapp(daily)) daily = (["wumiao": 0]);

    return ([
        "family"  : family,
        "jianghu" : jianghu,
        "tianshu" : tianshu,
        "daily"   : daily,
    ]);
}
