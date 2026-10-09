// js/Common/initShaders.js
// 着色器编译 / 程序链接工具。
// 说明：本文件为参照教材 Angel & Shreiner《Interactive Computer Graphics》
// 配套 Common 工具库的同名 API，由本人自行实现（未复制原文件），
// 以保持与本课程"教材配套工具库"技术栈一致。
// 导出 createProgram(gl, vsSource, fsSource) -> WebGLProgram

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(
      (type === gl.VERTEX_SHADER ? '顶点着色器' : '片元着色器') + '编译失败:\n' + log
    );
  }
  return shader;
}

function createProgram(gl, vertexShaderSource, fragmentShaderSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('着色器程序链接失败:\n' + log);
  }

  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}
