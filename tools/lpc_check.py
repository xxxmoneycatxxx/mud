#!/usr/bin/env python3
"""
LPC Compilation Checker for FluffOS MUD
========================================

通过 telnet 连接运行中的 MUD，利用 FluffOS 驱动编译 LPC 文件并捕获错误。
设计为 AI 代理和 CI 流水线的子进程调用。

用法:
    # 检查单个文件
    python tools/lpc_check.py -f /d/city/room.c

    # 检查多个文件
    python tools/lpc_check.py -f file1.c -f file2.c

    # 检查整个目录（递归）
    python tools/lpc_check.py -d /d/city/

    # 仅测试连接
    python tools/lpc_check.py --test-connection

环境变量 (优先于命令行参数):
    MUD_CHECK_HOST     主机地址 (默认 127.0.0.1)
    MUD_CHECK_PORT     端口号   (默认 6666)
    MUD_CHECK_USER     登录账号
    MUD_CHECK_PASS     登录密码

退出码:
    0  全部编译通过
    1  存在编译错误
    2  连接或登录失败
"""

import socket
import time
import re
import sys
import os
import argparse
import json

# ─── 常量 ────────────────────────────────────────────────────────────
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 6666          # UTF-8 编码端口
RECV_SIZE = 65536
LOGIN_TIMEOUT = 20           # 登录等待秒数
COMMAND_QUIET = 2.0          # 单文件命令静默期（秒）
LOADALL_QUIET = 8.0          # loadall 命令静默期（秒）
PROMPT_PATTERN = re.compile(r'[>＞]\s*$')

# ANSI / telnet 协议清理
_ANSI_RE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')
_TELNET_RE = re.compile(r'\xff[\xfb\xfc\xfd\xfe][\s\S]|\xff\xf0[\s\S]*?\xff\xf0|\xff[\s\S]')


# ─── 工具函数 ────────────────────────────────────────────────────────
def strip_codes(text: str) -> str:
    """去除 ANSI 转义序列和 telnet 协议字节。"""
    text = _ANSI_RE.sub('', text)
    text = _TELNET_RE.sub('', text)
    # 去除残余的 \r
    return text.replace('\r', '')


def normalize_path(path: str) -> str:
    """将文件路径规范化为 MUD 内部格式（以 / 开头，无 .c 后缀重复）。"""
    path = path.replace('\\', '/')
    if not path.startswith('/'):
        path = '/' + path
    return path


