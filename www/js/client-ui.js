// ===== UI 事件、命令处理、消息显示、ANSI 解析 — AdvancedMUDClient 原型扩展 =====

AdvancedMUDClient.prototype.setupQuickCommands = function () {
    const qcContainer = document.getElementById('quickCommands');
    if (!qcContainer) return;

    // 通用动作键：中文标签 + tooltip 显示实际命令
    // look 保留（房间描述常用），hp 移除（Gauge 已可视化显示）
    const actions = [
        { label: 'look', cmd: 'look', title: '查看周围' },
        { label: '资料', cmd: 'score', title: '角色属性' },
        { label: '物品', cmd: 'i', title: '背包物品' },
        { label: '技能', cmd: 'cha', title: '技能熟练' },
        { label: '任务', cmd: 'quest', title: '任务列表' },
        { label: '玩家', cmd: 'who', title: '在线玩家' },
    ];

    actions.forEach(a => {
        const btn = document.createElement('button');
        btn.className = 'qc-btn';
        btn.textContent = a.label;
        btn.title = a.title + ' (' + a.cmd + ')';
        btn.addEventListener('click', () => {
            this.commandInput.value = a.cmd;
            this.handleSendCommand();
        });
        qcContainer.appendChild(btn);
    });

    // 设置按钮：打开设置面板
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'qc-btn qc-settings-btn';
    settingsBtn.textContent = '⚙';
    settingsBtn.title = '设置（触发器/别名/快捷键等）';
    settingsBtn.addEventListener('click', () => this._openSettings());
    qcContainer.appendChild(settingsBtn);

    // 设置面板事件绑定
    this._setupSettingsEvents();
};

// 设置面板：事件绑定（只调用一次）
AdvancedMUDClient.prototype._setupSettingsEvents = function () {
    const overlay = document.getElementById('settingsOverlay');
    const closeBtn = document.getElementById('settingsClose');
    const tabsContainer = document.getElementById('settingsTabs');
    if (!overlay) return;

    // 关闭按钮
    if (closeBtn) {
        closeBtn.addEventListener('click', () => this._closeSettings());
    }
    // 点击背景关闭
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this._closeSettings();
    });
    // Esc 关闭（与帮助面板共用文档级监听）
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('visible')) {
            this._closeSettings();
        }
    });
    // 标签页切换
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.settings-tab');
            if (!tab) return;
            const tabName = tab.getAttribute('data-tab');
            this._switchSettingsTab(tabName);
        });
    }
};

// 打开设置面板
AdvancedMUDClient.prototype._openSettings = function () {
    const overlay = document.getElementById('settingsOverlay');
    if (!overlay) return;
    // 渲染当前活动标签页
    this._renderActiveSettingsTab();
    overlay.classList.add('visible');
};

// 关闭设置面板
AdvancedMUDClient.prototype._closeSettings = function () {
    const overlay = document.getElementById('settingsOverlay');
    if (overlay) overlay.classList.remove('visible');
};

// 切换设置面板标签页
AdvancedMUDClient.prototype._switchSettingsTab = function (tabName) {
    // 更新标签按钮状态
    const tabs = document.querySelectorAll('.settings-tab');
    tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tabName));
    // 更新内容区显示
    const contents = document.querySelectorAll('.settings-tab-content');
    contents.forEach(c => c.classList.remove('active'));
    const target = document.getElementById('tab-' + tabName);
    if (target) target.classList.add('active');
    // 渲染该标签页内容
    this._renderActiveSettingsTab();
};

// 渲染当前活动标签页内容
AdvancedMUDClient.prototype._renderActiveSettingsTab = function () {
    const activeTab = document.querySelector('.settings-tab.active');
    if (!activeTab) return;
    const tabName = activeTab.getAttribute('data-tab');
    switch (tabName) {
        case 'triggers': this._renderTriggerList(); break;
        case 'aliases': this._renderAliasList(); break;
        case 'timers': this._renderTimerList(); break;
        case 'highlights': this._renderHighlightList(); break;
        case 'scripts': this._renderScriptList(); break;
    }
};

// 渲染触发器列表到设置面板
AdvancedMUDClient.prototype._renderTriggerList = function () {
    const container = document.getElementById('settingsTriggers');
    if (!container) return;
    container.innerHTML = '';

    // 顶部操作栏：新增按钮
    const toolbar = document.createElement('div');
    toolbar.className = 'settings-toolbar';
    const addBtn = document.createElement('button');
    addBtn.className = 'settings-action-btn';
    addBtn.textContent = '+ 新增';
    addBtn.addEventListener('click', () => this._showTriggerForm(-1));
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    // 触发器列表
    if (!this._triggers || this._triggers.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'settings-empty';
        empty.textContent = '暂无触发器规则';
        container.appendChild(empty);
    } else {
        this._triggers.forEach((trigger, index) => {
            const item = document.createElement('div');
            item.className = 'settings-item';

            const info = document.createElement('div');
            info.className = 'settings-item-info';
            let nameHtml = this._escHtml(trigger.name);
            if (trigger.builtin) nameHtml += '<span class="settings-item-badge builtin">内置</span>';
            info.innerHTML = '<div class="settings-item-name">' + nameHtml + '</div>'
                + '<div class="settings-item-detail">' + this._escHtml(trigger.command) + ' · ' + this._escHtml(trigger.pattern.source) + '</div>';

            const actions = document.createElement('div');
            actions.className = 'settings-item-actions';

            // 开关
            const toggle = document.createElement('label');
            toggle.className = 'settings-toggle';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = trigger.enabled;
            input.addEventListener('change', () => {
                trigger.enabled = input.checked;
                this._saveTriggers();
            });
            const slider = document.createElement('span');
            slider.className = 'slider';
            toggle.appendChild(input);
            toggle.appendChild(slider);
            actions.appendChild(toggle);

            // 编辑按钮（仅用户规则）
            if (!trigger.builtin) {
                const editBtn = document.createElement('button');
                editBtn.className = 'settings-icon-btn';
                editBtn.textContent = '✎';
                editBtn.title = '编辑';
                editBtn.addEventListener('click', () => this._showTriggerForm(index));
                actions.appendChild(editBtn);

                const delBtn = document.createElement('button');
                delBtn.className = 'settings-icon-btn settings-icon-btn-danger';
                delBtn.textContent = '✕';
                delBtn.title = '删除';
                delBtn.addEventListener('click', () => {
                    if (confirm('确认删除触发器「' + trigger.name + '」？')) {
                        this.removeTrigger(index);
                        this._renderTriggerList();
                    }
                });
                actions.appendChild(delBtn);
            }

            item.appendChild(info);
            item.appendChild(actions);
            container.appendChild(item);
        });
    }

    // 表单区域（新增/编辑时动态插入）
    const formArea = document.createElement('div');
    formArea.id = 'triggerFormArea';
    container.appendChild(formArea);

    // 底部操作栏：导入/导出
    const footer = document.createElement('div');
    footer.className = 'settings-toolbar settings-toolbar-bottom';
    const exportBtn = document.createElement('button');
    exportBtn.className = 'settings-action-btn';
    exportBtn.textContent = '导出';
    exportBtn.addEventListener('click', () => this._exportTriggerJSON());
    const importBtn = document.createElement('button');
    importBtn.className = 'settings-action-btn';
    importBtn.textContent = '导入';
    importBtn.addEventListener('click', () => this._importTriggerJSON());
    footer.appendChild(exportBtn);
    footer.appendChild(importBtn);
    container.appendChild(footer);
};

