// js/main.js
// 应用入口：装配相机 / 渲染器 / 面板 / 交互，并驱动渲染循环。
// 状态（state）是唯一数据源，所有 setter 都是「更新状态 -> 必要时重建几何 -> 回显 UI」。

// 不同分形类型的默认视角（halfW/halfH 为需要完整显示的世界半宽 / 半高）
const VIEW_PRESETS = {
  sierpinski: { center: [0, 0], halfW: 1.15, halfH: 1.15, min: 0.005 },
  mandelbrot: { center: [-0.6, 0], halfW: 1.45, halfH: 1.25, min: 1e-4 },
  julia: { center: [0, 0], halfW: 1.55, halfH: 1.55, min: 1e-4 },
};

const PRIMITIVE_LABEL = { points: '点云 gl.POINTS', lines: '线框 gl.LINES', triangles: '实体 gl.TRIANGLES' };

class App {
  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    this.camera = new Camera();
    this.renderer = new Renderer(gl);

    this.state = {
      fractalType: 'sierpinski', // sierpinski | mandelbrot | julia
      generator: 'chaos',        // chaos | subdivision
      mode: 'points',            // points | lines | triangles
      ngon: 3,                   // 混沌游戏多边形边数（扩展 E1）
      count: 20000,              // 混沌游戏点数
      depth: 4,                  // 递归细分深度
      pointSize: 3,
      palette: 0,
      maxIter: 200,
      juliaC: [-0.8, 0.156],
      animating: false,
      animSpeed: 0.4,            // 生长进度/秒
    };

    this.progress = 1; // 生长进度 0..1，1 表示完整显示

    this._applyUrlParams();

    this.ui = new UI(this);
    attachInteraction(this);

    this.camera.setPreset(VIEW_PRESETS[this.state.fractalType]);
    this.renderer.setPalette(this.state.palette);
    this.rebuildGeometry();
    this.ui.sync();

    this._resize();
    window.addEventListener('resize', () => this._resize());
    if (window.ResizeObserver) {
      new ResizeObserver(() => this._resize()).observe(canvas);
    }
  }

  // ---------- URL 参数（便于演示 / 截图直接指定初始状态）----------
  // 例：index.html?fractal=sierpinski&generator=subdivision&mode=lines&depth=4&palette=1
  _applyUrlParams() {
    const q = new URLSearchParams(location.search);
    const s = this.state;
    const num = (k) => (q.has(k) ? parseFloat(q.get(k)) : null);

    if (['sierpinski', 'mandelbrot', 'julia'].includes(q.get('fractal'))) s.fractalType = q.get('fractal');
    if (['chaos', 'subdivision'].includes(q.get('generator'))) s.generator = q.get('generator');
    if (['points', 'lines', 'triangles'].includes(q.get('mode'))) s.mode = q.get('mode');
    if (num('ngon') !== null) s.ngon = num('ngon') | 0;
    if (num('count') !== null) s.count = num('count') | 0;
    if (num('depth') !== null) s.depth = num('depth') | 0;
    if (num('palette') !== null) s.palette = num('palette') | 0;
    if (num('pointSize') !== null) s.pointSize = num('pointSize');
    if (num('maxIter') !== null) s.maxIter = num('maxIter') | 0;
    if (num('juliaCx') !== null) s.juliaC[0] = num('juliaCx');
    if (num('juliaCy') !== null) s.juliaC[1] = num('juliaCy');

    // 保持 生成算法 / 渲染模式 一致：混沌游戏只有点云
    if (s.mode !== 'points') s.generator = 'subdivision';
    else if (s.generator === 'chaos') s.mode = 'points';
  }

  // ---------- 几何重建 ----------
  rebuildGeometry() {
    const s = this.state;
    if (s.fractalType !== 'sierpinski') return;
    const geom = buildSierpinski({
      generator: s.generator,
      mode: s.mode,
      ngon: s.ngon,
      count: s.count,
      depth: s.depth,
    });
    this.renderer.setGeometry(geom);
  }

  // ---------- 状态变更（面板 / 键盘的统一入口）----------
  setFractalType(v) {
    if (v === this.state.fractalType) return;
    this.state.fractalType = v;
    this.camera.setPreset(VIEW_PRESETS[v]);
    this.progress = 1;
    if (v === 'sierpinski') this.rebuildGeometry();
    this.ui.sync();
  }

  setGenerator(v) {
    if (v === this.state.generator) return;
    this.state.generator = v;
    if (v === 'chaos') this.state.mode = 'points'; // 混沌游戏只有点云
    this.progress = 1;
    this.rebuildGeometry();
    this.ui.sync();
  }

  setMode(v) {
    if (this.state.fractalType !== 'sierpinski') return;
    // 混沌游戏只有点云：选择线框 / 实体时自动切换到递归细分
    if (v !== 'points' && this.state.generator === 'chaos') {
      this.state.generator = 'subdivision';
    }
    this.state.mode = v;
    this.progress = 1;
    this.rebuildGeometry();
    this.ui.sync();
  }

  setNgon(v) {
    this.state.ngon = v | 0;
    this.progress = 1;
    this.rebuildGeometry();
    this.ui.sync();
  }

  setCount(v) {
    this.state.count = v | 0;
    this.progress = 1;
    this.rebuildGeometry();
    this.ui.sync();
  }

  setDepth(v) {
    this.state.depth = v | 0;
    this.progress = 1;
    this.rebuildGeometry();
    this.ui.sync();
  }

  setPointSize(v) { this.state.pointSize = v; this.ui.sync(); }
  setPalette(v) { this.state.palette = v; this.renderer.setPalette(v); this.ui.sync(); }
  setMaxIter(v) { this.state.maxIter = v | 0; this.ui.sync(); }
  setAnimSpeed(v) { this.state.animSpeed = v; this.ui.sync(); }

  setJuliaC(cx, cy) {
    if (cx !== null && cx !== undefined) this.state.juliaC[0] = cx;
    if (cy !== null && cy !== undefined) this.state.juliaC[1] = cy;
    this.ui.sync();
  }

  toggleAnimate() {
    if (!this.state.animating && this.progress >= 1) this.progress = 0; // 已长满则从头再来
    this.state.animating = !this.state.animating;
    this.ui.sync();
  }

  // 自检：运行内置检查并把结果展示在弹窗中（同时返回结果数组，便于控制台调用）
  runSelfTest() {
    const results = runSelfTest(this);
    this.ui.showSelfTest(results);
    return results;
  }

  resetView() {
    this.camera.setPreset(VIEW_PRESETS[this.state.fractalType]);
  }

  // ---------- 尺寸 ----------
  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.renderer.setViewport(this.canvas.width, this.canvas.height, dpr);
    this.camera.aspect = rect.width / rect.height;
    if (!this.camera.userAdjusted) this.camera.fit();
  }

  // ---------- 每帧 ----------
  update(dt) {
    if (this.state.animating) {
      this.progress += dt * this.state.animSpeed;
      if (this.progress >= 1) {
        this.progress = 1;
        this.state.animating = false;
        this.ui.sync();
      }
    }
  }

  draw() {
    this.renderer.draw(this.state, this.camera, this.progress);
  }
}

