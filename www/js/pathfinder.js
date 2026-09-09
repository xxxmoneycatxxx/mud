// ===== 自动寻路组件：全量地图加载 + BFS 寻路 + 自动行走 =====
// 优先加载服务端 exportmap 导出的 /storage/map.json 全量地图数据
// 全量地图不可用时自动回退到 mapper 增量探索数据（已探索房间内仍可寻路）

const STORAGE_MAP_KEY = 'mud_full_map';
const STORAGE_MAP_TS_KEY = 'mud_full_map_ts';
const MAP_URL = '/storage/map.json';

class Pathfinder {
    constructor() {
        this.rooms = new Map();   // hash → { n, a, e[], t:{dir:hash} }
        this.loaded = false;
        this.loading = false;
        this._walkTimer = null;
        this._walkPath = null;
        this._walkIndex = 0;
        this._walkCallback = null;
        this.walkDelay = 600;     // 每步移动间隔（毫秒）
        // 速走暂停/恢复：遇敌自动暂停，事件结束后恢复
        this._pausedPath = null;
        this._pausedIndex = 0;
        this._pausedCallback = null;
    }

    // ===== 地图加载 =====

    // 加载地图数据（优先全量地图，不可用则回退到 mapper 增量数据）
    async ensureLoaded() {
        if (this.loaded) return true;
        if (this.loading) {
            return new Promise(resolve => {
                const check = () => {
                    if (this.loaded) resolve(true);
                    else if (!this.loading) resolve(false);
                    else setTimeout(check, 100);
                };
                check();
            });
        }

        this.loading = true;

        try {
            // 检查 localStorage 缓存（24 小时有效）
            const cached = this._loadFromCache();
            if (cached) {
                this.loaded = true;
                console.log('Pathfinder: 从缓存加载', this.rooms.size, '个房间');
                return true;
            }

            // 从服务端拉取最新地图数据
            const resp = await fetch(MAP_URL);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();

            if (data && data.rooms && typeof data.rooms === 'object') {
                for (const hash in data.rooms) {
                    this.rooms.set(hash, data.rooms[hash]);
                }
                this._saveToCache(data);
                this.loaded = true;
                this._source = 'full';
                console.log('Pathfinder: 从服务端加载', this.rooms.size, '个房间');
                return true;
            } else {
                throw new Error('无效的地图数据格式');
            }
        } catch (e) {
            console.warn('Pathfinder: 全量地图不可用，回退到 mapper 增量数据');
            // 回退：从 mapper 的增量探索数据同步
            this._syncFromMapper();
            return this.loaded;
        } finally {
            this.loading = false;
        }
    }

    _loadFromCache() {
        try {
            const ts = parseInt(localStorage.getItem(STORAGE_MAP_TS_KEY) || '0');
            if (Date.now() - ts > 24 * 3600 * 1000) return null; // 24h 过期
            const raw = localStorage.getItem(STORAGE_MAP_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || !data.rooms) return null;
            for (const hash in data.rooms) {
                this.rooms.set(hash, data.rooms[hash]);
            }
            return data;
        } catch (e) {
            return null;
        }
    }

    _saveToCache(data) {
        try {
            localStorage.setItem(STORAGE_MAP_KEY, JSON.stringify(data));
            localStorage.setItem(STORAGE_MAP_TS_KEY, String(Date.now()));
        } catch (e) {
            console.warn('Pathfinder: 缓存保存失败（数据可能过大）', e);
        }
    }

    // 从 mapper 增量数据同步（回退方案：仅已探索房间可寻路）
    _syncFromMapper() {
        if (typeof mapper === 'undefined' || !mapper.rooms) return;
        this.rooms.clear();
        for (const [hash, room] of mapper.rooms) {
            // mapper 格式: { name, area, exits[], connections:{dir:hash} }
            // pathfinder 格式: { n, a, e[], t:{dir:hash} }
            this.rooms.set(hash, {
                n: room.name || '',
                a: room.area || '',
                e: room.exits || [],
                t: room.connections || {},
            });
        }
        this.loaded = this.rooms.size > 0;
        this._source = 'mapper';
        if (this.loaded) {
            console.log('Pathfinder: 从 mapper 同步', this.rooms.size, '个房间');
        }
    }

    // 全量地图加载失败后，每次 mapper 更新时可重新同步
    refreshFromMapper() {
        if (this._source === 'mapper' && typeof mapper !== 'undefined') {
            this._syncFromMapper();
        }
    }

    // ===== BFS 寻路 =====

    // 查找从 fromHash 到 toHash 的最短路径
    // 返回方向命令数组，如 ['north', 'east', 'north']；不可达返回 null
    findPath(fromHash, toHash) {
        if (!this.loaded || !this.rooms.has(fromHash) || !this.rooms.has(toHash))
            return null;
        if (fromHash === toHash) return [];

        const visited = new Set([fromHash]);
        const queue = [{ hash: fromHash, path: [] }];

        while (queue.length > 0) {
            const { hash, path } = queue.shift();
            const room = this.rooms.get(hash);
            if (!room || !room.t) continue;

            for (const dir in room.t) {
                const next = room.t[dir];
                if (!next || visited.has(next)) continue;
                visited.add(next);

                const newPath = [...path, dir];
                if (next === toHash) return newPath;
                queue.push({ hash: next, path: newPath });
            }
        }

        return null; // 不可达
    }

    // 从 fromHash 做一次 BFS，返回 Map<hash, distance>
    // 用于搜索结果排序/显示距离，单次 O(V+E)
    calcDistances(fromHash) {
        const dist = new Map();
        if (!this.loaded || !this.rooms.has(fromHash)) return dist;
        dist.set(fromHash, 0);
        const queue = [fromHash];

        while (queue.length > 0) {
            const cur = queue.shift();
            const room = this.rooms.get(cur);
            if (!room || !room.t) continue;
            const d = dist.get(cur);

            for (const dir in room.t) {
                const next = room.t[dir];
                if (!next || dist.has(next)) continue;
                dist.set(next, d + 1);
                queue.push(next);
            }
        }
        return dist;
    }

