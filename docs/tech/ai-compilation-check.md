# LPC 编译验证指南（AI 代理 & CI）

本文档说明如何使用 `tools/lpc_check.py` 在修改 LPC 代码后自动验证编译是否通过。

## 概述

LPC 是解释型语言，代码错误只有在 FluffOS 驱动加载时才会暴露。`lpc_check.py` 通过 telnet 连接运行中的 MUD，触发文件编译并捕获错误，为 AI 代理提供编译验证闭环。

## 前置条件

1. **MUD 服务正在运行**（Docker 或本地）
2. **拥有管理员账号**（wizard 级别以上）
3. **Python 3.6+**（脚本仅使用标准库，无第三方依赖）

## 快速开始

### 环境变量配置

```bash
# 推荐：设置环境变量避免每次传参
export MUD_CHECK_HOST=127.0.0.1
export MUD_CHECK_PORT=6666
export MUD_CHECK_USER=your_admin_id
export MUD_CHECK_PASS=your_password
```

Windows PowerShell:
```powershell
$env:MUD_CHECK_HOST = "127.0.0.1"
$env:MUD_CHECK_PORT = "6666"
$env:MUD_CHECK_USER = "your_admin_id"
$env:MUD_CHECK_PASS = "your_password"
```

### 检查单个文件

```bash
python tools/lpc_check.py -f /d/city/room.c
```

输出示例（通过）:
```
编译检查完成: 1 个文件, 1 通过, 0 失败

  ✓ 通过  /d/city/room.c
```

输出示例（失败）:
```
编译检查完成: 1 个文件, 0 通过, 1 失败

  ✗ 失败  /d/city/room.c
         发生错误：
         /d/city/room.c line 42: Syntax error
```

### 检查多个文件

```bash
python tools/lpc_check.py -f /cmds/usr/test.c -f /feature/move.c
```

### 检查整个目录（递归）

```bash
python tools/lpc_check.py -d /d/city/
```

### JSON 格式输出（供程序解析）

```bash
python tools/lpc_check.py -f /d/city/room.c --json
```

输出:
```json
{
  "files": [
    {"file": "/d/city/room.c", "ok": true, "error": null}
  ],
  "total": 1,
  "passed": 1,
  "failed": 0
}
```

### 仅测试连接

```bash
python tools/lpc_check.py --test-connection
```

## AI 代理工作流集成

### 推荐流程

```
1. AI 修改 LPC 文件
2. 调用 lpc_check.py 验证编译
3. 如果有错误 → 解析错误信息 → 修正代码 → 重新验证
4. 编译通过 → 继续下一步
```

### 退出码约定

| 退出码 | 含义 |
|--------|------|
| 0 | 全部编译通过 |
| 1 | 存在编译错误 |
| 2 | 连接或登录失败 |

### 示例：Python 调用

```python
import subprocess
import json

def check_lpc(files):
    """检查 LPC 文件编译是否通过，返回 (ok, details)"""
    result = subprocess.run(
        ["python", "tools/lpc_check.py", "--json"] +
        sum([["-f", f] for f in files], []),
        capture_output=True, text=True
    )
    data = json.loads(result.stdout)
    return result.returncode == 0, data
```

### 示例：Shell 调用

```bash
# 在 CI 脚本中使用
python tools/lpc_check.py -f "$CHANGED_FILE" --json > /tmp/check_result.json
if [ $? -ne 0 ]; then
    echo "编译失败:"
    cat /tmp/check_result.json
    exit 1
fi
```

## 游戏内命令

除了 Python 脚本，也可以在 MUD 游戏内直接使用 `lpccheck` 命令：

```
lpccheck /d/city/room.c      # 检查单个文件
lpccheck /d/city/             # 检查整个目录
```

该命令需要 wizard 以上权限，结果会记录到 `log/lpccheck`。

## 端口选择

| 端口 | 编码 | 推荐用途 |
|------|------|----------|
| 6666 | UTF-8 | **推荐** — 脚本默认端口，与文件编码一致 |
| 5566 | GBK | 不推荐 — 需要额外编码转换 |
| 8888 | WebSocket | 不适用 — 脚本使用 telnet 协议 |

## 故障排查

### 连接失败

```
连接失败 127.0.0.1:6666: [Errno 111] Connection refused
```

→ MUD 未启动。运行 `.\docker-deploy.ps1` 或 `docker compose up -d`。

### 登录超时

```
登录超时：未收到登录提示。
```

→ 检查端口是否正确（6666 是 UTF-8 端口）。确认 MUD 已完全启动（等待 Docker 就绪检查通过）。

### 密码错误

```
登录失败: 密码错误。
```

→ 检查 `MUD_CHECK_USER` / `MUD_CHECK_PASS` 是否正确。注意用户名区分大小写。

### 文件不存在

```
✗ 失败  /path/to/file.c
        文件不存在
```

→ 确认文件路径使用 MUD 内部格式（以 `/` 开头，相对于 mudlib 根目录）。

## 技术细节

### 工作原理

1. 通过 telnet 连接 MUD 的 6666 端口（UTF-8）
2. 自动完成登录流程（用户名 → 密码 → 进入游戏）
3. 发送 `update <文件路径>` 命令触发 FluffOS 编译
4. 捕获命令输出，检测编译错误标志
5. 对于目录检查，使用 `loadall` 命令并解析 `log/loadall` 日志

### 局限性

- **需要 MUD 运行中**：脚本依赖运行中的 FluffOS 驱动，无法离线检查
- **首次编译较慢**：FluffOS 首次编译文件比后续更新慢（需要解析继承链）
- **并发限制**：同一账号不能同时多连接（取决于 MUD 配置）
- **不检查运行时错误**：仅验证编译时错误，不验证运行时逻辑
