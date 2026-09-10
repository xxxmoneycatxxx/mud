// ===== UI 事件、命令处理、消息显示、ANSI 解析 — AdvancedMUDClient 原型扩展 =====

AdvancedMUDClient.prototype.setupQuickCommands = function () {
    const qcContainer = document.getElementById('quickCommands');
    if (!qcContainer) return;

    // 通用动作键：中文标签 + tooltip 显示实际命令
    // look 保留（房间描述常用），hp 移除（Gauge 已可视化显示）
    const actions = [
        { label: '环顾', cmd: 'look', title: 'look' },
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
    settingsBtn.textContent = '设置';
    settingsBtn.title = 'trigger / alias / timer / script';
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

    // 全套导出
    const btnExportAll = document.getElementById('btnExportAllConfig');
    if (btnExportAll) {
        btnExportAll.addEventListener('click', () => this._exportAllConfigJSON());
    }
    // 全套导入
    const btnImportAll = document.getElementById('btnImportAllConfig');
    if (btnImportAll) {
        btnImportAll.addEventListener('click', () => this._importAllConfigJSON());
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

// 全套导出：打包所有配置为 JSON 文件下载
AdvancedMUDClient.prototype._exportAllConfigJSON = function () {
    const json = this.exportAllConfig();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = 'mud-config-' + date + '.json';
    a.click();
    URL.revokeObjectURL(url);
    this.appendMessage('※ 全套配置已导出', 'system');
};

// 全套导入：选择 JSON 文件覆盖当前所有配置
AdvancedMUDClient.prototype._importAllConfigJSON = function () {
    if (!confirm('导入将覆盖当前所有配置（触发器/别名/脚本/定时器/高亮），内置规则保留。确认继续？')) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                this.importAllConfig(reader.result);
                this._renderActiveSettingsTab();
                this.appendMessage('※ 全套配置已导入', 'system');
            } catch (err) {
                this.appendMessage('！配置导入失败: ' + err.message, 'system');
            }
        };
        reader.readAsText(file);
    });
    input.click();
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
                this.appendMessage('※ 定时器导入成功', 'system');
            } catch (err) {
                this.appendMessage('！定时器导入失败: ' + err.message, 'system');
            }
        };
        reader.readAsText(file);
    });
    input.click();
};

