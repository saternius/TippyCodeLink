console.log("sketchfab.js")

// Sketchfab API Configuration
const API_TOKEN = "6948b6e2f3fa4f8e821fdc3250d16029";

let V = (attr) => {
    if(!this.vars[attr]) return null;
    return this.vars[attr].value;
}

// State
let currentResults = [];
let selectedModel = null;
let isLoading = false;

// Pagination state
let currentQuery = "";
let nextCursor = null;
let currentPage = 1;
let cursorHistory = [null]; // Track cursors for each page (page 1 = null cursor)

// Sanitize name for Firebase Realtime Database key
// Keys cannot contain: . $ # [ ] /
let sanatizeNameForFirebase = (name) => {
    if (!name) return "unnamed_model";
    return name
        .replace(/[.#$\[\]\/]/g, "_")  // Replace forbidden characters with underscore
        .replace(/\s+/g, "_")           // Replace whitespace with underscore
        .replace(/_+/g, "_")            // Collapse multiple underscores
        .replace(/^_|_$/g, "")          // Trim leading/trailing underscores
        .substring(0, 128)              // Limit length
        || "unnamed_model";             // Fallback if empty after sanitization
}

// Format large numbers (e.g., 1500000 -> "1.5M")
let formatNumber = (num) => {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + "M";
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + "K";
    }
    return num.toLocaleString();
}

// Color code face count (green = good, yellow = medium, red = high)
let getFaceCountColor = (count) => {
    if (count < 10000) return "#4ade80";      // Green - Low poly
    if (count < 50000) return "#a3e635";      // Light green - Acceptable
    if (count < 100000) return "#facc15";     // Yellow - Medium
    if (count < 500000) return "#fb923c";     // Orange - High
    return "#f87171";                          // Red - Very high
}

// Color code vertex count
let getVertexCountColor = (count) => {
    if (count < 5000) return "#4ade80";       // Green - Low
    if (count < 25000) return "#a3e635";      // Light green - Acceptable
    if (count < 50000) return "#facc15";      // Yellow - Medium
    if (count < 250000) return "#fb923c";     // Orange - High
    return "#f87171";                          // Red - Very high
}

// UI References
let panel = null;
let doc = null;
let container = null;
let headerLabel = null;
let resultsGrid = null;
let detailPanel = null;
let paginationBar = null;
let prevBtn = null;
let nextBtn = null;
let pageLabel = null;

// Search Sketchfab API
let searchSketchfab = async (query, cursor = null) => {
    let url = `https://api.sketchfab.com/v3/search?type=models&q=${encodeURIComponent(query)}&downloadable=true&count=12`;
    if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`;
    }
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Token ${API_TOKEN}` }
        });
        const data = await response.json();
        return {
            results: data.results || [],
            nextCursor: data.cursors?.next || null,
            prevCursor: data.cursors?.previous || null
        };
    } catch (error) {
        console.error("Sketchfab search error:", error);
        return { results: [], nextCursor: null, prevCursor: null };
    }
}

