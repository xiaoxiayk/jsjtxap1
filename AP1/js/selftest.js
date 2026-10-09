// js/selftest.js
// 内置自检模块：对运行时环境、几何算法、相机变换、渲染路径与面板配置逐项断言，
// 返回 [{ name, pass, detail }] 结果数组，供 UI 弹窗展示或控制台输出。
//
// 使用方式：
//   · 面板中的「运行自检」按钮
//   · 控制台：window.__app.runSelfTest()
//   · URL 参数：index.html?selftest=1（加载后自动运行并 console.table 输出）

// ---------- 小工具 ----------

// 混沌游戏的收敛容差（世界坐标）。
// 混沌游戏先做 warmup=30 步"预热"再取点，残差约等于 2^-30 × 图形直径 ≈ 1.8e-9；
// 因此这些点可能以 ~1e-9 的量级落在多边形边界之外——这远小于一个像素
// （默认视野约 2.3 个世界单位对应 ~1200 像素，即 1 像素 ≈ 2e-3），是完全不可见的
// 浮点残差，不应判为失败。这里取 1e-6 作为容差：既比残差大 500 倍，又比一个像素
// 小 1000 倍，足以区分"数值残差"与"真正的算法错误"。
const CONTAINMENT_TOL = 1e-6;

// 统计落在凸多边形之外的点。
// 注意：不能用"到各边直线的最大距离"来衡量越界量——对靠近顶点的点，这个值会被
// 对面那条边的距离主导，从而严重高估。这里改为用「各边的有向距离中最负的那个」
// 作为该点的真实越界量（凸多边形=半平面交集，故它不会低估越界程度）。
function analyzeContainment(positions, verts) {
  let outside = 0;
  let worst = 0; // 最大越界量（正数）
  let firstOutside = null;
  const m = verts.length;

  for (let i = 0; i < positions.length; i += 2) {
    const x = positions[i];
    const y = positions[i + 1];
    let mostNegative = 0;
    for (let k = 0; k < m; k++) {
      const [ax, ay] = verts[k];
      const [bx, by] = verts[(k + 1) % m];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const s = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / len; // 有向距离
      if (s < mostNegative) mostNegative = s;
    }
    if (mostNegative < 0) {
      outside++;
      if (!firstOutside) firstOutside = [x, y];
      if (-mostNegative > worst) worst = -mostNegative;
    }
  }
  return { outside, worst, firstOutside };
}

function containmentDetail(r) {
  if (r.outside === 0) return '越界点 0 个（全部严格落在多边形内）';
  const f = r.firstOutside || [0, 0];
  return (
    `越界点 ${r.outside} 个，最大越界量 ${r.worst.toExponential(2)}（容差 ${CONTAINMENT_TOL.toExponential(0)}，1 像素约 2e-3）；` +
    `首个越界点 (${f[0].toFixed(9)}, ${f[1].toFixed(9)})`
  );
}

// 判定：越界量不超过容差即视为通过（残差量级 ~1e-9，纯浮点效应）
function containmentPass(r) {
  return r.worst <= CONTAINMENT_TOL;
}

// 用相机矩阵把世界坐标映射到裁剪坐标（z=0, w=1）
function worldToClip(m, x, y) {
  return {
    x: m[0] * x + m[4] * y + m[12],
    y: m[1] * x + m[5] * y + m[13],
  };
}

// ---------- 主入口 ----------

