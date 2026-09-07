// Telnet协议常量
const TELNET = {
    IAC: 255,   // Interpret As Command
    DONT: 254,  // Don't
    DO: 253,    // Do
    WONT: 252,  // Won't
    WILL: 251,  // Will
    SB: 250,    // Subnegotiation Begin
    SE: 240,    // Subnegotiation End
    GA: 249,    // Go Ahead
    EL: 248,    // Erase Line
    EC: 247,    // Erase Character
    AYT: 246,   // Are You There
    AO: 245,    // Abort Output
    IP: 244,    // Interrupt Process
    BRK: 243,   // Break
    DM: 242,    // Data Mark
    NOP: 241,   // No Operation
    EOR: 239,   // End of Record
    ABORT: 238, // Abort
    SUSP: 237,  // Suspend Process
    EOF: 236,   // End of File

    // Telnet Options
    ECHO: 1,    // Echo
    SUPPRESS_GO_AHEAD: 3, // Suppress Go Ahead
    STATUS: 5,  // Status
    TIMING_MARK: 6, // Timing Mark
    TERMINAL_TYPE: 24, // Terminal Type
    NAWS: 31,   // Negotiate About Window Size
    NEW_ENVIRON: 39, // New Environment Option
    CHARSET: 42, // Charset Option

    // MUD Protocols (按编号排序)
    MSDP: 69,   // Mud Server Data Protocol
    MSSP: 70,   // Mud Server Status Protocol
    MCCP: 86,   // Mud Client Compression Protocol
    MSP: 90,    // Mud Sound Protocol
    MXP: 91,    // Mud eXtension Protocol
    ZMP: 93,    // Zenith Mud Protocol
    MMP: 102,   // Mud Mapper Protocol
    ATCP: 200,  // Achaea Telnet Client Protocol
    GMCP: 201   // Generic Mud Communication Protocol
};

// Telnet over WebSocket 实现
class TelnetOverWebSocket {
    constructor(ws) {
        this.ws = ws;
        this.state = {
            iac: false,
            sb: false,
            sbType: null,
            sbBuffer: [],
            options: new Map(),
            terminalType: 'websocket-client',
            terminalWidth: 80,
            terminalHeight: 24
        };
        this.gmcp = new GMCPHandler(this);
        this.msp = new MSPHandler(this);
        this.eventHandlers = {};
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.updateTerminalSize();
        });
    }

    // 处理接收到的数据
    processData(data) {
        const bytes = new Uint8Array(data);
        const result = [];
        let i = 0;

        while (i < bytes.length) {
            const byte = bytes[i];

            if (this.state.iac) {
                this.handleIAC(byte);
                this.state.iac = false;
                i++;
            } else if (this.state.sb) {
                if (byte === TELNET.IAC) {
                    if (i + 1 < bytes.length && bytes[i+1] === TELNET.SE) {
                        this.handleSubnegotiation(this.state.sbType, this.state.sbBuffer);
                        this.state.sb = false;
                        this.state.sbType = null;
                        this.state.sbBuffer = [];
                        i += 2;
                    } else {
                        this.state.sbBuffer.push(byte);
                        i++;
                    }
                } else {
                    this.state.sbBuffer.push(byte);
                    i++;
                }
            } else if (byte === TELNET.IAC) {
                this.state.iac = true;
                i++;
            } else {
                result.push(byte);
                i++;
            }
        }

        return new TextDecoder().decode(Uint8Array.from(result));
    }

    // 处理IAC命令
    handleIAC(command) {
        switch (command) {
            case TELNET.WILL:
            case TELNET.WONT:
            case TELNET.DO:
            case TELNET.DONT:
                // 这些会在下一个字节处理
                break;
            case TELNET.SB:
                this.state.sb = true;
                this.state.sbBuffer = [];
                break;
            case TELNET.GA:
                // Go Ahead - 可以忽略
                break;
        }
    }

    // 处理子协商
    handleSubnegotiation(type, data) {
        const typeName = {
            [TELNET.TERMINAL_TYPE]: 'TERMINAL_TYPE',
            [TELNET.NAWS]: 'NAWS',
            [TELNET.GMCP]: 'GMCP',
            [TELNET.MSP]: 'MSP'
        }[type] || `TYPE_${type}`;

        const text = new TextDecoder().decode(Uint8Array.from(data));
        console.log(`📡 子协商 ${typeName}:`, text);

        switch (type) {
            case TELNET.TERMINAL_TYPE:
                this.handleTerminalType(data);
                break;
            case TELNET.NAWS:
                this.handleNAWS(data);
                break;
            case TELNET.GMCP:
                this.gmcp.handleMessage(data);
                break;
            case TELNET.MSP:
                this.msp.handleMessage(data);
                break;
            default:
                console.log('🤔 未处理的子协商类型:', typeName);
        }
    }

    // 处理终端类型请求
    handleTerminalType(data) {
        if (data[0] === 1) { // SEND
            const terminalType = new TextEncoder().encode(this.state.terminalType);
            this.sendSubnegotiation(TELNET.TERMINAL_TYPE, [0, ...terminalType]);
        }
    }

    // 处理窗口大小协商
    handleNAWS(data) {
        if (data.length >= 4) {
            this.state.terminalWidth = (data[0] << 8) | data[1];
            this.state.terminalHeight = (data[2] << 8) | data[3];
        }
    }

    // 发送IAC命令
    sendIAC(command, option) {
        const bytes = new Uint8Array([TELNET.IAC, command, option]);
        this.ws.send(bytes);
    }

    // 发送子协商
    sendSubnegotiation(type, data) {
        const bytes = [TELNET.IAC, TELNET.SB, type, ...data, TELNET.IAC, TELNET.SE];
        this.ws.send(Uint8Array.from(bytes));
    }

    // 发送转义后的数据
    send(data) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(data);
        const escaped = [];

        for (const byte of bytes) {
            if (byte === TELNET.IAC) {
                escaped.push(TELNET.IAC, TELNET.IAC);
            } else {
                escaped.push(byte);
            }
        }

        this.ws.send(Uint8Array.from(escaped));
    }

    // 初始化Telnet协商
    initTelnetNegotiation() {
        // 启用终端类型
        this.sendIAC(TELNET.WILL, TELNET.TERMINAL_TYPE);
        // 启用窗口大小报告
        this.sendIAC(TELNET.WILL, TELNET.NAWS);
        // 发送初始终端信息
        this.updateTerminalSize();
    }

    // 更新终端大小
    updateTerminalSize() {
        const width = Math.floor(window.innerWidth / 8);
        const height = Math.floor(window.innerHeight / 16);

        if (width !== this.state.terminalWidth || height !== this.state.terminalHeight) {
            this.state.terminalWidth = width;
            this.state.terminalHeight = height;

            const bytes = [
                (width >> 8) & 0xFF, width & 0xFF,
                (height >> 8) & 0xFF, height & 0xFF
            ];

            this.sendSubnegotiation(TELNET.NAWS, bytes);
        }
    }

    // 注册事件处理器
    on(event, handler) {
        this.eventHandlers[event] = handler;
    }

    // 触发事件
    emit(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event](data);
        }
    }
}

