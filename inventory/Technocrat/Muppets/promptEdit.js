console.log("promptEdit 2")

let V = (attr) => {
    if(!this.vars[attr]) return null;
    return this.vars[attr].value;
}

// Parse diff block format: <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE
let parseDiffBlock = (text) => {
    if (!text) return { type: 'plain', content: text };

    const diffRegex = /<<<<<<< SEARCH\s*([\s\S]*?)\s*=======\s*([\s\S]*?)\s*>>>>>>> REPLACE/g;
    const diffs = [];
    let lastIndex = 0;
    let match;

    while ((match = diffRegex.exec(text)) !== null) {
        // Add any plain text before this diff
        if (match.index > lastIndex) {
            diffs.push({
                type: 'plain',
                content: text.substring(lastIndex, match.index).trim()
            });
        }

        diffs.push({
            type: 'diff',
            removed: match[1].trim(),
            added: match[2].trim()
        });

        lastIndex = match.index + match[0].length;
    }

    // Add any remaining plain text
    if (lastIndex < text.length) {
        const remaining = text.substring(lastIndex).trim();
        if (remaining) {
            diffs.push({
                type: 'plain',
                content: remaining
            });
        }
    }

    // If no diffs found, return original as plain
    if (diffs.length === 0) {
        return [{ type: 'plain', content: text }];
    }

    return diffs;
}

let DestroySelf = async ()=>{
    await RemoveEntity(this._entity.id);
}

// Apply diff blocks to source text
let applyDiffs = (sourceText, diffContent) => {
    const parsedDiffs = parseDiffBlock(diffContent);
    let result = sourceText;

    parsedDiffs.forEach((item) => {
        if (item.type === 'diff' && item.removed) {
            result = result.replace(item.removed, item.added || '');
        }
    });

    return result;
}

// Show status message and destroy after delay
let showStatusAndDestroy = (message, bgColor) => {
    if (buttonRow && container) {
        // Destroy the old buttonRow and create a new one
        buttonRow.Destroy();

        buttonRow = doc.CreateVisualElement();
        buttonRow.style.display = "flex";
        buttonRow.style.flexDirection = "row";
        buttonRow.style.justifyContent = "center";
        buttonRow.style.padding = "8px";

        const statusLabel = doc.CreateLabel();
        statusLabel.text = message;
        statusLabel.style.color = "#ffffff";
        statusLabel.style.fontSize = "24px";
        statusLabel.style.textAlign = "center";
        statusLabel.style.backgroundColor = bgColor;
        statusLabel.style.padding = "8px 16px";
        statusLabel.style.borderRadius = "4px";
        statusLabel.style.flexGrow = "1";

        buttonRow.AppendChild(statusLabel);
        container.AppendChild(buttonRow);
    }

    setTimeout(() => {
        DestroySelf();
    }, 1000);
}

let approveEdit = async () => {
    let targetVar = V("targetVar");
    let content = V("content");
    let sourceRef = net.db.ref(`space/${net.spaceId}/vars/${targetVar}`);

    try {
        // Get current value from Firebase
        let snapshot = await sourceRef.once('value');
        let currentValue = snapshot.val();

        if (currentValue === null) {
            log("PromptEdit", "Error: Target var not found", targetVar);
            showStatusAndDestroy("Error: Target not found", "#dc3545");
            return;
        }

        // Apply the diff to get the new value
        let newValue = applyDiffs(currentValue, content);

        // Update Firebase with the new value
        await sourceRef.set(newValue);

        net.sendOneShot(`approvedEdit¶${content}`);
        log("PromptEdit", "approveEdit - successfully applied diff");

        showStatusAndDestroy("✓ Applied!", "#28a745");
    } catch (e) {
        log("PromptEdit", "Error applying edit", e);
        showStatusAndDestroy("Error: " + e.message, "#dc3545");
    }
}

let rejectEdit = () => {
    net.sendOneShot(`rejectedEdit¶${V("content")}`);
    log("PromptEdit", "rejectEdit");
    showStatusAndDestroy("✗ Rejected", "#dc3545");
}

