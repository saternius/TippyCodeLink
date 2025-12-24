this.default = {}

let getEntity = (entityPath)=>{
    let rel_path = this._entity.parentId+"/"+entityPath
    return SM.getEntityById(rel_path)
}


let user = SM.myName()
let held = false;
let lastParent = "Scene";
this.onStart = ()=>{
    this._entity.WatchTransform(["position", "rotation"]);
    this._entity.keepPositionOnParenting = true;
    let user = SM.myName()
    this._entity._bs.On("click", async (e) => {
        if(held){
            let localPosition = this._entity.position;
            let localRotation = this._entity.rotation;
            await this._entity.SetParent(lastParent)
            await this._entity.Set("localPosition", localPosition)
            await this._entity.Set("localRotation", localRotation)
           
        }else{
            log("Grabbable", "click", e.detail)
            let tippyHolderPath = "People/"+user+"/Trackers/RIGHT_HAND/Holder";
            let tippyHolder = SM.getEntityById(tippyHolderPath)
            log("Grabbable", `RIGHT_HAND HOLDER => ${tippyHolderPath}`, tippyHolder)
            if(!tippyHolder){
                showNotification("Error: RIGHT_HAND Holder not found")
                return;
            }
            let localPosition = this._entity.localPosition;
            let localRotation = this._entity.localRotation;
            await this._entity.Set("localPosition", {x: 0, y: 0, z: 0})
            await this._entity.Set("localRotation", {x: 0, y: 0, z: 0})
            await this._entity.Set("position", localPosition)
            await this._entity.Set("rotation", localRotation)
            await tippyHolder.Set("position", e.detail.point)
            lastParent = this._entity.parentId;
           
            this._entity.SetParent(tippyHolderPath)
        }
        held = !held;
        // holdingBarHack()
    })
}

// this.onUpdate = ()=>{
//     // if(held){
//     //     log("Grabbable", "transform", this._entity.position, this._entity.rotation)
//     // }
// }

this.onDestroy = ()=>{
    this._entity._bs.listeners.get("click").clear();
}