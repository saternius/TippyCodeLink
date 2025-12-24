let held = false;
let container = this._entity;
let container_id = this._entity.id;


function hexToRgb(hex) {
    const [r, g, b] = hex.match(/\w\w/g).map(c => parseInt(c, 16) / 255);
    return {r, g, b, a: 1};
}


let GetMyColor = ()=>{
    let color = scene.localUser.color;
    let rgba = hexToRgb(color);
    return rgba;
}

let getPointerMode = (rightHand)=>{
    return rightHand.getComponent("ScriptRunner").properties.vars['pointerMode'].value
}
let getBoundsMaterial = ()=>{
    let bounds = this._entity.GetChild("bounds");
    let material = bounds.GetComponent("Material");
    return material;
}
let setHeld = (value) => {
    held = value;
    let material = getBoundsMaterial();
    let myColor = GetMyColor();
    if(held){
        myColor.a = .5;
        material.Set("color", myColor)
        log("BoxContainer", "setHeld", true)
    }else{
        myColor.a = .1;
        material.Set("color", myColor)
        log("BoxContainer", "setHeld", false)
    }
    scene.SetBlockRightThumbstick(held)
    scene.SetBlockRightPrimary(held)
}

this.hideBounds = ()=>{
    let entity = this._entity.GetChild("bounds");
    entity.Set("active", false)
    log("BoxContainer", "hideBounds")
}

this.showBounds = ()=>{
    let entity = this._entity.GetChild("bounds");
    entity.Set("active", true)
    log("BoxContainer", "showBounds")
}

let boxClicked = (e)=>{
    console.log("click", e.detail)
    setHeld(true)
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



let boxRot = 0;
let handleMoveAxisUpdate = (detail, rightHand)=>{
    if(Math.abs(detail.x) < 0.2 && Math.abs(detail.y) < 0.2) return;
    let is_x = Math.abs(detail.x) > Math.abs(detail.y);
    if(is_x){
        let left = detail.x < 0;
        let speed = 5*Math.abs(detail.x);
        if(left){
            boxRot -= speed;
        }else{
            boxRot += speed;
        }
        let radians = boxRot * (Math.PI / 180);
        let halfAngle = radians / 2;
        container.Set("localRotation", {
            x: 0,
            y: Math.sin(halfAngle),
            z: 0,
            w: Math.cos(halfAngle)
        })
    }else{
        let up = detail.y > 0;
        let speed = 5*Math.abs(detail.y);
        log("push|pull", rightHand, container)
        let handPos = rightHand.position;
        let containerPos = container.position;
        let deltaX = ((handPos.x - containerPos.x)/30) * speed;
        let deltaY = ((handPos.y - containerPos.y)/30) * speed;
        let deltaZ = ((handPos.z - containerPos.z)/30) * speed;
        
        

        if(up){
            log("controller-axis-update", "up", deltaX, deltaY, deltaZ)
            let newPos = {
                x: containerPos.x - deltaX,
                y: containerPos.y - deltaY,
                z: containerPos.z - deltaZ
            }
            container.Set("position", newPos)
        }else{
            log("controller-axis-update", "down", deltaX, deltaY, deltaZ)

            let newPos = {
                x: containerPos.x + deltaX,
                y: containerPos.y + deltaY,
                z: containerPos.z + deltaZ
            }
            container.Set("position", newPos)
        }
    }
}

let handleScaleAxisUpdate = (detail, rightHand)=>{
    let scaleFactor = detail.y 
    let scaleTarget = 1 + (scaleFactor/15)
    container.Set("localScale", {
        x: container.localScale.x * scaleTarget,
        y: container.localScale.y * scaleTarget,
        z: container.localScale.z * scaleTarget
    })
}

let controllerAxisUpdate = async (e)=>{
    let detail = e.detail
    if(detail.hand !== 1) return;
    if(!held) return;
    let rightHand = await GetTracker("RIGHT_HAND");
    let pointerMode = getPointerMode(rightHand);
    if(pointerMode === 'move'){
        handleMoveAxisUpdate(detail, rightHand)
    }
    if(pointerMode === 'scale'){
        handleScaleAxisUpdate(detail, rightHand)
    }
}


let buttonPressed = async (e)=>{
    
    log("BoxContainer", "buttonPressed", e)
    if(!held) return;
    if(e.detail.side === BS.HandSide.RIGHT && e.detail.button === BS.ButtonType.PRIMARY){
        let rightHand = await GetTracker("RIGHT_HAND");
        let pointerMode = getPointerMode(rightHand);
        if(pointerMode === 'delete'){
            scene.SetBlockRightThumbstick(false)
            scene.SetBlockRightPrimary(false)
            await RemoveEntity(container_id);
        }else{
            container.Set("position", container.position)
            container.Set("rotation", container.rotation)
            await (new Promise(resolve => setTimeout(resolve, 100)))
            let clone = await CloneEntity(container_id)
        }
    }
}

this.onStart = async()=>{
    log("BoxContainer", "onStart")
    held = false;
    this._entity._bs.On("click", boxClicked);
    this._entity._bs.WatchTransform([BS.PropertyName.position, BS.PropertyName.rotation], ()=> console.log());
    scene.On("trigger-axis-update", triggerAxisUpdate)
    scene.On("controller-axis-update", controllerAxisUpdate)
    scene.On("button-pressed", buttonPressed)
    
}

this.onDestroy = ()=>{
    log("BoxContainer", "onDestroy")
    let clickListener = this._entity._bs.listeners.get("click")
    if(clickListener){
        clickListener.delete(boxClicked)
    }
    let triggerAxisUpdateListener = scene.listeners.get("trigger-axis-update")
    if(triggerAxisUpdateListener){
        triggerAxisUpdateListener.delete(triggerAxisUpdate)
    }
   
    let controllerAxisUpdateListener = scene.listeners.get("controller-axis-update")
    if(controllerAxisUpdateListener){
        controllerAxisUpdateListener.delete(controllerAxisUpdate)
    }

    let buttonPressedListener = scene.listeners.get("button-pressed")
    if(buttonPressedListener){
        buttonPressedListener.delete(buttonPressed)
    }
}