# ─── 核心类 ──────────────────────────────────────────────────────────
class LPCChecker:
    """通过 telnet 连接 MUD 进行 LPC 编译验证。"""

    def __init__(self, host=DEFAULT_HOST, port=DEFAULT_PORT,
                 username=None, password=None, verbose=False,
                 login_timeout=LOGIN_TIMEOUT):
        self.host = host
        self.port = port
        self.username = username or os.environ.get('MUD_CHECK_USER', '')
        self.password = password or os.environ.get('MUD_CHECK_PASS', '')
        self.verbose = verbose
        self.login_timeout = login_timeout
        self.sock = None
        self._mud_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # ── 日志 ──

    def _log(self, msg):
        if self.verbose:
            print(f"  [lpc_check] {msg}", file=sys.stderr)

    # ── 连接 ──

    def connect(self):
        """建立 telnet 连接。"""
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(30)
            self.sock.connect((self.host, self.port))
            self._log(f"已连接 {self.host}:{self.port}")
            return True
        except Exception as e:
            print(f"连接失败 {self.host}:{self.port}: {e}", file=sys.stderr)
            return False

    def close(self):
        """关闭连接。"""
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None

    # ── 数据收发 ──

    def _recv_all(self, timeout=2.0):
        """在 timeout 秒内尽可能多地接收数据。"""
        self.sock.settimeout(timeout)
        buf = b''
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                chunk = self.sock.recv(RECV_SIZE)
                if not chunk:
                    break
                buf += chunk
            except socket.timeout:
                break
            except Exception:
                break
        return buf.decode('utf-8', errors='replace')

    def _recv_until(self, predicate, timeout=30.0, quiet_period=2.0):
        """
        接收数据直到 predicate(text) 返回 True，或连续 quiet_period 秒无新数据。
        返回清理后的完整文本。
        """
        self.sock.settimeout(1.0)
        buf = b''
        last_data_time = time.monotonic()
        deadline = time.monotonic() + timeout

        while time.monotonic() < deadline:
            try:
                chunk = self.sock.recv(RECV_SIZE)
                if chunk:
                    buf += chunk
                    last_data_time = time.monotonic()
                    text = strip_codes(buf.decode('utf-8', errors='replace'))
                    if predicate(text):
                        return text
            except socket.timeout:
                pass
            except Exception:
                break

            # 静默期检测：长时间无新数据则认为命令完成
            if buf and (time.monotonic() - last_data_time) >= quiet_period:
                break

        return strip_codes(buf.decode('utf-8', errors='replace'))

    def _send(self, text):
        """发送文本（自动追加换行）。"""
        data = (text + '\n').encode('utf-8')
        self.sock.sendall(data)

    def _flush(self):
        """清空接收缓冲区。"""
        self.sock.settimeout(0.1)
        try:
            while self.sock.recv(RECV_SIZE):
                pass
        except Exception:
            pass

    # ── 登录 ──

    def login(self):
        """
        完成 MUD 登录流程。
        返回 True 表示成功进入游戏。
        """
        if not self.username or not self.password:
            print("错误: 未提供登录凭据。", file=sys.stderr)
            print("  使用 --user/--pass 参数或 MUD_CHECK_USER/MUD_CHECK_PASS 环境变量。",
                  file=sys.stderr)
            return False

        # 等待用户名提示
        self._log("等待登录提示...")
        text = self._recv_until(
            lambda t: '名字' in t or 'password' in t.lower() or '>' in t,
            timeout=self.login_timeout,
            quiet_period=5.0,
        )
        if not text:
            print("登录超时：未收到登录提示。", file=sys.stderr)
            return False
        self._log(f"登录提示: {text[-80:]}")

        # 发送用户名
        self._send(self.username)
        time.sleep(0.8)

        # 等待密码提示或进入游戏
        text = self._recv_until(
            lambda t: '密码' in t or '>' in t or '错误' in t,
            timeout=10.0,
            quiet_period=3.0,
        )
        self._log(f"用户名后: {text[-80:]}")

        if '密码错误' in text:
            print("登录失败: 用户名不存在或密码错误。", file=sys.stderr)
            return False

        # 发送密码（如果提示了）
        if '密码' in text and '>' not in text:
            self._send(self.password)
            time.sleep(1.0)

            # 处理可能的额外提示（管理密码设置等）
            text = self._recv_until(
                lambda t: '>' in t or '密码' in t or '管理' in t,
                timeout=10.0,
                quiet_period=3.0,
            )
            self._log(f"密码后: {text[-80:]}")

            # 如果要求设置管理密码（首次用管理密码登录的分支），跳过
            if '管理密码' in text and '请输入' in text:
                self._send(self.password)
                time.sleep(1.0)
                text = self._recv_until(
                    lambda t: '>' in t,
                    timeout=10.0,
                    quiet_period=3.0,
                )

            if '密码错误' in text:
                print("登录失败: 密码错误。", file=sys.stderr)
                return False

        # 等待游戏提示符 "> "
        if '>' in text:
            self._log("登录成功")
            # 清空欢迎消息缓冲
            self._flush()
            # 关闭分页器，确保 cat 命令可以完整输出而不会挂起
            self._exec("set no_more 1", quiet_period=1.0)
            return True

        # 最后尝试：再等一会儿看是否有提示符
        text = self._recv_until(
            lambda t: '>' in t,
            timeout=10.0,
            quiet_period=5.0,
        )
        if '>' in text:
            self._log("登录成功（延迟确认）")
            self._flush()
            self._exec("set no_more 1", quiet_period=1.0)
            return True

        print("登录失败: 未检测到游戏提示符。", file=sys.stderr)
        self._log(f"最终文本: {text[-200:]}")
        return False

    # ── 命令执行 ──

    def _exec(self, command, quiet_period=COMMAND_QUIET, timeout=30.0):
        """
        发送命令并等待输出稳定。
        返回清理后的输出文本。
        """
        self._flush()
        self._log(f"执行: {command}")
        self._send(command)
        text = self._recv_until(
            lambda t: PROMPT_PATTERN.search(t) is not None,
            timeout=timeout,
            quiet_period=quiet_period,
        )
        self._log(f"输出 ({len(text)} 字符)")
        return text

    # ── 文件检查 ──

    def check_file(self, filepath):
        """
        检查单个 LPC 文件是否能编译通过。
        通过 update 命令触发编译，分析输出判断结果。
        update 成功时输出包含"：成功"，失败时输出包含"失败"或"编译时段错误"。
        返回 dict: {file, ok, error}
        """
        filepath = normalize_path(filepath)
        self._log(f"检查文件: {filepath}")

        # 使用 update 命令编译文件
        output = self._exec(f"update {filepath}")

        result = {'file': filepath, 'ok': True, 'error': None}

        # 检测失败标志（按优先级）
        # update.c 输出："重新编译 <file>：成功！" 或 "失败，文件不存在!"
        # 编译错误时 log_error 输出："编译时段错误：<msg>"
        # 运行时错误 error_handler 输出："执行时段错误：<msg>"
        FAIL_MARKERS = ['编译时段错误', '执行时段错误', '失败，文件不存在',
                        'Syntax error', 'Type mismatch', 'Undefined ']

        fail_reason = None
        for marker in FAIL_MARKERS:
            if marker in output:
                fail_reason = marker
                break

        # 英文小写包含 "error" 也视为失败（FluffOS 编译错误消息包含此词）
        if fail_reason is None and 'error' in output.lower():
            fail_reason = 'error'

        # 明确的成功标志："：成功" 或 ": 成功"
        success_marker = ('：成功' in output or ': 成功' in output
                          or '成功！' in output)

        if fail_reason and not success_marker:
            result['ok'] = False
            lines = [l.strip() for l in output.split('\n') if l.strip()]
            error_lines = []
            capture = False
            for line in lines:
                if (fail_reason in line or 'Error' in line
                        or 'error' in line.lower() or '失败' in line
                        or '错误' in line):
                    capture = True
                if capture:
                    error_lines.append(line)
            result['error'] = '\n'.join(error_lines) if error_lines else output[:300]

        return result

    def check_files(self, filepaths):
        """批量检查多个文件。返回 list[dict]。"""
        results = []
        for fp in filepaths:
            result = self.check_file(fp)
            results.append(result)
        return results

    # ── 目录检查 ──

    def check_directory(self, dirpath='/'):
        """
        使用 loadall 递归检查目录下所有 LPC 文件。
        返回 dict: {dir, total_errors, errors: [{file, line, message}]}
        """
        dirpath = normalize_path(dirpath)
        self._log(f"检查目录: {dirpath}")

        # 清空旧的 loadall 日志（使用 eval write_file 覆盖为空）
        self._exec('eval write_file("/log/loadall", "")', quiet_period=1.5)

        # 执行 loadall（使用较长的静默期，因为有 call_out 递归）
        timeout = max(60, 30 + dirpath.count('/') * 5)
        self._exec(f"loadall {dirpath}", quiet_period=LOADALL_QUIET, timeout=timeout)

        # 读取 loadall 日志
        log_output = self._exec("cat /log/loadall", quiet_period=3.0)

        # 解析错误
        errors = self._parse_loadall_log(log_output)

        return {
            'dir': dirpath,
            'total_errors': len(errors),
            'errors': errors,
        }

    def _parse_loadall_log(self, log_text):
        """
        解析 loadall 的日志输出。
        格式: "check :<filepath>\n<error message>"
        """
        errors = []
        current_file = None
        current_error = []

        for raw_line in log_text.split('\n'):
            line = raw_line.strip()
            if line.startswith('#check dir :'):
                continue  # 目录标记，跳过
            if line.startswith('check :'):
                # 保存上一个错误
                if current_file and current_error:
                    errors.append({
                        'file': current_file,
                        'message': '\n'.join(current_error),
                    })
                current_file = line[7:].strip()
                current_error = []
            elif line and current_file:
                current_error.append(line)

        # 最后一个
        if current_file and current_error:
            errors.append({
                'file': current_file,
                'message': '\n'.join(current_error),
            })

        return errors

    # ── 日志文件直接解析（备用方案） ──

    def read_error_log(self, log_name='log_error'):
        """
        直接读取 MUD 的错误日志文件（通过游戏内 cat 命令）。
        用于在 loadall/update 后手动检查。
        """
        output = self._exec(f"cat /log/{log_name}", quiet_period=2.0)
        return output

    # ── 连接测试 ──

    def test_connection(self):
        """仅测试能否连接并登录，不做编译检查。"""
        if not self.connect():
            return False
        try:
            return self.login()
        except Exception as e:
            print(f"登录异常: {e}", file=sys.stderr)
            return False
        finally:
            self.close()

    # ── 主入口 ──

    def run(self, files=None, directory=None):
        """
        执行编译检查。
        files: 文件路径列表
        directory: 目录路径
        返回 (success: bool, results: dict)
        """
        if not self.connect():
            return False, {'error': '连接失败'}

        try:
            if not self.login():
                return False, {'error': '登录失败'}

            if files:
                results = self.check_files(files)
                ok = all(r['ok'] for r in results)
                return ok, {'files': results, 'total': len(results),
                            'passed': sum(1 for r in results if r['ok']),
                            'failed': sum(1 for r in results if not r['ok'])}

            if directory:
                result = self.check_directory(directory)
                return result['total_errors'] == 0, {'directory': result}

            return False, {'error': '未指定检查目标'}

        except Exception as e:
            return False, {'error': str(e)}
        finally:
            self.close()


