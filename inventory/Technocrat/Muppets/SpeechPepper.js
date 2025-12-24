console.log("SpeechPepper.js")

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
let headerLabel = null;
let historyArea = null;
let historyLabel = null;
let transcriptArea = null;
let transcriptLabel = null;
let clearHistoryButton = null;
let clearAllButton = null;
let runButton = null;
let revisionArea = null;
let revisionLabel = null;
let copyButton = null;
let contentArea = null;
let buttonPanel = null;

// Firebase refs for cleanup
let transcriptRef = null;
let thinkingRef = null;
let revisionRef = null;
let historyRef = null;

// State
let isThinking = false;
let isRunDisabled = false;
let currentRevisionValue = null;

// ============================================
// LIFECYCLE
// ============================================

this.onStart = async () => {
    console.log("SpeechPepper initializing...")

    // Get UI panel from child entity
    panel = this._entity.GetChild("UI")
    Object.values(panel._bs.components).forEach(c => c.Destroy())

    // Create BanterUI (600x600)
    doc = new BS.BanterUI(new BS.Vector2(800, 600), false);
    await panel._bs.AddComponent(doc);
    doc.SetBackgroundColor(new BS.Vector4(0.1, 0.1, 0.1, 1));

    // Build the UI
    renderWindow();

    // Setup Firebase listeners
    setupTranscriptListener();
    setupThinkingListener();
    setupRevisionListener();

    console.log("SpeechPepper ready")
}

// ============================================
// RENDER FUNCTIONS
// ============================================

let renderWindow = () => {
    if(container){
        container.Destroy();
    }

    // Main container - horizontal layout with content on left, buttons on right
    container = doc.CreateVisualElement();
    container.style.display = "flex";
    container.style.flexDirection = "row";
    container.style.height = "100%";
    container.style.width = "100%";

    // Left content area (takes up most space)
    contentArea = doc.CreateVisualElement();
    contentArea.style.display = "flex";
    contentArea.style.flexDirection = "column";
    contentArea.style.flexGrow = "1";
    contentArea.style.height = "100%";
    contentArea.style.overflow = "hidden";

    // Header section
    renderHeader();

    // History section (above transcript)
    renderHistorySection();

    // Transcript section
    renderTranscriptSection();

    // Revision section (initially hidden, rendered when needed)
    renderRevisionSection();

    container.AppendChild(contentArea);

    // Right button panel (Ubuntu-style)
    renderButtonPanel();
    container.AppendChild(buttonPanel);
}

let renderHeader = () => {
    const header = doc.CreateVisualElement();
    header.style.display = "flex";
    header.style.flexDirection = "row";
    header.style.alignItems = "center";
    header.style.backgroundColor = "#0051e5";
    header.style.padding = "8px";
    header.style.paddingLeft = "12px";

    // Title section
    headerLabel = doc.CreateLabel();
    const speakerName = V("speaker") || "Unknown";
    const icon = V("ignoreOthers") ? "👤" : "👥";
    const parserBot = V("parserBot") || "Parser";
    headerLabel.text = `${speakerName} ${icon} → ${parserBot} → ${V("pasteRef")}`;
    headerLabel.style.color = "white";
    headerLabel.style.fontSize = "12px";
    headerLabel.style.fontWeight = "bold";

    header.AppendChild(headerLabel);
    contentArea.AppendChild(header);
}

