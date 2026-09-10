#include <combat.h>

#define GMCP_LOG 50

nosave string *gmcp_log = ({});

// msp_oob("!!SOUND(10001.wav L=1 V=100 U=https://mud.ren/storage/wav/)");
void msp_oob(string req)
{
#if efun_defined(telnet_msp_oob)
    efun::telnet_msp_oob(req);
#else
    receive("<当前驱动不支持efun telnet_msp_oob()>\n");
#endif
}

protected int dump_gmcp_log()
{
    write(implode(gmcp_log, "\n") + "\n");
    return 1;
}

private void log_gmcp(string msg)
{
    gmcp_log = gmcp_log[ < GMCP_LOG..] + ({msg});
}

void send_gmcp(string gmcp)
{
    efun::send_gmcp(gmcp);
}

varargs void sendGMCP(mapping data, mixed *modules...)
{
    if (!has_gmcp())
        return;

    if (!mapp(data) || !sizeof(modules))
    {
        return;
    }
    else
    {
        string msg = implode(modules, ".");
        catch (msg += " " + json_encode(data));
        log_gmcp("Sending: " + msg);
        send_gmcp(msg);
    }
}

private void gmcp_enable()
{
    message("system", "<GMCP negotiation enabled>\n", this_object());
    sendGMCP((["mud_name":MUD_NAME]), "Core", "Hello");
}

// 构建并发送角色状态
protected void send_char_vitals()
{
    object ob = this_object();

    if (!has_gmcp())
    {
        log_gmcp("send_char_vitals: has_gmcp() = false, skipped");
        return;
    }

    mapping my = ob->query_entire_dbase() || ([]);
    // 很奇怪的问题, 得加` || 0`, 否则对0值客户端可能是<userdata 1>
    mapping data = ([
        "hp"         : my["qi"] || 0,
        "max_hp"     : my["max_qi"] || 0,
        "jing"       : my["jing"] || 0,
        "max_jing"   : my["max_jing"] || 0,
        "jingli"     : my["jingli"] || 0,
        "max_jingli" : my["max_jingli"] || 0,
        "neili"      : my["neili"] || 0,
        "max_neili"  : my["max_neili"] || 0,
        "food"       : my["food"] || 0,
        "max_food"   : ob->max_food_capacity(),
        "water"      : my["water"] || 0,
        "max_water"  : ob->max_water_capacity(),
        "exp"        : my["combat_exp"] || 0,
        "pot"        : (int)ob->query("potential") - (int)ob->query("learned_points"),
    ]);
    string msg = "Char.Vitals " + json_encode(data);
    log_gmcp("Sending: " + msg);
    catch(efun::send_gmcp(msg));
}

