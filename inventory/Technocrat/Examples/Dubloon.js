// Dubloon - Pitch to MIDI Inspector Tab
// Converts microphone pitch to MIDI output with real-time visualization

class InspectorDubloon {
    constructor() {
        // Configuration
        this.CONFIG = {
            // Audio settings
            bufferSize: 2048,
            processInterval: 10, // ms

            // Pitch detection (YIN)
            yinThreshold: 0.15,
            confidenceThreshold: 0.5,
            minFrequency: 50,   // Hz - ignore below this
            maxFrequency: 2000, // Hz - ignore above this

            // Note tracking
            noteOnConsecutive: 3,
            noteOffDelay: 50, // ms
            centsHysteresis: 30,
            minNoteDuration: 30, // ms

            // MIDI
            channel: 0,
            octaveShift: 0,
            baseVelocity: 100,
            velocityFromAmplitude: true,
            pitchBendRange: 2, // semitones

            // Sensitivity
            sensitivity: 70,

            // Synthesizer
            synthEnabled: false,
            synthVolume: 50,
            synthWaveform: 'sine',
            synthAttack: 0.02,
            synthRelease: 0.1
        };

        this.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // Application instances
        this.audioCapture = null;
        this.yinDetector = null;
        this.noteTracker = null;
        this.midiOutput = null;
        this.synthesizer = null;
        this.visualizer = null;
        this.isRunning = false;
        this.processInterval = null;

        // Recording state
        this.isRecording = false;
        this.isPlaying = false;
        this.recordedNotes = [];
        this.recorder = null;
        this.timelineVisualizer = null;
        this.playbackStartTime = 0;
        this.playbackTimeout = null;

        // Timeline state
        this.timelineHeight = 120;
        this.timelineMinHeight = 80;
        this.timelineMaxHeight = 300;
        this.pixelsPerSecond = 50;
    }

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================
    frequencyToMidi(frequency) {
        if (frequency <= 0) return null;
        return 69 + 12 * Math.log2(frequency / 440);
    }

    frequencyToMidiWithCents(frequency) {
        const exactMidi = this.frequencyToMidi(frequency);
        if (exactMidi === null) return { note: null, cents: 0 };
        const roundedMidi = Math.round(exactMidi);
        const cents = Math.round((exactMidi - roundedMidi) * 100);
        return { note: roundedMidi, cents };
    }

    midiToNoteName(midiNote) {
        if (midiNote === null || midiNote < 0 || midiNote > 127) return '--';
        const octave = Math.floor(midiNote / 12) - 1;
        const noteName = this.NOTE_NAMES[midiNote % 12];
        return `${noteName}${octave}`;
    }

    midiToFrequency(midiNote) {
        return 440 * Math.pow(2, (midiNote - 69) / 12);
    }

    calculateRMS(buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        return Math.sqrt(sum / buffer.length);
    }

