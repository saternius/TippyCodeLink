console.log("rotating cube") 

let V = (attr) => {
    if(!this.vars[attr]) return null;
    return this.vars[attr].value;
}


this.onStart = ()=>{
    console.log("onStart")
}

let xRot = 0;
this.onUpdate = ()=>{
    xRot += V("speed");
    this._entity._set("localRotation", {
        x: xRot,
        y: xRot,
        z: xRot
    })
}

this.onDestroy = ()=>{
    console.log("onDestroy")
}
