console.log("picture.js")

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
    panel = this._entity.GetChild("UI")
    renderImage();
}

this.onVarChange = (varName, snap)=>{
    if(varName === "url"){
        renderImage();
    }
}


let getImageDimensions = async (url) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            resolve({
                width: this.width,
                height: this.height
            });
        };
        img.onerror = function() {
            reject(new Error('Failed to load image'));
        };
        img.src = url;
    });
}

let renderImage = async ()=>{
    let url = V("url")
    if(!url) return;


    let imgWidth = 512;
    let imgHeight = 512;

    if(url) {
        try {
            const dimensions = await getImageDimensions(url);
            imgWidth = dimensions.width;
            imgHeight = dimensions.height;
            log(`Picture`, `Image dimensions: ${imgWidth}x${imgHeight}`);
        } catch(e) {
            log(`Picture`, "Failed to get image dimensions, using default 512x512", e);
        }
    }


    if(doc){
        await doc.Destroy();
    }

    doc = await panel._bs.AddComponent(new BS.BanterUI(new BS.Vector2(imgWidth, imgHeight), false));
    doc.SetBackgroundColor(new BS.Vector4(0.00, 0.31, 0.89, 1));

    // Adjust entity scale based on resolution
    panel._set("localScale", {
        x: 1,
        y: 1,
        z: 1
    });
    
    if(container){
        container.Destroy();
    }
    container = doc.CreateVisualElement();
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.width = "100%";
    container.style.backgroundImage = `url(${url})`;
    container.style.backgroundSize = "cover";
    container.style.backgroundPosition = "center";
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
