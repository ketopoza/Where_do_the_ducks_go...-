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
        { id: 'base', name: 'Base SVG', tileSrc: 'tiles/base', visible: true, imgW: 9370, imgH: 5590, locked: true },
        { id: 'grid', name: 'Grid', tileSrc: 'tiles/grid', visible: true, imgW: 9370, imgH: 5590, locked: true },
        { id: 'margins', name: 'Margins', src: 'assets/margins.svg', visible: true, imgW: 9370, imgH: 5590, locked: true },
        { id: 'noise', name: 'Noise (multiply)', src: null, visible: true, blend: 'multiply', filterFilter: 'url(#noise-filter)', opacity: 0.15, locked: true },
        { id: 'text', name: 'Text', src: 'assets/text.svg', visible: true, imgW: 9370, imgH: 5590 },
        { id: 'pics', name: 'Photos', tileSrc: 'tiles/pics', visible: true, imgW: 9370, imgH: 5590 },
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

    document.getElementById('toggle-layers').addEventListener('click', () => {
        document.getElementById('layer-panel').classList.toggle('hidden');
    });

    document.getElementById('zoom-in').addEventListener('click', () => viewer.zoomIn());
    document.getElementById('zoom-out').addEventListener('click', () => viewer.zoomOut());
    document.getElementById('fit-view').addEventListener('click', () => {
        viewer.fitToView();
        zoomLevelEl.textContent = `${viewer.getZoomPercent()}%`;
    });

    // ---- Virtual tour ----
    // Stops are map coordinates (bird units, 0..9370 x 0..5590) of the view CENTER.
    // Live readout (bottom-left) shows the map coords under the cursor and the
    // current center. Press C to copy the center as { x, y } (zoom = 30%).
    const TOUR_ZOOM_PCT = 30;

    const tourStops = {
        '0':        { x: 1204.55, y: 2254.28 }, // TODO: replace with captured coords
        '1-2':      { x: 1204.55, y: 4336.40 },
        '3-4':      { x: 3900.57, y: 749.14 },
        '4-2':      { x: 5362.44, y: 4666.75 },
        '5':        { x: 8165.45, y: 749.14 },
        'farewell': { x: 8165.45, y: 4840.86 },
    };

    document.querySelectorAll('.tour-stop').forEach(btn => {
        btn.addEventListener('click', () => {
            const stop = tourStops[btn.dataset.stop];
            if (!stop) return;
            viewer.flyTo(stop.x, stop.y, viewer.zoomForPercent(TOUR_ZOOM_PCT));
        });
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
            `zoom: ${viewer.getZoomPercent()}%   [C] copiar (30%)   [D] ocultar`;
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
            console.log(`[tour] captura para zoom 30% -> ${snippet}`);
            try {
                navigator.clipboard.writeText(snippet);
                console.log('[tour] copiado al portapapeles');
            } catch (err) {
                console.log('[tour] portapapeles no disponible, copia manualmente');
            }
        }
    });

    setTimeout(() => loadingEl.classList.add('hidden'), 3000);
});
