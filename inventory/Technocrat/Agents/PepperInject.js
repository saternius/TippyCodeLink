// PepperInject.js - Main Orchestrator
// UI methods loaded from PepperInjectUI.js
// Shell methods loaded from PepperInjectShell.js

console.log("PepperInject.js loading...");

// ============================================
// VARIABLE HELPER
// ============================================

let V = (attr) => {
    if (!this.vars[attr]) return null;
    return this.vars[attr].value;
}

// ============================================
// MAIN CLASS
// ============================================

class PepperInject {
    constructor(component) {
        // Store component reference for module refresh capability
        this._component = component;

        // Make V() available to bound module methods
        this.V = V;

        // SpeechPepper State
        this.history = [];
        this.lastBuffer = "";
        this.isThinking = false;
        this.isRunDisabled = false;
        this.currentRevisionValue = null;
        this.revisionDebounceTimer = null;

        // Multi-input container state
        this.inputContainers = []; // Array of {id, title, content}
        this.activeContainerId = null;
        this.containerIdCounter = 0;

        // Drag and drop state
        this.draggedContainerId = null;
        this.dragOverContainerId = null;
        this.dragInsertPosition = null; // 'before' or 'after'

        // localStorage key for saved items
        this.storageKey = 'PepperInject_saves';
        this.activeDropdown = null; // Track active dropdown for cleanup

        // Recording State (walkie-talkie style)
        this.isRecording = false;
        this.transcriptListenerActive = false;

        // CodeUI State
        this.messages = new Map();
        this.stdinIndex = 0;
        this.isConnected = false;
        this.currentSession = "";
        this.autoScroll = true;

        // Firebase refs for cleanup
        this.transcriptRef = null;
        this.thinkingRef = null;
        this.revisionRef = null;
        this.historyRef = null;
        this.shellRef = null;
        this.stdinRef = null;
        this.metaRef = null;
        this.inputRefRef = null;

        // UI Element refs
        this.pageElement = null;
        this.navButton = null;
    }

    // ============================================
    // MODULE LOADING
    // ============================================

    async waitForModules(maxWait = 5000) {
        const checkInterval = 50;
        let waited = 0;

        while (waited < maxWait) {
            const hasUI = window.PepperInjectModules?.UI;
            const hasShell = window.PepperInjectModules?.Shell;

            if (hasUI && hasShell) {
                console.log("PepperInject: All modules loaded");
                return true;
            }

            await new Promise(r => setTimeout(r, checkInterval));
            waited += checkInterval;
        }

        // After timeout, proceed with whatever is available
        console.warn("PepperInject: Module wait timeout. Available:", {
            UI: !!window.PepperInjectModules?.UI,
            Shell: !!window.PepperInjectModules?.Shell
        });
        return false;
    }