let renderButtonPanel = () => {
    // Right side button panel (Ubuntu-style)
    buttonPanel = doc.CreateVisualElement();
    buttonPanel.style.display = "flex";
    buttonPanel.style.flexDirection = "column";
    buttonPanel.style.width = "120px";
    buttonPanel.style.backgroundColor = "#1a1a1a";
    buttonPanel.style.padding = "8px";
    buttonPanel.style.gap = "8px";
    buttonPanel.style.justifyContent = "flex-start";
    buttonPanel.style.borderLeft = "2px solid #333";

    // Common button styles helper
    const applyButtonStyle = (btn, bgColor) => {
        btn.style.backgroundColor = bgColor;
        btn.style.color = "#ffffff";
        btn.style.paddingTop = "20px";
        btn.style.paddingBottom = "20px";
        btn.style.paddingLeft = "8px";
        btn.style.paddingRight = "8px";
        btn.style.borderRadius = "8px";
        btn.style.cursor = "pointer";
        btn.style.fontSize = "16px";
        btn.style.fontWeight = "bold";
        btn.style.textAlign = "center";
        btn.style.width = "100%";
    };

    // Send button (primary action - at top)
    copyButton = doc.CreateLabel();
    copyButton.text = "Send";
    applyButtonStyle(copyButton, "#0051e5");
    copyButton.style.border = "2px solid #4d8fff";

    copyButton.OnClick(() => {
        copyContent();
    });

    copyButton.OnMouseEnter(() => {
        copyButton.style.backgroundColor = "#003db3";
    });

    copyButton.OnMouseLeave(() => {
        copyButton.style.backgroundColor = "#0051e5";
    });

    // Process button
    runButton = doc.CreateLabel();
    updateRunButtonState();

    runButton.OnClick(() => {
        if(isRunDisabled || isThinking) return;
        triggerRun();
    });

    runButton.OnMouseEnter(() => {
        if(!isRunDisabled && !isThinking){
            runButton.style.backgroundColor = "#218838";
        }
    });

    runButton.OnMouseLeave(() => {
        if(!isRunDisabled && !isThinking){
            runButton.style.backgroundColor = "#28a745";
        }
    });

    // Clear button
    clearHistoryButton = doc.CreateLabel();
    clearHistoryButton.text = "Clear";
    applyButtonStyle(clearHistoryButton, "#dc3545");

    clearHistoryButton.OnClick(() => {
        clearHistory();
    });

    clearHistoryButton.OnMouseEnter(() => {
        clearHistoryButton.style.backgroundColor = "#c82333";
    });

    clearHistoryButton.OnMouseLeave(() => {
        clearHistoryButton.style.backgroundColor = "#dc3545";
    });

    // Clear All button
    clearAllButton = doc.CreateLabel();
    clearAllButton.text = "Clear All";
    applyButtonStyle(clearAllButton, "#8b0000");

    clearAllButton.OnClick(() => {
        clearAll();
    });

    clearAllButton.OnMouseEnter(() => {
        clearAllButton.style.backgroundColor = "#a00000";
    });

    clearAllButton.OnMouseLeave(() => {
        clearAllButton.style.backgroundColor = "#8b0000";
    });

    buttonPanel.AppendChild(copyButton);
    buttonPanel.AppendChild(runButton);
    buttonPanel.AppendChild(clearHistoryButton);
    buttonPanel.AppendChild(clearAllButton);
}

let renderHistorySection = () => {
    // Input container with scroll
    historyArea = doc.CreateVisualElement();
    historyArea.style.display = "flex";
    historyArea.style.flexDirection = "column";
    historyArea.style.margin = "4px";
    historyArea.style.marginBottom = "0px";
    historyArea.style.backgroundColor = "#1a2a1a";
    historyArea.style.maxHeight = "140px";
    historyArea.style.borderRadius = "4px";
    historyArea.style.border = "1px solid #2d5a2d";

    // Header bar
    const headerBar = doc.CreateVisualElement();
    headerBar.style.display = "flex";
    headerBar.style.backgroundColor = "#2d5a2d";
    headerBar.style.padding = "6px 10px";
    headerBar.style.borderRadius = "4px 4px 0 0";

    const historyHeader = doc.CreateLabel();
    historyHeader.text = "📝 Input";
    historyHeader.style.color = "#90EE90";
    historyHeader.style.fontSize = "12px";
    historyHeader.style.fontWeight = "bold";

    headerBar.AppendChild(historyHeader);

    // Content area (scrollable)
    const scrollableContent = doc.CreateVisualElement();
    scrollableContent.style.overflowY = "auto";
    scrollableContent.style.flexGrow = "1";
    scrollableContent.style.padding = "10px";

    historyLabel = doc.CreateLabel();
    historyLabel.text = "";
    historyLabel.style.color = "#e0e0e0";
    historyLabel.style.fontSize = "14px";
    historyLabel.style.textAlign = "left";
    historyLabel.style.width = "100%";
    historyLabel.style.whiteSpace = "normal";
    historyLabel.style.lineHeight = "1.4";

    scrollableContent.AppendChild(historyLabel);
    historyArea.AppendChild(headerBar);
    historyArea.AppendChild(scrollableContent);
    contentArea.AppendChild(historyArea);

    updateHistoryDisplay();
}

let updateHistoryDisplay = () => {
    if(history.length > 0){
        historyLabel.text = history.join(" ");
        historyLabel.style.color = "#e0e0e0";
        historyLabel.style.fontStyle = "normal";
    } else {
        historyLabel.text = "No input yet...";
        historyLabel.style.color = "#666666";
        historyLabel.style.fontStyle = "italic";
    }
}

