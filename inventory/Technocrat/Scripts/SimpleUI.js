
let panel = null;
let doc = null;
let container = null;
let contentArea = null;
let V = (attr) => {
    if(!this.vars[attr]) return null;
    return this.vars[attr].value;
}

let renderPrompt = (promptContent)=>{
    if(container){
        container.Destroy();
    }
    container = doc.CreateVisualElement();
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.width = "100%";

    // Create content area for diff display
    contentArea = doc.CreateVisualElement();
    contentArea.style.overflowY = "auto";
    contentArea.style.margin = "4px";
    contentArea.style.backgroundColor = "#1e1e1e";
    contentArea.style.height = "100%";
    contentArea.style.padding = "8px";
    contentArea.style.borderRadius = "4px";

    const contentLabel = doc.CreateLabel();
    contentLabel.text = promptContent;
    contentLabel.style.color = "white";
    contentLabel.style.fontSize = "24px";
    contentLabel.style.textAlign = "left";
    contentLabel.style.width = "100%";
    contentLabel.style.flexWrap = 'wrap'
    contentLabel.style.whiteSpace = "normal"
    contentArea.AppendChild(contentLabel);
    container.AppendChild(contentArea);
}

this.onStart = async ()=>{
    panel = this._entity.GetChild("UI")
    Object.values(panel._bs.components).forEach(c=>c.Destroy())
    doc = new BS.BanterUI(new BS.Vector2(512,360), false);
    await panel._bs.AddComponent(doc);
    doc.SetBackgroundColor(new BS.Vector4(0, 0.31, 0.89, 1));
    renderPrompt(V("content"));
}


this.onVarChange = (varName, snap)=>{
    let value = snap.value
    if(varName === "content"){
        renderPrompt(value);
    }
}


this.onDestroy = async ()=>{
    console.log("onDestroy")
    if(doc){
        try{
            await doc.Destroy();
        }catch(e){
            log("SimpleUI", "could not destroy dialogue UI 🤷‍♂️", e)
        }
    }
}
