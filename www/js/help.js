// ===== 帮助浏览器 — AdvancedMUDClient 原型扩展 =====
// 双模式：help.json 可用时走「本地阅读器 + 全文检索」，不可用时回退到 GMCP 模式

// HTML 转义（防御性：主题名/描述来自服务端文本，理论上不含 <>& 但以防万一）
function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== 帮助静态数据加载（复用 pathfinder 的 fetch + localStorage 24h 缓存模式） =====
const HELP_DATA_URL = '/storage/help.json';
const STORAGE_HELP_KEY = 'mud_help_data';
const STORAGE_HELP_TS_KEY = 'mud_help_data_ts';
const HELP_CACHE_TTL = 24 * 3600 * 1000; // 24h

// 加载帮助静态数据（help.json），返回 Promise<boolean>
AdvancedMUDClient.prototype.ensureHelpDataLoaded = function () {
    if (this._helpData) return Promise.resolve(true);
    if (this._helpDataLoading) {
        return new Promise(resolve => {
            const check = () => {
                if (this._helpData) resolve(true);
                else if (!this._helpDataLoading) resolve(false);
                else setTimeout(check, 100);
            };
            check();
        });
    }
    this._helpDataLoading = true;

    // 检查 localStorage 缓存
    try {
        const ts = parseInt(localStorage.getItem(STORAGE_HELP_TS_KEY) || '0');
        if (Date.now() - ts < HELP_CACHE_TTL) {
            const raw = localStorage.getItem(STORAGE_HELP_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                if (data && data.topics) {
                    this._helpData = data;
                    this._helpDataLoading = false;
                    this._initHelpFromData(data);
                    console.log('Help: 从缓存加载', Object.keys(data.topics).length, '个主题');
                    return Promise.resolve(true);
                }
            }
        }
    } catch (e) { /* cache miss */ }

    // 从服务端拉取
    return fetch(HELP_DATA_URL)
        .then(resp => { if (!resp.ok) throw new Error('HTTP ' + resp.status); return resp.json(); })
        .then(data => {
            if (!data || !data.topics) throw new Error('无效的帮助数据');
            this._helpData = data;
            try {
                localStorage.setItem(STORAGE_HELP_KEY, JSON.stringify(data));
                localStorage.setItem(STORAGE_HELP_TS_KEY, String(Date.now()));
            } catch (e) { /* storage full */ }
            this._initHelpFromData(data);
            console.log('Help: 从服务端加载', Object.keys(data.topics).length, '个主题');
            return true;
        })
        .catch(err => {
            console.warn('Help: help.json 不可用，回退到 GMCP 模式', err.message);
            return false;
        })
        .finally(() => { this._helpDataLoading = false; });
};

// 从 help.json 初始化分类树和主题白名单
AdvancedMUDClient.prototype._initHelpFromData = function (data) {
    // 用 index 重建分类树（复用已有的 parseHelpTopics）
    if (data.index) {
        const tree = this.parseHelpTopics(data.index);
        if (tree.length) this._helpTree = tree;
    }
    // 用 topics keys 更新白名单
    const names = Object.keys(data.topics);
    if (names.length) {
        this._helpTopicSet = new Set(names);
        // 合并玩家命令（如果 GMCP 已推送过）
        if (this._helpCmdNames) {
            this._helpCmdNames.forEach(n => this._helpTopicSet.add(n));
        }
    }
    // 若模态框正开着，实时刷新
    if (this.helpOverlay && this.helpOverlay.classList.contains('visible')) {
        this.renderHelpCats();
        this.renderHelpTopics();
    }
};