// 渲染高亮列表到设置面板
AdvancedMUDClient.prototype._renderHighlightList = function () {
    const container = document.getElementById('settingsHighlights');
    if (!container) return;
    container.innerHTML = '';

    // 顶部操作栏
    const toolbar = document.createElement('div');
    toolbar.className = 'settings-toolbar';
    const addBtn = document.createElement('button');
    addBtn.className = 'settings-action-btn';
    addBtn.textContent = '+ 新增';
    addBtn.addEventListener('click', () => this._showHighlightForm(-1));
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    // 高亮规则列表
    const highlights = this._highlights || [];
    if (highlights.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'settings-empty';
        empty.textContent = '暂无高亮规则';
        container.appendChild(empty);
    } else {
        highlights.forEach((hl, index) => {
            const item = document.createElement('div');
            item.className = 'settings-item';

            const info = document.createElement('div');
            info.className = 'settings-item-info';
            const preview = '<span class="highlight-swatch" style="color:' + this._escHtml(hl.color) + '">■</span>';
            info.innerHTML = '<div class="settings-item-name">' + preview + ' ' + this._escHtml(hl.keyword) + '</div>'
                + '<div class="settings-item-detail">' + this._escHtml(hl.color) + (hl.builtin ? ' · 内置' : '') + '</div>';

            const actions = document.createElement('div');
            actions.className = 'settings-item-actions';

            // 开关
            const toggle = document.createElement('label');
            toggle.className = 'settings-toggle';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = hl.enabled;
            input.addEventListener('change', () => {
                this.toggleHighlight(index, input.checked);
                this._renderHighlightList();
            });
            const slider = document.createElement('span');
            slider.className = 'slider';
            toggle.appendChild(input);
            toggle.appendChild(slider);
            actions.appendChild(toggle);

            // 编辑/删除（仅用户规则）
            if (!hl.builtin) {
                const editBtn = document.createElement('button');
                editBtn.className = 'settings-icon-btn';
                editBtn.textContent = '✎';
                editBtn.title = '编辑';
                editBtn.addEventListener('click', () => this._showHighlightForm(index));
                actions.appendChild(editBtn);

                const delBtn = document.createElement('button');
                delBtn.className = 'settings-icon-btn settings-icon-btn-danger';
                delBtn.textContent = '✕';
                delBtn.title = '删除';
                delBtn.addEventListener('click', () => {
                    if (confirm('确认删除高亮规则「' + hl.keyword + '」？')) {
                        this.removeHighlight(index);
                        this._renderHighlightList();
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
    formArea.id = 'highlightFormArea';
    container.appendChild(formArea);

    // 底部导入/导出
    const footer = document.createElement('div');
    footer.className = 'settings-toolbar settings-toolbar-bottom';
    const exportBtn = document.createElement('button');
    exportBtn.className = 'settings-action-btn';
    exportBtn.textContent = '导出';
    exportBtn.addEventListener('click', () => this._exportHighlightJSON());
    const importBtn = document.createElement('button');
    importBtn.className = 'settings-action-btn';
    importBtn.textContent = '导入';
    importBtn.addEventListener('click', () => this._importHighlightJSON());
    footer.appendChild(exportBtn);
    footer.appendChild(importBtn);
    container.appendChild(footer);
};

// 显示高亮编辑表单
AdvancedMUDClient.prototype._showHighlightForm = function (index) {
    const formArea = document.getElementById('highlightFormArea');
    if (!formArea) return;

    if (formArea.innerHTML && formArea.dataset.editIndex === String(index)) {
        formArea.innerHTML = '';
        formArea.dataset.editIndex = '';
        return;
    }

    const isEdit = index >= 0;
    const hl = isEdit ? this._highlights[index] : null;

    formArea.dataset.editIndex = String(index);
    formArea.innerHTML = '';

    const form = document.createElement('div');
    form.className = 'settings-form';
    form.innerHTML = '<div class="settings-form-title">' + (isEdit ? '编辑高亮规则' : '新增高亮规则') + '</div>';

    // 关键词
    const kwRow = document.createElement('div');
    kwRow.className = 'settings-form-row';
    kwRow.innerHTML = '<label>关键词</label>';
    const kwInput = document.createElement('input');
    kwInput.type = 'text';
    kwInput.className = 'settings-form-input';
    kwInput.placeholder = '如：仙丹';
    kwInput.value = hl ? hl.keyword : '';
    kwRow.appendChild(kwInput);
    form.appendChild(kwRow);

    // 颜色选择
    const colorRow = document.createElement('div');
    colorRow.className = 'settings-form-row';
    colorRow.innerHTML = '<label>颜色</label>';

    const colorPicker = document.createElement('div');
    colorPicker.className = 'highlight-color-picker';

    // 预设色块
    const presetColors = ['#ff4444', '#ff8800', '#ffff00', '#44ff44', '#00ffff', '#4488ff', '#ff44ff', '#ffffff'];
    const currentColor = hl ? hl.color : '#ffff00';
    presetColors.forEach(c => {
        const swatch = document.createElement('span');
        swatch.className = 'highlight-color-swatch' + (c === currentColor ? ' active' : '');
        swatch.style.backgroundColor = c;
        swatch.dataset.color = c;
        swatch.addEventListener('click', () => {
            hexInput.value = c;
            previewSwatch.style.color = c;
            colorPicker.querySelectorAll('.highlight-color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
        });
        colorPicker.appendChild(swatch);
    });

    // 自定义 hex 输入
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'settings-form-input highlight-hex-input';
    hexInput.placeholder = '#ffff00';
    hexInput.value = currentColor;
    hexInput.maxLength = 7;

    // 实时预览色块
    const previewSwatch = document.createElement('span');
    previewSwatch.className = 'highlight-preview-swatch';
    previewSwatch.style.color = currentColor;
    previewSwatch.textContent = '■ 预览';

    hexInput.addEventListener('input', () => {
        const val = hexInput.value.trim();
        if (/^#[0-9a-fA-F]{3,6}$/.test(val)) {
            previewSwatch.style.color = val;
            colorPicker.querySelectorAll('.highlight-color-swatch').forEach(s => {
                s.classList.toggle('active', s.dataset.color === val);
            });
        }
    });

    colorRow.appendChild(colorPicker);
    colorRow.appendChild(hexInput);
    colorRow.appendChild(previewSwatch);
    form.appendChild(colorRow);

    // 按钮
    const btnRow = document.createElement('div');
    btnRow.className = 'settings-form-buttons';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'settings-action-btn';
    saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', () => {
        const keyword = kwInput.value.trim();
        const color = hexInput.value.trim();
        if (!keyword) {
            alert('请填写关键词');
            return;
        }
        if (!/^#[0-9a-fA-F]{3,6}$/.test(color)) {
            alert('颜色格式不正确，请使用 #RRGGBB 格式');
            return;
        }
        if (isEdit) {
            this.updateHighlight(index, { keyword: keyword, color: color });
        } else {
            this.addHighlight(keyword, color);
        }
        this._renderHighlightList();
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

// 导出高亮规则 JSON
AdvancedMUDClient.prototype._exportHighlightJSON = function () {
    const json = this.exportHighlights();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mud-highlights.json';
    a.click();
    URL.revokeObjectURL(url);
};

// 导入高亮规则 JSON
AdvancedMUDClient.prototype._importHighlightJSON = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                this.importHighlights(reader.result);
                this._renderHighlightList();
                this.appendMessage('※ 高亮规则导入成功', 'system');
            } catch (err) {
                this.appendMessage('！高亮规则导入失败: ' + err.message, 'system');
            }
        };
        reader.readAsText(file);
    });
    input.click();
};

// 高亮渲染：在已解析 ANSI 的 HTML 中替换关键词为带颜色的 span
AdvancedMUDClient.prototype._applyHighlights = function (html) {
    if (!this._highlights) return html;
    const active = this._highlights.filter(h => h.enabled && h.keyword);
    if (active.length === 0) return html;

    for (const hl of active) {
        const escaped = hl.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp('(?<=>)([^<]*?)(' + escaped + ')', 'g');
        html = html.replace(regex, '$1<span style="color:' + hl.color.replace(/"/g, '') + ';font-weight:bold">$2</span>');
    }
    return html;
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

    // 可视化构建器入口
    const visualBtn = document.createElement('button');
    visualBtn.className = 'settings-action-btn';
    visualBtn.textContent = '⚡ 可视化构建';
    visualBtn.title = '无需写代码，填表即可生成常用脚本';
    visualBtn.addEventListener('click', () => this._showVisualBuilder());
    toolbar.appendChild(visualBtn);

    container.appendChild(toolbar);

    // 脚本列表
    const scripts = this._scripts || [];
    if (scripts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'settings-empty';
        empty.textContent = '暂无用户脚本';
        container.appendChild(empty);
    } else {
        // 分离内置脚本和用户脚本
        const builtins = [];
        const userScripts = [];
        scripts.forEach((script, index) => {
            if (script.builtin) builtins.push({ script, index });
            else userScripts.push({ script, index });
        });

        // 渲染单个脚本条目
        const renderItem = (script, index) => {
            const item = document.createElement('div');
            item.className = 'settings-item';

            const info = document.createElement('div');
            info.className = 'settings-item-info';
            let nameHtml = this._escHtml(script.name);
            if (script.builtin) nameHtml += '<span class="settings-item-badge builtin">内置</span>';
            const isRunning = script.enabled && this.scriptEngine && this.scriptEngine.isRunning(script.name);
            if (isRunning) nameHtml += '<span class="settings-item-badge running">运行中</span>';
            info.innerHTML = '<div class="settings-item-name">' + nameHtml + '</div>';

            // 描述 + 运行时摘要
            let detail = script.description || '';
            if (isRunning && this.scriptEngine) {
                const status = this.scriptEngine.getStatus(script.name);
                if (status) {
                    const parts = [];
                    if (status.handlers > 0) parts.push(status.handlers + ' 触发器');
                    if (status.timers > 0) parts.push(status.timers + ' 定时器');
                    if (status.gmcpHandlers > 0) parts.push(status.gmcpHandlers + ' GMCP');
                    if (parts.length > 0) detail += (detail ? ' · ' : '') + parts.join(' · ');
                }
            }
            if (detail) info.innerHTML += '<div class="settings-item-detail">' + this._escHtml(detail) + '</div>';

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
            return item;
        };

        // 内置脚本始终在最上方，不参与分组
        builtins.forEach(({ script, index }) => {
            container.appendChild(renderItem(script, index));
        });

        // 用户脚本按 group 分组
        const groupMap = new Map();
        userScripts.forEach(({ script, index }) => {
            const g = script.group || '';
            if (!groupMap.has(g)) groupMap.set(g, []);
            groupMap.get(g).push({ script, index });
        });

        for (const [group, items] of groupMap) {
            if (group) {
                // 有分组：用 <details> 折叠
                const details = document.createElement('details');
                details.className = 'script-group';
                details.open = true;
                const summary = document.createElement('summary');
                summary.className = 'script-group-summary';
                summary.textContent = group + ' (' + items.length + ')';
                details.appendChild(summary);
                items.forEach(({ script, index }) => {
                    details.appendChild(renderItem(script, index));
                });
                container.appendChild(details);
            } else {
                // 无分组：直接渲染
                items.forEach(({ script, index }) => {
                    container.appendChild(renderItem(script, index));
                });
            }
        }
    }

    // 表单区域
    const formArea = document.createElement('div');
    formArea.id = 'scriptFormArea';
    container.appendChild(formArea);

    // 可视化构建器表单区域
    const builderArea = document.createElement('div');
    builderArea.id = 'scriptBuilderArea';
    container.appendChild(builderArea);

    // API 文档面板
    this._renderApiDoc(container);

    // 底部导入/导出/查看存储
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
    const storeBtn = document.createElement('button');
    storeBtn.className = 'settings-action-btn';
    storeBtn.textContent = '查看存储';
    storeBtn.addEventListener('click', () => this._showStoreViewer());
    footer.appendChild(exportBtn);
    footer.appendChild(importBtn);
    footer.appendChild(storeBtn);
    container.appendChild(footer);
};

// 查看脚本共享存储
AdvancedMUDClient.prototype._showStoreViewer = function () {
    const STORE_KEY = 'mud_script_store';
    let data = {};
    try { data = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) {}
    const keys = Object.keys(data);

    if (keys.length === 0) {
        this.appendMessage('※ 脚本存储为空，无数据', 'system');
        return;
    }

    this.appendMessage('※ 脚本共享存储（' + keys.length + ' 项）：', 'system');
    keys.forEach(key => {
        let val = data[key];
        let display = typeof val === 'object' ? JSON.stringify(val) : String(val);
        if (display.length > 60) display = display.substring(0, 57) + '...';
        this.appendMessage('  ' + key + ' = ' + display, 'system');
    });

    if (confirm('确认清空脚本共享存储？（' + keys.length + ' 项数据将丢失）')) {
        localStorage.removeItem(STORE_KEY);
        this.appendMessage('※ 脚本存储已清空', 'system');
    }
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

    // 使用独立全屏模态框编辑器
    this._showScriptEditorModal(index);
};

// ===== 独立脚本编辑模态框（全屏高占比） =====
AdvancedMUDClient.prototype._showScriptEditorModal = function (index) {
    const isEdit = index >= 0;
    const script = isEdit ? this._scripts[index] : null;

    // 收集已有分组列表
    const groups = [];
    (this._scripts || []).forEach(function (s) {
        if (s.group && groups.indexOf(s.group) === -1) groups.push(s.group);
    });

    // 创建模态框覆盖层
    const overlay = document.createElement('div');
    overlay.className = 'script-editor-overlay';

    const modal = document.createElement('div');
    modal.className = 'script-editor-modal';

    // —— 标题栏 ——
    const titleBar = document.createElement('div');
    titleBar.className = 'script-editor-titlebar';
    titleBar.innerHTML = '<span>' + (isEdit ? '编辑脚本' : '新增脚本') + '</span>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'script-editor-close';
    closeBtn.textContent = '✕';
    closeBtn.title = '关闭 (Esc)';
    titleBar.appendChild(closeBtn);
    modal.appendChild(titleBar);

    // —— 顶部元数据区（名称 / 描述 / 分组） ——
    const metaBar = document.createElement('div');
    metaBar.className = 'script-editor-meta';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'settings-form-input';
    nameInput.placeholder = '脚本名称';
    nameInput.value = script ? script.name : '';
    metaBar.appendChild(nameInput);

    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'settings-form-input';
    descInput.placeholder = '描述（可选）';
    descInput.value = script ? (script.description || '') : '';
    metaBar.appendChild(descInput);

    const groupWrap = document.createElement('div');
    groupWrap.className = 'script-editor-group-wrap';
    const groupInput = document.createElement('input');
    groupInput.type = 'text';
    groupInput.className = 'settings-form-input';
    groupInput.placeholder = '分组';
    groupInput.value = script ? (script.group || '') : '';
    groupInput.setAttribute('list', 'scriptGroupOptions');
    const datalist = document.createElement('datalist');
    datalist.id = 'scriptGroupOptions';
    groups.forEach(function (g) {
        const opt = document.createElement('option');
        opt.value = g;
        datalist.appendChild(opt);
    });
    groupWrap.appendChild(groupInput);
    groupWrap.appendChild(datalist);
    metaBar.appendChild(groupWrap);

    modal.appendChild(metaBar);

    // —— 主体区域（左：代码编辑器 65% / 右：API 文档 35%） ——
    const body = document.createElement('div');
    body.className = 'script-editor-body';

    // 左侧：代码编辑区
    const editorPane = document.createElement('div');
    editorPane.className = 'script-editor-pane';

    const codeWrap = document.createElement('div');
    codeWrap.className = 'code-editor-wrap script-editor-code-wrap';
    editorPane.appendChild(codeWrap);

    // 语法错误提示
    const errHint = document.createElement('div');
    errHint.className = 'settings-form-errhint';
    errHint.style.display = 'none';
    editorPane.appendChild(errHint);

    body.appendChild(editorPane);

    // 右侧：API 文档面板（可折叠）
    const apiPane = document.createElement('div');
    apiPane.className = 'script-editor-api';
    this._buildEditorApiPanel(apiPane);
    body.appendChild(apiPane);

    modal.appendChild(body);

    // —— 底部按钮栏 ——
    const footer = document.createElement('div');
    footer.className = 'script-editor-footer';

    const apiToggle = document.createElement('button');
    apiToggle.className = 'settings-action-btn';
    apiToggle.textContent = '📖 API 文档';
    footer.appendChild(apiToggle);

    const btnGroup = document.createElement('div');
    btnGroup.className = 'script-editor-btn-group';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'settings-action-btn';
    saveBtn.textContent = '保存';
    btnGroup.appendChild(saveBtn);
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'settings-action-btn';
    cancelBtn.textContent = '取消';
    btnGroup.appendChild(cancelBtn);
    footer.appendChild(btnGroup);

    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // ===== 事件绑定 =====

    // 初始化 CodeMirror 5 编辑器
    const cm = CodeMirror(codeWrap, {
        value: script ? (script.code || '') : '',
        mode: 'javascript',
        theme: 'mud-crt',
        lineNumbers: true,
        matchBrackets: true,
        styleActiveLine: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        lineWrapping: true,
        extraKeys: {
            'Enter': 'newlineAndIndent',
        },
    });
    cm.markClean();

    // 记录初始元数据，用于判断是否有未保存修改
    const initName = script ? (script.name || '') : '';
    const initDesc = script ? (script.description || '') : '';
    const initGroup = script ? (script.group || '') : '';
    const isDirty = () => {
        return !cm.isClean()
            || nameInput.value.trim() !== initName
            || descInput.value.trim() !== initDesc
            || groupInput.value.trim() !== initGroup;
    };

    // 默认根据屏幕宽度决定是否展开 API 面板
    let apiVisible = window.innerWidth >= 900;
    const applyApiVisibility = () => {
        apiPane.style.display = apiVisible ? '' : 'none';
        apiToggle.textContent = apiVisible ? '📖 隐藏文档' : '📖 API 文档';
    };
    applyApiVisibility();

    apiToggle.addEventListener('click', () => {
        apiVisible = !apiVisible;
        applyApiVisibility();
    });

    // 关闭模态框（有未保存修改时确认）
    const closeModal = (force) => {
        if (!force && isDirty()) {
            if (!confirm('有未保存的修改，确认放弃？')) return;
        }
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
    };
    const escHandler = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', escHandler);
    closeBtn.addEventListener('click', () => closeModal());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    // 保存
    saveBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        const description = descInput.value.trim();
        const group = groupInput.value.trim();
        const code = cm.getValue();
        if (!name || !code) {
            alert('请填写名称和代码');
            return;
        }
        // 语法预检
        try {
            new Function(
                'onMessage', 'sendCommand', 'getVitals', 'getCurrentRoom',
                'registerTimer', 'sleep', 'log', 'isConnected',
                'getStore', 'onGMCP',
                'stripAnsi', 'waitMessage',
                code
            );
            errHint.style.display = 'none';
        } catch (e) {
            errHint.textContent = '❗ 语法错误: ' + e.message;
            errHint.style.display = 'block';
            return;
        }
        if (isEdit) {
            this.updateScript(index, { name: name, description: description, group: group, code: code });
        } else {
            this.addScript(name, description, code);
            // 新增后补充 group 字段
            if (group) {
                const newIdx = this._scripts.length - 1;
                this._scripts[newIdx].group = group;
                this._saveScripts();
            }
        }
        this._renderScriptList();
        closeModal(true);
    });

    // 取消
    cancelBtn.addEventListener('click', () => closeModal());

    // 聚焦代码区
    setTimeout(() => cm.refresh(), 0);
    cm.focus();
};

// ===== 模态框内 API 文档面板构建 =====
AdvancedMUDClient.prototype._buildEditorApiPanel = function (container) {
    const header = document.createElement('div');
    header.className = 'script-editor-api-header';
    header.innerHTML = '<span>📖 API 参考</span>';
    container.appendChild(header);

    const scroll = document.createElement('div');
    scroll.className = 'script-editor-api-scroll';

    const apis = [
        {
            sig: 'onMessage(pattern, callback)',
            desc: '注册消息匹配回调，当收到的文本匹配 pattern 时调用。',
            params: ['pattern: RegExp — 匹配消息的正则表达式', 'callback: function(matchedText, matchResult)'],
            example: 'onMessage(/你盘膝坐下/, () => sendCommand("meditation"));'
        },
        {
            sig: 'sendCommand(cmd)',
            desc: '向服务端发送一条命令。',
            params: ['cmd: string — 命令字符串，自动 trim'],
            example: 'sendCommand("exert recover");'
        },
        {
            sig: 'getVitals()',
            desc: '获取当前角色状态（返回副本）。',
            params: ['返回: object — hp, max_hp, mp, max_mp, sp, max_sp 等'],
            example: 'const v = getVitals();\nif (v.hp < v.max_hp * 0.5) sendCommand("exert recover");'
        },
        {
            sig: 'getCurrentRoom()',
            desc: '获取当前房间信息。',
            params: ['返回: object|null — name, exits, area, hash'],
            example: 'const room = getCurrentRoom();\nlog("当前房间: " + room.name);'
        },
        {
            sig: 'registerTimer(ms, callback)',
            desc: '注册周期定时任务。',
            params: ['ms: number — 间隔毫秒（最小 100）', 'callback: function — 每次触发执行'],
            example: 'registerTimer(5000, () => {\n    const v = getVitals();\n    if (v.hp < v.max_hp * 0.5) sendCommand("exert recover");\n});'
        },
        {
            sig: 'sleep(ms)',
            desc: '延迟指定毫秒，返回 Promise。配合 async/await。',
            params: ['ms: number — 延迟毫秒（最小 100）'],
            example: 'onMessage(/战斗结束/, async () => {\n    sendCommand("get all from corpse");\n    await sleep(1000);\n    sendCommand("north");\n});'
        },
        {
            sig: 'log(msg)',
            desc: '输出日志到终端（自动带脚本名前缀）。',
            params: ['msg: string — 日志文本'],
            example: 'log("气血不足，自动疗伤");'
        },
        {
            sig: 'isConnected()',
            desc: '检查当前是否已连接。',
            params: ['返回: boolean'],
            example: 'if (isConnected()) sendCommand("hp");'
        },
        {
            sig: 'getStore()',
            desc: '获取共享变量存储（所有脚本共享，localStorage 持久化）。',
            params: ['返回: object — { get(key), set(key, val), del(key), keys() }'],
            example: 'const store = getStore();\nstore.set("count", (store.get("count") || 0) + 1);\nlog("执行次数: " + store.get("count"));'
        },
        {
            sig: 'onGMCP(module, callback)',
            desc: '订阅 GMCP 模块推送事件，收到数据时调用。',
            params: ['module: string — GMCP 模块名（如 "Char.Vitals"）', 'callback: function(data) — 收到数据时的回调'],
            example: 'onGMCP("Char.Vitals", (data) => {\n    if (data.hp < data.max_hp * 0.3) log("气血危急!");\n});'
        },
        {
            sig: 'stripAnsi(text)',
            desc: '去除字符串中的 ANSI 转义码，返回纯文本。脚本收到的消息含颜色码，匹配前应先脱色。',
            params: ['text: string — 含 ANSI 转义码的原始文本', '返回: string — 纯文本'],
            example: 'onMessage(/杀死/, (text) => {\n    const clean = stripAnsi(text);\n    log("脱色后: " + clean);\n});'
        },
        {
            sig: 'waitMessage(pattern, timeout)',
            desc: '等待匹配的消息出现，返回 Promise。resolve(true)=匹配到，resolve(false)=超时。',
            params: ['pattern: RegExp — 匹配模式', 'timeout: number — 超时毫秒数（默认 30000）', '返回: Promise<boolean>'],
            example: '(async () => {\n    sendCommand("practice sword");\n    const ok = await waitMessage(/已练到极限/, 10000);\n    if (ok) log("练剑完成");\n    else log("超时");\n})();'
        }
    ];

    apis.forEach((api) => {
        const item = document.createElement('div');
        item.className = 'script-api-item';
        let html = '<div class="api-func">' + this._escHtml(api.sig) + '</div>';
        html += '<div class="api-desc">' + this._escHtml(api.desc) + '</div>';
        html += '<div class="api-params">';
        api.params.forEach((p) => {
            html += '<div class="api-param">· ' + this._escHtml(p) + '</div>';
        });
        html += '</div>';
        html += '<pre class="api-example">' + this._escHtml(api.example) + '</pre>';
        item.innerHTML = html;
        scroll.appendChild(item);
    });

    // 常见模式
    const patterns = document.createElement('div');
    patterns.className = 'script-api-patterns';
    patterns.innerHTML = '<div class="api-pattern-title">常见模式</div>'
        + '<div class="api-pattern-item"><b>消息触发 + 冷却</b><pre>'
        + this._escHtml('let last = 0;\nonMessage(/触发文本/, () => {\n    if (Date.now() - last < 5000) return;\n    last = Date.now();\n    sendCommand("执行命令");\n});')
        + '</pre></div>'
        + '<div class="api-pattern-item"><b>定时检查 + 条件执行</b><pre>'
        + this._escHtml('registerTimer(3000, () => {\n    const v = getVitals();\n    if (v.hp && v.max_hp && v.hp < v.max_hp * 0.5) {\n        sendCommand("exert recover");\n        log("自动疗伤");\n    }\n});')
        + '</pre></div>'
        + '<div class="api-pattern-item"><b>顺序延迟操作</b><pre>'
        + this._escHtml('onMessage(/战斗结束/, async () => {\n    sendCommand("get all from corpse");\n    await sleep(1000);\n    sendCommand("north");\n});')
        + '</pre></div>'
        + '<div class="api-pattern-item"><b>等待指定消息（循环直至检测到）</b><pre>'
        + this._escHtml('(async () => {\n    while (true) {\n        sendCommand("practice sword");\n        if (await waitMessage(/你已练到极限/, 10000)) {\n            log("练剑完成");\n            break;\n        }\n    }\n})();')
        + '</pre></div>';
    scroll.appendChild(patterns);

    container.appendChild(scroll);
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
                this.appendMessage('※ 脚本导入成功', 'system');
            } catch (err) {
                this.appendMessage('！脚本导入失败: ' + err.message, 'system');
            }
        };
        reader.readAsText(file);
    });
    input.click();
};

