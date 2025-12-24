console.log("CodeUI.js")

// ============================================
// VARIABLE HELPER
// ============================================

let V = (attr) => {
    if(!this.vars[attr]) return null;
    return this.vars[attr].value;
}

// ============================================
// UI STATE
// ============================================

let panel = null;
let doc = null;
let container = null;

// UI Elements
let statusDot = null;
let statusText = null;
let sessionInput = null;
let connectBtn = null;
let scrollView = null;
let transcriptArea = null;
let messageCountLabel = null;
let inputRefRow = null;
let inputRefLabel = null;

// Firebase refs for cleanup
let shellRef = null;
let stdinRef = null;
let metaRef = null;
let inputRefRef = null;

// State
let messages = new Map();
let stdinIndex = 0;
let isConnected = false;
let currentSession = "";
let autoScroll = true;

// ============================================
// LIFECYCLE
// ============================================

this.onStart = async () => {
    console.log("CodeUI initializing...")

    // Get UI panel from child entity
    panel = this._entity.GetChild("UI")
    Object.values(panel._bs.components).forEach(c => c.Destroy())


    doc = new BS.BanterUI(new BS.Vector2(1200, 1500), false);
    await panel._bs.AddComponent(doc);
    doc.SetBackgroundColor(new BS.Vector4(0.1, 0.1, 0.1, 1));

    // Get initial session from script var
    currentSession = V("session") || "default";

    // Build the UI
    renderWindow();

    // Auto-connect if we have a session
    if(currentSession){
        connect(currentSession);
    }

    // Setup inputRef listener
    setupInputRefListener();

    console.log("CodeUI ready")
}

// ============================================
// RENDER FUNCTIONS
// ============================================

let renderWindow = () => {
    if(container){
        container.Destroy();
    }

    // Main container
    container = doc.CreateVisualElement();
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.width = "100%";

    // Header section
    renderHeader();

    // Config section
    renderConfigRow();

    // Transcript section (scrollable)
    renderTranscriptSection();

    // Message count
    renderMessageCount();

    // Input area
    renderInputArea();
}

let renderHeader = () => {
    const header = doc.CreateVisualElement();
    header.style.display = "flex";
    header.style.flexDirection = "row";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.backgroundColor = "#242424";
    header.style.padding = "20px";
    header.style.paddingLeft = "24px";
    header.style.paddingRight = "24px";
    header.style.borderBottom = "2px solid #3a3a3a";
    header.style.flexShrink = "0";

    // Title area
    const titleArea = doc.CreateVisualElement();
    titleArea.style.display = "flex";
    titleArea.style.flexDirection = "row";
    titleArea.style.alignItems = "center";

    const titleLabel = doc.CreateLabel();
    titleLabel.text = "CLAUDE SHELL";
    titleLabel.style.color = "#ffffff";
    titleLabel.style.fontSize = "36px";

    titleArea.AppendChild(titleLabel);

    // Status area
    const statusArea = doc.CreateVisualElement();
    statusArea.style.display = "flex";
    statusArea.style.flexDirection = "row";
    statusArea.style.alignItems = "center";

    statusDot = doc.CreateVisualElement();
    statusDot.style.width = "20px";
    statusDot.style.height = "20px";
    statusDot.style.borderRadius = "10px";
    statusDot.style.backgroundColor = "#666666";
    statusDot.style.marginRight = "12px";

    statusText = doc.CreateLabel();
    statusText.text = "Disconnected";
    statusText.style.color = "#888888";
    statusText.style.fontSize = "24px";

    statusArea.AppendChild(statusDot);
    statusArea.AppendChild(statusText);

    header.AppendChild(titleArea);
    header.AppendChild(statusArea);
    container.AppendChild(header);
}

