// ============================================================
// camera.js —— 轨道相机 + 关键帧漫游 + 虚拟轨迹球（对应教材 Ch4–5）
//
// 三类控制，可随时互相接管：
//   · tour         ：预设关键帧（球坐标 θ/φ/d）周期 Catmull-Rom 插值，绕场景一周
//   · manual       ：鼠标拖拽旋转、滚轮缩放，拖拽即接管
//   · eclipseView  ：日食 / 月食专用机位（选做 E2），随地球/月球实时位置联动
// 轨迹球模式（选做 E3）：手动模式下用四元数拖拽旋转，V 键开关。
// 空格键在漫游中暂停/继续；在手动模式下按空格/ T 回到漫游。
// ============================================================

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function vecAdd(a, b)  { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function vecSub(a, b)  { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function vecScale(a, s){ return [a[0]*s, a[1]*s, a[2]*s]; }
function vecLen(a)     { return Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]); }

class OrbitCamera {
    constructor(canvas) {
        this.target = [0, 0, 0];
        this.theta = 0;        // 方位角（度）
        this.phi = 20;         // 仰角（度）
        this.dist = 260;       // 距目标点距离

        this.mode = 'tour';    // 'tour' | 'manual'
        this.paused = false;   // 漫游暂停标志（空格）
        this.tourTime = 0;

        this.eclipseView = null;   // null | 'solar' | 'lunar'（E2 专用机位）
        this.eclipseZoom = 1;      // 日食/月食视角下的滚轮缩放系数
        this._eclipseEye = [0, 0, 0];
        this._eclipseTarget = [0, 0, 0];

        this.tbQuat = [0, 0, 0, 1];   // 轨迹球累计旋转（单位四元数，E3）

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

    // ---- 关键帧插值 / 日食机位更新 ----
    update(dt, scene) {
        if (this.eclipseView) {
            if (scene) this._updateEclipsePose(scene);
            return;
        }
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
        this.dist  = clamp(catmullRom(p0.dist,  p1.dist,  p2.dist,  p3.dist,   s), 30, 900);
    }

    // ---- E2：日食/月食专用机位（每帧随天体实时位置重算）----
    _updateEclipsePose(scene) {
        const earth = scene.earthPos, moon = scene.moonPos, z = this.eclipseZoom;

        if (this.eclipseView === 'solar') {
            // 日食：机位悬在地球夜面上空（贴近地表）望向太阳——重现"站在地球上看日食"。
            // 月球运行到日地之间（朔）时凌日，由深度测试自然遮挡成"环食"：
            // 场景尺度下月球角直径小于太阳（0.55/5.5 vs 8/36），故只能环食不能全食。
            // 注意用 norm3（非变异），MV.js 的 normalize 会原地改写 earthPos
            const antiSun = norm3(earth);
            this._eclipseEye = vecAdd(earth,
                vecAdd(vecScale(antiSun, (EARTH.radius + 0.6) * z), [0, 0.9 * z, 0]));
            this._eclipseTarget = [0, 0, 0];          // 注视太阳（世界原点）
        } else {
            // 月食：贴近月球、朝背日方向望——前景月球，远处地球夜面与本影锥
            const moonDir = norm3(vecSub(moon, earth));
            const perp = norm3(cross(moonDir, [0, 1, 0]));
            this._eclipseEye = vecAdd(moon, vecAdd(
                vecAdd(vecScale(moonDir, 3.4 * z), vecScale(perp, 1.7 * z)),
                [0, 1.2 * z, 0]));
            this._eclipseTarget = moon;
        }
        // 同步 dist 供正交投影定标（半高 = dist·tan(fov/2)）
        this.dist = clamp(vecLen(vecSub(this._eclipseEye, this._eclipseTarget)), 4, 900);
    }

    // ---- 球坐标 → 视点位置 ----
    eye() {
        if (this.eclipseView) return this._eclipseEye;
        const t = radians(this.theta), p = radians(this.phi);
        return [
            this.target[0] + this.dist * Math.cos(p) * Math.sin(t),
            this.target[1] + this.dist * Math.sin(p),
            this.target[2] + this.dist * Math.cos(p) * Math.cos(t),
        ];
    }

    viewMatrix() {
        const target = this.eclipseView ? this._eclipseTarget : this.target;
        const V = lookAt(this.eye(), target, [0, 1, 0]);
        // E3 轨迹球：相机坐标系下的累计旋转乘在视图矩阵左侧（Shoemake 约定）
        if (params && params.trackball && this.mode === 'manual' && !this.eclipseView) {
            return mult(quatToMat4(this.tbQuat), V);
        }
        return V;
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
    takeOver() {                 // 鼠标接管（拖拽即退出日食/月食机位）
        if (this.eclipseView) this.eclipseView = null;
        if (this.mode !== 'manual') {
            this.mode = 'manual';
            onCameraModeChanged();
        }
    }
    enterTour() {
        if (this.mode !== 'tour' || this.eclipseView) {
            this.eclipseView = null;
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
        this.eclipseView = null;
        this.tbQuat = [0, 0, 0, 1];
        this.theta = 0; this.phi = 20; this.dist = 260;
        onCameraModeChanged();
    }
    // E2：进入/退出日食（'solar'）/月食（'lunar'）/自由（null）视角
    setEclipseView(mode) {
        this.eclipseView = mode;
        this.paused = false;
        this.tbQuat = [0, 0, 0, 1];
        onCameraModeChanged();
    }
    // E3：轨迹球开关（切入手动模式并复位累计四元数）
    setTrackball(on) {
        params.trackball = on;
        this.tbQuat = [0, 0, 0, 1];
        if (on) this.takeOver();
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
            if (params && params.trackball && !camera.eclipseView) {
                // E3 轨迹球：屏幕位移 → 虚拟球面上的弧 → 四元数增量（相机系，左乘累计）
                const p1 = screenToSphere(lastX, lastY, canvas.clientWidth, canvas.clientHeight);
                const p2 = screenToSphere(e.clientX, e.clientY, canvas.clientWidth, canvas.clientHeight);
                camera.tbQuat = quatMul(quatFromTo(p1, p2), camera.tbQuat);
            } else {
                camera.theta += (e.clientX - lastX) * 0.3;
                camera.phi   += (e.clientY - lastY) * 0.25;
                camera.phi = clamp(camera.phi, 2, 88);
            }
            lastX = e.clientX; lastY = e.clientY;
        });
        window.addEventListener('mouseup', function () { dragging = false; });

        canvas.addEventListener('wheel', function (e) {
            e.preventDefault();
            if (camera.eclipseView) {
                // 日食/月食机位下滚轮只调远近系数，不退出专用视角
                camera.eclipseZoom = clamp(camera.eclipseZoom * Math.exp(e.deltaY * 0.0012), 0.35, 3);
            } else {
                camera.dist = clamp(camera.dist * Math.exp(e.deltaY * 0.0012), 12, 900);
                camera.takeOver();
            }
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

// ============================================================
// 虚拟轨迹球（选做 E3）—— Shoemake 1985 思想 + 四元数累积
// 屏幕点先映射到单位虚拟球面（出球部分落在双曲面上，边缘拖拽依旧平滑），
// 两次拖拽点的球面弧对应一次绕轴旋转，用四元数表示并左乘累积。
// 相比欧拉角（theta/phi）不存在万向节死锁，任意方向拖拽手感一致。
// ============================================================

// 屏幕坐标（像素）→ 单位虚拟球面点 [x,y,z]
function screenToSphere(x, y, w, h) {
    const nx = (x / w) * 2 - 1;
    const ny = 1 - (y / h) * 2;
    const d = nx * nx + ny * ny;
    const z = (d <= 1) ? Math.sqrt(1 - d)   // 投影在球面内：直接取球面
                       : 1 / Math.sqrt(d);  // 球外：双曲面 z = 1/r
    const len = Math.sqrt(nx * nx + ny * ny + z * z);
    return [nx / len, ny / len, z / len];
}

// 旋转 a→b 的四元数 [x, y, z, w]
function quatFromTo(a, b) {
    const d = clamp(dot(a, b), -1, 1);
    if (d > 0.99999) return [0, 0, 0, 1];        // 几乎同向：单位四元数
    let axis = cross(a, b);
    let len = Math.sqrt(dot(axis, axis));
    if (len < 1e-6) {                            // 反向（180°）：任取一垂直轴
        axis = (Math.abs(a[0]) < 0.9) ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]);
        len = Math.sqrt(dot(axis, axis));
    }
    const s = Math.sqrt((1 - d) / 2);            // sin(θ/2)
    return [axis[0] / len * s, axis[1] / len * s, axis[2] / len * s,
            Math.sqrt((1 + d) / 2)];             // cos(θ/2)
}

// Hamilton 四元数积 a ⊗ b，[x, y, z, w]
function quatMul(a, b) {
    return [
        a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1],
        a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
        a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3],
        a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2],
    ];
}

// 四元数 → 4×4 旋转矩阵（列向量约定；行主嵌套数组，flatten() 上传时转置）
function quatToMat4(q) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, yy = y * y2, zz = z * z2;
    const xy = x * y2, xz = x * z2, yz = y * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    return [
        [1 - (yy + zz),   xy - wz,        xz + wy,         0],
        [xy + wz,         1 - (xx + zz),  yz - wx,         0],
        [xz - wy,         yz + wx,        1 - (xx + yy),   0],
        [0,               0,              0,               1],
    ];
}

// 模式变化回调（由 ui.js 覆写，刷新 HUD 文本）
let onCameraModeChanged = function () {};
