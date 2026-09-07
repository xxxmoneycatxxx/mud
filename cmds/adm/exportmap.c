// 导出全量地图数据为 JSON，供 Web 客户端寻路使用
// 用法：exportmap
// 实际导出逻辑由 MAP_EXPORT_D 守护进程执行

inherit F_CLEAN_UP;

int main(object me, string arg)
{
    if (!this_player()->is_admin())
        return notify_fail("只有管理员才能导出地图数据。\n");

    write("触发地图导出...\n");
    MAP_EXPORT_D->refresh(me);
    return 1;
}

int help(object me)
{
    write(@HELP
指令格式 : exportmap

触发地图守护进程 (MAP_EXPORT_D) 重新扫描 /d/ 目录下所有房间，
导出全量地图数据为 JSON 格式到 /www/storage/map.json。

Web 客户端自动寻路 (gtr) 依赖此数据。守护进程会在 MUD 启动时
自动导出一次，管理员也可随时用本命令手动刷新。

导出的数据包括：
  - 房间名称（去除 ANSI 颜色码）
  - 所属区域
  - 出口方向列表
  - 每个出口通往的房间 hash

注意：加载房间文件会执行 create()，大量房间可能需要数秒。
HELP );
    return 1;
}