# ─── 输出格式化 ──────────────────────────────────────────────────────
def print_json(results):
    """以 JSON 格式输出结果（供 AI 代理解析）。"""
    print(json.dumps(results, ensure_ascii=False, indent=2))


def print_human(results):
    """以人类可读格式输出结果。"""
    if 'error' in results:
        print(f"错误: {results['error']}", file=sys.stderr)
        return

    if 'files' in results:
        # 单文件检查结果
        total = results['total']
        passed = results['passed']
        failed = results['failed']
        print(f"\n编译检查完成: {total} 个文件, {passed} 通过, {failed} 失败\n")
        for r in results['files']:
            status = "✓ 通过" if r['ok'] else "✗ 失败"
            print(f"  {status}  {r['file']}")
            if r['error']:
                for line in r['error'].split('\n')[:5]:
                    print(f"         {line}")
        print()

    elif 'directory' in results:
        # 目录检查结果
        d = results['directory']
        errors = d['errors']
        print(f"\n目录检查完成: {d['dir']}, {len(errors)} 个编译错误\n")
        for err in errors:
            print(f"  ✗ {err['file']}")
            for line in err['message'].split('\n')[:3]:
                print(f"      {line}")
        print()


# ─── CLI ─────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description='LPC 编译检查器 — 通过 telnet 连接 MUD 验证 LPC 文件编译',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s -f /d/city/room.c            # 检查单个文件
  %(prog)s -f a.c -f b.c                # 检查多个文件
  %(prog)s -d /d/city/                   # 检查整个目录
  %(prog)s --test-connection             # 仅测试连接
  %(prog)s -f /cmds/usr/test.c --json    # JSON 格式输出

