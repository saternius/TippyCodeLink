// Claude Shell Pane - Injects a Claude Code transcript viewer into script-editor pages
// Uses net.db.ref() from BanterInspector's networking module for Firebase access

class ClaudeShellPane {
    constructor() {
        // State
        this.messages = new Map();
        this.stdinIndex = 0;
        this.shellRef = null;
        this.stdinRef = null;
        this.metaRef = null;
        this.autoScroll = true;
        this.isConnected = false;
        this.currentSession = localStorage.getItem('claude-shell-session') || 'default';
        this.paneWidth = parseInt(localStorage.getItem('claude-shell-width')) || 320;
        this.isCollapsed = false;

        // DOM references
        this.paneEl = null;
        this.transcriptEl = null;
        this.statusDot = null;
        this.statusText = null;
        this.inputEl = null;
        this.sendBtn = null;
        this.sessionInput = null;
        this.connectBtn = null;
        this.resizerEl = null;
    }

    init() {
        this.injectStyles();
        this.injectPane();

        // Auto-connect if we have a saved session
        if (this.currentSession) {
            this.connect(this.currentSession);
        }
    }

    injectStyles() {
        if (document.getElementById('claude-shell-styles')) return;

        const styleEl = document.createElement('style');
        styleEl.id = 'claude-shell-styles';
        styleEl.textContent = `
            /* Force script-editor-content to be flex row */
            .script-editor-content.claude-shell-active {
                display: flex !important;
                flex-direction: row !important;
            }

            .script-editor-content.claude-shell-active .code-editor-wrapper {
                flex: 1;
                min-width: 0;
            }

            /* Resizer handle */
            .claude-shell-resizer {
                width: 4px;
                background: #2a2a2a;
                cursor: col-resize;
                flex-shrink: 0;
                transition: background 0.2s;
            }
            .claude-shell-resizer:hover,
            .claude-shell-resizer.dragging {
                background: #00d4ff;
            }

            /* Main pane container */
            .claude-shell-pane {
                width: 320px;
                min-width: 200px;
                max-width: 50%;
                background: #1a1a1a;
                border-left: 1px solid #3a3a3a;
                display: flex;
                flex-direction: column;
                flex-shrink: 0;
                overflow: hidden;
            }
            .claude-shell-pane.collapsed {
                width: 40px !important;
                min-width: 40px !important;
            }
            .claude-shell-pane.collapsed .claude-shell-header-title,
            .claude-shell-pane.collapsed .claude-shell-config,
            .claude-shell-pane.collapsed .claude-shell-transcript,
            .claude-shell-pane.collapsed .claude-shell-input-area {
                display: none;
            }

            /* Header */
            .claude-shell-header {
                background: #242424;
                padding: 8px 12px;
                border-bottom: 1px solid #2a2a2a;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
            }
            .claude-shell-header-title {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .claude-shell-header h3 {
                margin: 0;
                font-size: 12px;
                font-weight: 600;
                color: #e8e8e8;
                text-transform: uppercase;
            }
            .claude-shell-status {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                color: #888;
            }
            .claude-shell-status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #666;
            }
            .claude-shell-status-dot.running {
                background: #00ff00;
                animation: claude-shell-pulse 1s infinite;
            }
            .claude-shell-status-dot.completed { background: #00d4ff; }
            .claude-shell-status-dot.error { background: #ff4444; }
            .claude-shell-status-dot.interrupted { background: #ffaa00; }
            @keyframes claude-shell-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            .claude-shell-collapse-btn {
                background: none;
                border: none;
                color: #888;
                cursor: pointer;
                padding: 4px;
                font-size: 14px;
                transition: color 0.2s;
            }
            .claude-shell-collapse-btn:hover {
                color: #00d4ff;
            }

            /* Config section */
            .claude-shell-config {
                padding: 8px 12px;
                background: #1a1a1a;
                border-bottom: 1px solid #2a2a2a;
                display: flex;
                gap: 8px;
                flex-shrink: 0;
            }
            .claude-shell-config input {
                flex: 1;
                padding: 6px 10px;
                background: #0f0f0f;
                border: 1px solid #3a3a3a;
                border-radius: 4px;
                color: #e8e8e8;
                font-size: 12px;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .claude-shell-config input:focus {
                outline: none;
                border-color: #00d4ff;
            }
            .claude-shell-config button {
                padding: 6px 12px;
                background: #2a2a2a;
                border: 1px solid #3a3a3a;
                border-radius: 4px;
                color: #e8e8e8;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .claude-shell-config button:hover {
                background: #333;
                border-color: #00d4ff;
            }
            .claude-shell-config button.connected {
                background: #00d4ff20;
                border-color: #00d4ff;
                color: #00d4ff;
            }

            /* Transcript area */
            .claude-shell-transcript {
                flex: 1;
                overflow-y: auto;
                padding: 12px;
                min-height: 0;
            }
            .claude-shell-transcript::-webkit-scrollbar {
                width: 6px;
            }
            .claude-shell-transcript::-webkit-scrollbar-track {
                background: #0f0f0f;
            }
            .claude-shell-transcript::-webkit-scrollbar-thumb {
                background: #2a2a2a;
                border-radius: 3px;
            }

            /* Messages */
            .claude-shell-message {
                margin-bottom: 12px;
                max-width: 95%;
            }
            .claude-shell-message.user {
                margin-left: auto;
            }
            .claude-shell-message.assistant {
                margin-right: auto;
            }
            .claude-shell-message-header {
                font-size: 10px;
                color: #666;
                margin-bottom: 4px;
                text-transform: uppercase;
            }
            .claude-shell-message.user .claude-shell-message-header {
                text-align: right;
            }
            .claude-shell-message-bubble {
                padding: 8px 12px;
                border-radius: 8px;
                line-height: 1.4;
                font-size: 12px;
            }
            .claude-shell-message.user .claude-shell-message-bubble {
                background: #00d4ff20;
                border: 1px solid #00d4ff40;
                color: #e8e8e8;
                border-bottom-right-radius: 2px;
            }
            .claude-shell-message.assistant .claude-shell-message-bubble {
                background: #2a2a2a;
                color: #e8e8e8;
                border-bottom-left-radius: 2px;
            }
            .claude-shell-content-text {
                white-space: pre-wrap;
                word-break: break-word;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            /* Tool blocks */
            .claude-shell-tool-block {
                margin: 8px 0;
                background: #0f0f0f;
                border-radius: 6px;
                overflow: hidden;
                border-left: 3px solid #ffaa00;
            }
            .claude-shell-tool-block.tool_result {
                border-left-color: #00ff00;
            }
            .claude-shell-tool-header {
                padding: 6px 10px;
                background: #1a1a1a;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 11px;
            }
            .claude-shell-tool-header:hover {
                background: #242424;
            }
            .claude-shell-tool-name {
                color: #ffaa00;
                font-weight: bold;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .claude-shell-tool-block.tool_result .claude-shell-tool-name {
                color: #00ff00;
            }
            .claude-shell-tool-toggle {
                color: #666;
                font-size: 10px;
            }
            .claude-shell-tool-content {
                display: none;
                padding: 8px 10px;
                max-height: 200px;
                overflow: auto;
            }
            .claude-shell-tool-content.expanded {
                display: block;
            }
            .claude-shell-tool-content pre {
                margin: 0;
                white-space: pre-wrap;
                word-break: break-all;
                color: #888;
                font-size: 11px;
                font-family: 'Consolas', 'Monaco', monospace;
            }

            /* Input area */
            .claude-shell-input-area {
                display: flex;
                padding: 8px 12px;
                background: #242424;
                border-top: 1px solid #2a2a2a;
                gap: 8px;
                flex-shrink: 0;
            }
            .claude-shell-input-area input {
                flex: 1;
                padding: 8px 12px;
                background: #0f0f0f;
                border: 1px solid #3a3a3a;
                border-radius: 4px;
                color: #e8e8e8;
                font-size: 12px;
                font-family: 'Consolas', 'Monaco', monospace;
            }
            .claude-shell-input-area input:focus {
                outline: none;
                border-color: #00d4ff;
            }
            .claude-shell-input-area input:disabled {
                opacity: 0.5;
            }
            .claude-shell-send-btn {
                padding: 8px 16px;
                background: #00d4ff;
                border: none;
                border-radius: 4px;
                color: #0f0f0f;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                transition: opacity 0.2s;
            }
            .claude-shell-send-btn:hover {
                opacity: 0.9;
            }
            .claude-shell-send-btn:disabled {
                background: #444;
                color: #888;
                cursor: not-allowed;
            }

            /* Empty state */
            .claude-shell-empty {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: #666;
                text-align: center;
                padding: 20px;
            }
            .claude-shell-empty-icon {
                font-size: 32px;
                margin-bottom: 12px;
                opacity: 0.5;
            }
            .claude-shell-empty-text {
                font-size: 12px;
                line-height: 1.4;
            }

            /* Message count */
            .claude-shell-message-count {
                font-size: 10px;
                color: #666;
                padding: 4px 12px;
                text-align: center;
                border-top: 1px solid #2a2a2a;
                background: #1a1a1a;
                flex-shrink: 0;
            }
        `;
        document.head.appendChild(styleEl);
    }

