(async ()=>{
    // let whiteboard = SM.getEntityById("Scene/MainRoom/WhiteBoard");
    // let description = SM.getEntityById("Scene/MainRoom/Descriptions");
    //whiteboard.Set("active", false)
    //description.Set("active", false)

    console.log("STARTUP SCRIPT")
    const settings = new BS.SceneSettings();
    
    settings.EnableDevTools = true;
    settings.EnableTeleport = true;
    settings.EnableForceGrab = true;
    settings.EnableSpiderMan = false;
    settings.EnablePortals = true;
    settings.EnableGuests = true;
    settings.EnableQuaternionPose = false;
    settings.EnableControllerExtras = false;
    settings.EnableFriendPositionJoin = true;
    settings.EnableDefaultTextures = true;
    settings.EnableAvatars = true;
    settings.MaxOccupancy = 20;
    settings.RefreshRate = 72;
    settings.ClippingPlane = new BS.Vector2(0.02, 1500);
    settings.SpawnPoint = new BS.Vector4(0, 10, 0, 90); // x,y,z is position. w is Y rotation
    await scene.SetSettings(settings);
})()