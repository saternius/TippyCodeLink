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
                        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; overflow-y: auto;">

                            <!-- Input Containers Wrapper -->
                            <div id="pepperinject-containers-wrapper" style="display: flex; flex-direction: column; gap: 4px; margin: 8px;">
                                <!-- Input containers will be dynamically added here -->
                            </div>

                            <!-- Add Container Button -->
                            <div style="margin: 0 8px 8px 8px;">
                                <button id="pepperinject-add-container-btn" style="width: 100%; padding: 8px; background: #1a2a1a; border: 1px dashed #2d5a2d; border-radius: 6px; color: #90EE90; font-size: 16px; cursor: pointer; transition: all 0.15s; opacity: 0.6;" title="Add new input container">+</button>
                            </div>

                            <!-- Revision Section -->
                            <div id="pepperinject-revision-area" style="display: none; flex-direction: column; margin: 8px; margin-top: 0; background: #1a1a2e; border-radius: 6px; border: 1px solid #0051e5; flex: 1; min-height: 60px;">
                                <div style="background: #0051e5; padding: 6px 10px; border-radius: 6px 6px 0 0; display: flex; justify-content: space-between; align-items: center;">
                                    <span style="color: #fff; font-size: 11px; font-weight: bold;">✨ Revision</span>
                                    <button id="pepperinject-revision-reject-btn" style="background: transparent; border: none; color: #fff; font-size: 14px; cursor: pointer; padding: 0 4px; opacity: 0.7; transition: opacity 0.15s;" title="Reject revision">✕</button>
                                </div>
                                <div style="flex: 1; overflow-y: auto; padding: 0;">
                                    <textarea id="pepperinject-revision-label" style="width: 100%; height: 100%; min-height: 60px; background: transparent; border: none; outline: none; resize: none; color: #e0e0e0; font-size: 12px; font-family: inherit; padding: 8px; box-sizing: border-box;"></textarea>
                                </div>
                            </div>

                        </div>

                        <!-- Vertical Button Dock (right side) -->
                        <div class="pepperinject-dock">
                            <button id="pepperinject-rec-btn" class="pepperinject-btn-rec" title="Hold to record">🔴</button>
                            <button id="pepperinject-send-btn" class="pepperinject-btn pepperinject-btn-primary" title="Send">📤</button>
                            <button id="pepperinject-process-btn" class="pepperinject-btn pepperinject-btn-success" title="Process">⚡</button>
                            <button id="pepperinject-poke-btn" class="pepperinject-btn" title="Poke (send enter)">👉</button>
                            <button style="display:none" id="pepperinject-clear-btn" class="pepperinject-btn pepperinject-btn-danger" title="Clear">🗑️</button>
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
                            <textarea id="pepperinject-inputref-label" placeholder="Waiting for input..." style="flex: 1; padding: 6px 10px; background: #0f0f0f; border: 1px solid #3a3a3a; border-radius: 4px; color: #666; font-size: 11px; font-family: inherit; resize: none; outline: none; min-height: 24px; overflow-y: auto;"></textarea>
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
            /* Remove nested container appearance for special blocks */
            .pepperinject-msg-bubble > .pepperinject-thinking-block,
            .pepperinject-msg-bubble > .pepperinject-tool-block,
            .pepperinject-msg-bubble > .pepperinject-ask-container,
            .pepperinject-msg-bubble > .pepperinject-edit-container {
                margin-left: -10px;
                margin-right: -10px;
                padding-left: 18px;
                padding-right: 18px;
            }
            .pepperinject-msg-bubble > .pepperinject-thinking-block:first-child,
            .pepperinject-msg-bubble > .pepperinject-tool-block:first-child,
            .pepperinject-msg-bubble > .pepperinject-ask-container:first-child,
            .pepperinject-msg-bubble > .pepperinject-edit-container:first-child {
                margin-top: -10px;
                padding-top: 10px;
                border-radius: 8px 8px 6px 6px;
            }
            .pepperinject-msg-bubble > .pepperinject-thinking-block:last-child,
            .pepperinject-msg-bubble > .pepperinject-tool-block:last-child,
            .pepperinject-msg-bubble > .pepperinject-ask-container:last-child,
            .pepperinject-msg-bubble > .pepperinject-edit-container:last-child {
                margin-bottom: -10px;
                padding-bottom: 10px;
                border-radius: 6px 6px 8px 8px;
            }
            .pepperinject-msg-bubble > .pepperinject-thinking-block:only-child,
            .pepperinject-msg-bubble > .pepperinject-tool-block:only-child,
            .pepperinject-msg-bubble > .pepperinject-ask-container:only-child,
            .pepperinject-msg-bubble > .pepperinject-edit-container:only-child {
                margin: -10px;
                padding: 10px 18px;
                border-radius: 8px;
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
            /* Input container styles */
            .pepperinject-input-container {
                background: #1a2a1a;
                border-radius: 6px;
                border: 2px solid #2d5a2d;
                transition: all 0.15s;
                cursor: pointer;
            }
            .pepperinject-input-container:hover {
                border-color: #3d6a3d;
            }
            .pepperinject-input-container.active {
                border-color: #90EE90;
                box-shadow: 0 0 8px rgba(144, 238, 144, 0.3);
            }
            .pepperinject-input-container .header {
                background: #2d5a2d;
                padding: 6px 10px;
                border-radius: 4px 4px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .pepperinject-input-container.active .header {
                background: #3d7a3d;
            }
            .pepperinject-add-container-btn:hover {
                opacity: 1 !important;
                background: #2a3a2a !important;
                border-style: solid !important;
            }
            /* Save/Load button styles */
            .pepperinject-save-btn,
            .pepperinject-load-btn {
                background: transparent;
                border: none;
                color: #90EE90;
                font-size: 12px;
                cursor: pointer;
                padding: 0 4px;
                opacity: 0.7;
                transition: opacity 0.15s;
            }
            .pepperinject-save-btn:hover,
            .pepperinject-load-btn:hover {
                opacity: 1;
            }
            .pepperinject-save-btn.saved {
                color: #00ff00;
                opacity: 1;
            }
            /* Load dropdown styles */
            .pepperinject-load-dropdown {
                position: absolute;
                top: 100%;
                right: 0;
                min-width: 200px;
                max-width: 300px;
                max-height: 250px;
                overflow-y: auto;
                background: #2a2a2a;
                border: 1px solid #4a4a4a;
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                z-index: 1000;
                margin-top: 4px;
            }
            .pepperinject-load-dropdown-header {
                padding: 8px 12px;
                background: #333;
                border-bottom: 1px solid #4a4a4a;
                color: #888;
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
            }
            .pepperinject-load-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid #333;
                transition: background 0.15s;
            }
            .pepperinject-load-item:hover {
                background: #3a3a3a;
            }
            .pepperinject-load-item:last-child {
                border-bottom: none;
            }
            .pepperinject-load-item-title {
                color: #90EE90;
                font-size: 12px;
                font-weight: 600;
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .pepperinject-load-item-preview {
                color: #666;
                font-size: 10px;
                margin-top: 2px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 180px;
            }
            .pepperinject-load-item-delete {
                background: transparent;
                border: none;
                color: #ff6b6b;
                font-size: 12px;
                cursor: pointer;
                padding: 2px 6px;
                opacity: 0.6;
                transition: opacity 0.15s;
                margin-left: 8px;
            }
            .pepperinject-load-item-delete:hover {
                opacity: 1;
            }
            .pepperinject-load-empty {
                padding: 16px 12px;
                color: #666;
                font-size: 11px;
                text-align: center;
                font-style: italic;
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
            /* AskUserQuestion styles */
            .pepperinject-ask-container {
                margin: 12px 0;
                padding: 12px;
                background: #1a2a3a;
                border-radius: 8px;
                border: 1px solid #2a4a6a;
            }
            .pepperinject-question {
                margin-bottom: 12px;
            }
            .pepperinject-question:last-child {
                margin-bottom: 0;
            }
            .pepperinject-question-header {
                color: #e0e0e0;
                font-size: 13px;
                margin-bottom: 10px;
            }
            .pepperinject-question-tag {
                background: #0051e5;
                color: #fff;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: bold;
                margin-right: 8px;
            }
            .pepperinject-options {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .pepperinject-option-btn {
                background: #2a3a4a;
                border: 1px solid #3a5a7a;
                border-radius: 6px;
                padding: 10px 16px;
                cursor: pointer;
                transition: all 0.15s;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                min-width: 120px;
            }
            .pepperinject-option-btn:hover {
                background: #3a4a5a;
                border-color: #5a8aba;
                transform: translateY(-1px);
            }
            .pepperinject-option-btn:active {
                transform: translateY(0);
                background: #0051e5;
            }
            .pepperinject-option-num {
                background: #0051e5;
                color: #fff;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                font-weight: bold;
                margin-bottom: 6px;
            }
            .pepperinject-option-label {
                color: #fff;
                font-size: 13px;
                font-weight: 600;
            }
            .pepperinject-option-desc {
                color: #888;
                font-size: 10px;
                margin-top: 4px;
            }
            /* Edit confirmation styles */
            .pepperinject-edit-container {
                margin: 12px 0;
                padding: 12px;
                background: #1a2a1a;
                border-radius: 8px;
                border: 1px solid #2d5a2d;
            }
            .pepperinject-edit-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 10px;
            }
            .pepperinject-edit-icon {
                font-size: 16px;
            }
            .pepperinject-edit-title {
                color: #90EE90;
                font-size: 12px;
                font-weight: 600;
            }
            .pepperinject-edit-file {
                color: #e0e0e0;
                font-size: 11px;
                background: #0f0f0f;
                padding: 4px 8px;
                border-radius: 4px;
                font-family: monospace;
                margin-left: auto;
            }
            .pepperinject-edit-diff {
                background: #0f0f0f;
                border-radius: 6px;
                padding: 8px;
                margin-bottom: 12px;
                max-height: 150px;
                overflow-y: auto;
                font-family: monospace;
                font-size: 10px;
                line-height: 1.4;
            }
            .pepperinject-diff-old {
                color: #ff6b6b;
                background: rgba(255, 107, 107, 0.1);
                display: block;
                padding: 2px 4px;
            }
            .pepperinject-diff-new {
                color: #90EE90;
                background: rgba(144, 238, 144, 0.1);
                display: block;
                padding: 2px 4px;
            }
            .pepperinject-edit-options {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .pepperinject-edit-btn {
                background: #2a3a2a;
                border: 1px solid #3a5a3a;
                border-radius: 6px;
                padding: 10px 16px;
                cursor: pointer;
                transition: all 0.15s;
                display: flex;
                align-items: center;
                gap: 12px;
                text-align: left;
            }
            .pepperinject-edit-btn:hover {
                background: #3a4a3a;
                border-color: #5a8a5a;
            }
            .pepperinject-edit-btn:active {
                background: #28a745;
            }
            .pepperinject-edit-btn-num {
                background: #28a745;
                color: #fff;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: bold;
                flex-shrink: 0;
            }
            .pepperinject-edit-btn-text {
                color: #e0e0e0;
                font-size: 12px;
            }
            .pepperinject-edit-input-row {
                display: flex;
                align-items: center;
                gap: 8px;
                background: #2a3a2a;
                border: 1px solid #3a5a3a;
                border-radius: 6px;
                padding: 8px 12px;
            }
            .pepperinject-edit-input {
                flex: 1;
                background: #0f0f0f;
                border: 1px solid #3a3a3a;
                border-radius: 4px;
                padding: 8px;
                color: #e0e0e0;
                font-size: 12px;
                font-family: inherit;
                outline: none;
            }
            .pepperinject-edit-input:focus {
                border-color: #28a745;
            }
            .pepperinject-edit-input-send {
                background: #28a745;
                border: none;
                border-radius: 4px;
                padding: 8px 12px;
                color: #fff;
                font-size: 12px;
                cursor: pointer;
                transition: background 0.15s;
            }
            .pepperinject-edit-input-send:hover {
                background: #218838;
            }
            /* Drag handle styles */
            .pepperinject-input-container .drag-handle {
                position: absolute;
                left: 50%;
                transform: translateX(-50%);
                cursor: grab;
                color: #90EE90;
                font-size: 14px;
                letter-spacing: -2px;
                padding: 2px 12px;
                opacity: 0.5;
                transition: opacity 0.15s, background 0.15s;
                border-radius: 4px;
                user-select: none;
            }
            .pepperinject-input-container .drag-handle:hover {
                opacity: 1;
                background: rgba(144, 238, 144, 0.15);
            }
            .pepperinject-input-container .drag-handle:active {
                cursor: grabbing;
            }
            /* Drag states */
            .pepperinject-input-container.dragging {
                opacity: 0.5;
                transform: scale(0.98);
            }
            .pepperinject-input-container.drag-over-before {
                border-top: 3px solid #00ff00 !important;
                margin-top: 1px;
            }
            .pepperinject-input-container.drag-over-after {
                border-bottom: 3px solid #00ff00 !important;
                margin-bottom: 1px;
            }
            .pepperinject-drop-indicator {
                height: 4px;
                background: linear-gradient(90deg, transparent, #00ff00, transparent);
                border-radius: 2px;
                margin: 2px 0;
                animation: pulse-drop 0.8s infinite;
            }
            @keyframes pulse-drop {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
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

    autoResizeTextarea(textarea) {
        if (!textarea) return;
        // Reset height to auto to get accurate scrollHeight
        textarea.style.height = 'auto';
        // Set height to scrollHeight, with min-height enforced by CSS
        textarea.style.height = textarea.scrollHeight + 'px';
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
            btn.textContent = "⚡";
            btn.style.background = "#666";
            btn.style.color = "#999";
            btn.disabled = true;
        } else {
            btn.textContent = "⚡";
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

    // ============================================
    // MULTI-INPUT CONTAINER MANAGEMENT
    // ============================================

    createInputContainer(id = null) {
        if (id === null) {
            id = this.containerIdCounter++;
        }

        const container = {
            id: id,
            title: `📝 Input ${id + 1}`,
            content: "",
            enabled: true
        };
        this.inputContainers.push(container);

        const wrapper = document.getElementById('pepperinject-containers-wrapper');
        if (!wrapper) return container;

        const containerEl = document.createElement('div');
        containerEl.className = 'pepperinject-input-container';
        containerEl.id = `pepperinject-container-${id}`;
        containerEl.innerHTML = `
            <div class="header" style="position: relative;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="toggle-btn" style="width: 18px; height: 18px; border-radius: 3px; border: 2px solid #90EE90; background: #90EE90; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #1a2a1a; font-weight: bold; transition: all 0.15s;" title="Toggle include in output">✓</button>
                    <span class="title" contenteditable="true" style="color: #90EE90; font-size: 11px; font-weight: bold; outline: none; min-width: 40px;" title="Click to rename">${container.title}</span>
                </div>
                <div class="drag-handle" draggable="true" title="Drag to reorder">⋮⋮</div>
                <div style="display: flex; gap: 4px; align-items: center;">
                    <button class="save-btn pepperinject-save-btn" title="Save to storage">💾</button>
                    <button class="load-btn pepperinject-load-btn" title="Load from storage">📂</button>
                    <button class="clear-btn" style="background: transparent; border: none; color: #90EE90; font-size: 12px; cursor: pointer; padding: 0 4px; opacity: 0.7; transition: opacity 0.15s;" title="Clear input">🗑️</button>
                    <button class="delete-btn" style="background: transparent; border: none; color: #90EE90; font-size: 12px; cursor: pointer; padding: 0 4px; opacity: 0.7; transition: opacity 0.15s;" title="Delete container">✕</button>
                </div>
            </div>
            <div class="content" style="padding: 0; display: flex; flex-direction: column;">
                <textarea class="input-textarea" placeholder="No input yet..." style="width: 100%; min-height: 60px; background: transparent; border: none; outline: none; resize: none; overflow: hidden; color: #e0e0e0; font-size: 12px; font-family: inherit; padding: 8px; box-sizing: border-box;"></textarea>
                <div class="transcript-line" style="color: #666; font-size: 12px; padding: 8px; border-top: 1px solid #2d5a2d; min-height: 20px;"></div>
            </div>
        `;

        // Click to activate
        containerEl.addEventListener('click', (e) => {
            // Don't activate when clicking on interactive elements
            if (e.target.tagName === 'BUTTON' || e.target.contentEditable === 'true' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            this.setActiveContainer(id);
        });

        // Also activate when focusing textarea
        const textarea = containerEl.querySelector('.input-textarea');
        textarea.addEventListener('focus', () => {
            this.setActiveContainer(id);
        });

        // Sync textarea changes to container state
        textarea.addEventListener('input', () => {
            const containerData = this.inputContainers.find(c => c.id === id);
            if (containerData) {
                containerData.content = textarea.value;
            }
            this.autoResizeTextarea(textarea);
        });

        // Title edit sync
        const titleEl = containerEl.querySelector('.title');
        titleEl.addEventListener('input', () => {
            const containerData = this.inputContainers.find(c => c.id === id);
            if (containerData) {
                containerData.title = titleEl.textContent;
            }
        });
        titleEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setActiveContainer(id);
        });

        // Clear button
        const clearBtn = containerEl.querySelector('.clear-btn');
        clearBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.clearContainer(id);
        });
        clearBtn.addEventListener('mouseover', () => clearBtn.style.opacity = '1');
        clearBtn.addEventListener('mouseout', () => clearBtn.style.opacity = '0.7');

        // Delete button
        const deleteBtn = containerEl.querySelector('.delete-btn');
        deleteBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.removeContainer(id);
        });
        deleteBtn.addEventListener('mouseover', () => deleteBtn.style.opacity = '1');
        deleteBtn.addEventListener('mouseout', () => deleteBtn.style.opacity = '0.7');

        // Toggle button
        const toggleBtn = containerEl.querySelector('.toggle-btn');
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleContainer(id);
        });

        // Save button
        const saveBtn = containerEl.querySelector('.save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.saveContainer(id);
            });
            saveBtn.addEventListener('mouseover', () => saveBtn.style.opacity = '1');
            saveBtn.addEventListener('mouseout', () => {
                if (!saveBtn.classList.contains('saved')) {
                    saveBtn.style.opacity = '0.7';
                }
            });
        }

        // Load button
        const loadBtn = containerEl.querySelector('.load-btn');
        if (loadBtn) {
            loadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showLoadDropdown(id, loadBtn);
            });
            loadBtn.addEventListener('mouseover', () => loadBtn.style.opacity = '1');
            loadBtn.addEventListener('mouseout', () => loadBtn.style.opacity = '0.7');
        }

        // Drag handle events
        const dragHandle = containerEl.querySelector('.drag-handle');
        if (dragHandle) {
            dragHandle.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                this.draggedContainerId = id;
                containerEl.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id.toString());
            });

            dragHandle.addEventListener('dragend', (e) => {
                e.stopPropagation();
                containerEl.classList.remove('dragging');
                this.clearDragOverStates();
                this.draggedContainerId = null;
                this.dragOverContainerId = null;
                this.dragInsertPosition = null;
            });
        }

        // Container drag over/drop events
        containerEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (this.draggedContainerId === null || this.draggedContainerId === id) return;

            e.dataTransfer.dropEffect = 'move';

            // Determine if dropping before or after based on mouse position
            const rect = containerEl.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const position = e.clientY < midY ? 'before' : 'after';

            // Update visual state
            if (this.dragOverContainerId !== id || this.dragInsertPosition !== position) {
                this.clearDragOverStates();
                this.dragOverContainerId = id;
                this.dragInsertPosition = position;

                if (position === 'before') {
                    containerEl.classList.add('drag-over-before');
                } else {
                    containerEl.classList.add('drag-over-after');
                }
            }
        });

        containerEl.addEventListener('dragleave', (e) => {
            // Only clear if leaving the container entirely
            if (!containerEl.contains(e.relatedTarget)) {
                containerEl.classList.remove('drag-over-before', 'drag-over-after');
                if (this.dragOverContainerId === id) {
                    this.dragOverContainerId = null;
                    this.dragInsertPosition = null;
                }
            }
        });

        containerEl.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (this.draggedContainerId === null || this.draggedContainerId === id) return;

            this.reorderContainer(this.draggedContainerId, id, this.dragInsertPosition);
            this.clearDragOverStates();
        });

        wrapper.appendChild(containerEl);

        // Set as active if it's the first container
        if (this.inputContainers.length === 1) {
            this.setActiveContainer(id);
        }

        return container;
    }

    setActiveContainer(id) {
        this.activeContainerId = id;

        // Update visual states
        document.querySelectorAll('.pepperinject-input-container').forEach(el => {
            el.classList.remove('active');
        });

        const activeEl = document.getElementById(`pepperinject-container-${id}`);
        if (activeEl) {
            activeEl.classList.add('active');
        }

        console.log("PepperInject: Active container set to", id);
    }

    getActiveContainer() {
        return this.inputContainers.find(c => c.id === this.activeContainerId);
    }

    clearContainer(id) {
        const containerData = this.inputContainers.find(c => c.id === id);
        if (containerData) {
            containerData.content = "";
        }

        const containerEl = document.getElementById(`pepperinject-container-${id}`);
        if (containerEl) {
            const textarea = containerEl.querySelector('.input-textarea');
            if (textarea) {
                textarea.value = "";
                this.autoResizeTextarea(textarea);
            }
            // Also clear the transcript line
            const transcriptLine = containerEl.querySelector('.transcript-line');
            if (transcriptLine) {
                transcriptLine.textContent = "";
                transcriptLine.style.color = "#666";
            }
        }

        console.log("PepperInject: Container", id, "cleared");
    }

    toggleContainer(id) {
        const containerData = this.inputContainers.find(c => c.id === id);
        if (!containerData) return;

        containerData.enabled = !containerData.enabled;

        const containerEl = document.getElementById(`pepperinject-container-${id}`);
        if (containerEl) {
            const toggleBtn = containerEl.querySelector('.toggle-btn');
            const content = containerEl.querySelector('.content');

            if (containerData.enabled) {
                // Enabled state
                toggleBtn.textContent = '✓';
                toggleBtn.style.background = '#90EE90';
                toggleBtn.style.borderColor = '#90EE90';
                toggleBtn.style.color = '#1a2a1a';
                containerEl.style.opacity = '1';
                if (content) content.style.opacity = '1';
            } else {
                // Disabled state
                toggleBtn.textContent = '';
                toggleBtn.style.background = 'transparent';
                toggleBtn.style.borderColor = '#666';
                toggleBtn.style.color = 'transparent';
                containerEl.style.opacity = '0.5';
                if (content) content.style.opacity = '0.5';
            }
        }

        console.log("PepperInject: Container", id, "enabled:", containerData.enabled);
    }

    removeContainer(id) {
        // Don't remove if it's the last container
        if (this.inputContainers.length <= 1) {
            this.clearContainer(id);
            return;
        }

        const index = this.inputContainers.findIndex(c => c.id === id);
        if (index !== -1) {
            this.inputContainers.splice(index, 1);
        }

        const containerEl = document.getElementById(`pepperinject-container-${id}`);
        if (containerEl) {
            containerEl.remove();
        }

        // If removed container was active, activate the first one
        if (this.activeContainerId === id && this.inputContainers.length > 0) {
            this.setActiveContainer(this.inputContainers[0].id);
        }

        console.log("PepperInject: Container", id, "removed");
    }

    clearDragOverStates() {
        document.querySelectorAll('.pepperinject-input-container').forEach(el => {
            el.classList.remove('drag-over-before', 'drag-over-after', 'dragging');
        });
    }

    reorderContainer(draggedId, targetId, position) {
        // Find indices in the array
        const draggedIndex = this.inputContainers.findIndex(c => c.id === draggedId);
        const targetIndex = this.inputContainers.findIndex(c => c.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) return;

        // Remove the dragged container from array
        const [draggedContainer] = this.inputContainers.splice(draggedIndex, 1);

        // Calculate new index after removal
        let newIndex = targetIndex;
        if (draggedIndex < targetIndex) {
            // If dragged from before target, target index shifted down by 1
            newIndex = targetIndex - 1;
        }

        // Adjust for position
        if (position === 'after') {
            newIndex += 1;
        }

        // Insert at new position
        this.inputContainers.splice(newIndex, 0, draggedContainer);

        // Reorder DOM elements
        const wrapper = document.getElementById('pepperinject-containers-wrapper');
        if (!wrapper) return;

        const draggedEl = document.getElementById(`pepperinject-container-${draggedId}`);
        const targetEl = document.getElementById(`pepperinject-container-${targetId}`);

        if (!draggedEl || !targetEl) return;

        if (position === 'before') {
            wrapper.insertBefore(draggedEl, targetEl);
        } else {
            // Insert after target
            if (targetEl.nextSibling) {
                wrapper.insertBefore(draggedEl, targetEl.nextSibling);
            } else {
                wrapper.appendChild(draggedEl);
            }
        }

        console.log("PepperInject: Reordered container", draggedId, position, "container", targetId);
        console.log("PepperInject: New order:", this.inputContainers.map(c => c.id));
    }

    getAllContainersContent() {
        // Sync all textarea values first
        this.inputContainers.forEach(container => {
            const containerEl = document.getElementById(`pepperinject-container-${container.id}`);
            if (containerEl) {
                const textarea = containerEl.querySelector('.input-textarea');
                if (textarea) {
                    container.content = textarea.value;
                }
            }
        });

        // Concatenate all non-empty contents from enabled containers only
        return this.inputContainers
            .filter(c => c.enabled)
            .map(c => c.content.trim())
            .filter(content => content !== "")
            .join("\n\n");
    }

    updateActiveContainerContent(text) {
        const container = this.getActiveContainer();
        if (!container) return;

        container.content = text;

        const containerEl = document.getElementById(`pepperinject-container-${container.id}`);
        if (containerEl) {
            const textarea = containerEl.querySelector('.input-textarea');
            if (textarea) {
                textarea.value = text;
                this.autoResizeTextarea(textarea);
            }
        }
    }

    appendToActiveContainer(text) {
        const container = this.getActiveContainer();
        if (!container) return;

        if (container.content) {
            container.content += "\n> " + text;
        } else {
            container.content = "> " + text;
        }

        const containerEl = document.getElementById(`pepperinject-container-${container.id}`);
        if (containerEl) {
            const textarea = containerEl.querySelector('.input-textarea');
            if (textarea) {
                textarea.value = container.content;
                this.autoResizeTextarea(textarea);
            }
        }
    }

    // ============================================
    // SAVE/LOAD FUNCTIONALITY
    // ============================================

    getSavedItems() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error("PepperInject: Error reading from localStorage", e);
            return {};
        }
    }

    saveToStorage(key, content) {
        try {
            const saved = this.getSavedItems();
            saved[key] = {
                content: content,
                timestamp: Date.now()
            };
            localStorage.setItem(this.storageKey, JSON.stringify(saved));
            console.log("PepperInject: Saved to storage:", key);
            return true;
        } catch (e) {
            console.error("PepperInject: Error saving to localStorage", e);
            return false;
        }
    }

    deleteFromStorage(key) {
        try {
            const saved = this.getSavedItems();
            delete saved[key];
            localStorage.setItem(this.storageKey, JSON.stringify(saved));
            console.log("PepperInject: Deleted from storage:", key);
            return true;
        } catch (e) {
            console.error("PepperInject: Error deleting from localStorage", e);
            return false;
        }
    }

    saveContainer(id) {
        const containerData = this.inputContainers.find(c => c.id === id);
        if (!containerData) return false;

        // Sync content from textarea
        const containerEl = document.getElementById(`pepperinject-container-${id}`);
        if (containerEl) {
            const textarea = containerEl.querySelector('.input-textarea');
            if (textarea) {
                containerData.content = textarea.value;
            }
        }

        const title = containerData.title || `Input ${id + 1}`;
        const content = containerData.content || "";

        if (!content.trim()) {
            console.log("PepperInject: Nothing to save (empty content)");
            return false;
        }

        const success = this.saveToStorage(title, content);

        // Visual feedback
        if (success && containerEl) {
            const saveBtn = containerEl.querySelector('.save-btn');
            if (saveBtn) {
                saveBtn.classList.add('saved');
                saveBtn.textContent = '✅';
                setTimeout(() => {
                    saveBtn.classList.remove('saved');
                    saveBtn.textContent = '💾';
                }, 1500);
            }
        }

        return success;
    }

    loadIntoContainer(id, key) {
        const saved = this.getSavedItems();
        const item = saved[key];
        if (!item) return false;

        const containerData = this.inputContainers.find(c => c.id === id);
        if (!containerData) return false;

        containerData.content = item.content;

        const containerEl = document.getElementById(`pepperinject-container-${id}`);
        if (containerEl) {
            const textarea = containerEl.querySelector('.input-textarea');
            if (textarea) {
                textarea.value = item.content;
                this.autoResizeTextarea(textarea);
            }
        }

        this.hideLoadDropdown();
        console.log("PepperInject: Loaded from storage:", key);
        return true;
    }

    showLoadDropdown(id, buttonEl) {
        // Close any existing dropdown
        this.hideLoadDropdown();

        const saved = this.getSavedItems();
        const keys = Object.keys(saved);

        // Create dropdown
        const dropdown = document.createElement('div');
        dropdown.className = 'pepperinject-load-dropdown';
        dropdown.id = 'pepperinject-active-dropdown';

        // Header
        const header = document.createElement('div');
        header.className = 'pepperinject-load-dropdown-header';
        header.textContent = 'Saved Items';
        dropdown.appendChild(header);

        if (keys.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'pepperinject-load-empty';
            empty.textContent = 'No saved items yet';
            dropdown.appendChild(empty);
        } else {
            // Sort by timestamp (newest first)
            keys.sort((a, b) => (saved[b].timestamp || 0) - (saved[a].timestamp || 0));

            for (const key of keys) {
                const item = saved[key];
                const itemEl = document.createElement('div');
                itemEl.className = 'pepperinject-load-item';

                const infoDiv = document.createElement('div');
                infoDiv.style.cssText = 'flex: 1; min-width: 0; cursor: pointer;';

                const titleEl = document.createElement('div');
                titleEl.className = 'pepperinject-load-item-title';
                titleEl.textContent = key;
                infoDiv.appendChild(titleEl);

                const previewEl = document.createElement('div');
                previewEl.className = 'pepperinject-load-item-preview';
                previewEl.textContent = (item.content || '').substring(0, 50) + (item.content?.length > 50 ? '...' : '');
                infoDiv.appendChild(previewEl);

                // Click to load
                infoDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.loadIntoContainer(id, key);
                });

                itemEl.appendChild(infoDiv);

                // Delete button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'pepperinject-load-item-delete';
                deleteBtn.textContent = '✕';
                deleteBtn.title = 'Delete saved item';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.deleteFromStorage(key)) {
                        itemEl.remove();
                        // Check if dropdown is now empty
                        const remainingItems = dropdown.querySelectorAll('.pepperinject-load-item');
                        if (remainingItems.length === 0) {
                            const emptyMsg = document.createElement('div');
                            emptyMsg.className = 'pepperinject-load-empty';
                            emptyMsg.textContent = 'No saved items yet';
                            dropdown.appendChild(emptyMsg);
                        }
                    }
                });

                itemEl.appendChild(deleteBtn);
                dropdown.appendChild(itemEl);
            }
        }

        // Position dropdown relative to button's parent header
        const headerEl = buttonEl.closest('.header');
        if (headerEl) {
            headerEl.appendChild(dropdown);
        }

        this.activeDropdown = dropdown;

        // Close dropdown when clicking outside
        const closeHandler = (e) => {
            if (!dropdown.contains(e.target) && e.target !== buttonEl) {
                this.hideLoadDropdown();
                document.removeEventListener('mousedown', closeHandler);
            }
        };
        setTimeout(() => {
            document.addEventListener('mousedown', closeHandler);
        }, 0);
    }

    hideLoadDropdown() {
        const dropdown = document.getElementById('pepperinject-active-dropdown');
        if (dropdown) {
            dropdown.remove();
        }
        this.activeDropdown = null;
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
                        label.value = "";
                        label.style.color = "#666";
                    } else {
                        label.value = value;
                        label.style.color = "#e8e8e8";
                    }
                }
                return;
            }

            if (value === null || value === "") {
                if (label) {
                    label.value = "";
                    label.style.color = "#666";
                }
            } else {
                if (label) {
                    label.value = value;
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
        const currentText = label?.value?.trim();
        if (this.isConnected && this.stdinRef && currentText) {
            this.sendToShellStdin(currentText);
            label.style.color = "#444";
        }
    }

    clearShellMessages() {
        if (!this.isConnected || !this.shellRef) return;

        // Clear the input ref label
        const inputRefLabel = document.getElementById('pepperinject-inputref-label');
        if (inputRefLabel) {
            inputRefLabel.value = "";
            inputRefLabel.style.color = "#666";
        }

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
        // if (data.role !== 'user') return;

        // const clearString = "<command-name>/clear</command-name>";
        // const content = data.content;
        // let hasCommand = false;

        // if (typeof content === 'string' && content.includes(clearString)) {
        //     hasCommand = true;
        // } else if (Array.isArray(content)) {
        //     for (const item of content) {
        //         if (typeof item === 'string' && item.includes(clearString)) {
        //             hasCommand = true;
        //             break;
        //         } else if (typeof item === 'object' && item.text && item.text.includes(clearString)) {
        //             hasCommand = true;
        //             break;
        //         }
        //     }
        // }

        // if (hasCommand) {
        //     setTimeout(() => {
        //         if (!this.shellRef) return;
        //         this.shellRef.once('value', (snapshot) => {
        //             const fbData = snapshot.val();
        //             if (fbData) {
        //                 const updates = {};
        //                 for (const key of Object.keys(fbData)) {
        //                     if (key !== 'meta' && key !== 'stdin') {
        //                         updates[key] = null;
        //                     }
        //                 }
        //                 this.shellRef.update(updates)
        //                     .then(() => {
        //                         this.messages.clear();
        //                         this.clearMessagesUI();
        //                         this.showEmptyState();
        //                     });
        //             }
        //         });
        //     }, 200);
        // }
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
            const message = this.isConnected
                ? "Connected: Send something to Claude"
                : "Connect to view Claude shell transcript";
            container.innerHTML = `
                <div id="pepperinject-empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; color: #666;">
                    <span style="font-size: 32px; margin-bottom: 12px;">💬</span>
                    <span style="font-size: 12px;">${message}</span>
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
                // Special handling for AskUserQuestion - render as clickable buttons
                if (item.name === 'AskUserQuestion' && item.input?.questions) {
                    return this.renderAskUserQuestion(item.input.questions);
                }
                // Special handling for Edit - render as confirmation with diff
                if (item.name === 'Edit' && item.input?.file_path) {
                    return this.renderEditConfirmation(item.input);
                }
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

    renderAskUserQuestion(questions) {
        const container = document.createElement('div');
        container.className = 'pepperinject-ask-container';

        for (const q of questions) {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'pepperinject-question';

            // Question header
            const header = document.createElement('div');
            header.className = 'pepperinject-question-header';
            header.innerHTML = `<span class="pepperinject-question-tag">${q.header || 'Question'}</span> ${q.question}`;
            questionDiv.appendChild(header);

            // Options as buttons
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'pepperinject-options';

            q.options.forEach((opt, idx) => {
                const optionNumber = idx + 1;  // 1-based index
                const btn = document.createElement('button');
                btn.className = 'pepperinject-option-btn';
                btn.innerHTML = `<span class="pepperinject-option-num">${optionNumber}</span>
                                <span class="pepperinject-option-label">${opt.label}</span>
                                <span class="pepperinject-option-desc">${opt.description || ''}</span>`;
                btn.addEventListener('click', () => this.sendOptionToStdin(optionNumber));
                optionsDiv.appendChild(btn);
            });

            questionDiv.appendChild(optionsDiv);
            container.appendChild(questionDiv);
        }

        return container;
    }

    sendOptionToStdin(optionIndex) {
        // Use timestamp:index format to ensure uniqueness
        // optionIndex is 1-based (1, 2, 3, etc.) to match Claude's display
        const timestamp = Date.now();
        const value = `${timestamp}:${optionIndex}`;
        this.sendToShellStdin(value);

        // Visual feedback
        console.log(`PepperInject: Sent option index ${optionIndex} as ${value}`);
    }

    renderEditConfirmation(input) {
        const container = document.createElement('div');
        container.className = 'pepperinject-edit-container';

        // Extract filename from path
        const filePath = input.file_path || '';
        const fileName = filePath.split('/').pop() || 'unknown';

        // Header
        const header = document.createElement('div');
        header.className = 'pepperinject-edit-header';
        header.innerHTML = `
            <span class="pepperinject-edit-icon">✏️</span>
            <span class="pepperinject-edit-title">Edit Confirmation</span>
            <span class="pepperinject-edit-file">${fileName}</span>
        `;
        container.appendChild(header);

        // Diff preview
        const diffDiv = document.createElement('div');
        diffDiv.className = 'pepperinject-edit-diff';

        const oldString = input.old_string || '';
        const newString = input.new_string || '';

        // Show truncated diff
        const maxLines = 8;
        const oldLines = oldString.split('\n').slice(0, maxLines);
        const newLines = newString.split('\n').slice(0, maxLines);

        let diffHtml = '';
        oldLines.forEach(line => {
            const escapedLine = this.escapeHtml(line);
            diffHtml += `<span class="pepperinject-diff-old">- ${escapedLine}</span>`;
        });
        if (oldString.split('\n').length > maxLines) {
            diffHtml += `<span class="pepperinject-diff-old">... (${oldString.split('\n').length - maxLines} more lines)</span>`;
        }
        newLines.forEach(line => {
            const escapedLine = this.escapeHtml(line);
            diffHtml += `<span class="pepperinject-diff-new">+ ${escapedLine}</span>`;
        });
        if (newString.split('\n').length > maxLines) {
            diffHtml += `<span class="pepperinject-diff-new">... (${newString.split('\n').length - maxLines} more lines)</span>`;
        }

        diffDiv.innerHTML = diffHtml;
        container.appendChild(diffDiv);

        // Options
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'pepperinject-edit-options';

        // Option 1: Yes
        const btn1 = document.createElement('button');
        btn1.className = 'pepperinject-edit-btn';
        btn1.innerHTML = `
            <span class="pepperinject-edit-btn-num">1</span>
            <span class="pepperinject-edit-btn-text">Yes</span>
        `;
        btn1.addEventListener('click', () => this.sendOptionToStdin(1));
        optionsDiv.appendChild(btn1);

        // Option 2: Yes, allow all edits
        const btn2 = document.createElement('button');
        btn2.className = 'pepperinject-edit-btn';
        btn2.innerHTML = `
            <span class="pepperinject-edit-btn-num">2</span>
            <span class="pepperinject-edit-btn-text">Yes, allow all edits during this session</span>
        `;
        btn2.addEventListener('click', () => this.sendOptionToStdin(2));
        optionsDiv.appendChild(btn2);

        // Option 3: Custom input
        const inputRow = document.createElement('div');
        inputRow.className = 'pepperinject-edit-input-row';
        inputRow.innerHTML = `
            <span class="pepperinject-edit-btn-num">3</span>
            <input type="text" class="pepperinject-edit-input" placeholder="Tell Claude what to do differently...">
            <button class="pepperinject-edit-input-send">Send</button>
        `;

        const inputField = inputRow.querySelector('.pepperinject-edit-input');
        const sendBtn = inputRow.querySelector('.pepperinject-edit-input-send');

        const sendCustomInput = () => {
            const text = inputField.value.trim();
            if (text) {
                this.sendCustomTextToStdin(text);
                inputField.value = '';
            }
        };

        sendBtn.addEventListener('click', sendCustomInput);
        inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendCustomInput();
            }
        });

        optionsDiv.appendChild(inputRow);
        container.appendChild(optionsDiv);

        return container;
    }

    sendCustomTextToStdin(text) {
        // Use timestamp:text format for custom input
        const timestamp = Date.now();
        const value = `${timestamp}:${text}`;
        this.sendToShellStdin(value);
        console.log(`PepperInject: Sent custom text as ${value}`);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