    rmsToDb(rms) {
        return 20 * Math.log10(Math.max(rms, 0.0001));
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================
    async init() {
        const pageElement = this.generatePage();
        this.injectStyles();
        this.initializeComponents();
        await this.setupUI();
        return pageElement;
    }

    generatePage() {
        log("dubloon", "generatePage");

        const existingPage = document.getElementById('dubloon-page');
        if (existingPage) {
            log("dubloon", "Page already exists, skipping creation");
            return existingPage;
        }

        const pageElement = document.createElement('div');
        pageElement.id = 'dubloon-page';
        pageElement.className = 'page';
        pageElement.innerHTML = `
            <div class="dubloon-container">
                <!-- Error Banner -->
                <div class="dubloon-error-banner" id="dubloonErrorBanner"></div>

                <!-- Header Row: Title + Controls -->
                <div class="dubloon-header-row">
                    <div class="dubloon-title">
                        <h1>DUBLOON</h1>
                        <span>Pitch to MIDI</span>
                    </div>
                    <div class="dubloon-controls">
                        <div class="dubloon-transport">
                            <button class="dubloon-btn dubloon-btn-record" id="dubloonRecordBtn" title="Record">●</button>
                            <button class="dubloon-btn dubloon-btn-secondary" id="dubloonPlayBtn" title="Play">▶</button>
                            <button class="dubloon-btn dubloon-btn-secondary" id="dubloonPlayStopBtn" title="Stop Playback">⏹</button>
                            <button class="dubloon-btn dubloon-btn-secondary" id="dubloonClearBtn" title="Clear Recording">🗑</button>
                        </div>
                        <button class="dubloon-btn dubloon-btn-primary" id="dubloonStartBtn">Start</button>
                        <button class="dubloon-btn dubloon-btn-secondary" id="dubloonStopBtn" disabled>Stop</button>
                        <button class="dubloon-btn dubloon-btn-danger" id="dubloonPanicBtn">!</button>
                    </div>
                </div>

                <!-- Left Column: Note Display + Waveform -->
                <div class="dubloon-left-col">
                    <div class="dubloon-note-display">
                        <div class="dubloon-note-name" id="dubloonNoteName">--</div>
                        <div class="dubloon-note-details">
                            <span id="dubloonFrequency">--- Hz</span>
                            <span id="dubloonMidiNote">MIDI --</span>
                            <span class="dubloon-cents-display">
                                <span class="dubloon-cents-indicator" id="dubloonCentsIndicator"></span>
                                <span id="dubloonCents">-- cents</span>
                            </span>
                        </div>
                    </div>
                    <div class="dubloon-waveform-container">
                        <canvas id="dubloonWaveform"></canvas>
                    </div>
                </div>

                <!-- Right Column: Settings + Status -->
                <div class="dubloon-right-col">
                    <div class="dubloon-settings">
                        <div class="dubloon-setting-group">
                            <label for="dubloonMicSelect">Mic</label>
                            <select id="dubloonMicSelect">
                                <option value="">Select mic...</option>
                            </select>
                        </div>
                        <div class="dubloon-setting-group">
                            <label for="dubloonMidiSelect">MIDI Out</label>
                            <select id="dubloonMidiSelect">
                                <option value="">Select MIDI...</option>
                            </select>
                        </div>
                        <div class="dubloon-setting-group">
                            <label for="dubloonChannelSelect">Channel</label>
                            <select id="dubloonChannelSelect"></select>
                        </div>
                        <div class="dubloon-setting-group">
                            <label>Octave</label>
                            <div class="dubloon-octave-control">
                                <button class="dubloon-octave-btn" id="dubloonOctaveDown">-</button>
                                <span class="dubloon-octave-value" id="dubloonOctaveValue">0</span>
                                <button class="dubloon-octave-btn" id="dubloonOctaveUp">+</button>
                            </div>
                        </div>
                        <div class="dubloon-setting-group dubloon-full-width">
                            <label for="dubloonSensitivity">Sensitivity</label>
                            <div class="dubloon-slider-container">
                                <input type="range" id="dubloonSensitivity" min="0" max="100" value="70">
                                <span class="dubloon-slider-value" id="dubloonSensitivityValue">70%</span>
                            </div>
                        </div>
                        <div class="dubloon-synth-section dubloon-full-width">
                            <label class="dubloon-toggle-label">
                                <input type="checkbox" id="dubloonSynthEnabled">
                                <span class="dubloon-toggle-text">Monitor</span>
                            </label>
                            <div class="dubloon-synth-controls" id="dubloonSynthControls">
                                <div class="dubloon-synth-row">
                                    <select id="dubloonSynthWaveform">
                                        <option value="sine">Sine</option>
                                        <option value="triangle">Tri</option>
                                        <option value="sawtooth">Saw</option>
                                        <option value="square">Sqr</option>
                                    </select>
                                    <div class="dubloon-slider-container">
                                        <input type="range" id="dubloonSynthVolume" min="0" max="100" value="50">
                                        <span class="dubloon-slider-value" id="dubloonSynthVolumeValue">50%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="dubloon-status-bar">
                        <div class="dubloon-status-indicator">
                            <span class="dubloon-status-dot" id="dubloonStatusDot"></span>
                            <span id="dubloonStatusText">Ready</span>
                        </div>
                        <span id="dubloonLatency">--</span>
                    </div>
                </div>

                <!-- Resize Handle -->
                <div class="dubloon-resize-handle" id="dubloonResizeHandle">
                    <div class="dubloon-resize-grip"></div>
                </div>

                <!-- Timeline Pane -->
                <div class="dubloon-timeline-pane" id="dubloonTimelinePane">
                    <div class="dubloon-timeline-labels" id="dubloonTimelineLabels"></div>
                    <div class="dubloon-timeline-scroll" id="dubloonTimelineScroll">
                        <canvas id="dubloonTimeline"></canvas>
                    </div>
                    <div class="dubloon-timeline-footer">
                        <span id="dubloonTimelinePosition">00:00.0</span>
                    </div>
                </div>
            </div>
        `;

        const pageContainer = document.querySelector('.page-container');
        if (pageContainer) {
            pageContainer.appendChild(pageElement);
            log("dubloon", "Page element added to page-container");
        } else {
            err("dubloon", "Could not find .page-container");
        }

        return pageElement;
    }

    injectStyles() {
        if (document.getElementById('dubloon-styles')) return;

        const styleEl = document.createElement('style');
        styleEl.id = 'dubloon-styles';
        styleEl.textContent = `
            /* Two-Column Horizontal Layout with Timeline */
            .dubloon-container {
                display: grid;
                grid-template-columns: 1fr 1fr;
                grid-template-rows: auto 1fr auto auto;
                gap: 10px;
                padding: 10px;
                height: 100%;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                box-sizing: border-box;
                overflow: hidden;
            }

            .dubloon-error-banner {
                grid-column: 1 / -1;
                display: none;
                padding: 8px 12px;
                background: rgba(248, 81, 73, 0.15);
                border: 1px solid #f85149;
                border-radius: 4px;
                color: #f85149;
                font-size: 11px;
            }

            .dubloon-error-banner.visible {
                display: block;
            }

            /* Header Row */
            .dubloon-header-row {
                grid-column: 1 / -1;
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 8px;
                border-bottom: 1px solid #30363d;
            }

            .dubloon-title {
                display: flex;
                align-items: baseline;
                gap: 10px;
            }

            .dubloon-title h1 {
                font-size: 18px;
                font-weight: 600;
                letter-spacing: 2px;
                color: #58a6ff;
                margin: 0;
            }

            .dubloon-title span {
                font-size: 11px;
                color: #8b949e;
            }

            /* Controls in Header */
            .dubloon-controls {
                display: flex;
                gap: 6px;
            }

            .dubloon-btn {
                height: 28px;
                padding: 0 12px;
                border: none;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.15s ease;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .dubloon-btn:active {
                transform: scale(0.98);
            }

            .dubloon-btn-primary {
                background: #58a6ff;
                color: #0d1117;
            }

            .dubloon-btn-primary:hover {
                background: #79c0ff;
            }

            .dubloon-btn-primary:disabled {
                background: #30363d;
                color: #8b949e;
                cursor: not-allowed;
                transform: none;
            }

            .dubloon-btn-secondary {
                background: #21262d;
                color: #e6edf3;
                border: 1px solid #30363d;
            }

            .dubloon-btn-secondary:hover {
                background: #30363d;
            }

            .dubloon-btn-secondary:disabled {
                color: #8b949e;
                cursor: not-allowed;
                transform: none;
            }

            .dubloon-btn-danger {
                background: #f85149;
                color: white;
                width: 28px;
                padding: 0;
                font-size: 14px;
            }

            .dubloon-btn-danger:hover {
                filter: brightness(1.1);
            }

            /* Transport Controls */
            .dubloon-transport {
                display: flex;
                gap: 4px;
                margin-right: 12px;
                padding-right: 12px;
                border-right: 1px solid #30363d;
            }

            .dubloon-btn-record {
                background: #21262d;
                color: #f85149;
                width: 28px;
                padding: 0;
            }

            .dubloon-btn-record:hover {
                background: #30363d;
            }

            .dubloon-btn-record.recording {
                background: #f85149;
                color: white;
                animation: dubloon-record-pulse 1s infinite;
            }

            @keyframes dubloon-record-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.6; }
            }

            .dubloon-transport .dubloon-btn-secondary {
                width: 28px;
                padding: 0;
            }

            /* Left Column */
            .dubloon-left-col {
                display: flex;
                flex-direction: column;
                background: rgba(255,255,255,0.03);
                border-radius: 6px;
                padding: 10px;
                min-height: 0;
                min-width: 0;
                overflow: hidden;
            }

            .dubloon-note-display {
                text-align: center;
                padding: 8px 0;
            }

            .dubloon-note-name {
                font-size: 48px;
                font-weight: 700;
                color: #e6edf3;
                line-height: 1;
                font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            }

            .dubloon-note-name.active {
                color: #3fb950;
            }

            .dubloon-note-details {
                display: flex;
                justify-content: center;
                gap: 12px;
                margin-top: 6px;
                font-size: 11px;
                color: #8b949e;
            }

            .dubloon-note-details span {
                font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            }

            .dubloon-cents-display {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }

            .dubloon-cents-indicator {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #8b949e;
            }

            .dubloon-cents-indicator.flat { background: #d29922; }
            .dubloon-cents-indicator.sharp { background: #f85149; }
            .dubloon-cents-indicator.in-tune { background: #3fb950; }

            /* Waveform */
            .dubloon-waveform-container {
                flex: 1;
                background: #21262d;
                border-radius: 4px;
                padding: 2px;
                margin-top: 8px;
                min-height: 50px;
            }

            #dubloonWaveform {
                width: 100%;
                height: 100%;
                display: block;
                border-radius: 3px;
            }

            /* Right Column */
            .dubloon-right-col {
                display: flex;
                flex-direction: column;
                gap: 8px;
                min-height: 0;
                min-width: 0;
                overflow: hidden;
            }

            .dubloon-settings {
                flex: 1;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px;
                align-content: start;
                background: rgba(255,255,255,0.03);
                border-radius: 6px;
                padding: 8px;
                min-width: 0;
                overflow: auto;
            }

            .dubloon-setting-group {
                display: flex;
                flex-direction: column;
                gap: 3px;
            }

            .dubloon-setting-group.dubloon-full-width {
                grid-column: 1 / -1;
            }

            .dubloon-setting-group label {
                font-size: 9px;
                font-weight: 500;
                color: #8b949e;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .dubloon-container select {
                width: 100%;
                height: 26px;
                background: #21262d;
                border: 1px solid #30363d;
                border-radius: 3px;
                color: #e6edf3;
                font-size: 11px;
                padding: 0 6px;
                cursor: pointer;
            }

            .dubloon-container select:focus {
                outline: none;
                border-color: #58a6ff;
            }

            .dubloon-container select option {
                background: #21262d;
                color: #e6edf3;
            }

            /* Octave Control */
            .dubloon-octave-control {
                display: flex;
                gap: 4px;
                align-items: center;
                height: 26px;
            }

            .dubloon-octave-btn {
                width: 26px;
                height: 26px;
                background: #21262d;
                border: 1px solid #30363d;
                border-radius: 3px;
                color: #e6edf3;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.15s ease;
                padding: 0;
            }

            .dubloon-octave-btn:hover {
                background: #30363d;
            }

            .dubloon-octave-value {
                flex: 1;
                text-align: center;
                font-size: 13px;
                font-weight: 600;
                font-family: 'SF Mono', Monaco, 'Courier New', monospace;
                color: #e6edf3;
            }

            /* Slider */
            .dubloon-slider-container {
                display: flex;
                align-items: center;
                gap: 6px;
                height: 26px;
            }

            .dubloon-container input[type="range"] {
                -webkit-appearance: none;
                appearance: none;
                flex: 1;
                height: 4px;
                padding: 0;
                background: #21262d;
                border-radius: 2px;
                border: none;
            }

            .dubloon-container input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 12px;
                height: 12px;
                background: #58a6ff;
                border-radius: 50%;
                cursor: pointer;
            }

            .dubloon-slider-value {
                min-width: 28px;
                text-align: right;
                font-family: 'SF Mono', Monaco, 'Courier New', monospace;
                font-size: 10px;
                color: #8b949e;
            }

            /* Synth Section */
            .dubloon-synth-section {
                padding-top: 6px;
                border-top: 1px solid #30363d;
            }

            .dubloon-toggle-label {
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                user-select: none;
            }

            .dubloon-toggle-label input[type="checkbox"] {
                width: 12px;
                height: 12px;
                accent-color: #58a6ff;
                cursor: pointer;
            }

            .dubloon-toggle-text {
                font-size: 10px;
                font-weight: 500;
                color: #e6edf3;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .dubloon-synth-controls {
                display: none;
                margin-top: 6px;
            }

            .dubloon-synth-controls.visible {
                display: block;
            }

            .dubloon-synth-row {
                display: flex;
                gap: 6px;
                align-items: center;
            }

            .dubloon-synth-row select {
                width: 60px;
                flex-shrink: 0;
            }

            .dubloon-synth-row .dubloon-slider-container {
                flex: 1;
            }

            /* Status Bar */
            .dubloon-status-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 8px;
                font-size: 10px;
                color: #8b949e;
                background: rgba(255,255,255,0.03);
                border-radius: 4px;
            }

            .dubloon-status-indicator {
                display: flex;
                align-items: center;
                gap: 5px;
            }

            .dubloon-status-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #8b949e;
            }

            .dubloon-status-dot.ready { background: #d29922; }
            .dubloon-status-dot.running {
                background: #3fb950;
                animation: dubloon-pulse 1.5s infinite;
            }
            .dubloon-status-dot.error { background: #f85149; }

            @keyframes dubloon-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            /* Resize Handle */
            .dubloon-resize-handle {
                grid-column: 1 / -1;
                height: 8px;
                background: #30363d;
                cursor: ns-resize;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
            }

            .dubloon-resize-handle:hover {
                background: #3b434d;
            }

            .dubloon-resize-grip {
                width: 40px;
                height: 4px;
                background: #58a6ff;
                border-radius: 2px;
                opacity: 0.6;
            }

            .dubloon-resize-handle:hover .dubloon-resize-grip {
                opacity: 1;
            }

            /* Timeline Pane */
            .dubloon-timeline-pane {
                grid-column: 1 / -1;
                display: flex;
                background: rgba(255,255,255,0.03);
                border-radius: 6px;
                overflow: hidden;
                min-height: 80px;
                height: 120px;
                position: relative;
            }

            .dubloon-timeline-labels {
                width: 32px;
                flex-shrink: 0;
                background: #21262d;
                display: flex;
                flex-direction: column;
                font-size: 8px;
                color: #8b949e;
                font-family: 'SF Mono', Monaco, 'Courier New', monospace;
                overflow: hidden;
            }

            .dubloon-timeline-labels > div {
                display: flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
            }

            .dubloon-timeline-scroll {
                flex: 1;
                overflow-x: auto;
                overflow-y: hidden;
            }

            #dubloonTimeline {
                display: block;
            }

            .dubloon-timeline-footer {
                position: absolute;
                bottom: 4px;
                right: 8px;
                font-size: 10px;
                color: #58a6ff;
                font-family: 'SF Mono', Monaco, 'Courier New', monospace;
                background: rgba(33, 38, 45, 0.8);
                padding: 2px 6px;
                border-radius: 3px;
            }
        `;
        document.head.appendChild(styleEl);
    }

    initializeComponents() {
        // Create component instances
        this.audioCapture = new DubloonAudioCapture(this.CONFIG);
        this.noteTracker = new DubloonNoteTracker(this.CONFIG);
        this.midiOutput = new DubloonMidiOutput(this.CONFIG);
        this.synthesizer = new DubloonSynthesizer(this.CONFIG, this);
    }

    async setupUI() {
        // Initialize visualizer
        const canvas = document.getElementById('dubloonWaveform');
        if (canvas) {
            this.visualizer = new DubloonVisualizer(canvas);
            this.visualizer.clear();
        }

        // Initialize recorder
        this.recorder = new DubloonRecorder(this.CONFIG, this);

        // Initialize timeline visualizer
        const timelineCanvas = document.getElementById('dubloonTimeline');
        const timelineLabels = document.getElementById('dubloonTimelineLabels');
        if (timelineCanvas && timelineLabels) {
            this.timelineVisualizer = new DubloonTimelineVisualizer(timelineCanvas, timelineLabels, this);
            const pane = document.getElementById('dubloonTimelinePane');
            if (pane) {
                this.timelineVisualizer.resize(pane.clientWidth - 32, pane.clientHeight);
            }
        }

        // Populate MIDI channel dropdown
        const channelSelect = document.getElementById('dubloonChannelSelect');
        if (channelSelect) {
            for (let i = 1; i <= 16; i++) {
                const option = document.createElement('option');
                option.value = i - 1;
                option.textContent = `Channel ${i}`;
                channelSelect.appendChild(option);
            }
        }

        // Initialize MIDI
        try {
            const outputs = await this.midiOutput.initialize();
            this.populateMidiOutputs(outputs);
        } catch (err) {
            this.showError(err.message);
        }

        // Get microphone devices
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => stream.getTracks().forEach(t => t.stop()));

            const devices = await this.audioCapture.getDevices();
            this.populateMicDevices(devices);

            // Load saved settings
            this.loadSettings(devices);
        } catch (err) {
            console.warn('Could not enumerate audio devices:', err);
        }

