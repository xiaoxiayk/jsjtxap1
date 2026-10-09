// js/ui.js
// 参数面板模块：负责所有 HTML 控件与状态的绑定与回显。
// UI 不直接操作几何 / WebGL，只调用 app 暴露的 setter，并由 app 反向调用 sync() 回显。

const $ = (sel) => document.querySelector(sel);

const formatInt = (v) => Number(v).toLocaleString('en-US');

class UI {
  constructor(app) {
    this.app = app;
    this.el = {
      fractalType: $('#fractalType'),
      generator: $('#generator'),
      mode: $('#mode'),

      ngon: $('#ngon'), ngonVal: $('#ngonVal'),
      count: $('#count'), countVal: $('#countVal'),
      depth: $('#depth'), depthVal: $('#depthVal'),
      pointSize: $('#pointSize'), pointSizeVal: $('#pointSizeVal'),
      palette: $('#palette'),

      maxIter: $('#maxIter'), maxIterVal: $('#maxIterVal'),
      juliaCx: $('#juliaCx'), juliaCxVal: $('#juliaCxVal'),
      juliaCy: $('#juliaCy'), juliaCyVal: $('#juliaCyVal'),

      animSpeed: $('#animSpeed'), animSpeedVal: $('#animSpeedVal'),
      animateBtn: $('#animateBtn'),
      resetBtn: $('#resetBtn'),
      animHint: $('#animHint'),

      selfTestBtn: $('#selfTestBtn'),
      selfTestModal: $('#selfTestModal'),
      selfTestClose: $('#selfTestClose'),
      selfTestSummary: $('#selfTestSummary'),
      selfTestList: $('#selfTestList'),

      groupSierpinski: $('#groupSierpinski'),
      groupMandel: $('#groupMandel'),
      rowNgon: $('#rowNgon'),
      rowCount: $('#rowCount'),
      rowDepth: $('#rowDepth'),
      rowJulia: $('#rowJulia'),
      rowJulia2: $('#rowJulia2'),
      modeHint: $('#modeHint'),

      hudPrimitive: $('#hudPrimitive'),
      hudCount: $('#hudCount'),
      hudZoom: $('#hudZoom'),
      hudFps: $('#hudFps'),
    };
    this._bind();
  }

