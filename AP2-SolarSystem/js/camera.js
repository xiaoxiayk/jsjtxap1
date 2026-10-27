// ============================================================
// camera.js —— 轨道相机 + 关键帧漫游（对应教材 Ch5 观察部分）
//
// 两种模式，可随时互相接管：
//   · tour   ：预设关键帧（球坐标 θ/φ/d）周期 Catmull-Rom 插值，绕场景一周
//   · manual ：鼠标拖拽旋转、滚轮缩放，拖拽即接管
// 空格键在漫游中暂停/继续；在手动模式下按空格/ T 回到漫游。
// ============================================================

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

class OrbitCamera {
    constructor(canvas) {
        this.target = [0, 0, 0];
        this.theta = 0;        // 方位角（度）
        this.phi = 20;         // 仰角（度）
        this.dist = 260;       // 距目标点距离

        this.mode = 'tour';    // 'tour' | 'manual'
        this.paused = false;   // 漫游暂停标志（空格）
        this.tourTime = 0;

        this.fov = 45;         // 透视垂直视场角（度）
        this.near = 0.5;
        this.far = 4000;

        // 漫游关键帧：绕场景一周，末段自动接回首帧实现无缝循环
        this.keyframes = [
            { theta: 0,   phi: 20, dist: 260 },
            { theta: 60,  phi: 55, dist: 135 },
            { theta: 125, phi: 12, dist: 275 },
            { theta: 195, phi: 62, dist: 165 },
            { theta: 262, phi: 22, dist: 330 },
            { theta: 322, phi: 42, dist: 185 },
        ];
        this.segmentDuration = 6;   // 每段 6 秒

        this._bindInput(canvas);
    }

    // ---- 关键帧插值 ----
    update(dt) {
        if (this.mode !== 'tour' || this.paused) return;

        this.tourTime += dt;
        const n = this.keyframes.length;
        const total = n * this.segmentDuration;
        const t = this.tourTime % total;
        const seg = Math.floor(t / this.segmentDuration);
        const s = (t - seg * this.segmentDuration) / this.segmentDuration;

        // 周期 Catmull-Rom：取前后各两个关键帧
        const p0 = this.keyframes[(seg + n - 1) % n];
        const p1 = this.keyframes[seg % n];
        const p2 = this.keyframes[(seg + 1) % n];
        const p3 = this.keyframes[(seg + 2) % n];

        this.theta = catmullRom(p0.theta, p1.theta, p2.theta, p3.theta, s);
        this.phi   = clamp(catmullRom(p0.phi,   p1.phi,   p2.phi,   p3.phi,   s), 3, 85);
        this.dist  = clamp(catmullRom(p0.dist,  p1.dist,  p2.dist,  p3.dist,  s), 30, 900);
    }

    // ---- 球坐标 → 视点位置 ----
    eye() {
        const t = radians(this.theta), p = radians(this.phi);
        return [
            this.target[0] + this.dist * Math.cos(p) * Math.sin(t),
            this.target[1] + this.dist * Math.sin(p),
            this.target[2] + this.dist * Math.cos(p) * Math.cos(t),
        ];
    }

    viewMatrix() {
        return lookAt(this.eye(), this.target, [0, 1, 0]);
    }

    // ---- 双投影 ----
    // 正交投影的半高取 dist·tan(fov/2)，使切换瞬间画面尺度与透视一致，
    // 差异体现在近大远小/平行线是否汇聚上（便于对比截图）。
    projectionMatrix(aspect, projection) {
        if (projection === 'ortho') {
            const halfH = this.dist * Math.tan(radians(this.fov) / 2);
            const halfW = halfH * aspect;
            return ortho(-halfW, halfW, -halfH, halfH, 0.1, this.dist * 2 + 2000);
        }
        return perspective(this.fov, aspect, this.near, this.far);
    }

    // ---- 模式切换 ----
    takeOver() {                 // 鼠标接管
        if (this.mode !== 'manual') {
            this.mode = 'manual';
            onCameraModeChanged();
        }
    }
    enterTour() {
        if (this.mode !== 'tour') {
            this.mode = 'tour';
            onCameraModeChanged();
        }
    }
    togglePause() {
        this.paused = !this.paused;
        onCameraModeChanged();
    }
    reset() {
        this.mode = 'manual';
        this.theta = 0; this.phi = 20; this.dist = 260;
        onCameraModeChanged();
    }

    // ---- 鼠标 / 滚轮输入（自行监听 mousedown/mousemove/wheel）----
    _bindInput(canvas) {
        let dragging = false, lastX = 0, lastY = 0;

        canvas.addEventListener('mousedown', function (e) {
            if (e.button === 0) {
                dragging = true;
                lastX = e.clientX; lastY = e.clientY;
                camera.takeOver();
            }
        });
        window.addEventListener('mousemove', function (e) {
            if (!dragging) return;
            camera.theta += (e.clientX - lastX) * 0.3;
            camera.phi   += (e.clientY - lastY) * 0.25;
            camera.phi = clamp(camera.phi, 2, 88);
            lastX = e.clientX; lastY = e.clientY;
        });
        window.addEventListener('mouseup', function () { dragging = false; });

        canvas.addEventListener('wheel', function (e) {
            e.preventDefault();
            camera.dist = clamp(camera.dist * Math.exp(e.deltaY * 0.0012), 12, 900);
            camera.takeOver();
        }, { passive: false });
    }
}

// 周期 Catmull-Rom 样条插值（关键帧之间平滑过渡）
function catmullRom(p0, p1, p2, p3, s) {
    const s2 = s * s, s3 = s2 * s;
    return 0.5 * ((2 * p1) +
                  (-p0 + p2) * s +
                  (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 +
                  (-p0 + 3 * p1 - 3 * p2 + p3) * s3);
}

// 模式变化回调（由 ui.js 覆写，刷新 HUD 文本）
let onCameraModeChanged = function () {};