// ===== API 文档面板（可折叠） =====
AdvancedMUDClient.prototype._renderApiDoc = function (container) {
    const doc = document.createElement('div');
    doc.className = 'script-api-doc';

    // 可点击的折叠头部
    const header = document.createElement('div');
    header.className = 'script-api-doc-header';
    header.innerHTML = '<span>📖 API 参考文档</span><span class="script-api-arrow">▶</span>';
    header.addEventListener('click', () => {
        const body = doc.querySelector('.script-api-doc-body');
        const arrow = header.querySelector('.script-api-arrow');
        if (body.style.display === 'none') {
            body.style.display = 'block';
            arrow.textContent = '▼';
        } else {
            body.style.display = 'none';
            arrow.textContent = '▶';
        }
    });
    doc.appendChild(header);

    // 文档主体（默认折叠）
    const body = document.createElement('div');
    body.className = 'script-api-doc-body';
    body.style.display = 'none';

    const apis = [
        {
            name: 'onMessage',
            sig: 'onMessage(pattern, callback)',
            desc: '注册消息匹配回调，当收到的文本匹配 pattern 时调用 callback。',
            params: [
                'pattern: RegExp — 匹配消息的正则表达式（必须）',
                'callback: function(matchedText, matchResult) — 匹配时执行的回调'
            ],
            example: 'onMessage(/你盘膝坐下/, () => sendCommand("meditation"));'
        },
        {
            name: 'sendCommand',
            sig: 'sendCommand(cmd)',
            desc: '向服务端发送一条命令。',
            params: ['cmd: string — 命令字符串，自动 trim 空白'],
            example: 'sendCommand("exert recover");'
        },
        {
            name: 'getVitals',
            sig: 'getVitals()',
            desc: '获取当前角色状态数据（返回副本，不可修改内部状态）。',
            params: ['返回: object — 包含 hp, max_hp, mp, max_mp, sp, max_sp 等字段'],
            example: 'const v = getVitals();\nif (v.hp < v.max_hp * 0.5) sendCommand("exert recover");'
        },
        {
            name: 'getCurrentRoom',
            sig: 'getCurrentRoom()',
            desc: '获取当前房间信息。',
            params: ['返回: object|null — 包含 name, exits, area, hash 字段；未连接时返回 null'],
            example: 'const room = getCurrentRoom();\nlog("当前房间: " + room.name);'
        },
        {
            name: 'registerTimer',
            sig: 'registerTimer(ms, callback)',
            desc: '注册周期性定时任务，每隔 ms 毫秒执行一次 callback。',
            params: [
                'ms: number — 间隔毫秒数（最小 100）',
                'callback: function — 每次触发时执行的回调'
            ],
            example: 'registerTimer(5000, () => {\n    const v = getVitals();\n    if (v.hp < v.max_hp * 0.5) sendCommand("exert recover");\n});'
        },
        {
            name: 'sleep',
            sig: 'sleep(ms)',
            desc: '延迟指定毫秒数，返回 Promise。配合 async/await 实现顺序延迟。脚本停止时自动取消。',
            params: ['ms: number — 延迟毫秒数（最小 100）'],
            example: 'onMessage(/你盘膝坐下/, async () => {\n    sendCommand("meditation");\n    await sleep(3000);\n    sendCommand("exert recover");\n});'
        },
        {
            name: 'log',
            sig: 'log(msg)',
            desc: '输出日志消息到终端显示（system 类型），自动带脚本名前缀。',
            params: ['msg: string — 要显示的日志文本'],
            example: 'log("气血不足，自动疗伤");'
        },
        {
            name: 'isConnected',
            sig: 'isConnected()',
            desc: '检查当前是否已连接到服务器。',
            params: ['返回: boolean — true 表示已连接'],
            example: 'if (isConnected()) sendCommand("hp");'
        },
        {
            name: 'getStore',
            sig: 'getStore()',
            desc: '获取共享变量存储（所有脚本共享，localStorage 持久化）。',
            params: ['返回: object — { get(key), set(key, val), del(key), keys() }'],
            example: 'const store = getStore();\nstore.set("count", (store.get("count") || 0) + 1);\nlog("执行次数: " + store.get("count"));'
        },
        {
            name: 'onGMCP',
            sig: 'onGMCP(module, callback)',
            desc: '订阅 GMCP 模块推送事件，收到数据时调用回调。',
            params: [
                'module: string — GMCP 模块名（如 "Char.Vitals"）',
                'callback: function(data) — 收到数据时的回调，参数为解析后的对象'
            ],
            example: 'onGMCP("Char.Vitals", (data) => {\n    if (data.hp < data.max_hp * 0.3) log("气血危急!");\n});'
        },
        {
            name: 'stripAnsi',
            sig: 'stripAnsi(text)',
            desc: '去除字符串中的 ANSI 转义码，返回纯文本。脚本收到的消息含颜色码，匹配前应先脱色。',
            params: [
                'text: string — 含 ANSI 转义码的原始文本',
                '返回: string — 纯文本'
            ],
            example: 'onMessage(/杀死/, (text) => {\n    const clean = stripAnsi(text);\n    log("脱色后: " + clean);\n});'
        },
        {
            name: 'waitMessage',
            sig: 'waitMessage(pattern, timeout)',
            desc: '等待匹配的消息出现，返回 Promise。resolve(true)=匹配到，resolve(false)=超时。',
            params: [
                'pattern: RegExp — 匹配模式',
                'timeout: number — 超时毫秒数（默认 30000）',
                '返回: Promise<boolean>'
            ],
            example: '(async () => {\n    sendCommand("practice sword");\n    const ok = await waitMessage(/已练到极限/, 10000);\n    if (ok) log("练剑完成");\n    else log("超时");\n})();'
        }
    ];

    apis.forEach(api => {
        const item = document.createElement('div');
        item.className = 'script-api-item';
        let html = '<div class="api-func">' + this._escHtml(api.sig) + '</div>';
        html += '<div class="api-desc">' + this._escHtml(api.desc) + '</div>';
        html += '<div class="api-params">';
        api.params.forEach(p => {
            html += '<div class="api-param">· ' + this._escHtml(p) + '</div>';
        });
        html += '</div>';
        html += '<pre class="api-example">' + this._escHtml(api.example) + '</pre>';
        item.innerHTML = html;
        body.appendChild(item);
    });

    // 常见模式提示
    const patterns = document.createElement('div');
    patterns.className = 'script-api-patterns';
    patterns.innerHTML = '<div class="api-pattern-title">常见模式</div>'
        + '<div class="api-pattern-item"><b>消息触发 + 冷却</b><pre>'
        + this._escHtml('let last = 0;\nonMessage(/触发文本/, () => {\n    if (Date.now() - last < 5000) return;\n    last = Date.now();\n    sendCommand("执行命令");\n});')
        + '</pre></div>'
        + '<div class="api-pattern-item"><b>定时检查 + 条件执行</b><pre>'
        + this._escHtml('registerTimer(3000, () => {\n    const v = getVitals();\n    if (v.hp && v.max_hp && v.hp < v.max_hp * 0.5) {\n        sendCommand("exert recover");\n        log("自动疗伤");\n    }\n});')
        + '</pre></div>'
        + '<div class="api-pattern-item"><b>顺序延迟操作</b><pre>'
        + this._escHtml('onMessage(/战斗结束/, async () => {\n    sendCommand("get all from corpse");\n    await sleep(1000);\n    sendCommand("north");\n});')
        + '</pre></div>'
        + '<div class="api-pattern-item"><b>等待指定消息（循环直至检测到）</b><pre>'
        + this._escHtml('(async () => {\n    while (true) {\n        sendCommand("practice sword");\n        if (await waitMessage(/你已练到极限/, 10000)) {\n            log("练剑完成");\n            break;\n        }\n    }\n})();')
        + '</pre></div>';
    body.appendChild(patterns);

    doc.appendChild(body);
    container.appendChild(doc);
};