// 分类树优先由服务端 GMCP Help.Topics 动态下发（见 applyHelpTopics）；下方内嵌数据为 GMCP 未就绪时的回退快照
AdvancedMUDClient.prototype.getHelpTree = function () {
    if (!this._helpTree) {
        this._helpTree = [
            { cat: '游戏概况', topics: [['intro', '泥潭总体简介'], ['feature', '泥潭特殊总汇']] },
            { cat: '游戏介绍', topics: [['skills', '武功说明总汇'], ['newbie', '泥潭新手指南'], ['closed', '宗师闭关说明'], ['combine', '物品合成说明'], ['poison', '泥潭毒功说明'], ['changelog', '重要更新说明'], ['settings', '环境变量设置'], ['channels', '交流频道说明'], ['room', '住房系统说明'], ['event', '特殊事件介绍'], ['schedule', '计划练功介绍'], ['trade', '商业系统说明'], ['reborn', '转世重生介绍'], ['weapon', '武器纹身说明'], ['item', '任务奖励物品'], ['product', '生产系统介绍'], ['marry', '婚姻系统说明'], ['gift', '天赋属性介绍'], ['league.2', '结义联盟说明'], ['force', '内功简介说明'], ['sp_skills', '超级武功介绍'], ['maps', '泥潭地图总册']] },
            { cat: '游戏指令', topics: [['cmds', '泥潭常用指令'], ['cmdtalk', '聊天命令详析'], ['cmdaction', '冒险命令详析'], ['cmdsystem', '系统命令详析'], ['cmdskill', '武功命令详析'], ['cmdspecial', '特殊命令详析'], ['cmdtrade', '商业指令详析'], ['commands', '泥潭命令列表']] },
            { cat: '任务说明', topics: [['work', '初级工作介绍'], ['freequest', '自由任务简介'], ['quest', '门派任务简介'], ['challenge', '挑战任务简介'], ['mirror', '宝镜任务简介'], ['invade', '外敌任务介绍'], ['huanjing', '心魔幻境介绍'], ['tutorial', '新手引导任务']] },
            { cat: '门派介绍', topics: [['shaolin', '少林派介绍'], ['wudang', '武当派介绍'], ['emei', '峨嵋派介绍'], ['huashan', '华山派介绍'], ['gaibang', '丐帮之介绍'], ['taohua', '桃花岛介绍'], ['xingxiu', '星宿派介绍'], ['xiaoyao', '逍遥派介绍'], ['gumu', '古墓派介绍'], ['quanzhen', '全真派介绍'], ['xuanming', '玄冥谷介绍'], ['kunlun', '昆仑派介绍'], ['mingjiao', '明教之介绍'], ['riyue', '日月神教介绍'], ['lingjiu', '灵鹫宫介绍'], ['song', '嵩山派介绍'], ['dalunsi', '大轮寺介绍'], ['tiezhang', '铁掌帮介绍'], ['honghua', '红花会介绍'], ['xuedao', '血刀门介绍'], ['wudu', '五毒教介绍'], ['meizhuang', '梅庄之介绍'], ['zhenyuan', '镇远镖局介绍'], ['hengshan', '衡山派介绍'], ['jueqing', '绝情谷介绍']] },
            { cat: '世家介绍', topics: [['ouyang', '欧阳世家介绍'], ['hu', '关外胡家介绍'], ['murong', '慕容世家介绍'], ['duan', '段氏皇族介绍'], ['miao', '中原苗家介绍']] },
        ];
    }
    return this._helpTree;
};

// 应用服务端 GMCP Help.Topics 推送：names→链接白名单，index(/help/topics 原文)→分类树
AdvancedMUDClient.prototype.applyHelpTopics = function (data) {
    if (!data) return;
    if (Array.isArray(data.names) && data.names.length) {
        this._helpTopicSet = new Set(data.names);
    }
    if (typeof data.index === 'string' && data.index) {
        const tree = this.parseHelpTopics(data.index);
        if (tree.length) this._helpTree = tree;
    }
    // 若模态框正开着，实时刷新
    if (this.helpOverlay && this.helpOverlay.classList.contains('visible')) {
        this.renderHelpCats();
        this.renderHelpTopics();
    }
};

// 解析 /help/topics 原文（含 $XXX$ 彩色标记与 ┃〖〗【】 边框）为分类树 [{cat, topics:[[name,desc]]}]
AdvancedMUDClient.prototype.parseHelpTopics = function (text) {
    const tree = [];
    let cur = null;
    const pairRe = /〖\s*([A-Za-z0-9_.\-]+)\s*〗\s*([^〖〗]*)/g;
    text.split('\n').forEach(raw => {
        const line = raw.replace(/\$[A-Z_]+\$/g, '').replace(/[┃│|\r]/g, ' ');
        const cat = line.match(/【([^】]+)】/);
        if (cat && line.indexOf('〖') === -1) {
            cur = { cat: cat[1].trim(), topics: [] };
            tree.push(cur);
            return;
        }
        if (cur && line.indexOf('〖') !== -1) {
            let m;
            pairRe.lastIndex = 0;
            while ((m = pairRe.exec(line)) !== null) {
                cur.topics.push([m[1].trim(), m[2].trim()]);
            }
        }
    });
    // 过滤无主题的空分类（如标题行"【本游戏的说明文件】"）
    return tree.filter(c => c.topics.length > 0);
};

