// InspectorFab - Sketchfab Browser as Inspector Tab
// Searches and downloads 3D models from Sketchfab

class InspectorFab {
    constructor() {
        // Sketchfab API Configuration
        this.API_TOKEN = "6948b6e2f3fa4f8e821fdc3250d16029";

        // State
        this.currentResults = [];
        this.selectedModel = null;
        this.isLoading = false;

        // Pagination state
        this.currentQuery = "";
        this.nextCursor = null;
        this.currentPage = 1;
        this.cursorHistory = [null];
    }

    // Sanitize name for Firebase Realtime Database key
    sanitizeNameForFirebase(name) {
        if (!name) return "unnamed_model";
        return name
            .replace(/[.#$\[\]\/]/g, "_")
            .replace(/\s+/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "")
            .substring(0, 128)
            || "unnamed_model";
    }

    // Format large numbers (e.g., 1500000 -> "1.5M")
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + "M";
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + "K";
        }
        return num.toLocaleString();
    }

    // Color code face count
    getFaceCountColor(count) {
        if (count < 10000) return "#4ade80";
        if (count < 50000) return "#a3e635";
        if (count < 100000) return "#facc15";
        if (count < 500000) return "#fb923c";
        return "#f87171";
    }

    // Color code vertex count
    getVertexCountColor(count) {
        if (count < 5000) return "#4ade80";
        if (count < 25000) return "#a3e635";
        if (count < 50000) return "#facc15";
        if (count < 250000) return "#fb923c";
        return "#f87171";
    }

    async init() {
        const pageElement = this.generatePage();
        this.setupUI();
        return pageElement;
    }

    generatePage() {
        log("inspectorfab", "generatePage");

        // Check if page already exists
        const existingPage = document.getElementById('inspectorfab-page');
        if (existingPage) {
            log("inspectorfab", "Page already exists, skipping creation");
            return existingPage;
        }

        const pageElement = document.createElement('div');
        pageElement.id = 'inspectorfab-page';
        pageElement.className = 'page';
        pageElement.innerHTML = `
            <div class="inspectorfab-container" style="padding: 20px; max-width: 1200px; margin: 0 auto; height: 100%; display: flex; flex-direction: column;">
                <h1 style="color: #fff; margin-bottom: 10px;">🎨 Sketchfab Browser</h1>
                <p style="color: #aaa; margin-bottom: 20px;">Search and download 3D models from Sketchfab</p>

                <!-- Search Section -->
                <div class="search-section" style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                    <div style="display: flex; gap: 10px;">
                        <input
                            type="text"
                            id="inspectorfabSearch"
                            placeholder="Search for 3D models..."
                            style="flex: 1; padding: 12px 15px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: #fff; font-size: 14px;"
                        />
                        <button
                            id="inspectorfabSearchBtn"
                            style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 4px; padding: 12px 24px; color: #fff; cursor: pointer; font-size: 14px; font-weight: 600;"
                        >
                            Search
                        </button>
                    </div>
                </div>

                <!-- Main Content Area -->
                <div style="display: flex; gap: 20px; flex: 1; min-height: 0; overflow: hidden;">
                    <!-- Results Grid -->
                    <div style="flex: 1; display: flex; flex-direction: column; min-width: 0;">
                        <div id="inspectorfabHeader" style="color: #888; font-size: 12px; margin-bottom: 10px;">
                            Enter a search query to find models
                        </div>
                        <div id="inspectorfabResults" style="flex: 1; overflow-y: auto; display: flex; flex-wrap: wrap; gap: 10px; align-content: flex-start; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 10px;">
                            <!-- Results will be populated here -->
                        </div>

                        <!-- Pagination -->
                        <div id="inspectorfabPagination" style="display: none; justify-content: center; align-items: center; gap: 20px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-top: 10px;">
                            <button id="inspectorfabPrevBtn" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 8px 16px; color: #fff; cursor: pointer; font-size: 12px;">
                                ← Previous
                            </button>
                            <span id="inspectorfabPageLabel" style="color: #fff; font-size: 14px;">Page 1</span>
                            <button id="inspectorfabNextBtn" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 8px 16px; color: #fff; cursor: pointer; font-size: 12px;">
                                Next →
                            </button>
                        </div>
                    </div>

                    <!-- Detail Panel -->
                    <div id="inspectorfabDetail" style="width: 280px; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 15px; display: none; flex-direction: column;">
                        <!-- Detail content will be populated here -->
                    </div>
                </div>

                <!-- Status Message -->
                <div id="inspectorfabStatus" style="display: none; padding: 12px; border-radius: 4px; font-size: 14px; margin-top: 15px;"></div>
            </div>
        `;

        // Add to page container
        const pageContainer = document.querySelector('.page-container');
        if (pageContainer) {
            pageContainer.appendChild(pageElement);
            log("inspectorfab", "Page element added to page-container");
        } else {
            err("inspectorfab", "Could not find .page-container");
        }

        this.injectStyles();
        return pageElement;
    }

