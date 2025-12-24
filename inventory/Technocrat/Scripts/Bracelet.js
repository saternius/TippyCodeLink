
const attachmentPoints = {
    HEAD: 0,
    BODY: 1,
    LEFT_HAND: 2,
    RIGHT_HAND: 3,
    COCKPIT: 4,
}

function hexToRgb(hex) {
    const [r, g, b] = hex.match(/\w\w/g).map(c => parseInt(c, 16) / 255);
    return {r, g, b, a: 1};
}

let makeTracker = async ()=>{
    let position = "RIGHT_HAND";
    let me = SM.myName();
    let color = scene.localUser.color;
    let rgba = hexToRgb(color);
    let peopleHasMe = SM.getEntityById(`People/${me}`, false);
    if(!peopleHasMe){
        await AddEntity("People", me);
    }
    let meHasTrackers = SM.getEntityById(`People/${me}/Trackers`, false);
    if(!meHasTrackers){
        await AddEntity("People/"+me, "Trackers");
    }

    let meHasTrackerRightHand = SM.getEntityById(`People/${me}/Trackers/${position}`, false);
    if(!meHasTrackerRightHand){
        let tracker = await LoadItem('Tracker', `People/${me}/Trackers`, {name: position});
        let material = tracker.getComponent("Material");
        material.Set("color", rgba);
        let attachment = tracker.getComponent("AttachedObject");
        attachment.Set("attachmentPoint", attachmentPoints[position]);
        attachment.Set("uid", scene.localUser.uid);
        tracker._bs.WatchTransform([BS.PropertyName.position, BS.PropertyName.localRotation], ()=> console.log());
    }
}


this.onStart = async ()=>{
    let existingBtn = document.getElementById("bracelet-btn")
    if (existingBtn) {
        existingBtn.remove()
    }

    let navControls = document.querySelector(".nav-controls")
    let tooltipBtn = document.createElement("button")
    tooltipBtn.classList.add("nav-control-btn")
    tooltipBtn.innerHTML = "<span>📿</span>"
    tooltipBtn.id = "bracelet-btn"
    navControls.appendChild(tooltipBtn)

    tooltipBtn.addEventListener("click", (e)=>{
        makeTracker();
    })

    window.GetTracker = async (name)=>{
        let me = SM.myName();
        let tracker = SM.getEntityById(`People/${me}/Trackers/${name}`, false);
        if(!tracker){
            log("Trackers", "Tracker not found: ", name, "waiting..");
            await new Promise(resolve => setTimeout(resolve, 500));
            return await GetTracker(name);
        }else{
            return tracker;
        }
    }
}