// 显示触发器编辑表单（index=-1 为新增，>=0 为编辑）
AdvancedMUDClient.prototype._showTriggerForm = function (index) {
    const formArea = document.getElementById('triggerFormArea');
    if (!formArea) return;

    // 如果表单已显示且是同一索引，则关闭
    if (formArea.innerHTML && formArea.dataset.editIndex === String(index)) {
        formArea.innerHTML = '';
        formArea.dataset.editIndex = '';
        return;
    }

    const isEdit = index >= 0;
    const trigger = isEdit ? this._triggers[index] : null;

    formArea.dataset.editIndex = String(index);
    formArea.innerHTML = '';

    const form = document.createElement('div');
    form.className = 'settings-form';
    form.innerHTML = '<div class="settings-form-title">' + (isEdit ? '编辑触发器' : '新增触发器') + '</div>';

    // 名称
    const nameRow = document.createElement('div');
    nameRow.className = 'settings-form-row';
    nameRow.innerHTML = '<label>名称</label>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'settings-form-input';
    nameInput.placeholder = '如：仙丹拾取';
    nameInput.value = trigger ? trigger.name : '';
    nameRow.appendChild(nameInput);
    form.appendChild(nameRow);

    // 正则表达式
    const patternRow = document.createElement('div');
    patternRow.className = 'settings-form-row';
    patternRow.innerHTML = '<label>正则</label>';
    const patternInput = document.createElement('input');
    patternInput.type = 'text';
    patternInput.className = 'settings-form-input';
    patternInput.placeholder = '如：啪.*仙丹.*面前';
    patternInput.value = trigger ? trigger.pattern.source : '';
    patternRow.appendChild(patternInput);
    form.appendChild(patternRow);

    // 执行命令
    const cmdRow = document.createElement('div');
    cmdRow.className = 'settings-form-row';
    cmdRow.innerHTML = '<label>命令</label>';
    const cmdInput = document.createElement('input');
    cmdInput.type = 'text';
    cmdInput.className = 'settings-form-input';
    cmdInput.placeholder = '如：get dan';
    cmdInput.value = trigger ? trigger.command : '';
    cmdRow.appendChild(cmdInput);
    form.appendChild(cmdRow);

    // 冷却时间
    const cdRow = document.createElement('div');
    cdRow.className = 'settings-form-row';
    cdRow.innerHTML = '<label>冷却(秒)</label>';
    const cdInput = document.createElement('input');
    cdInput.type = 'number';
    cdInput.className = 'settings-form-input';
    cdInput.min = '0';
    cdInput.value = trigger ? (trigger.cooldown || 0) : '0';
    cdRow.appendChild(cdInput);
    form.appendChild(cdRow);

    // 按钮行
    const btnRow = document.createElement('div');
    btnRow.className = 'settings-form-buttons';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'settings-action-btn';
    saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        const pattern = patternInput.value.trim();
        const command = cmdInput.value.trim();
        const cooldown = parseInt(cdInput.value) || 0;
        if (!name || !pattern || !command) {
            alert('请填写名称、正则和命令');
            return;
        }
        // 验证正则合法性
        try { new RegExp(pattern); } catch (e) { alert('正则表达式无效: ' + e.message); return; }
        if (isEdit) {
            this.updateTrigger(index, { name: name, pattern: pattern, command: command, cooldown: cooldown });
        } else {
            this.addTrigger(name, pattern, command, cooldown);
        }
        this._renderTriggerList();
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'settings-action-btn';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
        formArea.innerHTML = '';
        formArea.dataset.editIndex = '';
    });
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    form.appendChild(btnRow);

    formArea.appendChild(form);
};

// 导出触发器为 JSON 文件下载
AdvancedMUDClient.prototype._exportTriggerJSON = function () {
    const json = this.exportTriggers();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mud_triggers.json';
    a.click();
    URL.revokeObjectURL(url);
};

// 导入触发器 JSON（通过隐藏的 file input）
AdvancedMUDClient.prototype._importTriggerJSON = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                this.importTriggers(ev.target.result);
                this._renderTriggerList();
            } catch (err) {
                alert('导入失败: ' + err.message);
            }
        };
        reader.readAsText(file);
    });
    input.click();
};