let renderConfigRow = () => {
    const configRow = doc.CreateVisualElement();
    configRow.style.display = "flex";
    configRow.style.flexDirection = "row";
    configRow.style.padding = "16px";
    configRow.style.paddingLeft = "24px";
    configRow.style.paddingRight = "24px";
    configRow.style.backgroundColor = "#1a1a1a";
    configRow.style.borderBottom = "2px solid #3a3a3a";
    configRow.style.alignItems = "center";
    configRow.style.flexShrink = "0";

    // Session input (using label as placeholder - BanterUI limitation)
    sessionInput = doc.CreateLabel();
    sessionInput.text = currentSession || "Session name...";
    sessionInput.style.flexGrow = "1";
    sessionInput.style.padding = "16px";
    sessionInput.style.backgroundColor = "#0f0f0f";
    sessionInput.style.borderWidth = "2px";
    sessionInput.style.borderColor = "#3a3a3a";
    sessionInput.style.borderRadius = "8px";
    sessionInput.style.color = currentSession ? "#e8e8e8" : "#666666";
    sessionInput.style.fontSize = "24px";
    sessionInput.style.marginRight = "16px";

    // Connect button
    connectBtn = doc.CreateLabel();
    connectBtn.text = "Connect";
    connectBtn.style.padding = "16px";
    connectBtn.style.paddingLeft = "32px";
    connectBtn.style.paddingRight = "32px";
    connectBtn.style.backgroundColor = "#2a2a2a";
    connectBtn.style.borderWidth = "2px";
    connectBtn.style.borderColor = "#3a3a3a";
    connectBtn.style.borderRadius = "8px";
    connectBtn.style.color = "#e8e8e8";
    connectBtn.style.fontSize = "24px";

    connectBtn.OnClick(() => {
        if(isConnected){
            disconnect();
        } else if(currentSession){
            connect(currentSession);
        }
    });

    connectBtn.OnMouseEnter(() => {
        if(!isConnected){
            connectBtn.style.backgroundColor = "#333333";
            connectBtn.style.borderColor = "#00d4ff";
        }
    });

    connectBtn.OnMouseLeave(() => {
        if(!isConnected){
            connectBtn.style.backgroundColor = "#2a2a2a";
            connectBtn.style.borderColor = "#3a3a3a";
        }
    });

    configRow.AppendChild(sessionInput);
    configRow.AppendChild(connectBtn);
    container.AppendChild(configRow);
}

let renderTranscriptSection = () => {
    // Use ScrollView for proper scrolling
    scrollView = doc.CreateScrollView();
    scrollView.style.flexGrow = "1";
    scrollView.style.backgroundColor = "#1a1a1a";
    scrollView.verticalScrolling = true;
    scrollView.horizontalScrolling = false;

    // Content container inside scroll view
    createTranscriptArea();

    container.AppendChild(scrollView);

    // Empty state
    renderEmptyState();
}

let createTranscriptArea = () => {
    transcriptArea = doc.CreateVisualElement();
    transcriptArea.style.display = "flex";
    transcriptArea.style.flexDirection = "column";
    transcriptArea.style.padding = "24px";
    transcriptArea.style.width = "100%";
    scrollView.AppendChild(transcriptArea);
}

let renderEmptyState = () => {
    const emptyState = doc.CreateVisualElement();
    emptyState.style.display = "flex";
    emptyState.style.flexDirection = "column";
    emptyState.style.alignItems = "center";
    emptyState.style.justifyContent = "center";
    emptyState.style.padding = "60px";

    const emptyIcon = doc.CreateLabel();
    emptyIcon.text = "💬";
    emptyIcon.style.fontSize = "64px";
    emptyIcon.style.marginBottom = "24px";

    const emptyText = doc.CreateLabel();
    emptyText.text = "Connect to a session to view Claude shell transcript";
    emptyText.style.color = "#666666";
    emptyText.style.fontSize = "28px";

    emptyState.AppendChild(emptyIcon);
    emptyState.AppendChild(emptyText);
    transcriptArea.AppendChild(emptyState);
}

let renderMessageCount = () => {
    const countRow = doc.CreateVisualElement();
    countRow.style.padding = "12px";
    countRow.style.paddingLeft = "24px";
    countRow.style.paddingRight = "24px";
    countRow.style.backgroundColor = "#1a1a1a";
    countRow.style.borderTop = "2px solid #3a3a3a";
    countRow.style.flexShrink = "0";

    messageCountLabel = doc.CreateLabel();
    messageCountLabel.text = "";
    messageCountLabel.style.color = "#666666";
    messageCountLabel.style.fontSize = "20px";

    countRow.AppendChild(messageCountLabel);
    container.AppendChild(countRow);
}