AdvancedMUDClient.prototype.setupHelpModal = function () {
    const helpBtn = document.getElementById('helpBtn');
    this.helpOverlay = document.getElementById('helpOverlay');
    this.helpModal = document.getElementById('helpModal');
    this.helpCats = document.getElementById('helpCats');
    this.helpTopics = document.getElementById('helpTopics');
    this.helpSearch = document.getElementById('helpSearch');
    this.helpFooter = document.getElementById('helpFooter');
    // 阅读器元素
    this.helpReader = document.getElementById('helpReader');
    this.helpReaderBody = document.getElementById('helpReaderBody');
    this.helpReaderTitle = document.getElementById('helpReaderTitle');
    this.helpReaderBack = document.getElementById('helpReaderBack');
    if (!helpBtn || !this.helpOverlay) return;

    this._helpCat = 0;
    this._helpSel = -1;
    this._helpFooterDefault = this.helpFooter.textContent;
    this._helpReaderStack = []; // 阅读器历史栈（主题名数组）

    helpBtn.addEventListener('click', () => this.openHelpModal());
    // 点击遮罩空白处关闭
    this.helpOverlay.addEventListener('click', (e) => {
        if (e.target === this.helpOverlay) this.closeHelpModal();
    });
    // 分类切换（事件委托）
    this.helpCats.addEventListener('click', (e) => {
        const el = e.target.closest('.help-cat');
        if (!el) return;
        this._helpCat = parseInt(el.dataset.idx, 10) || 0;
        this.helpSearch.value = '';
        this._helpSearchResults = null;
        this._exitReaderMode();
        this.renderHelpCats();
        this.renderHelpTopics();
    });
    // 主题点击（事件委托）
    this.helpTopics.addEventListener('click', (e) => {
        const el = e.target.closest('.help-topic');
        if (el) this.helpOpenTopic(el.dataset.topic);
    });
    // 阅读器返回按钮
    if (this.helpReaderBack) {
        this.helpReaderBack.addEventListener('click', () => this._readerBack());
    }
    // 阅读器内容点击：help <主题> 交叉引用链接
    if (this.helpReaderBody) {
        this.helpReaderBody.addEventListener('click', (e) => {
            const link = e.target.closest('.help-xref');
            if (link) {
                e.preventDefault();
                this.helpOpenTopic(link.dataset.topic);
            }
        });
    }
    // 搜索框防抖：300ms 后触发搜索
    this.helpSearch.addEventListener('input', () => {
        clearTimeout(this._helpSearchTimer);
        this._helpSearchTimer = setTimeout(() => this.searchHelpTopics(), 300);
    });

    // 键盘：F1 开关、Esc 关闭、/ 聚焦搜索、↑↓ 选择、Enter 查看
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F1') {
            e.preventDefault();
            // 未进入游戏时屏蔽帮助入口：查阅主题需向终端发送 help 命令，
            // 在登录/注册界面执行会把命令灌进账号提示
            if (!this._loginDone && !this.helpOverlay.classList.contains('visible')) return;
            if (this.helpOverlay.classList.contains('visible')) this.closeHelpModal();
            else this.openHelpModal();
            return;
        }
        if (!this.helpOverlay.classList.contains('visible')) return;
        if (e.key === 'Escape') {
            // 阅读器模式下 Esc 返回上级，而非关闭模态框
            if (this.helpReader && this.helpReader.style.display !== 'none') {
                this._readerBack();
            } else {
                this.closeHelpModal();
            }
            return;
        }
        if (e.key === '/' && document.activeElement !== this.helpSearch) {
            e.preventDefault();
            this.helpSearch.focus();
            return;
        }
        // 搜索框内：Enter 打开首个匹配，其余键（含↑↓）交给输入框
        if (document.activeElement === this.helpSearch) {
            if (e.key === 'Enter') {
                const first = this.helpTopics.querySelector('.help-topic');
                if (first) { e.preventDefault(); this.helpOpenTopic(first.dataset.topic); }
            }
            return;
        }
        const items = this.helpTopics.querySelectorAll('.help-topic');
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this._helpSel = Math.min(this._helpSel + 1, items.length - 1);
            this.highlightHelpTopic(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this._helpSel = Math.max(this._helpSel - 1, 0);
            this.highlightHelpTopic(items);
        } else if (e.key === 'Enter' && this._helpSel >= 0 && items[this._helpSel]) {
            e.preventDefault();
            this.helpOpenTopic(items[this._helpSel].dataset.topic);
        }
    });
};