// 渲染别名列表（示例数据）
AdvancedMUDClient.prototype._renderAliasList = function () {
    const container = document.getElementById('settingsAliases');
    if (!container) return;
    container.innerHTML = '';

    // 顶部操作栏
    const toolbar = document.createElement('div');
    toolbar.className = 'settings-toolbar';
    const addBtn = document.createElement('button');
    addBtn.className = 'settings-action-btn';
    addBtn.textContent = '+ 新增';
    addBtn.addEventListener('click', () => this._showAliasForm(-1));
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    // 别名列表
    const aliases = this._aliases || [];
    if (aliases.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'settings-empty';
        empty.textContent = '暂无别名规则';
        container.appendChild(empty);
    } else {
        aliases.forEach((alias, index) => {
            const item = document.createElement('div');
            item.className = 'settings-item';

            const info = document.createElement('div');
            info.className = 'settings-item-info';
            let nameHtml = this._escHtml(alias.name);
            if (alias.builtin) nameHtml += '<span class="settings-item-badge builtin">内置</span>';
            if (alias.command.indexOf(';') !== -1) nameHtml += '<span class="settings-item-badge macro">宏</span>';
            info.innerHTML = '<div class="settings-item-name">' + nameHtml + '</div>'
                + '<div class="settings-item-detail">' + this._escHtml(alias.pattern) + ' → ' + this._escHtml(alias.command) + '</div>';

            const actions = document.createElement('div');
            actions.className = 'settings-item-actions';

            // 开关
            const toggle = document.createElement('label');
            toggle.className = 'settings-toggle';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = alias.enabled;
            input.addEventListener('change', () => {
                alias.enabled = input.checked;
                this._saveAliases();
            });
            const slider = document.createElement('span');
            slider.className = 'slider';
            toggle.appendChild(input);
            toggle.appendChild(slider);
            actions.appendChild(toggle);

            // 编辑/删除（仅用户规则）
            if (!alias.builtin) {
                const editBtn = document.createElement('button');
                editBtn.className = 'settings-icon-btn';
                editBtn.textContent = '✎';
                editBtn.title = '编辑';
                editBtn.addEventListener('click', () => this._showAliasForm(index));
                actions.appendChild(editBtn);

                const delBtn = document.createElement('button');
                delBtn.className = 'settings-icon-btn settings-icon-btn-danger';
                delBtn.textContent = '✕';
                delBtn.title = '删除';
                delBtn.addEventListener('click', () => {
                    if (confirm('确认删除别名「' + alias.name + '」？')) {
                        this.removeAlias(index);
                        this._renderAliasList();
                    }
                });
                actions.appendChild(delBtn);
            }

            item.appendChild(info);
            item.appendChild(actions);
            container.appendChild(item);
        });
    }

    // 表单区域
    const formArea = document.createElement('div');
    formArea.id = 'aliasFormArea';
    container.appendChild(formArea);

    // 底部导入/导出
    const footer = document.createElement('div');
    footer.className = 'settings-toolbar settings-toolbar-bottom';
    const exportBtn = document.createElement('button');
    exportBtn.className = 'settings-action-btn';
    exportBtn.textContent = '导出';
    exportBtn.addEventListener('click', () => this._exportAliasJSON());
    const importBtn = document.createElement('button');
    importBtn.className = 'settings-action-btn';
    importBtn.textContent = '导入';
    importBtn.addEventListener('click', () => this._importAliasJSON());
    footer.appendChild(exportBtn);
    footer.appendChild(importBtn);
    container.appendChild(footer);
};

// 显示别名编辑表单
AdvancedMUDClient.prototype._showAliasForm = function (index) {
    const formArea = document.getElementById('aliasFormArea');
    if (!formArea) return;

    if (formArea.innerHTML && formArea.dataset.editIndex === String(index)) {
        formArea.innerHTML = '';
        formArea.dataset.editIndex = '';
        return;
    }

    const isEdit = index >= 0;
    const alias = isEdit ? this._aliases[index] : null;

    formArea.dataset.editIndex = String(index);
    formArea.innerHTML = '';

    const form = document.createElement('div');
    form.className = 'settings-form';
    form.innerHTML = '<div class="settings-form-title">' + (isEdit ? '编辑别名' : '新增别名') + '</div>';

    // 名称
    const nameRow = document.createElement('div');
    nameRow.className = 'settings-form-row';
    nameRow.innerHTML = '<label>名称</label>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'settings-form-input';
    nameInput.placeholder = '如：施法';
    nameInput.value = alias ? alias.name : '';
    nameRow.appendChild(nameInput);
    form.appendChild(nameRow);

    // 匹配模式
    const patternRow = document.createElement('div');
    patternRow.className = 'settings-form-row';
    patternRow.innerHTML = '<label>匹配</label>';
    const patternInput = document.createElement('input');
    patternInput.type = 'text';
    patternInput.className = 'settings-form-input';
    patternInput.placeholder = '如：cs 或 ^cs (.+)$';
    patternInput.value = alias ? alias.pattern : '';
    patternRow.appendChild(patternInput);
    form.appendChild(patternRow);

    // 替换命令
    const cmdRow = document.createElement('div');
    cmdRow.className = 'settings-form-row';
    cmdRow.innerHTML = '<label>替换为</label>';
    const cmdInput = document.createElement('input');
    cmdInput.type = 'text';
    cmdInput.className = 'settings-form-input';
    cmdInput.placeholder = '如：cast shield $1 ；多命令用 ; 分隔';
    cmdInput.value = alias ? alias.command : '';
    cmdRow.appendChild(cmdInput);
    form.appendChild(cmdRow);

    // 按钮
    const btnRow = document.createElement('div');
    btnRow.className = 'settings-form-buttons';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'settings-action-btn';
    saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        const pattern = patternInput.value.trim();
        const command = cmdInput.value.trim();
        if (!name || !pattern || !command) {
            alert('请填写名称、匹配和替换命令');
            return;
        }
        // 正则模式时验证合法性
        if (/[*+?^${}()|[\]\\]/.test(pattern)) {
            try { new RegExp(pattern); } catch (e) { alert('正则表达式无效: ' + e.message); return; }
        }
        if (isEdit) {
            this.updateAlias(index, { name: name, pattern: pattern, command: command });
        } else {
            this.addAlias(name, pattern, command);
        }
        this._renderAliasList();
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'settings-action-btn';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
        formArea.innerHTML = '';
        formArea.dataset.editIndex = '';
    });
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    form.appendChild(btnRow);

    formArea.appendChild(form);
};

