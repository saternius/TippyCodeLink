console.log("bounder")
this.onStart = ()=>{
    console.log("onStart")
    window.addEventListener("entitySelected", this.handleEvent)
}

this.handleEvent = async (e) => {
    console.log("handleEvent", e)
    let bounds = await sel()._bs.GetBounds()
    console.log(SM.selectedEntity, bounds)
    this._entity._set("position", {
        x: bounds.center.x,
        y: bounds.center.y,
        z: bounds.center.z
    })
    
    this._entity._set("localScale", {
        x: bounds.size.x,
        y: bounds.size.y,
        z: bounds.size.z
    })
}

this.onDestroy = ()=>{
    console.log("onDestroy")
    window.removeEventListener( "entitySelected", this.handleEvent)
}