    bindModules() {
        // Bind UI module methods
        if (window.PepperInjectModules?.UI) {
            Object.keys(window.PepperInjectModules.UI).forEach(key => {
                if (key !== '_version') {
                    const value = window.PepperInjectModules.UI[key];
                    // Only bind functions, copy other values directly
                    if (typeof value === 'function') {
                        this[key] = value.bind(this);
                    } else {
                        this[key] = value;
                    }
                }
            });
            console.log("PepperInject: UI module bound");
        }

        // Bind Shell module methods
        if (window.PepperInjectModules?.Shell) {
            Object.keys(window.PepperInjectModules.Shell).forEach(key => {
                if (key !== '_version') {
                    const value = window.PepperInjectModules.Shell[key];
                    // Only bind functions, copy other values directly
                    if (typeof value === 'function') {
                        this[key] = value.bind(this);
                    } else {
                        this[key] = value;
                    }
                }
            });
            console.log("PepperInject: Shell module bound");
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    async init() {
        console.log("PepperInject: init() starting");
        console.log("PepperInject: V('speaker') =", V("speaker"));
        console.log("PepperInject: V('parserBot') =", V("parserBot"));
        console.log("PepperInject: V('session') =", V("session"));
        console.log("PepperInject: V('inputRef') =", V("inputRef"));

        // Wait for modules to load (handles parallel loading)
        await this.waitForModules();
        this.bindModules();

        this.currentSession = V("session") || "default";
        const pageElement = this.generatePage();
        this.injectStyles();
        this.setupUI();

        // Small delay to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, 100));

        this.setupSpeechListeners();
        this.setupInputRefListener();

        if (this.currentSession) {
            this.connectShell(this.currentSession);
        }

        console.log("PepperInject: init() complete");
        return pageElement;
    }

    setupUI() {
        // SpeechPepper buttons
        const sendBtn = document.getElementById('pepperinject-send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('mousedown', () => this.sendContent());
        }

        const processBtn = document.getElementById('pepperinject-process-btn');
        if (processBtn) {
            processBtn.addEventListener('mousedown', () => this.triggerRun());
        }

        const clearBtn = document.getElementById('pepperinject-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('mousedown', () => this.clearHistory());
        }

        const pokeBtn = document.getElementById('pepperinject-poke-btn');
        if (pokeBtn) {
            pokeBtn.addEventListener('mousedown', () => this.sendToShellStdin('.'));
        }

        const clearAllBtn = document.getElementById('pepperinject-clearall-btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('mousedown', () => this.clearAll());
        }

        // Rec button - toggle style (click to start/stop)
        const recBtn = document.getElementById('pepperinject-rec-btn');
        if (recBtn) {
            recBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.isRecording) {
                    this.stopRecording();
                } else {
                    this.startRecording();
                }
            });
        }

        // CodeUI buttons
        const connectBtn = document.getElementById('pepperinject-connect-btn');
        if (connectBtn) {
            connectBtn.addEventListener('mousedown', () => {
                if (this.isConnected) {
                    this.disconnectShell();
                } else if (this.currentSession) {
                    this.connectShell(this.currentSession);
                }
            });
        }

        const shellClearBtn = document.getElementById('pepperinject-shell-clear-btn');
        if (shellClearBtn) {
            shellClearBtn.addEventListener('mousedown', () => this.clearShellMessages());
        }

        const shellSendBtn = document.getElementById('pepperinject-shell-send-btn');
        if (shellSendBtn) {
            shellSendBtn.addEventListener('mousedown', () => this.sendShellInput());
        }

        // Add container button
        const addContainerBtn = document.getElementById('pepperinject-add-container-btn');
        if (addContainerBtn) {
            addContainerBtn.addEventListener('click', () => {
                this.createInputContainer();
            });
        }

        // Create initial input container
        this.createInputContainer();

        // Revision textarea edit sync with debounced Firebase update
        const revisionTextarea = document.getElementById('pepperinject-revision-label');
        if (revisionTextarea) {
            revisionTextarea.addEventListener('input', () => {
                const newValue = revisionTextarea.value;
                this.currentRevisionValue = newValue;

                // Debounce Firebase updates (300ms)
                if (this.revisionDebounceTimer) {
                    clearTimeout(this.revisionDebounceTimer);
                }
                this.revisionDebounceTimer = setTimeout(() => {
                    this.saveRevisionToFirebase(newValue);
                }, 300);
            });
        }

        // Revision reject button - clears revision and restores original input
        const revisionRejectBtn = document.getElementById('pepperinject-revision-reject-btn');
        if (revisionRejectBtn) {
            revisionRejectBtn.addEventListener('mousedown', () => this.clearRevision());
            revisionRejectBtn.addEventListener('mouseover', () => {
                revisionRejectBtn.style.opacity = '1';
            });
            revisionRejectBtn.addEventListener('mouseout', () => {
                revisionRejectBtn.style.opacity = '0.7';
            });
        }

