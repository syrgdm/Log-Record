class LogDB {
    constructor() {
        this.dbName = 'LogRecordDB';
        this.storeName = 'logs';
        this.dbVersion = 1;
        this.db = null;
    }

    /**
     * 初始化 IndexedDB 数据库
     */
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'date' });
                    store.createIndex('date', 'date', { unique: true });
                }
            };
        });
    }

    /**
     * 保存或更新日志数据
     * @param {Object} logData - 日志数据对象
     */
    save(logData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(logData);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 根据日期获取日志
     * @param {string} date - 日期字符串 YYYY-MM-DD
     */
    getByDate(date) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(date);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取所有日志
     */
    getAll() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除指定日期的日志
     * @param {string} date - 日期字符串 YYYY-MM-DD
     */
    delete(date) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(date);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

class LogManager {
    constructor() {
        this.db = new LogDB();
        this.currentDate = this.formatDate(new Date());
        this.currentTasks = [];
        this.searchKeyword = '';
        this.init();
    }

    /**
     * 初始化应用
     */
    async init() {
        try {
            await this.db.init();
            this.initDateSelector();
            this.bindEvents();
            await this.loadLogForDate(this.currentDate);
            await this.renderHistoryLogs();
        } catch (error) {
            this.showToast('数据库初始化失败', 'error');
            console.error(error);
        }
    }

    /**
     * 格式化日期为 YYYY-MM-DD
     */
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 初始化日期选择器默认值
     */
    initDateSelector() {
        const dateSelector = document.getElementById('dateSelector');
        dateSelector.value = this.currentDate;
    }

    /**
     * 绑定所有事件
     */
    bindEvents() {
        document.getElementById('dateSelector').addEventListener('change', (e) => {
            this.currentDate = e.target.value;
            this.loadLogForDate(this.currentDate);
        });

        document.getElementById('saveBtn').addEventListener('click', () => this.saveLog());
        document.getElementById('resetBtn').addEventListener('click', () => this.confirmReset());
        document.getElementById('deleteBtn').addEventListener('click', () => this.confirmDelete());
        document.getElementById('addTaskBtn').addEventListener('click', () => this.addTask());
        document.getElementById('searchBtn').addEventListener('click', () => this.performSearch());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });
        document.getElementById('exportBtn').addEventListener('click', () => this.exportMarkdown());

        document.getElementById('modalCancel').addEventListener('click', () => this.closeModal());
        document.getElementById('modalConfirm').addEventListener('click', () => this.executeModalAction());
    }

    /**
     * 加载指定日期的日志
     */
    async loadLogForDate(date) {
        try {
            const log = await this.db.getByDate(date);
            if (log) {
                document.getElementById('workContent').value = log.content || '';
                this.currentTasks = log.tasks || [];
            } else {
                document.getElementById('workContent').value = '';
                this.currentTasks = [];
            }
            this.renderTasks();
        } catch (error) {
            this.showToast('加载日志失败', 'error');
        }
    }

    /**
     * 保存当前日志
     */
    async saveLog() {
        try {
            const content = document.getElementById('workContent').value.trim();
            const logData = {
                date: this.currentDate,
                content: content,
                tasks: this.currentTasks,
                updatedAt: new Date().toISOString()
            };

            await this.db.save(logData);
            this.showToast('日志保存成功', 'success');
            await this.renderHistoryLogs();
        } catch (error) {
            this.showToast('保存失败，请重试', 'error');
        }
    }

    /**
     * 确认重置当前编辑
     */
    confirmReset() {
        this.showModal('确认重置', '确定要清空当前编辑的所有内容吗？此操作不可撤销。', () => {
            document.getElementById('workContent').value = '';
            this.currentTasks = [];
            this.renderTasks();
            this.showToast('已清空内容', 'success');
        });
    }

    /**
     * 确认删除当日日志
     */
    confirmDelete() {
        this.showModal('确认删除', `确定要删除 ${this.currentDate} 的日志吗？此操作不可撤销。`, async () => {
            try {
                await this.db.delete(this.currentDate);
                document.getElementById('workContent').value = '';
                this.currentTasks = [];
                this.renderTasks();
                await this.renderHistoryLogs();
                this.showToast('日志已删除', 'success');
            } catch (error) {
                this.showToast('删除失败，请重试', 'error');
            }
        });
    }

    /**
     * 添加新任务
     */
    addTask() {
        this.currentTasks.push({
            id: Date.now(),
            content: '',
            completed: false
        });
        this.renderTasks();
    }

    /**
     * 删除任务
     */
    deleteTask(taskId) {
        this.currentTasks = this.currentTasks.filter(task => task.id !== taskId);
        this.renderTasks();
    }

    /**
     * 切换任务完成状态
     */
    toggleTaskStatus(taskId) {
        const task = this.currentTasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            this.renderTasks();
        }
    }

    /**
     * 更新任务内容
     */
    updateTaskContent(taskId, content) {
        const task = this.currentTasks.find(t => t.id === taskId);
        if (task) {
            task.content = content;
        }
    }

    /**
     * 渲染任务列表
     */
    renderTasks() {
        const container = document.getElementById('tasksContainer');
        
        if (this.currentTasks.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无任务，点击上方按钮添加</div>';
            return;
        }

        container.innerHTML = this.currentTasks.map(task => `
            <div class="task-row ${task.completed ? 'completed' : ''}">
                <input type="checkbox" 
                       class="task-checkbox" 
                       ${task.completed ? 'checked' : ''}
                       onchange="logManager.toggleTaskStatus(${task.id})">
                <input type="text" 
                       class="task-content" 
                       value="${this.escapeHtml(task.content)}"
                       placeholder="输入任务内容..."
                       oninput="logManager.updateTaskContent(${task.id}, this.value)">
                <button class="btn btn-delete-task" onclick="logManager.deleteTask(${task.id})">删除</button>
            </div>
        `).join('');
    }

    /**
     * 渲染历史日志列表
     */
    async renderHistoryLogs() {
        const container = document.getElementById('historyLogs');
        const logs = await this.db.getAll();
        
        document.getElementById('logCount').textContent = `共 ${logs.length} 条`;

        const sortedLogs = logs.sort((a, b) => new Date(b.date) - new Date(a.date));

        const filteredLogs = this.searchKeyword 
            ? sortedLogs.filter(log => this.matchKeyword(log))
            : sortedLogs;

        if (filteredLogs.length === 0) {
            container.innerHTML = logs.length === 0 
                ? '<div class="empty-state"><div class="empty-state-icon">📝</div>暂无日志记录，开始记录您的第一条工作日志吧</div>'
                : '<div class="no-search-results">未找到匹配的日志</div>';
            return;
        }

        container.innerHTML = filteredLogs.map(log => this.createLogCardHtml(log)).join('');
    }

    /**
     * 创建日志卡片HTML
     */
    createLogCardHtml(log) {
        const tasksHtml = log.tasks && log.tasks.length > 0
            ? log.tasks.map(task => `
                <div class="log-task-item ${task.completed ? 'completed' : ''}">
                    ${this.highlightText(task.content)}
                </div>
            `).join('')
            : '<div style="color: #868e96; font-size: 13px;">无任务记录</div>';

        return `
            <div class="log-card" data-date="${log.date}">
                <div class="log-card-header" onclick="logManager.toggleLogCard('${log.date}')">
                    <span class="log-date">${this.formatDisplayDate(log.date)}</span>
                    <span class="log-toggle">▼</span>
                </div>
                <div class="log-card-content">
                    <div class="log-content-inner">
                        <div class="log-section">
                            <div class="log-section-title">📋 工作记录</div>
                            <div class="log-work-content">
                                ${log.content ? this.highlightText(log.content) : '<span style="color: #868e96;">无工作记录</span>'}
                            </div>
                        </div>
                        <div class="log-section">
                            <div class="log-section-title">✅ 任务清单</div>
                            <div class="log-tasks-list">
                                ${tasksHtml}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 切换日志卡片展开/收起
     */
    toggleLogCard(date) {
        const card = document.querySelector(`.log-card[data-date="${date}"]`);
        if (card) {
            card.classList.toggle('expanded');
        }
    }

    /**
     * 执行搜索
     */
    performSearch() {
        this.searchKeyword = document.getElementById('searchInput').value.trim();
        this.renderHistoryLogs();
        if (this.searchKeyword) {
            this.showToast(`正在搜索: "${this.searchKeyword}"`, 'success');
        }
    }

    /**
     * 检查日志是否匹配关键词
     */
    matchKeyword(log) {
        if (!this.searchKeyword) return true;
        const keyword = this.searchKeyword.toLowerCase();
        const contentMatch = log.content && log.content.toLowerCase().includes(keyword);
        const tasksMatch = log.tasks && log.tasks.some(task => 
            task.content && task.content.toLowerCase().includes(keyword)
        );
        return contentMatch || tasksMatch;
    }

    /**
     * 高亮匹配的文本
     */
    highlightText(text) {
        if (!this.searchKeyword || !text) {
            return this.escapeHtml(text || '');
        }
        const regex = new RegExp(`(${this.escapeRegex(this.searchKeyword)})`, 'gi');
        return this.escapeHtml(text).replace(regex, '<span class="highlight">$1</span>');
    }

    /**
     * 导出所有日志为 Markdown
     */
    async exportMarkdown() {
        try {
            const logs = await this.db.getAll();
            
            if (logs.length === 0) {
                this.showToast('暂无日志可导出', 'warning');
                return;
            }

            const sortedLogs = logs.sort((a, b) => new Date(b.date) - new Date(a.date));

            let markdown = '# 个人工作日志汇总\n\n';
            markdown += `导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
            markdown += `---\n\n`;

            sortedLogs.forEach(log => {
                markdown += `## ${this.formatDisplayDate(log.date)}\n\n`;
                
                markdown += '### 工作记录\n\n';
                markdown += (log.content || '无工作记录') + '\n\n';
                
                markdown += '### 任务清单\n\n';
                if (log.tasks && log.tasks.length > 0) {
                    log.tasks.forEach(task => {
                        const checkbox = task.completed ? '- [x]' : '- [ ]';
                        const content = task.completed ? `~~${task.content || '未命名任务'}~~` : (task.content || '未命名任务');
                        markdown += `${checkbox} ${content}\n`;
                    });
                } else {
                    markdown += '无任务记录\n';
                }
                markdown += '\n---\n\n';
            });

            const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `工作日志_${this.formatDate(new Date())}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showToast('Markdown 导出成功', 'success');
        } catch (error) {
            this.showToast('导出失败，请重试', 'error');
        }
    }

    /**
     * 显示确认弹窗
     */
    showModal(title, message, callback) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalMessage').textContent = message;
        document.getElementById('confirmModal').classList.add('show');
        this._modalCallback = callback;
    }

    /**
     * 关闭弹窗
     */
    closeModal() {
        document.getElementById('confirmModal').classList.remove('show');
        this._modalCallback = null;
    }

    /**
     * 执行弹窗确认操作
     */
    executeModalAction() {
        if (this._modalCallback) {
            this._modalCallback();
        }
        this.closeModal();
    }

    /**
     * 显示消息提示
     */
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    /**
     * 格式化日期显示
     */
    formatDisplayDate(dateStr) {
        const date = new Date(dateStr);
        const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const weekDay = weekDays[date.getDay()];
        return `${dateStr} (${weekDay})`;
    }

    /**
     * HTML转义防止XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 转义正则特殊字符
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

const logManager = new LogManager();
