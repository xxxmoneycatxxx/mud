// map_export_d.c — 全量地图 JSON 自动导出守护进程
//
// 功能：扫描 /d/ 下所有房间文件，导出 JSON 到 /www/storage/map.json
//       供 Web 客户端 pathfinder.js 自动寻路使用
//
// 触发方式：
//   1. 自启动：加入 preload 后，MUD 启动 30 秒自动导出
//   2. 手动刷新：管理员执行 exportmap 命令
//
// 输出格式（JSON）：
//   { "rooms": { "<hash>": { "n":"房间名", "a":"区域", "e":[出口], "t":{方向:目标hash} } } }

#pragma optimize

#include <ansi.h>

#define MAP_OUTPUT    "/www/storage/map.json"
#define AUTO_DELAY    30    // 启动后延迟秒数

nosave mapping room_data;
nosave int room_count;
nosave int exporting;

// 前向声明
void do_export(object me);
void scan_dirs(mixed *stack, object me);
void process_room_file(string path);
void finish_export(object me);

// ===== 守护进程生命周期 =====

void create()
{
    seteuid(getuid());
    call_out("auto_export", AUTO_DELAY);
}

int clean_up() { return 1; }

// 启动时自动导出（静默执行，不依赖玩家在线）
void auto_export()
{
    if (file_size(MAP_OUTPUT) > 0)
    {
        // 已有地图文件，跳过自动导出（避免每次重启都重扫）
        log_file("map_export", sprintf("%s 地图文件已存在，跳过自动导出\n", ctime(time())));
        return;
    }
    log_file("map_export", sprintf("%s 开始自动导出地图...\n", ctime(time())));
    do_export(0);
}

// ===== 公共接口 =====

// 手动刷新（由 exportmap 命令调用）
// me: 调用者对象（用于输出反馈），可为 0（自动触发时无反馈对象）
void refresh(object me)
{
    if (exporting)
    {
        if (me) tell_object(me, "地图正在导出中，请稍候再试。\n");
        return;
    }
    do_export(me);
}

// 查询当前状态
mapping query_status()
{
    return ([
        "exporting" : exporting,
        "output"    : MAP_OUTPUT,
        "file_size" : file_size(MAP_OUTPUT),
    ]);
}

// ===== 核心导出逻辑 =====

void do_export(object me)
{
    if (exporting) return;
    exporting = 1;
    room_data = ([]);
    room_count = 0;

    if (me) tell_object(me, "开始扫描 /d/ 目录下所有房间...\n");

    // 使用 call_out 避免在命令上下文中 eval 超限
    call_out("scan_dirs", 0, ({ "/d/" }), me);
}

// 迭代式深度优先扫描：避免递归 call_out 导致 finish_export 被多次调度
void scan_dirs(mixed *stack, object me)
{
    string dir;
    string *files;
    string file;

    while (sizeof(stack) > 0)
    {
        dir = stack[0];
        stack = stack[1..];

        reset_eval_cost();

        if (dir[<1] != '/') dir += "/";
        files = get_dir(dir);
        if (!arrayp(files) || !sizeof(files))
            continue;

        foreach (file in files)
        {
            switch (file_size(dir + file))
            {
            case -1:
                break;
            case -2:
                if (file != "." && file != "..")
                    stack += ({ dir + file + "/" });
                break;
            default:
                if (file[<2..] == ".c")
                    process_room_file(dir + file);
                break;
            }
        }
    }

    call_out("finish_export", 0, me);
}

void process_room_file(string path)
{
    object ob;
    string short_name, area, file_path;
    mapping exits, exit_targets;
    string dir, target, room_hash;

    if (catch(ob = load_object(path[0..<3])))
        return;
    if (!ob) return;

    short_name = ob->query("short");
    if (!stringp(short_name) || short_name == "") return;

    file_path = base_name(ob);
    area = ob->query("outdoors") || "";

#if defined(__PACKAGE_CRYPTO__) && efun_defined(hash)
    room_hash = hash("md5", file_path);
#else
    room_hash = sha1(file_path);
#endif

    exits = ob->query("exits") || ([]);
    exit_targets = ([]);
    foreach (dir, target in exits)
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

    room_data[room_hash] = ([
        "n" : remove_ansi(short_name),
        "a" : area,
        "e" : keys(exits),
        "t" : exit_targets,
    ]);
    room_count++;
}

void finish_export(object me)
{
    string json;
    mapping result;

    if (!mapp(room_data))
    {
        exporting = 0;
        return;
    }

    result = (["rooms" : room_data]);
    json = json_encode(result);

    assure_file(MAP_OUTPUT);

    if (write_file(MAP_OUTPUT, json, 1))
    {
        string msg = sprintf("地图导出完成：%d 个房间 → %s (%d 字节)",
                              room_count, MAP_OUTPUT, strlen(json));
        log_file("map_export", sprintf("%s %s\n", ctime(time()), msg));
        if (me) tell_object(me, msg + "\n");
    }
    else
    {
        log_file("map_export", sprintf("%s 导出失败：无法写入 %s\n", ctime(time()), MAP_OUTPUT));
        if (me) tell_object(me, "地图导出失败：无法写入 " + MAP_OUTPUT + "\n");
    }

    room_data = ([]);
    room_count = 0;
    exporting = 0;
}