let renderInputArea = () => {
    inputRefRow = doc.CreateVisualElement();
    inputRefRow.style.display = "flex";
    inputRefRow.style.flexDirection = "row";
    inputRefRow.style.padding = "16px";
    inputRefRow.style.paddingLeft = "24px";
    inputRefRow.style.paddingRight = "24px";
    inputRefRow.style.backgroundColor = "#242424";
    inputRefRow.style.borderTop = "2px solid #3a3a3a";
    inputRefRow.style.alignItems = "center";
    inputRefRow.style.flexShrink = "0";
    inputRefRow.style.overflow = "hidden";

    // Input label prefix
    const inputPrefix = doc.CreateLabel();
    inputPrefix.text = "Input:";
    inputPrefix.style.color = "#888888";
    inputPrefix.style.fontSize = "24px";
    inputPrefix.style.marginRight = "16px";
    inputPrefix.style.flexShrink = "0";

    // InputRef value display
    inputRefLabel = doc.CreateLabel();
    inputRefLabel.text = "Waiting for input...";
    inputRefLabel.style.flexGrow = "1";
    inputRefLabel.style.padding = "16px";
    inputRefLabel.style.backgroundColor = "#0f0f0f";
    inputRefLabel.style.borderWidth = "2px";
    inputRefLabel.style.borderColor = "#3a3a3a";
    inputRefLabel.style.borderRadius = "8px";
    inputRefLabel.style.color = "#666666";
    inputRefLabel.style.fontSize = "24px";
    inputRefLabel.style.flexWrap = "wrap";
    inputRefLabel.style.whiteSpace = "normal";
    inputRefLabel.style.minWidth = "0px";
    inputRefLabel.style.flexShrink = "1";
    inputRefLabel.style.overflow = "hidden";

    inputRefRow.AppendChild(inputPrefix);
    inputRefRow.AppendChild(inputRefLabel);

    // Button container (vertical stack)
    const btnContainer = doc.CreateVisualElement();
    btnContainer.style.display = "flex";
    btnContainer.style.flexDirection = "column";
    btnContainer.style.marginLeft = "16px";
    btnContainer.style.flexShrink = "0";

    // Clear session button
    const clearBtn = doc.CreateLabel();
    clearBtn.text = "Clear";
    clearBtn.style.padding = "12px";
    clearBtn.style.paddingLeft = "24px";
    clearBtn.style.paddingRight = "24px";
    clearBtn.style.marginBottom = "8px";
    clearBtn.style.backgroundColor = "#2a2a2a";
    clearBtn.style.borderWidth = "2px";
    clearBtn.style.borderColor = "#3a3a3a";
    clearBtn.style.borderRadius = "8px";
    clearBtn.style.color = "#e8e8e8";
    clearBtn.style.fontSize = "24px";

    clearBtn.OnClick(() => {
        if(isConnected && shellRef){
            sendInput("/clear");
            console.log("CodeUI: Sent /clear command");

            // Delete all message children from Firebase (keep meta and stdin)
            shellRef.once('value', (snapshot) => {
                const data = snapshot.val();
                if(data){
                    const updates = {};
                    for(const key of Object.keys(data)){
                        if(key !== 'meta' && key !== 'stdin'){
                            updates[key] = null;
                        }
                    }
                    shellRef.update(updates)
                        .then(() => {
                            console.log("CodeUI: Cleared messages from Firebase");
                            messages.clear();
                            clearTranscript();
                            renderEmptyState();
                            messageCountLabel.text = "";
                        })
                        .catch(err => {
                            console.error("CodeUI: Failed to clear messages:", err);
                        });
                }
            });
        }
    });

    clearBtn.OnMouseEnter(() => {
        clearBtn.style.backgroundColor = "#333333";
        clearBtn.style.borderColor = "#ff4444";
    });

    clearBtn.OnMouseLeave(() => {
        clearBtn.style.backgroundColor = "#2a2a2a";
        clearBtn.style.borderColor = "#3a3a3a";
    });

    // Send button
    const sendBtn = doc.CreateLabel();
    sendBtn.text = "Send";
    sendBtn.style.padding = "12px";
    sendBtn.style.paddingLeft = "24px";
    sendBtn.style.paddingRight = "24px";
    sendBtn.style.backgroundColor = "#2a2a2a";
    sendBtn.style.borderWidth = "2px";
    sendBtn.style.borderColor = "#3a3a3a";
    sendBtn.style.borderRadius = "8px";
    sendBtn.style.color = "#e8e8e8";
    sendBtn.style.fontSize = "24px";

    sendBtn.OnClick(() => {
        const currentText = inputRefLabel.text;
        if(isConnected && stdinRef && currentText && currentText !== "Waiting for input..."){
            sendInput(currentText);
            console.log("CodeUI: Manually sent input:", currentText);
            // Turn text dark grey after sending
            inputRefLabel.style.color = "#444444";
        }
    });

    sendBtn.OnMouseEnter(() => {
        sendBtn.style.backgroundColor = "#333333";
        sendBtn.style.borderColor = "#00ff00";
    });

    sendBtn.OnMouseLeave(() => {
        sendBtn.style.backgroundColor = "#2a2a2a";
        sendBtn.style.borderColor = "#3a3a3a";
    });

    btnContainer.AppendChild(clearBtn);
    btnContainer.AppendChild(sendBtn);
    inputRefRow.AppendChild(btnContainer);
    container.AppendChild(inputRefRow);
}

