// ===== 增强版 MUD 客户端 — 核心类定义 =====

class AdvancedMUDClient {
    constructor() {
        this.ws = null;
        this.telnet = null;
        // 持久化 UTF-8 解码器：以流式模式跨 WebSocket 帧重组被拆分的多字节字符，避免中文乱码
        this.decoder = new TextDecoder('utf-8');
        // 持久化 telnet 解析状态：让 IAC 命令与 SB..SE 子协商（含 GMCP）能跨 WebSocket 帧续接，避免半截包被丢弃或泄露成乱码
        this._tn = { iac: false, sub: false, subType: null, subBuffer: [], cmd: null, needType: false, needOption: false };
        this.connected = false;
        this.terminal = document.getElementById('terminal');
        this.commandInput = document.getElementById('commandInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.status = document.getElementById('status');
        this.history = [];
        this.historyIndex = -1;
        this.currentInput = '';
        this.heartbeat = null;
        this.cleanupTimeout = null;
        this._expectPassword = false;  // 密码输入状态标记
        this._vitalsReceived = false;   // 是否已收到属性数据
        this._gmcpInitSent = false;     // GMCP 初始化是否已发送
        this._loginDone = false;        // 是否已进入游戏（登录完成）
        this._hpFallbackSent = false;   // hp 兑底是否已发送
        this._lastVitals = null;        // 最近一次状态栏数据（合并用）

        // 轻量触发器规则表：pattern 匹配消息时自动执行 command
        // 新增规则只需往数组加一条，支持 cooldown 防刷
        this._triggers = [
            {
                name: '仙丹自动拾取',
                pattern: /"啪"的一声一颗仙丹掉到你面前。/,
                command: 'get dan',
                enabled: true,
                cooldown: 0,
                builtin: true,
                _lastFired: 0,
            },
        ];
        this._loadTriggers();

        // 别名规则表：输入匹配 pattern 时替换为 command
        this._aliases = [
            {
                name: '方向缩写',
                pattern: 'n',
                command: 'north',
                enabled: true,
                builtin: true,
            },
        ];

        // 快捷键绑定表：按键 → 命令
        this._keybinds = [
            { key: 'F1', command: 'look', enabled: true },
            { key: 'F2', command: 'score', enabled: true },
            { key: 'F3', command: 'i', enabled: true },
        ];

        // 定时任务表：间隔执行命令
        this._timers = [
            {
                name: '状态刷新',
                interval: 30,
                command: 'hp',
                enabled: true,
                builtin: true,
            },
        ];

        // 关键词高亮表：匹配关键词渲染指定颜色
        this._highlights = [
            {
                keyword: '仙丹',
                color: '#ff0',
                enabled: true,
            },
        ];

        // 用户脚本表：自定义 JavaScript 脚本片段
        this._scripts = [
            {
                name: '自动打坐',
                description: '检测到「你盘膝坐下」时自动执行 meditation',
                code: 'onMessage(/你盘膝坐下/, () => sendCommand("meditation"));',
                enabled: false,
                builtin: true,
            },
        ];

        // ANSI 颜色码映射表 (与服务端 ansi.h 对齐)
        this._ansiColorMap = ANSI_COLOR_MAP;

        // 初始化地图组件 Canvas
        if (typeof mapper !== 'undefined') {
            mapper.init(document.getElementById('minimapContent'));
        }

        this.init();
    }

    init() {
        this.retryCount = 0;
        this.maxRetries = 3;
        // 从 localStorage 恢复命令历史
        try {
            const saved = localStorage.getItem('mud_command_history');
            if (saved) this.history = JSON.parse(saved);
        } catch (e) { /* 解析失败则使用空历史 */ }
        this.setupEventListeners();
        this.setupTerminalFeatures();
        this.setupQuickCommands();
        this.setupRoomExits();
        this.setupStatusBar();
        this.setupTerminalExits();
        this.setupHelpModal();
        // 高度定制客户端：无需首屏配置，加载后直接自动连接
        this.connect(this.resolveWsUrl());
    }

    // 计算 WebSocket 连接地址：优先 localStorage 覆盖（调试用），否则按当前页面来源自动推导
    // web 客户端与 MUD 同源部署，故直接连回提供本页面的主机（https 页面用 wss，否则 ws）
    resolveWsUrl() {
        try {
            const saved = localStorage.getItem('mud_client_config');
            if (saved) {
                const cfg = JSON.parse(saved);
                if (cfg && cfg.address) {
                    const protocol = cfg.protocol || (location.protocol === 'https:' ? 'wss://' : 'ws://');
                    const port = cfg.port || '8888';
                    return `${protocol}${cfg.address}:${port}`;
                }
            }
        } catch (e) { /* 无效配置则回退到自动推导 */ }

        const secure = location.protocol === 'https:';
        const host = location.hostname || 'localhost';
        return `${secure ? 'wss://' : 'ws://'}${host}:8888`;
    }

    // 强制清理WebSocket连接和相关资源
    forceCleanup() {
        if (this.cleanupTimeout) {
            clearTimeout(this.cleanupTimeout);
            this.cleanupTimeout = null;
        }

        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }

        if (this.ws) {
            try {
                // 立即关闭连接，不等待缓冲区
                this.ws.close(1000, "强制断开");
                // 移除所有事件监听器
                this.ws.onopen = null;
                this.ws.onmessage = null;
                this.ws.onclose = null;
                this.ws.onerror = null;
                this.ws = null;
            } catch (e) {
                console.warn('清理WebSocket时出错:', e);
            }
        }

        if (this.telnet) {
            this.telnet = null;
        }

        // 重置解码器，丢弃上一连接可能残留的半截多字节序列
        this.decoder = new TextDecoder('utf-8');

        // 重置 telnet 解析状态，避免上一连接半截的 IAC/子协商影响新连接
        this._tn = { iac: false, sub: false, subType: null, subBuffer: [], cmd: null, needType: false, needOption: false };

        // 清空终端缓冲区，避免残留消息
        this.terminal.innerHTML = '';

        // 隐藏状态栏和快捷命令
        const statusBar = document.getElementById('statusBar');
        const quickCmds = document.getElementById('quickCommands');
        if (statusBar) statusBar.classList.remove('visible');
        if (quickCmds) quickCmds.classList.remove('visible');

        this._vitalsReceived = false;
        this._gmcpInitSent = false;
        this._loginDone = false;
        this._hpFallbackSent = false;
        this._lastVitals = null;
        this.connected = false;

        // 断连不清地图——保持探索数据，重连后服务端会推送新房间信息自然更新
        // mapper.reset() 仅在用户主动清除缓存时触发

        // 停止自动行走
        if (typeof pathfinder !== 'undefined') pathfinder.stopWalk();
        if (typeof mapper !== 'undefined') mapper.setHighlightPath(null);

        console.log('🔧 连接已强制清理');
    }