let panel = null;
let doc = null;
let container = null;
let contentArea = null;
let buttonRow = null;
let approveButton = null;
let starting = false;
let targetVarListener = null;
let currentTargetValue = null;
let diffApplicable = true;

// Check if all diffs in content can be applied to the current target value
let canApplyDiffs = (sourceText, diffContent) => {
    if (!sourceText || !diffContent) return false;

    const parsedDiffs = parseDiffBlock(diffContent);
    log("PromptEdit",'diffs', parsedDiffs)

    for (const item of parsedDiffs) {
        if (item.type === 'diff' && item.removed) {
            if (!sourceText.includes(item.removed)) {
                return false;
            }
        }
    }
    return true;
}

// Update UI state based on whether diff can be applied
let updateDiffApplicableState = (applicable) => {
    diffApplicable = applicable;

    if (doc) {
        if (applicable) {
            doc.SetBackgroundColor(new BS.Vector4(0, 0.31, 0.89, 1)); // Original blue
        } else {
            doc.SetBackgroundColor(new BS.Vector4(0.8, 0.1, 0.1, 1)); // Red
        }
    }

    if (approveButton) {
        if (applicable) {
            approveButton.style.backgroundColor = "#28a745"; // Green
            approveButton.style.color = "#ffffff";
        } else {
            approveButton.style.backgroundColor = "#666666"; // Grey
            approveButton.style.color = "#999999";
        }
    }
}

// Set up listener for targetVar changes
let setupTargetVarListener = () => {
    let targetVar = V("targetVar");
    if (!targetVar) return;

    // Clean up existing listener
    if (targetVarListener) {
        targetVarListener.off();
        targetVarListener = null;
    }

    let sourceRef = net.db.ref(`space/${net.spaceId}/vars/${targetVar}`);
    targetVarListener = sourceRef;

    sourceRef.on('value', (snapshot) => {
        currentTargetValue = snapshot.val();
        let content = V("content");
        let applicable = canApplyDiffs(currentTargetValue, content);
        updateDiffApplicableState(applicable);
        renderPrompt(content);
    });
}

this.onStart = async ()=>{
    log("PromptEdit", "onStart", starting)
    if(starting) return;
    starting = true;
    panel = this._entity.GetChild("UI")
    Object.values(panel._bs.components).forEach(c=>c.Destroy())
    doc = new BS.BanterUI(new BS.Vector2(512,360), false);
    await panel._bs.AddComponent(doc);
    doc.SetBackgroundColor(new BS.Vector4(0, 0.31, 0.89, 1));
    window.promptEditUI = doc;
    renderPrompt(V("content"));
    setupTargetVarListener();
    starting = false;
}