环境变量:
  MUD_CHECK_HOST / MUD_CHECK_PORT / MUD_CHECK_USER / MUD_CHECK_PASS
""")

    parser.add_argument('-f', '--file', action='append', dest='files',
                        help='要检查的 LPC 文件路径（可多次指定）')
    parser.add_argument('-d', '--dir', '--directory', dest='directory',
                        help='要检查的目录路径（递归）')
    parser.add_argument('--host', default=None,
                        help=f'MUD 主机地址 (默认: {DEFAULT_HOST})')
    parser.add_argument('-p', '--port', type=int, default=None,
                        help=f'MUD 端口号 (默认: {DEFAULT_PORT})')
    parser.add_argument('-u', '--user', default=None,
                        help='登录账号')
    parser.add_argument('--pass', '--password', dest='password', default=None,
                        help='登录密码')
    parser.add_argument('--json', action='store_true',
                        help='以 JSON 格式输出结果')
    parser.add_argument('-v', '--verbose', action='store_true',
                        help='输出详细调试信息')
    parser.add_argument('--test-connection', action='store_true',
                        help='仅测试连接和登录')
    parser.add_argument('--timeout', type=int, default=LOGIN_TIMEOUT,
                        help=f'登录超时秒数 (默认: {LOGIN_TIMEOUT})')

    args = parser.parse_args()

    # 构建 checker
    host = args.host or os.environ.get('MUD_CHECK_HOST', DEFAULT_HOST)
    port = args.port or int(os.environ.get('MUD_CHECK_PORT', DEFAULT_PORT))

    checker = LPCChecker(
        host=host,
        port=port,
        username=args.user,
        password=args.password,
        verbose=args.verbose,
        login_timeout=args.timeout,
    )

    # 仅测试连接
    if args.test_connection:
        ok = checker.test_connection()
        if ok:
            print("✓ 连接和登录成功")
            sys.exit(0)
        else:
            print("✗ 连接或登录失败")
            sys.exit(2)

    # 需要指定检查目标
    if not args.files and not args.directory:
        parser.print_help()
        print("\n错误: 请指定 -f 文件或 -d 目录", file=sys.stderr)
        sys.exit(2)

    # 执行检查
    success, results = checker.run(files=args.files, directory=args.directory)

    # 输出结果
    if args.json:
        print_json(results)
    else:
        print_human(results)

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
