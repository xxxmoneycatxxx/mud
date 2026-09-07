// ===== UI 事件、命令处理、消息显示、ANSI 解析 — AdvancedMUDClient 原型扩展 =====

// 方向命令 → 紧凑中文标签（未收录的自定义出口原样显示）
AdvancedMUDClient.prototype.dirLabel = function (dir) {
    const map = {
        'north': '北', 'south': '南', 'east': '东', 'west': '西',
        'up': '上', 'down': '下',
        'northeast': '东北', 'northwest': '西北',
        'southeast': '东南', 'southwest': '西南',
        'in': '进', 'out': '出', 'enter': '进入', 'leave': '离开'
    };
    return map[dir] || dir;
};

AdvancedMUDClient.prototype.setupQuickCommands = function () {
    const qcContainer = document.getElementById('quickCommands');
    if (!qcContainer) return;

    // 方向移动改由房间信息栏的可点击出口承担（点击移动），
    // 此处只保留与当前房间无关的通用动作键
    const actions = [
        { label: 'look', cmd: 'look' },
        { label: 'score', cmd: 'score' },
        { label: 'i', cmd: 'i' },
        { label: 'hp', cmd: 'hp' },
    ];

    actions.forEach(a => {
        const btn = document.createElement('button');
        btn.className = 'qc-btn';
        btn.textContent = a.label;
        btn.addEventListener('click', () => {
            this.commandInput.value = a.cmd;
            this.handleSendCommand();
        });
        qcContainer.appendChild(btn);
    });
};

// 小地图出口按钮点击委托 + 折叠/展开切换
AdvancedMUDClient.prototype.setupRoomExits = function () {
    const exitsContainer = document.getElementById('minimapExits');
    if (exitsContainer) {
        exitsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.exit-btn');
            if (!btn || !this.connected) return;
            const cmd = btn.getAttribute('data-cmd');
            if (!cmd) return;
            this.commandInput.value = cmd;
            this.handleSendCommand();
        });
    }

    // 折叠/展开按钮
    const toggleBtn = document.getElementById('minimapToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            this.toggleMinimap();
        });
    }
};

// 终端可点击链接委托：look/l 出口（点击移动）+ 文档内 help 交叉引用（点击查阅），历史消息同样生效
AdvancedMUDClient.prototype.setupTerminalExits = function () {
    if (!this.terminal) return;
    this.terminal.addEventListener('click', (e) => {
        const link = e.target.closest('.exit-link, .help-link');
        if (!link || !this.connected) return;
        const cmd = link.getAttribute('data-cmd');
        if (!cmd) return;
        this.commandInput.value = cmd;
        this.handleSendCommand();
    });
};

AdvancedMUDClient.prototype.setupTerminalFeatures = function () {
    // 监听窗口大小变化
    window.addEventListener('resize', () => {
        if (this.telnet) {
            this.telnet.updateTerminalSize();
        }
    });

    // 标签页切回时重新渲染地图（浏览器可能在隐藏时丢弃 Canvas 绘制）
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && typeof mapper !== 'undefined') {
            mapper.render();
        }
    });
};

AdvancedMUDClient.prototype.processGMCPData = function (data) {
    if (!data || !data.module) return;

    try {
        switch (data.module) {
            case 'Char.Vitals':
                this._vitalsReceived = true;
                this.updateCharacterStatus(data.data);
                break;
            case 'Room.Info':
                this.updateRoomInfo(data.data);
                break;
            case 'Client.Map':
                if (data.data && data.data.url) {
                    mapper.setMapUrl(data.data.url);
                }
                break;
            case 'Help.Topics':
                this.applyHelpTopics(data.data);
                break;
            case 'Help.Search':
                this.applyHelpSearchResults(data.data);
                break;
            case 'Client.GUI':
                break;
        }
    } catch (e) {
        console.warn('GMCP处理异常:', data.module, e);
    }
};