let flashInputRow = () => {
    // Flash green
    inputRefRow.style.backgroundColor = "#00ff00";
    inputRefLabel.style.borderColor = "#00ff00";

    // Fade back after 300ms
    setTimeout(() => {
        inputRefRow.style.backgroundColor = "#242424";
        inputRefLabel.style.borderColor = "#3a3a3a";
    }, 300);
}

let setupInputRefListener = () => {
    const inputRefPath = V("inputRef");
    if(!inputRefPath){
        console.log("CodeUI: No inputRef defined");
        inputRefLabel.text = "No inputRef configured";
        return;
    }

    console.log("CodeUI: Setting up inputRef listener on:", inputRefPath);
    inputRefRef = net.db.ref(inputRefPath);

    let isFirstValue = true;
    inputRefRef.on("value", (snapshot) => {
        const value = snapshot.val();
        console.log("CodeUI: inputRef updated:", value);

        // Ignore the first value (initial snapshot)
        if(isFirstValue){
            isFirstValue = false;
            console.log("CodeUI: Ignoring initial inputRef value");
            // Still update the display, just don't send to stdin
            if(value === null || value === ""){
                inputRefLabel.text = "Waiting for input...";
                inputRefLabel.style.color = "#666666";
            } else {
                inputRefLabel.text = value;
                inputRefLabel.style.color = "#e8e8e8";
            }
            return;
        }

        if(value === null || value === ""){
            inputRefLabel.text = "Waiting for input...";
            inputRefLabel.style.color = "#666666";
        } else {
            inputRefLabel.text = value;
            inputRefLabel.style.color = "#e8e8e8";

            // Flash the row
            flashInputRow();

            // Send to stdin if connected
            if(isConnected && stdinRef){
                sendInput(value);
            }
        }
    });
}

// ============================================
// STATUS UPDATES
// ============================================

let updateStatus = (status) => {
    // Reset dot style
    statusDot.style.backgroundColor = "#666666";

    const statusColors = {
        'running': '#00ff00',
        'completed': '#00d4ff',
        'error': '#ff4444',
        'interrupted': '#ffaa00',
        'not_found': '#666666',
        'disconnected': '#666666'
    };

    const statusLabels = {
        'running': 'Running',
        'completed': 'Completed',
        'error': 'Error',
        'interrupted': 'Interrupted',
        'not_found': 'Not Found',
        'disconnected': 'Disconnected',
        'unknown': 'Unknown'
    };

    statusDot.style.backgroundColor = statusColors[status] || '#666666';
    statusText.text = statusLabels[status] || status;
}

let updateConnectButton = () => {
    if(isConnected){
        connectBtn.text = "Disconnect";
        connectBtn.style.backgroundColor = "rgba(0, 212, 255, 0.125)";
        connectBtn.style.borderColor = "#00d4ff";
        connectBtn.style.color = "#00d4ff";
    } else {
        connectBtn.text = "Connect";
        connectBtn.style.backgroundColor = "#2a2a2a";
        connectBtn.style.borderColor = "#3a3a3a";
        connectBtn.style.color = "#e8e8e8";
    }
}