// 导出别名为 JSON 文件下载
AdvancedMUDClient.prototype._exportAliasJSON = function () {
    const json = this.exportAliases();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mud_aliases.json';
    a.click();
    URL.revokeObjectURL(url);
};

// 导入别名 JSON
AdvancedMUDClient.prototype._importAliasJSON = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                this.importAliases(ev.target.result);
                this._renderAliasList();
            } catch (err) {
                alert('导入失败: ' + err.message);
            }
        };
        reader.readAsText(file);
    });
    input.click();
};

// 渲染定时器列表到设置面板
AdvancedMUDClient.prototype._renderTimerList = function () {
    const container = document.getElementById('settingsTimers');
    if (!container) return;
    container.innerHTML = '';

    // 顶部操作栏
    const toolbar = document.createElement('div');
    toolbar.className = 'settings-toolbar';
    const addBtn = document.createElement('button');
    addBtn.className = 'settings-action-btn';
    addBtn.textContent = '+ 新增';
    addBtn.addEventListener('click', () => this._showTimerForm(-1));
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    // 定时器列表
    const timers = this._timers || [];
    if (timers.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'settings-empty';
        empty.textContent = '暂无定时任务';
        container.appendChild(empty);
    } else {
        timers.forEach((timer, index) => {
            const item = document.createElement('div');
            item.className = 'settings-item';

            const info = document.createElement('div');
            info.className = 'settings-item-info';
            let nameHtml = this._escHtml(timer.name);
            if (timer.builtin) nameHtml += '<span class="settings-item-badge builtin">内置</span>';
            // 运行状态指示
            if (timer.enabled && this._timerIntervals && this._timerIntervals.has(timer.name)) {
                nameHtml += '<span class="settings-item-badge running">运行中</span>';
            }
            info.innerHTML = '<div class="settings-item-name">' + nameHtml + '</div>'
                + '<div class="settings-item-detail">每 ' + timer.interval + ' 秒 · ' + this._escHtml(timer.command) + '</div>';

            const actions = document.createElement('div');
            actions.className = 'settings-item-actions';

            // 开关
            const toggle = document.createElement('label');
            toggle.className = 'settings-toggle';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = timer.enabled;
            input.addEventListener('change', () => {
                this.toggleTimer(index, input.checked);
                this._renderTimerList();
            });
            const slider = document.createElement('span');
            slider.className = 'slider';
            toggle.appendChild(input);
            toggle.appendChild(slider);
            actions.appendChild(toggle);

            // 编辑/删除（仅用户规则）
            if (!timer.builtin) {
                const editBtn = document.createElement('button');
                editBtn.className = 'settings-icon-btn';
                editBtn.textContent = '✎';
                editBtn.title = '编辑';
                editBtn.addEventListener('click', () => this._showTimerForm(index));
                actions.appendChild(editBtn);

                const delBtn = document.createElement('button');
                delBtn.className = 'settings-icon-btn settings-icon-btn-danger';
                delBtn.textContent = '✕';
                delBtn.title = '删除';
                delBtn.addEventListener('click', () => {
                    if (confirm('确认删除定时任务「' + timer.name + '」？')) {
                        this.removeTimer(index);
                        this._renderTimerList();
                    }
                });
                actions.appendChild(delBtn);
            }

            item.appendChild(info);
            item.appendChild(actions);
            container.appendChild(item);
        });
    }

    // 表单区域
    const formArea = document.createElement('div');
    formArea.id = 'timerFormArea';
    container.appendChild(formArea);

    // 底部导入/导出
    const footer = document.createElement('div');
    footer.className = 'settings-toolbar settings-toolbar-bottom';
    const exportBtn = document.createElement('button');
    exportBtn.className = 'settings-action-btn';
    exportBtn.textContent = '导出';
    exportBtn.addEventListener('click', () => this._exportTimerJSON());
    const importBtn = document.createElement('button');
    importBtn.className = 'settings-action-btn';
    importBtn.textContent = '导入';
    importBtn.addEventListener('click', () => this._importTimerJSON());
    footer.appendChild(exportBtn);
    footer.appendChild(importBtn);
    container.appendChild(footer);
};

// 显示定时器编辑表单
AdvancedMUDClient.prototype._showTimerForm = function (index) {
    const formArea = document.getElementById('timerFormArea');
    if (!formArea) return;

    if (formArea.innerHTML && formArea.dataset.editIndex === String(index)) {
        formArea.innerHTML = '';
        formArea.dataset.editIndex = '';
        return;
    }

    const isEdit = index >= 0;
    const timer = isEdit ? this._timers[index] : null;

    formArea.dataset.editIndex = String(index);
    formArea.innerHTML = '';

    const form = document.createElement('div');
    form.className = 'settings-form';
    form.innerHTML = '<div class="settings-form-title">' + (isEdit ? '编辑定时任务' : '新增定时任务') + '</div>';

    // 名称
    const nameRow = document.createElement('div');
    nameRow.className = 'settings-form-row';
    nameRow.innerHTML = '<label>名称</label>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'settings-form-input';
    nameInput.placeholder = '如：状态刷新';
    nameInput.value = timer ? timer.name : '';
    nameRow.appendChild(nameInput);
    form.appendChild(nameRow);

    // 间隔（秒）
    const intervalRow = document.createElement('div');
    intervalRow.className = 'settings-form-row';
    intervalRow.innerHTML = '<label>间隔（秒）</label>';
    const intervalInput = document.createElement('input');
    intervalInput.type = 'number';
    intervalInput.className = 'settings-form-input';
    intervalInput.min = '1';
    intervalInput.placeholder = '如：30';
    intervalInput.value = timer ? timer.interval : '';
    intervalRow.appendChild(intervalInput);
    form.appendChild(intervalRow);

    // 执行命令
    const cmdRow = document.createElement('div');
    cmdRow.className = 'settings-form-row';
    cmdRow.innerHTML = '<label>命令</label>';
    const cmdInput = document.createElement('input');
    cmdInput.type = 'text';
    cmdInput.className = 'settings-form-input';
    cmdInput.placeholder = '如：hp';
    cmdInput.value = timer ? timer.command : '';
    cmdRow.appendChild(cmdInput);
    form.appendChild(cmdRow);

    // 按钮
    const btnRow = document.createElement('div');
    btnRow.className = 'settings-form-buttons';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'settings-action-btn';
    saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        const interval = parseInt(intervalInput.value, 10);
        const command = cmdInput.value.trim();
        if (!name || !interval || !command) {
            alert('请填写名称、间隔和命令');
            return;
        }
        if (interval < 1) {
            alert('间隔至少 1 秒');
            return;
        }
        if (isEdit) {
            this.updateTimer(index, { name: name, interval: interval, command: command });
        } else {
            this.addTimer(name, interval, command);
        }
        this._renderTimerList();
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'settings-action-btn';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
        formArea.innerHTML = '';
        formArea.dataset.editIndex = '';
    });
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    form.appendChild(btnRow);

    formArea.appendChild(form);
};

