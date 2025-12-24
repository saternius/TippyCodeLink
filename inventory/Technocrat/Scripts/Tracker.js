console.log("tracker.js")

let V = (attr) => {
    if(!this.vars[attr]) return null;
    return this.vars[attr].value;
}

let modes = ["move", "scale", "hide", "delete"]
let buttonPressed = (e)=>{
    let actualEnt = SM.getEntityById(this._entity.id);
    let mode = V('pointerMode')

    //log("Tracker", "buttonPressed", e)
    if(e.detail.side === BS.HandSide.RIGHT && e.detail.button === BS.ButtonType.THUMBSTICKCLICK){
        let newMode = modes[(modes.indexOf(mode) + 1) % modes.length]
        actualEnt.getComponent("ScriptRunner").SetVar("pointerMode", newMode)
        if(newMode === 'delete'){
            for( let name in containers){
                containers[name].style.backgroundColor = "red";
            }
        }else{
            for( let name in containers){
                containers[name].style.backgroundColor = "transparent";
            }
        }


        let boundCtxs = SM.getAllScriptRunners().filter(x=>x.properties.file === "BoxContainer.js").map(x=>x.ctx)
        if(newMode === 'hide'){
            boundCtxs.forEach(x=>x.hideBounds())
        }else{
            boundCtxs.forEach(x=>x.showBounds())
        }
        
        renderState();
    }
}

let panels = {};
let docs = {};
let containers = {};
let contentLabels = {};
let makePanel = async (entity, name)=>{
    let panel = entity.GetChild(name);
    if(docs[name]){
        docs[name].Destroy();
    }
    docs[name] = await panel._bs.AddComponent(new BS.BanterUI(new BS.Vector2(256, 256), false));

    panel._set("localScale", {
        x: 256 / (2048*8),
        y: 256 / (2048*8),
        z: 1
    });

    if(containers[name]){
        containers[name].Destroy();
    }
    containers[name] = docs[name].CreateVisualElement();
    containers[name].style.display = "flex";
    containers[name].style.flexDirection = "column";
    containers[name].style.height = "100%";
    containers[name].style.width = "100%";

    if(contentLabels[name]){
        contentLabels[name].Destroy();
    }
    contentLabels[name] = docs[name].CreateLabel();
    contentLabels[name].style.color = "white";
    contentLabels[name].style.fontSize = "60px";
    contentLabels[name].style.fontWeight = "bold";
    contentLabels[name].style.textAlign = "center";
    contentLabels[name].style.width = "100%";
    contentLabels[name].style.height = "100%";
    contentLabels[name].text = this.pointerMode;
    containers[name].AppendChild(contentLabels[name]);
}

this.pointerMode = 'move';
this.onStart = async ()=>{
    scene.On("button-pressed", buttonPressed)
    let actualEnt = SM.getEntityById(this._entity.id);
    await makePanel(actualEnt, "UI");
    await makePanel(actualEnt, "UI2");
    await makePanel(actualEnt, "UI3");
    await makePanel(actualEnt, "UI4");
    renderState();
}

this.onVarChange = (varName, snap)=>{
    renderState();
}


let renderState = async ()=>{
    for(let name in contentLabels){
        contentLabels[name].text = V('pointerMode');
    }
}


this.onDestroy = async ()=>{
    for(let name in docs){
        docs[name].Destroy();
    }
    for(let name in containers){
        containers[name].Destroy();
    }
    for(let name in contentLabels){
        contentLabels[name].Destroy();
    }
    let buttonPressedListener = scene.listeners.get("button-pressed")
    if(buttonPressedListener){
        buttonPressedListener.delete(buttonPressed)
    }
}