// ===== 可视化脚本构建器 =====
AdvancedMUDClient.prototype._showVisualBuilder = function () {
    const area = document.getElementById('scriptBuilderArea');
    if (!area) return;

    // 切换显示/隐藏
    if (area.innerHTML && !area.dataset.collapsed) {
        area.innerHTML = '';
        area.dataset.collapsed = '1';
        return;
    }
    area.dataset.collapsed = '';
    area.innerHTML = '';

    const form = document.createElement('div');
    form.className = 'settings-form';
    form.innerHTML = '<div class="settings-form-title">⚡ 可视化脚本构建器 — 无需写代码，填表即可生成</div>';

    // 模式选择
    const modeRow = document.createElement('div');
    modeRow.className = 'settings-form-row';
    modeRow.innerHTML = '<label>模式</label>';
    const modeSelect = document.createElement('select');
    modeSelect.className = 'settings-form-input';
    modeSelect.style.flex = '1';
    modeSelect.innerHTML = '<option value="trigger">消息触发 → 执行命令</option>'
        + '<option value="periodic">定时检查属性 → 条件执行</option>';
    modeRow.appendChild(modeSelect);
    form.appendChild(modeRow);

    // 动态表单区域
    const dynamicArea = document.createElement('div');
    dynamicArea.id = 'vbDynamicArea';
    form.appendChild(dynamicArea);

    // 名称
    const nameRow = document.createElement('div');
    nameRow.className = 'settings-form-row';
    nameRow.innerHTML = '<label>脚本名</label>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'settings-form-input';
    nameInput.placeholder = '自动生成，可修改';
    nameRow.appendChild(nameInput);
    form.appendChild(nameRow);

    // 预览区域
    const previewArea = document.createElement('div');
    previewArea.id = 'vbPreview';
    previewArea.style.display = 'none';
    form.appendChild(previewArea);

    // 按钮行
    const btnRow = document.createElement('div');
    btnRow.className = 'settings-form-buttons';

    const previewBtn = document.createElement('button');
    previewBtn.className = 'settings-action-btn';
    previewBtn.textContent = '预览代码';
    previewBtn.addEventListener('click', () => {
        const code = this._vbGenerateCode(modeSelect, dynamicArea);
        if (code === null) return;
        const preview = document.getElementById('vbPreview');
        if (preview) {
            preview.style.display = 'block';
            preview.innerHTML = '<div class="settings-form-title">生成的代码</div>'
                + '<pre class="api-example" style="margin:0">' + this._escHtml(code) + '</pre>';
        }
    });
    btnRow.appendChild(previewBtn);

    const createBtn = document.createElement('button');
    createBtn.className = 'settings-action-btn';
    createBtn.textContent = '创建脚本';
    createBtn.addEventListener('click', () => {
        const code = this._vbGenerateCode(modeSelect, dynamicArea);
        if (code === null) return;
        const name = nameInput.value.trim() || (modeSelect.value === 'trigger' ? '消息触发脚本' : '定时检查脚本');
        const desc = modeSelect.value === 'trigger'
            ? '当消息匹配时自动执行命令'
            : '定时检查属性并条件执行命令';
        this.addScript(name, desc, code);
        area.innerHTML = '';
        area.dataset.collapsed = '1';
        this._renderScriptList();
    });
    btnRow.appendChild(createBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'settings-action-btn';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
        area.innerHTML = '';
        area.dataset.collapsed = '1';
    });
    btnRow.appendChild(cancelBtn);

    form.appendChild(btnRow);
    area.appendChild(form);

    // 模式切换时更新动态表单
    const renderDynamic = () => {
        dynamicArea.innerHTML = '';
        if (modeSelect.value === 'trigger') {
            this._vbRenderTriggerForm(dynamicArea);
        } else {
            this._vbRenderPeriodicForm(dynamicArea);
        }
    };
    modeSelect.addEventListener('change', renderDynamic);
    renderDynamic();
};