// 导出定时器 JSON
AdvancedMUDClient.prototype._exportTimerJSON = function () {
    const json = this.exportTimers();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mud-timers.json';
    a.click();
    URL.revokeObjectURL(url);
};

// 导入定时器 JSON
AdvancedMUDClient.prototype._importTimerJSON = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                this.importTimers(reader.result);
                this._renderTimerList();
                this.appendMessage('✅ 定时器导入成功', 'system');
            } catch (err) {
                this.appendMessage('❌ 定时器导入失败: ' + err.message, 'system');
            }
        };
        reader.readAsText(file);
    });
    input.click();
};

// 渲染高亮列表（示例数据）
AdvancedMUDClient.prototype._renderHighlightList = function () {
    const container = document.getElementById('settingsHighlights');
    if (!container) return;
    container.innerHTML = '';

    const highlights = this._highlights || [];
    if (highlights.length === 0) {
        container.innerHTML = '<div class="settings-empty">暂无高亮规则</div>';
        return;
    }

    highlights.forEach((hl) => {
        const item = document.createElement('div');
        item.className = 'settings-item';

        const info = document.createElement('div');
        info.className = 'settings-item-info';
        info.innerHTML = '<div class="settings-item-name">' + this._escHtml(hl.keyword) + '</div>'
            + '<div class="settings-item-detail">颜色: <span style="color:' + this._escHtml(hl.color) + '">' + this._escHtml(hl.color) + '</span></div>';

        const toggle = document.createElement('label');
        toggle.className = 'settings-toggle';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = hl.enabled;
        const slider = document.createElement('span');
        slider.className = 'slider';
        toggle.appendChild(input);
        toggle.appendChild(slider);

        item.appendChild(info);
        item.appendChild(toggle);
        container.appendChild(item);
    });
};

// 渲染脚本列表到设置面板
AdvancedMUDClient.prototype._renderScriptList = function () {
    const container = document.getElementById('settingsScripts');
    if (!container) return;
    container.innerHTML = '';

    // 顶部操作栏
    const toolbar = document.createElement('div');
    toolbar.className = 'settings-toolbar';
    const addBtn = document.createElement('button');
    addBtn.className = 'settings-action-btn';
    addBtn.textContent = '+ 新增';
    addBtn.addEventListener('click', () => this._showScriptForm(-1));
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    // 脚本列表
    const scripts = this._scripts || [];
    if (scripts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'settings-empty';
        empty.textContent = '暂无用户脚本';
        container.appendChild(empty);
    } else {
        scripts.forEach((script, index) => {
            const item = document.createElement('div');
            item.className = 'settings-item';

            const info = document.createElement('div');
            info.className = 'settings-item-info';
            let nameHtml = this._escHtml(script.name);
            if (script.builtin) nameHtml += '<span class="settings-item-badge builtin">内置</span>';
            // 运行状态指示
            if (script.enabled && this.scriptEngine && this.scriptEngine.isRunning(script.name)) {
                nameHtml += '<span class="settings-item-badge running">运行中</span>';
            }
            info.innerHTML = '<div class="settings-item-name">' + nameHtml + '</div>'
                + '<div class="settings-item-detail">' + this._escHtml(script.description || '') + '</div>';

            const actions = document.createElement('div');
            actions.className = 'settings-item-actions';

            // 开关
            const toggle = document.createElement('label');
            toggle.className = 'settings-toggle';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = script.enabled;
            input.addEventListener('change', () => {
                this.toggleScript(index, input.checked);
                this._renderScriptList();
            });
            const slider = document.createElement('span');
            slider.className = 'slider';
            toggle.appendChild(input);
            toggle.appendChild(slider);
            actions.appendChild(toggle);

            // 编辑/删除（仅用户规则）
            if (!script.builtin) {
                const editBtn = document.createElement('button');
                editBtn.className = 'settings-icon-btn';
                editBtn.textContent = '✎';
                editBtn.title = '编辑';
                editBtn.addEventListener('click', () => this._showScriptForm(index));
                actions.appendChild(editBtn);

                const delBtn = document.createElement('button');
                delBtn.className = 'settings-icon-btn settings-icon-btn-danger';
                delBtn.textContent = '✕';
                delBtn.title = '删除';
                delBtn.addEventListener('click', () => {
                    if (confirm('确认删除脚本「' + script.name + '」？')) {
                        this.removeScript(index);
                        this._renderScriptList();
                    }
                });
                actions.appendChild(delBtn);
            }

            item.appendChild(info);
            item.appendChild(actions);
            container.appendChild(item);
        });
    }

    // 表单区域
    const formArea = document.createElement('div');
    formArea.id = 'scriptFormArea';
    container.appendChild(formArea);

    // 底部导入/导出
    const footer = document.createElement('div');
    footer.className = 'settings-toolbar settings-toolbar-bottom';
    const exportBtn = document.createElement('button');
    exportBtn.className = 'settings-action-btn';
    exportBtn.textContent = '导出';
    exportBtn.addEventListener('click', () => this._exportScriptJSON());
    const importBtn = document.createElement('button');
    importBtn.className = 'settings-action-btn';
    importBtn.textContent = '导入';
    importBtn.addEventListener('click', () => this._importScriptJSON());
    footer.appendChild(exportBtn);
    footer.appendChild(importBtn);
    container.appendChild(footer);
};

