// Telnet 协议常量定义
// 实际的 Telnet 解析逻辑在 client.js + client-ui.js 中实现（processTelnetBytes）

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