let renderTranscriptSection = () => {
    // Transcript container with scroll - height scales with content up to max
    transcriptArea = doc.CreateVisualElement();
    transcriptArea.style.overflowY = "auto";
    transcriptArea.style.margin = "4px";
    transcriptArea.style.backgroundColor = "#1e1e1e";
    transcriptArea.style.maxHeight = "200px";
    transcriptArea.style.padding = "8px";
    transcriptArea.style.borderRadius = "4px";

    transcriptLabel = doc.CreateLabel();
    transcriptLabel.text = "Waiting for transcript...";
    transcriptLabel.style.color = "#aaaaaa";
    transcriptLabel.style.fontSize = "14px";
    transcriptLabel.style.textAlign = "left";
    transcriptLabel.style.width = "100%";
    transcriptLabel.style.whiteSpace = "normal";

    transcriptArea.AppendChild(transcriptLabel);
    contentArea.AppendChild(transcriptArea);
}

let updateRunButtonState = () => {
    if(isThinking){
        runButton.text = "⏳";
        runButton.style.backgroundColor = "#ffc107";
        runButton.style.color = "#000000";
    } else if(isRunDisabled){
        runButton.text = "Process";
        runButton.style.backgroundColor = "#666666";
        runButton.style.color = "#999999";
    } else {
        runButton.text = "Process";
        runButton.style.backgroundColor = "#28a745";
        runButton.style.color = "#ffffff";
    }
    runButton.style.paddingTop = "20px";
    runButton.style.paddingBottom = "20px";
    runButton.style.paddingLeft = "8px";
    runButton.style.paddingRight = "8px";
    runButton.style.borderRadius = "8px";
    runButton.style.cursor = "pointer";
    runButton.style.fontSize = "16px";
    runButton.style.fontWeight = "bold";
    runButton.style.textAlign = "center";
    runButton.style.width = "100%";
}

let triggerRun = async () => {
    isRunDisabled = true;
    updateRunButtonState();

    try {
        const runPath = `space/${net.spaceId}/vars/${V("parserBot")}/run`;
        await net.db.ref(runPath).set(true);
        console.log("SpeechPepper: Run triggered");
    } catch(e) {
        console.log("SpeechPepper: Error triggering run", e);
    }

    // Re-enable after 1 second
    setTimeout(() => {
        isRunDisabled = false;
        updateRunButtonState();
    }, 1000);
}

let clearHistory = async () => {
    try {
        const parserBot = V("parserBot");
        if(parserBot){
            const historyPath = `space/${net.spaceId}/vars/${parserBot}/history`;
            await net.db.ref(historyPath).set(null);
        }
        history = [];
        last_buffer = "";
        updateHistoryDisplay();
        console.log("SpeechPepper: History cleared");
    } catch(e) {
        console.log("SpeechPepper: Error clearing history", e);
    }
}

let clearAll = async () => {
    try {
        // Clear history
        await clearHistory();

        // Clear revision
        await clearRevision();

        console.log("SpeechPepper: All cleared");
    } catch(e) {
        console.log("SpeechPepper: Error clearing all", e);
    }
}

let renderRevisionSection = () => {
    // Revision area (initially hidden)
    revisionArea = doc.CreateVisualElement();
    revisionArea.style.display = "none";
    revisionArea.style.flexDirection = "column";
    revisionArea.style.margin = "4px";
    revisionArea.style.backgroundColor = "#1a1a2e";
    revisionArea.style.borderRadius = "4px";
    revisionArea.style.border = "1px solid #0051e5";

    // Revision header
    const revisionHeader = doc.CreateVisualElement();
    revisionHeader.style.backgroundColor = "#0051e5";
    revisionHeader.style.padding = "4px 8px";

    const revisionTitle = doc.CreateLabel();
    revisionTitle.text = "Current Revision";
    revisionTitle.style.color = "white";
    revisionTitle.style.fontSize = "12px";
    revisionTitle.style.fontWeight = "bold";

    revisionHeader.AppendChild(revisionTitle);
    revisionArea.AppendChild(revisionHeader);

    // Revision content (scrollable)
    const revisionContent = doc.CreateVisualElement();
    revisionContent.style.overflowY = "auto";
    // revisionContent.style.maxHeight = "150px";
    revisionContent.style.padding = "8px";

    revisionLabel = doc.CreateLabel();
    revisionLabel.text = "";
    revisionLabel.style.color = "#e0e0e0";
    revisionLabel.style.fontSize = "12px";
    revisionLabel.style.textAlign = "left";
    revisionLabel.style.width = "100%";
    revisionLabel.style.whiteSpace = "normal";

    revisionContent.AppendChild(revisionLabel);
    revisionArea.AppendChild(revisionContent);

    contentArea.AppendChild(revisionArea);
}

let updateRevisionVisibility = () => {
    if(currentRevisionValue && currentRevisionValue.trim() !== ""){
        revisionArea.style.display = "flex";
        revisionLabel.text = currentRevisionValue;
    } else {
        revisionArea.style.display = "none";
    }
}