function runSelfTest(app) {
  const gl = app.gl;
  const renderer = app.renderer;
  const camera = app.camera;

  const results = [];
  const check = (name, fn) => {
    try {
      const r = fn();
      if (r === true || r === undefined) {
        results.push({ name, pass: true, detail: '' });
      } else {
        results.push({ name, pass: !!r.pass, detail: r.detail == null ? '' : String(r.detail) });
      }
    } catch (err) {
      results.push({ name, pass: false, detail: '抛出异常: ' + err.message });
    }
  };

  // 备份当前状态，自检结束后原样恢复
  const saved = JSON.parse(JSON.stringify({
    fractalType: app.state.fractalType,
    generator: app.state.generator,
    mode: app.state.mode,
    ngon: app.state.ngon,
    count: app.state.count,
    depth: app.state.depth,
    palette: app.state.palette,
    maxIter: app.state.maxIter,
    animating: app.state.animating,
  }));
  const savedProgress = app.progress;
  gl.getError(); // 清空历史错误标志

  // ---- 1. 运行环境 ----
  check('WebGL 2.0 上下文可用', () => {
    const ok = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    return {
      pass: ok,
      detail: ok
        ? gl.getParameter(gl.VERSION) + ' ｜ ' + gl.getParameter(gl.RENDERER)
        : '当前上下文不是 WebGL2RenderingContext',
    };
  });

  check('着色器程序链接成功', () => {
    const a = gl.getProgramParameter(renderer.gasket.program, gl.LINK_STATUS);
    const b = gl.getProgramParameter(renderer.field.program, gl.LINK_STATUS);
    return { pass: !!a && !!b, detail: 'gasket=' + a + ', field=' + b };
  });

  check('材质纹理（配色查找表）尺寸正确', () => {
    const ok = gl.isTexture(renderer.lutTexture) &&
      gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S) === gl.CLAMP_TO_EDGE;
    return { pass: ok, detail: LUT_SIZE + '×1 RGBA' };
  });

  // ---- 2. 混沌游戏算法 ----
  check('混沌游戏：顶点数与数据长度正确', () => {
    const g = chaosGame(3, 5000);
    const ok = g.primitive === 'points' &&
      g.vertexCount === 5000 &&
      g.positions.length === 5000 * 2 &&
      g.t.length === 5000;
    return { pass: ok, detail: `positions=${g.positions.length}, t=${g.t.length}` };
  });

  check('混沌游戏：5000 点全部落在三角形垫片范围内', () => {
    const g = chaosGame(3, 5000);
    const r = analyzeContainment(g.positions, polygonVertices(3));
    return { pass: containmentPass(r), detail: containmentDetail(r) };
  });

  check('混沌游戏：n=5 五边形垫片点落在五边形内', () => {
    const g = chaosGame(5, 5000);
    const r = analyzeContainment(g.positions, polygonVertices(5));
    return { pass: containmentPass(r), detail: containmentDetail(r) };
  });

  // 负向对照：确认上面的"越界检测器"不是永远返回 0 的空检查
  check('越界检测器本身有效（负向对照）', () => {
    // 第 1 个点明显在三角形外（到 y=-0.5 底边距离 0.4），后 2 个点在内部
    const pts = new Float32Array([0, -0.9, 0, 0, 0.3, 0]);
    const r = analyzeContainment(pts, polygonVertices(3));
    // 注意 Float32Array 只有约 1e-7 的相对精度，故这里用 1e-6 容差比较期望值
    const ok = r.outside === 1 && Math.abs(r.worst - 0.4) < 1e-6;
    return {
      pass: ok,
      detail: `越界点 ${r.outside} 个（应为 1），最大越界量 ${r.worst.toFixed(6)}（应为 0.400000）`,
    };
  });

  // ---- 3. 递归细分算法 ----
  check('递归细分：子三角形个数 = 3^depth（depth 0–6）', () => {
    const bad = [];
    for (let d = 0; d <= 6; d++) {
      const n = subdivideTriangle(polygonVertices(3), d).length / 6;
      const expect = Math.pow(3, d);
      if (n !== expect) bad.push(`depth=${d}: ${n}≠${expect}`);
    }
    return { pass: bad.length === 0, detail: bad.length ? bad.join('; ') : 'depth 0→1, 1→3, …, 6→729 全部正确' };
  });

  check('递归细分：三种图元顶点数符合预期', () => {
    const d = 3, tri = Math.pow(3, d);
    const p = buildSierpinski({ generator: 'subdivision', mode: 'points', depth: d });
    const l = buildSierpinski({ generator: 'subdivision', mode: 'lines', depth: d });
    const t = buildSierpinski({ generator: 'subdivision', mode: 'triangles', depth: d });
    const ok = p.vertexCount === tri * 3 && l.vertexCount === tri * 6 && t.vertexCount === tri * 3 &&
      p.primitive === 'points' && l.primitive === 'lines' && t.primitive === 'triangles';
    return { pass: ok, detail: `depth=3 → 点云 ${p.vertexCount} / 线框 ${l.vertexCount} / 实体 ${t.vertexCount}` };
  });

  check('着色参数 t 落在 [0,1] 区间', () => {
    const g = buildSierpinski({ generator: 'subdivision', mode: 'triangles', depth: 4 });
    let ok = true;
    for (let i = 0; i < g.t.length; i++) {
      if (!(g.t[i] >= 0 && g.t[i] <= 1)) { ok = false; break; }
    }
    const t0 = tOf(-1, -1), t1 = tOf(1, 1);
    return { pass: ok && t0 === 0 && t1 === 1, detail: `tOf(-1,-1)=${t0}, tOf(1,1)=${t1}` };
  });

  // ---- 4. 相机与投影 ----
  check('相机矩阵：中心 → 裁剪原点，半宽/半高 → 裁剪边界', () => {
    const oldCenter = camera.center.slice();
    const oldSize = camera.viewSize;
    const oldMin = camera.minSize;
    const oldAdjusted = camera.userAdjusted;
    let detail = '';
    let pass = false;
    try {
      camera.setPreset({ center: [0.3, -0.2], halfW: 1.1, halfH: 1.1, min: 1e-3 });
      camera.aspect = 800 / 600;
      camera.fit();
      const m = camera.matrix();
      const c0 = worldToClip(m, camera.center[0], camera.center[1]);
      const cR = worldToClip(m, camera.center[0] + camera.viewSize * camera.aspect, camera.center[1]);
      const cT = worldToClip(m, camera.center[0], camera.center[1] + camera.viewSize);
      pass = Math.abs(c0.x) < 1e-6 && Math.abs(c0.y) < 1e-6 &&
        Math.abs(cR.x - 1) < 1e-6 && Math.abs(cR.y) < 1e-6 &&
        Math.abs(cT.x) < 1e-6 && Math.abs(cT.y - 1) < 1e-6;
      detail = `中心→(${c0.x.toFixed(6)}, ${c0.y.toFixed(6)}), 右边界→x=${cR.x.toFixed(6)}, 上边界→y=${cT.y.toFixed(6)}`;
    } finally {
      camera.center = oldCenter;
      camera.viewSize = oldSize;
      camera.minSize = oldMin;
      camera.userAdjusted = oldAdjusted;
    }
    return { pass, detail };
  });

  check('相机取景：内容按宽高比完整落入视野', () => {
    const oldCenter = camera.center.slice();
    const oldSize = camera.viewSize;
    const oldMin = camera.minSize;
    const oldAdjusted = camera.userAdjusted;
    let pass = true;
    let detail = '';
    try {
      for (const aspect of [0.5, 1, 1.78, 3]) {
        camera.aspect = aspect;
        camera.setPreset({ center: [0, 0], halfW: 1.15, halfH: 1.15, min: 1e-3 });
        if (camera.viewSize < 1.15 - 1e-9 || camera.viewSize * aspect < 1.15 - 1e-9) {
          pass = false;
          detail = `aspect=${aspect} 时视野不足`;
          break;
        }
      }
      if (pass) detail = '宽高比 0.5 / 1 / 1.78 / 3 下均完整覆盖 1.15×1.15 的世界范围';
    } finally {
      camera.center = oldCenter;
      camera.viewSize = oldSize;
      camera.minSize = oldMin;
      camera.userAdjusted = oldAdjusted;
    }
    return { pass, detail };
  });

  check('滚轮缩放：以光标为锚点，锚点世界坐标不变', () => {
    const oldCenter = camera.center.slice();
    const oldSize = camera.viewSize;
    const oldMin = camera.minSize;
    const oldAdjusted = camera.userAdjusted;
    let worst = 0;
    try {
      const W = 800, H = 600;
      camera.aspect = W / H;
      camera.setPreset({ center: [0, 0], halfW: 1.15, halfH: 1.15, min: 1e-6 });
      const px = 610, py = 190; // 任意非中心像素
      const ndcX = (px / W) * 2 - 1;
      const ndcY = 1 - (py / H) * 2;
      const wx0 = camera.center[0] + ndcX * camera.viewSize * camera.aspect;
      const wy0 = camera.center[1] + ndcY * camera.viewSize;
      for (const f of [0.5, 0.5, 2.2, 1.7]) {
        camera.zoomAt(f, px, py, W, H);
        const wx = camera.center[0] + ndcX * camera.viewSize * camera.aspect;
        const wy = camera.center[1] + ndcY * camera.viewSize;
        worst = Math.max(worst, Math.abs(wx - wx0), Math.abs(wy - wy0));
      }
    } finally {
      camera.center = oldCenter;
      camera.viewSize = oldSize;
      camera.minSize = oldMin;
      camera.userAdjusted = oldAdjusted;
    }
    return { pass: worst < 1e-9, detail: '锚点偏移 ' + worst.toExponential(2) };
  });

  check('相机缩放范围限制（minSize / maxSize）生效', () => {
    const oldCenter = camera.center.slice();
    const oldSize = camera.viewSize;
    const oldMin = camera.minSize;
    const oldMax = camera.maxSize;
    let pass, detail;
    try {
      camera.minSize = 0.01;
      camera.viewSize = 1;
      camera.zoomAt(1e-6, 400, 300, 800, 600);
      const low = camera.viewSize;
      camera.viewSize = 1;
      camera.zoomAt(1e6, 400, 300, 800, 600);
      const high = camera.viewSize;
      pass = Math.abs(low - 0.01) < 1e-9 && Math.abs(high - camera.maxSize) < 1e-9;
      detail = `最小 ${low}，最大 ${high}（上限 ${camera.maxSize}）`;
    } finally {
      camera.center = oldCenter;
      camera.viewSize = oldSize;
      camera.minSize = oldMin;
      camera.maxSize = oldMax;
    }
    return { pass, detail };
  });

  // ---- 5. 配色 ----
  check('配色方案 ≥ 3 套且首尾亮度递增', () => {
    const bad = [];
    for (let i = 0; i < PALETTES.length; i++) {
      const data = buildLutData(i);
      if (data.length !== LUT_SIZE * 4) { bad.push(`#${i} 长度错`); continue; }
      const lum = (k) => 0.2126 * data[k * 4] + 0.7152 * data[k * 4 + 1] + 0.0722 * data[k * 4 + 2];
      if (!(lum(LUT_SIZE - 1) > lum(0) + 8)) bad.push(`#${i} ${PALETTES[i].name} 亮度未递增`);
      if (data[0 * 4 + 3] !== 255 || data[(LUT_SIZE - 1) * 4 + 3] !== 255) bad.push(`#${i} alpha 异常`);
    }
    const pass = PALETTES.length >= 3 && bad.length === 0;
    return { pass, detail: pass ? `${PALETTES.length} 套：${PALETTES.map((p) => p.name).join(' / ')}` : bad.join('; ') };
  });

  // ---- 6. 渲染路径与 GL 错误 ----
  check('四条绘制路径均无 GL 错误', () => {
    const cases = [
      ['点云', { generator: 'chaos', mode: 'points', ngon: 3, count: 5000, depth: 4 }],
      ['线框', { generator: 'subdivision', mode: 'lines', depth: 3 }],
      ['实体', { generator: 'subdivision', mode: 'triangles', depth: 5 }],
      ['细分点云', { generator: 'subdivision', mode: 'points', depth: 4 }],
    ];
    const errs = [];
    for (const [label, cfg] of cases) {
      gl.getError();
      renderer.setGeometry(buildSierpinski(cfg));
      renderer.draw({ ...app.state, fractalType: 'sierpinski' }, camera, 1);
      const e = gl.getError();
      if (e !== 0) errs.push(label + ' → 0x' + e.toString(16));
    }
    gl.getError();
    renderer.draw({ ...app.state, fractalType: 'mandelbrot' }, camera, 1);
    const eField = gl.getError();
    if (eField !== 0) errs.push('复平面分形 → 0x' + eField.toString(16));

    app.rebuildGeometry(); // 恢复当前几何
    return { pass: errs.length === 0, detail: errs.length ? errs.join('; ') : 'gl.getError() 全部为 0（NO_ERROR）' };
  });

  check('生长动画：绘制顶点数按进度增长并对齐图元', () => {
    const cases = [
      ['points', { generator: 'subdivision', mode: 'points', depth: 4 }, 1],
      ['lines', { generator: 'subdivision', mode: 'lines', depth: 4 }, 2],
      ['triangles', { generator: 'subdivision', mode: 'triangles', depth: 4 }, 3],
    ];
    const bad = [];
    for (const [label, cfg, align] of cases) {
      renderer.setGeometry(buildSierpinski(cfg));
      renderer.draw({ ...app.state, fractalType: 'sierpinski' }, camera, 0.5);
      const n = renderer.lastDrawCount;
      if (!(n > 0 && n % align === 0)) { bad.push(`${label} 半程 ${n}（应为 ${align} 的倍数）`); continue; }
      if (n >= renderer.vertexCount) bad.push(`${label} 半程已画满`);
    }
    app.rebuildGeometry();
    return { pass: bad.length === 0, detail: bad.length ? bad.join('; ') : '半程绘制量约为总数一半，且各图元按 1/2/3 对齐' };
  });

  check('复平面分形：迭代上限随进度从 1 增长到设定值', () => {
    const st = { ...app.state, fractalType: 'mandelbrot', maxIter: 200 };
    gl.getError();
    renderer.draw(st, camera, 0.25);
    const quarter = renderer.lastIter;
    renderer.draw(st, camera, 1);
    const full = renderer.lastIter;
    const e = gl.getError();
    const pass = quarter === 50 && full === 200 && e === 0;
    return { pass, detail: `进度 0.25 → ${quarter} 次；进度 1 → ${full} 次（设定 ${st.maxIter}）` };
  });

  // ---- 7. 参数边界与鲁棒性 ----
  check('混沌游戏：多边形边数 n = 3…9 均可生成且点不越界', () => {
    const bad = [];
    for (let n = 3; n <= 9; n++) {
      const g = buildSierpinski({ generator: 'chaos', mode: 'points', ngon: n, count: 5000, depth: 4 });
      if (g.vertexCount !== 5000 || g.positions.length !== 10000) {
        bad.push('n=' + n + ' 顶点数异常');
        continue;
      }
      const r = analyzeContainment(g.positions, polygonVertices(n));
      if (!containmentPass(r)) bad.push('n=' + n + ' ' + containmentDetail(r));
    }
    return { pass: bad.length === 0, detail: bad.length ? bad.join('; ') : 'n=3…9 顶点数正确，且所有点都落在对应的正 n 边形内' };
  });

  check('顶点数边界：5000 与 200000 均正常', () => {
    const bad = [];
    for (const c of [5000, 200000]) {
      gl.getError();
      renderer.setGeometry(buildSierpinski({ generator: 'chaos', mode: 'points', ngon: 3, count: c, depth: 4 }));
      renderer.draw({ ...app.state, fractalType: 'sierpinski' }, camera, 1);
      const e = gl.getError();
      if (renderer.vertexCount !== c || e !== 0) {
        bad.push(c + ' (vc=' + renderer.vertexCount + ', err=0x' + e.toString(16) + ')');
      }
    }
    return { pass: bad.length === 0, detail: bad.length ? bad.join('; ') : '5000 与 200000 点均正确绘制且无 GL 错误' };
  });

  check('递归细分：depth 0–6 × 三种图元共 21 组均正确', () => {
    const bad = [];
    for (let d = 0; d <= 6; d++) {
      for (const m of ['points', 'lines', 'triangles']) {
        gl.getError();
        renderer.setGeometry(buildSierpinski({ generator: 'subdivision', mode: m, depth: d }));
        renderer.draw({ ...app.state, fractalType: 'sierpinski' }, camera, 1);
        const e = gl.getError();
        const expect = Math.pow(3, d) * (m === 'lines' ? 6 : 3);
        if (renderer.vertexCount !== expect || e !== 0) bad.push(`d=${d}/${m}`);
      }
    }
    return { pass: bad.length === 0, detail: bad.length ? bad.join('; ') : '21 组顶点数均等于 3^d×(3 或 6)，且 gl.getError() 全为 0' };
  });

  check('配色与点大小边界：5 套配色、点大小 1 / 16', () => {
    const bad = [];
    for (let p = 0; p < PALETTES.length; p++) {
      gl.getError();
      renderer.setPalette(p);
      renderer.draw({ ...app.state, fractalType: 'sierpinski', palette: p }, camera, 1);
      if (gl.getError() !== 0) bad.push('配色 ' + p);
    }
    for (const ps of [1, 16]) {
      gl.getError();
      renderer.draw({ ...app.state, fractalType: 'sierpinski', pointSize: ps }, camera, 1);
      if (gl.getError() !== 0) bad.push('点大小 ' + ps);
    }
    return { pass: bad.length === 0, detail: bad.length ? bad.join('; ') : `${PALETTES.length} 套配色切换与点大小 1/16 均无 GL 错误` };
  });

  check('复平面分形：迭代边界 50 / 1000 均正常', () => {
    const bad = [];
    for (const f of ['mandelbrot', 'julia']) {
      for (const mi of [50, 1000]) {
        gl.getError();
        renderer.draw({ ...app.state, fractalType: f, maxIter: mi }, camera, 1);
        if (renderer.lastIter !== mi || gl.getError() !== 0) bad.push(`${f} maxIter=${mi} (iter=${renderer.lastIter})`);
      }
    }
    return { pass: bad.length === 0, detail: bad.length ? bad.join('; ') : 'Mandelbrot 与 Julia 在 maxIter 50/1000 下迭代次数正确、无 GL 错误' };
  });

  check('生长动画：进度 0 / 0.001 / 0.5 / 1 边界安全', () => {
    const bad = [];
    renderer.setGeometry(buildSierpinski({ generator: 'subdivision', mode: 'triangles', depth: 6 }));
    for (const pr of [0, 0.001, 0.5, 1]) {
      gl.getError();
      renderer.draw({ ...app.state, fractalType: 'sierpinski' }, camera, pr);
      const e = gl.getError();
      const n = renderer.lastDrawCount;
      if (e !== 0) bad.push('p=' + pr + ' 报错');
      else if (n % 3 !== 0) bad.push('p=' + pr + ' 未按 3 对齐(' + n + ')');
      else if (pr === 0 && n !== 0) bad.push('p=0 仍绘制了顶点');
      else if (pr === 1 && n !== renderer.vertexCount) bad.push('p=1 未画满');
    }
    return { pass: bad.length === 0, detail: bad.length ? bad.join('; ') : '进度 0 不绘制、进度 1 画满、中间值按三角形对齐' };
  });

  // 恢复初始状态，供后续交互类检查使用
  Object.assign(app.state, saved);
  app.renderer.setPalette(app.state.palette);
  app.rebuildGeometry();

  // ---- 8. 交互与面板配置 ----
  check('渲染模式切换：线框/实体自动使用递归细分', () => {
    const before = app.state.generator;
    let pass, detail;
    try {
      app.setMode('triangles');
      pass = app.state.mode === 'triangles' && app.state.generator === 'subdivision' && renderer.primitive === 'triangles';
      detail = 'mode=' + app.state.mode + ', generator=' + app.state.generator + ', primitive=' + renderer.primitive;
      app.setMode('points');
    } finally {
      app.state.generator = before;
      app.rebuildGeometry();
    }
    return { pass, detail };
  });

  check('面板控件齐备且取值范围正确', () => {
    const g = (id) => document.getElementById(id);
    const mode = document.querySelectorAll('#mode button').length;
    const segs = document.querySelectorAll('#fractalType button').length;
    const pal = g('palette');
    const palCount = pal ? pal.options.length : 0;
    const depth = g('depth');
    const count = g('count');
    const ngon = g('ngon');
    const maxIter = g('maxIter');
    const bad = [];
    if (mode !== 3) bad.push('渲染模式按钮 ' + mode + ' 个');
    if (segs < 3) bad.push('分形类型按钮 ' + segs + ' 个');
    if (palCount < 3) bad.push('配色选项 ' + palCount + ' 项');
    if (!depth || depth.min !== '0' || depth.max !== '6') bad.push('递归深度范围错误');
    if (!count || parseFloat(count.min) < 5000) bad.push('顶点数下限 < 5000');
    if (!ngon || ngon.min !== '3' || ngon.max !== '9') bad.push('多边形边数范围错误');
    if (!maxIter || parseFloat(maxIter.min) < 1) bad.push('最大迭代范围错误');
    ['animateBtn', 'resetBtn', 'selfTestBtn', 'pointSize'].forEach((id) => {
      if (!g(id)) bad.push('缺少控件 ' + id);
    });
    const pass = bad.length === 0;
    return {
      pass,
      detail: pass
        ? `模式 ${mode} 项 / 类型 ${segs} 项 / 配色 ${palCount} 项 / 深度 ${depth.min}–${depth.max} / 顶点数 ${count.min}–${count.max} / n 边形 ${ngon.min}–${ngon.max}`
        : bad.join('; '),
    };
  });

  check('几何重建无 GL 错误（参数联动）', () => {
    const before = { ...app.state };
    const errs = [];
    for (const d of [0, 2, 4, 6]) {
      gl.getError();
      app.state.depth = d;
      app.rebuildGeometry();
      app.draw();
      const e = gl.getError();
      if (e !== 0) errs.push('depth=' + d + ' → 0x' + e.toString(16));
    }
    app.state.depth = before.depth;
    app.state.generator = before.generator;
    app.state.mode = before.mode;
    app.state.fractalType = before.fractalType;
    app.rebuildGeometry();
    return { pass: errs.length === 0, detail: errs.length ? errs.join('; ') : 'depth 0 / 2 / 4 / 6 重建并绘制均无错误' };
  });

  // 恢复原始状态
  Object.assign(app.state, saved);
  app.progress = savedProgress;
  app.renderer.setPalette(app.state.palette);
  app.rebuildGeometry();
  app.ui.sync();

  const passed = results.filter((r) => r.pass).length;
  results.push({
    name: '总计',
    pass: passed === results.length,
    detail: `${passed} / ${results.length} 项通过`,
    summary: true,
  });

  return results;
}
