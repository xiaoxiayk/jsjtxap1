// js/interaction.js
// 交互模块：鼠标（平移 / 缩放）与键盘（渲染模式、生长动画、重置视角）事件绑定。
// 全部事件监听手工实现，不依赖任何外部库。

function attachInteraction(app) {
  const canvas = app.canvas;
  const camera = app.camera;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  // ---- 鼠标左键拖动平移 ----
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.classList.add('grabbing');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    camera.pan(dx, dy, canvas.clientWidth, canvas.clientHeight);
  });

  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('grabbing');
  };
  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('blur', stopDrag);

  // ---- 滚轮：拦截浏览器的默认手势 ----
  // 说明：把滚轮向左 / 向右拨动（或触控板横向滑动）时，浏览器会把它解释为
  // "后退 / 前进"的导航手势，导致画面被切走。这里在 window 的捕获阶段统一
  // preventDefault，只放行参数面板内部的纵向滚动。
  window.addEventListener(
    'wheel',
    (e) => {
      const target = e.target;
      const inPanel = target instanceof Element && target.closest('.panel') !== null;
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      // 面板内的纵向滚轮照常滚动；其余（含水平滚轮、Ctrl+滚轮缩放）一律拦截
      if (inPanel && !horizontal && !e.ctrlKey) return;
      e.preventDefault();
    },
    { passive: false, capture: true }
  );

  // ---- 滚轮缩放（以光标为锚点）----
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      // 归一化不同设备的滚动量（deltaMode: 0=像素, 1=行, 2=页）
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
      const dy = e.deltaY * unit;
      // 仅纵向滚动用于缩放；纯横向（滚轮左右拨动）已被上面的全局监听拦截，
      // 这里直接忽略，避免误缩放
      if (dy === 0) return;

      const factor = Math.exp(dy * 0.0012); // 向下滚 -> factor>1 -> 视野变大（缩小）
      camera.zoomAt(factor, px, py, canvas.clientWidth, canvas.clientHeight);
    },
    { passive: false }
  );

  // ---- 键盘 ----
  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case '1':
        app.setMode('points');
        break;
      case '2':
        app.setMode('lines');
        break;
      case '3':
        app.setMode('triangles');
        break;
      case 'r':
      case 'R':
        app.resetView();
        break;
      case ' ':
      case 'Spacebar':
        e.preventDefault();
        app.toggleAnimate();
        break;
      default:
        // 兼容部分浏览器 / 自动化环境只给出 code 的情况
        if (e.code === 'Space') {
          e.preventDefault();
          app.toggleAnimate();
        }
        break;
    }
  });
}