// ---------------- 启动 ----------------
// 截图 / 演示模式：URL 带 ?shot=1 时隐藏参数面板，让画布占满窗口，
// 便于导出干净、可复现的画面（README 截图即由此生成）。
function applyShotLayout() {
  if (!new URLSearchParams(location.search).has('shot')) return;
  document.body.classList.add('shot-mode');
}

function boot() {
  const canvas = document.getElementById('glcanvas');
  applyShotLayout();
  let gl;
  try {
    gl = createGLContext(canvas);
  } catch (err) {
    const overlay = document.getElementById('errorOverlay');
    document.getElementById('errorMsg').textContent = err.message;
    overlay.hidden = false;
    return;
  }

  const app = new App(canvas, gl);
  window.__app = app; // 便于调试 / 抽问演示

  let last = performance.now();
  let fpsAccum = 0;
  let fpsFrames = 0;
  let fpsValue = 0;

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    app.update(dt);
    app.draw();

    // HUD
    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum >= 0.4) {
      fpsValue = Math.round(fpsFrames / fpsAccum);
      fpsAccum = 0;
      fpsFrames = 0;
    }
    const isField = app.state.fractalType !== 'sierpinski';
    app.ui.updateHud({
      primitive: isField
        ? (app.state.fractalType === 'julia' ? 'Julia 集（片元）' : 'Mandelbrot（片元）')
        : PRIMITIVE_LABEL[app.renderer.primitive],
      count: isField
        ? '迭代 ' + app.renderer.lastIter + ' / ' + app.state.maxIter
        : app.renderer.lastDrawCount.toLocaleString('en-US') + ' / ' + app.renderer.vertexCount.toLocaleString('en-US'),
      zoom: (1 / app.camera.viewSize).toFixed(2) + '×',
      fps: fpsValue,
    });

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  // ?selftest=1：页面加载后自动运行自检并把结果输出到控制台
  if (new URLSearchParams(location.search).has('selftest')) {
    setTimeout(() => {
      const results = app.runSelfTest();
      const checks = results.filter((r) => !r.summary);
      const failed = checks.filter((r) => !r.pass);
      console.table(checks.map((r) => ({ 检查项: r.name, 结果: r.pass ? 'PASS' : 'FAIL', 说明: r.detail })));
      console.log(`[自检] ${checks.length - failed.length}/${checks.length} 项通过`);
    }, 300);
  }
}

boot();