AdvancedMUDClient.prototype.setupTelnetEvents = function () {
    if (!this.telnet) return;

    this.telnet.on('gmcp', (data) => {
        this.handleGMCPMessage(data);
    });
};

AdvancedMUDClient.prototype.handleGMCPMessage = function (data) {
    // 可以在这里添加GMCP数据的实际处理逻辑
    this.processGMCPData(data);
};

AdvancedMUDClient.prototype.updateCharacterStatus = function (vitals) {
    const statsLine = document.getElementById('statsLine');
    if (!statsLine) return;

    // 合并增量数据，避免部分字段缺失时被归零
    this._lastVitals = Object.assign(this._lastVitals || {}, vitals);
    const v = this._lastVitals;

    const stats = [
        { label: '气血', cur: v.hp, max: v.max_hp, cls: '' },
        { label: '精气', cur: v.jing, max: v.max_jing, cls: '' },
        { label: '精力', cur: v.jingli, max: v.max_jingli, cls: '' },
        { label: '内力', cur: v.neili, max: v.max_neili, cls: '' },
        { label: '食物', cur: v.food, max: v.max_food, cls: '' },
        { label: '水',   cur: v.water, max: v.max_water, cls: '' },
    ];
    const texts = [
        { label: '经验', val: (v.exp || 0).toLocaleString(), cls: 'exp' },
        { label: '潜能', val: String(v.pot || 0), cls: 'pot' },
    ];

    let html = '';

    // Gauge 进度条
    stats.forEach(function (s) {
        const cur = s.cur || 0;
        const max = s.max || 0;
        const pct = max > 0 ? Math.min(100, Math.round(cur / max * 100)) : 0;
        const color = pct > 60 ? 'green' : pct > 30 ? 'amber' : 'red';
        const critical = (s.label === '气血' && pct <= 30 && max > 0) ? ' critical' : '';
        html += '<div class="stat-gauge' + critical + '">'
            + '<span class="gauge-label">' + s.label + '</span>'
            + '<div class="gauge-track"><div class="gauge-fill ' + color + '" style="width:' + pct + '%"></div></div>'
            + '<span class="gauge-text">' + cur + '/' + max + '</span>'
            + '</div>';
    });

    // 纯文本项（经验/潜能）
    texts.forEach(function (t) {
        html += '<div class="stat-text">'
            + '<span class="label">' + t.label + '</span>'
            + '<span class="val ' + t.cls + '">' + t.val + '</span>'
            + '</div>';
    });

    statsLine.innerHTML = html;
    document.getElementById('statusBar').classList.add('visible');
};

AdvancedMUDClient.prototype.updateRoomInfo = function (roomInfo) {
    const panel = document.getElementById('minimapPanel');
    const title = document.getElementById('minimapTitle');
    const exits = document.getElementById('minimapExits');
    if (!panel || !title || !exits) return;
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 更新标题：房间名 + 区域
    let titleText = esc(roomInfo.name || '未知');
    if (roomInfo.area) titleText += ' <span style="color:#888;font-weight:normal;font-size:11px;">[' + esc(roomInfo.area) + ']</span>';
    title.innerHTML = titleText;

    // 更新出口按钮
    exits.innerHTML = '';
    if (roomInfo.exits && roomInfo.exits.length > 0) {
        roomInfo.exits.forEach(dir => {
            const btn = document.createElement('button');
            btn.className = 'exit-btn';
            btn.setAttribute('data-cmd', esc(dir));
            btn.title = '移动: ' + esc(dir);
            btn.textContent = this.dirLabel(dir);
            exits.appendChild(btn);
        });
    }

    // 新房间到达，清空小地图内容
    this.clearMinimap();

    // 将房间数据喂给地图组件，构建房间图并渲染
    mapper.updateRoom(roomInfo);

    // 显示面板
    panel.classList.add('visible');
};

// ===== 小地图 =====