    // ===== 房间搜索 =====

    // 按名称搜索房间（子串匹配，不区分大小写）
    // 返回 [{ hash, name, area, exits }]
    searchRoom(keyword) {
        if (!this.loaded || !keyword) return [];
        const kw = keyword.toLowerCase();
        const results = [];

        for (const [hash, room] of this.rooms) {
            if (room.n && room.n.toLowerCase().includes(kw)) {
                results.push({ hash, name: room.n, area: room.a || '', exits: room.e || [] });
            }
        }

        // 按匹配度排序：完全匹配 > 前缀匹配 > 包含匹配
        results.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            if (aName === kw && bName !== kw) return -1;
            if (bName === kw && aName !== kw) return 1;
            if (aName.startsWith(kw) && !bName.startsWith(kw)) return -1;
            if (bName.startsWith(kw) && !aName.startsWith(kw)) return 1;
            return a.name.localeCompare(b.name, 'zh');
        });

        return results;
    }

    // 按 hash 获取房间信息
    getRoom(hash) {
        if (!this.loaded || !this.rooms.has(hash)) return null;
        const room = this.rooms.get(hash);
        return { hash, name: room.n || '', area: room.a || '' };
    }

    // ===== 自动行走 =====

    // 沿路径自动行走
    // path: 方向命令数组
    // onStep: 每步回调 (index, direction, totalSteps)
    // onComplete: 完成回调 (success: boolean)
    startWalk(path, onStep, onComplete) {
        this.stopWalk();
        if (!path || path.length === 0) {
            if (onComplete) onComplete(true);
            return;
        }

        this._walkPath = path;
        this._walkIndex = 0;
        this._walkCallback = onComplete;

        const step = () => {
            if (this._walkIndex >= this._walkPath.length) {
                this._walkPath = null;
                this._walkIndex = 0;
                if (onComplete) onComplete(true);
                return;
            }

            const dir = this._walkPath[this._walkIndex];
            if (onStep) onStep(this._walkIndex, dir, this._walkPath.length);

            // 发送移动命令
            if (typeof client !== 'undefined' && client.connected) {
                client.sendCommand(dir);
            }

            this._walkIndex++;
            this._walkTimer = setTimeout(step, this.walkDelay);
        };

        step();
    }

    // 停止自动行走
    stopWalk() {
        if (this._walkTimer) {
            clearTimeout(this._walkTimer);
            this._walkTimer = null;
        }
        const wasWalking = !!this._walkPath;
        this._walkPath = null;
        this._walkIndex = 0;
        // 停止行走时同时清除暂停状态（彻底取消）
        this._pausedPath = null;
        this._pausedIndex = 0;
        if (wasWalking && this._walkCallback) {
            this._walkCallback(false);
            this._walkCallback = null;
        }
    }

    // 暂停自动行走（遇敌等场景，保留进度以便恢复）
    pauseWalk() {
        if (!this._walkPath) return false;
        if (this._walkTimer) {
            clearTimeout(this._walkTimer);
            this._walkTimer = null;
        }
        // 保存当前进度
        this._pausedPath = this._walkPath;
        this._pausedIndex = this._walkIndex;
        this._pausedCallback = this._walkCallback;
        // 清除活跃状态（isWalking() 返回 false）
        this._walkPath = null;
        this._walkIndex = 0;
        this._walkCallback = null;
        console.log('Pathfinder: 速走已暂停，剩余', this._pausedPath.length - this._pausedIndex, '步');
        return true;
    }

    // 恢复暂停的速走
    // resumeDelay: 恢复前等待毫秒数（默认 0 立即恢复）
    resumeWalk(resumeDelay) {
        if (!this._pausedPath) return false;
        const path = this._pausedPath;
        const startIndex = this._pausedIndex;
        const onComplete = this._pausedCallback;
        this._pausedPath = null;
        this._pausedIndex = 0;
        this._pausedCallback = null;

        if (startIndex >= path.length) {
            if (onComplete) onComplete(true);
            return true;
        }

        console.log('Pathfinder: 速走恢复，从第', startIndex + 1, '步继续，剩余', path.length - startIndex, '步');

        const delay = resumeDelay || 0;
        const doResume = () => {
            this._walkPath = path;
            this._walkIndex = startIndex;
            this._walkCallback = onComplete;

            const step = () => {
                if (this._walkIndex >= this._walkPath.length) {
                    this._walkPath = null;
                    this._walkIndex = 0;
                    if (onComplete) onComplete(true);
                    return;
                }
                const dir = this._walkPath[this._walkIndex];
                // onStep 回调在 startWalk 中传入，此处直接发送命令
                if (typeof client !== 'undefined' && client.connected) {
                    client.sendCommand(dir);
                }
                this._walkIndex++;
                this._walkTimer = setTimeout(step, this.walkDelay);
            };

            step();
        };

        if (delay > 0) {
            this._walkTimer = setTimeout(doResume, delay);
        } else {
            doResume();
        }
        return true;
    }

    // 是否处于暂停状态
    isPaused() {
        return !!this._pausedPath;
    }

    // 是否正在行走
    isWalking() {
        return !!this._walkPath;
    }

    // ===== 统计 =====

    getStats() {
        return {
            loaded: this.loaded,
            source: this._source || 'none',
            roomCount: this.rooms.size,
            walking: this.isWalking(),
        };
    }
}

// 全局实例
const pathfinder = new Pathfinder();