// 可视化构建器：消息触发表单
AdvancedMUDClient.prototype._vbRenderTriggerForm = function (container) {
    // 触发文本
    const textRow = document.createElement('div');
    textRow.className = 'settings-form-row';
    textRow.innerHTML = '<label>触发文本</label>';
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'settings-form-input';
    textInput.placeholder = '如：你盘膝坐下';
    textInput.id = 'vbTriggerText';
    textRow.appendChild(textInput);
    container.appendChild(textRow);

    // 匹配方式
    const matchRow = document.createElement('div');
    matchRow.className = 'settings-form-row';
    matchRow.innerHTML = '<label>匹配</label>';
    const matchSelect = document.createElement('select');
    matchSelect.className = 'settings-form-input';
    matchSelect.style.flex = '1';
    matchSelect.innerHTML = '<option value="contains">包含文本</option><option value="regex">正则表达式</option>';
    matchSelect.id = 'vbTriggerMatch';
    matchRow.appendChild(matchSelect);
    container.appendChild(matchRow);

    // 执行命令
    const cmdRow = document.createElement('div');
    cmdRow.className = 'settings-form-row';
    cmdRow.innerHTML = '<label>执行命令</label>';
    const cmdInput = document.createElement('input');
    cmdInput.type = 'text';
    cmdInput.className = 'settings-form-input';
    cmdInput.placeholder = '如：meditation';
    cmdInput.id = 'vbTriggerCmd';
    cmdRow.appendChild(cmdInput);
    container.appendChild(cmdRow);

    // 冷却时间
    const cdRow = document.createElement('div');
    cdRow.className = 'settings-form-row';
    cdRow.innerHTML = '<label>冷却(秒)</label>';
    const cdInput = document.createElement('input');
    cdInput.type = 'number';
    cdInput.className = 'settings-form-input';
    cdInput.value = '3';
    cdInput.min = '0';
    cdInput.max = '60';
    cdInput.style.flex = '1';
    cdInput.id = 'vbTriggerCd';
    cdRow.appendChild(cdInput);
    container.appendChild(cdRow);
};

