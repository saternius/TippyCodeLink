// Todo App - Injectable Inspector Tab
// A simple todo list manager for the Tippy Inspector

class TodoApp {
    constructor() {
        this.todos = [];
        this.nextId = 1;
        this.filter = 'all'; // 'all', 'active', 'completed'
        this.loadFromStorage();
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem('inspector-todos');
            if (saved) {
                const data = JSON.parse(saved);
                this.todos = data.todos || [];
                this.nextId = data.nextId || 1;
            }
        } catch (e) {
            console.warn("Could not load todos from storage:", e);
        }
    }

    saveToStorage() {
        try {
            localStorage.setItem('inspector-todos', JSON.stringify({
                todos: this.todos,
                nextId: this.nextId
            }));
        } catch (e) {
            console.warn("Could not save todos to storage:", e);
        }
    }

    addTodo(text) {
        if (!text.trim()) return null;
        const todo = {
            id: this.nextId++,
            text: text.trim(),
            completed: false,
            createdAt: Date.now()
        };
        this.todos.unshift(todo);
        this.saveToStorage();
        return todo;
    }

    toggleTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            this.saveToStorage();
        }
        return todo;
    }

    deleteTodo(id) {
        this.todos = this.todos.filter(t => t.id !== id);
        this.saveToStorage();
    }

    editTodo(id, newText) {
        const todo = this.todos.find(t => t.id === id);
        if (todo && newText.trim()) {
            todo.text = newText.trim();
            this.saveToStorage();
        }
        return todo;
    }

    clearCompleted() {
        this.todos = this.todos.filter(t => !t.completed);
        this.saveToStorage();
    }

    getFilteredTodos() {
        switch (this.filter) {
            case 'active':
                return this.todos.filter(t => !t.completed);
            case 'completed':
                return this.todos.filter(t => t.completed);
            default:
                return this.todos;
        }
    }

    getStats() {
        const total = this.todos.length;
        const completed = this.todos.filter(t => t.completed).length;
        const active = total - completed;
        return { total, completed, active };
    }

    async init() {
        const pageElement = this.generatePage();
        this.setupUI();
        return pageElement;
    }

    generatePage() {
        log("todo-app", "generatePage");

        // Check if page already exists
        const existingPage = document.getElementById('todo-app-page');
        if (existingPage) {
            log("todo-app", "Page already exists, skipping creation");
            return existingPage;
        }

        const pageElement = document.createElement('div');
        pageElement.id = 'todo-app-page';
        pageElement.className = 'page';
        pageElement.innerHTML = `
            <div class="todo-app-container" style="padding: 20px; max-width: 600px; margin: 0 auto; height: 100%; display: flex; flex-direction: column;">
                <h1 style="color: #fff; margin-bottom: 10px;">✅ Todo List</h1>
                <p style="color: #aaa; margin-bottom: 20px;">Manage your tasks</p>

                <!-- Add Todo Section -->
                <div class="todo-input-section" style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                    <div style="display: flex; gap: 10px;">
                        <input
                            type="text"
                            id="todoInput"
                            placeholder="What needs to be done?"
                            style="flex: 1; padding: 12px 15px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: #fff; font-size: 14px;"
                        />
                        <button
                            id="todoAddBtn"
                            style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; border-radius: 4px; padding: 12px 24px; color: #fff; cursor: pointer; font-size: 14px; font-weight: 600;"
                        >
                            Add
                        </button>
                    </div>
                </div>

                <!-- Filter Tabs -->
                <div id="todoFilters" style="display: flex; gap: 5px; margin-bottom: 15px;">
                    <button class="todo-filter-btn active" data-filter="all" style="padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; background: rgba(255,255,255,0.2); color: #fff;">
                        All
                    </button>
                    <button class="todo-filter-btn" data-filter="active" style="padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; background: rgba(255,255,255,0.1); color: #aaa;">
                        Active
                    </button>
                    <button class="todo-filter-btn" data-filter="completed" style="padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; background: rgba(255,255,255,0.1); color: #aaa;">
                        Completed
                    </button>
                </div>

                <!-- Stats Bar -->
                <div id="todoStats" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; background: rgba(255,255,255,0.03); border-radius: 4px; margin-bottom: 10px;">
                    <span id="todoCount" style="color: #888; font-size: 12px;">0 items</span>
                    <div style="display: flex; gap: 10px;">
                        <button id="todoExport" style="background: none; border: none; color: #888; font-size: 12px; cursor: pointer;">
                            Export
                        </button>
                        <button id="todoClearCompleted" style="background: none; border: none; color: #888; font-size: 12px; cursor: pointer; display: none;">
                            Clear completed
                        </button>
                    </div>
                </div>

                <!-- Todo List -->
                <div id="todoList" style="flex: 1; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 10px;">
                    <!-- Todos will be populated here -->
                </div>
            </div>
        `;

        // Add to page container
        const pageContainer = document.querySelector('.page-container');
        if (pageContainer) {
            pageContainer.appendChild(pageElement);
            log("todo-app", "Page element added to page-container");
        } else {
            err("todo-app", "Could not find .page-container");
        }

        this.injectStyles();
        return pageElement;
    }

    injectStyles() {
        if (document.getElementById('todo-app-styles')) return;

        const styleEl = document.createElement('style');
        styleEl.id = 'todo-app-styles';
        styleEl.textContent = `
            .todo-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 15px;
                background: rgba(255,255,255,0.05);
                border-radius: 6px;
                margin-bottom: 8px;
                transition: background 0.2s, transform 0.2s;
            }
            .todo-item:hover {
                background: rgba(255,255,255,0.08);
            }
            .todo-item.completed .todo-text {
                text-decoration: line-through;
                color: #666;
            }
            .todo-checkbox {
                width: 22px;
                height: 22px;
                border: 2px solid rgba(255,255,255,0.3);
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                flex-shrink: 0;
            }
            .todo-checkbox:hover {
                border-color: #10b981;
            }
            .todo-checkbox.checked {
                background: #10b981;
                border-color: #10b981;
            }
            .todo-checkbox.checked::after {
                content: '✓';
                color: #fff;
                font-size: 12px;
                font-weight: bold;
            }
            .todo-text {
                flex: 1;
                color: #fff;
                font-size: 14px;
                word-break: break-word;
            }
            .todo-text-input {
                flex: 1;
                background: rgba(0,0,0,0.3);
                border: 1px solid #10b981;
                border-radius: 4px;
                padding: 8px 12px;
                color: #fff;
                font-size: 14px;
            }
            .todo-delete {
                width: 28px;
                height: 28px;
                border: none;
                background: rgba(239, 68, 68, 0.2);
                border-radius: 4px;
                color: #ef4444;
                cursor: pointer;
                opacity: 0;
                transition: opacity 0.2s, background 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            .todo-item:hover .todo-delete {
                opacity: 1;
            }
            .todo-delete:hover {
                background: rgba(239, 68, 68, 0.4);
            }
            .todo-filter-btn.active {
                background: rgba(255,255,255,0.2) !important;
                color: #fff !important;
            }
            .todo-empty {
                text-align: center;
                padding: 40px;
                color: #666;
            }
            #todoClearCompleted:hover {
                color: #ef4444 !important;
            }
            #todoExport:hover {
                color: #10b981 !important;
            }
        `;
        document.head.appendChild(styleEl);
    }

    setupUI() {
        // Add button
        const addBtn = document.getElementById('todoAddBtn');
        if (addBtn) {
            addBtn.addEventListener('mousedown', () => this.handleAddTodo());
        }

        // Input - enter key
        const input = document.getElementById('todoInput');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.handleAddTodo();
                }
            });
        }

        // Filter buttons
        const filterBtns = document.querySelectorAll('.todo-filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('mousedown', () => {
                const filter = btn.getAttribute('data-filter');
                this.setFilter(filter);
            });
        });

        // Clear completed button
        const clearBtn = document.getElementById('todoClearCompleted');
        if (clearBtn) {
            clearBtn.addEventListener('mousedown', () => {
                this.clearCompleted();
                this.renderTodos();
            });
        }

        // Export button
        const exportBtn = document.getElementById('todoExport');
        if (exportBtn) {
            exportBtn.addEventListener('mousedown', () => this.exportTodos());
        }

        // Listen for page switches
        window.addEventListener('page-switched', (e) => {
            const page = document.getElementById('todo-app-page');
            if (!page) return;

            if (e.detail.pageId === 'todo-app') {
                log("todo-app", "Page switched to todo-app");
                page.classList.add('active');
            } else {
                page.classList.remove('active');
            }
        });

        // Initial render
        this.renderTodos();
    }

    handleAddTodo() {
        const input = document.getElementById('todoInput');
        if (!input) return;

        const text = input.value.trim();
        if (text) {
            this.addTodo(text);
            input.value = '';
            this.renderTodos();
        }
    }

    setFilter(filter) {
        this.filter = filter;

        // Update button styles
        document.querySelectorAll('.todo-filter-btn').forEach(btn => {
            if (btn.getAttribute('data-filter') === filter) {
                btn.classList.add('active');
                btn.style.background = 'rgba(255,255,255,0.2)';
                btn.style.color = '#fff';
            } else {
                btn.classList.remove('active');
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.color = '#aaa';
            }
        });

        this.renderTodos();
    }

    renderTodos() {
        const listEl = document.getElementById('todoList');
        if (!listEl) return;

        const todos = this.getFilteredTodos();
        const stats = this.getStats();

        // Update stats
        const countEl = document.getElementById('todoCount');
        if (countEl) {
            const itemText = stats.active === 1 ? 'item' : 'items';
            countEl.textContent = `${stats.active} ${itemText} left`;
        }

        // Show/hide clear completed button
        const clearBtn = document.getElementById('todoClearCompleted');
        if (clearBtn) {
            clearBtn.style.display = stats.completed > 0 ? 'block' : 'none';
        }

        // Render todos
        if (todos.length === 0) {
            const emptyMessage = this.filter === 'all'
                ? 'No todos yet. Add one above!'
                : this.filter === 'active'
                ? 'No active todos!'
                : 'No completed todos!';

            listEl.innerHTML = `<div class="todo-empty">${emptyMessage}</div>`;
            return;
        }

        listEl.innerHTML = '';
        todos.forEach(todo => {
            const item = this.createTodoItem(todo);
            listEl.appendChild(item);
        });
    }

    createTodoItem(todo) {
        const item = document.createElement('div');
        item.className = `todo-item ${todo.completed ? 'completed' : ''}`;
        item.dataset.id = todo.id;

        item.innerHTML = `
            <div class="todo-checkbox ${todo.completed ? 'checked' : ''}"></div>
            <span class="todo-text">${this.escapeHtml(todo.text)}</span>
            <button class="todo-delete">✕</button>
        `;

        // Checkbox click
        const checkbox = item.querySelector('.todo-checkbox');
        checkbox.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.toggleTodo(todo.id);
            this.renderTodos();
        });

        // Delete button
        const deleteBtn = item.querySelector('.todo-delete');
        deleteBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.deleteTodo(todo.id);
            this.renderTodos();
        });

        // Double-click to edit
        const textEl = item.querySelector('.todo-text');
        textEl.addEventListener('dblclick', () => {
            this.startEditing(item, todo);
        });

        return item;
    }

    startEditing(item, todo) {
        const textEl = item.querySelector('.todo-text');
        const currentText = todo.text;

        // Replace text with input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'todo-text-input';
        input.value = currentText;

        textEl.replaceWith(input);
        input.focus();
        input.select();

        const finishEditing = () => {
            const newText = input.value.trim();
            if (newText && newText !== currentText) {
                this.editTodo(todo.id, newText);
            }
            this.renderTodos();
        };

        input.addEventListener('blur', finishEditing);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                finishEditing();
            } else if (e.key === 'Escape') {
                this.renderTodos();
            }
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    exportTodos() {
        const exportData = {
            exportedAt: new Date().toISOString(),
            todos: this.todos.map(todo => ({
                id: todo.id,
                text: todo.text,
                completed: todo.completed,
                createdAt: new Date(todo.createdAt).toISOString()
            })),
            stats: this.getStats()
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `todos-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        log("todo-app", "Exported todos to file");
    }
}

// Initialize when script loads
let todoAppInstance = null;
let todoNavButton = null;
let todoPageElement = null;

let generateTodoToolBtn = (pageEl) => {
    log("todo-app", "generateToolBtn");

    // Create nav button with proper structure
    todoNavButton = document.createElement("button");
    todoNavButton.classList.add("nav-item");
    todoNavButton.setAttribute("data-page", "todo-app");
    todoNavButton.innerHTML = `
        <span class="nav-icon">✅</span>
        Todo
    `;

    // Add nav button to navigation
    const navItems = document.querySelector(".nav-items");
    if (navItems) {
        navItems.appendChild(todoNavButton);
        log("todo-app", "Nav button added to navigation");
    } else {
        err("todo-app", "Could not find .nav-items");
        return;
    }

    // Set up click handler to switch pages
    todoNavButton.addEventListener("mousedown", () => {
        log("todo-app", "Nav button clicked");

        if (window.navigation && typeof window.navigation.switchPage === 'function') {
            log("todo-app", "Using navigation.switchPage()");
            window.navigation.switchPage('todo-app');
        } else {
            // Fallback: manually switch pages
            log("todo-app", "Using fallback page switching");

            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });

            const todoPage = document.getElementById('todo-app-page');
            if (todoPage) {
                todoPage.classList.add('active');
            }
            todoNavButton.classList.add('active');

            window.dispatchEvent(new CustomEvent('page-switched', {
                detail: { pageId: 'todo-app' }
            }));
        }
    });

    // Register with navigation system if available
    if (window.navigation && pageEl && typeof window.navigation.addDynamicPage === 'function') {
        try {
            log("todo-app", "Registering with navigation system");
            window.navigation.addDynamicPage('todo-app', pageEl, todoNavButton);
        } catch (error) {
            err("todo-app", "Failed to register with navigation:", error);
        }
    }
};

this.onStart = async () => {
    log("todo-app", "onStart - initializing Todo App");
    todoAppInstance = new TodoApp();

    // Wait for page to be created
    todoPageElement = await todoAppInstance.init();

    // Generate navigation button
    generateTodoToolBtn(todoPageElement);

    // Make instance globally accessible
    window.todoAppInstance = todoAppInstance;
};

this.onDestroy = () => {
    log("todo-app", "onDestroy - cleaning up");

    // Use navigation system to remove if available
    if (window.navigation && typeof window.navigation.removeDynamicPage === 'function') {
        try {
            window.navigation.removeDynamicPage('todo-app');
            log("todo-app", "Removed via navigation system");
        } catch (error) {
            err("todo-app", "Error removing from navigation:", error);
        }
    }

    // Manual cleanup
    if (todoNavButton && todoNavButton.parentNode) {
        todoNavButton.remove();
    }

    const page = document.getElementById('todo-app-page');
    if (page && page.parentNode) {
        page.remove();
    }

    const styles = document.getElementById('todo-app-styles');
    if (styles && styles.parentNode) {
        styles.remove();
    }

    if (window.todoAppInstance) {
        delete window.todoAppInstance;
    }

    todoAppInstance = null;
    todoNavButton = null;
    todoPageElement = null;
};