    // 启动心跳检测
    startHeartbeat() {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
        }

        this.heartbeat = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    // 发送空消息检测连接状态
                    this.ws.send('');
                } catch (e) {
                    console.warn('心跳检测失败:', e);
                    this.forceCleanup();
                }
            } else {
                console.log('💔 心跳检测发现连接断开');
                this.forceCleanup();
            }
        }, 30000); // 30秒心跳
    }

    // 停止心跳检测
    stopHeartbeat() {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
    }

    connect(wsUrl) {
        try {
            // 先强制清理之前的连接
            this.forceCleanup();

            this.status.textContent = '正在连接...';
            this.status.className = 'status connecting';

            // 添加时间戳防止缓存
            const cleanUrl = wsUrl.includes('?') ?
                `${wsUrl}&t=${Date.now()}` :
                `${wsUrl}?t=${Date.now()}`;

            // 固定 telnet 子协议：驱动据此发送二进制 telnet 流（含 GMCP 子协商）
            this.ws = new WebSocket(cleanUrl, ['telnet']);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                this.connected = true;
                this.retryCount = 0;
                this.status.textContent = '已连接';
                this.status.className = 'status connected';
                this.commandInput.disabled = false;
                this.sendBtn.disabled = false;

                // 显示状态栏和快捷命令
                const statusBar = document.getElementById('statusBar');
                const quickCmds = document.getElementById('quickCommands');
                if (statusBar) statusBar.classList.add('visible');
                if (quickCmds) quickCmds.classList.add('visible');

                // 启动心跳检测
                this.startHeartbeat();

                // 延迟初始化 Telnet 协商，确保连接稳定（协商过程不再打扰用户，仅出错时提示）
                this.cleanupTimeout = setTimeout(() => {
                    this.initTelnetNegotiation();
                    // 连接 GMCPHandler 回调，将数据流转到 UI 更新
                    if (this.telnet && this.telnet.gmcp) {
                        this.telnet.gmcp.onMessage = (module, data) => {
                            this.processGMCPData({ module, data });
                        };
                    }
                    // hp 兑底改由登录完成检测触发（见 appendMessage 中的 _loginDone 逻辑）
                }, 500);
            };

            this.ws.onmessage = (event) => {
                // telnet 二进制流经 handleTelnetData 解析，文本帧由其内部 handleMessage 处理
                this.handleTelnetData(event.data);
            };

            this.ws.onclose = () => {
                this.connected = false;
                this.stopHeartbeat();

                this.status.textContent = '已断开';
                this.status.className = 'status disconnected';
                this.commandInput.disabled = true;
                this.sendBtn.disabled = true;

                // 隐藏状态栏、快捷命令和小地图
                const statusBar = document.getElementById('statusBar');
                const quickCmds = document.getElementById('quickCommands');
                const minimap = document.getElementById('minimapPanel');
                if (statusBar) statusBar.classList.remove('visible');
                if (quickCmds) quickCmds.classList.remove('visible');
                if (minimap) minimap.classList.remove('visible');

                this.appendMessage('🔌 连接已断开', 'error');

                // 延迟清理，确保所有资源释放
                this.cleanupTimeout = setTimeout(() => {
                    this.forceCleanup();
                }, 1000);

                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    setTimeout(() => {
                        this.appendMessage(`🔄 正在重连...(${this.retryCount}/${this.maxRetries})`, 'system');
                        this.connect(this.resolveWsUrl());
                    }, 2000 * this.retryCount);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.appendMessage('❌ 连接错误，请检查网络', 'error');
            };

        } catch (error) {
            console.error('Connection failed:', error);
            this.appendMessage('❌ 创建连接失败: ' + error.message, 'error');
        }
    }

    initTelnetNegotiation() {
        // 主动声明我们支持的Telnet选项
        this.sendTelnetCommand(TELNET.WILL, TELNET.TERMINAL_TYPE);
        this.sendTelnetCommand(TELNET.WILL, TELNET.NAWS);
        this.sendTelnetCommand(TELNET.WILL, TELNET.GMCP);
        this.sendTelnetCommand(TELNET.WILL, TELNET.SUPPRESS_GO_AHEAD);

        // 请求服务器支持的选项
        this.sendTelnetCommand(TELNET.DO, TELNET.TERMINAL_TYPE);
        this.sendTelnetCommand(TELNET.DO, TELNET.NAWS);
        this.sendTelnetCommand(TELNET.DO, TELNET.GMCP);
        this.sendTelnetCommand(TELNET.DO, TELNET.SUPPRESS_GO_AHEAD);
        this.sendTelnetCommand(TELNET.DO, TELNET.MSP); // 客户端请求MSP支持

        // 发送窗口大小
        this.sendWindowSize();
    }

    handleTelnetDo(option) {
        switch (option) {
            case TELNET.TERMINAL_TYPE:
                this.sendTelnetCommand(TELNET.WILL, TELNET.TERMINAL_TYPE);
                break;
            case TELNET.NAWS:
                this.sendTelnetCommand(TELNET.WILL, TELNET.NAWS);
                this.sendWindowSize();
                break;
            case TELNET.GMCP:
                this.sendTelnetCommand(TELNET.WILL, TELNET.GMCP);
                this.ensureGMCPInit();
                break;
            default:
                this.sendTelnetCommand(TELNET.WONT, option);
        }
    }

    handleTelnetDont(option) {
        this.sendTelnetCommand(TELNET.WONT, option);
    }

    handleTelnetWill(option) {
        switch (option) {
            case TELNET.GMCP:
                // 服务器支持GMCP，客户端确认并初始化（缺少此分支会回DONT导致服务端禁用GMCP）
                this.sendTelnetCommand(TELNET.DO, TELNET.GMCP);
                this.ensureGMCPInit();
                break;
            case TELNET.SUPPRESS_GO_AHEAD:
                this.sendTelnetCommand(TELNET.DO, TELNET.SUPPRESS_GO_AHEAD);
                break;
            case TELNET.ECHO:
                // 拒绝服务端回显，由客户端本地回显（服务端WebSocket驱动实际不回显）
                this.sendTelnetCommand(TELNET.DONT, TELNET.ECHO);
                break;
            case TELNET.MSP:
                // 服务器支持MSP，客户端确认
                this.sendTelnetCommand(TELNET.DO, TELNET.MSP);
                // 初始化MSP处理器
                if (this.telnet && this.telnet.msp) {
                    this.telnet.msp.enable();
                }
                break;
            default:
                this.sendTelnetCommand(TELNET.DONT, option);
        }
    }

    handleTelnetWont(option) {
        this.sendTelnetCommand(TELNET.DONT, option);
    }

    handleSubnegotiation(type, data) {
        switch (type) {
            case TELNET.TERMINAL_TYPE:
                if (data[0] === 1) { // SEND
                    this.sendTerminalType();
                }
                break;
            case TELNET.NAWS:
                // 服务器发送的窗口大小请求
                break;
            case TELNET.GMCP:
                this.handleGMCPData(data);
                break;
            case TELNET.MSP:
                const text = new TextDecoder().decode(Uint8Array.from(data));
                console.log('📡 子协商 MSP:', text);
                break;
        }
    }

    sendTelnetCommand(command, option) {
        const bytes = new Uint8Array([TELNET.IAC, command, option]);
        this.ws.send(bytes);
    }

    sendSubnegotiation(type, data) {
        const bytes = [TELNET.IAC, TELNET.SB, type, ...data, TELNET.IAC, TELNET.SE];
        this.ws.send(Uint8Array.from(bytes));
    }

    sendTerminalType() {
        const type = new TextEncoder().encode('websocket-client');
        this.sendSubnegotiation(TELNET.TERMINAL_TYPE, [0, ...Array.from(type)]);
    }

    sendWindowSize() {
        const width = Math.floor(window.innerWidth / 8);
        const height = Math.floor(window.innerHeight / 16);
        const bytes = [
            (width >> 8) & 0xFF, width & 0xFF,
            (height >> 8) & 0xFF, height & 0xFF
        ];
        this.sendSubnegotiation(TELNET.NAWS, bytes);
    }

    // GMCP 初始化只执行一次（服务端 WILL GMCP 和 DO GMCP 都会触发）
    ensureGMCPInit() {
        if (this._gmcpInitSent) return;
        this._gmcpInitSent = true;
        this.initGMCP();
    }

    initGMCP() {
        this.sendGMCP('Client.GUI', {
            version: '1.0.0',
            type: 'websocket',
            client: 'FluffOS-WebClient'
        });

        // 请求服务端推送角色状态和房间信息
        this.sendGMCP('Char.Vitals.Get', {});
        this.sendGMCP('Room.Info.Get', {});

        this.sendWindowSize();
    }

    sendGMCP(module, data) {
        const message = module + ' ' + JSON.stringify(data);
        const bytes = new TextEncoder().encode(message);
        this.sendSubnegotiation(TELNET.GMCP, Array.from(bytes));
    }

    handleGMCPData(data) {
        try {
            const text = new TextDecoder().decode(Uint8Array.from(data));

            const spaceIndex = text.indexOf(' ');
            const module = spaceIndex > -1 ? text.substring(0, spaceIndex) : text;
            const jsonData = spaceIndex > -1 ? text.substring(spaceIndex + 1) : '';

            if (jsonData) {
                const parsed = JSON.parse(jsonData);
                this.handleGMCPMessage({ module, data: parsed });
            }
        } catch (e) {
            console.warn('GMCP解析错误:', e);
        }
    }

    // 触发器完整持久化：内置规则保存 enabled 状态，用户规则保存完整定义
    _saveTriggers() {
        try {
            const data = this._triggers.map(t => {
                if (t.builtin) return { name: t.name, enabled: t.enabled, builtin: true };
                return { name: t.name, pattern: t.pattern.source, command: t.command, cooldown: t.cooldown, enabled: t.enabled };
            });
            localStorage.setItem('mud_triggers', JSON.stringify(data));
        } catch (e) { /* 存储失败忽略 */ }
    }

    // 触发器恢复：内置规则恢复 enabled，用户规则追加到列表
    _loadTriggers() {
        try {
            // 兼容旧版：迁移 mud_trigger_states → mud_triggers
            const oldKey = localStorage.getItem('mud_trigger_states');
            if (oldKey && !localStorage.getItem('mud_triggers')) {
                const oldStates = JSON.parse(oldKey);
                for (const s of oldStates) {
                    const trigger = this._triggers.find(t => t.name === s.name && t.builtin);
                    if (trigger) trigger.enabled = s.enabled;
                }
                localStorage.removeItem('mud_trigger_states');
                this._saveTriggers();
                return;
            }

            const saved = localStorage.getItem('mud_triggers');
            if (!saved) return;
            const data = JSON.parse(saved);
            for (const d of data) {
                if (d.builtin) {
                    // 内置规则：仅恢复 enabled 状态
                    const trigger = this._triggers.find(t => t.name === d.name && t.builtin);
                    if (trigger) trigger.enabled = d.enabled;
                } else {
                    // 用户规则：重建并追加
                    this._triggers.push({
                        name: d.name,
                        pattern: new RegExp(d.pattern),
                        command: d.command,
                        enabled: d.enabled !== false,
                        cooldown: d.cooldown || 0,
                        _lastFired: 0,
                    });
                }
            }
        } catch (e) { /* 解析失败忽略 */ }
    }

    // 添加用户触发器
    addTrigger(name, pattern, command, cooldown) {
        this._triggers.push({
            name: name,
            pattern: new RegExp(pattern),
            command: command,
            enabled: true,
            cooldown: cooldown || 0,
            _lastFired: 0,
        });
        this._saveTriggers();
    }

    // 更新触发器（按索引）
    updateTrigger(index, fields) {
        const t = this._triggers[index];
        if (!t || t.builtin) return;
        if (fields.name !== undefined) t.name = fields.name;
        if (fields.pattern !== undefined) t.pattern = new RegExp(fields.pattern);
        if (fields.command !== undefined) t.command = fields.command;
        if (fields.cooldown !== undefined) t.cooldown = fields.cooldown;
        if (fields.enabled !== undefined) t.enabled = fields.enabled;
        this._saveTriggers();
    }

    // 删除触发器（按索引，仅允许非内置）
    removeTrigger(index) {
        const t = this._triggers[index];
        if (!t || t.builtin) return;
        this._triggers.splice(index, 1);
        this._saveTriggers();
    }

    // 导出用户触发器为 JSON 字符串
    exportTriggers() {
        const userTriggers = this._triggers
            .filter(t => !t.builtin)
            .map(t => ({ name: t.name, pattern: t.pattern.source, command: t.command, cooldown: t.cooldown, enabled: t.enabled }));
        return JSON.stringify(userTriggers, null, 2);
    }

    // 从 JSON 字符串导入触发器（追加，不覆盖）
    importTriggers(jsonStr) {
        const items = JSON.parse(jsonStr);
        for (const d of items) {
            if (!d.name || !d.pattern || !d.command) continue;
            // 避免重复导入同名规则
            if (this._triggers.some(t => t.name === d.name && !t.builtin)) continue;
            this._triggers.push({
                name: d.name,
                pattern: new RegExp(d.pattern),
                command: d.command,
                enabled: d.enabled !== false,
                cooldown: d.cooldown || 0,
                _lastFired: 0,
            });
        }
        this._saveTriggers();
    }
}