    injectStyles() {
        if (document.getElementById('inspectorfab-styles')) return;

        const styleEl = document.createElement('style');
        styleEl.id = 'inspectorfab-styles';
        styleEl.textContent = `
            .inspectorfab-thumb {
                width: 120px;
                height: 120px;
                border-radius: 8px;
                background-color: #2a2a2a;
                background-size: cover;
                background-position: center;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
                border: 2px solid transparent;
            }
            .inspectorfab-thumb:hover {
                transform: scale(1.05);
                border-color: #667eea;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            }
            .inspectorfab-thumb.selected {
                border-color: #667eea;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
            }
            #inspectorfabStatus.success {
                background: rgba(72, 187, 120, 0.2);
                border: 1px solid rgba(72, 187, 120, 0.5);
                color: #48bb78;
            }
            #inspectorfabStatus.error {
                background: rgba(255, 0, 0, 0.2);
                border: 1px solid rgba(255, 0, 0, 0.5);
                color: #ff6b6b;
            }
            #inspectorfabStatus.info {
                background: rgba(66, 153, 225, 0.2);
                border: 1px solid rgba(66, 153, 225, 0.5);
                color: #4299e1;
            }
            .inspectorfab-detail-thumb {
                width: 100%;
                height: 160px;
                border-radius: 8px;
                background-size: cover;
                background-position: center;
                background-color: #2a2a2a;
                margin-bottom: 15px;
            }
            .inspectorfab-stat {
                display: flex;
                justify-content: space-between;
                padding: 4px 0;
                font-size: 12px;
            }
            .inspectorfab-stat-label {
                color: #888;
            }
            .inspectorfab-download-btn {
                width: 100%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none;
                border-radius: 4px;
                padding: 12px;
                color: #fff;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                margin-top: auto;
                transition: opacity 0.2s;
            }
            .inspectorfab-download-btn:hover {
                opacity: 0.9;
            }
            .inspectorfab-download-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .inspectorfab-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 200px;
                color: #888;
            }
            .inspectorfab-spinner {
                width: 30px;
                height: 30px;
                border: 3px solid rgba(255,255,255,0.1);
                border-top-color: #667eea;
                border-radius: 50%;
                animation: inspectorfab-spin 1s linear infinite;
                margin-right: 10px;
            }
            @keyframes inspectorfab-spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(styleEl);
    }

    setupUI() {
        // Search button
        const searchBtn = document.getElementById('inspectorfabSearchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('mousedown', () => this.handleSearch());
        }

        // Search input - enter key
        const searchInput = document.getElementById('inspectorfabSearch');
        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.handleSearch();
                }
            });
        }

        // Pagination buttons
        const prevBtn = document.getElementById('inspectorfabPrevBtn');
        if (prevBtn) {
            prevBtn.addEventListener('mousedown', () => this.goToPrevPage());
        }

        const nextBtn = document.getElementById('inspectorfabNextBtn');
        if (nextBtn) {
            nextBtn.addEventListener('mousedown', () => this.goToNextPage());
        }

        // Listen for page switches
        window.addEventListener('page-switched', (e) => {
            const page = document.getElementById('inspectorfab-page');
            if (!page) return;

            if (e.detail.pageId === 'inspectorfab') {
                log("inspectorfab", "Page switched to inspectorfab");
                page.classList.add('active');
            } else {
                page.classList.remove('active');
            }
        });
    }

    handleSearch() {
        const searchInput = document.getElementById('inspectorfabSearch');
        const query = searchInput?.value.trim();
        if (query) {
            this.performSearch(query);
        }
    }

    // Search Sketchfab API
    async searchSketchfab(query, cursor = null) {
        let url = `https://api.sketchfab.com/v3/search?type=models&q=${encodeURIComponent(query)}&downloadable=true&count=12`;
        if (cursor) {
            url += `&cursor=${encodeURIComponent(cursor)}`;
        }
        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Token ${this.API_TOKEN}` }
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

    async performSearch(query, cursor = null, isNewSearch = true) {
        if (this.isLoading) return;
        this.isLoading = true;

        const headerEl = document.getElementById('inspectorfabHeader');
        const resultsEl = document.getElementById('inspectorfabResults');

        // Update header
        if (headerEl) {
            headerEl.textContent = `Searching for "${query}"...`;
        }

        // Show loading state
        if (resultsEl) {
            resultsEl.innerHTML = `
                <div class="inspectorfab-loading">
                    <div class="inspectorfab-spinner"></div>
                    <span>Searching...</span>
                </div>
            `;
        }

        // Reset state for new search
        this.selectedModel = null;
        this.hideDetailPanel();

        if (isNewSearch) {
            this.currentQuery = query;
            this.currentPage = 1;
            this.cursorHistory = [null];
        }

        // Fetch results
        const searchResult = await this.searchSketchfab(query, cursor);
        this.currentResults = searchResult.results;
        this.nextCursor = searchResult.nextCursor;

        // Update header
        if (headerEl) {
            headerEl.textContent = `Results for "${query}" (Page ${this.currentPage})`;
        }

        // Render results
        this.renderResults();
        this.updatePaginationControls();
        this.isLoading = false;
    }

    renderResults() {
        const resultsEl = document.getElementById('inspectorfabResults');
        if (!resultsEl) return;

        if (this.currentResults.length === 0) {
            resultsEl.innerHTML = `
                <div style="width: 100%; text-align: center; padding: 40px; color: #888;">
                    No downloadable models found. Try a different search term.
                </div>
            `;
            return;
        }

        resultsEl.innerHTML = '';

        this.currentResults.forEach((model) => {
            const thumb = this.createThumbnail(model);
            resultsEl.appendChild(thumb);
        });
    }

    createThumbnail(model) {
        const thumbEl = document.createElement('div');
        thumbEl.className = 'inspectorfab-thumb';
        thumbEl.title = model.name || 'Untitled';

        // Get thumbnail URL
        const thumbnailUrl = this.getThumbnailUrl(model, 200);
        if (thumbnailUrl) {
            thumbEl.style.backgroundImage = `url(${thumbnailUrl})`;
        }

        // Click handler
        thumbEl.addEventListener('mousedown', () => {
            // Remove selected from all thumbs
            document.querySelectorAll('.inspectorfab-thumb').forEach(t => t.classList.remove('selected'));
            thumbEl.classList.add('selected');

            this.selectedModel = model;
            this.showDetailPanel(model);
        });

        return thumbEl;
    }

    getThumbnailUrl(model, preferredSize) {
        if (!model.thumbnails || !model.thumbnails.images) return null;

        const images = model.thumbnails.images;
        const sorted = images.sort((a, b) => a.width - b.width);

        for (const img of sorted) {
            if (img.width >= preferredSize) {
                return img.url;
            }
        }

        return sorted[sorted.length - 1]?.url || null;
    }

    showDetailPanel(model) {
        const detailEl = document.getElementById('inspectorfabDetail');
        if (!detailEl) return;

        detailEl.style.display = 'flex';

        const largeThumbnailUrl = this.getThumbnailUrl(model, 400);
        const faceCount = model.faceCount || 0;
        const vertexCount = model.vertexCount || 0;
        const views = model.viewCount || 0;
        const likes = model.likeCount || 0;

        detailEl.innerHTML = `
            <div class="inspectorfab-detail-thumb" style="background-image: url(${largeThumbnailUrl || ''});"></div>

            <h3 style="color: #fff; font-size: 16px; margin: 0 0 8px 0; word-wrap: break-word;">${model.name || 'Untitled'}</h3>
            <p style="color: #888; font-size: 12px; margin: 0 0 15px 0;">By ${model.user?.displayName || model.user?.username || 'Unknown'}</p>

            <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; margin-bottom: 12px;">
                <div class="inspectorfab-stat">
                    <span class="inspectorfab-stat-label">Views</span>
                    <span style="color: #fff;">${this.formatNumber(views)}</span>
                </div>
                <div class="inspectorfab-stat">
                    <span class="inspectorfab-stat-label">Likes</span>
                    <span style="color: #fff;">${this.formatNumber(likes)}</span>
                </div>
            </div>

            <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; margin-bottom: 12px;">
                <div style="color: #667eea; font-size: 11px; font-weight: bold; margin-bottom: 8px; text-transform: uppercase;">Performance</div>
                <div class="inspectorfab-stat">
                    <span class="inspectorfab-stat-label">Faces</span>
                    <span style="color: ${this.getFaceCountColor(faceCount)};">${this.formatNumber(faceCount)}</span>
                </div>
                <div class="inspectorfab-stat">
                    <span class="inspectorfab-stat-label">Vertices</span>
                    <span style="color: ${this.getVertexCountColor(vertexCount)};">${this.formatNumber(vertexCount)}</span>
                </div>
                ${model.textureCount !== undefined ? `
                <div class="inspectorfab-stat">
                    <span class="inspectorfab-stat-label">Textures</span>
                    <span style="color: #fff;">${model.textureCount}</span>
                </div>
                ` : ''}
                ${model.isAnimated || model.animationCount > 0 ? `
                <div class="inspectorfab-stat">
                    <span class="inspectorfab-stat-label">Animations</span>
                    <span style="color: #f0a030;">${model.animationCount || 1}</span>
                </div>
                ` : ''}
            </div>

            <div style="flex: 1;"></div>

            <button id="inspectorfabDownloadBtn" class="inspectorfab-download-btn">
                Download Model
            </button>
        `;

        // Setup download button
        const downloadBtn = document.getElementById('inspectorfabDownloadBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('mousedown', () => {
                if (this.selectedModel && !this.isLoading) {
                    this.downloadModel(this.selectedModel.uid, this.selectedModel.name);
                }
            });
        }
    }

    hideDetailPanel() {
        const detailEl = document.getElementById('inspectorfabDetail');
        if (detailEl) {
            detailEl.style.display = 'none';
        }
    }

    updatePaginationControls() {
        const paginationEl = document.getElementById('inspectorfabPagination');
        const prevBtn = document.getElementById('inspectorfabPrevBtn');
        const nextBtn = document.getElementById('inspectorfabNextBtn');
        const pageLabel = document.getElementById('inspectorfabPageLabel');

        if (this.currentResults.length > 0 && paginationEl) {
            paginationEl.style.display = 'flex';
        }

        const canGoPrev = this.currentPage > 1;
        if (prevBtn) {
            prevBtn.style.opacity = canGoPrev ? "1" : "0.4";
            prevBtn.style.cursor = canGoPrev ? "pointer" : "default";
        }

        if (nextBtn) {
            nextBtn.style.opacity = this.nextCursor ? "1" : "0.4";
            nextBtn.style.cursor = this.nextCursor ? "pointer" : "default";
        }

        if (pageLabel) {
            pageLabel.textContent = `Page ${this.currentPage}`;
        }
    }

    async goToNextPage() {
        if (!this.nextCursor || this.isLoading) return;
        this.currentPage++;
        if (this.cursorHistory.length < this.currentPage) {
            this.cursorHistory.push(this.nextCursor);
        }
        await this.performSearch(this.currentQuery, this.nextCursor, false);
    }

    async goToPrevPage() {
        if (this.currentPage <= 1 || this.isLoading) return;
        this.currentPage--;
        const prevPageCursor = this.cursorHistory[this.currentPage - 1];
        await this.performSearch(this.currentQuery, prevPageCursor, false);
    }

    async downloadModel(uid, name) {
        if (this.isLoading) return;
        this.isLoading = true;
        this.updateDownloadButton("Downloading...", true);

        try {
            const url = `https://api.sketchfab.com/v3/models/${uid}/download`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Token ${this.API_TOKEN}` }
            });
            const data = await response.json();

            if (data.glb && data.glb.url) {
                await this.generateModel(name, data.glb.url);
                this.updateDownloadButton("Downloaded!", true);
                this.showStatus("Model downloaded and spawned successfully!", "success");
            } else {
                console.error("No GLB download available for this model");
                this.updateDownloadButton("No GLB available", true);
                this.showStatus("This model doesn't have a GLB download available.", "error");
            }
        } catch (error) {
            console.error("Download error:", error);
            this.updateDownloadButton("Download Failed", true);
            this.showStatus("Failed to download model. Please try again.", "error");
        }

        setTimeout(() => {
            this.isLoading = false;
            this.updateDownloadButton("Download Model", false);
        }, 2000);
    }

    updateDownloadButton(text, disabled) {
        const btn = document.getElementById('inspectorfabDownloadBtn');
        if (btn) {
            btn.textContent = text;
            btn.disabled = disabled;
        }
    }

    async generateModel(modelName, glbUrl) {
        log("inspectorfab", "generateModel", modelName, glbUrl);

        modelName = this.sanitizeNameForFirebase(modelName);
        let boxContainer = await LoadItem("BoxContainer", "Scene", {
            name: modelName,
        });
        let modelEntity = await AddEntity(boxContainer.id, modelName + "_model");
        let gltf = await AddComponent(modelEntity.id, "GLTF", {
            componentProperties: {
                url: glbUrl,
                addColliders: false,
                nonConvexColliders: false,
                childrenLayer: 20,
            }
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        log("inspectorfab", "GLTF component added", gltf, gltf._bs);
        // Component finished loading its asset (GLTF, video, audio, etc.)
        gltf.On("loaded", async () => {
            log("inspectorfab", "Model loaded!", gltf.isLoaded); // true
            let bounds = await modelEntity._bs.GetBounds();
            log("inspectorfab", "Bounds:", bounds);
        });

        // Loading progress (0-1 for components that load assets)
        gltf.On("progress", (e) => {
            log("inspectorfab", "Loading:", e.detail.progress * 100 + "%");
        });

        // Component/GameObject linked to Unity engine
        gltf.On("unity-linked", async (e) => {
            log("inspectorfab", "Unity ID:", e.detail.unityId);
            let bounds = await modelEntity._bs.GetBounds();
            log("inspectorfab", "Bounds:", bounds);
        });


        // Wait for the model to load and get valid bounds
        // Poll until bounds have non-zero size (model is loaded)
        let bounds = null;
        const maxAttempts = 20;
        const pollInterval = 250; // ms

        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            bounds = await modelEntity._bs.GetBounds();

            // Check if bounds are valid (non-zero size)
            if (bounds && bounds.size &&
                (bounds.size.x > 0 || bounds.size.y > 0 || bounds.size.z > 0)) {
                break;
            }
        }

        if (!bounds || !bounds.size ||
            (bounds.size.x === 0 && bounds.size.y === 0 && bounds.size.z === 0)) {
            console.warn("Could not get valid bounds for model, using default scale");
            modelEntity.Set("localPosition", { x: 0, y: 0, z: 0 });
            modelEntity.Set("localScale", { x: 1, y: 1, z: 1 });
            return;
        }

        // Calculate uniform scale to fit within unit cube
        // The largest dimension should become 1
        const maxDimension = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
        const scale = 1 / maxDimension;

        // Calculate position offset to center the model
        // After scaling, the center offset also needs to be scaled
        const offsetX = -bounds.center.x * scale;
        const offsetY = -bounds.center.y * scale;
        const offsetZ = -bounds.center.z * scale;

        // Apply scale and position
        modelEntity.Set("localScale", { x: scale, y: scale, z: scale });
        modelEntity.Set("localPosition", { x: offsetX, y: offsetY, z: offsetZ });

        log("inspectorfab", `Model inscribed: scale=${scale.toFixed(4)}, bounds=`, bounds);
    }

    showStatus(message, type) {
        const statusEl = document.getElementById('inspectorfabStatus');
        if (!statusEl) return;

        statusEl.textContent = message;
        statusEl.className = type;
        statusEl.style.display = 'block';

        if (type === 'success') {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 5000);
        }
    }
}