// ============================================
// FIREBASE INTEGRATION
// ============================================

let connect = (sessionName) => {
    if(isConnected){
        disconnect();
    }

    currentSession = sessionName;
    console.log("CodeUI: Connecting to session:", sessionName);

    // Update session input display
    sessionInput.text = sessionName;
    sessionInput.style.color = "#e8e8e8";

    // Get Firebase references
    shellRef = net.db.ref(`/shell/${sessionName}`);
    stdinRef = shellRef.child('stdin');
    metaRef = shellRef.child('meta');

    // Get current stdin index
    stdinRef.once('value', (snapshot) => {
        const data = snapshot.val();
        if(data && typeof data === 'object'){
            const keys = Object.keys(data).map(k => parseInt(k));
            stdinIndex = Math.max(...keys, -1) + 1;
        } else {
            stdinIndex = 0;
        }
    });

    // Listen for metadata
    metaRef.on('value', (snapshot) => {
        const meta = snapshot.val();
        if(meta){
            updateStatus(meta.status || 'unknown');
        } else {
            updateStatus('not_found');
        }
    });

    // Listen for messages
    shellRef.on('child_added', (snapshot) => {
        const key = snapshot.key;
        if(key === 'meta' || key === 'stdin') return;

        const data = snapshot.val();
        if(data && data.role){
            messages.set(key, data);
            renderMessages();
            checkForClearCommand(data);
        }
    });

    shellRef.on('child_changed', (snapshot) => {
        const key = snapshot.key;
        if(key === 'meta' || key === 'stdin') return;

        const data = snapshot.val();
        if(data && data.role){
            messages.set(key, data);
            renderMessages();
            checkForClearCommand(data);
        }
    });

    isConnected = true;
    updateConnectButton();
    console.log("CodeUI: Connected to session:", sessionName);
}

let disconnect = () => {
    console.log("CodeUI: Disconnecting...");

    if(shellRef){
        shellRef.off();
        shellRef = null;
    }
    if(metaRef){
        metaRef.off();
        metaRef = null;
    }
    stdinRef = null;
    messages.clear();
    stdinIndex = 0;
    isConnected = false;

    updateStatus('disconnected');
    updateConnectButton();

    // Clear transcript and show empty state
    clearTranscript();
    renderEmptyState();
    messageCountLabel.text = "";

    console.log("CodeUI: Disconnected");
}

let sendInput = (text) => {
    if(!text || !stdinRef) return;

    stdinRef.child(String(stdinIndex)).set(text)
        .then(() => {
            stdinIndex++;
            console.log("CodeUI: Sent stdin:", text);
        })
        .catch(err => {
            console.error("CodeUI: Failed to send input:", err);
        });
}

let checkForClearCommand = (data) => {
    if(data.role !== 'user') return;

    const clearString = "<command-name>/clear</command-name>";
    const content = data.content;
    let hasCommand = false;

    if(typeof content === 'string' && content.includes(clearString)){
        hasCommand = true;
    } else if(Array.isArray(content)){
        for(const item of content){
            if(typeof item === 'string' && item.includes(clearString)){
                hasCommand = true;
                break;
            } else if(typeof item === 'object' && item.text && item.text.includes(clearString)){
                hasCommand = true;
                break;
            }
        }
    }

    if(hasCommand){
        console.log("CodeUI: Detected /clear command, clearing in 200ms...");
        setTimeout(() => {
            if(!shellRef) return;

            // Delete all message children from Firebase (keep meta and stdin)
            shellRef.once('value', (snapshot) => {
                const fbData = snapshot.val();
                if(fbData){
                    const updates = {};
                    for(const key of Object.keys(fbData)){
                        if(key !== 'meta' && key !== 'stdin'){
                            updates[key] = null;
                        }
                    }
                    shellRef.update(updates)
                        .then(() => {
                            console.log("CodeUI: Auto-cleared messages from Firebase");
                            messages.clear();
                            clearTranscript();
                            renderEmptyState();
                            messageCountLabel.text = "";
                        })
                        .catch(err => {
                            console.error("CodeUI: Failed to auto-clear messages:", err);
                        });
                }
            });
        }, 200);
    }
}