// 清空小地图内容（新房间到达时调用）
AdvancedMUDClient.prototype.clearMinimap = function () {
    // Canvas 内容由 mapper.render() 管理，此处无需手动清空
};

// 切换小地图折叠/展开
AdvancedMUDClient.prototype.toggleMinimap = function () {
    const panel = document.getElementById('minimapPanel');
    const toggle = document.getElementById('minimapToggle');
    if (!panel) return;
    panel.classList.toggle('collapsed');
    if (toggle) {
        toggle.textContent = panel.classList.contains('collapsed') ? '+' : '\u2212';
    }
    // 展开时重新渲染地图（折叠期间 Canvas 不可见，可能未渲染）
    if (!panel.classList.contains('collapsed') && typeof mapper !== 'undefined') {
        mapper.render();
    }
};

// 从 hp 命令输出中解析属性值，更新状态栏
AdvancedMUDClient.prototype.parseHpOutput = function (text) {
    // 去除 ANSI 转义码
    const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
    const stats = {};
    const labelMap = {
        '气血': 'hp', '精气': 'jing', '精力': 'jingli',
        '内力': 'neili', '食物': 'food', '饮水': 'water',
        '潜能': 'pot', '经验': 'exp'
    };

    // 匹配 【 标 签 】  数值/ 最大值 格式
    const re = /【\s*([^】]+?)\s*】\s+(-+|\d+)\s*\/\s*(-+|\d+)/g;
    let m;
    while ((m = re.exec(clean)) !== null) {
        const label = m[1].replace(/\s+/g, '');
        const key = labelMap[label];
        if (key) {
            const cur = m[2] === '---' ? 0 : parseInt(m[2]);
            const max = m[3] === '---' ? 0 : parseInt(m[3]);
            if (!isNaN(cur)) stats[key] = cur;
            if (!isNaN(max)) stats['max_' + key] = max;
        }
    }

    // 匹配单独数值：【 潜 能 】  211  或  【 经 验 】  171
    const re2 = /【\s*([^】]+?)\s*】\s+(\d+)/g;
    while ((m = re2.exec(clean)) !== null) {
        const label = m[1].replace(/\s+/g, '');
        const key = labelMap[label];
        if (key && stats[key] === undefined) {
            stats[key] = parseInt(m[2]);
        }
    }

    // 仅接受完整 hp 输出（气血+精气必然同时存在），
    // 避免其他含【标签】数字的文本部分匹配后覆盖状态栏
    if (stats.hp !== undefined && stats.jing !== undefined) {
        this._vitalsReceived = true;
        this.updateCharacterStatus(stats);
    }
};

AdvancedMUDClient.prototype.handleTelnetData = function (data) {
    if (data instanceof ArrayBuffer) {
        data = new Uint8Array(data);
    } else if (data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
            this.processTelnetBytes(new Uint8Array(reader.result));
        };
        reader.readAsArrayBuffer(data);
        return;
    } else if (typeof data === 'string') {
        this.handleMessage(data);
        return;
    }

    this.processTelnetBytes(new Uint8Array(data));
};