    injectPane() {
        // Find the script-editor-content container
        const contentEl = document.querySelector('.script-editor-content');
        if (!contentEl) {
            console.warn('[ClaudeShell] Could not find .script-editor-content');
            return;
        }

        // Check if already injected
        if (contentEl.querySelector('.claude-shell-pane')) {
            return;
        }

        // Add flex row class
        contentEl.classList.add('claude-shell-active');

        // Create resizer
        this.resizerEl = document.createElement('div');
        this.resizerEl.className = 'claude-shell-resizer';
        this.setupResizer();

        // Create pane
        this.paneEl = document.createElement('div');
        this.paneEl.className = 'claude-shell-pane';
        this.paneEl.style.width = this.paneWidth + 'px';
        this.paneEl.innerHTML = `
            <div class="claude-shell-header">
                <div class="claude-shell-header-title">
                    <h3>Claude Shell</h3>
                    <div class="claude-shell-status">
                        <div class="claude-shell-status-dot"></div>
                        <span class="claude-shell-status-text">Disconnected</span>
                    </div>
                </div>
                <button class="claude-shell-collapse-btn" title="Toggle pane">◀</button>
            </div>
            <div class="claude-shell-config">
                <input type="text" placeholder="Session name..." value="${this.currentSession}">
                <button>Connect</button>
            </div>
            <div class="claude-shell-transcript">
                <div class="claude-shell-empty">
                    <div class="claude-shell-empty-icon">💬</div>
                    <div class="claude-shell-empty-text">
                        Enter a session name and click Connect<br>
                        to view Claude shell transcript
                    </div>
                </div>
            </div>
            <div class="claude-shell-message-count"></div>
            <div class="claude-shell-input-area">
                <input type="text" placeholder="Type message..." disabled>
                <button class="claude-shell-send-btn" disabled>Send</button>
            </div>
        `;

        // Append elements
        contentEl.appendChild(this.resizerEl);
        contentEl.appendChild(this.paneEl);

        // Get DOM references
        this.statusDot = this.paneEl.querySelector('.claude-shell-status-dot');
        this.statusText = this.paneEl.querySelector('.claude-shell-status-text');
        this.transcriptEl = this.paneEl.querySelector('.claude-shell-transcript');
        this.inputEl = this.paneEl.querySelector('.claude-shell-input-area input');
        this.sendBtn = this.paneEl.querySelector('.claude-shell-send-btn');
        this.sessionInput = this.paneEl.querySelector('.claude-shell-config input');
        this.connectBtn = this.paneEl.querySelector('.claude-shell-config button');
        this.messageCountEl = this.paneEl.querySelector('.claude-shell-message-count');

        // Setup event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Connect button
        this.connectBtn.addEventListener('click', () => {
            const session = this.sessionInput.value.trim();
            if (session) {
                if (this.isConnected) {
                    this.disconnect();
                } else {
                    this.connect(session);
                }
            }
        });

        // Session input enter key
        this.sessionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const session = this.sessionInput.value.trim();
                if (session && !this.isConnected) {
                    this.connect(session);
                }
            }
        });

        // Send button
        this.sendBtn.addEventListener('click', () => {
            this.sendInput();
        });

        // Input enter key
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.sendInput();
            }
        });

        // Collapse button
        const collapseBtn = this.paneEl.querySelector('.claude-shell-collapse-btn');
        collapseBtn.addEventListener('click', () => {
            this.isCollapsed = !this.isCollapsed;
            this.paneEl.classList.toggle('collapsed', this.isCollapsed);
            collapseBtn.textContent = this.isCollapsed ? '▶' : '◀';
        });

        // Scroll detection for auto-scroll
        this.transcriptEl.addEventListener('scroll', () => {
            const isAtBottom = this.transcriptEl.scrollHeight - this.transcriptEl.scrollTop
                <= this.transcriptEl.clientHeight + 50;
            this.autoScroll = isAtBottom;
        });
    }

    setupResizer() {
        let isResizing = false;
        let startX, startWidth;

        this.resizerEl.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = this.paneEl.offsetWidth;
            this.resizerEl.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const dx = startX - e.clientX;
            const newWidth = Math.max(200, Math.min(startWidth + dx, window.innerWidth * 0.5));
            this.paneEl.style.width = newWidth + 'px';
            this.paneWidth = newWidth;
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                this.resizerEl.classList.remove('dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                localStorage.setItem('claude-shell-width', this.paneWidth.toString());
            }
        });
    }

    connect(sessionName) {
        if (this.isConnected) {
            this.disconnect();
        }

        this.currentSession = sessionName;
        localStorage.setItem('claude-shell-session', sessionName);

        // Get Firebase references using global net.db
        this.shellRef = net.db.ref(`/shell/${sessionName}`);
        this.stdinRef = this.shellRef.child('stdin');
        this.metaRef = this.shellRef.child('meta');

        // Get current stdin index
        this.stdinRef.once('value', (snapshot) => {
            const data = snapshot.val();
            if (data && typeof data === 'object') {
                const keys = Object.keys(data).map(k => parseInt(k));
                this.stdinIndex = Math.max(...keys, -1) + 1;
            } else {
                this.stdinIndex = 0;
            }
        });

        // Listen for metadata
        this.metaRef.on('value', (snapshot) => {
            const meta = snapshot.val();
            if (meta) {
                this.updateStatus(meta.status || 'unknown');
                const isRunning = meta.status === 'running';
                this.inputEl.disabled = !isRunning;
                this.sendBtn.disabled = !isRunning;
            } else {
                this.updateStatus('not_found');
                this.inputEl.disabled = true;
                this.sendBtn.disabled = true;
            }
        });

        // Listen for messages
        this.shellRef.on('child_added', (snapshot) => {
            const key = snapshot.key;
            if (key === 'meta' || key === 'stdin') return;

            const data = snapshot.val();
            if (data && data.role) {
                this.messages.set(key, data);
                this.renderMessages();
            }
        });

        this.shellRef.on('child_changed', (snapshot) => {
            const key = snapshot.key;
            if (key === 'meta' || key === 'stdin') return;

            const data = snapshot.val();
            if (data && data.role) {
                this.messages.set(key, data);
                this.renderMessages();
            }
        });

        this.isConnected = true;
        this.connectBtn.textContent = 'Disconnect';
        this.connectBtn.classList.add('connected');
        this.sessionInput.disabled = true;

        log("ClaudeShell", `Connected to session: ${sessionName}`);
    }

    disconnect() {
        if (this.shellRef) {
            this.shellRef.off();
            this.shellRef = null;
        }
        if (this.metaRef) {
            this.metaRef.off();
            this.metaRef = null;
        }
        this.stdinRef = null;
        this.messages.clear();
        this.stdinIndex = 0;
        this.isConnected = false;

        this.updateStatus('disconnected');
        this.connectBtn.textContent = 'Connect';
        this.connectBtn.classList.remove('connected');
        this.sessionInput.disabled = false;
        this.inputEl.disabled = true;
        this.sendBtn.disabled = true;

        this.transcriptEl.innerHTML = `
            <div class="claude-shell-empty">
                <div class="claude-shell-empty-icon">💬</div>
                <div class="claude-shell-empty-text">
                    Enter a session name and click Connect<br>
                    to view Claude shell transcript
                </div>
            </div>
        `;
        this.messageCountEl.textContent = '';

        log("ClaudeShell", "Disconnected");
    }

    updateStatus(status) {
        this.statusDot.className = 'claude-shell-status-dot';
        if (status && status !== 'unknown' && status !== 'not_found' && status !== 'disconnected') {
            this.statusDot.classList.add(status);
        }

        const statusLabels = {
            'running': 'Running',
            'completed': 'Completed',
            'error': 'Error',
            'interrupted': 'Interrupted',
            'not_found': 'Not Found',
            'disconnected': 'Disconnected',
            'unknown': 'Unknown'
        };
        this.statusText.textContent = statusLabels[status] || status;
    }

    renderMessages() {
        // Sort messages by timestamp key
        const sortedEntries = [...this.messages.entries()].sort((a, b) => {
            return a[0].localeCompare(b[0]);
        });

        this.transcriptEl.innerHTML = '';

        for (const [ts, msg] of sortedEntries) {
            this.appendMessage(msg.role, msg.content);
        }

        this.messageCountEl.textContent = `${this.messages.size} messages`;

        if (this.autoScroll) {
            this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
        }
    }

    appendMessage(role, content) {
        const msgEl = document.createElement('div');
        msgEl.className = `claude-shell-message ${role}`;

        const headerEl = document.createElement('div');
        headerEl.className = 'claude-shell-message-header';
        headerEl.textContent = role;
        msgEl.appendChild(headerEl);

        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'claude-shell-message-bubble';

        if (Array.isArray(content)) {
            for (const item of content) {
                bubbleEl.appendChild(this.renderContentItem(item));
            }
        } else if (typeof content === 'string') {
            const textEl = document.createElement('div');
            textEl.className = 'claude-shell-content-text';
            textEl.textContent = content;
            bubbleEl.appendChild(textEl);
        }

        msgEl.appendChild(bubbleEl);
        this.transcriptEl.appendChild(msgEl);
    }

    renderContentItem(item) {
        // String content
        if (typeof item === 'string') {
            const textEl = document.createElement('div');
            textEl.className = 'claude-shell-content-text';
            textEl.textContent = item;
            return textEl;
        }

        // Object content
        if (typeof item === 'object' && item !== null) {
            // Text block
            if (item.type === 'text' || item.text) {
                const textEl = document.createElement('div');
                textEl.className = 'claude-shell-content-text';
                textEl.textContent = item.text || '';
                return textEl;
            }

            // Tool use block
            if (item.type === 'tool_use') {
                return this.renderToolBlock('tool_use', item.name, item.input);
            }

            // Tool result block
            if (item.type === 'tool_result') {
                return this.renderToolBlock('tool_result', 'Result', item.content);
            }

            // Generic object
            const textEl = document.createElement('div');
            textEl.className = 'claude-shell-content-text';
            textEl.textContent = JSON.stringify(item, null, 2);
            return textEl;
        }

        // Fallback
        const textEl = document.createElement('div');
        textEl.className = 'claude-shell-content-text';
        textEl.textContent = String(item);
        return textEl;
    }

    renderToolBlock(type, name, data) {
        const blockEl = document.createElement('div');
        blockEl.className = `claude-shell-tool-block ${type}`;

        const headerEl = document.createElement('div');
        headerEl.className = 'claude-shell-tool-header';

        const nameEl = document.createElement('span');
        nameEl.className = 'claude-shell-tool-name';
        nameEl.textContent = name;
        headerEl.appendChild(nameEl);

        const toggleEl = document.createElement('span');
        toggleEl.className = 'claude-shell-tool-toggle';
        toggleEl.textContent = '▼';
        headerEl.appendChild(toggleEl);

        const contentEl = document.createElement('div');
        contentEl.className = 'claude-shell-tool-content';

        const preEl = document.createElement('pre');
        if (typeof data === 'string') {
            preEl.textContent = data;
        } else {
            preEl.textContent = JSON.stringify(data, null, 2);
        }
        contentEl.appendChild(preEl);

        headerEl.addEventListener('click', () => {
            contentEl.classList.toggle('expanded');
            toggleEl.textContent = contentEl.classList.contains('expanded') ? '▲' : '▼';
        });

        blockEl.appendChild(headerEl);
        blockEl.appendChild(contentEl);
        return blockEl;
    }

    sendInput() {
        const input = this.inputEl.value.trim();
        if (!input || !this.stdinRef) return;

        this.stdinRef.child(String(this.stdinIndex)).set(input)
            .then(() => {
                this.stdinIndex++;
                this.inputEl.value = '';
                log("ClaudeShell", `Sent stdin: ${input}`);
            })
            .catch(err => {
                console.error('[ClaudeShell] Failed to send input:', err);
            });
    }

    destroy() {
        this.disconnect();

        // Remove DOM elements
        if (this.paneEl && this.paneEl.parentNode) {
            this.paneEl.remove();
        }
        if (this.resizerEl && this.resizerEl.parentNode) {
            this.resizerEl.remove();
        }

        // Remove flex class
        const contentEl = document.querySelector('.script-editor-content');
        if (contentEl) {
            contentEl.classList.remove('claude-shell-active');
        }

        // Remove styles
        const styles = document.getElementById('claude-shell-styles');
        if (styles) {
            styles.remove();
        }
    }
}

