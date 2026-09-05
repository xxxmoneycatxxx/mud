// helpd.c - 帮助搜索 daemon
// 提供全文搜索功能，供 GMCP Help.Search 模块调用
// 原因：gmcp() 回调上下文中 read_file/get_dir 权限不足，
//       而 daemon 上下文有完整权限（mapd.c 也使用相同模式读取 /help/ 文件）

inherit F_CLEAN_UP;

// 全文搜索帮助文档：遍历 /help/ 所有文件，返回包含关键字的主题名列表
varargs string *search_help(string keyword)
{
    string *files;
    string *matches;
    string content;
    int i;

    matches = ({});
    files = get_dir("/help/");
    if (!files) return matches;

    for (i = 0; i < sizeof(files); i++)
    {
        content = read_file("/help/" + files[i]);
        if (content && strsrch(content, keyword) != -1)
            matches += ({ files[i] });
    }

    return matches;
}

// 读取帮助主题索引原文
string query_topics_index()
{
    return read_file("/help/topics");
}

// 获取有效主题名列表（/help/ 文档 + 玩家命令）
// player_path: 玩家的命令搜索路径（来自 query_path()），需在用户对象中获取后传入
string *query_topic_names(string *player_path)
{
    string *names;
    string *files;
    int i, j;

    names = ({});

    // 1. /help/ 目录下的文档名
    files = get_dir("/help/");
    if (files)
        for (i = 0; i < sizeof(files); i++)
            names += ({ files[i] });

    // 2. 玩家命令搜索路径中的命令名
    if (player_path)
        for (i = 0; i < sizeof(player_path); i++)
        {
            string verb;
            string *cmds = get_dir(player_path[i]);
            if (cmds)
                for (j = 0; j < sizeof(cmds); j++)
                    if (sscanf(cmds[j], "%s.c", verb))
                        names += ({ verb });
        }

    return names;
}
