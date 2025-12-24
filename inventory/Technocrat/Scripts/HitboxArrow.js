

let V = (attr) => {
    if(!this.vars[attr]) return null;
    return this.vars[attr].value;
}

// Store initial state when grabbed
let initialHitboxPos = null;
let initialHitboxScale = null;
let initialArrowPos = null;

let setHeld = (value) => {
    held = value;
    let material = this._entity.GetChild("Cone").GetComponent("Material");
    if(held){
        material._set("color", {r: 1, g: 0, b: 0, a: 1})
        // Capture initial state when grab starts
        let hitbox = SM.getEntityById(V("colliderId"));
        if(hitbox){
            initialHitboxPos = {...hitbox.position};
            initialHitboxScale = {...hitbox.localScale};
            initialArrowPos = {...this._entity.position};
        }
    }else{
        material._set("color", {r:1, g:1, b:1, a:1})
        // Clear initial state when released
        initialHitboxPos = null;
        initialHitboxScale = null;
        initialArrowPos = null;
    }
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

let arrowClicked = (e)=>{
    console.log("click", e.detail)
    setHeld(true)
}

let rightHand = null;
let side = null;
this.onStart = async ()=>{
    this._entity._bs.On("click", arrowClicked);
    this._entity.WatchTransform(["position"]);
    scene.On("trigger-axis-update", triggerAxisUpdate)
    rightHand = await GetTracker("RIGHT_HAND");
    side = V('side')
}

this.onUpdate = ()=>{
    if(!side) return;
    let hitbox = SM.getEntityById(V("colliderId"))
    //log("HitboxArrow", "hitbox", hitbox)
    if(!hitbox) return;
    let hitPos = hitbox.position;
    let hitRot = hitbox.rotation;
    let my_pos = this._entity.position;

    let playerDist = Math.sqrt(Math.pow(rightHand.position.x - my_pos.x, 2) + Math.pow(rightHand.position.y - my_pos.y, 2) + Math.pow(rightHand.position.z - my_pos.z, 2));
    //log("HitboxArrow", "playerDist", playerDist)
    this._entity._set("localScale", {
        x: Math.min(playerDist/20, .2),
        y: Math.min(playerDist/20, .2),
        z: Math.min(playerDist/20, .2)
    })


    if(!held){
        // Position arrow based on side
        let arrowOffset = Math.min(playerDist/20, .2);
        let newPos = {x: hitPos.x, y: hitPos.y, z: hitPos.z};

        switch(side){
            case 'top':
                newPos.y = hitPos.y + hitbox.localScale.y/2 + arrowOffset;
                break;
            case 'bottom':
                newPos.y = hitPos.y - hitbox.localScale.y/2 - arrowOffset;
                break;
            case 'right':
                newPos.x = hitPos.x + hitbox.localScale.x/2 + arrowOffset;
                break;
            case 'left':
                newPos.x = hitPos.x - hitbox.localScale.x/2 - arrowOffset;
                break;
            case 'front':
                newPos.z = hitPos.z + hitbox.localScale.z/2 + arrowOffset;
                break;
            case 'back':
                newPos.z = hitPos.z - hitbox.localScale.z/2 - arrowOffset;
                break;
        }

        this._entity._set("position", newPos);
    }else if(initialArrowPos && initialHitboxScale && initialHitboxPos){
        // Calculate delta and apply scale/translation based on side
        let delta = 0;
        let newScale = {...hitbox.localScale};
        let newPos = {...initialHitboxPos};

        switch(side){
            case 'top':
                // Pulling up (positive Y) extends top
                delta = my_pos.y - initialArrowPos.y;
                newScale.y = Math.max(0.01, initialHitboxScale.y + delta);
                newPos.y = initialHitboxPos.y + delta / 2;
                break;
            case 'bottom':
                // Pulling down (negative Y) extends bottom
                delta = initialArrowPos.y - my_pos.y;
                newScale.y = Math.max(0.01, initialHitboxScale.y + delta);
                newPos.y = initialHitboxPos.y - delta / 2;
                break;
            case 'right':
                // Pulling right (positive X) extends right
                delta = my_pos.x - initialArrowPos.x;
                newScale.x = Math.max(0.01, initialHitboxScale.x + delta);
                newPos.x = initialHitboxPos.x + delta / 2;
                break;
            case 'left':
                // Pulling left (negative X) extends left
                delta = initialArrowPos.x - my_pos.x;
                newScale.x = Math.max(0.01, initialHitboxScale.x + delta);
                newPos.x = initialHitboxPos.x - delta / 2;
                break;
            case 'front':
                // Pulling forward (positive Z) extends front
                delta = my_pos.z - initialArrowPos.z;
                newScale.z = Math.max(0.01, initialHitboxScale.z + delta);
                newPos.z = initialHitboxPos.z + delta / 2;
                break;
            case 'back':
                // Pulling back (negative Z) extends back
                delta = initialArrowPos.z - my_pos.z;
                newScale.z = Math.max(0.01, initialHitboxScale.z + delta);
                newPos.z = initialHitboxPos.z - delta / 2;
                break;
        }

        log("HitboxArrow", "side", side, "delta", delta)

        hitbox._set("localScale", newScale);
        hitbox._set("position", newPos);
    }


    this._entity._set("rotation", {
        x: hitRot.x,
        y: hitRot.y,
        z: hitRot.z,
        w: hitRot.w
    })


   
    //console.log("hitbox: ", hitPos)
}

this.onDestroy = ()=>{
    console.log("onDestroy")
    let clickListener = this._entity._bs.listeners.get("click")
    if(clickListener){
        clickListener.delete(arrowClicked)
    }
    let triggerAxisUpdateListener = scene.listeners.get("trigger-axis-update")
    if(triggerAxisUpdateListener){
        triggerAxisUpdateListener.delete(triggerAxisUpdate)
    }
}
