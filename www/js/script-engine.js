// ===== 用户脚本引擎 — 受限作用域沙箱 =====
// 方案 B：Function 构造器 + 闭包注入 API
// 脚本内无法直接访问 window/document，仅能通过注入的 API 与客户端交互

class ScriptEngine {
    constructor(client) {
        this.client = client;
        // 每个已启用脚本的运行时状态
        // Map<name, { timers: number[], messageHandlers: {pattern, callback}[], fn: Function }>
        // timers 混合存储 setInterval 和 setTimeout 的 ID，stop 时双重清理
        this._runtime = new Map();
    }

    // ===== 生命周期 =====

    // 启动一个脚本（启用时调用）
    start(script) {
        if (this._runtime.has(script.name)) return;

        const runtime = {
            timers: [],
            messageHandlers: [],
            fn: null,
        };

        // 构建注入给脚本的 API 对象
        const api = this._buildApi(script.name, runtime);

        // 用 Function 构造器创建受限闭包
        // 参数名即 API 名称，脚本内可直接调用
        try {
            runtime.fn = new Function(
                'onMessage', 'sendCommand', 'getVitals', 'getCurrentRoom',
                'registerTimer', 'sleep', 'log', 'isConnected',
                script.code
            );
        } catch (e) {
            this._reportError(script.name, '编译失败: ' + e.message);
            return;
        }

        // 执行脚本注册阶段：脚本顶层应只有 onMessage/registerTimer 调用
        try {
            runtime.fn(
                api.onMessage, api.sendCommand, api.getVitals,
                api.getCurrentRoom, api.registerTimer, api.sleep,
                api.log, api.isConnected
            );
        } catch (e) {
            this._reportError(script.name, '初始化失败: ' + e.message);
            // 清理已注册的定时器（setTimeout + setInterval ID 双重清理）
            runtime.timers.forEach(id => { clearTimeout(id); clearInterval(id); });
            this._runtime.delete(script.name);
            return;
        }

        this._runtime.set(script.name, runtime);
    }

    // 停止一个脚本（禁用/删除时调用）
    stop(name) {
        const runtime = this._runtime.get(name);
        if (!runtime) return;

        // 清理所有定时器（setTimeout + setInterval ID 双重清理）
        runtime.timers.forEach(id => { clearTimeout(id); clearInterval(id); });
        // 清理消息处理器
        runtime.messageHandlers.length = 0;
        runtime.fn = null;

        this._runtime.delete(name);
    }

    // 停止所有脚本（断连/页面卸载时调用）
    stopAll() {
        for (const name of this._runtime.keys()) {
            this.stop(name);
        }
    }

    // ===== 消息分发 =====

    // 将每条收到的消息喂给所有已启用脚本的 onMessage 回调
    feedMessage(message) {
        for (const [name, runtime] of this._runtime) {
            for (const handler of runtime.messageHandlers) {
                try {
                    if (handler.pattern.test(message)) {
                        handler.callback(message, handler.pattern.exec(message));
                    }
                } catch (e) {
                    this._reportError(name, '消息回调异常: ' + e.message);
                }
            }
        }
    }

    // ===== 查询 =====

    // 检查某脚本是否正在运行
    isRunning(name) {
        return this._runtime.has(name);
    }

    // ===== 内部方法 =====

    _buildApi(scriptName, runtime) {
        return {
            // 注册消息匹配回调
            onMessage: (pattern, callback) => {
                if (!(pattern instanceof RegExp)) {
                    throw new TypeError('onMessage 第一个参数必须是 RegExp');
                }
                if (typeof callback !== 'function') {
                    throw new TypeError('onMessage 第二个参数必须是函数');
                }
                runtime.messageHandlers.push({ pattern, callback });
            },

            // 发送命令到服务端
            sendCommand: (cmd) => {
                if (typeof cmd !== 'string' || !cmd.trim()) return;
                this.client.sendCommand(cmd.trim());
            },

            // 获取当前角色状态（返回副本，防止脚本篡改内部数据）
            getVitals: () => {
                return Object.assign({}, this.client._lastVitals || {});
            },

            // 获取当前房间信息
            getCurrentRoom: () => {
                const m = this.client._lastRoomInfo;
                return m ? Object.assign({}, m) : null;
            },

            // 注册定时执行（毫秒），返回定时器 ID（脚本内可用于 clearInterval）
            registerTimer: (intervalMs, callback) => {
                if (typeof intervalMs !== 'number' || intervalMs < 100) {
                    throw new RangeError('registerTimer 间隔至少 100ms');
                }
                if (typeof callback !== 'function') {
                    throw new TypeError('registerTimer 第二个参数必须是函数');
                }
                const id = setInterval(() => {
                    try {
                        callback();
                    } catch (e) {
                        this._reportError(scriptName, '定时器回调异常: ' + e.message);
                    }
                }, intervalMs);
                runtime.timers.push(id);
                return id;
            },

            // 延迟执行（一次性），返回 Promise，配合 async/await 实现顺序延迟
            // 脚本停止时自动取消未完成的 sleep
            sleep: (ms) => {
                if (typeof ms !== 'number' || ms < 100) {
                    throw new RangeError('sleep 延迟至少 100ms');
                }
                return new Promise((resolve) => {
                    const id = setTimeout(() => {
                        runtime.timers = runtime.timers.filter(t => t !== id);
                        resolve();
                    }, ms);
                    runtime.timers.push(id);
                });
            },

            // 日志输出到终端（system 类型）
            log: (msg) => {
                if (typeof msg !== 'string') return;
                this.client.appendMessage('📜 [' + scriptName + '] ' + msg, 'system');
            },

            // 检查当前是否已连接
            isConnected: () => {
                return this.client.connected === true;
            },
        };
    }

    _reportError(scriptName, detail) {
        const msg = '❌ 脚本[' + scriptName + '] ' + detail;
        if (this.client.appendMessage) {
            this.client.appendMessage(msg, 'system');
        }
        console.warn('[ScriptEngine] ' + scriptName + ': ' + detail);
    }
}
