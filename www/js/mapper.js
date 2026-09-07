// ===== 地图组件：房间图构建 + Canvas 小地图渲染 =====
// 利用 Room.Info GMCP 中的 exit_targets 直接构建精确房间图
// 支持 localStorage 持久化，刷新后地图立即可用

// 方向 → 网格坐标偏移（标准 MUD 方向布局，全部整数避免重叠）
const DIR_OFFSETS = {
    'north':     { dx:  0, dy:  1 },
    'south':     { dx:  0, dy: -1 },
    'east':      { dx:  1, dy:  0 },
    'west':      { dx: -1, dy:  0 },
    'northeast': { dx:  1, dy:  1 },
    'northwest': { dx: -1, dy:  1 },
    'southeast': { dx:  1, dy: -1 },
    'southwest': { dx: -1, dy: -1 },
    'up':        { dx:  0, dy:  2 },
    'down':      { dx:  0, dy: -2 },
    'in':        { dx: -2, dy:  0 },
    'out':       { dx:  2, dy:  0 },
    'enter':     { dx:  0, dy: -2 },
    'leave':     { dx:  0, dy:  2 },
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
        this.highlightPath = null;    // 寻路高亮：hash 数组或 null
        this._fullscreen = false;     // 全屏模式状态
        this._currentFloor = 0;       // 当前显示楼层（z 坐标）

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

            // 自动切换楼层：玩家移动到新楼层时自动跟随
            if (this._zCoords) {
                const curZ = this._zCoords.get(hash) || 0;
                if (curZ !== this._currentFloor) {
                    this._currentFloor = curZ;
                }
            }

            this.render();
            this._scheduleSave();
            // 通知 pathfinder 同步增量数据（仅当 pathfinder 使用 mapper 回退模式时生效）
            if (typeof pathfinder !== 'undefined') pathfinder.refreshFromMapper();
        } catch (e) {
            console.warn('Mapper: updateRoom 异常', e);
        }
    }

    // BFS 从当前房间出发，为可达房间分配网格坐标
    // 同时追踪 z 坐标（up/down 改变楼层）
    // 检测坐标冲突时，将冲突房间及其连通子树整体平移到最近的空闲格
    _computePositions() {
        if (!this.currentHash || !this.rooms.has(this.currentHash)) return;

        this.positions.clear();
        this.positions.set(this.currentHash, { x: 0, y: 0 });

        const zCoords = new Map();
        zCoords.set(this.currentHash, 0);

        const queue = [this.currentHash];
        const visited = new Set([this.currentHash]);

        while (queue.length > 0) {
            const hash = queue.shift();
            const room = this.rooms.get(hash);
            const pos = this.positions.get(hash);
            const z = zCoords.get(hash) || 0;
            if (!room || !pos) continue;

            for (const dir of room.exits) {
                const targetHash = room.connections[dir];
                if (!targetHash || visited.has(targetHash)) continue;
                visited.add(targetHash);

                const offset = DIR_OFFSETS[dir] || { dx: 0, dy: 0 };
                let nx = pos.x + offset.dx;
                let ny = pos.y + offset.dy;
                // up/down 改变楼层 z 坐标
                let nz = z;
                if (dir === 'up' || dir === 'leave') nz = z + 1;
                else if (dir === 'down' || dir === 'enter') nz = z - 1;
                zCoords.set(targetHash, nz);

                // 检测坐标冲突：该格位已被其他房间占据
                const occupantKey = this._findOccupant(nx, ny);
                if (occupantKey && occupantKey !== targetHash) {
                    // 收集 targetHash 的整棵 BFS 子树
                    const block = [];
                    const blockQ = [targetHash];
                    const blockSet = new Set([targetHash]);
                    while (blockQ.length > 0) {
                        const h = blockQ.shift();
                        block.push(h);
                        const r = this.rooms.get(h);
                        if (!r) continue;
                        for (const d of r.exits) {
                            const t = r.connections[d];
                            if (t && !blockSet.has(t) && !this.positions.has(t)) {
                                blockSet.add(t);
                                blockQ.push(t);
                            }
                        }
                    }

                    // 在螺旋环上搜索空闲格位
                    const free = this._findFreePos(nx, ny);
                    if (free) {
                        const shiftDx = free.x - nx;
                        const shiftDy = free.y - ny;
                        for (const bh of block) {
                            const bp = this.positions.get(bh);
                            if (bp) {
                                this.positions.set(bh, {
                                    x: bp.x + shiftDx,
                                    y: bp.y + shiftDy,
                                });
                            }
                        }
                        // 子树已整体平移，跳过常规赋值
                        continue;
                    }
                    // 找不到空闲格位则放弃该房间
                    continue;
                }

                this.positions.set(targetHash, { x: nx, y: ny });
                queue.push(targetHash);
            }
        }

        this._zCoords = zCoords;
    }

    // 查找占据指定格位的房间 hash，无则返回 null
    _findOccupant(x, y) {
        for (const [hash, pos] of this.positions) {
            if (pos.x === x && pos.y === y) return hash;
        }
        return null;
    }

    // 在螺旋环上搜索最近的空闲格位
    _findFreePos(cx, cy) {
        const occupied = new Set();
        for (const pos of this.positions.values()) {
            occupied.add(pos.x + ',' + pos.y);
        }
        if (!occupied.has(cx + ',' + cy)) return { x: cx, y: cy };
        for (let ring = 1; ring <= 20; ring++) {
            for (let dx = -ring; dx <= ring; dx++) {
                for (let dy = -ring; dy <= ring; dy++) {
                    if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
                    const key = (cx + dx) + ',' + (cy + dy);
                    if (!occupied.has(key)) return { x: cx + dx, y: cy + dy };
                }
            }
        }
        return null;
    }

    // 切换显示楼层
    setFloor(floor) {
        const range = this._getFloorRange();
        this._currentFloor = Math.max(range.min, Math.min(range.max, floor));
        this.render();
    }

    // 获取已发现房间的楼层范围 { min, max }
    _getFloorRange() {
        let min = 0, max = 0;
        if (this._zCoords) {
            for (const z of this._zCoords.values()) {
                if (z < min) min = z;
                if (z > max) max = z;
            }
        }
        return { min, max };
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

        // 完全清除画布（fillRect 比 clearRect 更可靠，防止文本残留）
        ctx.fillStyle = '#0a0f0a';
        ctx.fillRect(0, 0, W, H);

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

        // 收集视口范围内当前楼层的房间
        const curZ = (this._zCoords && this._zCoords.get(this.currentHash)) || 0;
        const visibleRooms = [];
        for (const [hash, pos] of this.positions) {
            const z = (this._zCoords && this._zCoords.get(hash)) || 0;
            if (z !== this._currentFloor) continue;
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

        // 绘制寻路高亮路径
        if (this.highlightPath && this.highlightPath.length > 1) {
            ctx.save();
            ctx.strokeStyle = '#ff0';
            ctx.lineWidth = 3;
            ctx.setLineDash([4, 3]);
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            let started = false;
            for (const hash of this.highlightPath) {
                const vr = visibleRooms.find(v => v.hash === hash);
                if (!vr) { started = false; continue; }
                if (!started) { ctx.moveTo(vr.screenX, vr.screenY); started = true; }
                else ctx.lineTo(vr.screenX, vr.screenY);
            }
            ctx.stroke();
            ctx.restore();
        }

        // 绘制房间方块
        for (const vr of visibleRooms) {
            const half = rs / 2;
            const explored = vr.room && vr.room.name;
            const roomType = explored ? this._getRoomType(vr.room.name) : null;
            const typeColor = roomType ? this._getRoomTypeColor(roomType) : null;

            if (vr.isCurrent) {
                ctx.shadowColor = '#0f0';
                ctx.shadowBlur = 6;
                ctx.fillStyle = '#0f0';
                ctx.fillRect(vr.screenX - half, vr.screenY - half, rs, rs);
                ctx.shadowBlur = 0;
            } else if (explored) {
                ctx.strokeStyle = typeColor || '#0a0';
                ctx.lineWidth = typeColor ? 2 : 1;
                ctx.strokeRect(vr.screenX - half, vr.screenY - half, rs, rs);
            } else {
                ctx.fillStyle = '#060';
                ctx.beginPath();
                ctx.arc(vr.screenX, vr.screenY, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            // 特殊房间标记：右上角小圆点
            if (typeColor && !vr.isCurrent) {
                ctx.fillStyle = typeColor;
                ctx.beginPath();
                ctx.arc(vr.screenX + half + 2, vr.screenY - half - 2, 2.5, 0, Math.PI * 2);
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

        // 全屏模式时同步刷新大地图
        if (this._fullscreen) this._renderFullscreenCanvas();
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
            const targetRoom = hasExit && targetHash ? this.rooms.get(targetHash) : null;
            const explored = !!targetRoom && targetRoom.name;
            cell.classList.toggle('explored', !!explored);

            // 特殊房间类型标记
            const roomType = explored ? this._getRoomType(targetRoom.name) : null;
            const typeColor = roomType ? this._getRoomTypeColor(roomType) : null;
            if (typeColor) {
                cell.style.setProperty('--type-dot', typeColor);
                cell.classList.add('has-type');
            } else {
                cell.style.removeProperty('--type-dot');
                cell.classList.remove('has-type');
            }

            // 更新房间名称
            const nameEl = cell.querySelector('.move-name');
            if (nameEl) {
                if (explored) {
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

        // 扩展栏：up/down/in/out/enter/leave + 楼层切换
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

        // 楼层切换按钮（发现多层时显示）
        const floorRange = this._getFloorRange();
        if (floorRange.min < floorRange.max) {
            const sep = document.createElement('span');
            sep.className = 'move-floor-sep';
            sep.textContent = '|';
            extra.appendChild(sep);

            const upBtn = document.createElement('button');
            upBtn.className = 'move-floor-btn';
            upBtn.textContent = '▲';
            upBtn.title = '上一层楼';
            upBtn.disabled = this._currentFloor >= floorRange.max;
            upBtn.addEventListener('click', () => this.setFloor(this._currentFloor + 1));
            extra.appendChild(upBtn);

            const indicator = document.createElement('span');
            indicator.className = 'move-floor-ind';
            indicator.textContent = 'F' + this._currentFloor;
            extra.appendChild(indicator);

            const downBtn = document.createElement('button');
            downBtn.className = 'move-floor-btn';
            downBtn.textContent = '▼';
            downBtn.title = '下一层楼';
            downBtn.disabled = this._currentFloor <= floorRange.min;
            downBtn.addEventListener('click', () => this.setFloor(this._currentFloor - 1));
            extra.appendChild(downBtn);
        }

        // 同步更新 minimap header 楼层指示器
        const floorInd = document.getElementById('minimapFloorInd');
        if (floorInd) {
            if (floorRange.min < floorRange.max) {
                floorInd.textContent = 'F' + this._currentFloor;
                floorInd.style.display = '';
            } else {
                floorInd.style.display = 'none';
            }
        }

        // 更新探索进度
        this._updateProgress();
    }

    // 设置寻路高亮路径（hash 数组）
    setHighlightPath(hashes) {
        this.highlightPath = hashes && hashes.length > 0 ? hashes : null;
        this.render();
    }

    // 更新面板底部探索进度
    _updateProgress() {
        const el = document.getElementById('minimapProgress');
        if (!el) return;

        const explored = this.rooms.size;
        if (explored === 0) { el.textContent = ''; return; }

        // 如果有 pathfinder 全量数据，显示百分比
        if (typeof pathfinder !== 'undefined' && pathfinder.loaded && pathfinder._source === 'full') {
            const total = pathfinder.rooms.size;
            const pct = total > 0 ? Math.round(explored / total * 100) : 0;
            el.textContent = '已探索 ' + explored + '/' + total + ' (' + pct + '%)';
        } else {
            el.textContent = '已探索 ' + explored + ' 个房间';
        }
    }

    // ===== 特殊房间类型识别 =====

    // 根据房间名称识别特殊类型，返回类型字符串或 null
    _getRoomType(name) {
        if (!name) return null;
        if (/\u5546\u5e97|\u94c1\u5320|\u5f53\u94fa|\u836f\u5e97|\u5e03\u5e84|\u7c73\u94fa|\u5175\u5668\u5e97|\u996d\u9986|\u9152\u697c|\u8336\u9986|\u5f53\u94fa|\u5546\u5e97/.test(name)) return 'shop';
        if (/\u94f6\u884c|\u94b1\u5e84|\u8d4c\u573a/.test(name)) return 'bank';
        if (/\u5ba2\u6808|\u6808|\u5bbf|\u5bfa\u9662|\u5e99|\u89c2|\u5bfa/.test(name)) return 'inn';
        if (/\u6d3e|\u5b97|\u5c71\u5be8|\u603b\u575b|\u5206\u575b|\u5206\u5802|\u5927\u6bbf|\u5c0f\u7b51/.test(name)) return 'sect';
        if (/\u5730\u7262|\u7252\u7262|\u76d1\u7262/.test(name)) return 'jail';
        if (/\u5c71\u6d1e|\u6d1e\u7a74|\u5ca9\u6d1e|\u5730\u4e0b|\u5e9f\u5f03|\u8352\u539f|\u6cfd\u5730|\u6df1\u6e0a|\u8ff7\u5bab|\u5bc6\u5ba4/.test(name)) return 'dungeon';
        return null;
    }

    // 特殊房间类型 → 标记颜色
    _getRoomTypeColor(type) {
        const colors = {
            'shop': '#ff0',      // 黄色：商店
            'bank': '#ffd700',   // 金色：银行
            'inn': '#4af',       // 蓝色：客栈/寺庙
            'sect': '#f4f',      // 紫色：门派
            'jail': '#f44',      // 红色：监狱
            'dungeon': '#f80',   // 橙色：副本/洞穴
        };
        return colors[type] || null;
    }

    // ===== 全屏地图 =====

    // 进入全屏模式
    enterFullscreen() {
        if (this._fullscreen) return;
        this._fullscreen = true;

        const overlay = document.getElementById('mapFullscreen');
        const fsCanvas = document.getElementById('mapFsCanvas');
        const fsTitle = document.getElementById('mapFsTitle');
        if (!overlay || !fsCanvas) return;

        // 设置全屏 canvas 尺寸
        const headerH = overlay.querySelector('.map-fs-header').offsetHeight || 40;
        fsCanvas.width = window.innerWidth;
        fsCanvas.height = window.innerHeight - headerH;

        // 更新标题
        const curRoom = this.currentHash ? this.rooms.get(this.currentHash) : null;
        if (fsTitle) fsTitle.textContent = (curRoom && curRoom.name) || '地图';

        overlay.classList.add('active');
        this._renderFullscreenCanvas();
    }

    // 退出全屏模式
    exitFullscreen() {
        if (!this._fullscreen) return;
        this._fullscreen = false;

        const overlay = document.getElementById('mapFullscreen');
        if (overlay) overlay.classList.remove('active');
    }

    // 渲染全屏 canvas（更大视口 + 更大格子）
    _renderFullscreenCanvas() {
        if (!this._fullscreen) return;
        const fsCanvas = document.getElementById('mapFsCanvas');
        if (!fsCanvas) return;
        const ctx = fsCanvas.getContext('2d');
        const W = fsCanvas.width;
        const H = fsCanvas.height;

        // 全屏参数：更大 cellSize 和 viewRadius
        const cs = 60;
        const rs = 18;
        const radius = Math.ceil(Math.max(W, H) / cs / 2) + 1;

        ctx.clearRect(0, 0, W, H);

        if (!this.currentHash || !this.rooms.has(this.currentHash)) return;
        const curPos = this.positions.get(this.currentHash);
        if (!curPos) return;

        const centerX = W / 2;
        const centerY = H / 2;

        // 收集当前楼层可见房间
        const visibleRooms = [];
        for (const [hash, pos] of this.positions) {
            const z = (this._zCoords && this._zCoords.get(hash)) || 0;
            if (z !== this._currentFloor) continue;
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
                const edgeKey = vr.hash < targetHash ? vr.hash + '|' + targetHash : targetHash + '|' + vr.hash;
                if (drawn.has(edgeKey)) continue;
                drawn.add(edgeKey);
                ctx.strokeStyle = DIR_COLORS[dir] || '#060';
                ctx.beginPath();
                ctx.moveTo(vr.screenX, vr.screenY);
                ctx.lineTo(targetVR.screenX, targetVR.screenY);
                ctx.stroke();
            }
        }

        // 绘制寻路高亮路径
        if (this.highlightPath && this.highlightPath.length > 1) {
            ctx.save();
            ctx.strokeStyle = '#ff0';
            ctx.lineWidth = 4;
            ctx.setLineDash([6, 4]);
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            let started = false;
            for (const hash of this.highlightPath) {
                const vr = visibleRooms.find(v => v.hash === hash);
                if (!vr) { started = false; continue; }
                if (!started) { ctx.moveTo(vr.screenX, vr.screenY); started = true; }
                else ctx.lineTo(vr.screenX, vr.screenY);
            }
            ctx.stroke();
            ctx.restore();
        }

        // 绘制房间方块 + 特殊房间标记 + 标签
        for (const vr of visibleRooms) {
            const half = rs / 2;
            const explored = vr.room && vr.room.name;
            const roomType = explored ? this._getRoomType(vr.room.name) : null;
            const typeColor = roomType ? this._getRoomTypeColor(roomType) : null;

            if (vr.isCurrent) {
                ctx.shadowColor = '#0f0';
                ctx.shadowBlur = 8;
                ctx.fillStyle = '#0f0';
                ctx.fillRect(vr.screenX - half, vr.screenY - half, rs, rs);
                ctx.shadowBlur = 0;
            } else if (explored) {
                ctx.strokeStyle = typeColor || '#0a0';
                ctx.lineWidth = typeColor ? 2 : 1;
                ctx.strokeRect(vr.screenX - half, vr.screenY - half, rs, rs);
            } else {
                ctx.fillStyle = '#060';
                ctx.beginPath();
                ctx.arc(vr.screenX, vr.screenY, 4, 0, Math.PI * 2);
                ctx.fill();
            }

            // 特殊房间标记：小圆点
            if (typeColor && !vr.isCurrent) {
                ctx.fillStyle = typeColor;
                ctx.beginPath();
                ctx.arc(vr.screenX + half + 3, vr.screenY - half - 3, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            // 标签
            if (vr.isCurrent || explored) {
                ctx.fillStyle = vr.isCurrent ? '#fff' : '#aaa';
                ctx.font = (vr.isCurrent ? 'bold ' : '') + '12px Consolas, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const label = this._truncate(vr.room ? vr.room.name : '', 10);
                ctx.fillText(label, vr.screenX, vr.screenY + half + 3);
            }
        }

        // 区域名（右下角）
        const curRoom = this.rooms.get(this.currentHash);
        if (curRoom && curRoom.area) {
            ctx.fillStyle = '#444';
            ctx.font = '11px Consolas, monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText(curRoom.area, W - 10, H - 6);
        }

        // 指南针
        this._drawCompassOn(ctx, 24, 24, 16);

        // 图例（右下角）
        this._drawLegend(ctx, W, H);
    }

    // 在指定 ctx 上绘制指南针
    _drawCompassOn(ctx, cx, cy, r) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#0a0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#0f0';
        ctx.beginPath();
        ctx.moveTo(cx, cy - r + 3);
        ctx.lineTo(cx - 4, cy - 3);
        ctx.lineTo(cx + 4, cy - 3);
        ctx.closePath();
        ctx.fill();
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('N', cx, cy - r - 2);
        ctx.restore();
    }

    // 绘制图例（全屏模式右下角）
    _drawLegend(ctx, W, H) {
        const items = [
            { color: '#ff0', label: '商店' },
            { color: '#ffd700', label: '银行' },
            { color: '#4af', label: '客栈/寺庙' },
            { color: '#f4f', label: '门派' },
            { color: '#f80', label: '洞穴/副本' },
        ];
        const x = W - 90;
        let y = H - 20 - items.length * 16;
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = 'rgba(10,15,10,0.8)';
        ctx.fillRect(x - 8, y - 4, 92, items.length * 16 + 8);
        ctx.globalAlpha = 1;
        ctx.font = '10px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (const item of items) {
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.arc(x + 4, y + 6, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#aaa';
            ctx.fillText(item.label, x + 14, y + 6);
            y += 16;
        }
        ctx.restore();
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
