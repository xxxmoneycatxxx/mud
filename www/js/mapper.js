// ===== 地图组件：房间图构建 + Canvas 小地图渲染 =====
// 利用 Room.Info GMCP 中的 exit_targets 直接构建精确房间图
// 支持 localStorage 持久化，刷新后地图立即可用

// 方向 → 网格坐标偏移（标准 MUD 方向布局）
const DIR_OFFSETS = {
    'north':     { dx:  0, dy:  1 },
    'south':     { dx:  0, dy: -1 },
    'east':      { dx:  1, dy:  0 },
    'west':      { dx: -1, dy:  0 },
    'northeast': { dx:  1, dy:  1 },
    'northwest': { dx: -1, dy:  1 },
    'southeast': { dx:  1, dy: -1 },
    'southwest': { dx: -1, dy: -1 },
    'up':        { dx:  0.6, dy:  0.4 },
    'down':      { dx:  0.6, dy: -0.4 },
    'in':        { dx: -0.6, dy:  0.4 },
    'out':       { dx: -0.6, dy: -0.4 },
    'enter':     { dx:  0, dy: -0.6 },
    'leave':     { dx:  0, dy:  0.6 },
};

// 方向 → 连线颜色
const DIR_COLORS = {
    'north': '#0a0', 'south': '#0a0', 'east': '#0a0', 'west': '#0a0',
    'northeast': '#088', 'northwest': '#088', 'southeast': '#088', 'southwest': '#088',
    'up': '#886', 'down': '#886', 'in': '#668', 'out': '#668',
};

// 方向 → 中文短标签
const DIR_SHORT = {
    'north': '北', 'south': '南', 'east': '东', 'west': '西',
    'northeast': '东北', 'northwest': '西北',
    'southeast': '东南', 'southwest': '西南',
    'up': '上', 'down': '下', 'in': '进', 'out': '出',
    'enter': '入', 'leave': '离',
};

const STORAGE_KEY = 'mud_mapper_rooms';

class Mapper {
    constructor() {
        this.rooms = new Map();       // hash → { name, area, exits[], connections:{} }
        this.currentHash = null;
        this.positions = new Map();   // hash → { x, y }
        this.canvas = null;
        this.ctx = null;
        this.mapUrl = null;
        this._saveTimer = null;

        // 渲染参数
        this.cellSize = 44;
        this.roomSize = 14;
        this.viewRadius = 5;
    }

    // 绑定 Canvas 元素，恢复持久化数据，首次渲染
    init(canvas) {
        this.canvas = canvas;
        if (!canvas) return;
        this.ctx = canvas.getContext('2d');
        this._loadFromStorage();
        if (this.currentHash && this.rooms.has(this.currentHash)) {
            this._computePositions();
            // 有缓存数据时立即显示面板（不用等服务端推送）
            const panel = document.getElementById('minimapPanel');
            if (panel) panel.classList.add('visible');
        }
        this.render();
    }

    // 设置服务端地图 URL（Client.Map GMCP 推送）
    setMapUrl(url) {
        this.mapUrl = url;
    }

    // ===== 持久化 =====

