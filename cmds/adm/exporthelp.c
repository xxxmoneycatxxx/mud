// 导出帮助文档为 JSON，供 Web 客户端帮助浏览器使用
// 用法：exporthelp
// 实际导出逻辑由 HELP_EXPORT_D 守护进程执行

inherit F_CLEAN_UP;

int main(object me, string arg)
{
    if (!this_player()->is_admin())
        return notify_fail("只有管理员才能导出帮助文档。\n");

    write("触发帮助文档导出...\n");
    HELP_EXPORT_D->refresh(me);
    return 1;
}

int help(object me)
{
    write(@HELP
指令格式 : exporthelp

触发帮助文档守护进程 (HELP_EXPORT_D) 扫描 /help/ 目录下所有帮助文件，
导出 JSON 格式到 /www/storage/help.json。

Web 客户端帮助浏览器（模态框内阅读 + 本地全文检索）依赖此数据。
守护进程会在 MUD 启动时自动导出一次，管理员也可随时用本命令手动刷新。

导出的数据包括：
  - /help/topics 原文（分类索引）
  - 每个帮助主题的 HTML 渲染内容（$XXX$ 颜色标记已转为 <span>）
  - 每个帮助主题的纯文本副本（去色，供搜索用）

注意：导出的 HTML 使用 <span style="..."> 标签，不含 ANSI ESC 字符，
可安全通过 json_encode 传输。
HELP );
    return 1;
}
