// help_export_d.c — 帮助文档 JSON 导出守护进程
//
// 功能：扫描 /help/ 下所有帮助文件，导出 JSON 到 /www/storage/help.json
//       供 Web 客户端帮助浏览器使用（模态框内阅读 + 本地全文检索）
//
// 触发方式：
//   1. 自启动：加入 preload 后，MUD 启动 30 秒自动导出
//   2. 手动刷新：管理员执行 exporthelp 命令
//
// 输出格式（JSON）：
//   { "ts": 时间戳,
//     "index": "/help/topics 原文（供前端 parseHelpTopics 解析分类树）",
//     "topics": { "intro": { "content": "<span...>HTML</span>",
//                            "search_text": "纯文本（去色，供搜索）" }, ... } }

#pragma optimize

#include <ansi.h>

#define HELP_OUTPUT   "/www/storage/help.json"
#define AUTO_DELAY    30
#define BATCH_SIZE    20

nosave int exporting;
nosave object export_requestor;
nosave string *export_files;
nosave string export_topics_raw;
nosave mapping export_topics;
nosave int export_batch_idx;

// 前向声明
void do_export(object me);
void export_batch_step();
void export_finalize();
void export_cleanup();

// ===== 守护进程生命周期 =====

void create()
{
    seteuid(getuid());
    call_out("auto_export", AUTO_DELAY);
}

int clean_up() { return 1; }

void auto_export()
{
    if (file_size(HELP_OUTPUT) > 0)
    {
        log_file("help_export", sprintf("%s 帮助文件已存在，跳过自动导出\n", ctime(time())));
        return;
    }
    log_file("help_export", sprintf("%s 开始自动导出帮助文档...\n", ctime(time())));
    do_export(0);
}

// ===== 公共接口 =====

void refresh(object me)
{
    if (exporting)
    {
        if (me) tell_object(me, "帮助文档正在导出中，请稍候再试。\n");
        return;
    }
    do_export(me);
}

mapping query_status()
{
    return ([
        "exporting" : exporting,
        "output"    : HELP_OUTPUT,
        "file_size" : file_size(HELP_OUTPUT),
    ]);
}

// ===== $XXX$ → HTML 转换 =====

// 把经 color_filter() 转换后含 ANSI escape 的文本转为 HTML span 标签
// 输出为纯 HTML（无 ESC 字符），可安全 json_encode
private string help_ansi_to_html(string msg)
{
    // HTML 转义（先做，避免后续 <span> 被转义）
    msg = replace_string(msg, "&", "&amp;");
    msg = replace_string(msg, "<", "&lt;");
    msg = replace_string(msg, ">", "&gt;");

    // 基本前景色
    msg = replace_string(msg, BLK,  "<span style=\"color:#000\">");
    msg = replace_string(msg, RED,  "<span style=\"color:#900\">");
    msg = replace_string(msg, GRN,  "<span style=\"color:#090\">");
    msg = replace_string(msg, YEL,  "<span style=\"color:#990\">");
    msg = replace_string(msg, BLU,  "<span style=\"color:#009\">");
    msg = replace_string(msg, MAG,  "<span style=\"color:#909\">");
    msg = replace_string(msg, CYN,  "<span style=\"color:#099\">");
    msg = replace_string(msg, WHT,  "<span style=\"color:#EEE\">");

    // 高亮前景色（加粗）
    msg = replace_string(msg, HIK,  "<span style=\"color:#BBB;font-weight:bold\">");
    msg = replace_string(msg, HIR,  "<span style=\"color:#F00;font-weight:bold\">");
    msg = replace_string(msg, HIG,  "<span style=\"color:#0F0;font-weight:bold\">");
    msg = replace_string(msg, HIY,  "<span style=\"color:#FF0;font-weight:bold\">");
    msg = replace_string(msg, HIB,  "<span style=\"color:#00F;font-weight:bold\">");
    msg = replace_string(msg, HIM,  "<span style=\"color:#F0F;font-weight:bold\">");
    msg = replace_string(msg, HIC,  "<span style=\"color:#0FF;font-weight:bold\">");
    msg = replace_string(msg, HIW,  "<span style=\"color:#FFF;font-weight:bold\">");

    // 背景色
    msg = replace_string(msg, BBLK, "<span style=\"background-color:#000\">");
    msg = replace_string(msg, BRED, "<span style=\"background-color:#900\">");
    msg = replace_string(msg, BGRN, "<span style=\"background-color:#090\">");
    msg = replace_string(msg, BYEL, "<span style=\"background-color:#990\">");
    msg = replace_string(msg, BBLU, "<span style=\"background-color:#009\">");
    msg = replace_string(msg, BMAG, "<span style=\"background-color:#909\">");
    msg = replace_string(msg, BCYN, "<span style=\"background-color:#099\">");
    msg = replace_string(msg, BWHT, "<span style=\"background-color:#EEE\">");

    // 高亮背景色
    msg = replace_string(msg, HBBLK, "<span style=\"background-color:#555\">");
    msg = replace_string(msg, HBRED, "<span style=\"background-color:#F00\">");
    msg = replace_string(msg, HBGRN, "<span style=\"background-color:#0F0\">");
    msg = replace_string(msg, HBYEL, "<span style=\"background-color:#FF0\">");
    msg = replace_string(msg, HBBLU, "<span style=\"background-color:#00F\">");
    msg = replace_string(msg, HBMAG, "<span style=\"background-color:#F0F\">");
    msg = replace_string(msg, HBCYN, "<span style=\"background-color:#0FF\">");
    msg = replace_string(msg, HBWHT, "<span style=\"background-color:#FFF\">");

    // 样式
    msg = replace_string(msg, BOLD,  "<span style=\"font-weight:bold\">");
    msg = replace_string(msg, BLINK, "<span class=\"help-blink\">");
    msg = replace_string(msg, U,     "<span style=\"text-decoration:underline\">");

    // 重置 → 关闭 span
    msg = replace_string(msg, NOR, "</span>");

    return msg;
}