// 可视化构建器：定时检查表单
AdvancedMUDClient.prototype._vbRenderPeriodicForm = function (container) {
    // 检查属性
    const attrRow = document.createElement('div');
    attrRow.className = 'settings-form-row';
    attrRow.innerHTML = '<label>属性</label>';
    const attrSelect = document.createElement('select');
    attrSelect.className = 'settings-form-input';
    attrSelect.style.flex = '1';
    attrSelect.innerHTML = '<option value="hp">气血 (hp)</option><option value="mp">内力 (mp)</option><option value="sp">精力 (sp)</option>';
    attrSelect.id = 'vbPeriodicAttr';
    attrRow.appendChild(attrSelect);
    container.appendChild(attrRow);

    // 条件
    const condRow = document.createElement('div');
    condRow.className = 'settings-form-row';
    condRow.innerHTML = '<label>条件</label>';
    const condSelect = document.createElement('select');
    condSelect.className = 'settings-form-input';
    condSelect.style.flex = '1';
    condSelect.innerHTML = '<option value="below">低于</option><option value="above">高于</option>';
    condSelect.id = 'vbPeriodicCond';
    condRow.appendChild(condSelect);
    container.appendChild(condRow);

    // 阈值
    const thRow = document.createElement('div');
    thRow.className = 'settings-form-row';
    thRow.innerHTML = '<label>阈值(%)</label>';
    const thInput = document.createElement('input');
    thInput.type = 'number';
    thInput.className = 'settings-form-input';
    thInput.value = '50';
    thInput.min = '1';
    thInput.max = '100';
    thInput.style.flex = '1';
    thInput.id = 'vbPeriodicThreshold';
    thRow.appendChild(thInput);
    container.appendChild(thRow);

    // 执行命令
    const cmdRow = document.createElement('div');
    cmdRow.className = 'settings-form-row';
    cmdRow.innerHTML = '<label>执行命令</label>';
    const cmdInput = document.createElement('input');
    cmdInput.type = 'text';
    cmdInput.className = 'settings-form-input';
    cmdInput.placeholder = '如：exert recover';
    cmdInput.id = 'vbPeriodicCmd';
    cmdRow.appendChild(cmdInput);
    container.appendChild(cmdRow);

    // 检查间隔
    const intRow = document.createElement('div');
    intRow.className = 'settings-form-row';
    intRow.innerHTML = '<label>间隔(秒)</label>';
    const intInput = document.createElement('input');
    intInput.type = 'number';
    intInput.className = 'settings-form-input';
    intInput.value = '5';
    intInput.min = '1';
    intInput.max = '60';
    intInput.style.flex = '1';
    intInput.id = 'vbPeriodicInterval';
    intRow.appendChild(intInput);
    container.appendChild(intRow);
};

