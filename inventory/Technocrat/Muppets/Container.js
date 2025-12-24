this.onStart = ()=>{
    this._entity._bs.On("click", async (e) => {
        log("Container", "click", e.detail)
    })

    this._entity._bs.On("grab", async (e) => {
        log("Container", "grab", e.detail)
    })

    this._entity._bs.On("drop", async (e) => {
        log("Container", "drop", e.detail)
    })

    this._entity._bs.On("intersection", async (e) => {
        log("Container", "intersection", e.detail)
    })
}

this.onUpdate = ()=>{
    console.log("onUpdate")
}

this.onDestroy = ()=>{
    console.log("onDestroy")
}