// Global instance and page monitoring
let claudeShellPane = null;
let pageObserver = null;

const handlePageSwitch = (e) => {
    const pageId = e.detail?.pageId || '';

    // Check if switching to a script-editor page
    if (pageId.startsWith('script-editor-')) {
        log("ClaudeShell", `Detected script-editor page: ${pageId}`);

        // Delay slightly to ensure DOM is ready
        setTimeout(() => {
            if (!claudeShellPane) {
                claudeShellPane = new ClaudeShellPane();
            }
            claudeShellPane.init();
        }, 100);
    }
};

const checkAndInject = () => {
    // Check if we're already on a script-editor page
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id && activePage.id.startsWith('script-editor-')) {
        log("ClaudeShell", "Already on script-editor page, injecting");
        if (!claudeShellPane) {
            claudeShellPane = new ClaudeShellPane();
        }
        claudeShellPane.init();
    }
};

// Lifecycle hooks
this.onStart = () => {
    log("ClaudeShell", "onStart - initializing Claude Shell Pane injector");

    // Listen for page switches
    window.addEventListener('page-switched', handlePageSwitch);

    // Check if already on a script-editor page
    setTimeout(checkAndInject, 500);

    // Also watch for dynamically created script-editor pages
    pageObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1 && node.classList?.contains('page')) {
                    if (node.id?.startsWith('script-editor-')) {
                        log("ClaudeShell", "New script-editor page detected via observer");
                        setTimeout(() => {
                            if (!claudeShellPane) {
                                claudeShellPane = new ClaudeShellPane();
                            }
                            claudeShellPane.init();
                        }, 100);
                    }
                }
            }
        }
    });

    const pageContainer = document.querySelector('.page-container');
    if (pageContainer) {
        pageObserver.observe(pageContainer, { childList: true });
    }
};

this.onUpdate = () => {
    // Not used
};

this.onDestroy = () => {
    log("ClaudeShell", "onDestroy - cleaning up");

    // Remove event listener
    window.removeEventListener('page-switched', handlePageSwitch);

    // Stop observer
    if (pageObserver) {
        pageObserver.disconnect();
        pageObserver = null;
    }

    // Destroy pane
    if (claudeShellPane) {
        claudeShellPane.destroy();
        claudeShellPane = null;
    }
};