        this.setupEventListeners();
        this.setupResizeHandle();
        this.setStatus('ready', 'Ready');
    }

    populateMidiOutputs(outputs) {
        const select = document.getElementById('dubloonMidiSelect');
        if (!select) return;
        select.innerHTML = '<option value="">Select MIDI device...</option>';

        outputs.forEach(output => {
            const option = document.createElement('option');
            option.value = output.id;
            option.textContent = output.name;
            select.appendChild(option);
        });
    }

    populateMicDevices(devices) {
        const select = document.getElementById('dubloonMicSelect');
        if (!select) return;
        select.innerHTML = '<option value="">Default microphone</option>';

        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = device.name;
            select.appendChild(option);
        });
    }

    setupEventListeners() {
        // Start button
        const startBtn = document.getElementById('dubloonStartBtn');
        if (startBtn) {
            startBtn.addEventListener('mousedown', () => this.start());
        }

        // Stop button
        const stopBtn = document.getElementById('dubloonStopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('mousedown', () => this.stop());
        }

        // Panic button
        const panicBtn = document.getElementById('dubloonPanicBtn');
        if (panicBtn) {
            panicBtn.addEventListener('mousedown', () => {
                this.midiOutput.allNotesOff();
                this.synthesizer.noteOff();
                this.noteTracker.reset();
                this.updateNoteDisplay(null, null, 0);
            });
        }

        // MIDI output selection
        const midiSelect = document.getElementById('dubloonMidiSelect');
        if (midiSelect) {
            midiSelect.addEventListener('change', (e) => {
                this.midiOutput.selectOutput(e.target.value);
                this.saveSettings();
            });
        }

        // MIDI channel selection
        const channelSelect = document.getElementById('dubloonChannelSelect');
        if (channelSelect) {
            channelSelect.addEventListener('change', (e) => {
                this.CONFIG.channel = parseInt(e.target.value);
                this.saveSettings();
            });
        }

        // Octave buttons
        const octaveDown = document.getElementById('dubloonOctaveDown');
        if (octaveDown) {
            octaveDown.addEventListener('mousedown', () => {
                if (this.CONFIG.octaveShift > -3) {
                    this.CONFIG.octaveShift--;
                    this.updateOctaveDisplay();
                    this.saveSettings();
                }
            });
        }

        const octaveUp = document.getElementById('dubloonOctaveUp');
        if (octaveUp) {
            octaveUp.addEventListener('mousedown', () => {
                if (this.CONFIG.octaveShift < 3) {
                    this.CONFIG.octaveShift++;
                    this.updateOctaveDisplay();
                    this.saveSettings();
                }
            });
        }

        // Sensitivity slider
        const sensitivity = document.getElementById('dubloonSensitivity');
        if (sensitivity) {
            sensitivity.addEventListener('input', (e) => {
                this.CONFIG.sensitivity = parseInt(e.target.value);
                document.getElementById('dubloonSensitivityValue').textContent = `${this.CONFIG.sensitivity}%`;
            });
            sensitivity.addEventListener('change', () => this.saveSettings());
        }

        // Microphone selection
        const micSelect = document.getElementById('dubloonMicSelect');
        if (micSelect) {
            micSelect.addEventListener('change', () => {
                this.saveSettings();
                if (this.isRunning) {
                    this.stop();
                    this.start();
                }
            });
        }

        // MIDI state changes
        window.addEventListener('midiStateChange', () => {
            const outputs = this.midiOutput.getOutputs();
            this.populateMidiOutputs(outputs);
        });

        // Synth enable toggle
        const synthEnabled = document.getElementById('dubloonSynthEnabled');
        if (synthEnabled) {
            synthEnabled.addEventListener('change', (e) => {
                this.CONFIG.synthEnabled = e.target.checked;
                this.synthesizer.setEnabled(e.target.checked);
                document.getElementById('dubloonSynthControls').classList.toggle('visible', e.target.checked);
                this.saveSettings();
            });
        }

        // Synth waveform selection
        const synthWaveform = document.getElementById('dubloonSynthWaveform');
        if (synthWaveform) {
            synthWaveform.addEventListener('change', (e) => {
                this.synthesizer.setWaveform(e.target.value);
                this.saveSettings();
            });
        }

        // Synth volume slider
        const synthVolume = document.getElementById('dubloonSynthVolume');
        if (synthVolume) {
            synthVolume.addEventListener('input', (e) => {
                const volume = parseInt(e.target.value);
                this.synthesizer.setVolume(volume);
                document.getElementById('dubloonSynthVolumeValue').textContent = `${volume}%`;
            });
            synthVolume.addEventListener('change', () => this.saveSettings());
        }

        // Record button
        const recordBtn = document.getElementById('dubloonRecordBtn');
        if (recordBtn) {
            recordBtn.addEventListener('mousedown', () => this.toggleRecording());
        }

        // Play button
        const playBtn = document.getElementById('dubloonPlayBtn');
        if (playBtn) {
            playBtn.addEventListener('mousedown', () => this.startPlayback());
        }

        // Stop playback button
        const playStopBtn = document.getElementById('dubloonPlayStopBtn');
        if (playStopBtn) {
            playStopBtn.addEventListener('mousedown', () => this.stopPlayback());
        }

        // Clear recording button
        const clearBtn = document.getElementById('dubloonClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('mousedown', () => this.clearRecording());
        }

        // Listen for page switches
        window.addEventListener('page-switched', (e) => {
            const page = document.getElementById('dubloon-page');
            if (!page) return;

            if (e.detail.pageId === 'dubloon') {
                log("dubloon", "Page switched to dubloon");
                page.classList.add('active');
                if (this.visualizer) {
                    this.visualizer.resize();
                }
            } else {
                page.classList.remove('active');
            }
        });
    }

    updateOctaveDisplay() {
        const display = this.CONFIG.octaveShift > 0 ? `+${this.CONFIG.octaveShift}` : this.CONFIG.octaveShift.toString();
        const el = document.getElementById('dubloonOctaveValue');
        if (el) el.textContent = display;
    }

    async start() {
        if (this.isRunning) return;

        try {
            const micId = document.getElementById('dubloonMicSelect')?.value || null;
            const sampleRate = await this.audioCapture.initialize(micId);

            this.yinDetector = new DubloonYinDetector(sampleRate, this.CONFIG.bufferSize, this.CONFIG);
            this.noteTracker.reset();

            // Initialize synthesizer with the same audio context
            this.synthesizer.initialize(this.audioCapture.audioContext);
            this.synthesizer.setEnabled(this.CONFIG.synthEnabled);

            // Select MIDI output
            const midiId = document.getElementById('dubloonMidiSelect')?.value;
            if (midiId) {
                this.midiOutput.selectOutput(midiId);
            }

            this.isRunning = true;

            // Start processing loop
            this.processInterval = setInterval(() => this.processAudio(), this.CONFIG.processInterval);

            // Update UI
            const startBtn = document.getElementById('dubloonStartBtn');
            const stopBtn = document.getElementById('dubloonStopBtn');
            if (startBtn) startBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            this.setStatus('running', 'Running');
            this.hideError();

        } catch (err) {
            this.showError(err.message);
            this.setStatus('error', 'Error');
        }
    }

    stop() {
        if (!this.isRunning) return;

        if (this.processInterval) {
            clearInterval(this.processInterval);
            this.processInterval = null;
        }

        if (this.noteTracker.currentNote !== null) {
            this.midiOutput.sendNoteOff(this.noteTracker.currentNote);
        }
        this.midiOutput.resetPitchBend();

        this.synthesizer.stop();
        this.audioCapture.stop();
        this.noteTracker.reset();
        this.isRunning = false;

        const startBtn = document.getElementById('dubloonStartBtn');
        const stopBtn = document.getElementById('dubloonStopBtn');
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        this.setStatus('ready', 'Ready');
        this.updateNoteDisplay(null, null, 0);
        if (this.visualizer) this.visualizer.clear();
    }

    processAudio() {
        const startTime = performance.now();
        const buffer = this.audioCapture.getBuffer();

        if (!buffer) return;

        if (this.visualizer) {
            this.visualizer.drawWaveform(buffer);
        }

        const { frequency, confidence } = this.yinDetector.detect(buffer);

        const rms = this.calculateRMS(buffer);
        const db = this.rmsToDb(rms);
        const velocity = this.CONFIG.velocityFromAmplitude
            ? Math.round(Math.max(1, Math.min(127, (db + 50) * 2.5)))
            : this.CONFIG.baseVelocity;

        const timestamp = performance.now();
        const event = this.noteTracker.update(frequency, confidence, timestamp, this);

        if (event) {
            switch (event.type) {
                case 'noteOn':
                    this.midiOutput.resetPitchBend();
                    this.midiOutput.sendNoteOn(event.note, velocity);
                    this.midiOutput.sendPitchBend(event.cents);
                    this.synthesizer.noteOn(event.note, velocity);
                    this.updateNoteDisplay(event.note, frequency, event.cents);
                    if (this.isRecording) {
                        this.recorder.noteOn(event.note, velocity, event.cents);
                    }
                    break;

                case 'noteOff':
                    this.midiOutput.sendNoteOff(event.note);
                    this.midiOutput.resetPitchBend();
                    this.synthesizer.noteOff();
                    this.updateNoteDisplay(null, null, 0);
                    if (this.isRecording) {
                        this.recorder.noteOff(event.note);
                    }
                    break;

                case 'noteChange':
                    this.midiOutput.sendNoteOff(event.oldNote);
                    this.midiOutput.resetPitchBend();
                    this.midiOutput.sendNoteOn(event.newNote, velocity);
                    this.midiOutput.sendPitchBend(event.cents);
                    this.synthesizer.noteOn(event.newNote, velocity);
                    this.updateNoteDisplay(event.newNote, frequency, event.cents);
                    if (this.isRecording) {
                        this.recorder.noteOff(event.oldNote);
                        this.recorder.noteOn(event.newNote, velocity, event.cents);
                    }
                    break;

                case 'pitchBend':
                    this.midiOutput.sendPitchBend(event.cents);
                    this.synthesizer.updatePitch(event.note, event.cents);
                    this.updateCentsDisplay(event.cents);
                    break;
            }
        }

        const processTime = performance.now() - startTime;
        const latencyEl = document.getElementById('dubloonLatency');
        if (latencyEl) latencyEl.textContent = `${processTime.toFixed(1)}ms`;
    }

    updateNoteDisplay(midiNote, frequency, cents) {
        const noteNameEl = document.getElementById('dubloonNoteName');
        const frequencyEl = document.getElementById('dubloonFrequency');
        const midiNoteEl = document.getElementById('dubloonMidiNote');

        if (midiNote === null) {
            if (noteNameEl) {
                noteNameEl.textContent = '--';
                noteNameEl.classList.remove('active');
            }
            if (frequencyEl) frequencyEl.textContent = '--- Hz';
            if (midiNoteEl) midiNoteEl.textContent = 'MIDI --';
        } else {
            if (noteNameEl) {
                noteNameEl.textContent = this.midiToNoteName(midiNote);
                noteNameEl.classList.add('active');
            }
            if (frequencyEl) frequencyEl.textContent = `${frequency.toFixed(1)} Hz`;
            if (midiNoteEl) midiNoteEl.textContent = `MIDI ${midiNote}`;
        }

        this.updateCentsDisplay(cents);
    }

    updateCentsDisplay(cents) {
        const centsEl = document.getElementById('dubloonCents');
        const indicatorEl = document.getElementById('dubloonCentsIndicator');

        if (cents === 0 || this.noteTracker.currentNote === null) {
            if (centsEl) centsEl.textContent = '-- cents';
            if (indicatorEl) indicatorEl.className = 'dubloon-cents-indicator';
        } else {
            const sign = cents > 0 ? '+' : '';
            if (centsEl) centsEl.textContent = `${sign}${cents} cents`;

            if (indicatorEl) {
                indicatorEl.classList.remove('flat', 'sharp', 'in-tune');
                if (Math.abs(cents) <= 10) {
                    indicatorEl.classList.add('in-tune');
                } else if (cents < 0) {
                    indicatorEl.classList.add('flat');
                } else {
                    indicatorEl.classList.add('sharp');
                }
            }
        }
    }

    setStatus(state, text) {
        const dot = document.getElementById('dubloonStatusDot');
        const textEl = document.getElementById('dubloonStatusText');

        if (dot) {
            dot.className = 'dubloon-status-dot';
            if (state) dot.classList.add(state);
        }
        if (textEl) textEl.textContent = text;
    }

    showError(message) {
        const banner = document.getElementById('dubloonErrorBanner');
        if (banner) {
            banner.textContent = message;
            banner.classList.add('visible');
        }
    }

    hideError() {
        const banner = document.getElementById('dubloonErrorBanner');
        if (banner) banner.classList.remove('visible');
    }

    // ==========================================
    // RECORDING CONTROLS
    // ==========================================
    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    startRecording() {
        if (!this.isRunning) {
            this.start();
        }
        this.isRecording = true;
        this.recorder.start();
        document.getElementById('dubloonRecordBtn').classList.add('recording');
    }

    stopRecording() {
        this.isRecording = false;
        if (this.recorder.currentNote) {
            this.recorder.noteOff(this.recorder.currentNote.note);
        }
        this.recordedNotes = this.recorder.getNotes();
        this.timelineVisualizer.setNotes(this.recordedNotes);
        this.updateTimelineSize();
        document.getElementById('dubloonRecordBtn').classList.remove('recording');
    }

    startPlayback() {
        if (this.recordedNotes.length === 0) return;
        if (this.isPlaying) return;
        if (this.isRecording) {
            this.stopRecording();
        }

        this.isPlaying = true;
        this.playbackStartTime = performance.now();
        this.timelineVisualizer.isPlaying = true;

        // Reset played flags
        this.recordedNotes.forEach(note => {
            note.played = false;
            note.stopped = false;
        });

        // Initialize synthesizer if needed
        if (!this.synthesizer.audioContext) {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.synthesizer.initialize(audioContext);
        }
        this.synthesizer.setEnabled(true);

        this.playRecordedNotes();
    }

    playRecordedNotes() {
        if (!this.isPlaying) return;

        const elapsed = performance.now() - this.playbackStartTime;
        this.timelineVisualizer.setPlaybackPosition(elapsed);
        this.updateTimelinePosition(elapsed);

        // Find notes to play
        this.recordedNotes.forEach(note => {
            if (!note.played && elapsed >= note.startTime) {
                this.synthesizer.noteOn(note.note, note.velocity);
                note.played = true;
            }
            if (note.played && !note.stopped && elapsed >= note.endTime) {
                this.synthesizer.noteOff();
                note.stopped = true;
            }
        });

        // Continue or stop
        const duration = Math.max(...this.recordedNotes.map(n => n.endTime || 0));
        if (elapsed < duration) {
            this.playbackTimeout = requestAnimationFrame(() => this.playRecordedNotes());
        } else {
            this.stopPlayback();
        }
    }

    stopPlayback() {
        this.isPlaying = false;
        this.timelineVisualizer.isPlaying = false;
        this.timelineVisualizer.setPlaybackPosition(0);
        this.updateTimelinePosition(0);

        if (this.playbackTimeout) {
            cancelAnimationFrame(this.playbackTimeout);
            this.playbackTimeout = null;
        }

        this.synthesizer.noteOff();

        // Reset played flags
        this.recordedNotes.forEach(note => {
            note.played = false;
            note.stopped = false;
        });
    }

    clearRecording() {
        this.stopPlayback();
        if (this.isRecording) {
            this.stopRecording();
        }
        this.recordedNotes = [];
        this.recorder.clear();
        this.timelineVisualizer.setNotes([]);
        this.updateTimelineSize();
    }

    updateTimelinePosition(ms) {
        const posEl = document.getElementById('dubloonTimelinePosition');
        if (posEl) {
            const seconds = ms / 1000;
            const mins = Math.floor(seconds / 60);
            const secs = (seconds % 60).toFixed(1);
            posEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`;
        }
    }

    updateTimelineSize() {
        const pane = document.getElementById('dubloonTimelinePane');
        if (pane && this.timelineVisualizer) {
            this.timelineVisualizer.resize(pane.clientWidth - 32, pane.clientHeight);
        }
    }

    setupResizeHandle() {
        const handle = document.getElementById('dubloonResizeHandle');
        const pane = document.getElementById('dubloonTimelinePane');
        if (!handle || !pane) return;

        let startY, startHeight;

        const onMouseMove = (e) => {
            const delta = startY - e.clientY;
            const newHeight = Math.max(this.timelineMinHeight,
                              Math.min(this.timelineMaxHeight, startHeight + delta));
            pane.style.height = `${newHeight}px`;
            this.timelineHeight = newHeight;
            this.updateTimelineSize();
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        handle.addEventListener('mousedown', (e) => {
            startY = e.clientY;
            startHeight = pane.clientHeight;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });
    }

    // Settings persistence
    saveSettings() {
        const settings = {
            midiOutputId: document.getElementById('dubloonMidiSelect')?.value,
            micId: document.getElementById('dubloonMicSelect')?.value,
            channel: this.CONFIG.channel,
            octaveShift: this.CONFIG.octaveShift,
            sensitivity: this.CONFIG.sensitivity,
            synthEnabled: this.CONFIG.synthEnabled,
            synthVolume: this.CONFIG.synthVolume,
            synthWaveform: this.CONFIG.synthWaveform
        };
        localStorage.setItem('dubloon_inspector_settings', JSON.stringify(settings));
    }

    loadSettings(micDevices) {
        try {
            const stored = localStorage.getItem('dubloon_inspector_settings');
            if (!stored) return;
            const settings = JSON.parse(stored);

            if (settings.channel !== undefined) {
                this.CONFIG.channel = settings.channel;
                const el = document.getElementById('dubloonChannelSelect');
                if (el) el.value = settings.channel;
            }

            if (settings.octaveShift !== undefined) {
                this.CONFIG.octaveShift = settings.octaveShift;
                this.updateOctaveDisplay();
            }

            if (settings.sensitivity !== undefined) {
                this.CONFIG.sensitivity = settings.sensitivity;
                const el = document.getElementById('dubloonSensitivity');
                const valEl = document.getElementById('dubloonSensitivityValue');
                if (el) el.value = settings.sensitivity;
                if (valEl) valEl.textContent = `${settings.sensitivity}%`;
            }

            if (settings.midiOutputId) {
                const outputs = this.midiOutput.getOutputs();
                if (outputs.some(o => o.id === settings.midiOutputId)) {
                    const el = document.getElementById('dubloonMidiSelect');
                    if (el) el.value = settings.midiOutputId;
                }
            }

            if (settings.micId && micDevices.some(d => d.id === settings.micId)) {
                const el = document.getElementById('dubloonMicSelect');
                if (el) el.value = settings.micId;
            }

            if (settings.synthEnabled !== undefined) {
                this.CONFIG.synthEnabled = settings.synthEnabled;
                const el = document.getElementById('dubloonSynthEnabled');
                const ctrlEl = document.getElementById('dubloonSynthControls');
                if (el) el.checked = settings.synthEnabled;
                if (ctrlEl) ctrlEl.classList.toggle('visible', settings.synthEnabled);
            }

            if (settings.synthVolume !== undefined) {
                this.CONFIG.synthVolume = settings.synthVolume;
                const el = document.getElementById('dubloonSynthVolume');
                const valEl = document.getElementById('dubloonSynthVolumeValue');
                if (el) el.value = settings.synthVolume;
                if (valEl) valEl.textContent = `${settings.synthVolume}%`;
            }

            if (settings.synthWaveform !== undefined) {
                this.CONFIG.synthWaveform = settings.synthWaveform;
                const el = document.getElementById('dubloonSynthWaveform');
                if (el) el.value = settings.synthWaveform;
            }
        } catch (e) {
            console.warn('Failed to load settings:', e);
        }
    }
}

// ==========================================
// YIN PITCH DETECTION
// ==========================================
class DubloonYinDetector {
    constructor(sampleRate, bufferSize, config) {
        this.sampleRate = sampleRate;
        this.bufferSize = bufferSize;
        this.halfBuffer = Math.floor(bufferSize / 2);
        this.yinBuffer = new Float32Array(this.halfBuffer);
        this.config = config;
    }

    detect(buffer, threshold = null) {
        threshold = threshold || this.config.yinThreshold;
        const halfBuffer = this.halfBuffer;
        const yinBuffer = this.yinBuffer;

        // Step 1: Difference function
        for (let tau = 0; tau < halfBuffer; tau++) {
            yinBuffer[tau] = 0;
            for (let i = 0; i < halfBuffer; i++) {
                const delta = buffer[i] - buffer[i + tau];
                yinBuffer[tau] += delta * delta;
            }
        }

        // Step 2: Cumulative mean normalized difference
        yinBuffer[0] = 1;
        let runningSum = 0;
        for (let tau = 1; tau < halfBuffer; tau++) {
            runningSum += yinBuffer[tau];
            yinBuffer[tau] = yinBuffer[tau] * tau / runningSum;
        }

        // Step 3: Absolute threshold
        let tauEstimate = -1;
        for (let tau = 2; tau < halfBuffer; tau++) {
            if (yinBuffer[tau] < threshold) {
                while (tau + 1 < halfBuffer && yinBuffer[tau + 1] < yinBuffer[tau]) {
                    tau++;
                }
                tauEstimate = tau;
                break;
            }
        }

        if (tauEstimate === -1) {
            return { frequency: null, confidence: 0 };
        }

        // Step 4: Parabolic interpolation
        const betterTau = this.parabolicInterpolation(tauEstimate);
        const frequency = this.sampleRate / betterTau;
        const confidence = 1 - yinBuffer[tauEstimate];

        return { frequency, confidence };
    }

    parabolicInterpolation(tauEstimate) {
        const yinBuffer = this.yinBuffer;
        const x0 = tauEstimate < 1 ? tauEstimate : tauEstimate - 1;
        const x2 = tauEstimate + 1 < this.halfBuffer ? tauEstimate + 1 : tauEstimate;

        if (x0 === tauEstimate) {
            return yinBuffer[tauEstimate] <= yinBuffer[x2] ? tauEstimate : x2;
        }
        if (x2 === tauEstimate) {
            return yinBuffer[tauEstimate] <= yinBuffer[x0] ? tauEstimate : x0;
        }

        const s0 = yinBuffer[x0];
        const s1 = yinBuffer[tauEstimate];
        const s2 = yinBuffer[x2];

        return tauEstimate + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
    }
}

// ==========================================
// NOTE TRACKER
// ==========================================
class DubloonNoteTracker {
    constructor(config) {
        this.config = config;
        this.currentNote = null;
        this.noteStartTime = 0;
        this.silenceStartTime = 0;
        this.consecutiveReadings = 0;
        this.pendingNote = null;
    }

    reset() {
        this.currentNote = null;
        this.noteStartTime = 0;
        this.silenceStartTime = 0;
        this.consecutiveReadings = 0;
        this.pendingNote = null;
    }

    update(frequency, confidence, timestamp, inspector) {
        const adjustedThreshold = this.config.confidenceThreshold * (1 - this.config.sensitivity / 200);

        if (confidence < adjustedThreshold || frequency === null ||
            frequency < this.config.minFrequency || frequency > this.config.maxFrequency) {
            return this.handleSilence(timestamp);
        }

        const { note, cents } = inspector.frequencyToMidiWithCents(frequency);
        const shiftedNote = note + (this.config.octaveShift * 12);

        if (shiftedNote < 0 || shiftedNote > 127) {
            return this.handleSilence(timestamp);
        }

        if (this.currentNote === null) {
            return this.handleNewNote(shiftedNote, cents, timestamp);
        }

        if (shiftedNote !== this.currentNote) {
            const centsDiff = Math.abs(cents);
            if (centsDiff > this.config.centsHysteresis || Math.abs(shiftedNote - this.currentNote) > 1) {
                return this.handleNoteChange(shiftedNote, cents, timestamp);
            }
        }

        this.silenceStartTime = 0;
        return { type: 'pitchBend', note: this.currentNote, cents };
    }

    handleNewNote(note, cents, timestamp) {
        if (this.pendingNote === note) {
            this.consecutiveReadings++;
        } else {
            this.pendingNote = note;
            this.consecutiveReadings = 1;
        }

        if (this.consecutiveReadings >= this.config.noteOnConsecutive) {
            this.currentNote = note;
            this.noteStartTime = timestamp;
            this.consecutiveReadings = 0;
            this.pendingNote = null;
            this.silenceStartTime = 0;
            return { type: 'noteOn', note, cents };
        }

        return null;
    }

    handleNoteChange(newNote, cents, timestamp) {
        const noteDuration = timestamp - this.noteStartTime;
        if (noteDuration < this.config.minNoteDuration) {
            return null;
        }

        const oldNote = this.currentNote;
        this.currentNote = newNote;
        this.noteStartTime = timestamp;
        this.silenceStartTime = 0;
        return { type: 'noteChange', oldNote, newNote, cents };
    }

    handleSilence(timestamp) {
        this.consecutiveReadings = 0;
        this.pendingNote = null;

        if (this.currentNote === null) {
            return null;
        }

        if (this.silenceStartTime === 0) {
            this.silenceStartTime = timestamp;
        }

        if (timestamp - this.silenceStartTime > this.config.noteOffDelay) {
            const note = this.currentNote;
            this.currentNote = null;
            return { type: 'noteOff', note };
        }

        return null;
    }
}

// ==========================================
// MIDI OUTPUT
// ==========================================
class DubloonMidiOutput {
    constructor(config) {
        this.config = config;
        this.midiAccess = null;
        this.selectedOutput = null;
        this.lastPitchBend = 8192;
    }

    async initialize() {
        if (!navigator.requestMIDIAccess) {
            throw new Error('Web MIDI API not supported in this browser');
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
            this.midiAccess.onstatechange = (e) => this.onStateChange(e);
            return this.getOutputs();
        } catch (err) {
            throw new Error(`MIDI access denied: ${err.message}`);
        }
    }

    getOutputs() {
        const outputs = [];
        if (!this.midiAccess) return outputs;

        this.midiAccess.outputs.forEach((output) => {
            outputs.push({
                id: output.id,
                name: output.name || 'Unknown Device',
                manufacturer: output.manufacturer
            });
        });
        return outputs;
    }

    selectOutput(outputId) {
        if (!this.midiAccess || !outputId) {
            this.selectedOutput = null;
            return false;
        }
        this.selectedOutput = this.midiAccess.outputs.get(outputId);
        return this.selectedOutput !== undefined;
    }

    onStateChange(event) {
        console.log('MIDI state change:', event.port.name, event.port.state);
        window.dispatchEvent(new CustomEvent('midiStateChange'));
    }

    sendNoteOn(note, velocity = 100) {
        if (!this.selectedOutput) return;

        note = Math.max(0, Math.min(127, note));
        velocity = Math.max(1, Math.min(127, velocity));

        const statusByte = 0x90 | this.config.channel;
        this.selectedOutput.send([statusByte, note, velocity]);
    }

    sendNoteOff(note) {
        if (!this.selectedOutput) return;

        note = Math.max(0, Math.min(127, note));

        const statusByte = 0x80 | this.config.channel;
        this.selectedOutput.send([statusByte, note, 0]);
    }

    sendPitchBend(cents) {
        if (!this.selectedOutput) return;

        const bendRange = this.config.pitchBendRange * 100;
        const normalizedBend = cents / bendRange;
        const bendValue = Math.round(8192 + normalizedBend * 8191);
        const clampedBend = Math.max(0, Math.min(16383, bendValue));

        if (Math.abs(clampedBend - this.lastPitchBend) < 64) return;
        this.lastPitchBend = clampedBend;

        const lsb = clampedBend & 0x7F;
        const msb = (clampedBend >> 7) & 0x7F;

        const statusByte = 0xE0 | this.config.channel;
        this.selectedOutput.send([statusByte, lsb, msb]);
    }

    resetPitchBend() {
        if (!this.selectedOutput) return;

        this.lastPitchBend = 8192;
        const statusByte = 0xE0 | this.config.channel;
        this.selectedOutput.send([statusByte, 0, 64]);
    }

    allNotesOff() {
        if (!this.selectedOutput) return;

        const statusByte = 0xB0 | this.config.channel;
        this.selectedOutput.send([statusByte, 123, 0]);
        this.resetPitchBend();
    }
}

// ==========================================
// SYNTHESIZER
// ==========================================
class DubloonSynthesizer {
    constructor(config, inspector) {
        this.config = config;
        this.inspector = inspector;
        this.audioContext = null;
        this.masterGain = null;
        this.oscillator = null;
        this.gainNode = null;
        this.currentNote = null;
        this.isEnabled = false;
    }

    initialize(audioContext) {
        this.audioContext = audioContext;
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = this.config.synthVolume / 100;
        this.masterGain.connect(this.audioContext.destination);
    }

    setEnabled(enabled) {
        this.isEnabled = enabled;
        if (!enabled && this.oscillator) {
            this.noteOff();
        }
    }

    setVolume(volume) {
        this.config.synthVolume = volume;
        if (this.masterGain) {
            this.masterGain.gain.value = volume / 100;
        }
    }

    setWaveform(waveform) {
        this.config.synthWaveform = waveform;
        if (this.oscillator) {
            this.oscillator.type = waveform;
        }
    }

    noteOn(midiNote, velocity = 100) {
        if (!this.isEnabled || !this.audioContext) return;

        if (this.currentNote === midiNote && this.oscillator) {
            return;
        }

        this.noteOff();

        const frequency = this.inspector.midiToFrequency(midiNote);
        const now = this.audioContext.currentTime;

        this.oscillator = this.audioContext.createOscillator();
        this.oscillator.type = this.config.synthWaveform;
        this.oscillator.frequency.value = frequency;

        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 0;

        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.masterGain);

        const velocityGain = (velocity / 127) * 0.5;
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(velocityGain, now + this.config.synthAttack);

        this.oscillator.start(now);
        this.currentNote = midiNote;
    }

    noteOff() {
        if (!this.oscillator || !this.audioContext) return;

        const now = this.audioContext.currentTime;

        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(0, now + this.config.synthRelease);

        const osc = this.oscillator;
        const gain = this.gainNode;

        setTimeout(() => {
            try {
                osc.stop();
                osc.disconnect();
                gain.disconnect();
            } catch (e) {
                // Ignore
            }
        }, this.config.synthRelease * 1000 + 50);

        this.oscillator = null;
        this.gainNode = null;
        this.currentNote = null;
    }

    updatePitch(midiNote, cents) {
        if (!this.oscillator || !this.isEnabled) return;

        const baseFreq = this.inspector.midiToFrequency(midiNote);
        const centsRatio = Math.pow(2, cents / 1200);
        const actualFreq = baseFreq * centsRatio;

        this.oscillator.frequency.value = actualFreq;
    }

    stop() {
        this.noteOff();
        if (this.masterGain) {
            this.masterGain.disconnect();
            this.masterGain = null;
        }
        this.audioContext = null;
    }
}

// ==========================================
// AUDIO CAPTURE
// ==========================================
class DubloonAudioCapture {
    constructor(config) {
        this.config = config;
        this.audioContext = null;
        this.stream = null;
        this.source = null;
        this.analyser = null;
        this.buffer = null;
    }

    async initialize(deviceId = null) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const constraints = {
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        };

        if (deviceId) {
            constraints.audio.deviceId = { exact: deviceId };
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.source = this.audioContext.createMediaStreamSource(this.stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = this.config.bufferSize;
            this.source.connect(this.analyser);

            this.buffer = new Float32Array(this.analyser.fftSize);

            return this.audioContext.sampleRate;
        } catch (err) {
            throw new Error(`Microphone access denied: ${err.message}`);
        }
    }

    getBuffer() {
        if (!this.analyser || !this.buffer) return null;
        this.analyser.getFloatTimeDomainData(this.buffer);
        return this.buffer;
    }

    async getDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices
                .filter(d => d.kind === 'audioinput')
                .map(d => ({
                    id: d.deviceId,
                    name: d.label || `Microphone ${d.deviceId.slice(0, 8)}`
                }));
        } catch (err) {
            return [];
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.analyser = null;
        this.buffer = null;
    }
}

// ==========================================
// VISUALIZER
// ==========================================
class DubloonVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();

        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas.parentElement) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width - 4;
        // Use parent height minus padding, with a minimum of 50px
        this.canvas.height = Math.max(50, rect.height - 4);
    }

    drawWaveform(buffer) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.fillStyle = '#21262d';
        ctx.fillRect(0, 0, width, height);

        if (!buffer) return;

        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 2;
        ctx.beginPath();

        const sliceWidth = width / buffer.length;
        let x = 0;

        for (let i = 0; i < buffer.length; i++) {
            const v = (buffer[i] + 1) / 2;
            const y = v * height;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }

        ctx.stroke();
    }

    clear() {
        const ctx = this.ctx;
        ctx.fillStyle = '#21262d';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, this.canvas.height / 2);
        ctx.lineTo(this.canvas.width, this.canvas.height / 2);
        ctx.stroke();
    }
}

// ==========================================
// RECORDER
// ==========================================
class DubloonRecorder {
    constructor(config, inspector) {
        this.config = config;
        this.inspector = inspector;
        this.notes = [];
        this.startTime = 0;
        this.currentNote = null;
    }

    start() {
        this.startTime = performance.now();
        this.notes = [];
        this.currentNote = null;
    }

    noteOn(note, velocity, cents) {
        const time = performance.now() - this.startTime;
        this.currentNote = {
            note,
            velocity,
            cents,
            startTime: time,
            endTime: null
        };
    }

    noteOff(note) {
        if (this.currentNote && this.currentNote.note === note) {
            this.currentNote.endTime = performance.now() - this.startTime;
            this.notes.push({ ...this.currentNote });
            this.currentNote = null;
        }
    }

    getNotes() {
        return this.notes;
    }

    getDuration() {
        if (this.notes.length === 0) return 0;
        return Math.max(...this.notes.map(n => n.endTime || 0));
    }

    clear() {
        this.notes = [];
        this.currentNote = null;
    }
}

// ==========================================
// TIMELINE VISUALIZER
// ==========================================
class DubloonTimelineVisualizer {
    constructor(canvas, labelsContainer, inspector) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.labelsContainer = labelsContainer;
        this.inspector = inspector;
        this.notes = [];
        this.pixelsPerSecond = 50;
        this.noteHeight = 8;
        this.minNote = 48;  // C3
        this.maxNote = 84;  // C6
        this.playbackPosition = 0;
        this.isPlaying = false;
    }

    setNotes(notes) {
        this.notes = notes;
        this.updateRange();
        this.render();
    }

    updateRange() {
        if (this.notes.length === 0) {
            this.minNote = 48;
            this.maxNote = 84;
            return;
        }
        const noteValues = this.notes.map(n => n.note);
        this.minNote = Math.max(0, Math.min(...noteValues) - 4);
        this.maxNote = Math.min(127, Math.max(...noteValues) + 4);
    }

    resize(width, height) {
        const duration = this.getDuration();
        const minWidth = Math.max(width, (duration / 1000) * this.pixelsPerSecond + 100);
        this.canvas.width = minWidth;
        this.canvas.height = height;
        this.noteHeight = height / (this.maxNote - this.minNote + 1);
        this.renderLabels();
        this.render();
    }

    getDuration() {
        if (this.notes.length === 0) return 0;
        return Math.max(...this.notes.map(n => n.endTime || 0));
    }

    renderLabels() {
        this.labelsContainer.innerHTML = '';
        for (let note = this.maxNote; note >= this.minNote; note--) {
            const label = document.createElement('div');
            label.style.height = `${this.noteHeight}px`;
            label.style.lineHeight = `${this.noteHeight}px`;
            label.textContent = this.inspector.midiToNoteName(note);
            this.labelsContainer.appendChild(label);
        }
    }

    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear
        ctx.fillStyle = '#161b22';
        ctx.fillRect(0, 0, width, height);

        // Draw grid lines
        this.drawGrid();

        // Draw notes
        this.notes.forEach(note => this.drawNote(note));

        // Draw playback cursor
        if (this.isPlaying || this.playbackPosition > 0) {
            this.drawPlaybackCursor();
        }
    }

    drawGrid() {
        const ctx = this.ctx;
        const height = this.canvas.height;

        // Horizontal lines (pitch)
        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 1;
        for (let note = this.minNote; note <= this.maxNote; note++) {
            const y = this.noteToY(note);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.canvas.width, y);
            ctx.stroke();
        }

        // Vertical lines (time) - every second
        ctx.strokeStyle = '#30363d';
        const totalSeconds = Math.ceil(this.canvas.width / this.pixelsPerSecond);
        for (let t = 0; t <= totalSeconds; t++) {
            const x = t * this.pixelsPerSecond;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            // Time label
            ctx.fillStyle = '#8b949e';
            ctx.font = '9px SF Mono, Monaco, monospace';
            ctx.fillText(`${t}s`, x + 3, height - 4);
        }
    }

    drawNote(note) {
        const ctx = this.ctx;
        const x = (note.startTime / 1000) * this.pixelsPerSecond;
        const width = ((note.endTime - note.startTime) / 1000) * this.pixelsPerSecond;
        const y = this.noteToY(note.note);

        // Note rectangle with gradient
        const gradient = ctx.createLinearGradient(x, y - this.noteHeight, x, y);
        gradient.addColorStop(0, '#79c0ff');
        gradient.addColorStop(1, '#58a6ff');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y - this.noteHeight + 2, Math.max(3, width), this.noteHeight - 4);

        // Note border
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y - this.noteHeight + 2, Math.max(3, width), this.noteHeight - 4);
    }

    drawPlaybackCursor() {
        const ctx = this.ctx;
        const x = (this.playbackPosition / 1000) * this.pixelsPerSecond;

        ctx.strokeStyle = '#f85149';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.canvas.height);
        ctx.stroke();

        // Cursor head
        ctx.fillStyle = '#f85149';
        ctx.beginPath();
        ctx.moveTo(x - 5, 0);
        ctx.lineTo(x + 5, 0);
        ctx.lineTo(x, 8);
        ctx.closePath();
        ctx.fill();
    }

    noteToY(midiNote) {
        return (this.maxNote - midiNote) * this.noteHeight + this.noteHeight;
    }

    setPlaybackPosition(ms) {
        this.playbackPosition = ms;
        this.render();
    }
}

// ==========================================
// INITIALIZATION
// ==========================================
let dubloonInstance = null;
let dubloonNavButton = null;
let dubloonPageElement = null;

let generateDubloonToolBtn = (pageEl) => {
    log("dubloon", "generateToolBtn");

    dubloonNavButton = document.createElement("button");
    dubloonNavButton.classList.add("nav-item");
    dubloonNavButton.setAttribute("data-page", "dubloon");
    dubloonNavButton.innerHTML = `
        <span class="nav-icon">🎵</span>
        Dubloon
    `;

    const navItems = document.querySelector(".nav-items");
    if (navItems) {
        navItems.appendChild(dubloonNavButton);
        log("dubloon", "Nav button added to navigation");
    } else {
        err("dubloon", "Could not find .nav-items");
        return;
    }

    dubloonNavButton.addEventListener("mousedown", () => {
        log("dubloon", "Nav button clicked");

        if (window.navigation && typeof window.navigation.switchPage === 'function') {
            log("dubloon", "Using navigation.switchPage()");
            window.navigation.switchPage('dubloon');
        } else {
            log("dubloon", "Using fallback page switching");

            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });

            const dubloonPage = document.getElementById('dubloon-page');
            if (dubloonPage) {
                dubloonPage.classList.add('active');
            }
            dubloonNavButton.classList.add('active');

            window.dispatchEvent(new CustomEvent('page-switched', {
                detail: { pageId: 'dubloon' }
            }));
        }
    });

    if (window.navigation && pageEl && typeof window.navigation.addDynamicPage === 'function') {
        try {
            log("dubloon", "Registering with navigation system");
            window.navigation.addDynamicPage('dubloon', pageEl, dubloonNavButton);
        } catch (error) {
            err("dubloon", "Failed to register with navigation:", error);
        }
    }
};

this.onStart = async () => {
    log("dubloon", "onStart - initializing Dubloon");
    dubloonInstance = new InspectorDubloon();

    dubloonPageElement = await dubloonInstance.init();
    generateDubloonToolBtn(dubloonPageElement);

    window.dubloonInstance = dubloonInstance;
};

this.onDestroy = () => {
    log("dubloon", "onDestroy - cleaning up");

    if (dubloonInstance && dubloonInstance.isRunning) {
        dubloonInstance.stop();
    }

    if (window.navigation && typeof window.navigation.removeDynamicPage === 'function') {
        try {
            window.navigation.removeDynamicPage('dubloon');
            log("dubloon", "Removed via navigation system");
        } catch (error) {
            err("dubloon", "Error removing from navigation:", error);
        }
    }

    if (dubloonNavButton && dubloonNavButton.parentNode) {
        dubloonNavButton.remove();
    }

    const page = document.getElementById('dubloon-page');
    if (page && page.parentNode) {
        page.remove();
    }

    const styles = document.getElementById('dubloon-styles');
    if (styles && styles.parentNode) {
        styles.remove();
    }

    if (window.dubloonInstance) {
        delete window.dubloonInstance;
    }

    dubloonInstance = null;
    dubloonNavButton = null;
    dubloonPageElement = null;
};