let clearRevision = async () => {
    try {
        const revisionPath = `space/${net.spaceId}/vars/${V("parserBot")}/currentRevision`;
        await net.db.ref(revisionPath).set(null);
        console.log("SpeechPepper: Revision cleared");
    } catch(e) {
        console.log("SpeechPepper: Error clearing revision", e);
    }
}

let copyRevision = async () => {
    if(!currentRevisionValue) return;

    try {
        await navigator.clipboard.writeText(currentRevisionValue);
        console.log("SpeechPepper: Revision copied to clipboard");

        // Flash green
        copyButton.style.backgroundColor = "#28a745";
        setTimeout(() => {
            copyButton.style.backgroundColor = "#0051e5";
        }, 300);
    } catch(e) {
        console.log("SpeechPepper: Error copying to clipboard", e);
    }
}

let copyContent = async () => {
    // If currentRevision exists and is non-empty, copy it; otherwise copy history

    


    let textToCopy = "";
    if(currentRevisionValue && currentRevisionValue.trim() !== ""){
        textToCopy = currentRevisionValue;
    } else {
        textToCopy = history.join(" ");
    }

    if(!textToCopy || textToCopy.trim() === ""){
        console.log("SpeechPepper: Nothing to copy");
        return;
    }


    let pasteRef = V("pasteRef")
    log("SpeechPepper", `Sending content to ${pasteRef}`)
    net.db.ref(pasteRef).set(textToCopy)


    try {
        await navigator.clipboard.writeText(textToCopy);
        console.log("SpeechPepper: Content copied to clipboard");

        // Flash green
        copyButton.style.backgroundColor = "#28a745";
        setTimeout(() => {
            copyButton.style.backgroundColor = "#0051e5";
        }, 300);
    } catch(e) {
        console.log("SpeechPepper: Error copying to clipboard", e);
    }
}

// ============================================
// FIREBASE LISTENERS
// ============================================
let history = []
let last_buffer = ""
let setupTranscriptListener = () => {
    const speaker = V("speaker");
    if(!speaker){
        console.log("SpeechPepper: No speaker defined");
        return;
    }
    const parserBot = V("parserBot");
    const transcriptPath = `space/${net.spaceId}/vars/${speaker}_buffer`;
    transcriptRef = net.db.ref(transcriptPath);

    const historyPath = `space/${net.spaceId}/vars/${parserBot}/history`;
    historyRef = net.db.ref(historyPath);

    transcriptRef.on("value", (snapshot) => {
        let data = snapshot.val();
        console.log("SpeechPepper: Transcript updated", data);

        if(data === null || data === ""){
            transcriptLabel.text = "No transcript available";
            transcriptLabel.style.color = "#666666";
            if(last_buffer && last_buffer.trim() !== ""){
                history.push(last_buffer);
                updateHistoryDisplay();
                historyRef.set(history.join(" "));
            }
            last_buffer = "";
        } else {
            last_buffer = data;
            transcriptLabel.text = data;
            transcriptLabel.style.color = "white";
        }
    });
}

let setupThinkingListener = () => {
    const parserBot = V("parserBot");
    if(!parserBot){
        console.log("SpeechPepper: No parserBot defined");
        return;
    }

    const thinkingPath = `space/${net.spaceId}/vars/${parserBot}/thinking`;
    thinkingRef = net.db.ref(thinkingPath);

    thinkingRef.on("value", (snapshot) => {
        let data = snapshot.val();
        console.log("SpeechPepper: Thinking state", data);

        isThinking = data === true;
        updateRunButtonState();
    });
}

let setupRevisionListener = () => {
    const parserBot = V("parserBot");
    if(!parserBot){
        console.log("SpeechPepper: No parserBot defined");
        return;
    }

    const revisionPath = `space/${net.spaceId}/vars/${parserBot}/currentRevision`;
    revisionRef = net.db.ref(revisionPath);

    revisionRef.on("value", (snapshot) => {
        let data = snapshot.val();
        console.log("SpeechPepper: Revision updated", data);

        currentRevisionValue = data;
        updateRevisionVisibility();
    });
}

// ============================================
// CLEANUP
// ============================================

this.onDestroy = async () => {
    console.log("SpeechPepper: Destroying...")

    // Remove Firebase listeners
    if(transcriptRef){
        transcriptRef.off();
    }
    if(thinkingRef){
        thinkingRef.off();
    }
    if(revisionRef){
        revisionRef.off();
    }
    if(historyRef){
        historyRef.off();
    }

    // Destroy UI
    if(doc){
        try {
            await doc.Destroy();
        } catch(e) {
            console.log("SpeechPepper: Error destroying UI", e);
        }
    }

    console.log("SpeechPepper: Destroyed");
}