// 把含 $XXX$ 标记的原始帮助文本转为 HTML
private string help_to_html(string raw)
{
    return help_ansi_to_html(color_filter(raw));
}

// 把含 $XXX$ 标记的原始帮助文本转为纯文本（去色，供搜索用）
private string help_to_text(string raw)
{
    return remove_ansi(color_filter(raw));
}

// ===== 核心导出逻辑（分批处理，避免 eval cost 超限） =====

// 启动导出：收集文件列表，进入分批处理
void do_export(object me)
{
    if (exporting) return;
    exporting = 1;

    export_requestor = me;
    export_files = get_dir("/help/");

    if (!export_files || !sizeof(export_files))
    {
        if (me) tell_object(me, "导出失败：/help/ 目录为空。\n");
        exporting = 0;
        return;
    }

    export_topics_raw = read_file("/help/topics") || "";
    export_topics = ([]);
    export_batch_idx = 0;

    if (me) tell_object(me, sprintf("开始导出帮助文档（%d 个文件，分 %d 批）...\n",
                        sizeof(export_files),
                        (sizeof(export_files) + BATCH_SIZE - 1) / BATCH_SIZE));

    // 第一批在下一个 heart_beat 处理，确保当前 call 链释放
    call_out("export_batch_step", 0);
}

// 处理一批文件
void export_batch_step()
{
    int start, end, i;

    start = export_batch_idx * BATCH_SIZE;
    end = start + BATCH_SIZE;
    if (end > sizeof(export_files)) end = sizeof(export_files);

    for (i = start; i < end; i++)
    {
        string raw = read_file("/help/" + export_files[i]);
        if (!raw) continue;

        export_topics[export_files[i]] = ([
            "content"    : help_to_html(raw),
            "search_text": help_to_text(raw),
        ]);
    }

    export_batch_idx++;

    if (end < sizeof(export_files))
    {
        // 还有更多批次
        call_out("export_batch_step", 0);
    }
    else
    {
        // 全部处理完毕，进入最终组装
        call_out("export_finalize", 0);
    }
}

// 组装 JSON 并写入文件（分块写入，避免字符串超长）
void export_finalize()
{
    string *keys;
    string chunk;
    int i;
    int total;

    assure_file(HELP_OUTPUT);

    keys = keys(export_topics);

    // 第一步：写入 JSON 头部（覆盖模式）
    // 用 json_encode 对 index 文本做完整的 JSON 转义（换行、控制字符等）
    chunk = sprintf("{\"ts\":%d,\"index\":%s,\"topics\":{" ,
                    time(), json_encode(export_topics_raw));
    if (!write_file(HELP_OUTPUT, chunk, 1))
    {
        log_file("help_export", sprintf("%s 导出失败：无法写入头部 %s\n",
                     ctime(time()), HELP_OUTPUT));
        if (export_requestor)
            tell_object(export_requestor, "帮助导出失败：无法写入 " + HELP_OUTPUT + "\n");
        export_cleanup();
        return;
    }
    total = strlen(chunk);

    // 第二步：逐条编码并追加写入（每条约 4-5KB，不会超长）
    for (i = 0; i < sizeof(keys); i++)
    {
        string entry_json = json_encode(export_topics[keys[i]]);
        string key_json = json_encode(keys[i]);
        chunk = (i > 0 ? "," : "") + key_json + ":" + entry_json;
        write_file(HELP_OUTPUT, chunk, 0);
        total += strlen(chunk);
    }

    // 第三步：写入 JSON 尾部
    write_file(HELP_OUTPUT, "}}", 0);
    total += 2;

    {
        string msg = sprintf("帮助导出完成：%d 个主题 → %s (%d 字节)",
                              sizeof(export_files), HELP_OUTPUT, total);
        log_file("help_export", sprintf("%s %s\n", ctime(time()), msg));
        if (export_requestor) tell_object(export_requestor, msg + "\n");
    }

    export_cleanup();
}

// 清理 nosave 状态
void export_cleanup()
{
    export_requestor = 0;
    export_files = 0;
    export_topics = 0;
    export_topics_raw = 0;
    export_batch_idx = 0;
    exporting = 0;
}