// Initialize when script loads
let inspectorFabInstance = null;
let navButton = null;
let pageElement = null;

let generateToolBtn = (pageEl) => {
    log("inspectorfab", "generateToolBtn");

    // Create nav button with proper structure
    navButton = document.createElement("button");
    navButton.classList.add("nav-item");
    navButton.setAttribute("data-page", "inspectorfab");
    navButton.innerHTML = `
        <span class="nav-icon">🎨</span>
        Sketchfab
    `;

    // Add nav button to navigation
    const navItems = document.querySelector(".nav-items");
    if (navItems) {
        navItems.appendChild(navButton);
        log("inspectorfab", "Nav button added to navigation");
    } else {
        err("inspectorfab", "Could not find .nav-items");
        return;
    }

    // Set up click handler to switch pages
    navButton.addEventListener("mousedown", () => {
        log("inspectorfab", "Nav button clicked");

        if (window.navigation && typeof window.navigation.switchPage === 'function') {
            log("inspectorfab", "Using navigation.switchPage()");
            window.navigation.switchPage('inspectorfab');
        } else {
            // Fallback: manually switch pages
            log("inspectorfab", "Using fallback page switching");

            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });

            const inspectorfabPage = document.getElementById('inspectorfab-page');
            if (inspectorfabPage) {
                inspectorfabPage.classList.add('active');
            }
            navButton.classList.add('active');

            window.dispatchEvent(new CustomEvent('page-switched', {
                detail: { pageId: 'inspectorfab' }
            }));
        }
    });

    // Register with navigation system if available
    if (window.navigation && pageEl && typeof window.navigation.addDynamicPage === 'function') {
        try {
            log("inspectorfab", "Registering with navigation system");
            window.navigation.addDynamicPage('inspectorfab', pageEl, navButton);
        } catch (error) {
            err("inspectorfab", "Failed to register with navigation:", error);
        }
    }
};

