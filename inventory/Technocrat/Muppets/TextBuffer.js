console.log("buffer2.js")

let V = (attr) => {
    if(!this.vars[attr]) return null;
    return this.vars[attr].value;
}

let panel = null;
let doc = null;
let container = null;
let contentArea = null;
let contentLabel = null;

this.onStart = async ()=>{

    this.height = 300;
    if(V('height')){
        this.height = V('height')
    }

    this.width = 600;
    if(V('width')){
        this.width = V('width')
    }

    panel = this._entity.GetChild("UI")
    Object.values(panel._bs.components).forEach(c=>c.Destroy())
    doc = new BS.BanterUI(new BS.Vector2(this.width, this.height), false);
    await panel._bs.AddComponent(doc);
    doc.SetBackgroundColor(new BS.Vector4(0.1, 0.1, 0.1, 1));
    renderWindow();
    renderBuffer("Data not Synced");

    this.varRef = net.db.ref(`space/${net.spaceId}/vars/${V("buffer")}`)
    this.varRef.on("value", (snapshot)=>{
        let data = snapshot.val();
        log("TextBuffer", "changed =>", data)
        if(data === null){
            data = "";
        }
        if(data === ""){
            solidifyBuffer();
        }else{
            unsolidifyBuffer();
            renderBuffer(data);
        }
    })

    
}

let renderWindow = ()=>{
    if(container){
        container.Destroy();
    }

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
    
    // Create content area for undo/redo items
    contentArea = doc.CreateVisualElement();
    contentArea.style.overflowY = "auto";
    contentArea.style.margin = "4px";
    contentArea.style.backgroundColor = "#1e1e1e";
    contentArea.style.height = "100%"
    contentArea.style.padding = "8px";

    contentLabel = doc.CreateLabel();
    contentLabel.style.color = "white";
    contentLabel.style.fontSize =`${V("fontSize")}px`;
    contentLabel.style.textAlign = "left";
    contentLabel.style.width = "100%";
    contentLabel.style.flexWrap = 'wrap'
    contentLabel.style.whiteSpace = "normal"

    contentArea.AppendChild(contentLabel);
    container.AppendChild(contentArea);
}

let renderBuffer = (promptContent)=>{
    contentLabel.text = promptContent;
}

let solidifyBuffer = ()=>{
    contentLabel.style.color = "grey";
}

let unsolidifyBuffer = ()=>{
    contentLabel.style.color = "white";
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