AdvancedMUDClient.prototype.highlightHelpTopic = function (items) {
    items.forEach((el, i) => el.classList.toggle('sel', i === this._helpSel));
    if (items[this._helpSel]) items[this._helpSel].scrollIntoView({ block: 'nearest' });
};

AdvancedMUDClient.prototype.openHelpModal = function () {
    if (!this.helpOverlay) return;
    this.helpSearch.value = '';
    this._helpSearchResults = null;
    this._exitReaderMode();
    this.helpFooter.textContent = this._helpFooterDefault;
    this.helpOverlay.classList.add('visible');
    this.renderHelpCats();
    this.renderHelpTopics();
    this.helpModal.focus();
    // 异步加载静态数据（不阻塞界面显示）
    this.ensureHelpDataLoaded().then(loaded => {
        if (loaded && this.helpOverlay.classList.contains('visible')) {
            this.renderHelpCats();
            this.renderHelpTopics();
        }
    });
};

AdvancedMUDClient.prototype.closeHelpModal = function () {
    if (!this.helpOverlay) return;
    this.helpOverlay.classList.remove('visible');
    this._exitReaderMode();
    if (this.commandInput) this.commandInput.focus();
};

// ===== 阅读器模式 =====

// 进入阅读器：显示帮助主题内容
AdvancedMUDClient.prototype.renderHelpContent = function (topic) {
    if (!this.helpReader || !this.helpReaderBody) return;
    const data = this._helpData;
    const entry = data && data.topics ? data.topics[topic] : null;
    if (!entry) {
        // 数据中没有该主题，回退到终端模式
        this._exitReaderMode();
        this.closeHelpModal();
        this.commandInput.value = 'help ' + topic;
        this.handleSendCommand();
        return;
    }
    // 推入历史栈
    this._helpReaderStack.push(topic);
    // 切换视图
    this.helpCats.style.display = 'none';
    this.helpTopics.style.display = 'none';
    this.helpReader.style.display = '';
    // 渲染内容
    this.helpReaderTitle.textContent = '〔 ' + topic + ' 〕';
    // 处理交叉引用：help <主题> → 可点击链接
    let html = entry.content || '';
    html = this._linkifyHelpContent(html);
    this.helpReaderBody.innerHTML = html;
    this.helpReaderBody.scrollTop = 0;
    // 更新状态栏
    this.helpFooter.textContent = 'Esc 返回上级 · / 搜索 · 点击蓝色链接跳转';
};

// 退出阅读器：回到分类导航
AdvancedMUDClient.prototype._exitReaderMode = function () {
    if (!this.helpReader) return;
    this._helpReaderStack = [];
    this.helpCats.style.display = '';
    this.helpTopics.style.display = '';
    this.helpReader.style.display = 'none';
    this.helpFooter.textContent = this._helpFooterDefault;
};

// 阅读器返回：历史栈回退一级
AdvancedMUDClient.prototype._readerBack = function () {
    if (this._helpReaderStack.length > 1) {
        // 弹出当前主题，回到上一个
        this._helpReaderStack.pop();
        const prev = this._helpReaderStack[this._helpReaderStack.length - 1];
        // 重新渲染上一个主题（不 push，因为已经在栈里）
        this._helpReaderStack.pop(); // 先弹出，renderHelpContent 会再 push
        this.renderHelpContent(prev);
    } else {
        // 栈为空，回到列表
        this._exitReaderMode();
        this.renderHelpCats();
        this.renderHelpTopics();
    }
};

// 将帮助内容中的 help <主题> 转为可点击链接
AdvancedMUDClient.prototype._linkifyHelpContent = function (html) {
    const valid = this.getHelpTopicSet();
    // 匹配 help <topic> 但排除已在 <span> 标签属性中的
    return html.replace(/\bhelp\s+([a-z][a-z0-9_.\-]*)/gi, (m, topic) => {
        const t = topic.toLowerCase();
        return valid.has(t)
            ? '<a class="help-xref" data-topic="' + t + '">' + m + '</a>'
            : m;
    });
};