this.onStart = async () => {
    log("inspectorfab", "onStart - initializing InspectorFab");
    inspectorFabInstance = new InspectorFab();

    // Wait for page to be created
    pageElement = await inspectorFabInstance.init();

    // Generate navigation button
    generateToolBtn(pageElement);

    // Make instance globally accessible
    window.inspectorFabInstance = inspectorFabInstance;
};

this.onDestroy = () => {
    log("inspectorfab", "onDestroy - cleaning up");

    // Use navigation system to remove if available
    if (window.navigation && typeof window.navigation.removeDynamicPage === 'function') {
        try {
            window.navigation.removeDynamicPage('inspectorfab');
            log("inspectorfab", "Removed via navigation system");
        } catch (error) {
            err("inspectorfab", "Error removing from navigation:", error);
        }
    }

    // Manual cleanup
    if (navButton && navButton.parentNode) {
        navButton.remove();
    }

    const page = document.getElementById('inspectorfab-page');
    if (page && page.parentNode) {
        page.remove();
    }

    const styles = document.getElementById('inspectorfab-styles');
    if (styles && styles.parentNode) {
        styles.remove();
    }

    if (window.inspectorFabInstance) {
        delete window.inspectorFabInstance;
    }

    inspectorFabInstance = null;
    navButton = null;
    pageElement = null;
};
