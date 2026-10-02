document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('map-container');
    const zoomLevelEl = document.getElementById('zoom-level');
    const loadingEl = document.getElementById('loading');
    const layerList = document.getElementById('layer-list');

    const gradientStops = [
        { pos: 0, color: [0x0A, 0x0A, 0x0A] },
        { pos: 48, color: [0x62, 0x62, 0x62] },
        { pos: 73, color: [0xAA, 0x9F, 0x8E] },
        { pos: 86, color: [0xE7, 0xD1, 0xB1] },
        { pos: 100, color: [0xEE, 0xEC, 0xE8] },
    ];

    function buildColorTable(stops) {
        const table = [];
        for (let i = 0; i <= 100; i++) {
            let prev = stops[0], next = stops[stops.length - 1];
            for (let j = 0; j < stops.length - 1; j++) {
                if (i >= stops[j].pos && i <= stops[j + 1].pos) {
                    prev = stops[j];
                    next = stops[j + 1];
                    break;
                }
            }
            const t = (i - prev.pos) / (next.pos - prev.pos || 1);
            table.push([
                Math.round(prev.color[0] + (next.color[0] - prev.color[0]) * t),
                Math.round(prev.color[1] + (next.color[1] - prev.color[1]) * t),
                Math.round(prev.color[2] + (next.color[2] - prev.color[2]) * t),
            ]);
        }
        return table;
    }

    const colors = buildColorTable(gradientStops);
    const tableVals = ['R', 'G', 'B'].map((ch, i) =>
        colors.map(c => (c[i] / 255).toFixed(4)).join(' ')
    );
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    const filter = document.createElementNS(ns, 'filter');
    filter.setAttribute('id', 'gradient-map');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const cm = document.createElementNS(ns, 'feColorMatrix');
    cm.setAttribute('type', 'matrix');
    cm.setAttribute('values', '0.2126 0.7152 0.0722 0 0   0.2126 0.7152 0.0722 0 0   0.2126 0.7152 0.0722 0 0   0 0 0 1 0');
    cm.setAttribute('result', 'gray');
    filter.appendChild(cm);
    const ct = document.createElementNS(ns, 'feComponentTransfer');
    ct.setAttribute('result', 'mapped');
    ['R', 'G', 'B'].forEach((ch, i) => {
        const fn = document.createElementNS(ns, 'feFunc' + ch);
        fn.setAttribute('type', 'table');
        fn.setAttribute('tableValues', tableVals[i]);
        ct.appendChild(fn);
    });
    filter.appendChild(ct);
    const blend = document.createElementNS(ns, 'feComposite');
    blend.setAttribute('in', 'mapped');
    blend.setAttribute('in2', 'SourceGraphic');
    blend.setAttribute('operator', 'arithmetic');
    blend.setAttribute('k1', '0');
    blend.setAttribute('k2', '0.5');
    blend.setAttribute('k3', '0.5');
    blend.setAttribute('k4', '0');
    filter.appendChild(blend);
    svg.appendChild(filter);
    document.body.insertBefore(svg, document.body.firstChild);

    const layers = [
        { id: 'base', name: 'Base SVG', tileSrc: 'tiles/base', tileFormat: 'jpg', visible: true, imgW: 9370, imgH: 5590, locked: true },
        { id: 'grid', name: 'Grid', tileSrc: 'tiles/grid', tileFormat: 'jpg', visible: true, imgW: 9370, imgH: 5590, locked: true },
        { id: 'margins', name: 'Margins', src: 'assets/margins.svg', visible: true, imgW: 9370, imgH: 5590, locked: true },
        { id: 'noise', name: 'Noise (multiply)', src: null, visible: true, blend: 'multiply', filterFilter: 'url(#noise-filter)', opacity: 0.15, locked: true },
        { id: 'text', name: 'Text', src: 'assets/text.svg', visible: true, imgW: 9370, imgH: 5590 },
        { id: 'pics', name: 'Photos', tileSrc: 'tiles/pics', tileFormat: 'png', visible: true, imgW: 9370, imgH: 5590 },
        { id: 'tracks', name: 'Tracks', src: 'assets/tracks.svg', visible: true, imgW: 9370, imgH: 5590 },
    ];

    const viewer = new MapViewer(container, {
        layers: layers,
        physicalW: 238,
        physicalH: 142,
        displayPhysicalW: 28.65,
        displayPhysicalH: 17.9,
        tileMaxLevel: 7,
        onZoomChange: (percent) => {
            zoomLevelEl.textContent = `${percent}%`;
        }
    });

    const gmAffectedIds = ['base', 'grid', 'margins', 'noise'];

    function applyGradientMap(on) {
        gmAffectedIds.forEach(id => {
            const el = container.querySelector(`[data-layer="${id}"]`);
            if (!el) return;
            if (id === 'noise') {
                const origFilter = 'url(#noise-filter)';
                el.style.filter = on ? `${origFilter} url(#gradient-map)` : origFilter;
            } else {
                el.style.filter = on ? 'url(#gradient-map)' : '';
            }
        });
    }

    viewer.onReady = () => {
        new Minimap(viewer);
        loadingEl.classList.add('hidden');
        applyGradientMap(true);
    };

    const uiLayers = layers.toReversed().filter(layer => {
        return ['text', 'pics', 'tracks'].includes(layer.id);
    });
    uiLayers.forEach(layer => {
        if (!layerList) return;
        const item = document.createElement('label');
        item.className = 'layer-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = layer.visible;
        cb.dataset.layer = layer.id;
        cb.addEventListener('change', () => {
            viewer.toggleLayer(layer.id, cb.checked);
        });
        item.appendChild(cb);
        item.appendChild(document.createTextNode(layer.name));
        layerList.appendChild(item);
    });

    const toggleLayersBtn = document.getElementById('toggle-layers');
    const layerPanel = document.getElementById('layer-panel');
    if (toggleLayersBtn && layerPanel) {
        toggleLayersBtn.addEventListener('click', () => {
            layerPanel.classList.toggle('hidden');
        });
    }

    document.getElementById('zoom-in').addEventListener('click', () => viewer.zoomIn());
    document.getElementById('zoom-out').addEventListener('click', () => viewer.zoomOut());
    document.getElementById('fit-view').addEventListener('click', () => {
        viewer.fitToView();
        zoomLevelEl.textContent = `${viewer.getZoomPercent()}%`;
    });

    // ---- Coordinate readout + capture ----
    const readoutEl = document.getElementById('coord-readout');
    const toCoords = (px, py) => {
        const rect = container.getBoundingClientRect();
        return {
            x: (-viewer.x + (px - rect.left)) / viewer.zoom,
            y: (-viewer.y + (py - rect.top)) / viewer.zoom
        };
    };

    container.addEventListener('mousemove', (e) => {
        if (!viewer.ready || !readoutEl.classList.contains('visible')) return;
        const c = toCoords(e.clientX, e.clientY);
        const center = toCoords(rectCenter()[0], rectCenter()[1]);
        readoutEl.textContent =
            `map: ${c.x.toFixed(2)}, ${c.y.toFixed(2)}\n` +
            `center: ${center.x.toFixed(2)}, ${center.y.toFixed(2)}\n` +
            `zoom: ${viewer.getZoomPercent()}%   [C] copy (30%)   [D] hide`;
    });

    function rectCenter() {
        const r = container.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'd' || e.key === 'D') {
            readoutEl.classList.toggle('visible');
        } else if (e.key === 'c' || e.key === 'C') {
            const r = container.getBoundingClientRect();
            const cx = (-viewer.x + r.width / 2) / viewer.zoom;
            const cy = (-viewer.y + r.height / 2) / viewer.zoom;
            const snippet = `{ x: ${cx.toFixed(2)}, y: ${cy.toFixed(2)} }`;
            console.log(`[tour] capture for zoom 30% -> ${snippet}`);
            try {
                navigator.clipboard.writeText(snippet);
                console.log('[tour] copied to clipboard');
            } catch (err) {
                console.log('[tour] clipboard unavailable, copy manually');
            }
        }
    });

    // ---- Video tour timeline & playback ----
    // The tour is a keyframe timeline. Each stop has a header time
    // (arrival), a dwell, and a fly leg to the next stop. Scrubbing the
    // timeline seeks the camera to the exact state at that time, with
    // easing + zoom interpolation between stops.
    const tourPlayBtn = document.getElementById('tour-play');
    const tourSeek = document.getElementById('tour-seek');
    const tourTimeLabel = document.getElementById('tour-time-label');
    const tourStopLabel = document.getElementById('tour-stop-label');
    const tourTotalLabel = document.getElementById('tour-total-label');

    const TOUR_FLY_MS = 2800;
    const TOUR_DWELL_MS = 1800;

    // Ordered stops. Each defines position + zoom as a percentage of the
    // zoom range (0% = overview, 100% = physical scale).
    const TOUR_STOPS = [
        // Opening: start at the centre of the map, zoomed in, then zoom
        // out gradually until the whole map is visible.
        { key: '1',  label: 'intro-start', x: 1227.16,    y: 580.48,    zoomPct: 27, flyMs: 4200, dwellMs: 1200 },
        { key: '2',  label: 'intro-map',   x: 4685,    y: 2795,    zoomPct: -2,  flyMs: 2800, dwellMs: 2000 },
        { key: '3',  label: 'zoom1', x: 823.7, y: 3483.80, zoomPct: 56, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '4',  label: 'KMA',  x: 1660.85, y: 2533.02, zoomPct: 30, flyMs: 5600, dwellMs: TOUR_DWELL_MS },
        { key: '5',  label: 'KMA1', x: 7552.15, y: 2664.54, zoomPct: 30, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '6',  label: 'SP',   x: 1872.31, y: 2254.28, zoomPct: 45, flyMs: 5600, dwellMs: TOUR_DWELL_MS },
        { key: '7',  label: 'SP1',  x: 1935.83, y: 3905.43, zoomPct: 70, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '8',  label: '3-4',  x: 3900.57, y: 749.14,  zoomPct: 22, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '9',  label: 'WalkSpeed', x: 6997.37, y: 4826.84, zoomPct: 29, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '10', label: 'Weber',     x: 4907.46, y: 2659.22, zoomPct: 30, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '11', label: 'Ost',       x: 3165.10, y: 4835.11, zoomPct: 30, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '12', label: '6',     x: 8349.52, y: 4080.84, zoomPct: 30, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '13', label: '7',     x: 7416.44, y: 2718.77, zoomPct: 15, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '14', label: '8',     x: 7116.87, y: 2206.44, zoomPct: 100, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '15', label: '9',     x: 5676.00, y: 957.18, zoomPct: 15, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '16', label: '10',    x: 4682.38, y: 2531.27, zoomPct: 15, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '17', label: '11',    x: 2417.65, y: 1166.38, zoomPct: 77, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '18', label: '12',    x: 813.40,  y: 3492.39, zoomPct: 100, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '19', label: '13',    x: 7125.22,  y: 5090.94, zoomPct: 100, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },
        { key: '20', label: '14',    x: 4685.00, y: 2795.00, zoomPct: -3, flyMs: TOUR_FLY_MS, dwellMs: TOUR_DWELL_MS },

    ];

    // Precompute cumulative segment times. Rebuildable so leg durations can
    // be scaled to match the audio track length.
    const SEG_MS = [];
    let TOTAL_MS = 0;
    function rebuildTimeline() {
        SEG_MS.length = 0;
        let acc = 0;
        for (const s of TOUR_STOPS) {
            SEG_MS.push(acc);
            acc += s.dwellMs;
            SEG_MS.push(acc);
            acc += s.flyMs;
        }
        TOTAL_MS = SEG_MS[SEG_MS.length - 1];
        tourTotalLabel.textContent = (TOTAL_MS / 1000).toFixed(1) + 's';
    }
    rebuildTimeline();

    // Audio soundtrack. The tour is scaled so total duration == audio duration.
    const tourAudio = new Audio('audio.wav');
    tourAudio.preload = 'auto';
    tourAudio.addEventListener('loadedmetadata', () => {
        if (!tourAudio.duration || isNaN(tourAudio.duration)) return;
        // Rescale every fly/dwell leg proportionally so the tour ends exactly
        // when the audio does, preserving the relative rhythm of each stop.
        const targetMs = tourAudio.duration * 1000;
        if (TOTAL_MS > 0 && Math.abs(TOTAL_MS - targetMs) > 50) {
            const scale = targetMs / TOTAL_MS;
            for (const s of TOUR_STOPS) {
                s.flyMs = Math.max(1, Math.round(s.flyMs * scale));
                s.dwellMs = Math.max(1, Math.round(s.dwellMs * scale));
            }
            rebuildTimeline();
        }
    });

    // Returns interpolated camera state { x, y, zoomPct, label, seg, t } at t ms.
    function tourStateAt(t) {
        t = Math.max(0, Math.min(TOTAL_MS, t));
        let seg = 0;
        while (seg < SEG_MS.length - 1 && t >= SEG_MS[seg + 1]) seg++;
        const i = Math.floor(seg / 2);          // stop index
        const isDwell = seg % 2 === 0;          // even seg = dwell, odd = fly
        const a = TOUR_STOPS[i];
        const b = TOUR_STOPS[Math.min(i + 1, TOUR_STOPS.length - 1)];

        if (isDwell) {
            return { x: a.x, y: a.y, zoomPct: a.zoomPct, label: a.label, seg, t, flying: false };
        }

        const legStart = SEG_MS[seg];
        const legEnd = SEG_MS[seg + 1];
        const frac = legEnd > legStart ? (t - legStart) / (legEnd - legStart) : 1;
        const e = viewer.easeInOutCubic(frac);
        return {
            x: a.x + (b.x - a.x) * e,
            y: a.y + (b.y - a.y) * e,
            zoomPct: a.zoomPct + (b.zoomPct - a.zoomPct) * e,
            label: `${a.label} → ${b.label}`,
            seg, t, flying: true
        };
    }

    function applyTourState(state) {
        viewer.setView(state.x, state.y, viewer.zoomForPercent(state.zoomPct));
        tourTimeLabel.textContent = (state.t / 1000).toFixed(1) + 's';
        tourStopLabel.textContent = state.label;
    }

    function seekTour(t) {
        applyTourState(tourStateAt(t));
        tourTime = t;
    }

    // Wire the seek bar (maps to ms).
    tourSeek.addEventListener('input', () => {
        const t = (tourSeek.value / 1000) * TOTAL_MS;
        seekTour(t);
        // Sync the audio to the scrub position even while paused, so a later
        // Play resumes exactly where the timeline is, not from 0.
        if (tourAudio.duration) tourAudio.currentTime = t / 1000;
    });

    // Chapter buttons fly to the arrival of the matching stop and sync the timeline.
    TOUR_STOPS.forEach((stop, i) => {
        const btn = document.querySelector(`.tour-stop[data-stop="${stop.key}"]`);
        if (!btn) return;
        btn.addEventListener('click', () => {
            const arrival = SEG_MS[i * 2];
            viewer.flyTo(stop.x, stop.y, viewer.zoomForPercent(stop.zoomPct));
            seekTour(arrival);
            tourSeek.value = (arrival / TOTAL_MS) * 1000;
            tourTimeLabel.textContent = (arrival / 1000).toFixed(1) + 's';
            tourStopLabel.textContent = stop.label;
            if (tourAudio.duration) tourAudio.currentTime = arrival / 1000;
        });
    });

    // ---- Playback (buffered) ----
    let tourPlaying = false;
    let tourRaf = null;
    let tourStart = 0;
    let tourRafStart = 0;
    let tourTime = 0;   // last seek position in ms
    let tourPreloadAbort = null;
    let tourPreloading = false;

    function stopVideoTour() {
        tourPlaying = false;
        if (tourRaf) cancelAnimationFrame(tourRaf);
        tourRaf = null;
        tourPlayBtn.classList.remove('playing');
        tourPlayBtn.textContent = '▶ Play tour';
        if (!tourAudio.paused) tourAudio.pause();
    }

    function startPlayback() {
        tourPlaying = true;
        tourPlayBtn.classList.add('playing');
        tourPlayBtn.textContent = '⏸ Stop tour';
        tourStart = tourTime;
        tourRafStart = performance.now();
        tourRaf = requestAnimationFrame(tourTick);
        try {
            tourAudio.currentTime = tourTime / 1000;
            const p = tourAudio.play();
            if (p && p.catch) p.catch(() => {});
        } catch (_) { /* autoplay blocked / missing file — tour still runs */ }
    }

    function tourTick(now) {
        if (!tourPlaying) return;
        const t = tourStart + (now - tourRafStart);
        if (t >= TOTAL_MS) {
            applyTourState(tourStateAt(TOTAL_MS));
            tourTime = TOTAL_MS;
            tourSeek.value = 1000;
            stopVideoTour();
            return;
        }
        applyTourState(tourStateAt(t));
        tourSeek.value = (t / TOTAL_MS) * 1000;
        tourTime = t;
        tourRaf = requestAnimationFrame(tourTick);
    }

    // Warm every tile the tour will need by actually decoding the images
    // with real <img> elements, then caching them so playback renders
    // instantly (no network fetch, no decode mid-flight). Falls back to
    // direct playback on file:// if decode/HTTP is unavailable.
    async function preloadTour() {
        if (tourPreloading) return;
        if (window.location.protocol === 'file:') {
            startPlayback();
            return;
        }

        tourPreloading = true;
        tourPreloadAbort = new AbortController();
        tourPlayBtn.classList.add('playing');
        tourPlayBtn.textContent = 'Preparing… 0%';
        tourPreloadAbort.signal.addEventListener('abort', () => {
            tourPlayBtn.textContent = '▶ Play tour';
        });

        try {
            // Collect unique tile stems (base path + both format candidates)
            // across the whole timeline via collectTileUrls.
            const stems = new Map();
            const step = 120;
            for (let t = 0; t <= TOTAL_MS && !tourPreloadAbort.signal.aborted; t += step) {
                const st = tourStateAt(t);
                const urls = viewer.collectTileUrls(st.x, st.y, viewer.zoomForPercent(st.zoomPct), 1);
                for (let i = 0; i < urls.length; i += 2) {
                    stems.set(urls[i], urls[i + 1]); // primary -> alternate
                }
            }

            const stemList = Array.from(stems);
            const total = stemList.length;

            // Decode a single tile URL into a reusable HTMLImageElement.
            // Resolves the loaded image (or null on failure).
            const decode = (url) => new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = url;
            });

            // Warm a tile: try the declared format, then the alternate.
            const warmTile = async (pair) => {
                const [primary, alternate] = pair;
                let img = await decode(primary);
                if (!img && alternate) img = await decode(alternate);
                if (img) viewer.installDecodedTile(img.src, img);
            };

            // Small concurrency pool: decodes in parallel while keeping the
            // local server responsive and memory bounded.
            let loaded = 0;
            const worker = async () => {
                while (!tourPreloadAbort.signal.aborted) {
                    const pair = stemList.pop();
                    if (!pair) break;
                    try {
                        await warmTile(pair);
                    } catch (_) { /* network hiccup — non-fatal */ }
                    loaded++;
                    if (total > 0 && (loaded % 25 === 0 || loaded === total)) {
                        tourPlayBtn.textContent = `Preparing… ${Math.round((loaded / total) * 100)}%`;
                    }
                }
            };
            await Promise.all(Array.from({ length: 12 }, worker));
        } catch (err) {
            console.error('[tour] preload failed:', err);
        } finally {
            const aborted = tourPreloadAbort ? tourPreloadAbort.signal.aborted : false;
            tourPreloadAbort = null;
            tourPreloading = false;
            if (aborted) {
                tourPlayBtn.classList.remove('playing');
                tourPlayBtn.textContent = '▶ Play tour';
                return;
            }
            startPlayback();
        }
    }

    tourPlayBtn.addEventListener('click', () => {
        if (tourPlaying) {
            stopVideoTour();
            return;
        }
        if (tourPreloading) return;
        preloadTour();
    });

    // Scrubbing interrupts playback/preload but keeps the seek position.
    tourSeek.addEventListener('mousedown', () => {
        stopVideoTour();
        if (tourPreloadAbort) tourPreloadAbort.abort();
    });

    // Interrupt the tour when the user grabs the map (drag, wheel, zoom).
    ['mousedown', 'wheel', 'touchstart'].forEach(evt => {
        container.addEventListener(evt, () => {
            stopVideoTour();
            if (tourPreloadAbort) tourPreloadAbort.abort();
        });
    });

    setTimeout(() => loadingEl.classList.add('hidden'), 3000);
});
