// ===== 帮助浏览器 — AdvancedMUDClient 原型扩展 =====

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
    if (!helpBtn || !this.helpOverlay) return;

    this._helpCat = 0;
    this._helpSel = -1;
    this._helpFooterDefault = this.helpFooter.textContent;

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
        this.renderHelpCats();
        this.renderHelpTopics();
    });
    // 主题点击（事件委托）
    this.helpTopics.addEventListener('click', (e) => {
        const el = e.target.closest('.help-topic');
        if (el) this.helpOpenTopic(el.dataset.topic);
    });
    // 搜索框防抖：300ms 后发送 GMCP 全文检索请求
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
        if (e.key === 'Escape') { this.closeHelpModal(); return; }
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
    this.helpFooter.textContent = this._helpFooterDefault;
    this.helpOverlay.classList.add('visible');
    this.renderHelpCats();
    this.renderHelpTopics();
    this.helpModal.focus();
};

AdvancedMUDClient.prototype.closeHelpModal = function () {
    if (!this.helpOverlay) return;
    this.helpOverlay.classList.remove('visible');
    if (this.commandInput) this.commandInput.focus();
};

AdvancedMUDClient.prototype.renderHelpCats = function () {
    this.helpCats.innerHTML = this.getHelpTree().map((c, i) =>
        '<div class="help-cat' + (i === this._helpCat ? ' active' : '') +
        '" data-idx="' + i + '">【' + c.cat + '】</div>'
    ).join('');
};

AdvancedMUDClient.prototype.renderHelpTopics = function () {
    const q = (this.helpSearch.value || '').trim();
    this._helpSel = -1;
    if (q) {
        // 全文搜索结果（来自 GMCP Help.Search）
        if (this._helpSearchResults) {
            if (!this._helpSearchResults.length) {
                this.helpTopics.innerHTML = '<div class="help-empty">无匹配主题</div>';
                return;
            }
            const tree = this.getHelpTree();
            const descMap = {};
            tree.forEach(c => c.topics.forEach(t => descMap[t[0]] = t[1]));
            this.helpTopics.innerHTML = this._helpSearchResults.map(topic =>
                '<div class="help-topic" data-topic="' + topic + '">' +
                '<span class="t-name">〖' + topic + '〗</span>' +
                (descMap[topic] ? '<span class="t-desc">' + descMap[topic] + '</span>' : '') +
                '</div>'
            ).join('');
        } else {
            // 等待 GMCP 响应
            this.helpTopics.innerHTML = '<div class="help-empty">搜索中…</div>';
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
        '<div class="help-topic" data-topic="' + t[0] + '">' +
        '<span class="t-name">〖' + t[0] + '〗</span>' +
        '<span class="t-desc">' + t[1] + '</span></div>'
    ).join('');
};

AdvancedMUDClient.prototype.searchHelpTopics = function () {
    const q = (this.helpSearch.value || '').trim();
    if (!q) {
        this._helpSearchResults = null;
        this.renderHelpTopics();
        return;
    }
    // 发送 GMCP 全文检索请求
    if (this.connected && this.sendGMCP) {
        this.sendGMCP('Help.Search.Get', { keyword: q });
    }
    // 显示等待状态
    this.helpTopics.innerHTML = '<div class="help-empty">搜索中…</div>';
};

AdvancedMUDClient.prototype.applyHelpSearchResults = function (data) {
    if (!data || !Array.isArray(data.matches)) return;
    // 仅当当前搜索关键字与返回匹配时才应用（避免过期响应覆盖）
    const q = (this.helpSearch.value || '').trim();
    if (data.keyword !== q) return;
    this._helpSearchResults = data.matches;
    this.renderHelpTopics();
};

AdvancedMUDClient.prototype.helpOpenTopic = function (topic) {
    if (!topic) return;
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