// 构建并发送角色详细属性（score 命令的结构化数据，供 Web 角色面板使用）
protected void send_char_score()
{
    object ob = this_object();
    mapping my;
    object weapon;
    string skill_type;
    int attack_points, dodge_points, parry_points;

    if (!has_gmcp())
        return;

    my = ob->query_entire_dbase() || ([]);
    if (!mapp(my) || my["max_qi"] < 1)
        return;

    // 战斗攻防计算（复用 score.c 逻辑）
    if (objectp(weapon = ob->query_temp("weapon")))
    {
        skill_type = weapon->query("skill_type");
        attack_points = COMBAT_D->skill_power(ob, skill_type, SKILL_USAGE_ATTACK);
    }
    else
    {
        skill_type = "unarmed";
        attack_points = COMBAT_D->skill_power(ob, "unarmed", SKILL_USAGE_ATTACK);
    }
    parry_points = COMBAT_D->skill_power(ob, "parry", SKILL_USAGE_DEFENSE);
    dodge_points = COMBAT_D->skill_power(ob, "dodge", SKILL_USAGE_DEFENSE);

    mapping data = ([
        // 基本信息
        "name"       : ob->name(1) || "",
        "rank"       : remove_ansi((string)RANK_D->query_rank(ob)) || "",
        "gender"     : my["gender"] || "",
        "age"        : (int)ob->query("age") || 0,
        "born"       : my["born"] || "",
        "born_family": my["born_family"] || "",
        "character"  : my["character"] || "",
        "family"     : mapp(my["family"]) ? (my["family"]["family_name"] || "") : "",
        "master_name": mapp(my["family"]) ? (my["family"]["master_name"] || "") : "",

        // 四维属性（先天 + 有效）
        "str"        : my["str"] || 0,
        "int"        : my["int"] || 0,
        "con"        : my["con"] || 0,
        "dex"        : my["dex"] || 0,
        "eff_str"    : (int)ob->query_str(),
        "eff_int"    : (int)ob->query_int(),
        "eff_con"    : (int)ob->query_con(),
        "eff_dex"    : (int)ob->query_dex(),

        // 战斗数据
        "attack"     : attack_points / 100 + 1,
        "defense"    : (dodge_points + (weapon ? parry_points : parry_points / 10)) / 100 + 1,
        "damage"     : weapon ? ((int)ob->query_temp("apply/damage") || 0) : ((int)ob->query_temp("apply/unarmed_damage") || 0),
        "armor"      : (int)ob->query_temp("apply/armor") || 0,

        // 进度与声望
        "combat_exp" : my["combat_exp"] || 0,
        "gongxian"   : my["gongxian"] || 0,
        "score"      : my["score"] || 0,
        "weiwang"    : my["weiwang"] || 0,
        "shen"       : my["shen"] || 0,

        // 武学评价（opinion 是嵌套 mapping，需逐层读取）
        "op_unarmed" : mapp(my["opinion"]) ? (my["opinion"]["unarmed"] || "") : "",
        "op_weapon"  : mapp(my["opinion"]) ? (my["opinion"]["weapon"] || "") : "",
        "op_force"   : mapp(my["opinion"]) ? (my["opinion"]["force"] || "") : "",
        "op_dodge"   : mapp(my["opinion"]) ? (my["opinion"]["dodge"] || "") : "",

        // 特殊进度
        "breakup"    : (int)my["breakup"],
        "animaout"   : (int)my["animaout"],
        "death"      : (int)my["death"],
        "reborn"     : (int)my["reborn"],
        "reborn_count": (int)ob->query("reborn/count"),

        // 灵慧
        "magic_points"   : my["magic_points"] || 0,
        "magic_learned"  : my["magic_learned"] || 0,
    ]);

    string msg = "Char.Score " + json_encode(data);
    log_gmcp("Sending: " + msg);
    catch(efun::send_gmcp(msg));
}

// 心跳调用：属性签名变化时才推送，实现实时状态栏且避免刷屏
void gmcp_vitals_update()
{
    object ob = this_object();
    mapping my;
    string sig;

    if (!has_gmcp())
        return;

    my = ob->query_entire_dbase();
    if (!mapp(my))
        return;

    sig = sprintf("%d/%d/%d/%d/%d/%d/%d/%d/%d/%d/%d/%d",
        my["qi"], my["max_qi"], my["jing"], my["max_jing"],
        my["jingli"], my["max_jingli"], my["neili"], my["max_neili"],
        my["food"], my["water"], my["combat_exp"],
        (int)ob->query("potential") - (int)ob->query("learned_points"));

    if (sig == ob->query_temp("gmcp_vitals_sig"))
        return;
    ob->set_temp("gmcp_vitals_sig", sig);
    send_char_vitals();
}

// 构建并发送房间信息
protected void send_room_info()
{
    object ob = environment(this_object());
    if (!ob) return;

    if (!has_gmcp())
    {
        log_gmcp("send_room_info: has_gmcp() = false, skipped");
        return;
    }

    mapping exits = ob->query("exits") || ([]);
    mapping exit_targets = ([]);
    foreach (string dir, string target in exits)
    {
        if (stringp(target))
        {
#if defined(__PACKAGE_CRYPTO__) && efun_defined(hash)
            exit_targets[dir] = hash("md5", target);
#else
            exit_targets[dir] = sha1(target);
#endif
        }
    }

    mapping room_info = ([
        "name" : remove_ansi(ob->query("short") || ob->query("name") || ""),
        "exits": keys(exits),
        "exit_targets": exit_targets,
        "area" : ob->query("outdoors") || explode(base_name(ob), "/")[1],
#if defined(__PACKAGE_CRYPTO__) && efun_defined(hash)
        "hash" : hash("md5", base_name(ob))
#else
        "hash" : sha1(base_name(ob))
#endif
    ]);
    string msg = "Room.Info " + json_encode(room_info);
    log_gmcp("Sending: " + msg);
    catch(efun::send_gmcp(msg));
    // 音效示例
    if (room_info["name"] == "树林")
    {
        msp_oob("!!SOUND(10001.wav L=1 V=100 U=https://mud.ren/storage/wav/)");
    }
    else
    {
        msp_oob("!!SOUND(Off)");
    }
}

