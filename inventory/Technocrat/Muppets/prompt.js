console.log("prompt.js")

let V = (attr) => {
    if(!this.vars[attr]) return null;
    return this.vars[attr].value;
}

let panel = null;
let doc = null;
let container = null;
let contentArea = null;
this.onStart = async ()=>{
    panel = this._entity.GetChild("UI")
    Object.values(panel._bs.components).forEach(c=>c.Destroy())
    doc = new BS.BanterUI(new BS.Vector2(600,1300), false);
    await panel._bs.AddComponent(doc);
    doc.SetBackgroundColor(new BS.Vector4(0, 0.31, 0.89, 1));
    window.promptUI = doc;
    log("Prompt", "Initialized Prompt UI", doc)
    renderPrompt("Data not Synced");

    this.varRef = net.db.ref(`space/${net.spaceId}/vars/${V("name")}`)
    this.varRef.on("value", (snapshot)=>{
        let data = snapshot.val();
        if(!data) return;
        log("Prompt", "Updating Prompt UI", data)
        renderPrompt(data);
    })
}

let renderPrompt = (promptContent)=>{
    if(container){
        container.Destroy();
    }
    panel._set("localScale", {"x": 1, "y": 1, "z": 1})

    container = doc.CreateVisualElement();
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.width = "100%";

    const header = doc.CreateVisualElement();
    header.style.display = "flex";
    header.style.flexDirection = "row";
    header.style.justifyContent = "space-between";
    header.style.backgroundColor = "#0051e5";
    header.style.paddingLeft = "8px";
    header.style.borderBottom = "1px solid #333";
    
    const title = doc.CreateLabel();
    title.text = V("name");
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
        //this.DestroySelf();
        log("Prompt", "TODO: Close Prompt")
    });

    header.AppendChild(title);
    header.AppendChild(closeButton);
    container.AppendChild(header);

    // Create content area for undo/redo items
    contentArea = doc.CreateVisualElement();
    contentArea.style.overflowY = "auto";
    contentArea.style.margin = "4px";
    contentArea.style.backgroundColor = "white";
    contentArea.style.height = "100%"

    const contentLabel = doc.CreateLabel();
    contentLabel.text = promptContent;
    contentLabel.style.color = "#000000";
    contentLabel.style.fontSize = "10px";
    contentLabel.style.textAlign = "left";
    contentLabel.style.width = "100%";
    contentLabel.style.flexWrap = 'wrap'
    contentLabel.style.whiteSpace = "normal"
    contentArea.AppendChild(contentLabel);

    container.AppendChild(contentArea);
    panel._set("localScale", {"x": 0.2, "y": 0.2, "z": 0.2})
}

this.onDestroy = async ()=>{
    if(doc){
        try{
            await doc.Destroy();
        }catch(e){
            log("MUPPET", "could not destroy dialogue UI 🤷‍♂️", e)
        }
    }
}