// 可视化构建器：根据表单生成代码
AdvancedMUDClient.prototype._vbGenerateCode = function (modeSelect, dynamicArea) {
    if (modeSelect.value === 'trigger') {
        const text = (document.getElementById('vbTriggerText') || {}).value || '';
        const match = (document.getElementById('vbTriggerMatch') || {}).value || 'contains';
        const cmd = (document.getElementById('vbTriggerCmd') || {}).value || '';
        const cd = parseInt((document.getElementById('vbTriggerCd') || {}).value || '3', 10);

        if (!text || !cmd) {
            alert('请填写触发文本和执行命令');
            return null;
        }

        const pattern = match === 'regex' ? text : text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cdMs = cd * 1000;

        if (cdMs > 0) {
            return 'let _last = 0;\n'
                + 'onMessage(/' + pattern + '/, () => {\n'
                + '    const now = Date.now();\n'
                + '    if (now - _last < ' + cdMs + ') return;\n'
                + '    _last = now;\n'
                + '    sendCommand("' + cmd.replace(/"/g, '\\"') + '");\n'
                + '});';
        } else {
            return 'onMessage(/' + pattern + '/, () => {\n'
                + '    sendCommand("' + cmd.replace(/"/g, '\\"') + '");\n'
                + '});';
        }
    } else {
        const attr = (document.getElementById('vbPeriodicAttr') || {}).value || 'hp';
        const cond = (document.getElementById('vbPeriodicCond') || {}).value || 'below';
        const threshold = parseInt((document.getElementById('vbPeriodicThreshold') || {}).value || '50', 10);
        const cmd = (document.getElementById('vbPeriodicCmd') || {}).value || '';
        const interval = parseInt((document.getElementById('vbPeriodicInterval') || {}).value || '5', 10);

        if (!cmd) {
            alert('请填写执行命令');
            return null;
        }

        const ratio = (threshold / 100).toFixed(2);
        const op = cond === 'below' ? '<' : '>';
        const condDesc = cond === 'below' ? '低于' : '高于';

        return 'registerTimer(' + (interval * 1000) + ', () => {\n'
            + '    const v = getVitals();\n'
            + '    if (v.' + attr + ' && v.max_' + attr + ' && v.' + attr + ' ' + op + ' v.max_' + attr + ' * ' + ratio + ') {\n'
            + '        sendCommand("' + cmd.replace(/"/g, '\\"') + '");\n'
            + '        log("' + attr + ' ' + condDesc + ' ' + threshold + '%，自动执行");\n'
            + '    }\n'
            + '});';
    }
};
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

// 终端可点击链接委托：look/l 出口（点击移动）+ 文档内 help 交叉引用（点击查阅）+ 房间物品/NPC（点击 look）
AdvancedMUDClient.prototype.setupTerminalExits = function () {
    if (!this.terminal) return;
    this.terminal.addEventListener('click', (e) => {
        const link = e.target.closest('.exit-link, .help-link, .inv-link');
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
        // 分发给脚本引擎的 onGMCP 回调
        if (this.scriptEngine) {
            this.scriptEngine.feedGMCP(data.module, data.data);
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
        // 登录完成后延迟请求房间信息，确保小地图立即显示当前位置
        // 服务端 init_gmcp() 的 call_out 在 login 流程中触发，此时玩家尚未移入房间，
        // send_room_info 因 environment() 为空而跳过；此处补发一次请求作为兜底
        setTimeout(() => {
            if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendGMCP('Room.Info.Get', {});
            }
        }, 2000);
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
    // 关键词高亮渲染
    html = this._applyHighlights(html);
    // look/l 输出的“明显出口”渲染成可点击链接（点击移动）
    if (/这里明显的出口是|这里唯一的出口是/.test(message)) {
        html = this.linkifyRoomExits(html);
    }
    // look 输出中的房间物品/NPC 渲染成可点击链接（点击 look）
    if (/这里明显的出口是|这里唯一的出口是|这里没有任何明显的出路/.test(message)) {
        html = this.linkifyRoomInventory(html);
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
        this.appendMessage('※ 速走已暂停（检测到敌人）', 'system');
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
            this.appendMessage('» [' + trigger.name + '] → ' + trigger.command, 'system');
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

// 将 look 输出中的房间物品/NPC 行渲染为可点击链接（点击 look <id>）
// 仅前缀（2空格 + quest标记单字符ANSI span）不链接，name(id) 整体为链接
AdvancedMUDClient.prototype.linkifyRoomInventory = function (html) {
    // 前缀：2 空格 + 可选的单字符 ANSI span（如 quest 标记 ！）
    // name+id：剩余所有内容直到行尾的 (ascii_id)
    return html.replace(
        /^(  (<[^>]*>[^<\u4e00-\u9fff]<\/[^>]*>)?)(.+?)\((([a-z_][a-z_ ]*)\))$/gm,
        function (match, prefix, ansiSpan, namePart, fullIdPart, id) {
            return '<span>' + prefix + '</span><a class="inv-link" data-cmd="look ' + id + '">' + namePart + '(' + id + ')</a>';
        }
    );
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
    const dirShort = (d) => (typeof DIR_SHORT !== 'undefined' ? DIR_SHORT[d] : d) || d;

    // 计算从当前位置到各房间的距离（单次 BFS）
    let distMap = new Map();
    if (typeof mapper !== 'undefined' && mapper.currentHash) {
        distMap = pathfinder.calcDistances(mapper.currentHash);
    }

    // 有距离信息时按距离排序（不可达排末尾）
    if (distMap.size > 0) {
        results.sort((a, b) => {
            const da = distMap.has(a.hash) ? distMap.get(a.hash) : Infinity;
            const db = distMap.has(b.hash) ? distMap.get(b.hash) : Infinity;
            return da - db;
        });
    }

    let html = '';
    const maxShow = Math.min(results.length, 20);
    for (let i = 0; i < maxShow; i++) {
        const r = results[i];
        const exitLabel = (r.exits && r.exits.length > 0)
            ? r.exits.map(dirShort).join(' ')
            : '无出口';
        const dist = distMap.has(r.hash) ? distMap.get(r.hash) : -1;
        const distLabel = dist >= 0 ? dist + '步' : '不可达';
        const distColor = dist === 0 ? '#4a4' : dist > 0 ? '#888' : '#a66';
        html += '<div class="message system">'
            + '<a class="exit-link" data-cmd="gtr ' + esc(r.hash) + '">'
            + esc(r.name) + '</a>'
            + ' <span style="color:#666">[' + esc(r.area) + ']</span>'
            + ' <span style="color:#888">出口: ' + esc(exitLabel) + '</span>'
            + ' <span style="color:' + distColor + '">' + esc(distLabel) + '</span>'
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