AdvancedMUDClient.prototype.processTelnetBytes = function (bytes) {
    // 解析状态保存在 this._tn（实例字段），可跨 WebSocket 帧续接：
    // 无论 IAC 命令还是 SB..SE 子协商（含 GMCP）被拆分到相邻帧，都能正确重组，
    // 不会丢包，也不会把半截 JSON 当成文本泄露到终端。
    const st = this._tn;
    const result = [];
    let i = 0;

    while (i < bytes.length) {
        const byte = bytes[i];

        if (st.iac) {
            // 上一字节是 IAC，本字节决定其含义
            st.iac = false;
            i++;
            if (byte === TELNET.IAC) {
                // IAC IAC -> 字面 0xFF 数据字节
                if (st.sub) st.subBuffer.push(TELNET.IAC);
                else result.push(TELNET.IAC);
            } else if (byte === TELNET.SB) {
                // 子协商开始，等待下一字节作为类型
                st.sub = true;
                st.subBuffer = [];
                st.subType = null;
                st.needType = true;
            } else if (byte === TELNET.SE) {
                // 子协商结束，派发完整缓冲区
                st.sub = false;
                st.needType = false;
                this.handleSubnegotiation(st.subType, st.subBuffer);
                st.subType = null;
                st.subBuffer = [];
            } else if (byte === TELNET.DO || byte === TELNET.DONT ||
                       byte === TELNET.WILL || byte === TELNET.WONT) {
                // 三字节命令，等待下一字节作为 option
                st.cmd = byte;
                st.needOption = true;
            } else {
                // 两字节命令（GA/NOP/EOR 等），立即处理，不误吃后续数据字节
                this.handleTelnetCommand(byte, null);
            }
        } else if (st.needType) {
            // SB 之后的第一个字节是子协商类型（如 GMCP=201）
            st.subType = byte;
            st.needType = false;
            i++;
        } else if (st.needOption) {
            // 三字节命令的 option 字节
            this.handleTelnetCommand(st.cmd, byte);
            st.cmd = null;
            st.needOption = false;
            i++;
        } else if (byte === TELNET.IAC) {
            st.iac = true;
            i++;
        } else if (st.sub) {
            st.subBuffer.push(byte);
            i++;
        } else {
            result.push(byte);
            i++;
        }
    }

    if (result.length > 0) {
        // stream:true 让解码器缓存帧尾残缺的多字节序列，与下一帧拼接后再输出，
        // 从根本上避免中文（UTF-8 三字节）被跨帧拆分导致的 "?" 乱码
        const text = this.decoder.decode(Uint8Array.from(result), { stream: true });
        this.handleMessage(text);
    }
};

AdvancedMUDClient.prototype.handleTelnetCommand = function (command, option) {
    const commandNames = {
        [TELNET.DO]: 'DO', [TELNET.DONT]: 'DONT',
        [TELNET.WILL]: 'WILL', [TELNET.WONT]: 'WONT',
        [TELNET.GA]: 'GA', [TELNET.EL]: 'EL', [TELNET.EC]: 'EC',
        [TELNET.AYT]: 'AYT', [TELNET.AO]: 'AO', [TELNET.IP]: 'IP',
        [TELNET.BRK]: 'BRK', [TELNET.DM]: 'DM', [TELNET.NOP]: 'NOP',
        [TELNET.EOR]: 'EOR'
    };

    const optionNames = {
        [TELNET.TERMINAL_TYPE]: 'TERMINAL_TYPE', [TELNET.NAWS]: 'NAWS',
        [TELNET.GMCP]: 'GMCP', [TELNET.SUPPRESS_GO_AHEAD]: 'SUPPRESS_GO_AHEAD',
        [TELNET.ECHO]: 'ECHO', [TELNET.NEW_ENVIRON]: 'NEW_ENVIRON',
        [TELNET.CHARSET]: 'CHARSET', [TELNET.MXP]: 'MXP',
        [TELNET.MSP]: 'MSP', [TELNET.ZMP]: 'ZMP',
        [TELNET.MSSP]: 'MSSP', [TELNET.MSDP]: 'MSDP',
        [TELNET.MCCP]: 'MCCP'
    };

    const cmdName = commandNames[command] || `CMD_${command}`;
    const optName = optionNames[option] || `OPT_${option}`;

    // 所有协商信息只记录在控制台
    if ([TELNET.GA, TELNET.EL, TELNET.EC, TELNET.AYT, TELNET.AO, TELNET.IP, TELNET.BRK, TELNET.DM, TELNET.NOP, TELNET.EOR].includes(command)) {
        console.log(`Telnet: ${cmdName}`);
    } else {
        console.log(`Telnet: ${cmdName} ${optName}`);
    }

    switch (command) {
        case TELNET.DO:
            this.handleTelnetDo(option);
            break;
        case TELNET.DONT:
            this.handleTelnetDont(option);
            break;
        case TELNET.WILL:
            this.handleTelnetWill(option);
            break;
        case TELNET.WONT:
            this.handleTelnetWont(option);
            break;
    }
};