// 显示脚本编辑表单
AdvancedMUDClient.prototype._showScriptForm = function (index) {
    const formArea = document.getElementById('scriptFormArea');
    if (!formArea) return;

    if (formArea.innerHTML && formArea.dataset.editIndex === String(index)) {
        formArea.innerHTML = '';
        formArea.dataset.editIndex = '';
        return;
    }

    const isEdit = index >= 0;
    const script = isEdit ? this._scripts[index] : null;

    formArea.dataset.editIndex = String(index);
    formArea.innerHTML = '';

    const form = document.createElement('div');
    form.className = 'settings-form';
    form.innerHTML = '<div class="settings-form-title">' + (isEdit ? '编辑脚本' : '新增脚本') + '</div>';

    // 名称
    const nameRow = document.createElement('div');
    nameRow.className = 'settings-form-row';
    nameRow.innerHTML = '<label>名称</label>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'settings-form-input';
    nameInput.placeholder = '如：自动疗伤';
    nameInput.value = script ? script.name : '';
    nameRow.appendChild(nameInput);
    form.appendChild(nameRow);

    // 描述
    const descRow = document.createElement('div');
    descRow.className = 'settings-form-row';
    descRow.innerHTML = '<label>描述</label>';
    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'settings-form-input';
    descInput.placeholder = '如：气血低于 50% 时自动 exert recover';
    descInput.value = script ? (script.description || '') : '';
    descRow.appendChild(descInput);
    form.appendChild(descRow);

    // 代码（多行 textarea）
    const codeRow = document.createElement('div');
    codeRow.className = 'settings-form-row';
    codeRow.innerHTML = '<label>代码</label>';
    const codeInput = document.createElement('textarea');
    codeInput.className = 'settings-form-input settings-form-code';
    codeInput.rows = 6;
    codeInput.spellcheck = false;
    codeInput.placeholder = 'onMessage(/pattern/, () => sendCommand("cmd"));';
    codeInput.value = script ? (script.code || '') : '';
    codeRow.appendChild(codeInput);
    form.appendChild(codeRow);

    // API 提示
    const hint = document.createElement('div');
    hint.className = 'settings-form-hint';
    hint.textContent = 'API: onMessage(regex, cb) · sendCommand(cmd) · getVitals() · getCurrentRoom() · registerTimer(ms, cb) · log(msg) · isConnected()';
    form.appendChild(hint);

    // 按钮
    const btnRow = document.createElement('div');
    btnRow.className = 'settings-form-buttons';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'settings-action-btn';
    saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        const description = descInput.value.trim();
        const code = codeInput.value;
        if (!name || !code) {
            alert('请填写名称和代码');
            return;
        }
        if (isEdit) {
            this.updateScript(index, { name: name, description: description, code: code });
        } else {
            this.addScript(name, description, code);
        }
        this._renderScriptList();
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'settings-action-btn';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
        formArea.innerHTML = '';
        formArea.dataset.editIndex = '';
    });
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    form.appendChild(btnRow);

    formArea.appendChild(form);
};

// 导出脚本 JSON
AdvancedMUDClient.prototype._exportScriptJSON = function () {
    const json = this.exportScripts();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mud-scripts.json';
    a.click();
    URL.revokeObjectURL(url);
};

// 导入脚本 JSON
AdvancedMUDClient.prototype._importScriptJSON = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                this.importScripts(reader.result);
                this._renderScriptList();
                this.appendMessage('✅ 脚本导入成功', 'system');
            } catch (err) {
                this.appendMessage('❌ 脚本导入失败: ' + err.message, 'system');
            }
        };
        reader.readAsText(file);
    });
    input.click();
};