        // Page switching
        window.addEventListener('page-switched', (e) => {
            const page = document.getElementById('pepperinject-page');
            if (!page) return;

            if (e.detail.pageId === 'pepperinject') {
                page.classList.add('active');
            } else {
                page.classList.remove('active');
            }
        });
    }

    // ============================================
    // SPEECHPEPPER FUNCTIONS
    // ============================================

    startRecording() {
        if (this.isRecording) return;

        this.isRecording = true;
        const recBtn = document.getElementById('pepperinject-rec-btn');
        if (recBtn) {
            recBtn.classList.add('active');
        }

        console.log("PepperInject: Recording started");

        // Enable transcript listener if not already active
        if (!this.transcriptListenerActive) {
            this.setupTranscriptListener();
            this.transcriptListenerActive = true;
        }
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;
        const recBtn = document.getElementById('pepperinject-rec-btn');
        if (recBtn) {
            recBtn.classList.remove('active');
        }

        console.log("PepperInject: Recording stopped");

        // Disable transcript listener
        if (this.transcriptRef && this.transcriptListenerActive) {
            this.transcriptRef.off();
            this.transcriptListenerActive = false;

            // Push any remaining buffer to active container before stopping
            if (this.lastBuffer && this.lastBuffer.trim() !== "") {
                this.appendToActiveContainer(this.lastBuffer);
                if (this.historyRef) {
                    this.historyRef.set(this.getAllContainersContent());
                }
                this.lastBuffer = "";
            }
        }
    }

    setupTranscriptListener() {
        const speaker = V("speaker");
        if (!speaker) {
            console.log("PepperInject: No speaker defined for transcript listener");
            return;
        }

        const parserBot = V("parserBot");
        const transcriptPath = `space/${net.spaceId}/vars/${speaker}_buffer`;
        console.log("PepperInject: Setting up transcript listener at:", transcriptPath);
        this.transcriptRef = net.db.ref(transcriptPath);

        const historyPath = `space/${net.spaceId}/vars/${parserBot}/history`;
        this.historyRef = net.db.ref(historyPath);

        // Transcript listener - updates only the active container's transcript line
        this.transcriptRef.on("value", (snapshot) => {
            let data = snapshot.val();
            console.log("PepperInject: Transcript update received:", data);

            // Get the active container's transcript line
            const activeContainerEl = document.getElementById(`pepperinject-container-${this.activeContainerId}`);
            const transcriptLine = activeContainerEl ? activeContainerEl.querySelector('.transcript-line') : null;

            if (data === null || data === "") {
                // Clear the active container's transcript line
                if (transcriptLine) {
                    transcriptLine.textContent = "";
                    transcriptLine.style.color = "#666";
                }
                // Append completed buffer to active container only
                if (this.lastBuffer && this.lastBuffer.trim() !== "") {
                    this.appendToActiveContainer(this.lastBuffer);
                    // Also update Firebase history with all containers content
                    if (this.historyRef) {
                        this.historyRef.set(this.getAllContainersContent());
                    }
                }
                this.lastBuffer = "";
            } else {
                this.lastBuffer = data;
                // Update only the active container's transcript line
                if (transcriptLine) {
                    transcriptLine.textContent = data;
                    transcriptLine.style.color = "#ffcc00";
                    console.log("PepperInject: Updated active container transcript to:", data);
                }
            }
        });
    }

    setupSpeechListeners() {
        // Note: Transcript listener is now controlled by the rec button (walkie-talkie style)
        // This method only sets up the thinking and revision listeners

        const parserBot = V("parserBot");

        console.log("PepperInject: Transcript listener controlled by rec button");

        // Thinking listener
        if (parserBot) {
            const thinkingPath = `space/${net.spaceId}/vars/${parserBot}/thinking`;
            this.thinkingRef = net.db.ref(thinkingPath);

            this.thinkingRef.on("value", (snapshot) => {
                this.isThinking = snapshot.val() === true;
                this.updateProcessButton();
            });

            // Revision listener
            const revisionPath = `space/${net.spaceId}/vars/${parserBot}/currentRevision`;
            this.revisionRef = net.db.ref(revisionPath);

            this.revisionRef.on("value", (snapshot) => {
                this.currentRevisionValue = snapshot.val();
                this.updateRevisionVisibility();
            });
        }
    }

    updateProcessButton() {
        const btn = document.getElementById('pepperinject-process-btn');
        if (!btn) return;

        if (this.isThinking) {
            btn.textContent = "\u23F3";
            btn.style.background = "#ffc107";
            btn.style.color = "#000";
            btn.disabled = true;
        } else if (this.isRunDisabled) {
            btn.textContent = "\u26A1";
            btn.style.background = "#666";
            btn.style.color = "#999";
            btn.disabled = true;
        } else {
            btn.textContent = "\u26A1";
            btn.style.background = "#28a745";
            btn.style.color = "#fff";
            btn.disabled = false;
        }
    }

    updateRevisionVisibility() {
        const area = document.getElementById('pepperinject-revision-area');
        const textarea = document.getElementById('pepperinject-revision-label');
        if (!area || !textarea) return;

        if (this.currentRevisionValue && this.currentRevisionValue.trim() !== "") {
            area.style.display = "flex";
            // Only update if the value is different (to avoid cursor jump during typing)
            if (textarea.value !== this.currentRevisionValue) {
                textarea.value = this.currentRevisionValue;
            }
        } else {
            area.style.display = "none";
            textarea.value = "";
        }
    }

    async saveRevisionToFirebase(value) {
        try {
            const parserBot = V("parserBot");
            if (!parserBot) {
                console.log("PepperInject: No parserBot defined for revision save");
                return;
            }
            const revisionPath = `space/${net.spaceId}/vars/${parserBot}/currentRevision`;
            await net.db.ref(revisionPath).set(value || null);
            console.log("PepperInject: Revision saved to Firebase");
        } catch (e) {
            console.error("PepperInject: Error saving revision", e);
        }
    }

    async triggerRun() {
        if (this.isRunDisabled || this.isThinking) return;

        this.isRunDisabled = true;
        this.updateProcessButton();

        try {
            const runPath = `space/${net.spaceId}/vars/${V("parserBot")}/run`;
            await net.db.ref(runPath).set(true);
            console.log("PepperInject: Run triggered");
        } catch (e) {
            console.error("PepperInject: Error triggering run", e);
        }

        setTimeout(() => {
            this.isRunDisabled = false;
            this.updateProcessButton();
        }, 1000);
    }

    async clearHistory() {
        try {
            // Clear the active container
            if (this.activeContainerId !== null) {
                this.clearContainer(this.activeContainerId);
            }
            this.lastBuffer = "";

            // Update Firebase
            const parserBot = V("parserBot");
            if (parserBot) {
                const historyPath = `space/${net.spaceId}/vars/${parserBot}/history`;
                await net.db.ref(historyPath).set(this.getAllContainersContent() || null);
            }
            console.log("PepperInject: Active container cleared");
        } catch (e) {
            console.error("PepperInject: Error clearing history", e);
        }
    }

    async clearAll() {
        // Clear all containers
        this.inputContainers.forEach(container => {
            this.clearContainer(container.id);
        });
        this.lastBuffer = "";

        // Update Firebase
        try {
            const parserBot = V("parserBot");
            if (parserBot) {
                const historyPath = `space/${net.spaceId}/vars/${parserBot}/history`;
                await net.db.ref(historyPath).set(null);
            }
        } catch (e) {
            console.error("PepperInject: Error clearing all", e);
        }

        await this.clearRevision();
        console.log("PepperInject: All containers cleared");
    }

    async clearRevision() {
        try {
            const revisionPath = `space/${net.spaceId}/vars/${V("parserBot")}/currentRevision`;
            await net.db.ref(revisionPath).set(null);
            console.log("PepperInject: Revision cleared");
        } catch (e) {
            console.error("PepperInject: Error clearing revision", e);
        }
    }

    async sendContent() {
        let textToCopy = "";
        // Read directly from revision textarea to capture manual edits
        const revisionTextarea = document.getElementById('pepperinject-revision-label');
        const revisionValue = revisionTextarea ? revisionTextarea.value : this.currentRevisionValue;

        if (revisionValue && revisionValue.trim() !== "") {
            textToCopy = revisionValue;
        } else {
            // Get concatenated content from all input containers
            textToCopy = this.getAllContainersContent();
        }

        if (!textToCopy || textToCopy.trim() === "") {
            console.log("PepperInject: Nothing to send");
            return;
        }

        const pasteRef = V("pasteRef");
        if (pasteRef) {
            console.log("PepperInject: Sending content to", pasteRef);
            net.db.ref(pasteRef).set(textToCopy);
        }

        // Flash button
        const btn = document.getElementById('pepperinject-send-btn');
        if (btn) {
            btn.style.background = "#28a745";
            setTimeout(() => {
                btn.style.background = "#0051e5";
            }, 300);
        }

        try {
            await navigator.clipboard.writeText(textToCopy);
            console.log("PepperInject: Content copied to clipboard");
        } catch (e) {
            console.log("PepperInject: Clipboard copy failed (expected in VR)");
        }
    }

    // ============================================
    // CLEANUP
    // ============================================

    destroy() {
        console.log("PepperInject: Destroying...");

        // Remove Firebase listeners
        if (this.transcriptRef) this.transcriptRef.off();
        if (this.thinkingRef) this.thinkingRef.off();
        if (this.revisionRef) this.revisionRef.off();
        if (this.historyRef) this.historyRef.off();
        if (this.inputRefRef) this.inputRefRef.off();

        // Guard check - disconnectShell comes from Shell module binding
        if (typeof this.disconnectShell === 'function') {
            this.disconnectShell();
        }

        // Use navigation system to remove
        if (window.navigation && typeof window.navigation.removeDynamicPage === 'function') {
            try {
                window.navigation.removeDynamicPage('pepperinject');
            } catch (e) {
                console.error("PepperInject: Error removing from navigation:", e);
            }
        }

        // Manual cleanup
        if (this.navButton && this.navButton.parentNode) {
            this.navButton.remove();
        }

        const page = document.getElementById('pepperinject-page');
        if (page && page.parentNode) {
            page.remove();
        }

        const styles = document.getElementById('pepperinject-styles');
        if (styles && styles.parentNode) {
            styles.remove();
        }

        console.log("PepperInject: Destroyed");
    }
}