// 注：handleTelnetDo/Dont/Will/Wont、handleSubnegotiation、sendTelnetCommand、
// sendSubnegotiation、sendTerminalType、sendWindowSize、ensureGMCPInit、initGMCP、
// sendGMCP、handleGMCPData 等协议方法已移至 client.js 类定义中

AdvancedMUDClient.prototype.handleMessage = function (data) {
    // 检测服务端密码提示，用于控制本地回显（telnet 文本帧经 processTelnetBytes/handleTelnetData 汇入此处）
    if (typeof data === 'string' && /密码|password|passwd/i.test(data)) {
        this._expectPassword = true;
    } else if (typeof data === 'string' && /确认|再输入一次|确认密码/i.test(data)) {
        this._expectPassword = true;
    } else if (typeof data === 'string' && /角色|性别|male.*female|男.*女/i.test(data)) {
        this._expectPassword = false;
    }

    if (data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
            this.appendMessage(reader.result);
        };
        reader.readAsText(data, 'utf-8');
    } else {
        this.appendMessage(data);
    }
};

AdvancedMUDClient.prototype.sendCommand = function (command) {
    if (!this.connected) return;

    if (!command) {
        command = '\n';
    } else if (!command.endsWith('\n')) {
        command += '\n';
    }

    this.ws.send(command);
};

AdvancedMUDClient.prototype.appendMessage = function (message, className) {
    if (className === undefined) className = '';
    // 检测登录完成：进入游戏后自动 look 的房间描述是可靠信号
    // 避免在登录界面误发 hp 等游戏指令
    if (!this._loginDone && /这里明显的出口是|这里唯一的出口是|这里没有任何明显的出路的/.test(message)) {
        this._loginDone = true;
        if (!this._vitalsReceived && !this._hpFallbackSent) {
            this._hpFallbackSent = true;
            setTimeout(() => {
                if (this.connected && !this._vitalsReceived) {
                    console.warn('GMCP未生效，发送hp作为兑底');
                    this.sendCommand('hp\n');
                }
            }, 1500);
        }
    }

    // 解析 hp 命令输出，更新状态栏（GMCP 的可靠补充）
    this.parseHpOutput(message);

    const div = document.createElement('div');
    div.className = 'message ' + className;
    let html = this.parseANSI(message);
    // look/l 输出的"明显出口"渲染成可点击链接（点击移动）
    if (/这里明显的出口是|这里唯一的出口是/.test(message)) {
        html = this.linkifyRoomExits(html);
    }
    // 文档正文中的 help <主题> 交叉引用渲染成可点击链接（点击查阅）
    if (/\bhelp\s+[a-z]/.test(html)) {
        html = this.linkifyHelpRefs(html);
    }
    div.innerHTML = html;
    this.terminal.appendChild(div);

    const maxMessages = 1000;
    if (this.terminal.children.length > maxMessages) {
        this.terminal.removeChild(this.terminal.firstChild);
    }

    this.terminal.scrollTop = this.terminal.scrollHeight;
};

