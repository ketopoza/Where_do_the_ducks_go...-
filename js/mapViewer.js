function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

class MapViewer {
    constructor(container, options = {}) {
        this.container = container;
        this.layers = options.layers || [];
        this.minZoom = 0.12;
        this.maxZoom = 5;

        this.zoom = 1;
        this.x = 0;
        this.y = 0;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.dragOffset = { x: 0, y: 0 };

        this.onZoomChange = options.onZoomChange || null;
        this.ready = false;
        this.loadedCount = 0;

        this.physicalW = options.physicalW || 238;
        this.physicalH = options.physicalH || 142;
        this.displayPhysicalW = options.displayPhysicalW || null;
        this.displayPhysicalH = options.displayPhysicalH || null;

        this.physicalZoom = 1;

        this.tileSize = options.tileSize || 256;
        this.tileMinLevel = options.tileMinLevel != null ? options.tileMinLevel : 0;
        this.tileBaseLevel = options.tileBaseLevel != null ? options.tileBaseLevel : 6;
        this.tileMaxLevel = options.tileMaxLevel != null ? options.tileMaxLevel : 6;
        this.tileUpdateDelay = options.tileUpdateDelay != null ? options.tileUpdateDelay : 120;
        this.tileMargin = options.tileMargin != null ? options.tileMargin : 1;
        this.tileLayers = [];
        this.tileState = [];
        this.tilesX = [];
        this.tilesY = [];
        this._tileUpdateTimer = null;
        this._tileLastUpdate = 0;

        this._zoomAnim = null;
        this._inertiaAnim = null;
        this._flyToAnim = null;
        this.dragSamples = [];

        // Cached viewport size. The container doesn't change size during map
        // motion, so we read getBoundingClientRect() once and reuse it on the
        // per-frame tour path instead of forcing a synchronous layout each rAF.
        this._viewW = 0;
        this._viewH = 0;

        // Cache of fully decoded tile images keyed by absolute URL, populated
        // by the tour preloader so renderTiles can reuse them with zero
        // network/decode cost during playback. FIFO eviction caps memory.
        this._decodedTiles = new Map();
        this._decodedTileCap = 8000;

        this._debouncedUpdateUrl = debounce(() => this._updateUrl(), 400);

        this.init();
    }

    init() {
        if (this.layers.length === 0) {
            console.error('No layers defined');
            return;
        }

        this.layerEls = [];
        this.proceduralLayers = [];
        this.naturalW = 1;
        this.naturalH = 1;
        let imgCount = 0;

        this.layers.forEach((layer, i) => {
            const left = layer.x || 0;
            const top = layer.y || 0;

            if (layer.tileSrc) {
                const el = document.createElement('div');
                el.className = 'map-layer map-layer-tiles';
                el.dataset.layer = layer.id || `layer${i}`;
                el.style.zIndex = i;
                el.style.position = 'absolute';
                el.style.left = left + 'px';
                el.style.top = top + 'px';
                if (layer.blend) el.style.mixBlendMode = layer.blend;
                if (layer.opacity != null) el.style.opacity = layer.opacity;
                if (layer.filter) el.style.filter = layer.filter;
                if (!layer.visible) el.style.display = 'none';
                this.tileLayers.push({ container: el, layer: layer });
                this.proceduralLayers.push(el);
                this.layerEls.push(el);
                this.loadedCount++;
                if (this.loadedCount === this.layers.length) this.finishInit();
                return;
            }

            if (!layer.src) {
                const el = document.createElement('div');
                el.className = 'map-layer map-layer-procedural';
                el.dataset.layer = layer.id || `layer${i}`;
                el.style.zIndex = i;
                el.style.position = 'absolute';
                el.style.left = left + 'px';
                el.style.top = top + 'px';
                el.style.width = '100%';
                el.style.height = '100%';
                if (layer.filterFilter) el.style.filter = layer.filterFilter;
                if (layer.gradient) el.style.background = layer.gradient;
                if (layer.blend) el.style.mixBlendMode = layer.blend;
                if (layer.opacity != null) el.style.opacity = layer.opacity;
                if (!layer.visible) el.style.display = 'none';
                this.proceduralLayers.push(el);
                this.layerEls.push(el);
                this.loadedCount++;
                if (this.loadedCount === this.layers.length) this.finishInit();
                return;
            }

            const img = new Image();
            img.className = 'map-layer';
            img.dataset.layer = layer.id || `layer${i}`;
            img.draggable = false;
            img.style.zIndex = i;
            img.style.position = 'absolute';
            img.style.left = left + 'px';
            img.style.top = top + 'px';
            if (layer.blend) img.style.mixBlendMode = layer.blend;
            if (layer.opacity != null) img.style.opacity = layer.opacity;
            if (layer.filter) img.style.filter = layer.filter;
            if (layer.imgW) img.style.width = layer.imgW + 'px';
            if (layer.imgH) img.style.height = layer.imgH + 'px';

            img.onload = () => {
                const w = layer.imgW || img.naturalWidth;
                const h = layer.imgH || img.naturalHeight;
                const right = left + w;
                const bottom = top + h;
                if (right > this.naturalW) this.naturalW = right;
                if (bottom > this.naturalH) this.naturalH = bottom;
                this.loadedCount++;
                if (this.loadedCount === this.layers.length) this.finishInit();
            };

            img.onerror = () => {
                this.loadedCount++;
                if (this.loadedCount === this.layers.length) this.finishInit();
            };

            img.src = layer.src;
            this.layerEls.push(img);
        });
    }

