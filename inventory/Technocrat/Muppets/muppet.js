console.log("newbie2") 

let V = (attr) => {
    if(!this.vars[attr]) return null;
    return this.vars[attr].value;
}
// this.default = {}

// Object.entries(this.default).forEach(([key, val])=>{
//     if(!this.vars[key]) this.vars[key] = val
// })

let eyes = null; 
let dialogue = null;
let notificationAudio = null;
let breathingInterval = null;
let doc = null;
let antenna = null;
let antennaMaterial = null;
let openEyes = null;
let shutEyes = null;
let blink = ()=>{
    if(!V("enabled")) return;
    openEyes._set("active", false)
    shutEyes._set("active", true)
    setTimeout(()=>{
        openEyes._set("active", true)
        shutEyes._set("active", false)
        setTimeout(blink, 5000 + Math.random() * 10000)
    }, 160)
}

let closeEyes = ()=>{
    openEyes._set("active", false)
    shutEyes._set("active", true)
}

let thinking = false;
let antennaRot = 0;
let think = ()=>{
    if(!thinking && antennaRot % 90 === 0) return;
    antennaRot += 2;
    log("MUPPET", "thinking", antennaRot)
    antenna._set("localRotation", {
        x: antennaRot,
        y: 0,
        z: 0
    })
    setTimeout(think, 50)
}

let startThinking = ()=>{
    thinking = true;
    think();
}

let stopThinking = ()=>{
    thinking = false;
}


this.onStart = async ()=>{
    eyes = this._entity.GetChild("Eyes")
    eyes._set("localRotation", {
        x: 0,
        y: 0,
        z: 0,
        w: 1
    })
    eyes._set("localPosition", {
        x: 0,
        y: 1.5,
        z: 0
    })

    shutEyes = eyes.GetChild("Shut")
    openEyes = eyes.GetChild("Open")
    openEyes._set("active", true)
    shutEyes._set("active", false)

    if(V("enabled")) {
        blink();
    }else{
        closeEyes();
    }

    let offset = Math.random() * 2000;
    breathingInterval = setInterval(()=>{
        let ts = (Date.now() + offset) / 1000;
        eyes._set("localPosition", {
            x: 0,
            y: 1.5 + Math.sin(ts) * 0.0075,
            z: 0
        })
    }, 60)

    


    dialogue = this._entity.GetChild("Dialogue")
    notificationAudio = dialogue.getComponent("AudioSource")
    Object.values(dialogue._bs.components).forEach(c=>{
        if(c.componentType === BS.ComponentType.BanterUI){
            c.Destroy()
        }
    })
    doc = new BS.BanterUI(new BS.Vector2(512,512), false);
    await dialogue._bs.AddComponent(doc);
    //doc.SetBackgroundColor(new BS.Vector4(0.5, 0.31, 0.89, 1));
    window.dialogueUI = doc;
    renderDialogue();


    antenna = this._entity.GetChild("Antenna").GetChild("Bulb")
    antennaMaterial = antenna.GetComponent("Material")
    log("MUPPET", "antennaMaterial", antennaMaterial)

    this._entity._bs.On("click", e => {
        notificationAudio._bs.PlayOneShotFromUrl("https://app.tippy.dev/assets/audio/tick.mp3")
        let val = (typeof V("enabled") === "string") ? V("enabled") === "true" : V("enabled")
        log("MUPPET", "click", val)
        this._component.SetVar("enabled",!val)
    })

}

let lastDialogue = "";
this.onVarChange = (varName, snap)=>{
    let value = snap.value
    log("MUPPET", "onVarChange", varName, value)
    if(varName === "dialogue"){
        if(V("dialogue").length > lastDialogue.length){
            if(V("chatSfx").length > 0){
                if(!V("dialogue").endsWith("...")){
                    notificationAudio._bs.PlayOneShotFromUrl(V("chatSfx"))
                }
            }
        }
        renderDialogue();
        lastDialogue = V("dialogue");
    }

    if(varName === "listeningTo"){
        if(V("listeningTo").length > 0){
            antennaMaterial._set('color', {'r': 0, 'g': 1, 'b': 0, 'a': 1})
        }else{
            antennaMaterial._set('color', {'r': 0, 'g': 0, 'b': 0, 'a': 1})
        }
    }

    if(varName === "gazeRot"){
        if(V("enabled")){
            targetXRot = V("gazeRot");
        }
    }

    if(varName === "enabled"){
        if(V("enabled")){
            log("MUPPET", "starting blinking")
            blink();
        }else{
            log("MUPPET", "stopping blinking")
            closeEyes();
        }
    }

    if(varName === "thinking"){
        if(V("thinking")){
            log("MUPPET", "starting thinking")
            startThinking();
        }else{
            log("MUPPET", "stopping thinking")
            stopThinking();
        }
    }
}

let container = null;
let renderDialogue = ()=>{
    if(container){
        container.Destroy();
    }

    let bubbles = V("dialogue").split("--------").filter(b=>b.trim() !== "");
    if(bubbles.length === 0) return;
    log("MUPPET", "bubbles", bubbles)

    container = doc.CreateVisualElement();
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.width = "100%";
    container.style.justifyContent = "flex-end";


    
    bubbles.forEach(bubble => {
        let content = doc.CreateLabel();
        content.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
        content.style.padding = "10px";
        content.style.borderRadius = "5px";
        content.style.color = "white";
        content.style.fontSize="24px";
        content.style.flexWrap = 'wrap'
        content.style.whiteSpace = "normal"
        content.style.minWidth = "0px"
        content.style.maxWidth = '100%'
        content.style.textAlign = "center"
        content.style.flexShrink = 1;
        content.text = bubble;
        container.AppendChild(content);
    })

}


let targetXRot = 0;
let xRot = 0;
this.onUpdate = ()=>{
    let delta = (targetXRot - xRot)/10;
    xRot += delta;
    this._entity._set("localRotation", {
        x: xRot,
        y: 0,
        z: 0
    })
}

this.onDestroy = async ()=>{
    this._entity._bs.listeners.get("click").clear();
    clearInterval(breathingInterval)
    closeEyes();
    stopThinking();
    if(doc){
        try{
            await doc.Destroy();
        }catch(e){
            log("MUPPET", "could not destroy dialogue UI 🤷‍♂️", e)
        }
        
    }
}