AdvancedMUDClient.prototype.parseANSI = function (text) {
    let result = text;
    let openSpans = 0;
    const colorMap = ANSI_COLOR_MAP;

    result = result.replace(/\x1b\[([0-9;]*)m/g, (match, codes) => {
        // 空码 \x1b[m 或 code 0 等同于重置
        if (!codes || codes === '' || codes === '0') {
            const closeTags = '</span>'.repeat(openSpans);
            openSpans = 0;
            return closeTags;
        }

        // 优先匹配复合码 (如 "1;30" = HIK 灰色)
        if (colorMap[codes]) {
            openSpans++;
            return `<span style="${colorMap[codes]}">`;
        }

        // 复合码未命中，拆分为独立代码逐个处理
        const codeArray = codes.split(';');
        let styles = [];
        for (const code of codeArray) {
            if (colorMap[code]) {
                styles.push(colorMap[code]);
            }
        }

        if (styles.length > 0) {
            openSpans++;
            return `<span style="${styles.join(';')}">`;
        }
        return '';
    });

    // 清理光标控制序列
    const cursorPatterns = [
        /\x1b\[\d*[A-D]/g,
        /\x1b\[\d*;\d*[Hf]/g,
        /\x1b\[\d*[JK]/g,
        /\x1b\[[\d;]*[@-~]/g
    ];

    cursorPatterns.forEach(pattern => {
        result = result.replace(pattern, '');
    });

    if (openSpans > 0) {
        result += '</span>'.repeat(openSpans);
    }

    return result;
};

// 将 look 出口句中的方向词渲染为可点击链接（data-cmd 为英文方向命令）
AdvancedMUDClient.prototype.linkifyRoomExits = function (html) {
    return html.replace(/(这里(?:明显的出口是|唯一的出口是))([\s\S]*?。)/g, (m, prefix, sentence) => {
        return prefix + sentence.replace(
            /\b(northeast|northwest|southeast|southwest|north|south|east|west|up|down|in|out|enter|leave)\b(\([^<)]*\))?/g,
            (mm, dir) => '<a class="exit-link" data-cmd="' + dir + '">' + mm + '</a>'
        );
    });
};

AdvancedMUDClient.prototype.setupEventListeners = function () {
    this.commandInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.handleSendCommand();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.navigateHistory(-1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.navigateHistory(1);
        } else if (this.historyIndex !== -1 && !['ArrowUp', 'ArrowDown'].includes(e.key)) {
            this.currentInput = this.commandInput.value;
            this.historyIndex = -1;
        }
    });

    this.sendBtn.addEventListener('click', () => {
        this.handleSendCommand();
    });

    this.commandInput.focus();
};

AdvancedMUDClient.prototype.handleSendCommand = function () {
    const command = this.commandInput.value.trim();

    // 本地回显（ASCII 和 Telnet 模式均由客户端回显）
    if (command && this.connected) {
        if (this._expectPassword) {
            this.appendMessage('> ***', 'system');
            this._expectPassword = false; // 密码已发送，重置标记
        } else {
            this.appendMessage('> ' + command);
        }
    }

    if (command) {
        this.addToHistory(command);
        this.sendCommand(command);
    } else {
        this.sendCommand('\n');
    }
    this.commandInput.value = '';
    this.historyIndex = -1;
    this.currentInput = '';
};

AdvancedMUDClient.prototype.addToHistory = function (command) {
    if (command !== this.history[this.history.length - 1]) {
        this.history.push(command);
        if (this.history.length > 100) {
            this.history.shift();
        }
        // 持久化到 localStorage
        try {
            localStorage.setItem('mud_command_history', JSON.stringify(this.history));
        } catch (e) { /* 存储空间不足时忽略 */ }
    }
};

AdvancedMUDClient.prototype.navigateHistory = function (direction) {
    if (this.history.length === 0) return;

    if (this.historyIndex === -1) {
        this.currentInput = this.commandInput.value;
        if (direction === -1) {
            this.historyIndex = this.history.length - 1;
        } else {
            return;
        }
    } else {
        this.historyIndex += direction;
    }

    if (this.historyIndex < 0) {
        this.historyIndex = -1;
        this.commandInput.value = this.currentInput;
    } else if (this.historyIndex >= this.history.length) {
        this.historyIndex = this.history.length - 1;
        this.commandInput.value = this.history[this.historyIndex];
    } else {
        this.commandInput.value = this.history[this.historyIndex];
    }
};