    // 从 localStorage 恢复房间图
    _loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data && data.rooms && typeof data.rooms === 'object') {
                for (const hash in data.rooms) {
                    const r = data.rooms[hash];
                    this.rooms.set(hash, {
                        name: r.n || '',
                        area: r.a || '',
                        exits: r.e || [],
                        connections: r.c || {},
                    });
                }
                this.currentHash = data.cur || null;
                console.log('Mapper: 从缓存恢复', this.rooms.size, '个房间');
            }
        } catch (e) {
            console.warn('Mapper: 缓存恢复失败', e);
        }
    }

    // 防抖保存到 localStorage（2 秒内多次调用只执行一次）
    _scheduleSave() {
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this._saveToStorage();
        }, 2000);
    }

    _saveToStorage() {
        try {
            const rooms = {};
            for (const [hash, room] of this.rooms) {
                rooms[hash] = {
                    n: room.name,
                    a: room.area,
                    e: room.exits,
                    c: room.connections,
                };
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                rooms: rooms,
                cur: this.currentHash,
            }));
        } catch (e) {
            console.warn('Mapper: 缓存保存失败', e);
        }
    }

    // ===== 房间图构建 =====

    // 确保房间存在于图中（骨架房间，仅有 hash）
    ensureRoom(hash) {
        if (!hash || this.rooms.has(hash)) return;
        this.rooms.set(hash, {
            name: '',
            area: '',
            exits: [],
            connections: {},
        });
    }

    // 更新房间数据（Room.Info GMCP 触发）
    // roomInfo: { name, exits[], exit_targets:{dir:hash}, area, hash }
    updateRoom(roomInfo) {
        if (!roomInfo || !roomInfo.hash) return;

        try {
            const hash = roomInfo.hash;

            // 更新或创建房间
            this.ensureRoom(hash);
            const room = this.rooms.get(hash);
            room.name = roomInfo.name || room.name;
            room.area = roomInfo.area || room.area;
            if (Array.isArray(roomInfo.exits)) {
                room.exits = roomInfo.exits;
            }

            // 利用 exit_targets 直接建立连接（服务端提供的精确数据）
            if (roomInfo.exit_targets && typeof roomInfo.exit_targets === 'object') {
                for (const dir in roomInfo.exit_targets) {
                    const targetHash = roomInfo.exit_targets[dir];
                    if (targetHash && targetHash !== hash) {
                        room.connections[dir] = targetHash;
                        this.ensureRoom(targetHash);

                        // 自动建立反向连接
                        const reverse = this._reverseDir(dir);
                        if (reverse) {
                            const target = this.rooms.get(targetHash);
                            if (target && !target.connections[reverse]) {
                                target.connections[reverse] = hash;
                            }
                        }
                    }
                }
            }

            this.currentHash = hash;
            this._computePositions();
            this.render();
            this._scheduleSave();
            // 通知 pathfinder 同步增量数据（仅当 pathfinder 使用 mapper 回退模式时生效）
            if (typeof pathfinder !== 'undefined') pathfinder.refreshFromMapper();
        } catch (e) {
            console.warn('Mapper: updateRoom 异常', e);
        }
    }

    // BFS 从当前房间出发，为可达房间分配网格坐标
    _computePositions() {
        if (!this.currentHash || !this.rooms.has(this.currentHash)) return;

        this.positions.clear();
        this.positions.set(this.currentHash, { x: 0, y: 0 });

        const queue = [this.currentHash];
        const visited = new Set([this.currentHash]);

        while (queue.length > 0) {
            const hash = queue.shift();
            const room = this.rooms.get(hash);
            const pos = this.positions.get(hash);
            if (!room || !pos) continue;

            for (const dir of room.exits) {
                const targetHash = room.connections[dir];
                if (targetHash && !visited.has(targetHash)) {
                    visited.add(targetHash);
                    const offset = DIR_OFFSETS[dir] || { dx: 0, dy: 0 };
                    this.positions.set(targetHash, {
                        x: pos.x + offset.dx,
                        y: pos.y + offset.dy,
                    });
                    queue.push(targetHash);
                }
            }
        }
    }

    _reverseDir(dir) {
        const map = {
            'north': 'south', 'south': 'north',
            'east': 'west', 'west': 'east',
            'northeast': 'southwest', 'southwest': 'northeast',
            'northwest': 'southeast', 'southeast': 'northwest',
            'up': 'down', 'down': 'up',
            'in': 'out', 'out': 'in',
            'enter': 'leave', 'leave': 'enter',
        };
        return map[dir] || null;
    }

    // ===== Canvas 渲染 =====

    render() {
        if (!this.ctx || !this.canvas) return;

        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const cs = this.cellSize;
        const rs = this.roomSize;

        ctx.clearRect(0, 0, W, H);

        if (!this.currentHash || !this.rooms.has(this.currentHash)) {
            this._drawPlaceholder(ctx, W, H);
            return;
        }

        const curPos = this.positions.get(this.currentHash);
        if (!curPos) {
            this._drawPlaceholder(ctx, W, H);
            return;
        }

        const centerX = W / 2;
        const centerY = H / 2;
        const radius = this.viewRadius;

        // 收集视口范围内的房间
        const visibleRooms = [];
        for (const [hash, pos] of this.positions) {
            const dx = pos.x - curPos.x;
            const dy = pos.y - curPos.y;
            if (Math.abs(dx) <= radius && Math.abs(dy) <= radius) {
                visibleRooms.push({
                    hash,
                    screenX: centerX + dx * cs,
                    screenY: centerY - dy * cs,
                    room: this.rooms.get(hash),
                    isCurrent: hash === this.currentHash,
                });
            }
        }

        // 绘制连接线
        ctx.lineWidth = 1.5;
        const drawn = new Set();
        for (const vr of visibleRooms) {
            if (!vr.room) continue;
            for (const dir of vr.room.exits) {
                const targetHash = vr.room.connections[dir];
                if (!targetHash) continue;
                const targetVR = visibleRooms.find(v => v.hash === targetHash);
                if (!targetVR) continue;

                // 去重：每条边只画一次
                const edgeKey = vr.hash < targetHash
                    ? vr.hash + '|' + targetHash
                    : targetHash + '|' + vr.hash;
                if (drawn.has(edgeKey)) continue;
                drawn.add(edgeKey);

                ctx.strokeStyle = DIR_COLORS[dir] || '#060';
                ctx.beginPath();
                ctx.moveTo(vr.screenX, vr.screenY);
                ctx.lineTo(targetVR.screenX, targetVR.screenY);
                ctx.stroke();
            }
        }

        // 绘制房间方块
        for (const vr of visibleRooms) {
            const half = rs / 2;
            const explored = vr.room && vr.room.name;

            if (vr.isCurrent) {
                ctx.shadowColor = '#0f0';
                ctx.shadowBlur = 6;
                ctx.fillStyle = '#0f0';
                ctx.fillRect(vr.screenX - half, vr.screenY - half, rs, rs);
                ctx.shadowBlur = 0;
            } else if (explored) {
                ctx.strokeStyle = '#0a0';
                ctx.lineWidth = 1;
                ctx.strokeRect(vr.screenX - half, vr.screenY - half, rs, rs);
            } else {
                ctx.fillStyle = '#060';
                ctx.beginPath();
                ctx.arc(vr.screenX, vr.screenY, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            // 标签：当前房间 + 所有已探索的可见房间
            if (vr.isCurrent || explored) {
                ctx.fillStyle = vr.isCurrent ? '#fff' : '#888';
                ctx.font = (vr.isCurrent ? 'bold ' : '') + '10px Consolas, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const label = this._truncate(vr.room ? vr.room.name : '', 6);
                ctx.fillText(label, vr.screenX, vr.screenY + half + 2);
            }
        }

        // 当前房间无已探索邻居时，显示出口提示
        const curRoom = this.rooms.get(this.currentHash);
        const hasExploredNeighbors = visibleRooms.some(vr => !vr.isCurrent && vr.room && vr.room.name);
        if (!hasExploredNeighbors && curRoom && curRoom.exits.length > 0) {
            ctx.fillStyle = '#555';
            ctx.font = '10px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const exitLabels = curRoom.exits.map(d => DIR_SHORT[d] || d).join(' ');
            ctx.fillText('出口: ' + exitLabels, W / 2, centerY + rs / 2 + 18);
        }

        // 区域名（右下角）
        if (curRoom && curRoom.area) {
            ctx.fillStyle = '#444';
            ctx.font = '9px Consolas, monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText(curRoom.area, W - 6, H - 4);
        }

        // 指南针
        this._drawCompass(ctx, 18, 18);

        // 同步更新九宫格移动面板
        this._renderMovePanel();
    }

    _drawPlaceholder(ctx, W, H) {
        ctx.fillStyle = '#333';
        ctx.font = '11px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('探索中...', W / 2, H / 2);
    }

    _isAdjacent(hash) {
        const cur = this.rooms.get(this.currentHash);
        if (!cur) return false;
        for (const dir of cur.exits) {
            if (cur.connections[dir] === hash) return true;
        }
        return false;
    }

    _truncate(str, maxLen) {
        if (str.length <= maxLen) return str;
        return str.substring(0, maxLen) + '..';
    }

    _drawCompass(ctx, cx, cy) {
        const r = 12;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#0a0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#0f0';
        ctx.beginPath();
        ctx.moveTo(cx, cy - r + 2);
        ctx.lineTo(cx - 3, cy - 2);
        ctx.lineTo(cx + 3, cy - 2);
        ctx.closePath();
        ctx.fill();

        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('N', cx, cy - r - 1);
        ctx.restore();
    }

    // 更新九宫格移动面板：根据当前房间出口激活/禁用方向格子
    _renderMovePanel() {
        const panel = document.getElementById('movePanel');
        if (!panel) return;

        const curRoom = this.currentHash ? this.rooms.get(this.currentHash) : null;
        if (!curRoom) {
            panel.style.display = 'none';
            return;
        }
        panel.style.display = '';

        // 8 方向格子：根据出口激活/禁用
        const cells = panel.querySelectorAll('.move-cell[data-dir]');
        const exits = new Set(curRoom.exits || []);
        cells.forEach(cell => {
            const dir = cell.getAttribute('data-dir');
            const hasExit = exits.has(dir);
            cell.classList.toggle('has-exit', hasExit);

            // 已探索的目标房间标记
            const targetHash = curRoom.connections[dir];
            const explored = hasExit && targetHash && this.rooms.has(targetHash) && this.rooms.get(targetHash).name;
            cell.classList.toggle('explored', !!explored);

            // 更新房间名称
            const nameEl = cell.querySelector('.move-name');
            if (nameEl) {
                if (explored) {
                    const targetRoom = this.rooms.get(targetHash);
                    nameEl.textContent = this._truncate(targetRoom.name || '', 4);
                } else {
                    nameEl.textContent = DIR_SHORT[dir] || '';
                }
            }
        });

        // 中心格：当前房间名
        const center = document.getElementById('moveCenter');
        if (center) {
            const dirSpan = center.querySelector('.move-dir');
            if (dirSpan) dirSpan.textContent = '●';
            // 移除可能残留的 move-name
            const oldName = center.querySelector('.move-name');
            if (oldName) oldName.remove();
        }

        // 扩展栏：up/down/in/out/enter/leave
        const EXTRA_DIRS = ['up', 'down', 'in', 'out', 'enter', 'leave'];
        const extra = document.getElementById('moveExtra');
        if (!extra) return;
        extra.innerHTML = '';
        EXTRA_DIRS.forEach(dir => {
            if (!exits.has(dir)) return;
            const btn = document.createElement('button');
            btn.className = 'move-extra-btn';
            btn.setAttribute('data-dir', dir);
            btn.textContent = DIR_SHORT[dir] || dir;
            btn.title = '移动: ' + dir;
            extra.appendChild(btn);
        });
    }

    // 完全重置（仅在新会话开始时调用，如清除缓存）
    reset() {
        this.rooms.clear();
        this.positions.clear();
        this.currentHash = null;
        this.mapUrl = null;
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
}

// 全局实例
const mapper = new Mapper();