// GMCP处理器
class GMCPHandler {
    constructor(telnet) {
        this.telnet = telnet;
        this.enabled = false;
        this.modules = new Map();
        this.onMessage = null; // 外部回调: (module, data) => void
    }

    // 处理GMCP消息
    handleMessage(data) {
        const text = new TextDecoder().decode(Uint8Array.from(data));
        const spaceIndex = text.indexOf(' ');
        const module = spaceIndex > -1 ? text.substring(0, spaceIndex) : text;
        const jsonData = spaceIndex > -1 ? text.substring(spaceIndex + 1) : '';

        try {
            const parsed = jsonData ? JSON.parse(jsonData) : {};
            this.processModule(module, parsed);
        } catch (e) {
            console.warn('GMCP解析错误:', e);
        }
    }

    // 处理GMCP模块
    processModule(module, data) {
        // 通知外部回调
        if (this.onMessage) {
            this.onMessage(module, data);
        }
        switch (module) {
            case 'Client.GUI':
                this.handleClientGUI(data);
                break;
            case 'Client.Window':
                this.handleClientWindow(data);
                break;
            case 'Char.Vitals':
                this.handleCharVitals(data);
                break;
            case 'Room.Info':
                this.handleRoomInfo(data);
                break;
        }
    }

    // 发送GMCP消息
    send(module, data) {
        if (!this.enabled) return;

        const message = module + ' ' + JSON.stringify(data);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(message);

        this.telnet.sendSubnegotiation(TELNET.GMCP, Array.from(bytes));
    }

    // 启用GMCP
    enable() {
        this.enabled = true;
        this.send('Client.GUI', {
            version: '1.0.0',
            type: 'websocket',
            client: 'FluffOS-WebClient'
        });

        this.send('Client.Window', {
            width: this.telnet.state.terminalWidth,
            height: this.telnet.state.terminalHeight
        });
    }

    // 处理客户端GUI信息
    handleClientGUI(data) {
        console.log('Client GUI配置:', data);
    }

    // 处理窗口信息
    handleClientWindow(data) {
        console.log('窗口大小:', data);
    }

    // 处理角色信息
    handleCharVitals(data) {
        console.log('角色状态:', data);
    }

    // 处理房间信息
    handleRoomInfo(data) {
        console.log('房间信息:', data);
    }
}

// 最简MSP处理器 - 仅记录日志
class MSPHandler {
    constructor(telnet) {
        this.telnet = telnet;
    }

    handleMessage(data) {
        // MSP数据由handleSubnegotiation统一处理
    }

    enable() {
        console.log('MSP已启用');
    }
}
