// InjectedVid - Video Player as Inspector Tab
// Plays video content in a dedicated inspector page

class InspectorVid {
    constructor() {
        this.videoUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"; // Big Buck Bunny full (10 min)
        this.isPlaying = false;
    }

    async init() {
        const pageElement = this.generatePage();
        this.setupUI();
        return pageElement;
    }

    generatePage() {
        log("injectedvid", "generatePage");

        // Check if page already exists
        const existingPage = document.getElementById('injectedvid-page');
        if (existingPage) {
            log("injectedvid", "Page already exists, skipping creation");
            return existingPage;
        }

        const pageElement = document.createElement('div');
        pageElement.id = 'injectedvid-page';
        pageElement.className = 'page';
        pageElement.innerHTML = `
            <div class="injectedvid-container" style="padding: 20px; max-width: 1200px; margin: 0 auto; height: 100%; display: flex; flex-direction: column;">
                <h1 style="color: #fff; margin-bottom: 10px;">🎬 Video Player</h1>
                <p style="color: #aaa; margin-bottom: 20px;">Play video content</p>

                <!-- URL Input Section -->
                <div class="url-section" style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                    <div style="display: flex; gap: 10px;">
                        <input
                            type="text"
                            id="injectedvidUrl"
                            placeholder="Enter video URL..."
                            value="${this.videoUrl}"
                            style="flex: 1; padding: 12px 15px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: #fff; font-size: 14px;"
                        />
                        <button
                            id="injectedvidLoadBtn"
                            style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); border: none; border-radius: 4px; padding: 12px 24px; color: #fff; cursor: pointer; font-size: 14px; font-weight: 600;"
                        >
                            Load Video
                        </button>
                    </div>
                </div>

                <!-- Video Player Section -->
                <div class="video-section" style="flex: 1; display: flex; flex-direction: column; min-height: 0; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 15px;">
                    <video
                        id="injectedvidPlayer"
                        controls
                        style="width: 100%; max-height: 100%; border-radius: 8px; background: #000;"
                    >
                        <source src="${this.videoUrl}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                </div>

                <!-- Controls Section -->
                <div class="controls-section" style="display: flex; gap: 10px; margin-top: 15px; justify-content: center;">
                    <button
                        id="injectedvidPlayBtn"
                        style="background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%); border: none; border-radius: 4px; padding: 12px 24px; color: #fff; cursor: pointer; font-size: 14px; font-weight: 600;"
                    >
                        ▶ Play
                    </button>
                    <button
                        id="injectedvidPauseBtn"
                        style="background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); border: none; border-radius: 4px; padding: 12px 24px; color: #fff; cursor: pointer; font-size: 14px; font-weight: 600;"
                    >
                        ⏸ Pause
                    </button>
                    <button
                        id="injectedvidStopBtn"
                        style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); border: none; border-radius: 4px; padding: 12px 24px; color: #fff; cursor: pointer; font-size: 14px; font-weight: 600;"
                    >
                        ⏹ Stop
                    </button>
                </div>

                <!-- Status Message -->
                <div id="injectedvidStatus" style="display: none; padding: 12px; border-radius: 4px; font-size: 14px; margin-top: 15px;"></div>
            </div>
        `;

        // Add to page container
        const pageContainer = document.querySelector('.page-container');
        if (pageContainer) {
            pageContainer.appendChild(pageElement);
            log("injectedvid", "Page element added to page-container");
        } else {
            err("injectedvid", "Could not find .page-container");
        }

        this.injectStyles();
        return pageElement;
    }

    injectStyles() {
        if (document.getElementById('injectedvid-styles')) return;

        const styleEl = document.createElement('style');
        styleEl.id = 'injectedvid-styles';
        styleEl.textContent = `
            #injectedvidStatus.success {
                background: rgba(72, 187, 120, 0.2);
                border: 1px solid rgba(72, 187, 120, 0.5);
                color: #48bb78;
            }
            #injectedvidStatus.error {
                background: rgba(255, 0, 0, 0.2);
                border: 1px solid rgba(255, 0, 0, 0.5);
                color: #ff6b6b;
            }
            #injectedvidStatus.info {
                background: rgba(66, 153, 225, 0.2);
                border: 1px solid rgba(66, 153, 225, 0.5);
                color: #4299e1;
            }
            .injectedvid-container button:hover {
                opacity: 0.9;
                transform: scale(1.02);
            }
            .injectedvid-container button {
                transition: opacity 0.2s, transform 0.2s;
            }
        `;
        document.head.appendChild(styleEl);
    }

