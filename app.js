/**
 * 个人工作日志管理系统 - 主程序
 * 纯前端离线应用，使用 IndexedDB 进行数据持久化
 */

// ==================== IndexedDB 数据库模块 ====================

/**
 * 数据库配置
 */
const DB_CONFIG = {
    name: 'WorkLogDB',
    version: 1,
    storeName: 'logs'
};

/**
 * 数据库管理类
 * 封装 IndexedDB 的所有操作
 */
class Database {
    constructor() {
        this.db = null;
    }

    /**
     * 初始化数据库
     * @returns {Promise<void>}
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(DB_CONFIG.storeName)) {
                    // 创建对象存储，以日期为 key
                    const store = db.createObjectStore(DB_CONFIG.storeName, { keyPath: 'date' });
                    // 创建索引
                    store.createIndex('dateIndex', 'date', { unique: true });
                }
            };
        });
    }

    /**
     * 保存日志
     * @param {Object} log - 日志对象
     * @returns {Promise<void>}
     */
    async saveLog(log) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([DB_CONFIG.storeName], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.storeName);
            const request = store.put(log);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取指定日期的日志
     * @param {string} date - 日期字符串 (YYYY-MM-DD)
     * @returns {Promise<Object|null>}
     */
    async getLog(date) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([DB_CONFIG.storeName], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.storeName);
            const request = store.get(date);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取所有日志（按日期倒序）
     * @returns {Promise<Array>}
     */
    async getAllLogs() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([DB_CONFIG.storeName], 'readonly');
            const store = transaction.objectStore(DB_CONFIG.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                const logs = request.result;
                // 按日期倒序排列
                logs.sort((a, b) => new Date(b.date) - new Date(a.date));
                resolve(logs);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除指定日期的日志
     * @param {string} date - 日期字符串
     * @returns {Promise<void>}
     */
    async deleteLog(date) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([DB_CONFIG.storeName], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.storeName);
            const request = store.delete(date);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 清空所有日志
     * @returns {Promise<void>}
     */
    async clearAllLogs() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([DB_CONFIG.storeName], 'readwrite');
            const store = transaction.objectStore(DB_CONFIG.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

// ==================== UI 工具类 ====================

/**
 * 消息提示工具
 */
class Toast {
    static show(message, type = 'info', duration = 3000) {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        
        toastMessage.textContent = message;
        toast.className = `toast ${type}`;
        
        // 显示
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        
        // 自动隐藏
        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }
}

/**
 * 确认对话框工具
 */
class ConfirmDialog {
    static show(title, message, onConfirm, confirmText = '确认', isDanger = true) {
        const dialog = document.getElementById('confirm-dialog');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');
        
        titleEl.textContent = title;
        messageEl.textContent = message;
        okBtn.textContent = confirmText;
        okBtn.className = `btn ${isDanger ? 'btn-danger' : 'btn-primary'}`;
        
        // 显示对话框
        dialog.classList.add('show');
        
        // 确认按钮事件
        const handleConfirm = () => {
            this.hide();
            onConfirm();
            cleanup();
        };
        
        // 取消按钮事件
        const handleCancel = () => {
            this.hide();
            cleanup();
        };
        
        // 清理事件监听
        const cleanup = () => {
            okBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            dialog.removeEventListener('click', handleBackdrop);
        };
        
        // 点击背景关闭
        const handleBackdrop = (e) => {
            if (e.target === dialog) {
                handleCancel();
            }
        };
        
        okBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        dialog.addEventListener('click', handleBackdrop);
    }
    
    static hide() {
        const dialog = document.getElementById('confirm-dialog');
        dialog.classList.remove('show');
    }
}

// ==================== 主应用类 ====================

class WorkLogApp {
    constructor() {
        this.db = new Database();
        this.currentDate = this.getToday();
        this.tasks = [];
        this.allLogs = [];
        this.searchKeyword = '';
        
        this.init();
    }
    
    /**
     * 初始化应用
     */
    async init() {
        try {
            // 初始化数据库
            await this.db.init();
            
            // 绑定事件
            this.bindEvents();
            
            // 设置默认日期
            document.getElementById('date-picker').value = this.currentDate;
            
            // 加载当前日期日志
            await this.loadLog(this.currentDate);
            
            // 加载历史日志
            await this.loadHistory();
            
            Toast.show('系统初始化完成', 'success');
        } catch (error) {
            console.error('初始化失败:', error);
            Toast.show('系统初始化失败，请刷新页面重试', 'error');
        }
    }
    
    /**
     * 获取今天日期字符串
     */
    getToday() {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }
    
    /**
     * 绑定所有事件
     */
    bindEvents() {
        // 日期选择
        document.getElementById('date-picker').addEventListener('change', (e) => {
            this.currentDate = e.target.value;
            this.loadLog(this.currentDate);
        });
        
        // 添加任务
        document.getElementById('add-task-btn').addEventListener('click', () => {
            this.addTask();
        });
        
        // 保存日志
        document.getElementById('save-btn').addEventListener('click', () => {
            this.saveLog();
        });
        
        // 重置清空
        document.getElementById('reset-btn').addEventListener('click', () => {
            this.confirmReset();
        });
        
        // 删除日志
        document.getElementById('delete-btn').addEventListener('click', () => {
            this.confirmDelete();
        });
        
        // 搜索
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.searchKeyword = e.target.value.trim();
            this.renderHistory();
        });
        
        // 清除搜索
        document.getElementById('clear-search-btn').addEventListener('click', () => {
            document.getElementById('search-input').value = '';
            this.searchKeyword = '';
            this.renderHistory();
        });
        
        // 导出
        document.getElementById('export-btn').addEventListener('click', () => {
            this.exportToMarkdown();
        });
    }
    
    /**
     * 加载指定日期的日志
     */
    async loadLog(date) {
        try {
            const log = await this.db.getLog(date);
            
            if (log) {
                // 加载已有日志
                document.getElementById('work-content').value = log.content || '';
                this.tasks = log.tasks || [];
            } else {
                // 新建空白日志
                document.getElementById('work-content').value = '';
                this.tasks = [];
            }
            
            this.renderTasks();
        } catch (error) {
            console.error('加载日志失败:', error);
            Toast.show('加载日志失败', 'error');
        }
    }
    
    /**
     * 渲染任务列表
     */
    renderTasks() {
        const tbody = document.getElementById('tasks-tbody');
        const emptyTasks = document.getElementById('empty-tasks');
        
        if (this.tasks.length === 0) {
            tbody.innerHTML = '';
            emptyTasks.classList.remove('hidden');
            return;
        }
        
        emptyTasks.classList.add('hidden');
        
        tbody.innerHTML = this.tasks.map((task, index) => `
            <tr class="${task.completed ? 'task-completed' : ''}" data-index="${index}">
                <td class="col-status">
                    <input 
                        type="checkbox" 
                        class="task-checkbox" 
                        ${task.completed ? 'checked' : ''}
                        onchange="app.toggleTask(${index})"
                    >
                </td>
                <td class="col-content">
                    <input 
                        type="text" 
                        class="task-input" 
                        value="${this.escapeHtml(task.content)}"
                        placeholder="输入任务内容..."
                        onchange="app.updateTaskContent(${index}, this.value)"
                    >
                </td>
                <td class="col-action">
                    <button class="delete-task-btn" onclick="app.deleteTask(${index})" title="删除任务">
                        ×
                    </button>
                </td>
            </tr>
        `).join('');
    }
    
    /**
     * 添加新任务
     */
    addTask() {
        this.tasks.push({
            content: '',
            completed: false
        });
        this.renderTasks();
        
        // 聚焦到新任务输入框
        setTimeout(() => {
            const inputs = document.querySelectorAll('.task-input');
            if (inputs.length > 0) {
                inputs[inputs.length - 1].focus();
            }
        }, 0);
    }
    
    /**
     * 切换任务状态
     */
    toggleTask(index) {
        if (this.tasks[index]) {
            this.tasks[index].completed = !this.tasks[index].completed;
            this.renderTasks();
        }
    }
    
    /**
     * 更新任务内容
     */
    updateTaskContent(index, content) {
        if (this.tasks[index]) {
            this.tasks[index].content = content.trim();
        }
    }
    
    /**
     * 删除任务
     */
    deleteTask(index) {
        this.tasks.splice(index, 1);
        this.renderTasks();
        Toast.show('任务已删除', 'info');
    }
    
    /**
     * 保存日志
     */
    async saveLog() {
        try {
            const content = document.getElementById('work-content').value.trim();
            
            // 过滤掉空任务
            const validTasks = this.tasks.filter(task => task.content.trim() !== '');
            
            const log = {
                date: this.currentDate,
                content: content,
                tasks: validTasks,
                updatedAt: new Date().toISOString()
            };
            
            await this.db.saveLog(log);
            
            // 更新任务列表（移除空任务）
            this.tasks = validTasks;
            this.renderTasks();
            
            // 刷新历史列表
            await this.loadHistory();
            
            Toast.show('日志保存成功', 'success');
        } catch (error) {
            console.error('保存日志失败:', error);
            Toast.show('保存失败，请重试', 'error');
        }
    }
    
    /**
     * 确认重置
     */
    confirmReset() {
        ConfirmDialog.show(
            '确认重置',
            '确定要清空当前日期的所有内容吗？此操作不可恢复。',
            () => {
                this.resetLog();
            },
            '确认清空',
            true
        );
    }
    
    /**
     * 重置当前日志
     */
    resetLog() {
        document.getElementById('work-content').value = '';
        this.tasks = [];
        this.renderTasks();
        Toast.show('内容已清空', 'warning');
    }
    
    /**
     * 确认删除
     */
    confirmDelete() {
        ConfirmDialog.show(
            '确认删除',
            `确定要删除 ${this.currentDate} 的整条日志记录吗？此操作不可恢复。`,
            () => {
                this.deleteLog();
            },
            '确认删除',
            true
        );
    }
    
    /**
     * 删除当前日期日志
     */
    async deleteLog() {
        try {
            await this.db.deleteLog(this.currentDate);
            
            // 清空当前编辑区
            document.getElementById('work-content').value = '';
            this.tasks = [];
            this.renderTasks();
            
            // 刷新历史列表
            await this.loadHistory();
            
            Toast.show('日志已删除', 'success');
        } catch (error) {
            console.error('删除日志失败:', error);
            Toast.show('删除失败，请重试', 'error');
        }
    }
    
    /**
     * 加载历史日志
     */
    async loadHistory() {
        try {
            this.allLogs = await this.db.getAllLogs();
            this.renderHistory();
        } catch (error) {
            console.error('加载历史日志失败:', error);
            Toast.show('加载历史日志失败', 'error');
        }
    }
    
    /**
     * 渲染历史日志列表
     */
    renderHistory() {
        const historyList = document.getElementById('history-list');
        const emptyHistory = document.getElementById('empty-history');
        
        // 过滤日志
        let logs = this.allLogs;
        
        // 搜索过滤
        if (this.searchKeyword) {
            const keyword = this.searchKeyword.toLowerCase();
            logs = logs.filter(log => {
                const contentMatch = log.content && log.content.toLowerCase().includes(keyword);
                const taskMatch = log.tasks && log.tasks.some(task => 
                    task.content.toLowerCase().includes(keyword)
                );
                return contentMatch || taskMatch;
            });
        }
        
        if (logs.length === 0) {
            historyList.innerHTML = '';
            emptyHistory.classList.remove('hidden');
            return;
        }
        
        emptyHistory.classList.add('hidden');
        
        historyList.innerHTML = logs.map(log => this.createLogCard(log)).join('');
        
        // 绑定卡片展开/收起事件
        document.querySelectorAll('.log-card-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const card = e.currentTarget.closest('.log-card');
                card.classList.toggle('expanded');
            });
        });
    }
    
    /**
     * 创建日志卡片 HTML
     */
    createLogCard(log) {
        const date = new Date(log.date);
        const dateStr = date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
        
        // 高亮搜索关键词
        let content = log.content || '';
        let tasks = log.tasks || [];
        
        if (this.searchKeyword) {
            content = this.highlightText(content, this.searchKeyword);
            tasks = tasks.map(task => ({
                ...task,
                content: this.highlightText(task.content, this.searchKeyword)
            }));
        }
        
        // 任务列表 HTML
        let tasksHtml = '';
        if (tasks.length > 0) {
            tasksHtml = `
                <ul class="log-tasks-list">
                    ${tasks.map(task => `
                        <li class="log-task-item ${task.completed ? 'completed' : ''}">
                            <input type="checkbox" class="log-task-checkbox" ${task.completed ? 'checked' : ''}>
                            <span class="log-task-text">${task.content}</span>
                        </li>
                    `).join('')}
                </ul>
            `;
        } else {
            tasksHtml = '<p class="log-tasks-empty">暂无任务记录</p>';
        }
        
        return `
            <div class="log-card" data-date="${log.date}">
                <div class="log-card-header">
                    <span class="log-card-date">${dateStr}</span>
                    <span class="log-card-toggle">▼</span>
                </div>
                <div class="log-card-content">
                    <div class="log-card-body">
                        <div class="log-section">
                            <h4 class="log-section-title">📝 工作记录</h4>
                            <div class="log-content-text">${content}</div>
                        </div>
                        <div class="log-section">
                            <h4 class="log-section-title">✅ 任务清单</h4>
                            ${tasksHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * 高亮文本
     */
    highlightText(text, keyword) {
        if (!keyword || !text) return text;
        
        const escapedKeyword = this.escapeRegExp(keyword);
        const regex = new RegExp(`(${escapedKeyword})`, 'gi');
        return text.replace(regex, '<span class="highlight">$1</span>');
    }
    
    /**
     * 导出为 Markdown
     */
    async exportToMarkdown() {
        try {
            const logs = await this.db.getAllLogs();
            
            if (logs.length === 0) {
                Toast.show('暂无日志可导出', 'warning');
                return;
            }
            
            let markdown = '# 📋 工作日志归档\n\n';
            markdown += `> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n`;
            markdown += `---\n\n`;
            
            logs.forEach(log => {
                const date = new Date(log.date);
                const dateStr = date.toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long'
                });
                
                markdown += `## 📅 ${dateStr}\n\n`;
                
                // 工作记录
                markdown += `### 📝 工作记录\n\n`;
                if (log.content) {
                    markdown += `${log.content}\n\n`;
                } else {
                    markdown += `（无工作记录内容）\n\n`;
                }
                
                // 任务清单
                markdown += `### ✅ 任务清单\n\n`;
                if (log.tasks && log.tasks.length > 0) {
                    log.tasks.forEach(task => {
                        const taskText = task.completed ? `~~${task.content}~~` : task.content;
                        const status = task.completed ? '[x]' : '[ ]';
                        markdown += `- ${status} ${taskText}\n`;
                    });
                    markdown += '\n';
                } else {
                    markdown += `（无任务记录）\n\n`;
                }
                
                markdown += `---\n\n`;
            });
            
            // 创建并下载文件
            const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `工作日志_${new Date().toISOString().split('T')[0]}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            Toast.show(`成功导出 ${logs.length} 条日志`, 'success');
        } catch (error) {
            console.error('导出失败:', error);
            Toast.show('导出失败，请重试', 'error');
        }
    }
    
    /**
     * HTML 转义
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * 正则表达式转义
     */
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// ==================== 初始化应用 ====================

// 全局应用实例
let app;

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    app = new WorkLogApp();
});
