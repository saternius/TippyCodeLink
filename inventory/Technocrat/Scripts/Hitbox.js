let V = (attr) => {
    if(!this.vars[attr]) return null;
    return this.vars[attr].value;
}

let setHeld = (value) => {
    held = value;
    let material = this._entity.GetComponent("Material");
    if(held){
        material._set("color", {r: .117, g: .988, b: .027, a: .8})
    }else{
        material._set("color", {r: .117, g: .988, b: .027, a: .4})
    }

    if(V("kinematic")){
        let rigidbody = this._entity.GetComponent("Rigidbody");
        rigidbody._set("isKinematic", !held)
    }

  
    let me = SM.myName();
    // SM.getEntityById(`People/${me}/TipTop`)._set("active", !held)
    // SM.getEntityById(`People/${me}/TipBottom`)._set("active", !held)
    // SM.getEntityById(`People/${me}/TipLeft`)._set("active", !held)
    // SM.getEntityById(`People/${me}/TipRight`)._set("active", !held)
    // SM.getEntityById(`People/${me}/TipFront`)._set("active", !held)
    // SM.getEntityById(`People/${me}/TipBack`)._set("active", !held)
 
}

let triggerAxisUpdate = (e)=>{
    let detail = e.detail
    if(detail.hand !== 1) return;
    if(detail.value !== 0 && detail.value !== 1) return;
    log("trigger-axis-update", detail)
    if(detail.value === 0){
        setHeld(false)
    }
}

let boxClicked = (e)=>{
    console.log("click", e.detail)
    setHeld(true)
}


let initializeElements = async ()=>{
    let me = SM.myName();
    if(!SM.getEntityById(`People/${me}/Trackers/RIGHT_HAND`)){
        showNotification("Error: RIGHT_HAND Tracker not found")
        return;
    }

    if(!SM.getEntityById(`People/${me}/TipTop`)){
        await LoadItem('TipTop', `People/${me}`, {name: 'TipTop'})
    }
    if(!SM.getEntityById(`People/${me}/TipBottom`)){
        await LoadItem('TipBottom', `People/${me}`, {name: 'TipBottom'})
    }
    if(!SM.getEntityById(`People/${me}/TipLeft`)){
        await LoadItem('TipLeft', `People/${me}`, {name: 'TipLeft'})
    }
    if(!SM.getEntityById(`People/${me}/TipRight`)){
        await LoadItem('TipRight', `People/${me}`, {name: 'TipRight'})
    }
    if(!SM.getEntityById(`People/${me}/TipFront`)){
        await LoadItem('TipFront', `People/${me}`, {name: 'TipFront'})
    }
    if(!SM.getEntityById(`People/${me}/TipBack`)){
        await LoadItem('TipBack', `People/${me}`, {name: 'TipBack'})
    }
}

this.handleEvent = async (e)=>{
    if(SM.selectedEntity !== this._entity.id) return;
    log("Hitbox", "I was selected", SM.selectedEntity)
    await initializeElements();
    SM.getAllScriptRunners().filter(x=>x.properties.file === "HitboxArrow.js").forEach(x=>{
        x._setVar("colliderId", this._entity.id)
    })
}

this.onStart = ()=>{
    this._entity.WatchTransform(["position", "rotation"]);
    this._entity._bs.On("click", boxClicked);
    scene.On("trigger-axis-update", triggerAxisUpdate)
    window.addEventListener("entitySelected", this.handleEvent)
}

// this.onUpdate = ()=>{
//     console.log("onUpdate")
// }

this.onDestroy = ()=>{
    console.log("onDestroy")
    window.removeEventListener("entitySelected", this.handleEvent)
}
