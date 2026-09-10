// ===== Worker 定时器管理器 =====
// 封装与 timer-worker.js 的通信，提供类似 setInterval/setTimeout 的 API
// 所有定时器通过 Worker 线程调度，后台/锁屏时不被浏览器节流

class WorkerTimerManager {
    constructor(workerUrl) {
        this._worker = null;
        this._callbacks = new Map();
        this._nextId = 0;
        this._ready = false;

        try {
            this._worker = new Worker(workerUrl);
            this._worker.onmessage = (e) => this._handleMessage(e);
            this._worker.onerror = (e) => {
                console.error('[WorkerTimerManager] Worker 错误:', e);
                this._ready = false;
            };
            this._ready = true;
        } catch (e) {
            console.warn('[WorkerTimerManager] Worker 创建失败，回退到原生定时器:', e);
        }
    }

    _handleMessage(e) {
        const { type, id } = e.data;
        const cb = this._callbacks.get(id);
        if (cb) {
            try {
                cb();
            } catch (err) {
                console.error('[WorkerTimerManager] 回调异常:', err);
            }
            // 一次性定时器触发后自动清理
            if (type === 'timeout') {
                this._callbacks.delete(id);
            }
        }
    }

    // 设置周期性定时器（类似 setInterval）
    setInterval(callback, intervalMs) {
        const id = 'i' + (this._nextId++);

        if (this._ready) {
            this._callbacks.set(id, callback);
            this._worker.postMessage({ type: 'setInterval', id, period: intervalMs });
        } else {
            // Worker 不可用时回退到原生 setInterval
            const nativeId = setInterval(callback, intervalMs);
            this._callbacks.set(id, nativeId);
        }

        return id;
    }

    // 设置一次性定时器（类似 setTimeout）
    setTimeout(callback, delayMs) {
        const id = 't' + (this._nextId++);

        if (this._ready) {
            this._callbacks.set(id, callback);
            this._worker.postMessage({ type: 'setTimeout', id, period: delayMs });
        } else {
            // Worker 不可用时回退到原生 setTimeout
            const nativeId = setTimeout(() => {
                this._callbacks.delete(id);
                callback();
            }, delayMs);
            this._callbacks.set(id, nativeId);
        }

        return id;
    }

    // 清除定时器（支持 interval 和 timeout ID）
    clear(id) {
        if (this._ready) {
            this._callbacks.delete(id);
            this._worker.postMessage({ type: 'clear', id });
        } else {
            // 回退模式：存储的是原生 ID
            const nativeId = this._callbacks.get(id);
            if (nativeId !== undefined) {
                clearInterval(nativeId);
                this._callbacks.delete(id);
            }
        }
    }

    // 销毁 Worker（页面卸载时调用）
    destroy() {
        if (this._worker) {
            this._worker.terminate();
            this._worker = null;
        }
        this._callbacks.clear();
        this._ready = false;
    }
}
