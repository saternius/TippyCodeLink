// PepperInject.js - Combined Speech + Claude Shell Inspector Panel
// Injects into the inspector as a split-pane application

console.log("PepperInject.js");

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
    constructor() {
        // SpeechPepper State
        this.history = [];
        this.lastBuffer = "";
        this.isThinking = false;
        this.isRunDisabled = false;
        this.currentRevisionValue = null;

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

    async init() {
        console.log("PepperInject: init() starting");
        console.log("PepperInject: V('speaker') =", V("speaker"));
        console.log("PepperInject: V('parserBot') =", V("parserBot"));
        console.log("PepperInject: V('session') =", V("session"));
        console.log("PepperInject: V('inputRef') =", V("inputRef"));

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

    generatePage() {
        // Check if page already exists
        const existingPage = document.getElementById('pepperinject-page');
        if (existingPage) {
            console.log("PepperInject: Page already exists");
            return existingPage;
        }

        const pageElement = document.createElement('div');
        pageElement.id = 'pepperinject-page';
        pageElement.className = 'page';
        this.pageElement = pageElement;

        const speakerName = V("speaker") || "Unknown";
        const parserBot = V("parserBot") || "Parser";
        const pasteRef = V("pasteRef") || "";
        const icon = V("ignoreOthers") ? "👤" : "👥";

        pageElement.innerHTML = `
            <div class="pepperinject-container" style="display: flex; flex-direction: column; height: 100%; width: 100%; background: #1a1a1a;">

                <!-- Header -->
                <div class="pepperinject-header" style="display: flex; justify-content: space-between; align-items: center; background: #242424; padding: 12px 16px; border-bottom: 2px solid #3a3a3a;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 18px;">🎤</span>
                        <span style="color: #fff; font-size: 14px; font-weight: bold;">Pepper Shell</span>
                        <span style="color: #888; font-size: 12px;">${speakerName} ${icon} → ${parserBot}</span>
                    </div>
                    <div id="pepperinject-status" style="display: flex; align-items: center; gap: 8px;">
                        <div id="pepperinject-status-dot" style="width: 10px; height: 10px; border-radius: 50%; background: #666;"></div>
                        <span id="pepperinject-status-text" style="color: #888; font-size: 12px;">Disconnected</span>
                    </div>
                </div>

                <!-- Main Content - Split Pane -->
                <div style="display: flex; flex: 1; min-height: 0; overflow: hidden;">

                    <!-- LEFT PANE: SpeechPepper (40%) -->
                    <div class="pepperinject-left" style="width: 40%; display: flex; flex-direction: row; border-right: 2px solid #3a3a3a; background: #1a1a1a;">

                        <!-- Content Area -->
                        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">

                            <!-- Input History Section -->
                            <div style="display: flex; flex-direction: column; margin: 8px; background: #1a2a1a; border-radius: 6px; border: 1px solid #2d5a2d; max-height: 30%;">
                                <div style="background: #2d5a2d; padding: 6px 10px; border-radius: 6px 6px 0 0;">
                                    <span style="color: #90EE90; font-size: 11px; font-weight: bold;">📝 Input</span>
                                </div>
                                <div id="pepperinject-history" style="flex: 1; overflow-y: auto; padding: 0;">
                                    <textarea id="pepperinject-history-label" placeholder="No input yet..." style="width: 100%; height: 100%; min-height: 60px; background: transparent; border: none; outline: none; resize: none; color: #e0e0e0; font-size: 12px; font-family: inherit; padding: 8px; box-sizing: border-box;"></textarea>
                                </div>
                            </div>

                            <!-- Live Transcript Section -->
                            <div style="display: flex; flex-direction: column; margin: 8px; margin-top: 0; background: #1e1e1e; border-radius: 6px; flex: 1; min-height: 60px; max-height: 25%;">
                                <div style="background: #333; padding: 6px 10px; border-radius: 6px 6px 0 0;">
                                    <span style="color: #fff; font-size: 11px; font-weight: bold;">🎙️ Live</span>
                                </div>
                                <div style="flex: 1; overflow-y: auto; padding: 8px;">
                                    <span id="pepperinject-transcript-label" style="color: #666; font-size: 12px;">Waiting for transcript...</span>
                                </div>
                            </div>

                            <!-- Revision Section -->
                            <div id="pepperinject-revision-area" style="display: none; flex-direction: column; margin: 8px; margin-top: 0; background: #1a1a2e; border-radius: 6px; border: 1px solid #0051e5; flex: 1; min-height: 60px;">
                                <div style="background: #0051e5; padding: 6px 10px; border-radius: 6px 6px 0 0;">
                                    <span style="color: #fff; font-size: 11px; font-weight: bold;">✨ Revision</span>
                                </div>
                                <div style="flex: 1; overflow-y: auto; padding: 8px;">
                                    <span id="pepperinject-revision-label" style="color: #e0e0e0; font-size: 12px;"></span>
                                </div>
                            </div>

                        </div>

                        <!-- Vertical Button Dock (right side) -->
                        <div class="pepperinject-dock">
                            <button id="pepperinject-rec-btn" class="pepperinject-btn-rec" title="Hold to record">🔴</button>
                            <button id="pepperinject-send-btn" class="pepperinject-btn pepperinject-btn-primary" title="Send">📤</button>
                            <button id="pepperinject-process-btn" class="pepperinject-btn pepperinject-btn-success" title="Process">✨</button>
                            <button id="pepperinject-clear-btn" class="pepperinject-btn pepperinject-btn-danger" title="Clear">🗑️</button>
                            <button id="pepperinject-clearall-btn" class="pepperinject-btn pepperinject-btn-darkred" title="Clear All">💥</button>
                        </div>

                    </div>

                    <!-- RIGHT PANE: CodeUI (60%) -->
                    <div class="pepperinject-right" style="width: 60%; display: flex; flex-direction: column; background: #1a1a1a;">

                        <!-- Session Config -->
                        <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #1e1e1e; border-bottom: 1px solid #3a3a3a;">
                            <span id="pepperinject-session-label" style="flex: 1; padding: 6px 10px; background: #0f0f0f; border: 1px solid #3a3a3a; border-radius: 4px; color: #e8e8e8; font-size: 12px;">${this.currentSession || "Session..."}</span>
                            <button id="pepperinject-connect-btn" class="pepperinject-btn" style="padding: 6px 12px;">Connect</button>
                        </div>

                        <!-- Messages Transcript -->
                        <div id="pepperinject-messages" style="flex: 1; overflow-y: auto; padding: 12px; background: #1a1a1a;">
                            <div id="pepperinject-empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; color: #666;">
                                <span style="font-size: 32px; margin-bottom: 12px;">💬</span>
                                <span style="font-size: 12px;">Connect to view Claude shell transcript</span>
                            </div>
                        </div>

                        <!-- Message Count -->
                        <div style="padding: 6px 12px; background: #1e1e1e; border-top: 1px solid #3a3a3a;">
                            <span id="pepperinject-msgcount" style="color: #666; font-size: 11px;"></span>
                        </div>

                        <!-- Input Area -->
                        <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #242424; border-top: 2px solid #3a3a3a;">
                            <span style="color: #888; font-size: 11px; flex-shrink: 0;">Input:</span>
                            <div id="pepperinject-inputref-label" style="flex: 1; padding: 6px 10px; background: #0f0f0f; border: 1px solid #3a3a3a; border-radius: 4px; color: #666; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Waiting for input...</div>
                            <button id="pepperinject-shell-clear-btn" class="pepperinject-btn" style="padding: 6px 10px; font-size: 11px;">Clear</button>
                            <button id="pepperinject-shell-send-btn" class="pepperinject-btn pepperinject-btn-success" style="padding: 6px 10px; font-size: 11px;">Send</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add to page container
        const pageContainer = document.querySelector('.page-container');
        if (pageContainer) {
            pageContainer.appendChild(pageElement);
            console.log("PepperInject: Page added to container");

            // Verify elements exist after adding to DOM
            const transcriptEl = document.getElementById('pepperinject-transcript-label');
            const historyEl = document.getElementById('pepperinject-history-label');
            console.log("PepperInject: After DOM insert - transcript element:", transcriptEl);
            console.log("PepperInject: After DOM insert - history element:", historyEl);
        } else {
            console.error("PepperInject: Could not find .page-container");
        }

        return pageElement;
    }

    injectStyles() {
        if (document.getElementById('pepperinject-styles')) return;

        const styleEl = document.createElement('style');
        styleEl.id = 'pepperinject-styles';
        styleEl.textContent = `
            .pepperinject-btn {
                background: #2a2a2a;
                border: 1px solid #3a3a3a;
                border-radius: 4px;
                padding: 8px 12px;
                color: #e8e8e8;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                transition: all 0.15s;
            }
            .pepperinject-btn:hover {
                background: #333;
                border-color: #555;
            }
            .pepperinject-btn-primary {
                background: #0051e5;
                border-color: #4d8fff;
            }
            .pepperinject-btn-primary:hover {
                background: #003db3;
            }
            .pepperinject-btn-success {
                background: #28a745;
                border-color: #34ce57;
            }
            .pepperinject-btn-success:hover {
                background: #218838;
            }
            .pepperinject-btn-danger {
                background: #dc3545;
                border-color: #e4606d;
            }
            .pepperinject-btn-danger:hover {
                background: #c82333;
            }
            .pepperinject-btn-darkred {
                background: #8b0000;
                border-color: #a52a2a;
            }
            .pepperinject-btn-darkred:hover {
                background: #a00000;
            }
            .pepperinject-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .pepperinject-msg {
                margin-bottom: 16px;
            }
            .pepperinject-msg-header {
                font-size: 10px;
                margin-bottom: 4px;
                font-weight: bold;
            }
            .pepperinject-msg-user .pepperinject-msg-header {
                color: #00d4ff;
            }
            .pepperinject-msg-assistant .pepperinject-msg-header {
                color: #ffaa00;
            }
            .pepperinject-msg-bubble {
                padding: 10px;
                border-radius: 8px;
                font-size: 12px;
                line-height: 1.4;
                word-wrap: break-word;
            }
            .pepperinject-msg-user .pepperinject-msg-bubble {
                background: rgba(0, 212, 255, 0.15);
                border: 1px solid rgba(0, 212, 255, 0.3);
            }
            .pepperinject-msg-assistant .pepperinject-msg-bubble {
                background: #2a2a2a;
                border: 1px solid #3a3a3a;
            }
            .pepperinject-tool-block {
                margin: 8px 0;
                padding: 8px;
                background: #0f0f0f;
                border-radius: 6px;
                border-left: 3px solid #ffaa00;
            }
            .pepperinject-tool-block.result {
                border-left-color: #00ff00;
            }
            .pepperinject-tool-name {
                font-size: 11px;
                font-weight: bold;
                margin-bottom: 4px;
            }
            .pepperinject-tool-content {
                font-size: 10px;
                color: #888;
                white-space: pre-wrap;
                max-height: 100px;
                overflow-y: auto;
            }
            .pepperinject-thinking-block {
                margin: 8px 0;
                padding: 8px;
                background: #1a1a2a;
                border-radius: 6px;
                border-left: 3px solid #8888ff;
                font-style: italic;
                color: #aac;
                font-size: 11px;
            }
            /* Vertical button dock */
            .pepperinject-dock {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                padding: 8px;
                background: #242424;
                border-left: 1px solid #3a3a3a;
                width: 48px;
                flex-shrink: 0;
            }
            .pepperinject-dock .pepperinject-btn {
                width: 36px;
                height: 36px;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
            }
            /* Rec button - walkie-talkie style */
            .pepperinject-btn-rec {
                background: #2a2a2a;
                border: 2px solid #3a3a3a;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.15s;
                user-select: none;
            }
            .pepperinject-btn-rec:hover {
                background: #333;
                border-color: #555;
            }
            .pepperinject-btn-rec.active {
                background: #dc3545;
                border-color: #ff6b7a;
                box-shadow: 0 0 12px rgba(220, 53, 69, 0.6);
                animation: pulse-rec 1s infinite;
            }
            @keyframes pulse-rec {
                0%, 100% { box-shadow: 0 0 12px rgba(220, 53, 69, 0.6); }
                50% { box-shadow: 0 0 20px rgba(220, 53, 69, 0.9); }
            }
        `;
        document.head.appendChild(styleEl);
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

        const clearAllBtn = document.getElementById('pepperinject-clearall-btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('mousedown', () => this.clearAll());
        }

        // Rec button - walkie-talkie style (hold to record)
        const recBtn = document.getElementById('pepperinject-rec-btn');
        if (recBtn) {
            // Pointer down - start recording
            recBtn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this.startRecording();
            });

            // Pointer up - stop recording
            recBtn.addEventListener('pointerup', () => {
                this.stopRecording();
            });

            // Pointer leave - stop recording (handle drag off button)
            recBtn.addEventListener('pointerleave', () => {
                if (this.isRecording) {
                    this.stopRecording();
                }
            });

            // Prevent context menu on long press (mobile)
            recBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
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

            // Push any remaining buffer to history before stopping
            if (this.lastBuffer && this.lastBuffer.trim() !== "") {
                this.history.push("> "+this.lastBuffer);
                this.updateHistoryDisplay();
                if (this.historyRef) {
                    this.historyRef.set(this.history.join("\n"));
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

        // Cache element references
        this.transcriptLabel = document.getElementById('pepperinject-transcript-label');
        this.historyLabel = document.getElementById('pepperinject-history-label');

        // Transcript listener
        this.transcriptRef.on("value", (snapshot) => {
            let data = snapshot.val();
            console.log("PepperInject: Transcript update received:", data);

            // Re-query if cached reference is lost
            if (!this.transcriptLabel) {
                this.transcriptLabel = document.getElementById('pepperinject-transcript-label');
            }

            if (data === null || data === "") {
                if (this.transcriptLabel) {
                    this.transcriptLabel.textContent = "No transcript available";
                    this.transcriptLabel.style.color = "#666";
                }
                if (this.lastBuffer && this.lastBuffer.trim() !== "") {
                    this.history.push("> "+this.lastBuffer);
                    this.updateHistoryDisplay();
                    this.historyRef.set(this.history.join("\n"));
                }
                this.lastBuffer = "";
            } else {
                this.lastBuffer = data;
                if (this.transcriptLabel) {
                    this.transcriptLabel.textContent = data;
                    this.transcriptLabel.style.color = "#fff";
                    console.log("PepperInject: Updated transcript label to:", data);
                } else {
                    console.error("PepperInject: transcriptLabel not found!");
                }
            }
        });
    }

    setupSpeechListeners() {
        // Note: Transcript listener is now controlled by the rec button (walkie-talkie style)
        // This method only sets up the thinking and revision listeners

        const parserBot = V("parserBot");

        // Cache element references for history
        this.historyLabel = document.getElementById('pepperinject-history-label');
        this.transcriptLabel = document.getElementById('pepperinject-transcript-label');

        console.log("PepperInject: History label element:", this.historyLabel);
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

    updateHistoryDisplay() {
        // Re-query if cached reference is lost
        if (!this.historyLabel) {
            this.historyLabel = document.getElementById('pepperinject-history-label');
        }

        if (!this.historyLabel) {
            console.error("PepperInject: historyLabel not found!");
            return;
        }

        console.log("PepperInject: Updating history display, items:", this.history.length);

        if (this.history.length > 0) {
            this.historyLabel.value = this.history.join("\n");
        } else {
            this.historyLabel.value = "";
        }
    }

    updateProcessButton() {
        const btn = document.getElementById('pepperinject-process-btn');
        if (!btn) return;

        if (this.isThinking) {
            btn.textContent = "⏳";
            btn.style.background = "#ffc107";
            btn.style.color = "#000";
            btn.disabled = true;
        } else if (this.isRunDisabled) {
            btn.textContent = "Process";
            btn.style.background = "#666";
            btn.style.color = "#999";
            btn.disabled = true;
        } else {
            btn.textContent = "Process";
            btn.style.background = "#28a745";
            btn.style.color = "#fff";
            btn.disabled = false;
        }
    }

    updateRevisionVisibility() {
        const area = document.getElementById('pepperinject-revision-area');
        const label = document.getElementById('pepperinject-revision-label');
        if (!area || !label) return;

        if (this.currentRevisionValue && this.currentRevisionValue.trim() !== "") {
            area.style.display = "flex";
            label.textContent = this.currentRevisionValue;
        } else {
            area.style.display = "none";
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
            const parserBot = V("parserBot");
            if (parserBot) {
                const historyPath = `space/${net.spaceId}/vars/${parserBot}/history`;
                await net.db.ref(historyPath).set(null);
            }
            this.history = [];
            this.lastBuffer = "";
            this.updateHistoryDisplay();
            console.log("PepperInject: History cleared");
        } catch (e) {
            console.error("PepperInject: Error clearing history", e);
        }
    }

    async clearAll() {
        await this.clearHistory();
        await this.clearRevision();
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
        if (this.currentRevisionValue && this.currentRevisionValue.trim() !== "") {
            textToCopy = this.currentRevisionValue;
        } else {
            // Read directly from textarea to capture manual edits
            const historyTextarea = document.getElementById('pepperinject-history-label');
            textToCopy = historyTextarea ? historyTextarea.value : this.history.join("\n");
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
    // CODEUI FUNCTIONS
    // ============================================

    setupInputRefListener() {
        const inputRefPath = V("inputRef");
        if (!inputRefPath) {
            console.log("PepperInject: No inputRef defined");
            return;
        }

        this.inputRefRef = net.db.ref(inputRefPath);
        let isFirstValue = true;

        this.inputRefRef.on("value", (snapshot) => {
            const value = snapshot.val();
            const label = document.getElementById('pepperinject-inputref-label');

            if (isFirstValue) {
                isFirstValue = false;
                if (label) {
                    if (value === null || value === "") {
                        label.textContent = "Waiting for input...";
                        label.style.color = "#666";
                    } else {
                        label.textContent = value;
                        label.style.color = "#e8e8e8";
                    }
                }
                return;
            }

            if (value === null || value === "") {
                if (label) {
                    label.textContent = "Waiting for input...";
                    label.style.color = "#666";
                }
            } else {
                if (label) {
                    label.textContent = value;
                    label.style.color = "#e8e8e8";
                }
                this.flashInputRow();
                if (this.isConnected && this.stdinRef) {
                    this.sendToShellStdin(value);
                }
            }
        });
    }

    flashInputRow() {
        const label = document.getElementById('pepperinject-inputref-label');
        if (label) {
            label.style.borderColor = "#00ff00";
            setTimeout(() => {
                label.style.borderColor = "#3a3a3a";
            }, 300);
        }
    }

    connectShell(sessionName) {
        if (this.isConnected) {
            this.disconnectShell();
        }

        this.currentSession = sessionName;
        console.log("PepperInject: Connecting to shell:", sessionName);

        const sessionLabel = document.getElementById('pepperinject-session-label');
        if (sessionLabel) {
            sessionLabel.textContent = sessionName;
            sessionLabel.style.color = "#e8e8e8";
        }

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
                this.updateShellStatus(meta.status || 'unknown');
            } else {
                this.updateShellStatus('not_found');
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
                this.checkForClearCommand(data);
            }
        });

        this.shellRef.on('child_changed', (snapshot) => {
            const key = snapshot.key;
            if (key === 'meta' || key === 'stdin') return;

            const data = snapshot.val();
            if (data && data.role) {
                this.messages.set(key, data);
                this.renderMessages();
                this.checkForClearCommand(data);
            }
        });

        this.isConnected = true;
        this.updateConnectButton();
    }

    disconnectShell() {
        console.log("PepperInject: Disconnecting shell...");

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

        this.updateShellStatus('disconnected');
        this.updateConnectButton();
        this.clearMessagesUI();
        this.showEmptyState();

        const msgCount = document.getElementById('pepperinject-msgcount');
        if (msgCount) msgCount.textContent = "";
    }

    updateShellStatus(status) {
        const dot = document.getElementById('pepperinject-status-dot');
        const text = document.getElementById('pepperinject-status-text');

        const colors = {
            'running': '#00ff00',
            'completed': '#00d4ff',
            'error': '#ff4444',
            'interrupted': '#ffaa00',
            'not_found': '#666',
            'disconnected': '#666'
        };

        const labels = {
            'running': 'Running',
            'completed': 'Completed',
            'error': 'Error',
            'interrupted': 'Interrupted',
            'not_found': 'Not Found',
            'disconnected': 'Disconnected',
            'unknown': 'Unknown'
        };

        if (dot) dot.style.background = colors[status] || '#666';
        if (text) text.textContent = labels[status] || status;
    }

    updateConnectButton() {
        const btn = document.getElementById('pepperinject-connect-btn');
        if (!btn) return;

        if (this.isConnected) {
            btn.textContent = "Disconnect";
            btn.style.background = "rgba(0, 212, 255, 0.15)";
            btn.style.borderColor = "#00d4ff";
            btn.style.color = "#00d4ff";
        } else {
            btn.textContent = "Connect";
            btn.style.background = "#2a2a2a";
            btn.style.borderColor = "#3a3a3a";
            btn.style.color = "#e8e8e8";
        }
    }

    sendToShellStdin(text) {
        if (!text || !this.stdinRef) return;

        this.stdinRef.child(String(this.stdinIndex)).set(text)
            .then(() => {
                this.stdinIndex++;
                console.log("PepperInject: Sent to stdin:", text);
            })
            .catch(err => {
                console.error("PepperInject: Failed to send stdin:", err);
            });
    }

    sendShellInput() {
        const label = document.getElementById('pepperinject-inputref-label');
        const currentText = label?.textContent;
        if (this.isConnected && this.stdinRef && currentText && currentText !== "Waiting for input...") {
            this.sendToShellStdin(currentText);
            label.style.color = "#444";
        }
    }

    clearShellMessages() {
        if (!this.isConnected || !this.shellRef) return;

        this.sendToShellStdin("/clear");

        this.shellRef.once('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const updates = {};
                for (const key of Object.keys(data)) {
                    if (key !== 'meta' && key !== 'stdin') {
                        updates[key] = null;
                    }
                }
                this.shellRef.update(updates)
                    .then(() => {
                        console.log("PepperInject: Cleared shell messages");
                        this.messages.clear();
                        this.clearMessagesUI();
                        this.showEmptyState();
                        const msgCount = document.getElementById('pepperinject-msgcount');
                        if (msgCount) msgCount.textContent = "";
                    })
                    .catch(err => console.error("PepperInject: Clear failed:", err));
            }
        });
    }

    checkForClearCommand(data) {
        if (data.role !== 'user') return;

        const clearString = "<command-name>/clear</command-name>";
        const content = data.content;
        let hasCommand = false;

        if (typeof content === 'string' && content.includes(clearString)) {
            hasCommand = true;
        } else if (Array.isArray(content)) {
            for (const item of content) {
                if (typeof item === 'string' && item.includes(clearString)) {
                    hasCommand = true;
                    break;
                } else if (typeof item === 'object' && item.text && item.text.includes(clearString)) {
                    hasCommand = true;
                    break;
                }
            }
        }

        if (hasCommand) {
            setTimeout(() => {
                if (!this.shellRef) return;
                this.shellRef.once('value', (snapshot) => {
                    const fbData = snapshot.val();
                    if (fbData) {
                        const updates = {};
                        for (const key of Object.keys(fbData)) {
                            if (key !== 'meta' && key !== 'stdin') {
                                updates[key] = null;
                            }
                        }
                        this.shellRef.update(updates)
                            .then(() => {
                                this.messages.clear();
                                this.clearMessagesUI();
                                this.showEmptyState();
                            });
                    }
                });
            }, 200);
        }
    }

    clearMessagesUI() {
        const container = document.getElementById('pepperinject-messages');
        if (container) {
            container.innerHTML = "";
        }
    }

    showEmptyState() {
        const container = document.getElementById('pepperinject-messages');
        if (container) {
            container.innerHTML = `
                <div id="pepperinject-empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; color: #666;">
                    <span style="font-size: 32px; margin-bottom: 12px;">💬</span>
                    <span style="font-size: 12px;">Connect to view Claude shell transcript</span>
                </div>
            `;
        }
    }

    renderMessages() {
        const container = document.getElementById('pepperinject-messages');
        if (!container) return;

        container.innerHTML = "";

        const sortedEntries = [...this.messages.entries()].sort((a, b) => a[0].localeCompare(b[0]));

        for (const [ts, msg] of sortedEntries) {
            const msgEl = this.createMessageElement(msg.role, msg.content);
            container.appendChild(msgEl);
        }

        const msgCount = document.getElementById('pepperinject-msgcount');
        if (msgCount) {
            msgCount.textContent = `${this.messages.size} messages`;
        }

        // Auto scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    createMessageElement(role, content) {
        const wrapper = document.createElement('div');
        wrapper.className = `pepperinject-msg pepperinject-msg-${role}`;

        const header = document.createElement('div');
        header.className = 'pepperinject-msg-header';
        header.textContent = role.toUpperCase();
        wrapper.appendChild(header);

        const bubble = document.createElement('div');
        bubble.className = 'pepperinject-msg-bubble';

        if (Array.isArray(content)) {
            for (const item of content) {
                const el = this.renderContentItem(item);
                bubble.appendChild(el);
            }
        } else if (typeof content === 'string') {
            bubble.textContent = content;
        }

        wrapper.appendChild(bubble);
        return wrapper;
    }

    renderContentItem(item) {
        if (typeof item === 'string') {
            const span = document.createElement('span');
            span.textContent = item;
            return span;
        }

        if (typeof item === 'object' && item !== null) {
            if (item.type === 'text' || item.text) {
                const span = document.createElement('span');
                span.textContent = item.text || '';
                return span;
            }

            if (item.type === 'tool_use') {
                return this.renderToolBlock('tool_use', item.name, item.input);
            }

            if (item.type === 'tool_result') {
                return this.renderToolBlock('tool_result', 'Result', item.content);
            }

            if (item.type === 'thinking' || item.thinking) {
                return this.renderThinkingBlock(item.thinking || item.text || '');
            }

            const span = document.createElement('span');
            span.textContent = JSON.stringify(item, null, 2);
            span.style.color = "#888";
            span.style.fontSize = "10px";
            return span;
        }

        const span = document.createElement('span');
        span.textContent = String(item);
        return span;
    }

    renderToolBlock(type, name, data) {
        const block = document.createElement('div');
        block.className = `pepperinject-tool-block ${type === 'tool_result' ? 'result' : ''}`;

        const nameEl = document.createElement('div');
        nameEl.className = 'pepperinject-tool-name';
        nameEl.style.color = type === 'tool_result' ? '#00ff00' : '#ffaa00';
        nameEl.textContent = name;
        block.appendChild(nameEl);

        const contentEl = document.createElement('div');
        contentEl.className = 'pepperinject-tool-content';
        contentEl.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        block.appendChild(contentEl);

        return block;
    }

    renderThinkingBlock(content) {
        const block = document.createElement('div');
        block.className = 'pepperinject-thinking-block';
        block.textContent = content;
        return block;
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

        this.disconnectShell();

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
        <span class="nav-icon">🎤</span>
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
    pepperInjectInstance = new PepperInject();

    const pageElement = await pepperInjectInstance.init();
    generateNavButton(pageElement);

    window.pepperInjectInstance = pepperInjectInstance;
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
