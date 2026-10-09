// js/camera.js
// 2D 正交相机：维护"观察中心 + 视野半高"，输出世界坐标 -> 裁剪坐标的 4x4 变换矩阵。
// 屏幕映射：clip.x = (x - cx) / (viewSize * aspect)，clip.y = (y - cy) / viewSize。
// 由于 x 方向多除了 aspect，水平与垂直方向的「每像素世界长度」相等，
// 因此缩放不会造成图形被拉伸变形。

class Camera {
  constructor() {
    this.center = [0, 0];
    this.viewSize = 1.2;   // 视野半高（世界单位）
    this.aspect = 1;       // 画布宽 / 高
    this.minSize = 0.01;   // 最小视野半高（限制最大放大倍率）
    this.maxSize = 20;
    this.required = { halfW: 1.15, halfH: 1.15 }; // 目标内容的世界半宽 / 半高
    this.userAdjusted = false; // 用户是否手动平移 / 缩放过
  }

  // 设置默认视角：记录需要完整框住的内容范围，再按当前宽高比自动取景
  setPreset({ center, halfW, halfH, min }) {
    this.center = [center[0], center[1]];
    this.required = { halfW, halfH };
    this.minSize = min;
    this.userAdjusted = false;
    this.fit();
  }

  // 按当前宽高比让内容完整落在视野内（窗口变形时自动调用，避免图形被裁切）
  fit() {
    const { halfW, halfH } = this.required;
    let v = Math.max(halfH, halfW / this.aspect);
    v = Math.max(this.minSize, Math.min(this.maxSize, v));
    this.viewSize = v;
  }

  // 世界坐标 -> 裁剪坐标：M = S * T（先平移到中心再归一化）
  matrix() {
    const sx = 1 / (this.viewSize * this.aspect);
    const sy = 1 / this.viewSize;
    let m = mat4();
    m = scale(m, sx, sy, 1);
    m = translate(m, -this.center[0], -this.center[1], 0);
    return m;
  }

  // 屏幕坐标（CSS 像素）与世界坐标的比例：W/H 像素对应 2*viewSize*aspect / 2*viewSize 世界单位
  worldPerPixel(H) {
    return (2 * this.viewSize) / H;
  }

  // 拖动平移：dx, dy 为本次移动的屏幕像素增量（y 轴向下）
  pan(dx, dy, W, H) {
    const wpp = this.worldPerPixel(H);
    this.center[0] -= dx * wpp;
    this.center[1] += dy * wpp;
    this.userAdjusted = true;
  }

  // 以光标 (px, py)（画布左上角为原点）为锚点缩放
  zoomAt(factor, px, py, W, H) {
    const ndcX = (px / W) * 2 - 1;
    const ndcY = 1 - (py / H) * 2;

    // 光标下当前对应的世界坐标
    const wx = this.center[0] + ndcX * this.viewSize * this.aspect;
    const wy = this.center[1] + ndcY * this.viewSize;

    let nv = this.viewSize * factor;
    nv = Math.max(this.minSize, Math.min(this.maxSize, nv));
    this.viewSize = nv;

    // 反解新中心，使该世界点仍位于光标处
    this.center[0] = wx - ndcX * nv * this.aspect;
    this.center[1] = wy - ndcY * nv;
    this.userAdjusted = true;
  }
}