// Get download URL and spawn model
let downloadModel = async (uid, name) => {
    if (isLoading) return;
    isLoading = true;
    updateDetailButton("Downloading...");

    try {
        const url = `https://api.sketchfab.com/v3/models/${uid}/download`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Token ${API_TOKEN}` }
        });
        const data = await response.json();

        if (data.glb && data.glb.url) {
            await generateModel(name, data.glb.url);
            updateDetailButton("Downloaded!");
        } else {
            console.error("No GLB download available for this model");
            updateDetailButton("No GLB available");
        }
    } catch (error) {
        console.error("Download error:", error);
        updateDetailButton("Download Failed");
    }

    setTimeout(() => {
        isLoading = false;
        updateDetailButton("Download Model");
    }, 2000);
}

let generateModel = async (modelName, glbUrl) => {
    modelName = sanatizeNameForFirebase(modelName);
    let boxContainer = await LoadItem("BoxContainer", "Scene", {
        name: modelName,
    })
    let modelEntity = await AddEntity(boxContainer.id, modelName+"_model")
    let gltf = await AddComponent(modelEntity.id, "GLTF", {
        componentProperties: {
            url: glbUrl,
            addColliders: false,
            nonConvexColliders: false,
            childrenLayer: 20,
        }
    })
    modelEntity.Set("localPosition", {x: 0, y: 0, z: 0})
    modelEntity.Set("localScale", {x: 1, y: 1, z: 1})
}

// Handle var changes (query submission)
this.onVarChange = async (varName, snap) => {
    let value = snap.value;
    console.log("Sketchfab", "onVarChange", varName, value);

    if (varName === "query" && value) {
        await performSearch(value);
    }
}

// Perform search and update UI
let performSearch = async (query, cursor = null, isNewSearch = true) => {
    if (isLoading) return;
    isLoading = true;

    // Update header
    if (headerLabel) {
        headerLabel.text = `Searching: "${query}"...`;
    }

    // Clear previous results
    selectedModel = null;
    hideDetailPanel();

    // Reset pagination for new searches
    if (isNewSearch) {
        currentQuery = query;
        currentPage = 1;
        cursorHistory = [null]; // Reset history, page 1 has no cursor
    }

    // Fetch results
    const searchResult = await searchSketchfab(query, cursor);
    currentResults = searchResult.results;
    nextCursor = searchResult.nextCursor;

    // Update header with result count
    if (headerLabel) {
        headerLabel.text = `Sketchfab: "${query}" (Page ${currentPage})`;
    }

    // Render results
    renderResults();
    updatePaginationControls();
    isLoading = false;
}

// Navigate to next page
let goToNextPage = async () => {
    if (!nextCursor || isLoading) return;
    currentPage++;
    // Store the cursor for this new page so we can return to it
    if (cursorHistory.length < currentPage) {
        cursorHistory.push(nextCursor);
    }
    await performSearch(currentQuery, nextCursor, false);
}

// Navigate to previous page
let goToPrevPage = async () => {
    if (currentPage <= 1 || isLoading) return;
    currentPage--;
    // Use our stored cursor history to go back (page 1 = index 0 = null)
    const prevPageCursor = cursorHistory[currentPage - 1];
    await performSearch(currentQuery, prevPageCursor, false);
}

// Update pagination button states
let updatePaginationControls = () => {
    const canGoPrev = currentPage > 1;
    if (prevBtn) {
        prevBtn.style.opacity = canGoPrev ? "1" : "0.4";
        prevBtn.style.cursor = canGoPrev ? "pointer" : "default";
    }
    if (nextBtn) {
        nextBtn.style.opacity = nextCursor ? "1" : "0.4";
        nextBtn.style.cursor = nextCursor ? "pointer" : "default";
    }
    if (pageLabel) {
        pageLabel.text = `Page ${currentPage}`;
    }
}

// Render thumbnail grid
let renderResults = () => {
    if (!resultsGrid) return;

    // Clear existing children
    // Note: We rebuild the grid content each time
    if (resultsGrid._gridContent) {
        resultsGrid._gridContent.Destroy();
    }

    const gridContent = doc.CreateVisualElement();
    gridContent.style.display = "flex";
    gridContent.style.flexDirection = "row";
    gridContent.style.flexWrap = "wrap";
    gridContent.style.padding = "4px";
    gridContent.style.alignContent = "flex-start";
    resultsGrid._gridContent = gridContent;
    resultsGrid.AppendChild(gridContent);

    currentResults.forEach((model) => {
        const thumb = createThumbnail(model);
        gridContent.AppendChild(thumb);
    });
}

// Create a thumbnail element
let createThumbnail = (model) => {
    const thumbContainer = doc.CreateVisualElement();
    thumbContainer.style.width = "80px";
    thumbContainer.style.height = "80px";
    thumbContainer.style.margin = "4px";
    thumbContainer.style.borderRadius = "4px";
    thumbContainer.style.backgroundColor = "#2a2a2a";
    thumbContainer.style.cursor = "pointer";

    // Get thumbnail URL (prefer smaller size for grid)
    const thumbnailUrl = getThumbnailUrl(model, 100);
    if (thumbnailUrl) {
        thumbContainer.style.backgroundImage = `url(${thumbnailUrl})`;
        thumbContainer.style.backgroundSize = "cover";
        thumbContainer.style.backgroundPosition = "center";
    }

    // Hover effect
    thumbContainer.OnMouseEnter(() => {
        thumbContainer.style.borderWidth = "2px";
        thumbContainer.style.borderColor = "#0051e5";
    });

    thumbContainer.OnMouseLeave(() => {
        thumbContainer.style.borderWidth = "0px";
    });

    // Click to show detail
    thumbContainer.OnClick(() => {
        selectedModel = model;
        showDetailPanel(model);
    });

    return thumbContainer;
}

// Get thumbnail URL from model data
let getThumbnailUrl = (model, preferredSize) => {
    if (!model.thumbnails || !model.thumbnails.images) return null;

    const images = model.thumbnails.images;
    // Sort by size and find closest to preferred
    const sorted = images.sort((a, b) => a.width - b.width);

    // Find image closest to preferred size
    for (const img of sorted) {
        if (img.width >= preferredSize) {
            return img.url;
        }
    }

    // Return largest available if none match
    return sorted[sorted.length - 1]?.url || null;
}

// Show detail panel for selected model
let showDetailPanel = (model) => {
    if (!detailPanel) return;

    // Clear existing content
    if (detailPanel._content) {
        detailPanel._content.Destroy();
    }

    detailPanel.style.display = "flex";

    const content = doc.CreateVisualElement();
    content.style.display = "flex";
    content.style.flexDirection = "column";
    content.style.padding = "8px";
    content.style.height = "100%";
    detailPanel._content = content;
    detailPanel.AppendChild(content);

    // Large thumbnail
    const thumbLarge = doc.CreateVisualElement();
    thumbLarge.style.width = "100%";
    thumbLarge.style.height = "100px";
    thumbLarge.style.borderRadius = "4px";
    thumbLarge.style.marginBottom = "8px";
    thumbLarge.style.backgroundColor = "#2a2a2a";

    const largeThumbnailUrl = getThumbnailUrl(model, 256);
    if (largeThumbnailUrl) {
        thumbLarge.style.backgroundImage = `url(${largeThumbnailUrl})`;
        thumbLarge.style.backgroundSize = "cover";
        thumbLarge.style.backgroundPosition = "center";
    }
    content.AppendChild(thumbLarge);

    // Model name
    const nameLabel = doc.CreateLabel();
    nameLabel.text = model.name || "Untitled";
    nameLabel.style.color = "white";
    nameLabel.style.fontSize = "14px";
    nameLabel.style.fontWeight = "bold";
    nameLabel.style.marginBottom = "4px";
    nameLabel.style.whiteSpace = "normal";
    content.AppendChild(nameLabel);

    // Author
    const authorLabel = doc.CreateLabel();
    authorLabel.text = `By: ${model.user?.displayName || model.user?.username || "Unknown"}`;
    authorLabel.style.color = "#aaa";
    authorLabel.style.fontSize = "11px";
    authorLabel.style.marginBottom = "4px";
    content.AppendChild(authorLabel);

    // Social stats
    const statsLabel = doc.CreateLabel();
    const views = model.viewCount || 0;
    const likes = model.likeCount || 0;
    statsLabel.text = `Views: ${formatNumber(views)} | Likes: ${formatNumber(likes)}`;
    statsLabel.style.color = "#888";
    statsLabel.style.fontSize = "10px";
    statsLabel.style.marginBottom = "6px";
    content.AppendChild(statsLabel);

    // Performance section header
    const perfHeader = doc.CreateLabel();
    perfHeader.text = "Performance";
    perfHeader.style.color = "#0051e5";
    perfHeader.style.fontSize = "10px";
    perfHeader.style.fontWeight = "bold";
    perfHeader.style.marginTop = "4px";
    perfHeader.style.marginBottom = "2px";
    content.AppendChild(perfHeader);

    // Face count
    const faceCount = model.faceCount || 0;
    const faceLabel = doc.CreateLabel();
    faceLabel.text = `Faces: ${formatNumber(faceCount)}`;
    faceLabel.style.color = getFaceCountColor(faceCount);
    faceLabel.style.fontSize = "10px";
    content.AppendChild(faceLabel);

    // Vertex count
    const vertexCount = model.vertexCount || 0;
    const vertexLabel = doc.CreateLabel();
    vertexLabel.text = `Vertices: ${formatNumber(vertexCount)}`;
    vertexLabel.style.color = getVertexCountColor(vertexCount);
    vertexLabel.style.fontSize = "10px";
    content.AppendChild(vertexLabel);

    // Texture count
    if (model.textureCount !== undefined) {
        const textureLabel = doc.CreateLabel();
        textureLabel.text = `Textures: ${model.textureCount}`;
        textureLabel.style.color = "#888";
        textureLabel.style.fontSize = "10px";
        content.AppendChild(textureLabel);
    }

    // Animation info
    if (model.isAnimated || model.animationCount > 0) {
        const animLabel = doc.CreateLabel();
        const animCount = model.animationCount || 1;
        animLabel.text = `Animations: ${animCount}`;
        animLabel.style.color = "#f0a030";
        animLabel.style.fontSize = "10px";
        content.AppendChild(animLabel);
    }

    // Spacer
    const spacer = doc.CreateVisualElement();
    spacer.style.flexGrow = "1";
    spacer.style.minHeight = "8px";
    content.AppendChild(spacer);

    // Download button
    const downloadBtn = doc.CreateButton();
    downloadBtn.text = "Download Model";
    downloadBtn.style.backgroundColor = "#0051e5";
    downloadBtn.style.color = "white";
    downloadBtn.style.padding = "8px";
    downloadBtn.style.borderRadius = "4px";
    downloadBtn.style.fontSize = "12px";
    downloadBtn.style.cursor = "pointer";
    detailPanel._downloadBtn = downloadBtn;

    downloadBtn.OnClick(() => {
        if (selectedModel && !isLoading) {
            downloadModel(selectedModel.uid, selectedModel.name);
        }
    });

    content.AppendChild(downloadBtn);
}

// Hide detail panel
let hideDetailPanel = () => {
    if (detailPanel) {
        detailPanel.style.display = "none";
        if (detailPanel._content) {
            detailPanel._content.Destroy();
            detailPanel._content = null;
        }
    }
}

// Update download button text
let updateDetailButton = (text) => {
    if (detailPanel && detailPanel._downloadBtn) {
        detailPanel._downloadBtn.text = text;
    }
}

// Initialize UI
this.onStart = async () => {
    panel = this._entity.GetChild("UI");
    if(panel){
        Object.values(panel._bs.components).forEach(c => c.Destroy());
    }else{
        log("Sketchfab", "panel UI not founds", this._entity)
    }

    // Increase resolution for better grid display
    doc = new BS.BanterUI(new BS.Vector2(700, 350), false);
    await panel._bs.AddComponent(doc);
    doc.SetBackgroundColor(new BS.Vector4(0.12, 0.12, 0.12, 1));

    renderWindow();
}

// Render main window layout
let renderWindow = () => {
    if (container) {
        container.Destroy();
    }

    // Main container
    container = doc.CreateVisualElement();
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.width = "100%";

    // Header
    const header = doc.CreateVisualElement();
    header.style.display = "flex";
    header.style.flexDirection = "row";
    header.style.alignItems = "center";
    header.style.backgroundColor = "#0051e5";
    header.style.padding = "8px";
    header.style.minHeight = "30px";

    headerLabel = doc.CreateLabel();
    headerLabel.text = "Sketchfab Browser - Set 'query' var to search";
    headerLabel.style.color = "white";
    headerLabel.style.fontSize = "12px";
    headerLabel.style.fontWeight = "bold";
    header.AppendChild(headerLabel);

    container.AppendChild(header);

    // Main content area (grid + detail panel)
    const mainContent = doc.CreateVisualElement();
    mainContent.style.display = "flex";
    mainContent.style.flexDirection = "row";
    mainContent.style.flexGrow = "1";
    mainContent.style.overflow = "hidden";

    // Results grid (scrollable)
    resultsGrid = doc.CreateScrollView();
    resultsGrid.style.flexGrow = "1";
    resultsGrid.style.backgroundColor = "#1a1a1a";
    resultsGrid.verticalScrolling = true;
    resultsGrid.horizontalScrolling = false;
    mainContent.AppendChild(resultsGrid);

    // Detail panel (right side)
    detailPanel = doc.CreateVisualElement();
    detailPanel.style.width = "160px";
    detailPanel.style.backgroundColor = "#252525";
    detailPanel.style.borderLeft = "1px solid #333";
    detailPanel.style.display = "none"; // Hidden until model selected
    mainContent.AppendChild(detailPanel);

    container.AppendChild(mainContent);

    // Pagination bar
    paginationBar = doc.CreateVisualElement();
    paginationBar.style.display = "flex";
    paginationBar.style.flexDirection = "row";
    paginationBar.style.alignItems = "center";
    paginationBar.style.justifyContent = "center";
    paginationBar.style.backgroundColor = "#1a1a1a";
    paginationBar.style.padding = "8px";
    paginationBar.style.borderTop = "1px solid #333";
    paginationBar.style.minHeight = "36px";

    // Previous button
    prevBtn = doc.CreateButton();
    prevBtn.text = "← Prev";
    prevBtn.style.backgroundColor = "#0051e5";
    prevBtn.style.color = "white";
    prevBtn.style.padding = "6px 12px";
    prevBtn.style.borderRadius = "4px";
    prevBtn.style.fontSize = "11px";
    prevBtn.style.marginRight = "12px";
    prevBtn.style.opacity = "0.4";
    prevBtn.OnClick(() => goToPrevPage());
    paginationBar.AppendChild(prevBtn);

    // Page label
    pageLabel = doc.CreateLabel();
    pageLabel.text = "Page 1";
    pageLabel.style.color = "white";
    pageLabel.style.fontSize = "12px";
    pageLabel.style.minWidth = "60px";
    pageLabel.style.textAlign = "center";
    paginationBar.AppendChild(pageLabel);

    // Next button
    nextBtn = doc.CreateButton();
    nextBtn.text = "Next →";
    nextBtn.style.backgroundColor = "#0051e5";
    nextBtn.style.color = "white";
    nextBtn.style.padding = "6px 12px";
    nextBtn.style.borderRadius = "4px";
    nextBtn.style.fontSize = "11px";
    nextBtn.style.marginLeft = "12px";
    nextBtn.style.opacity = "0.4";
    nextBtn.OnClick(() => goToNextPage());
    paginationBar.AppendChild(nextBtn);

    container.AppendChild(paginationBar);
}

// Cleanup
this.onDestroy = async () => {
    if (doc) {
        await doc.Destroy();
    }
}