// HTML 转义工具
AdvancedMUDClient.prototype._escHtml = function (text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

// 小地图折叠/展开切换 + 九宫格移动面板点击委托
AdvancedMUDClient.prototype.setupRoomExits = function () {
    // 折叠/展开按钮
    const toggleBtn = document.getElementById('minimapToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            this.toggleMinimap();
        });
    }

    // 九宫格移动面板点击委托
    const movePanel = document.getElementById('movePanel');
    if (movePanel) {
        movePanel.addEventListener('click', (e) => {
            // 九宫格方向格子
            const cell = e.target.closest('.move-cell.has-exit[data-dir]');
            if (cell && this.connected) {
                const dir = cell.getAttribute('data-dir');
                if (dir) {
                    this.commandInput.value = dir;
                    this.handleSendCommand();
                    return;
                }
            }
            // 扩展栏按钮 (up/down/in/out/enter/leave)
            const extraBtn = e.target.closest('.move-extra-btn');
            if (extraBtn && this.connected) {
                const dir = extraBtn.getAttribute('data-dir');
                if (dir) {
                    this.commandInput.value = dir;
                    this.handleSendCommand();
                }
            }
        });
    }

    // 小地图面板拖拽（鼠标 + 触摸）
    const panel = document.getElementById('minimapPanel');
    const header = document.querySelector('.minimap-header');
    if (panel && header) {
        let dragging = false;
        let offsetX = 0, offsetY = 0;

        const onStart = (clientX, clientY) => {
            const rect = panel.getBoundingClientRect();
            // 从 right 定位切换到 left 定位
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            panel.style.right = 'auto';
            offsetX = clientX - rect.left;
            offsetY = clientY - rect.top;
            dragging = true;
            panel.classList.add('dragging');
        };

        const onMove = (clientX, clientY) => {
            if (!dragging) return;
            const x = clientX - offsetX;
            const y = clientY - offsetY;
            // 限制在视口内
            const maxX = window.innerWidth - panel.offsetWidth;
            const maxY = window.innerHeight - panel.offsetHeight;
            panel.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
            panel.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
        };

        const onEnd = () => {
            if (!dragging) return;
            dragging = false;
            panel.classList.remove('dragging');
        };

        // 鼠标事件
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.minimap-toggle')) return; // 点击折叠按钮不拖拽
            e.preventDefault();
            onStart(e.clientX, e.clientY);
        });
        document.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
        document.addEventListener('mouseup', onEnd);

        // 触摸事件
        header.addEventListener('touchstart', (e) => {
            if (e.target.closest('.minimap-toggle')) return;
            const t = e.touches[0];
            onStart(t.clientX, t.clientY);
        }, { passive: true });
        document.addEventListener('touchmove', (e) => {
            if (!dragging) return;
            const t = e.touches[0];
            onMove(t.clientX, t.clientY);
        }, { passive: true });
        document.addEventListener('touchend', onEnd);
    }

    // 地图全屏：双击小地图进入，双击全屏 canvas 或 Esc 或关闭按钮退出
    const miniCanvas = document.getElementById('minimapContent');
    const fsOverlay = document.getElementById('mapFullscreen');
    const fsCanvas = document.getElementById('mapFsCanvas');
    const fsClose = document.getElementById('mapFsClose');

    if (miniCanvas) {
        miniCanvas.addEventListener('dblclick', (e) => {
            e.preventDefault();
            if (typeof mapper !== 'undefined') mapper.enterFullscreen();
        });
    }
    if (fsCanvas) {
        fsCanvas.addEventListener('dblclick', () => {
            if (typeof mapper !== 'undefined') mapper.exitFullscreen();
        });
    }
    if (fsClose) {
        fsClose.addEventListener('click', () => {
            if (typeof mapper !== 'undefined') mapper.exitFullscreen();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && typeof mapper !== 'undefined' && mapper._fullscreen) {
            mapper.exitFullscreen();
        }
    });
    // 窗口大小变化时重新渲染全屏 canvas
    window.addEventListener('resize', () => {
        if (typeof mapper !== 'undefined' && mapper._fullscreen) {
            const header = fsOverlay ? fsOverlay.querySelector('.map-fs-header') : null;
            const headerH = header ? header.offsetHeight : 40;
            if (fsCanvas) {
                fsCanvas.width = window.innerWidth;
                fsCanvas.height = window.innerHeight - headerH;
            }
            mapper._renderFullscreenCanvas();
        }
    });
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
    // 存储最新房间信息，供脚本 API getCurrentRoom() 使用
    this._lastRoomInfo = roomInfo;

    const panel = document.getElementById('minimapPanel');
    const title = document.getElementById('minimapTitle');
    if (!panel || !title) return;
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 更新标题：房间名 + 区域
    let titleText = esc(roomInfo.name || '未知');
    if (roomInfo.area) titleText += ' <span style="color:#888;font-weight:normal;font-size:11px;">[' + esc(roomInfo.area) + ']</span>';
    title.innerHTML = titleText;

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

// 切换状态栏折叠/展开
AdvancedMUDClient.prototype.toggleStatusBar = function () {
    const panel = document.getElementById('statusBar');
    const toggle = document.getElementById('statusToggle');
    if (!panel) return;
    panel.classList.toggle('collapsed');
    if (toggle) {
        toggle.textContent = panel.classList.contains('collapsed') ? '+' : '\u2212';
    }
};

