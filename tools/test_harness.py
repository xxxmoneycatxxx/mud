#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_harness.py — MUD 临时账号测试工具（方案 B2）

用途：AI 协同开发 / CI 测试时，自动注册临时账号→执行命令→清理，
      不留持久化 admin 账号，彻底避免"忘了删留后门"的风险。

设计原则：
  - 不改 logind.c，复用现有登录流程
  - 每次测试注册随机账号，用完即删
  - 支持上下文管理器（with 语句）自动清理
  - 提供 exec() API 执行命令并返回输出

用法：
  from tools.test_harness import MUDTestHarness

  with MUDTestHarness() as h:
      output = h.exec("help update")
      assert "重新编译" in output

  # 或 CLI 模式：
  python tools/test_harness.py --exec "help update" --exec "who"
"""

import socket
import time
import random
import string
import re
import os
import sys
import argparse


class MUDTestHarness:
    """MUD 临时账号测试工具"""

    def __init__(self, host="127.0.0.1", port=6666, timeout=30, verbose=False):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.verbose = verbose
        self.sock = None
        self.username = None
        self.password = None
        self.admin_password = None
        self._buffer = ""

    def __enter__(self):
        self.connect()
        self.register_and_login()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.cleanup()
        return False

    def connect(self):
        """连接到 MUD"""
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect((self.host, self.port))
        self._recv_until("您的英文名字", timeout=10)
        if self.verbose:
            print(f"[连接成功] {self.host}:{self.port}")

    def _recv(self, timeout=2):
        """接收数据"""
        self.sock.settimeout(timeout)
        try:
            data = self.sock.recv(4096)
            return data.decode("utf-8", errors="ignore")
        except socket.timeout:
            return ""
        except Exception as e:
            if self.verbose:
                print(f"[接收错误] {e}")
            return ""

    def _send(self, text):
        """发送数据"""
        self.sock.sendall((text + "\n").encode("utf-8"))
        if self.verbose:
            print(f"[发送] {text}")

    def _recv_until(self, marker, timeout=10):
        """接收直到出现标记字符串"""
        start = time.time()
        accumulated = ""
        while time.time() - start < timeout:
            chunk = self._recv(timeout=1)
            if not chunk:
                continue
            accumulated += chunk
            if marker in accumulated:
                return accumulated
        return accumulated

    def _strip_ansi(self, text):
        """去除 ANSI 转义序列"""
        ansi_escape = re.compile(r'\x1b\[[0-9;]*m')
        return ansi_escape.sub('', text)

    def register_and_login(self):
        """注册并登录（确定性盲发序列）"""
        # 生成随机账号
        self.username = "t" + "".join(random.choices(string.ascii_lowercase, k=7))
        self.admin_password = "adm" + "".join(random.choices(string.ascii_letters + string.digits, k=8))
        self.password = "pw" + "".join(random.choices(string.ascii_letters + string.digits, k=8))

        if self.verbose:
            print(f"[注册] 用户名={self.username}, 密码={self.password}")

        # 确定性注册序列（盲发，不依赖提示匹配）
        self._send(self.username)           # 1. 英文名字
        time.sleep(0.5)
        self._send("y")                     # 2. 确认创建角色
        time.sleep(0.5)
        self._send("测")                    # 3. 中文姓氏
        time.sleep(0.5)
        self._send("试")                    # 4. 中文名字
        time.sleep(0.5)
        self._send(self.admin_password)     # 5. 管理密码
        time.sleep(0.5)
        self._send(self.admin_password)     # 6. 确认管理密码
        time.sleep(0.5)
        self._send(self.password)           # 7. 普通密码
        time.sleep(0.5)
        self._send(self.password)           # 8. 确认普通密码
        time.sleep(0.5)
        self._send("m")                     # 9. 性别

        # 等待进入世界（出现提示符 > 或中文提示）
        output = self._recv_until(">", timeout=15)
        if self.verbose:
            print(f"[登录成功] 输出长度={len(output)}")

        # 关闭分页器
        self._send("set no_more 1")
        time.sleep(0.5)
        self._recv(timeout=1)

    def exec(self, command, quiet_period=2.0):
        """执行命令并返回输出"""
        self._send(command)
        time.sleep(quiet_period)
        output = ""
        while True:
            chunk = self._recv(timeout=1)
            if not chunk:
                break
            output += chunk
            if len(chunk) < 100:  # 小数据块，可能结束
                break
        return self._strip_ansi(output)

    def cleanup(self):
        """清理：退出并删除账号文件"""
        if not self.sock:
            return

        try:
            # 退出游戏
            self._send("quit")
            time.sleep(1)
            self.sock.close()
        except Exception:
            pass

        # 删除账号文件
        if self.username:
            first_char = self.username[0]
            user_file = f"data/user/{first_char}/{self.username}.o"
            login_file = f"data/login/{first_char}/{self.username}.o"

            for f in [user_file, login_file]:
                if os.path.exists(f):
                    try:
                        os.remove(f)
                        if self.verbose:
                            print(f"[清理] 删除 {f}")
                    except Exception as e:
                        if self.verbose:
                            print(f"[清理失败] {f}: {e}")

        if self.verbose:
            print("[清理完成]")


def main():
    """CLI 入口"""
    parser = argparse.ArgumentParser(description="MUD 临时账号测试工具")
    parser.add_argument("--host", default="127.0.0.1", help="MUD 主机")
    parser.add_argument("--port", type=int, default=6666, help="MUD 端口")
    parser.add_argument("--exec", action="append", dest="commands", help="执行的命令（可多次指定）")
    parser.add_argument("-v", "--verbose", action="store_true", help="详细输出")
    args = parser.parse_args()

    with MUDTestHarness(host=args.host, port=args.port, verbose=args.verbose) as h:
        if args.commands:
            for cmd in args.commands:
                print(f"\n>>> {cmd}")
                output = h.exec(cmd)
                print(output)
        else:
            print("登录成功，使用 --exec 执行命令")


if __name__ == "__main__":
    main()