AdvancedMUDClient.prototype.renderHelpCats = function () {
    this.helpCats.innerHTML = this.getHelpTree().map((c, i) =>
        '<div class="help-cat' + (i === this._helpCat ? ' active' : '') +
        '" data-idx="' + i + '">【' + escHtml(c.cat) + '】</div>'
    ).join('');
};

AdvancedMUDClient.prototype.renderHelpTopics = function () {
    const q = (this.helpSearch.value || '').trim();
    this._helpSel = -1;
    if (q) {
        if (this._helpSearchResults) {
            if (!this._helpSearchResults.length) {
                this.helpTopics.innerHTML = '<div class="help-empty">无匹配主题</div>';
                return;
            }
            const tree = this.getHelpTree();
            const descMap = {};
            tree.forEach(c => c.topics.forEach(t => descMap[t[0]] = t[1]));
            this.helpTopics.innerHTML = this._helpSearchResults.map(topic =>
                '<div class="help-topic" data-topic="' + escHtml(topic) + '">' +
                '<span class="t-name">〖' + escHtml(topic) + '〗</span>' +
                (descMap[topic] ? '<span class="t-desc">' + escHtml(descMap[topic]) + '</span>' : '') +
                '</div>'
            ).join('');
        } else if (this._helpSearchPending) {
            this.helpTopics.innerHTML = '<div class="help-empty">搜索中…</div>';
        } else {
            // 超时/未连接：用本地名称过滤结果（可能为空）
            this.helpTopics.innerHTML = '<div class="help-empty">无匹配主题</div>';
        }
        return;
    }
    // 无搜索：显示当前分类
    const tree = this.getHelpTree();
    let list = tree[this._helpCat] ? tree[this._helpCat].topics : [];
    if (!list.length) {
        this.helpTopics.innerHTML = '<div class="help-empty">无匹配主题</div>';
        return;
    }
    this.helpTopics.innerHTML = list.map(t =>
        '<div class="help-topic" data-topic="' + escHtml(t[0]) + '">' +
        '<span class="t-name">〖' + escHtml(t[0]) + '〗</span>' +
        '<span class="t-desc">' + escHtml(t[1]) + '</span></div>'
    ).join('');
};

AdvancedMUDClient.prototype.searchHelpTopics = function () {
    const q = (this.helpSearch.value || '').trim();
    clearTimeout(this._helpSearchTimeout);
    if (!q) {
        this._helpSearchResults = null;
        this._helpSearchPending = false;
        this._exitReaderMode();
        this.renderHelpTopics();
        return;
    }
    // 退出阅读器再搜索
    this._exitReaderMode();

    // 优先：本地全文检索（help.json 可用时）
    if (this._helpData && this._helpData.topics) {
        const matches = this._searchHelpFullText(q);
        this._helpSearchResults = matches;
        this._helpSearchPending = false;
        this.renderHelpTopics();
        return;
    }

    // 回退：本地名称过滤 + GMCP 全文检索
    const localMatches = this._filterHelpTopicsByName(q);
    
    if (this.connected && this.sendGMCP) {
        this._helpSearchPending = true;
        this.sendGMCP('Help.Search.Get', { keyword: q });
        // 3 秒超时：服务端无响应则回退到本地名称过滤
        this._helpSearchTimeout = setTimeout(() => {
            if (this._helpSearchPending) {
                this._helpSearchPending = false;
                this._helpSearchResults = localMatches;
                this.renderHelpTopics();
            }
        }, 3000);
        this.helpTopics.innerHTML = '<div class="help-empty">搜索中…</div>';
    } else {
        // 未连接：直接用本地名称过滤
        this._helpSearchPending = false;
        this._helpSearchResults = localMatches;
        this.renderHelpTopics();
    }
};

// 本地全文检索：遍历 help.json 的 search_text 字段，返回匹配的主题名列表
AdvancedMUDClient.prototype._searchHelpFullText = function (q) {
    const ql = q.toLowerCase();
    const topics = this._helpData.topics;
    const matches = [];
    for (const name in topics) {
        const entry = topics[name];
        // 搜索 search_text（纯文本）或主题名
        if (name.toLowerCase().indexOf(ql) !== -1 ||
            (entry.search_text && entry.search_text.toLowerCase().indexOf(ql) !== -1)) {
            matches.push(name);
        }
    }
    // 排序：主题名匹配优先，其余按名称排序
    matches.sort((a, b) => {
        const aName = a.toLowerCase().indexOf(ql) !== -1 ? 0 : 1;
        const bName = b.toLowerCase().indexOf(ql) !== -1 ? 0 : 1;
        if (aName !== bName) return aName - bName;
        return a.localeCompare(b);
    });
    return matches;
};