// 状态栏面板：折叠按钮 + 拖拽（鼠标 + 触摸）
AdvancedMUDClient.prototype.setupStatusBar = function () {
    // 折叠/展开按钮
    const toggleBtn = document.getElementById('statusToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => this.toggleStatusBar());
    }

    // 拖拽（与 minimap 相同逻辑）
    const panel = document.getElementById('statusBar');
    const header = document.querySelector('.status-header');
    if (!panel || !header) return;
    let dragging = false;
    let offsetX = 0, offsetY = 0;

    const onStart = (clientX, clientY) => {
        const rect = panel.getBoundingClientRect();
        // 清除居中 transform，改用显式像素定位（否则 translateX(-50%) 会与 left 叠加导致偏移）
        panel.style.transform = 'none';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        offsetX = clientX - rect.left;
        offsetY = clientY - rect.top;
        dragging = true;
        panel.classList.add('dragging');
    };
    const onMove = (clientX, clientY) => {
        if (!dragging) return;
        const x = clientX - offsetX;
        const y = clientY - offsetY;
        const maxX = window.innerWidth - panel.offsetWidth;
        const maxY = window.innerHeight - panel.offsetHeight;
        panel.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
        panel.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    };
    const onEnd = () => {
        if (!dragging) return;
        dragging = false;
        panel.classList.remove('dragging');
    };

    // 鼠标
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.status-toggle')) return;
        e.preventDefault();
        onStart(e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    document.addEventListener('mouseup', onEnd);

    // 触摸
    header.addEventListener('touchstart', (e) => {
        if (e.target.closest('.status-toggle')) return;
        const t = e.touches[0];
        onStart(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (!dragging) return;
        const t = e.touches[0];
        onMove(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchend', onEnd);
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

    // 触发器匹配：自动执行命令（仙丹拾取等）
    this._processTriggers(message);

    // 喂给脚本引擎的 onMessage 回调
    if (this.scriptEngine) this.scriptEngine.feedMessage(message);

    // 速走智能中断：遇敌暂停、事件结束恢复
    this._checkSpeedwalkTriggers(message);

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

// 速走智能中断：遇敌自动暂停，事件结束自动恢复
AdvancedMUDClient.prototype._checkSpeedwalkTriggers = function (message) {
    if (typeof pathfinder === 'undefined') return;

    // 遇敌自动暂停速走（与 Mudlet pauseSpeedWalk 触发器对齐）
    if (pathfinder.isWalking() && /看起来.+想杀死你！$/.test(message)) {
        pathfinder.pauseWalk();
        this.appendMessage('⚠ 速走已暂停（检测到敌人）', 'system');
        return;
    }

    // 叫船等待中，上岸后恢复速走（与 Mudlet doSpeedWalk 触发器对齐）
    if (pathfinder.isPaused() && /到啦，上岸吧/.test(message)) {
        pathfinder.resumeWalk(1000);
        this.appendMessage('▶ 速走已恢复（已上岸）', 'system');
        return;
    }
};

// 触发器处理：遍历规则表，匹配则自动发送命令
AdvancedMUDClient.prototype._processTriggers = function (message) {
    if (!this._triggers || !this.connected) return;
    const now = Date.now();
    for (const trigger of this._triggers) {
        if (!trigger.enabled) continue;
        if (trigger.cooldown > 0 && now - trigger._lastFired < trigger.cooldown * 1000) continue;
        if (trigger.pattern.test(message)) {
            trigger._lastFired = now;
            this.sendCommand(trigger.command);
            this.appendMessage('⚡ [' + trigger.name + '] → ' + trigger.command, 'system');
        }
    }
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
    let command = this.commandInput.value.trim();

    // 应用别名替换（可能返回字符串或命令数组）
    let commands = null;
    if (command) {
        const resolved = this.applyAlias(command);
        if (Array.isArray(resolved)) {
            commands = resolved;
        } else if (resolved !== command) {
            command = resolved;
        }
    }

    // 多命令宏：逐条回显并发送
    if (commands) {
        if (this.connected) {
            this.appendMessage('> ' + commands.join('; '), 'system');
        }
        for (const cmd of commands) {
            if (/^gtr\s+/i.test(cmd)) {
                const keyword = cmd.replace(/^gtr\s+/i, '').trim();
                if (keyword) this._handleGotoRoom(keyword);
            } else {
                this.sendCommand(cmd);
            }
        }
        this.addToHistory(command);
    } else if (command) {
        // 本地回显（ASCII 和 Telnet 模式均由客户端回显）
        if (this.connected) {
            if (this._expectPassword) {
                this.appendMessage('> ***', 'system');
                this._expectPassword = false;
            } else {
                this.appendMessage('> ' + command);
            }
        }

        // 拦截 gtr 命令，路由到寻路组件
        if (/^gtr\s+/i.test(command)) {
            const keyword = command.replace(/^gtr\s+/i, '').trim();
            if (keyword) this._handleGotoRoom(keyword);
            else this.appendMessage('用法: gtr 房间名|房间hash', 'system');
        } else {
            this.addToHistory(command);
            this.sendCommand(command);
        }
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

// ===== 自动寻路 (gtr) =====

AdvancedMUDClient.prototype._handleGotoRoom = async function (keyword) {
    if (typeof pathfinder === 'undefined') {
        this.appendMessage('寻路组件未加载', 'system');
        return;
    }

    // 停止当前行走
    if (pathfinder.isWalking()) {
        pathfinder.stopWalk();
        this.appendMessage('已停止自动行走', 'system');
        return;
    }

    // 确保地图数据已加载
    if (!pathfinder.loaded) {
        this.appendMessage('正在加载地图数据...', 'system');
        const ok = await pathfinder.ensureLoaded();
        if (!ok) {
            this.appendMessage('地图数据不可用（需先探索一些房间）', 'system');
            return;
        }
        if (pathfinder._source === 'mapper') {
            this.appendMessage('全量地图未导出，使用已探索数据寻路（范围有限）', 'system');
        }
    }

    // 先尝试按 hash 精确匹配
    const byHash = pathfinder.getRoom(keyword);
    if (byHash) {
        this._startPathwalk(byHash.hash, byHash.name);
        return;
    }

    // 按名称搜索
    const results = pathfinder.searchRoom(keyword);
    if (results.length === 0) {
        this.appendMessage('未找到匹配「' + keyword + '」的房间', 'system');
        return;
    }

    if (results.length === 1) {
        this._startPathwalk(results[0].hash, results[0].name);
        return;
    }

    // 多个匹配，显示可点击列表
    this.appendMessage('找到 ' + results.length + ' 个匹配房间：', 'system');
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let html = '';
    const maxShow = Math.min(results.length, 20);
    for (let i = 0; i < maxShow; i++) {
        const r = results[i];
        html += '<div class="message system">'
            + '<a class="exit-link" data-cmd="gtr ' + esc(r.hash) + '">'
            + esc(r.name) + '</a>'
            + ' <span style="color:#666">[' + esc(r.area) + ']</span>'
            + '</div>';
    }
    if (results.length > maxShow) {
        html += '<div class="message system" style="color:#666">... 还有 ' + (results.length - maxShow) + ' 个结果</div>';
    }
    // 直接插入终端，渲染为可点击链接
    const container = document.createElement('div');
    container.innerHTML = html;
    while (container.firstChild) {
        this.terminal.appendChild(container.firstChild);
    }
    this.terminal.scrollTop = this.terminal.scrollHeight;
};

AdvancedMUDClient.prototype._startPathwalk = function (targetHash, targetName) {
    if (!mapper || !mapper.currentHash) {
        this.appendMessage('当前位置未知，无法寻路', 'system');
        return;
    }

    const path = pathfinder.findPath(mapper.currentHash, targetHash);
    if (!path) {
        this.appendMessage('无法找到通往「' + targetName + '」的路径', 'system');
        return;
    }
    if (path.length === 0) {
        this.appendMessage('你已经在「' + targetName + '」', 'system');
        return;
    }

    this.addToHistory('gtr ' + targetName);
    this.appendMessage('自动寻路到「' + targetName + '」，共 ' + path.length + ' 步', 'system');

    // 计算路径上的房间 hash 序列，用于 canvas 高亮显示
    const pathHashes = [mapper.currentHash];
    let cur = mapper.currentHash;
    for (const dir of path) {
        const room = mapper.rooms.get(cur);
        const next = room && room.connections[dir];
        if (!next) break;
        pathHashes.push(next);
        cur = next;
    }
    mapper.setHighlightPath(pathHashes);

    pathfinder.startWalk(
        path,
        // onStep
        (index, dir, total) => {
            const dirLabel = (typeof DIR_SHORT !== 'undefined' ? DIR_SHORT[dir] : dir) || dir;
            this.appendMessage('  [' + (index + 1) + '/' + total + '] ' + dirLabel, 'system');
        },
        // onComplete
        (success) => {
            mapper.setHighlightPath(null);
            if (success) {
                this.appendMessage('已到达「' + targetName + '」', 'system');
            } else {
                this.appendMessage('自动行走已中断', 'system');
            }
        }
    );
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
