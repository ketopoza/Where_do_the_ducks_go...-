class Minimap {
    constructor(viewer) {
        this.viewer = viewer;
        this.container = document.getElementById('minimap');
        this.canvas = document.getElementById('minimap-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.viewportEl = document.getElementById('minimap-viewport');
        this.padding = 4;

        this.setupCanvas();
        this.setupEvents();
        this.render();
    }

    setupCanvas() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
    }

    setupEvents() {
        this.container.addEventListener('click', (e) => {
            const rect = this.container.getBoundingClientRect();
            const cx = e.clientX - rect.left;
            const cy = e.clientY - rect.top;
            const mapW = this.viewer.naturalW;
            const mapH = this.viewer.naturalH;
            const mapX = (cx / this.width) * mapW;
            const mapY = (cy / this.height) * mapH;
            const vRect = this.viewer.container.getBoundingClientRect();
            this.viewer.x = -(mapX * this.viewer.zoom - vRect.width / 2);
            this.viewer.y = -(mapY * this.viewer.zoom - vRect.height / 2);
            this.viewer.clampPosition();
            this.viewer.applyTransform();
            this.updateViewport();
        });

        const loop = () => {
            this.updateViewport();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    render() {
        const w = this.viewer.naturalW;
        const h = this.viewer.naturalH;
        if (!w || !h) { setTimeout(() => this.render(), 100); return; }

        if (!this.thumb) {
            this.thumb = new Image();
            this.thumb.src = 'assets/thumb.jpg';
            this.thumb.onload = () => this.render();
        }

        const mapAspect = w / h;
        const canAspect = this.width / this.height;
        let dw, dh, dx, dy;

        if (mapAspect > canAspect) {
            dw = this.width - this.padding * 2;
            dh = dw / mapAspect;
        } else {
            dh = this.height - this.padding * 2;
            dw = dh * mapAspect;
        }
        dx = (this.width - dw) / 2;
        dy = (this.height - dh) / 2;

        this.ctx.clearRect(0, 0, this.width, this.height);
        if (this.thumb && this.thumb.complete && this.thumb.naturalWidth) {
            this.ctx.drawImage(this.thumb, dx, dy, dw, dh);
        } else {
            this.ctx.fillStyle = '#e0e0e0';
            this.ctx.fillRect(dx, dy, dw, dh);
        }
        this.ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(dx, dy, dw, dh);

        this.mapDrawRect = { x: dx, y: dy, w: dw, h: dh };
        this.updateViewport();
    }

    updateViewport() {
        if (!this.mapDrawRect || !this.viewer.naturalW) {
            this.render();
            return;
        }
        const r = this.mapDrawRect;
        const w = this.viewer.naturalW;
        const h = this.viewer.naturalH;
        const vs = this.viewer.viewportSize();
        const info = {
            x: -this.viewer.x / this.viewer.zoom,
            y: -this.viewer.y / this.viewer.zoom,
            width: vs.w / this.viewer.zoom,
            height: vs.h / this.viewer.zoom
        };

        const sx = r.w / w;
        const sy = r.h / h;
        this.viewportEl.style.left = `${r.x + info.x * sx}px`;
        this.viewportEl.style.top = `${r.y + info.y * sy}px`;
        this.viewportEl.style.width = `${info.width * sx}px`;
        this.viewportEl.style.height = `${info.height * sy}px`;
    }
}