// ============================================
// MESSAGE RENDERING
// ============================================

let clearTranscript = () => {
    // Destroy and recreate the entire transcriptArea
    if(transcriptArea){
        transcriptArea.Destroy();
    }
    createTranscriptArea();
}

let renderMessages = () => {
    clearTranscript();

    // Sort messages by key (timestamp)
    const sortedEntries = [...messages.entries()].sort((a, b) => {
        return a[0].localeCompare(b[0]);
    });

    for(const [ts, msg] of sortedEntries){
        appendMessage(msg.role, msg.content);
    }

    messageCountLabel.text = `${messages.size} messages`;

    // Auto-scroll to bottom
    if(autoScroll){
        // Note: BanterUI scrolling behavior may vary
    }
}

let appendMessage = (role, content) => {
    const msgContainer = doc.CreateVisualElement();
    msgContainer.style.display = "flex";
    msgContainer.style.flexDirection = "column";
    msgContainer.style.marginBottom = "24px";
    msgContainer.style.width = "100%";

    // Role header
    const roleHeader = doc.CreateLabel();
    roleHeader.text = role.toUpperCase();
    roleHeader.style.fontSize = "18px";
    roleHeader.style.color = role === 'user' ? "#00d4ff" : "#ffaa00";
    roleHeader.style.marginBottom = "8px";

    msgContainer.AppendChild(roleHeader);

    // Message bubble
    const bubble = doc.CreateVisualElement();
    bubble.style.display = "flex";
    bubble.style.flexDirection = "column";
    bubble.style.padding = "16px";
    bubble.style.borderRadius = "12px";
    bubble.style.width = "100%";

    if(role === 'user'){
        bubble.style.backgroundColor = "rgba(0, 212, 255, 0.15)";
        bubble.style.borderWidth = "2px";
        bubble.style.borderColor = "rgba(0, 212, 255, 0.3)";
    } else {
        bubble.style.backgroundColor = "#2a2a2a";
        bubble.style.borderWidth = "2px";
        bubble.style.borderColor = "#3a3a3a";
    }

    // Render content
    if(Array.isArray(content)){
        for(const item of content){
            const contentEl = renderContentItem(item);
            bubble.AppendChild(contentEl);
        }
    } else if(typeof content === 'string'){
        const textEl = doc.CreateLabel();
        textEl.text = content;
        textEl.style.color = "#e8e8e8";
        textEl.style.fontSize = "24px";
        textEl.style.width = "100%";
        textEl.style.flexWrap = "wrap";
        textEl.style.whiteSpace = "normal";
        textEl.style.minWidth = "0px";
        textEl.style.maxWidth = "100%";
        bubble.AppendChild(textEl);
    }

    msgContainer.AppendChild(bubble);
    transcriptArea.AppendChild(msgContainer);
}

let renderContentItem = (item) => {
    // String content
    if(typeof item === 'string'){
        const textEl = doc.CreateLabel();
        textEl.text = item;
        textEl.style.color = "#e8e8e8";
        textEl.style.fontSize = "24px";
        textEl.style.width = "100%";
        textEl.style.marginBottom = "8px";
        textEl.style.flexWrap = "wrap";
        textEl.style.whiteSpace = "normal";
        textEl.style.minWidth = "0px";
        textEl.style.maxWidth = "100%";
        return textEl;
    }

    // Object content
    if(typeof item === 'object' && item !== null){
        // Text block
        if(item.type === 'text' || item.text){
            const textEl = doc.CreateLabel();
            textEl.text = item.text || '';
            textEl.style.color = "#e8e8e8";
            textEl.style.fontSize = "24px";
            textEl.style.width = "100%";
            textEl.style.marginBottom = "8px";
            textEl.style.flexWrap = "wrap";
            textEl.style.whiteSpace = "normal";
            textEl.style.minWidth = "0px";
            textEl.style.maxWidth = "100%";
            return textEl;
        }

        // Tool use block
        if(item.type === 'tool_use'){
            return renderToolBlock('tool_use', item.name, item.input);
        }

        // Tool result block
        if(item.type === 'tool_result'){
            return renderToolBlock('tool_result', 'Result', item.content);
        }

        // Thinking block
        if(item.type === 'thinking' || item.thinking){
            return renderThinkingBlock(item.thinking || item.text || '');
        }

        // Generic object
        const textEl = doc.CreateLabel();
        textEl.text = JSON.stringify(item, null, 2);
        textEl.style.color = "#888888";
        textEl.style.fontSize = "20px";
        textEl.style.width = "100%";
        textEl.style.flexWrap = "wrap";
        textEl.style.whiteSpace = "normal";
        textEl.style.minWidth = "0px";
        textEl.style.maxWidth = "100%";
        return textEl;
    }

    // Fallback
    const textEl = doc.CreateLabel();
    textEl.text = String(item);
    textEl.style.color = "#e8e8e8";
    textEl.style.fontSize = "24px";
    textEl.style.width = "100%";
    textEl.style.flexWrap = "wrap";
    textEl.style.whiteSpace = "normal";
    textEl.style.minWidth = "0px";
    textEl.style.maxWidth = "100%";
    return textEl;
}