  _bind() {
    const app = this.app;

    // 分段按钮组
    const segmented = (container, handler) => {
      container.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => handler(btn.dataset.value));
      });
    };
    segmented(this.el.fractalType, (v) => app.setFractalType(v));
    segmented(this.el.generator, (v) => app.setGenerator(v));
    segmented(this.el.mode, (v) => app.setMode(v));

    // 滑条
    const slider = (input, handler) => {
      input.addEventListener('input', () => handler(parseFloat(input.value)));
    };
    slider(this.el.ngon, (v) => app.setNgon(v));
    slider(this.el.count, (v) => app.setCount(v));
    slider(this.el.depth, (v) => app.setDepth(v));
    slider(this.el.pointSize, (v) => app.setPointSize(v));
    slider(this.el.maxIter, (v) => app.setMaxIter(v));
    slider(this.el.juliaCx, (v) => app.setJuliaC(v, null));
    slider(this.el.juliaCy, (v) => app.setJuliaC(null, v));
    slider(this.el.animSpeed, (v) => app.setAnimSpeed(v));

    // 下拉框
    this.el.palette.addEventListener('change', () => app.setPalette(parseInt(this.el.palette.value, 10)));

    // 按钮
    this.el.animateBtn.addEventListener('click', () => app.toggleAnimate());
    this.el.resetBtn.addEventListener('click', () => app.resetView());
    this.el.selfTestBtn.addEventListener('click', () => app.runSelfTest());
    this.el.selfTestClose.addEventListener('click', () => this.hideSelfTest());
    this.el.selfTestModal.addEventListener('click', (e) => {
      if (e.target === this.el.selfTestModal) this.hideSelfTest();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.selfTestModal.hidden) this.hideSelfTest();
    });
  }

  // 展示自检结果
  showSelfTest(results) {
    const checks = results.filter((r) => !r.summary);
    const failed = checks.filter((r) => !r.pass);
    const allPass = failed.length === 0;

    this.el.selfTestSummary.innerHTML = allPass
      ? `全部通过：<span class="ok">${checks.length}</span> / ${checks.length} 项`
      : `通过 <span class="ok">${checks.length - failed.length}</span> / ${checks.length} 项，失败 <span class="bad">${failed.length}</span> 项：${failed
          .map((f) => f.name)
          .join('、')}`;

    this.el.selfTestList.innerHTML = results
      .map((r) => {
        const cls = r.summary ? (r.pass ? 'pass' : 'fail') : r.pass ? 'pass' : 'fail';
        const mark = r.pass ? '✔' : '✘';
        const label = r.summary ? `<b>${r.name}</b>` : r.name;
        return `<li class="${cls}"><span class="mark">${mark}</span><span>${label}${
          r.detail ? `<div class="detail">${r.detail}</div>` : ''
        }</span></li>`;
      })
      .join('');

    this.el.selfTestModal.hidden = false;
  }

  hideSelfTest() {
    this.el.selfTestModal.hidden = true;
  }

  // 状态 -> 界面 回显
  sync() {
    const s = this.app.state;
    const el = this.el;

    setActive(el.fractalType, s.fractalType);
    setActive(el.generator, s.generator);
    setActive(el.mode, s.mode);

    const isSierpinski = s.fractalType === 'sierpinski';
    el.groupSierpinski.classList.toggle('hidden', !isSierpinski);
    el.groupMandel.classList.toggle('hidden', isSierpinski);

    el.rowNgon.classList.toggle('hidden', !(isSierpinski && s.generator === 'chaos'));
    el.rowCount.classList.toggle('hidden', !(isSierpinski && s.generator === 'chaos'));
    el.rowDepth.classList.toggle('hidden', !(isSierpinski && s.generator === 'subdivision'));
    const showJulia = s.fractalType === 'julia';
    el.rowJulia.classList.toggle('hidden', !showJulia);
    el.rowJulia2.classList.toggle('hidden', !showJulia);

    setSlider(el.ngon, el.ngonVal, s.ngon, String(s.ngon));
    setSlider(el.count, el.countVal, s.count, formatInt(s.count));
    setSlider(el.depth, el.depthVal, s.depth, String(s.depth));
    setSlider(el.pointSize, el.pointSizeVal, s.pointSize, formatNum(s.pointSize));
    setSlider(el.maxIter, el.maxIterVal, s.maxIter, String(s.maxIter));
    setSlider(el.juliaCx, el.juliaCxVal, s.juliaC[0], s.juliaC[0].toFixed(3));
    setSlider(el.juliaCy, el.juliaCyVal, s.juliaC[1], s.juliaC[1].toFixed(3));
    setSlider(el.animSpeed, el.animSpeedVal, s.animSpeed, s.animSpeed.toFixed(2));

    if (el.palette.value !== String(s.palette)) el.palette.value = String(s.palette);

    // 提示文案
    if (isSierpinski) {
      el.modeHint.textContent = s.generator === 'chaos'
        ? '混沌游戏生成点云（顶点数滑条控制点数，≥5000）。选择「线框 / 实体」会自动切换到递归细分。'
        : '递归细分由「递归深度」控制细分层级（0–6），同一组三角形可切换点云 / 线框 / 实体三种图元。';
    } else {
      el.modeHint.textContent = '';
    }

    // 生长按钮状态
    el.animateBtn.classList.toggle('playing', s.animating);
    el.animateBtn.textContent = s.animating ? '暂停生长（空格）' : '播放生长（空格）';
    el.animateBtn.disabled = false;

    el.animHint.textContent = isSierpinski
      ? '按顶点顺序逐步显现：点云从 0 增长到设定顶点数，线框 / 实体按整条边、整个三角形递增。'
      : '按迭代上限逐步演化：从 1 增长到设定值，逐层显现集合边界细节；再次按下空格可重新播放。';
  }

  updateHud({ primitive, count, zoom, fps }) {
    if (primitive !== undefined) this.el.hudPrimitive.textContent = primitive;
    if (count !== undefined) this.el.hudCount.textContent = count;
    if (zoom !== undefined) this.el.hudZoom.textContent = zoom;
    if (fps !== undefined) this.el.hudFps.textContent = fps;
  }
}

function setActive(container, value) {
  container.querySelectorAll('button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

function setSlider(input, output, value, text) {
  if (input.value !== String(value)) input.value = String(value);
  output.textContent = text;
}

function formatNum(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
