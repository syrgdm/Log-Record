/**
 * 个人工作日志管理系统
 * 纯前端离线应用，使用 IndexedDB 进行数据持久化存储
 */

(function() {
    'use strict';

    /* ========================================
       常量定义
       ======================================== */
    const DB_NAME = 'WorkLogDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'logs';

    /* ========================================
       DOM 元素引用
       ======================================== */
    const elements = {
        datePicker: document.getElementById('date-picker'),
        workRecord: document.getElementById('work-record'),
        taskInput: document.getElementById('task-input'),
        addTaskBtn: document.getElementById('add-task-btn'),
        taskTbody: document.getElementById('task-tbody'),
        emptyTaskTip: document.getElementById('empty-task-tip'),
        saveBtn: document.getElementById('save-btn'),
        resetBtn: document.getElementById('reset-btn'),
        deleteBtn: document.getElementById('delete-btn'),
        searchInput: document.getElementById('search-input'),
        searchBtn: document.getElementById('search-btn'),
        clearSearchBtn: document.getElementById('clear-search-btn'),
        exportBtn: document.getElementById('export-btn'),
        historyContainer: document.getElementById('history-container'),
        emptyHistoryTip: document.getElementById('empty-history-tip'),
        confirmModal: document.getElementById('confirm-modal'),
        modalTitle: document.getElementById('modal-title'),
        modalMessage: document.getElementById('modal-message'),
        modalConfirm: document.getElementById('modal-confirm'),
        modalCancel: document.getElementById('modal-cancel'),
        toast: document.getElementById('toast')
    };

    /* ========================================
       应用状态管理
       ======================================== */
    const state = {
        db: null,
        currentDate: formatDate(new Date()),
        tasks: [],
        taskIdCounter: 1,
        searchKeyword: ''
    };

    /* ========================================
       工具函数
       ======================================== */

    /**
     * 格式化日期为 YYYY-MM-DD 格式
     * @param {Date} date - 日期对象
     * @returns {string} 格式化后的日期字符串
     */
    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 格式化日期为中文显示格式
     * @param {string} dateStr - YYYY-MM-DD 格式的日期字符串
     * @returns {string} 中文格式日期
     */
    function formatDateChinese(dateStr) {
        const [year, month, day] = dateStr.split('-');
        return `${year}年${parseInt(month)}月${parseInt(day)}日`;
    }

    /**
     * 显示提示消息
     * @param {string} message - 提示消息内容
     * @param {string} type - 消息类型：success/error/warning
     */
    function showToast(message, type = 'success') {
        elements.toast.textContent = message;
        elements.toast.className = `toast ${type} show`;
        setTimeout(() => {
            elements.toast.classList.remove('show');
        }, 3000);
    }

    /**
     * 转义 HTML 特殊字符，防止 XSS 攻击
     * @param {string} str - 需要转义的字符串
     * @returns {string} 转义后的字符串
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * 高亮显示搜索关键词
     * @param {string} text - 原始文本
     * @param {string} keyword - 搜索关键词
     * @returns {string} 高亮后的 HTML 字符串
     */
    function highlightKeyword(text, keyword) {
        if (!keyword || !text) return escapeHtml(text);
        const escapedText = escapeHtml(text);
        const escapedKeyword = escapeHtml(keyword);
        const regex = new RegExp(`(${escapedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return escapedText.replace(regex, '<span class="highlight">$1</span>');
    }

    /* ========================================
       IndexedDB 数据库操作模块
       ======================================== */

    /**
     * 初始化 IndexedDB 数据库
     * @returns {Promise<IDBDatabase>} 数据库实例
     */
    function initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = function(event) {
                console.error('数据库打开失败:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = function(event) {
                const db = event.target.result;
                console.log('数据库连接成功');
                resolve(db);
            };

            request.onupgradeneeded = function(event) {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'date' });
                    store.createIndex('date', 'date', { unique: true });
                    console.log('数据表创建成功');
                }
            };
        });
    }

    /**
     * 保存日志数据到数据库
     * @param {Object} logData - 日志数据对象
     * @returns {Promise<void>}
     */
    function saveLog(logData) {
        return new Promise((resolve, reject) => {
            const transaction = state.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(logData);

            request.onsuccess = function() {
                resolve();
            };

            request.onerror = function(event) {
                console.error('保存日志失败:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * 获取指定日期的日志数据
     * @param {string} date - 日期字符串 YYYY-MM-DD
     * @returns {Promise<Object|null>} 日志数据对象或 null
     */
    function getLogByDate(date) {
        return new Promise((resolve, reject) => {
            const transaction = state.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(date);

            request.onsuccess = function(event) {
                resolve(event.target.result || null);
            };

            request.onerror = function(event) {
                console.error('获取日志失败:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * 获取所有日志数据，按日期倒序排列
     * @returns {Promise<Array>} 日志数据数组
     */
    function getAllLogs() {
        return new Promise((resolve, reject) => {
            const transaction = state.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = function(event) {
                const logs = event.target.result || [];
                logs.sort((a, b) => new Date(b.date) - new Date(a.date));
                resolve(logs);
            };

            request.onerror = function(event) {
                console.error('获取所有日志失败:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * 删除指定日期的日志数据
     * @param {string} date - 日期字符串 YYYY-MM-DD
     * @returns {Promise<void>}
     */
    function deleteLog(date) {
        return new Promise((resolve, reject) => {
            const transaction = state.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(date);

            request.onsuccess = function() {
                resolve();
            };

            request.onerror = function(event) {
                console.error('删除日志失败:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /* ========================================
       任务管理模块
       ======================================== */

    /**
     * 渲染任务列表
     */
    function renderTasks() {
        const tbody = elements.taskTbody;
        tbody.innerHTML = '';

        if (state.tasks.length === 0) {
            elements.emptyTaskTip.style.display = 'block';
            return;
        }

        elements.emptyTaskTip.style.display = 'none';

        state.tasks.forEach(task => {
            const tr = document.createElement('tr');
            tr.className = task.completed ? 'task-completed' : '';
            tr.dataset.taskId = task.id;

            const statusTd = document.createElement('td');
            statusTd.className = 'col-status';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = task.completed;
            checkbox.addEventListener('change', () => toggleTaskStatus(task.id));
            statusTd.appendChild(checkbox);

            const contentTd = document.createElement('td');
            contentTd.className = 'col-content';
            const contentInput = document.createElement('input');
            contentInput.type = 'text';
            contentInput.className = 'task-content-input';
            contentInput.value = task.content;
            contentInput.maxLength = 200;
            contentInput.addEventListener('change', (e) => updateTaskContent(task.id, e.target.value));
            contentInput.addEventListener('blur', (e) => updateTaskContent(task.id, e.target.value));
            contentTd.appendChild(contentInput);

            const actionTd = document.createElement('td');
            actionTd.className = 'col-action';
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-delete-task';
            deleteBtn.textContent = '删除';
            deleteBtn.addEventListener('click', () => deleteTask(task.id));
            actionTd.appendChild(deleteBtn);

            tr.appendChild(statusTd);
            tr.appendChild(contentTd);
            tr.appendChild(actionTd);
            tbody.appendChild(tr);
        });
    }

    /**
     * 添加新任务
     */
    function addTask() {
        const content = elements.taskInput.value.trim();
        if (!content) {
            showToast('请输入任务内容', 'warning');
            return;
        }

        const task = {
            id: state.taskIdCounter++,
            content: content,
            completed: false
        };

        state.tasks.push(task);
        elements.taskInput.value = '';
        renderTasks();
    }

    /**
     * 切换任务完成状态
     * @param {number} taskId - 任务 ID
     */
    function toggleTaskStatus(taskId) {
        const task = state.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            renderTasks();
        }
    }

    /**
     * 更新任务内容
     * @param {number} taskId - 任务 ID
     * @param {string} newContent - 新的任务内容
     */
    function updateTaskContent(taskId, newContent) {
        const task = state.tasks.find(t => t.id === taskId);
        if (task) {
            task.content = newContent.trim();
        }
    }

    /**
     * 删除指定任务
     * @param {number} taskId - 任务 ID
     */
    function deleteTask(taskId) {
        state.tasks = state.tasks.filter(t => t.id !== taskId);
        renderTasks();
    }

    /**
     * 清空所有任务
     */
    function clearTasks() {
        state.tasks = [];
        state.taskIdCounter = 1;
        renderTasks();
    }

    /* ========================================
       日志编辑模块
       ======================================== */

    /**
     * 加载指定日期的日志数据到编辑区
     * @param {string} date - 日期字符串
     */
    async function loadLogToEditor(date) {
        try {
            const log = await getLogByDate(date);

            if (log) {
                elements.workRecord.value = log.workRecord || '';
                state.tasks = log.tasks ? JSON.parse(JSON.stringify(log.tasks)) : [];
                state.taskIdCounter = state.tasks.length > 0
                    ? Math.max(...state.tasks.map(t => t.id)) + 1
                    : 1;
            } else {
                elements.workRecord.value = '';
                state.tasks = [];
                state.taskIdCounter = 1;
            }

            renderTasks();
        } catch (error) {
            console.error('加载日志失败:', error);
            showToast('加载日志失败', 'error');
        }
    }

    /**
     * 保存当前编辑的日志
     */
    async function saveCurrentLog() {
        const logData = {
            date: state.currentDate,
            workRecord: elements.workRecord.value,
            tasks: JSON.parse(JSON.stringify(state.tasks)),
            updatedAt: Date.now()
        };

        try {
            await saveLog(logData);
            showToast('日志保存成功', 'success');
            await renderHistoryLogs();
        } catch (error) {
            console.error('保存日志失败:', error);
            showToast('保存失败，请重试', 'error');
        }
    }

    /**
     * 重置当前编辑区
     */
    function resetEditor() {
        showConfirmModal(
            '确认重置',
            '确定要清空当前日期的所有内容吗？此操作不可撤销。',
            async () => {
                elements.workRecord.value = '';
                clearTasks();
                showToast('已重置编辑区', 'success');
            }
        );
    }

    /**
     * 删除当前日期的日志
     */
    function deleteCurrentLog() {
        showConfirmModal(
            '确认删除',
            '确定要删除当前日期的整条日志吗？此操作不可撤销。',
            async () => {
                try {
                    await deleteLog(state.currentDate);
                    elements.workRecord.value = '';
                    clearTasks();
                    showToast('日志已删除', 'success');
                    await renderHistoryLogs();
                } catch (error) {
                    console.error('删除日志失败:', error);
                    showToast('删除失败，请重试', 'error');
                }
            }
        );
    }

    /* ========================================
       历史日志展示模块
       ======================================== */

    /**
     * 渲染历史日志列表
     */
    async function renderHistoryLogs() {
        try {
            const logs = await getAllLogs();

            if (logs.length === 0) {
                elements.historyContainer.innerHTML = '<div class="empty-tip">暂无历史日志</div>';
                return;
            }

            elements.historyContainer.innerHTML = '';

            logs.forEach(log => {
                const card = createLogCard(log);
                elements.historyContainer.appendChild(card);
            });
        } catch (error) {
            console.error('渲染历史日志失败:', error);
            showToast('加载历史日志失败', 'error');
        }
    }

    /**
     * 创建日志卡片元素
     * @param {Object} log - 日志数据对象
     * @returns {HTMLElement} 日志卡片 DOM 元素
     */
    function createLogCard(log) {
        const card = document.createElement('div');
        card.className = 'log-card';
        card.dataset.date = log.date;

        const header = document.createElement('div');
        header.className = 'log-card-header';
        header.innerHTML = `
            <span class="log-date">${formatDateChinese(log.date)}</span>
            <span class="log-toggle">▼</span>
        `;

        const body = document.createElement('div');
        body.className = 'log-card-body';

        const workRecordSection = document.createElement('div');
        workRecordSection.className = 'log-section';
        workRecordSection.innerHTML = `
            <div class="log-section-title">工作记录</div>
            <div class="log-work-record">${highlightKeyword(log.workRecord || '无记录', state.searchKeyword)}</div>
        `;

        const taskSection = document.createElement('div');
        taskSection.className = 'log-section';

        const taskTitle = document.createElement('div');
        taskTitle.className = 'log-section-title';
        taskTitle.textContent = '任务清单';

        const taskList = document.createElement('ul');
        taskList.className = 'log-task-list';

        if (log.tasks && log.tasks.length > 0) {
            log.tasks.forEach(task => {
                const li = document.createElement('li');
                li.className = `log-task-item ${task.completed ? 'completed' : ''}`;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'log-task-checkbox';
                checkbox.checked = task.completed;
                checkbox.disabled = true;

                const content = document.createElement('span');
                content.innerHTML = highlightKeyword(task.content, state.searchKeyword);

                li.appendChild(checkbox);
                li.appendChild(content);
                taskList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.className = 'log-task-item';
            li.textContent = '无任务';
            taskList.appendChild(li);
        }

        taskSection.appendChild(taskTitle);
        taskSection.appendChild(taskList);

        body.appendChild(workRecordSection);
        body.appendChild(taskSection);

        header.addEventListener('click', () => {
            card.classList.toggle('expanded');
        });

        card.appendChild(header);
        card.appendChild(body);

        return card;
    }

    /* ========================================
       搜索模块
       ======================================== */

    /**
     * 执行搜索操作
     */
    async function performSearch() {
        const keyword = elements.searchInput.value.trim();
        state.searchKeyword = keyword;

        if (!keyword) {
            await renderHistoryLogs();
            return;
        }

        try {
            const logs = await getAllLogs();
            const filteredLogs = logs.filter(log => {
                const workRecordMatch = (log.workRecord || '').toLowerCase().includes(keyword.toLowerCase());
                const taskMatch = (log.tasks || []).some(task =>
                    task.content.toLowerCase().includes(keyword.toLowerCase())
                );
                return workRecordMatch || taskMatch;
            });

            if (filteredLogs.length === 0) {
                elements.historyContainer.innerHTML = '<div class="empty-tip">未找到匹配的日志</div>';
                return;
            }

            elements.historyContainer.innerHTML = '';
            filteredLogs.forEach(log => {
                const card = createLogCard(log);
                card.classList.add('expanded');
                elements.historyContainer.appendChild(card);
            });

            showToast(`找到 ${filteredLogs.length} 条匹配日志`, 'success');
        } catch (error) {
            console.error('搜索失败:', error);
            showToast('搜索失败，请重试', 'error');
        }
    }

    /**
     * 清除搜索结果
     */
    async function clearSearch() {
        elements.searchInput.value = '';
        state.searchKeyword = '';
        await renderHistoryLogs();
    }

    /* ========================================
       导出模块
       ======================================== */

    /**
     * 导出所有日志为 Markdown 文件
     */
    async function exportToMarkdown() {
        try {
            const logs = await getAllLogs();

            if (logs.length === 0) {
                showToast('暂无日志可导出', 'warning');
                return;
            }

            let markdown = '# 工作日志归档\n\n';
            markdown += `> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n`;
            markdown += '---\n\n';

            logs.forEach(log => {
                markdown += `## ${formatDateChinese(log.date)}\n\n`;

                markdown += '### 工作记录\n\n';
                if (log.workRecord && log.workRecord.trim()) {
                    markdown += `${log.workRecord}\n\n`;
                } else {
                    markdown += '*无记录*\n\n';
                }

                markdown += '### 任务清单\n\n';
                if (log.tasks && log.tasks.length > 0) {
                    log.tasks.forEach(task => {
                        const prefix = task.completed ? '- [x] ' : '- [ ] ';
                        const content = task.completed ? `~~${task.content}~~` : task.content;
                        markdown += `${prefix}${content}\n`;
                    });
                    markdown += '\n';
                } else {
                    markdown += '*无任务*\n\n';
                }

                markdown += '---\n\n';
            });

            const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `工作日志_${formatDate(new Date())}.md`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showToast('导出成功', 'success');
        } catch (error) {
            console.error('导出失败:', error);
            showToast('导出失败，请重试', 'error');
        }
    }

    /* ========================================
       弹窗模块
       ======================================== */

    /**
     * 显示确认弹窗
     * @param {string} title - 弹窗标题
     * @param {string} message - 弹窗消息
     * @param {Function} onConfirm - 确认回调函数
     */
    function showConfirmModal(title, message, onConfirm) {
        elements.modalTitle.textContent = title;
        elements.modalMessage.textContent = message;
        elements.confirmModal.classList.add('show');

        const confirmHandler = () => {
            hideConfirmModal();
            onConfirm();
        };

        const cancelHandler = () => {
            hideConfirmModal();
        };

        elements.modalConfirm.onclick = confirmHandler;
        elements.modalCancel.onclick = cancelHandler;

        elements.confirmModal.onclick = (e) => {
            if (e.target === elements.confirmModal) {
                cancelHandler();
            }
        };
    }

    /**
     * 隐藏确认弹窗
     */
    function hideConfirmModal() {
        elements.confirmModal.classList.remove('show');
        elements.modalConfirm.onclick = null;
        elements.modalCancel.onclick = null;
    }

    /* ========================================
       事件绑定
       ======================================== */

    /**
     * 绑定所有事件监听器
     */
    function bindEvents() {
        elements.datePicker.addEventListener('change', (e) => {
            state.currentDate = e.target.value;
            loadLogToEditor(state.currentDate);
        });

        elements.addTaskBtn.addEventListener('click', addTask);

        elements.taskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addTask();
            }
        });

        elements.saveBtn.addEventListener('click', saveCurrentLog);
        elements.resetBtn.addEventListener('click', resetEditor);
        elements.deleteBtn.addEventListener('click', deleteCurrentLog);

        elements.searchBtn.addEventListener('click', performSearch);
        elements.clearSearchBtn.addEventListener('click', clearSearch);

        elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        elements.exportBtn.addEventListener('click', exportToMarkdown);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && elements.confirmModal.classList.contains('show')) {
                hideConfirmModal();
            }
        });
    }

    /* ========================================
       应用初始化
       ======================================== */

    /**
     * 初始化应用
     */
    async function init() {
        try {
            state.db = await initDatabase();

            elements.datePicker.value = state.currentDate;

            bindEvents();

            await loadLogToEditor(state.currentDate);
            await renderHistoryLogs();

            console.log('应用初始化完成');
        } catch (error) {
            console.error('应用初始化失败:', error);
            showToast('系统初始化失败，请刷新页面重试', 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