let renderToolBlock = (type, name, data) => {
    const blockContainer = doc.CreateVisualElement();
    blockContainer.style.display = "flex";
    blockContainer.style.flexDirection = "column";
    blockContainer.style.marginTop = "12px";
    blockContainer.style.marginBottom = "12px";
    blockContainer.style.padding = "12px";
    blockContainer.style.backgroundColor = "#0f0f0f";
    blockContainer.style.borderRadius = "8px";
    blockContainer.style.borderLeftWidth = "4px";
    blockContainer.style.borderLeftColor = type === 'tool_result' ? "#00ff00" : "#ffaa00";
    blockContainer.style.width = "100%";

    // Header
    const nameLabel = doc.CreateLabel();
    nameLabel.text = name;
    nameLabel.style.color = type === 'tool_result' ? "#00ff00" : "#ffaa00";
    nameLabel.style.fontSize = "20px";
    nameLabel.style.marginBottom = "8px";

    blockContainer.AppendChild(nameLabel);

    // Content
    const contentLabel = doc.CreateLabel();
    if(typeof data === 'string'){
        contentLabel.text = data;
    } else {
        contentLabel.text = JSON.stringify(data, null, 2);
    }
    contentLabel.style.color = "#888888";
    contentLabel.style.fontSize = "16px";
    contentLabel.style.width = "100%";
    contentLabel.style.flexWrap = "wrap";
    contentLabel.style.whiteSpace = "normal";
    contentLabel.style.minWidth = "0px";
    contentLabel.style.maxWidth = "100%";

    blockContainer.AppendChild(contentLabel);

    return blockContainer;
}

let renderThinkingBlock = (content) => {
    const blockContainer = doc.CreateVisualElement();
    blockContainer.style.display = "flex";
    blockContainer.style.flexDirection = "column";
    blockContainer.style.marginTop = "8px";
    blockContainer.style.marginBottom = "8px";
    blockContainer.style.padding = "12px";
    blockContainer.style.backgroundColor = "#1a1a2a";
    blockContainer.style.borderRadius = "8px";
    blockContainer.style.borderLeftWidth = "4px";
    blockContainer.style.borderLeftColor = "#8888ff";
    blockContainer.style.width = "100%";

    const contentLabel = doc.CreateLabel();
    contentLabel.text = content || "";
    contentLabel.style.color = "#aaaacc";
    contentLabel.style.fontSize = "20px";
    contentLabel.style.fontStyle = "italic";
    contentLabel.style.width = "100%";
    contentLabel.style.flexWrap = "wrap";
    contentLabel.style.whiteSpace = "normal";
    contentLabel.style.minWidth = "0px";
    contentLabel.style.maxWidth = "100%";

    blockContainer.AppendChild(contentLabel);

    return blockContainer;
}

// ============================================
// CLEANUP
// ============================================

this.onDestroy = async () => {
    console.log("CodeUI: Destroying...")

    // Disconnect from Firebase
    disconnect();

    // Clean up inputRef listener
    if(inputRefRef){
        inputRefRef.off();
        inputRefRef = null;
    }

    // Destroy UI
    if(doc){
        try {
            await doc.Destroy();
        } catch(e) {
            console.log("CodeUI: Error destroying UI", e);
        }
    }

    console.log("CodeUI: Destroyed");
}