AdvancedMUDClient.prototype.applyHelpSearchResults = function (data) {
    if (!data || !Array.isArray(data.matches)) return;
    const q = (this.helpSearch.value || '').trim();
    if (data.keyword !== q) {
        // 过期响应：忽略，不覆盖当前结果
        return;
    }
    this._helpSearchPending = false;
    clearTimeout(this._helpSearchTimeout);
    this._helpSearchResults = data.matches;
    this.renderHelpTopics();
};

// 按名称/描述本地过滤（大小写不敏感）
AdvancedMUDClient.prototype._filterHelpTopicsByName = function (q) {
    const tree = this.getHelpTree();
    const ql = q.toLowerCase();
    const matches = [];
    tree.forEach(c => c.topics.forEach(t => {
        if (t[0].toLowerCase().indexOf(ql) !== -1 || t[1].toLowerCase().indexOf(ql) !== -1) {
            matches.push(t[0]);
        }
    }));
    return matches;
};

AdvancedMUDClient.prototype.helpOpenTopic = function (topic) {
    if (!topic) return;
    // 优先走阅读器模式（help.json 可用时）
    if (this._helpData && this._helpData.topics && this._helpData.topics[topic]) {
        this.renderHelpContent(topic);
        return;
    }
    // 回退：终端模式（需要已登录）
    if (!this.connected) {
        this.helpFooter.textContent = '请先连接游戏，再查看帮助文档';
        return;
    }
    if (!this._loginDone) {
        this.helpFooter.textContent = '请先登录进入游戏，再查看帮助文档';
        return;
    }
    this.closeHelpModal();
    this.commandInput.value = 'help ' + topic;
    this.handleSendCommand();
};

// 已知帮助主题白名单：供 linkifyHelpRefs 校验，避免聊天里的 "help me" 等英文短语被误渲染
// 运行时由服务端 GMCP Help.Topics 的 names（/help 文件 + 玩家命令）覆盖（见 applyHelpTopics）；下方为回退快照
AdvancedMUDClient.prototype.getHelpTopicSet = function () {
    if (!this._helpTopicSet) {
        this._helpTopicSet = new Set([
            'attribute', 'backup', 'bai', 'beg', 'board', 'cha', 'changelog', 'channels', 'check', 'closed',
            'cmdtrade', 'commands', 'cut', 'dazuo', 'dugu-jiujian', 'emei', 'enable', 'enchase', 'feature', 'force',
            'freequest', 'gift', 'gumu', 'here', 'herohall', 'huanjing', 'intro', 'invade', 'item', 'jifen',
            'jiuyang-shengong', 'jiuyin-shengong', 'kuihua-mogong', 'league', 'liandan', 'liumai-shenjian', 'ma_cd', 'make', 'map', 'map_all',
            'map_bj', 'map_ca', 'map_dl', 'map_dln', 'map_fs', 'map_gw', 'map_hg', 'map_hz', 'map_ly', 'map_xi',
            'map_yz', 'newbie', 'news', 'pig_cmds', 'quest', 'quest2', 'rank', 'reborn', 'reply', 'ride',
            'rideto', 'say', 'schedule', 'set', 'settings', 'shaolin_master', 'shaolin_skill', 'skills', 'skills_all', 'skills_unarmed',
            'skills_weapon', 'snoop', 'sp_skills', 'taixuan-gong', 'team', 'tutorial', 'unset', 'whatsnew', 'work', 'xue', 'yun',
        ]);
    }
    return this._helpTopicSet;
};

// 将文档正文中的 help <主题> 交叉引用渲染为可点击链接（点击在终端查阅该主题）
// 仅当 <主题> 命中白名单时才成链，避免聊天中的 "help me/him/..." 等被误判
AdvancedMUDClient.prototype.linkifyHelpRefs = function (html) {
    const valid = this.getHelpTopicSet();
    return html.replace(/\bhelp\s+([a-z][a-z0-9_\-]*(?:\.[a-z0-9]+)*)/g,
        (m, topic) => valid.has(topic)
            ? '<a class="help-link" data-cmd="help ' + topic + '">' + m + '</a>'
            : m);
};
