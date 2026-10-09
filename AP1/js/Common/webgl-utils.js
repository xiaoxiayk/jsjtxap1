// js/Common/webgl-utils.js
// 教材 Common 工具库中 webgl-utils.js 的极简子集：创建 WebGL 2.0 上下文。
// 说明：参照教材同名 API 自行实现。

function createGLContext(canvas) {
  const attributes = {
    alpha: false,
    antialias: true,
    depth: false,       // 本项目为 2D 场景，不需要深度缓冲
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true, // 便于截图 / 保存画面
    powerPreference: 'high-performance',
  };

  const gl = canvas.getContext('webgl2', attributes);
  if (!gl) {
    throw new Error(
      '当前浏览器或设备不支持 WebGL 2.0。请使用较新版本的 Chrome / Edge / Firefox，' +
      '并确认显卡驱动与硬件加速已开启。'
    );
  }
  return gl;
}
