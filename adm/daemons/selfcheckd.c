// selfcheckd.c
// 启动自检守护进程（L2 无登录健康检查）
//
// 目的：AI 协同开发 / CI 需要一个"零凭据、零后门"的服务健康入口。
//       本 daemon 由 preload 在 boot 早期加载，记录错误日志基线，随后用
//       call_out 延迟数秒（待其余 daemon 载入完成）执行一次自检，把结构化
//       结果以 JSON 写入 /log/health.json。外部直接读该文件即可判断：
//       关键 daemon 是否全部载入、启动期是否产生新的错误日志。
//
// 设计边界：
//   - 只读探测（find_object / file_size / users），不改游戏状态、不建账号。
//   - 不读取日志正文内容，仅按字节增长判断"启动期有报错"，规避重量 IO 与
//     json_encode 对 ESC 字节的已知缺陷（正文里不会有 ANSI，但根本不纳入）。
//   - run_check 通过 call_out 延迟，确保 VERSION_D 等依赖此时已就绪。

// 需要监测的候选错误日志（存在才纳入；启动期字节增长即视为告警）
nosave string *watch_logs = ({ "error_handler", "log_error", "crash", "error" });

// 关键 daemon：任一缺失即判定 fail（通常意味 boot 中断）
nosave string *critical_daemons = ({
    SECURITY_D, COMMAND_D, NATURE_D, VERSION_D,
});

nosave mapping log_baseline = ([]);   // 日志名 -> create() 时的字节数
nosave mapping last_report  = ([]);   // 最近一次自检结果
nosave string  last_json     = "";    // 最近一次自检 JSON

int clean_up() { return 0; }          // 常驻，永不清理

// 记录启动前的错误日志基线
void snapshot_baseline()
{
    string name;
    int sz;

    log_baseline = ([]);
    foreach (name in watch_logs)
    {
        sz = file_size(LOG_DIR + name);
        if (sz >= 0)
            log_baseline[name] = sz;
    }
}

// 执行一次自检，汇总并写盘；返回 0=ok 1=warn 2=fail
public int do_check()
{
    string *preload_list, *missing_daemons, *preload_dead, *preload_failed, *grown_logs;
    string e, name, status, path, json;
    int sz, release, user_count, code;
    mapping report, checks;

    // 1) 关键 daemon 是否在内存
    missing_daemons = ({});
    foreach (e in critical_daemons)
        if (! objectp(find_object(e)))
            missing_daemons += ({ e });

    // 2) preload 清单覆盖情况，拆成两类：
    //    preload_dead   —— 源文件不存在（配置冗余/路径笔误，warn）
    //    preload_failed —— 源文件存在却没加载进内存（编译/载入挂了，严重，fail）
    preload_dead = ({});
    preload_failed = ({});
    preload_list = read_lines(CONFIG_DIR + "preload");
    if (arrayp(preload_list))
    {
        foreach (e in preload_list)
        {
            if (! stringp(e) || e == "") continue;
            if (objectp(find_object(e))) continue;   // 已加载，正常
            if (file_size(e + ".c") >= 0)
                preload_failed += ({ e });           // 文件在、未加载：危险
            else
                preload_dead += ({ e });             // 文件不在：配置冗余
        }
    }

    // 3) 启动期错误日志是否有新增（仅按字节增长判断，不读正文）
    grown_logs = ({});
    foreach (name in keys(log_baseline))
    {
        sz = file_size(LOG_DIR + name);
        if (sz > log_baseline[name])
            grown_logs += ({ name + "(+" + (sz - log_baseline[name]) + "B)" });
    }

    // 状态判定：关键 daemon 缺失或有 daemon 载入失败=fail；
    //          死路径或启动期新报错=warn；否则=ok
    if (sizeof(missing_daemons) > 0 || sizeof(preload_failed) > 0)
    {
        status = "fail";
        code = 2;
    }
    else if (sizeof(preload_dead) > 0 || sizeof(grown_logs) > 0)
    {
        status = "warn";
        code = 1;
    }
    else
    {
        status = "ok";
        code = 0;
    }

    // release 标记：短路保护，VERSION_D 缺失时不调用其 apply
    release = objectp(find_object(VERSION_D)) && VERSION_D->is_release_server();
    user_count = sizeof(users());

    checks = ([
        "critical_missing"   : missing_daemons,
        "preload_failed"     : preload_failed,
        "preload_dead"       : preload_dead,
        "startup_error_logs" : grown_logs,
    ]);

    report = ([
        "status"      : status,
        "time"        : ctime(time()),
        "uptime"      : uptime(),
        "release"     : release ? 1 : 0,
        "online_users": user_count,
        "checks"      : checks,
    ]);

    last_report = report;

    // 写 JSON：先 rm 再 write_file，规避 write_file 的 append 语义歧义
    json = json_encode(report);
    path = LOG_DIR + "health.json";
    if (file_size(path) >= 0)
        rm(path);
    write_file(path, json + "\n");
    last_json = json;

    // 追加一行人类可读摘要（保留历史）
    write_file(LOG_DIR + "health.log",
        sprintf("[%s] self-check: %s | crit_missing=%d preload_failed=%d preload_dead=%d err_logs_grew=%d users=%d\n",
            ctime(time()), status, sizeof(missing_daemons), sizeof(preload_failed),
            sizeof(preload_dead), sizeof(grown_logs), user_count));

    return code;
}

// call_out 入口：boot 延迟后执行
void run_check() { do_check(); }

// 供 dev 门控命令 / eval 按需取回最近一次结果
public mapping query_report() { return last_report; }
public string  query_json()   { return last_json; }

void create()
{
    seteuid(ROOT_UID);
    snapshot_baseline();
    // 延迟 3 秒，待 preload 其余对象载入完成再检查
    call_out("run_check", 3);
}