    finishInit() {
        this.proceduralLayers.forEach(el => {
            el.style.width = this.naturalW + 'px';
            el.style.height = this.naturalH + 'px';
        });
        this.layerEls.forEach(el => this.container.appendChild(el));
        this.setupEvents();
        this.waitForLayout();
    }

    waitForLayout(attempts = 0) {
        const rect = this.container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            this.fitToPhysicalScale();
            this.ready = true;
            if (this.onReady) this.onReady();
        } else if (attempts < 50) {
            setTimeout(() => this.waitForLayout(attempts + 1), 100);
        } else {
            this.fitToPhysicalScale();
            this.ready = true;
            if (this.onReady) this.onReady();
        }
    }

    setupEvents() {
        this.container.addEventListener('mousedown', (e) => this.onDragStart(e));
        window.addEventListener('mousemove', (e) => this.onDragMove(e));
        window.addEventListener('mouseup', (e) => this.onDragEnd(e));

        this.container.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        window.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        window.addEventListener('touchend', (e) => this.onTouchEnd(e));

        this.container.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        window.addEventListener('keydown', (e) => this.onKeydown(e));
        window.addEventListener('resize', () => this.onResize());
    }

    onDragStart(e) {
        if (e.button !== 0) return;
        this.stopInertia();
        this.cancelZoomAnim();
        this.cancelFlyTo();
        this.isDragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.dragOffset = { x: this.x, y: this.y };
        this.dragSamples = [{ t: Date.now(), x: e.clientX, y: e.clientY }];
        this.container.classList.add('dragging');
    }

    onDragMove(e) {
        if (!this.isDragging) return;
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.x = this.dragOffset.x + dx;
        this.y = this.dragOffset.y + dy;
        this.clampPosition();
        this.applyTransform();
        this.pushSample(e.clientX, e.clientY);
    }

    onDragEnd() {
        this.isDragging = false;
        this.container.classList.remove('dragging');
        const v = this.computeVelocity();
        this.dragSamples = [];
        if (Math.hypot(v.x, v.y) > 60) {
            this.startInertia(v.x, v.y);
        } else {
            this._debouncedUpdateUrl();
        }
    }

    onTouchStart(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            this.stopInertia();
            this.cancelZoomAnim();
            this.cancelFlyTo();
            const t = e.touches[0];
            this.isDragging = true;
            this.dragStart = { x: t.clientX, y: t.clientY };
            this.dragOffset = { x: this.x, y: this.y };
            this.dragSamples = [{ t: Date.now(), x: t.clientX, y: t.clientY }];
        } else if (e.touches.length === 2) {
            e.preventDefault();
            this.stopInertia();
            this.cancelZoomAnim();
            this.cancelFlyTo();
            this.isDragging = false;
            this.dragSamples = [];
            this.pinchDist = this.getPinchDist(e.touches);
            this.pinchZoom = this.zoom;
            this.pinchCenter = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2
            };
        }
    }

    onTouchMove(e) {
        if (e.touches.length === 1 && this.isDragging) {
            e.preventDefault();
            const t = e.touches[0];
            const dx = t.clientX - this.dragStart.x;
            const dy = t.clientY - this.dragStart.y;
            this.x = this.dragOffset.x + dx;
            this.y = this.dragOffset.y + dy;
            this.clampPosition();
            this.applyTransform();
            this.pushSample(t.clientX, t.clientY);
        } else if (e.touches.length === 2 && this.pinchDist) {
            e.preventDefault();
            const dist = this.getPinchDist(e.touches);
            const rect = this.container.getBoundingClientRect();
            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
            this.zoomAtPoint(cx, cy, this.pinchZoom * (dist / this.pinchDist));
        }
    }

    onTouchEnd() {
        const wasDrag = this.isDragging;
        this.isDragging = false;
        this.pinchDist = null;
        this.pinchZoom = null;
        if (wasDrag) {
            const v = this.computeVelocity();
            this.dragSamples = [];
            if (Math.hypot(v.x, v.y) > 60) {
                this.startInertia(v.x, v.y);
            } else {
                this._debouncedUpdateUrl();
            }
        }
    }

    getPinchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    onWheel(e) {
        e.preventDefault();
        const rect = this.container.getBoundingClientRect();
        const factor = Math.pow(2, -e.deltaY * 0.0015);
        this.zoomAtPoint(e.clientX - rect.left, e.clientY - rect.top, this.zoom * factor);
    }

    onKeydown(e) {
        if (e.key === '+' || e.key === '=') this.zoomIn();
        else if (e.key === '-' || e.key === '_') this.zoomOut();
    }

    zoomAtPoint(px, py, newZoom) {
        newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
        if (newZoom === this.zoom) return;
        this.cancelZoomAnim();
        this.cancelFlyTo();
        const ratio = newZoom / this.zoom;
        this.x = px - (px - this.x) * ratio;
        this.y = py - (py - this.y) * ratio;
        this.zoom = newZoom;
        this.clampPosition();
        this.applyTransform();
        this.notifyZoomChange();
        this._debouncedUpdateUrl();
    }

    zoomIn() {
        const rect = this.container.getBoundingClientRect();
        this.animateZoomTo(this.zoom * 1.5, rect.width / 2, rect.height / 2);
    }

    zoomOut() {
        const rect = this.container.getBoundingClientRect();
        this.animateZoomTo(this.zoom / 1.5, rect.width / 2, rect.height / 2);
    }

    fitToView() {
        this.stopInertia();
        this.cancelZoomAnim();
        this.cancelFlyTo();
        const rect = this.container.getBoundingClientRect();
        const vw = rect.width || window.innerWidth;
        const vh = rect.height || window.innerHeight;
        if (!vw || !vh || !this.naturalW) return;

        const scaleX = vw / this.naturalW;
        const scaleY = vh / this.naturalH;
        this.zoom = Math.min(scaleX, scaleY);
        this.x = (vw - this.naturalW * this.zoom) / 2;
        this.y = (vh - this.naturalH * this.zoom) / 2;
        this.applyTransform();
        this.notifyZoomChange();
        this._debouncedUpdateUrl();
    }

    // Lower zoom bound for tour moves: enough to fit BOTH map dimensions on
    // screen (minZoom only fits the height, cropping the sides).
    _tourZoomFloor() {
        const { w: vw, h: vh } = this.viewportSize();
        if (!this.naturalW || !this.naturalH) return this.minZoom;
        return Math.min(this.minZoom, vw / this.naturalW, vh / this.naturalH);
    }

    setView(mapX, mapY, zoom) {
        zoom = Math.max(this._tourZoomFloor(), Math.min(this.maxZoom, zoom));
        const { w: vw, h: vh } = this.viewportSize();
        this.zoom = zoom;
        this.x = -(mapX * zoom - vw / 2);
        this.y = -(mapY * zoom - vh / 2);
        this.clampPosition();
        this.applyTransform();
        this.notifyZoomChange();
    }

    getDisplayPhysicalSize() {
        const w = this.displayPhysicalW || (window.screen.width / 96) * 2.54;
        const h = this.displayPhysicalH || (window.screen.height / 96) * 2.54;
        return { w, h };
    }

    fitToPhysicalScale() {
        this.stopInertia();
        this.cancelZoomAnim();
        this.cancelFlyTo();
        const rect = this.container.getBoundingClientRect();
        const vw = rect.width || window.innerWidth;
        const vh = rect.height || window.innerHeight;
        if (!vw || !vh || !this.naturalW) return;

        const { w: displayWcm } = this.getDisplayPhysicalSize();
        const mapPxPerCm = this.naturalW / this.physicalW;
        const displayPxPerCm = window.screen.width / displayWcm;

        this.physicalZoom = displayPxPerCm / mapPxPerCm;
        this.maxZoom = this.physicalZoom;
        this.minZoom = vh / this.naturalH;

        const urlState = this._readUrlState();
        if (urlState) {
            this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, urlState.zoom));
            this.x = -(urlState.x * this.zoom - vw / 2);
            this.y = -(urlState.y * this.zoom - vh / 2);
        } else {
            this.zoom = this.physicalZoom;
            this.x = (vw - this.naturalW * this.zoom) / 2;
            this.y = (vh - this.naturalH * this.zoom) / 2;
        }

        this.clampPosition();
        this.applyTransform();
        this.notifyZoomChange();
    }

    flyTo(targetX, targetY, targetZoom, duration) {
        this.stopInertia();
        this.cancelZoomAnim();
        this.cancelFlyTo();

        const rect = this.container.getBoundingClientRect();
        const vw = rect.width || window.innerWidth;
        const vh = rect.height || window.innerHeight;

        if (targetZoom != null && targetZoom !== this.zoom) {
            this.zoom = Math.max(this._tourZoomFloor(), Math.min(this.maxZoom, targetZoom));
            this.notifyZoomChange();
        }
        const zoom = this.zoom;

        const startCx = (-this.x + vw / 2) / zoom;
        const startCy = (-this.y + vh / 2) / zoom;
        const dist = Math.hypot(targetX - startCx, targetY - startCy);
        if (dist < 0.5) return;

        if (!duration || duration <= 0) {
            duration = Math.max(700, Math.min(4500, 300 + dist * 0.35));
        }

        const t0 = performance.now();
        const step = (now) => {
            const elapsed = now - t0;
            const t = Math.min(1, elapsed / duration);
            const e = this.easeInOutCubic(t);

            const mx = startCx + (targetX - startCx) * e;
            const my = startCy + (targetY - startCy) * e;
            this.x = -(mx * zoom - vw / 2);
            this.y = -(my * zoom - vh / 2);
            this.clampPosition();
            this.applyTransform();
            this.notifyZoomChange();

            if (t < 1) {
                this._flyToAnim = requestAnimationFrame(step);
            } else {
                this._flyToAnim = null;
                this._debouncedUpdateUrl();
            }
        };
        this._flyToAnim = requestAnimationFrame(step);
    }

    cancelFlyTo() {
        if (this._flyToAnim) {
            cancelAnimationFrame(this._flyToAnim);
            this._flyToAnim = null;
        }
    }

    pushSample(x, y) {
        this.dragSamples.push({ t: Date.now(), x, y });
        if (this.dragSamples.length > 8) this.dragSamples.shift();
    }

    computeVelocity() {
        const s = this.dragSamples;
        if (!s || s.length < 2) return { x: 0, y: 0 };
        const now = Date.now();
        const cutoff = now - 120;
        let recent = s.filter(p => p.t >= cutoff);
        if (recent.length < 2) recent = s.slice(-2);
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = (last.t - first.t) / 1000;
        if (dt <= 0) return { x: 0, y: 0 };
        return {
            x: (last.x - first.x) / dt,
            y: (last.y - first.y) / dt
        };
    }

    startInertia(vx, vy) {
        this.stopInertia();
        const t0 = performance.now();
        let last = t0;
        const step = (now) => {
            let dt = (now - last) / 1000;
            last = now;
            if (dt > 0.05) dt = 0.05;
            this.x += vx * dt;
            this.y += vy * dt;
            const px = this.x;
            const py = this.y;
            this.clampPosition();
            if (this.x !== px) vx = 0;
            if (this.y !== py) vy = 0;
            const decay = Math.exp(-2 * dt);
            vx *= decay;
            vy *= decay;
            this.applyTransform();
            if (Math.hypot(vx, vy) < 8 || now - t0 > 3000) {
                this._inertiaAnim = null;
                this._debouncedUpdateUrl();
                return;
            }
            this._inertiaAnim = requestAnimationFrame(step);
        };
        this._inertiaAnim = requestAnimationFrame(step);
    }

    stopInertia() {
        if (this._inertiaAnim) {
            cancelAnimationFrame(this._inertiaAnim);
            this._inertiaAnim = null;
        }
    }

    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    animateZoomTo(targetZoom, focalX, focalY) {
        targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, targetZoom));
        if (Math.abs(targetZoom - this.zoom) < 1e-6) return;
        this.cancelZoomAnim();
        this.cancelFlyTo();
        const startZoom = this.zoom;
        const startX = this.x;
        const startY = this.y;
        const duration = 320;
        const t0 = performance.now();
        const step = (now) => {
            const t = Math.min(1, (now - t0) / duration);
            const e = this.easeOutCubic(t);
            const z = startZoom + (targetZoom - startZoom) * e;
            const ratio = z / startZoom;
            this.zoom = z;
            this.x = focalX - (focalX - startX) * ratio;
            this.y = focalY - (focalY - startY) * ratio;
            this.clampPosition();
            this.applyTransform();
            this.notifyZoomChange();
            if (t >= 1) {
                this._zoomAnim = null;
                this._debouncedUpdateUrl();
                return;
            }
            this._zoomAnim = requestAnimationFrame(step);
        };
        this._zoomAnim = requestAnimationFrame(step);
    }

    cancelZoomAnim() {
        if (this._zoomAnim) {
            cancelAnimationFrame(this._zoomAnim);
            this._zoomAnim = null;
        }
    }

    applyTransform() {
        const t = `translate(${this.x}px, ${this.y}px) scale(${this.zoom})`;
        this.layerEls.forEach(el => {
            el.style.transform = t;
            el.style.transformOrigin = '0 0';
        });
        this.scheduleTileUpdate();
    }

    scheduleTileUpdate() {
        if (this._tileUpdateTimer) clearTimeout(this._tileUpdateTimer);
        const elapsed = Date.now() - this._tileLastUpdate;
        if (elapsed >= this.tileUpdateDelay) {
            this._tileLastUpdate = Date.now();
            this.updateTiles();
        } else {
            this._tileUpdateTimer = setTimeout(() => {
                this._tileUpdateTimer = null;
                this._tileLastUpdate = Date.now();
                this.updateTiles();
            }, this.tileUpdateDelay - elapsed);
        }
    }

    getTileLevel(zoom) {
        const z = zoom || this.zoom;
        const level = Math.round(this.tileBaseLevel + Math.log2(z));
        return Math.max(this.tileMinLevel, Math.min(this.tileMaxLevel, level));
    }

    // Returns the tile URLs needed to cover the viewport when the camera is
    // centered at map coords (mapX, mapY) with the given zoom. Empty/missing
    // tiles are skipped. For each tile it returns a list of candidate URLs
    // (declared format first, alternate format second) so a prefetcher can
    // warm whichever format actually exists on disk.
    collectTileUrls(mapX, mapY, zoom, margin) {
        if (!this.tileLayers.length || !zoom || !this.naturalW || !this.naturalH) return [];
        const { w: vw, h: vh } = this.viewportSize();
        if (!vw || !vh) return [];

        const level = this.getTileLevel(zoom);
        const tilePx = this.tileSize * Math.pow(2, this.tileBaseLevel - level);
        const m = margin != null ? margin : this.tileMargin;

        const minX = mapX - vw / (2 * zoom);
        const minY = mapY - vh / (2 * zoom);
        const maxX = mapX + vw / (2 * zoom);
        const maxY = mapY + vh / (2 * zoom);

        if (!this.tilesX.length) this._initTileCounts();
        const tx1max = Math.max(0, this.tilesX[level] - 1);
        const ty1max = Math.max(0, this.tilesY[level] - 1);

        const tx0 = Math.max(0, Math.floor(minX / tilePx) - m);
        const ty0 = Math.max(0, Math.floor(minY / tilePx) - m);
        const tx1 = Math.min(tx1max, Math.ceil(maxX / tilePx) + m);
        const ty1 = Math.min(ty1max, Math.ceil(maxY / tilePx) + m);

        const urls = [];
        for (const tl of this.tileLayers) {
            if (tl.container.style.display === 'none') continue;
            const base = tl.layer.tileSrc.replace(/\/+$/, '');
            const primary = tl.layer.tileFormat || 'jpg';
            const alternate = primary === 'png' ? 'jpg' : 'png';
            for (let ty = ty0; ty <= ty1; ty++) {
                for (let tx = tx0; tx <= tx1; tx++) {
                    const stem = `${base}/${level}/${tx}_${ty}`;
                    urls.push(stem + '.' + primary);
                    urls.push(stem + '.' + alternate);
                }
            }
        }
        return urls;
    }

    // Store a fully-loaded (decoded) tile image so future renders can reuse
    // it instantly. Evicts oldest entries once the cache exceeds the cap.
    installDecodedTile(url, img) {
        const key = this._tileCacheKey(url);
        if (this._decodedTiles.has(key)) return;
        this._decodedTiles.set(key, img);
        if (this._decodedTiles.size > this._decodedTileCap) {
            const oldestKey = this._decodedTiles.keys().next().value;
            this._decodedTiles.delete(oldestKey);
        }
    }

    // Normalizes tile URLs to a stable cache key (same origin + path) so keys
    // always match regardless of whether they were written as absolute or
    // relative URLs.
    _tileCacheKey(url) {
        try {
            const u = new URL(url, this.container.baseURI || location.href);
            return u.origin + u.pathname;
        } catch (_) {
            return String(url);
        }
    }

    getDecodedTile(url) {
        return this._decodedTiles.get(this._tileCacheKey(url)) || null;
    }

    _initTileCounts() {
        for (let z = 0; z <= this.tileMaxLevel; z++) {
            const s = Math.pow(2, z - this.tileBaseLevel);
            const mapW = Math.max(1, Math.round(this.naturalW * s));
            const mapH = Math.max(1, Math.round(this.naturalH * s));
            this.tilesX[z] = Math.ceil(mapW / this.tileSize);
            this.tilesY[z] = Math.ceil(mapH / this.tileSize);
        }
    }

    updateTiles() {
        if (!this.tileLayers.length) return;
        const { w: vw, h: vh } = this.viewportSize();
        if (!vw || !vh || !this.zoom || !this.naturalW) return;

        if (!this.tilesX.length) this._initTileCounts();

        const level = this.getTileLevel();
        const tilePx = this.tileSize * Math.pow(2, this.tileBaseLevel - level);
        const margin = this.tileMargin;

        const minX = -this.x / this.zoom;
        const minY = -this.y / this.zoom;
        const maxX = minX + vw / this.zoom;
        const maxY = minY + vh / this.zoom;

        const tx0 = Math.max(0, Math.floor(minX / tilePx) - margin);
        const ty0 = Math.max(0, Math.floor(minY / tilePx) - margin);
        const tx1 = Math.min(this.tilesX[level] - 1, Math.ceil(maxX / tilePx) + margin);
        const ty1 = Math.min(this.tilesY[level] - 1, Math.ceil(maxY / tilePx) + margin);

        this.tileLayers.forEach((tl, i) => {
            if (tl.container.style.display === 'none') return;
            const st = this.tileState[i] || (this.tileState[i] = {});
            if (st.level === level && st.tx0 === tx0 && st.ty0 === ty0 &&
                st.tx1 === tx1 && st.ty1 === ty1) {
                return;
            }
            st.level = level;
            st.tx0 = tx0; st.ty0 = ty0; st.tx1 = tx1; st.ty1 = ty1;
            this.renderTiles(tl, level, tilePx, tx0, ty0, tx1, ty1);
        });
    }

    renderTiles(tl, level, tilePx, tx0, ty0, tx1, ty1) {
        const container = tl.container;
        const base = tl.layer.tileSrc.replace(/\/+$/, '');
        const prev = tl.tiles || new Map();
        const tileFormats = tl.tileFormats || (tl.tileFormats = new Map());
        const next = new Map();
        const levelChanged = tl.level != null && tl.level !== level;

        for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                const k = `${level}/${tx}_${ty}`;
                const old = prev.get(k);
                if (old) {
                    next.set(k, old);
                    continue;
                }
                const fmt = tileFormats.get(k) || tl.layer.tileFormat || 'jpg';
                const altFmt = fmt === 'png' ? 'jpg' : 'png';
                let img = this.getDecodedTile(`${base}/${level}/${tx}_${ty}.${fmt}`)
                        || this.getDecodedTile(`${base}/${level}/${tx}_${ty}.${altFmt}`);
                if (img) {
                    // Preloaded + decoded tile: reuse as-is for instant paint.
                    // Keep it in the cache too, so later revisits of the same
                    // spot (tour hops back and forth) are instant as well.
                    img.className = 'map-tile';
                    img.draggable = false;
                    img.dataset.format = img.src.split('.').pop();
                    img.style.opacity = '1';
                } else {
                    img = document.createElement('img');
                    img.className = 'map-tile';
                    img.draggable = false;
                    img.style.opacity = '0';
                    img.addEventListener('load', () => {
                        tileFormats.set(k, img.dataset.format);
                        img.style.opacity = '1';
                    });
                    img.dataset.format = fmt;
                    img.src = `${base}/${level}/${tx}_${ty}.${fmt}`;
                    img.onerror = () => {
                        if (img.dataset.retried) return;
                        img.dataset.retried = 'true';
                        img.dataset.format = img.dataset.format === 'png' ? 'jpg' : 'png';
                        img.src = `${base}/${level}/${tx}_${ty}.${img.dataset.format}`;
                    };
                }
                img.style.position = 'absolute';
                img.style.left = (tx * tilePx) + 'px';
                img.style.top = (ty * tilePx) + 'px';
                img.style.width = tilePx + 'px';
                img.style.height = tilePx + 'px';
                container.appendChild(img);
                next.set(k, img);
            }
        }

        const staleEls = [];
        for (const [k, img] of prev) {
            if (next.has(k)) continue;
            if (levelChanged) {
                img.dataset.stale = '1';
                staleEls.push(img);
            } else {
                img.remove();
            }
        }

        if (staleEls.length) {
            clearTimeout(tl._staleTimer);
            tl._staleTimer = setTimeout(() => {
                staleEls.forEach(img => img.remove());
            }, this.tileUpdateDelay + 500);
        }

        tl.level = level;
        tl.tiles = next;
    }

    // Cached viewport dimensions (container size never changes during tour
    // playback, so avoid forcing a synchronous layout read on every rAF).
    viewportSize() {
        if (!this._viewW || !this._viewH) {
            const rect = this.container.getBoundingClientRect();
            this._viewW = rect.width || window.innerWidth;
            this._viewH = rect.height || window.innerHeight;
        }
        return { w: this._viewW, h: this._viewH };
    }

    clampPosition() {
        const vw = this.viewportSize().w;
        const vh = this.viewportSize().h;
        const sw = this.naturalW * this.zoom;
        const sh = this.naturalH * this.zoom;
        const m = 20;

        if (sh < vh + 1) {
            this.y = (vh - sh) / 2;
        } else {
            this.y = Math.min(m, Math.max(vh - sh - m, this.y));
        }
        if (sw < vw + 1) {
            this.x = (vw - sw) / 2;
        } else {
            this.x = Math.min(m, Math.max(vw - sw - m, this.x));
        }
    }

    toggleLayer(layerId, visible) {
        this.layerEls.forEach(el => {
            if (el.dataset.layer === layerId) {
                el.style.display = visible ? '' : 'none';
            }
        });
        if (visible) this.scheduleTileUpdate();
    }

    getZoomPercent() {
        const range = this.maxZoom - this.minZoom;
        if (range <= 0) return 0;
        return Math.round(((this.zoom - this.minZoom) / range) * 100);
    }

    zoomForPercent(percent) {
        return this.minZoom + (percent / 100) * (this.maxZoom - this.minZoom);
    }

    onResize() {
        this.stopInertia();
        this.cancelZoomAnim();
        this.cancelFlyTo();
        this._viewW = 0;
        this._viewH = 0;
        const { w: vw, h: vh } = this.viewportSize();
        if (this.naturalH) this.minZoom = vh / this.naturalH;
        if (this.physicalZoom) this.maxZoom = this.physicalZoom;
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
        this.clampPosition();
        this.applyTransform();
        this.notifyZoomChange();
    }

    notifyZoomChange() {
        if (this.onZoomChange) {
            this.onZoomChange(this.getZoomPercent());
        }
    }

    _readUrlState() {
        const params = new URLSearchParams(window.location.search);
        const pos = params.get('pos');
        if (pos) {
            const parts = pos.split(',').map(Number);
            if (parts.length === 3 && parts.every(n => !isNaN(n))) {
                return { x: parts[0], y: parts[1], zoom: parts[2] };
            }
        }
        return null;
    }

    _updateUrl() {
        if (!this.ready || window.location.protocol === 'file:') return;
        const rect = this.container.getBoundingClientRect();
        const vw = rect.width || window.innerWidth;
        const vh = rect.height || window.innerHeight;
        const cx = (-this.x + vw / 2) / this.zoom;
        const cy = (-this.y + vh / 2) / this.zoom;
        const params = new URLSearchParams(window.location.search);
        params.set('pos', `${cx.toFixed(2)},${cy.toFixed(2)},${this.zoom.toFixed(4)}`);
        window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
    }

    destroy() {
        this.stopInertia();
        this.cancelZoomAnim();
        this.cancelFlyTo();
        if (this._tileUpdateTimer) clearTimeout(this._tileUpdateTimer);
        this.tileLayers.forEach(tl => {
            if (tl._staleTimer) clearTimeout(tl._staleTimer);
        });
        this.layerEls.forEach(el => el.remove());
    }
}