let renderPrompt = (promptContent)=>{
    if(container){
        log("PromptEdit", "container exists: ", container, "destroying..")
        container.Destroy();
    }
    //panel._set("localScale", {"x": 1, "y": 1, "z": 1})

    container = doc.CreateVisualElement();
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.width = "100%";

    // Handle empty content case
    if (!promptContent || promptContent === "") {
        container.style.justifyContent = "center";
        container.style.alignItems = "center";
        container.style.backgroundColor = "#1e1e1e";

        const emptyLabel = doc.CreateLabel();
        emptyLabel.text = "No content provided";
        emptyLabel.style.color = "#888888";
        emptyLabel.style.fontSize = "24px";
        emptyLabel.style.textAlign = "center";

        container.AppendChild(emptyLabel);
        //panel._set("localScale", {"x": 0.2, "y": 0.2, "z": 0.2})
        return;
    }

    const header = doc.CreateVisualElement();
    header.style.display = "flex";
    header.style.flexDirection = "row";
    header.style.justifyContent = "space-between";
    header.style.backgroundColor = "#0051e5";
    header.style.paddingLeft = "8px";
    header.style.borderBottom = "1px solid #333";
    
    const title = doc.CreateLabel();
    title.text = "Edit Suggestion for: " + V("targetVar");
    title.style.color = "#ffffff";
    title.style.fontSize = "14px";
    title.style.fontWeight = "bold";

    const closeButton = doc.CreateLabel();
    closeButton.text = "x";
    closeButton.style.backgroundColor = "red";
    closeButton.style.color = "#ffffff";
    closeButton.style.border = "none";
    closeButton.style.borderRadius = "0px";
    closeButton.style.fontSize = "12px";
    closeButton.style.padding = "4px";
    closeButton.style.paddingRight = "8px";
    closeButton.style.paddingLeft = "8px";
    closeButton.style.cursor = "pointer";
    closeButton.OnClick(() => {
        DestroySelf();
    });

    header.AppendChild(title);
    header.AppendChild(closeButton);
    container.AppendChild(header);

    // Create content area for diff display
    contentArea = doc.CreateVisualElement();
    contentArea.style.overflowY = "auto";
    contentArea.style.margin = "4px";
    contentArea.style.backgroundColor = "#1e1e1e";
    contentArea.style.height = "100%";
    contentArea.style.padding = "8px";
    contentArea.style.borderRadius = "4px";

    // Parse and render the diff content
    const parsedDiffs = parseDiffBlock(promptContent);

    parsedDiffs.forEach((item) => {
        if (item.type === 'plain') {
            const plainLabel = doc.CreateLabel();
            plainLabel.text = item.content;
            plainLabel.style.color = "#d4d4d4";
            plainLabel.style.fontSize = "12px";
            plainLabel.style.fontFamily = "monospace";
            plainLabel.style.marginBottom = "8px";
            plainLabel.style.flexWrap = "wrap";
            plainLabel.style.whiteSpace = "normal";
            contentArea.AppendChild(plainLabel);
        } else if (item.type === 'diff') {
            // Create diff container
            const diffContainer = doc.CreateVisualElement();
            diffContainer.style.marginBottom = "8px";
            diffContainer.style.borderRadius = "4px";

            // Removed line (red)
            if (item.removed) {
                const removedRow = doc.CreateVisualElement();
                removedRow.style.display = "flex";
                removedRow.style.flexDirection = "row";
                removedRow.style.backgroundColor = "#3d1f1f";
                removedRow.style.padding = "4px 8px";

                const removedPrefix = doc.CreateLabel();
                removedPrefix.text = "-";
                removedPrefix.style.color = "#f85149";
                removedPrefix.style.fontSize = "12px";
                removedPrefix.style.fontFamily = "monospace";
                removedPrefix.style.fontWeight = "bold";
                removedPrefix.style.marginRight = "8px";
                removedPrefix.style.width = "12px";

                const removedText = doc.CreateLabel();
                removedText.text = item.removed;
                removedText.style.color = "#ffa0a0";
                removedText.style.fontSize = "12px";
                removedText.style.fontFamily = "monospace";
                removedText.style.flexWrap = "wrap";
                removedText.style.whiteSpace = "normal";

                removedRow.AppendChild(removedPrefix);
                removedRow.AppendChild(removedText);
                diffContainer.AppendChild(removedRow);
            }

            // Added line (green)
            if (item.added) {
                const addedRow = doc.CreateVisualElement();
                addedRow.style.display = "flex";
                addedRow.style.flexDirection = "row";
                addedRow.style.backgroundColor = "#1f3d1f";
                addedRow.style.padding = "4px 8px";

                const addedPrefix = doc.CreateLabel();
                addedPrefix.text = "+";
                addedPrefix.style.color = "#3fb950";
                addedPrefix.style.fontSize = "12px";
                addedPrefix.style.fontFamily = "monospace";
                addedPrefix.style.fontWeight = "bold";
                addedPrefix.style.marginRight = "8px";
                addedPrefix.style.width = "12px";

                const addedText = doc.CreateLabel();
                addedText.text = item.added;
                addedText.style.color = "#a0ffa0";
                addedText.style.fontSize = "12px";
                addedText.style.fontFamily = "monospace";
                addedText.style.flexWrap = "wrap";
                addedText.style.whiteSpace = "normal";

                addedRow.AppendChild(addedPrefix);
                addedRow.AppendChild(addedText);
                diffContainer.AppendChild(addedRow);
            }

            contentArea.AppendChild(diffContainer);
        }
    });

    container.AppendChild(contentArea);

    // Create button row
    buttonRow = doc.CreateVisualElement();
    buttonRow.style.display = "flex";
    buttonRow.style.flexDirection = "row";
    buttonRow.style.justifyContent = "center";
    buttonRow.style.padding = "8px";
    buttonRow.style.gap = "8px";

    approveButton = doc.CreateLabel();
    approveButton.text = "Approve";
    approveButton.style.backgroundColor = diffApplicable ? "#28a745" : "#666666";
    approveButton.style.color = diffApplicable ? "#ffffff" : "#999999";
    approveButton.style.padding = "8px 16px";
    approveButton.style.borderRadius = "4px";
    approveButton.style.cursor = "pointer";
    approveButton.style.fontSize = "24px";
    approveButton.style.flexGrow = "1";
    approveButton.style.textAlign = "center";
    approveButton.OnClick(() => {
        if (!diffApplicable) {
            log("PromptEdit", "Cannot approve - diff no longer applicable");
            return;
        }
        approveEdit();
    });

    const pokeButton = doc.CreateLabel();
    pokeButton.text = "Poke";
    pokeButton.style.backgroundColor = "#ffc107";
    pokeButton.style.color = "#000000";
    pokeButton.style.padding = "8px 16px";
    pokeButton.style.borderRadius = "4px";
    pokeButton.style.cursor = "pointer";
    pokeButton.style.fontSize = "24px";
    pokeButton.style.flexGrow = "1";
    pokeButton.style.textAlign = "center";
    pokeButton.OnMouseDown(() => {
        console.log("poke: mouseDown");
        pokeButton.style.borderColor = "#ffffff";
        pokeButton.style.borderWidth = "2px";
        pokeButton.style.color = "#ffffff";
        pokeButton.style.backgroundColor = "#e6ac00";
    });
    pokeButton.OnMouseUp(() => {
        console.log("poke: mouseUp");
        pokeButton.style.borderWidth = "0px";
        pokeButton.style.color = "#000000";
        pokeButton.style.backgroundColor = "#ffc107";
    });

    const rejectButton = doc.CreateLabel();
    rejectButton.text = "Reject";
    rejectButton.style.backgroundColor = "#dc3545";
    rejectButton.style.color = "#ffffff";
    rejectButton.style.padding = "8px 16px";
    rejectButton.style.borderRadius = "4px";
    rejectButton.style.cursor = "pointer";
    rejectButton.style.fontSize = "24px";
    rejectButton.style.flexGrow = "1";
    rejectButton.style.textAlign = "center";
    rejectButton.OnClick(() => {
        rejectEdit();
    });

    buttonRow.AppendChild(approveButton);
    buttonRow.AppendChild(pokeButton);
    buttonRow.AppendChild(rejectButton);
    container.AppendChild(buttonRow);

    //panel._set("localScale", {"x": 0.2, "y": 0.2, "z": 0.2})
}

this.onVarChange = (varName, snap)=>{
    let value = snap.value
    log("promptEdit", "onVarChange", varName, value)
    if(varName === "content" || varName === "targetVar"){
        setupTargetVarListener();
       
    }
}

this.onDestroy = async ()=>{
    log("PromptEdit", "promptEdit.js onDestroyed")
    // Clean up targetVar listener
    if (targetVarListener) {
        targetVarListener.off();
        targetVarListener = null;
    }
    if(doc){
        try{
            await doc.Destroy();
        }catch(e){
            log("MUPPET", "could not destroy dialogue UI 🤷‍♂️", e)
        }
    }
}
