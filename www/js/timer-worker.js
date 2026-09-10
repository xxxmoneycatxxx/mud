// ===== 后台定时器 Worker =====
// Web Worker 线程不受浏览器后台标签页节流影响
// 主线程通过 postMessage 注册/清除定时器，Worker 在正确时机触发回调

const intervals = new Map();
const timeouts = new Map();
let nextId = 0;

function checkIntervals() {
    const now = Date.now();
    for (const [id, timer] of intervals) {
        if (now >= timer.nextFire) {
            self.postMessage({ type: 'interval', id });
            timer.nextFire = now + timer.period;
        }
    }
}

function checkTimeouts() {
    const now = Date.now();
    for (const [id, timer] of timeouts) {
        if (now >= timer.fireAt) {
            self.postMessage({ type: 'timeout', id });
            timeouts.delete(id);
        }
    }
}

function tick() {
    checkIntervals();
    checkTimeouts();
}

self.onmessage = function (e) {
    const { type, id, period } = e.data;
    const now = Date.now();

    switch (type) {
        case 'setInterval':
            intervals.set(id, { period, nextFire: now + period });
            break;

        case 'setTimeout':
            timeouts.set(id, { fireAt: now + period });
            break;

        case 'clear':
            intervals.delete(id);
            timeouts.delete(id);
            break;
    }
};

// 50ms 精度（浏览器后台节流最低 1 分钟，Worker 不受此限制）
setInterval(tick, 50);