// ============================================
// INITIALIZATION
// ============================================

let pepperInjectInstance = null;
let navButton = null;

let generateNavButton = (pageEl) => {
    navButton = document.createElement("button");
    navButton.classList.add("nav-item");
    navButton.setAttribute("data-page", "pepperinject");
    navButton.innerHTML = `
        <span class="nav-icon">\uD83C\uDFA4</span>
        Pepper
    `;

    const navItems = document.querySelector(".nav-items");
    if (navItems) {
        navItems.appendChild(navButton);
        console.log("PepperInject: Nav button added");
    } else {
        console.error("PepperInject: Could not find .nav-items");
        return;
    }

    navButton.addEventListener("mousedown", () => {
        if (window.navigation && typeof window.navigation.switchPage === 'function') {
            window.navigation.switchPage('pepperinject');
        } else {
            // Fallback
            document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

            const pepperPage = document.getElementById('pepperinject-page');
            if (pepperPage) pepperPage.classList.add('active');
            navButton.classList.add('active');

            window.dispatchEvent(new CustomEvent('page-switched', {
                detail: { pageId: 'pepperinject' }
            }));
        }
    });

    if (window.navigation && pageEl && typeof window.navigation.addDynamicPage === 'function') {
        try {
            window.navigation.addDynamicPage('pepperinject', pageEl, navButton);
        } catch (e) {
            console.error("PepperInject: Failed to register with navigation:", e);
        }
    }

    if (pepperInjectInstance) {
        pepperInjectInstance.navButton = navButton;
    }
};

this.onStart = async () => {
    console.log("PepperInject: Initializing...");
    // Pass component reference for module refresh capability
    pepperInjectInstance = new PepperInject(this._component);
    window.pepperInjectInstance = pepperInjectInstance;

    const pageElement = await pepperInjectInstance.init();
    generateNavButton(pageElement);

    console.log("PepperInject: Ready");
};

this.onDestroy = () => {
    console.log("PepperInject: onDestroy");

    if (pepperInjectInstance) {
        pepperInjectInstance.destroy();
    }

    if (window.pepperInjectInstance) {
        delete window.pepperInjectInstance;
    }

    pepperInjectInstance = null;
    navButton = null;
};