// 构建并发送帮助主题索引：委托 helpd 执行（gmcp 回调上下文中 read_file/get_dir 权限不足）
// 客户端据此动态填充帮助模态框分类树与交叉引用链接白名单（见 www/index.html applyHelpTopics）
protected void send_help_topics()
{
    object me = this_object();
    string index;
    string *names;
    string *p;

    if (!has_gmcp())
        return;

    // 委托 helpd 读取 /help/topics 原文和主题名列表（daemon 上下文有完整文件权限）
    index = (string)call_other("/adm/daemons/helpd", "query_topics_index");
    p = me->query_path();
    names = (string *)call_other("/adm/daemons/helpd", "query_topic_names", p || ({}));
    if (!names) names = ({});

    sendGMCP((["index": index || "", "names": names]), "Help", "Topics");
}

// 全文搜索帮助文档：委托 helpd 执行（gmcp 回调上下文中 read_file/get_dir 权限不足）
protected void send_help_search(string keyword)
{
    string *matches;

    if (!has_gmcp())
        return;

    // 委托 helpd 执行搜索（daemon 上下文有完整文件访问权限）
    matches = (string *)call_other("/adm/daemons/helpd", "search_help", keyword);
    if (!matches) matches = ({});

    sendGMCP((["matches": matches, "keyword": keyword]), "Help", "Search");
}

protected void init_gmcp()
{
    if (!has_gmcp())
        return;
    gmcp_enable();

    // Mudlet Client
    if (env("GUI"))
    {
        sendGMCP((["version":env("GUI.version"), "url":env("GUI.url")]), "Client", "GUI");
    }
    if (sizeof(env("Map")))
    {
        sendGMCP((["url":env("Map")]), "Client", "Map");
    }

    // 登录完成后延迟推送角色状态、房间信息与帮助主题索引（等待GMCP通道就绪）
    call_out("send_char_vitals", 1);
    call_out("send_room_info", 1);
    call_out("send_help_topics", 1);

    if (wizardp(this_player()))
    {
        add_action("dump_gmcp_log", "gmcp_log");
    }
}

// gmcp - provides an interface to GMCP data received from the client
void gmcp(string req)
{
    string module, data;

    log_gmcp("Received: " + req);

    // 提取模块名（req 可能是 "Char.Vitals.Get {}" 或 "Char.Vitals.Get"）
    if (sscanf(req, "%s %s", module, data) != 2)
    {
        module = req;
    }

    if (module == "Char.Vitals.Get" || module == "Char.Vitals")
    {
        send_char_vitals();
    }
    else if (module == "Char.Score.Get" || module == "Char.Score")
    {
        send_char_score();
    }
    else if (module == "Room.Info.Get" || module == "Room.Info")
    {
        send_room_info();
    }
    else if (module == "Help.Topics.Get" || module == "Help.Topics")
    {
        send_help_topics();
    }
    else if (module == "Help.Search.Get")
    {
        mapping payload;
        if (data && (payload = json_decode(data)) && mapp(payload))
        {
            string keyword = payload["keyword"];
            if (stringp(keyword) && keyword != "")
                send_help_search(keyword);
        }
    }
    // Web 客户端刷新重连后发送 Client.GUI，此时玩家环境已完全恢复
    // 延迟重推房间信息、状态和帮助，确保地图等组件能正常渲染
    else if (module == "Client.GUI")
    {
        call_out("send_char_vitals", 1);
        call_out("send_room_info", 1);
        call_out("send_help_topics", 1);
    }
}