    setupUI() {
        // Load button
        const loadBtn = document.getElementById('injectedvidLoadBtn');
        if (loadBtn) {
            loadBtn.addEventListener('mousedown', () => this.loadVideo());
        }

        // URL input - enter key
        const urlInput = document.getElementById('injectedvidUrl');
        if (urlInput) {
            urlInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.loadVideo();
                }
            });
        }

        // Play button
        const playBtn = document.getElementById('injectedvidPlayBtn');
        if (playBtn) {
            playBtn.addEventListener('mousedown', () => this.play());
        }

        // Pause button
        const pauseBtn = document.getElementById('injectedvidPauseBtn');
        if (pauseBtn) {
            pauseBtn.addEventListener('mousedown', () => this.pause());
        }

        // Stop button
        const stopBtn = document.getElementById('injectedvidStopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('mousedown', () => this.stop());
        }

        // Listen for page switches
        window.addEventListener('page-switched', (e) => {
            const page = document.getElementById('injectedvid-page');
            if (!page) return;

            if (e.detail.pageId === 'injectedvid') {
                log("injectedvid", "Page switched to injectedvid");
                page.classList.add('active');
            } else {
                page.classList.remove('active');
            }
        });
    }

    loadVideo() {
        const urlInput = document.getElementById('injectedvidUrl');
        const video = document.getElementById('injectedvidPlayer');

        if (!urlInput || !video) return;

        const url = urlInput.value.trim();
        if (!url) {
            this.showStatus("Please enter a video URL", "error");
            return;
        }

        this.videoUrl = url;
        video.src = url;
        video.load();
        this.showStatus("Video loaded: " + url, "success");
    }

    play() {
        const video = document.getElementById('injectedvidPlayer');
        if (video) {
            video.play();
            this.isPlaying = true;
            this.showStatus("Playing video", "info");
        }
    }

    pause() {
        const video = document.getElementById('injectedvidPlayer');
        if (video) {
            video.pause();
            this.isPlaying = false;
            this.showStatus("Video paused", "info");
        }
    }

    stop() {
        const video = document.getElementById('injectedvidPlayer');
        if (video) {
            video.pause();
            video.currentTime = 0;
            this.isPlaying = false;
            this.showStatus("Video stopped", "info");
        }
    }

    showStatus(message, type) {
        const statusEl = document.getElementById('injectedvidStatus');
        if (!statusEl) return;

        statusEl.textContent = message;
        statusEl.className = type;
        statusEl.style.display = 'block';

        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
    }
}

// Initialize when script loads
let injectedVidInstance = null;
let navButton = null;
let pageElement = null;

let generateToolBtn = (pageEl) => {
    log("injectedvid", "generateToolBtn");

    // Create nav button with proper structure
    navButton = document.createElement("button");
    navButton.classList.add("nav-item");
    navButton.setAttribute("data-page", "injectedvid");
    navButton.innerHTML = `
        <span class="nav-icon">🎬</span>
        Video
    `;

    // Add nav button to navigation
    const navItems = document.querySelector(".nav-items");
    if (navItems) {
        navItems.appendChild(navButton);
        log("injectedvid", "Nav button added to navigation");
    } else {
        err("injectedvid", "Could not find .nav-items");
        return;
    }

    // Set up click handler to switch pages
    navButton.addEventListener("mousedown", () => {
        log("injectedvid", "Nav button clicked");

        if (window.navigation && typeof window.navigation.switchPage === 'function') {
            log("injectedvid", "Using navigation.switchPage()");
            window.navigation.switchPage('injectedvid');
        } else {
            // Fallback: manually switch pages
            log("injectedvid", "Using fallback page switching");

            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });

            const injectedvidPage = document.getElementById('injectedvid-page');
            if (injectedvidPage) {
                injectedvidPage.classList.add('active');
            }
            navButton.classList.add('active');

            window.dispatchEvent(new CustomEvent('page-switched', {
                detail: { pageId: 'injectedvid' }
            }));
        }
    });

    // Register with navigation system if available
    if (window.navigation && pageEl && typeof window.navigation.addDynamicPage === 'function') {
        try {
            log("injectedvid", "Registering with navigation system");
            window.navigation.addDynamicPage('injectedvid', pageEl, navButton);
        } catch (error) {
            err("injectedvid", "Failed to register with navigation:", error);
        }
    }
};

this.onStart = async () => {
    log("injectedvid", "onStart - initializing InjectedVid");
    injectedVidInstance = new InspectorVid();

    // Wait for page to be created
    pageElement = await injectedVidInstance.init();

    // Generate navigation button
    generateToolBtn(pageElement);

    // Make instance globally accessible
    window.injectedVidInstance = injectedVidInstance;
};

this.onDestroy = () => {
    log("injectedvid", "onDestroy - cleaning up");

    // Stop video if playing
    const video = document.getElementById('injectedvidPlayer');
    if (video) {
        video.pause();
        video.src = '';
    }

    // Use navigation system to remove if available
    if (window.navigation && typeof window.navigation.removeDynamicPage === 'function') {
        try {
            window.navigation.removeDynamicPage('injectedvid');
            log("injectedvid", "Removed via navigation system");
        } catch (error) {
            err("injectedvid", "Error removing from navigation:", error);
        }
    }

    // Manual cleanup
    if (navButton && navButton.parentNode) {
        navButton.remove();
    }

    const page = document.getElementById('injectedvid-page');
    if (page && page.parentNode) {
        page.remove();
    }

    const styles = document.getElementById('injectedvid-styles');
    if (styles && styles.parentNode) {
        styles.remove();
    }

    if (window.injectedVidInstance) {
        delete window.injectedVidInstance;
    }

    injectedVidInstance = null;
    navButton = null;
    pageElement = null;
};
