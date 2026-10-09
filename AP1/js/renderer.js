// js/renderer.js
// 渲染模块：封装 WebGL 2.0 资源（着色器程序、顶点缓冲、配色 LUT 纹理）
// 与两套绘制路径：
//   A. 谢尔宾斯基（点云 / 线框 / 实体）—— 逐顶点属性 a_Position + a_T
//   B. 复平面分形（Mandelbrot / Julia）—— 全屏四边形 + 片元着色器逐像素迭代
// 两套路径共用同一张配色查找表纹理（LUT），因此切换配色风格完全一致。

// ---------- 着色器源码（GLSL ES 3.00）----------

const GASKET_VS = `#version 300 es
in vec2 a_Position;
in float a_T;
uniform mat4 u_Transform;
uniform float u_PointSize;
out float v_T;
void main() {
  gl_Position = u_Transform * vec4(a_Position, 0.0, 1.0);
  gl_PointSize = u_PointSize;
  v_T = a_T;
}`;

const GASKET_FS = `#version 300 es
precision mediump float;
in float v_T;
uniform sampler2D u_Lut;
uniform int u_IsPoints;
out vec4 outColor;
void main() {
  if (u_IsPoints == 1) {
    // 用 gl_PointCoord 把方形点裁成圆点
    vec2 d = gl_PointCoord - vec2(0.5);
    if (dot(d, d) > 0.25) discard;
  }
  vec3 c = texture(u_Lut, vec2(clamp(v_T, 0.0, 1.0), 0.5)).rgb;
  outColor = vec4(c, 1.0);
}`;

const FIELD_VS = `#version 300 es
in vec2 a_Position;
out vec2 v_Pos;
void main() {
  v_Pos = a_Position;
  gl_Position = vec4(a_Position, 0.0, 1.0);
}`;

const FIELD_FS = `#version 300 es
precision highp float;
in vec2 v_Pos;
uniform vec2 u_Center;
uniform float u_ViewSize;
uniform float u_Aspect;
uniform int u_MaxIter;
uniform int u_Julia;
uniform vec2 u_JuliaC;
uniform sampler2D u_Lut;
out vec4 outColor;

void main() {
  // 由全屏四边形的裁剪坐标反算复平面坐标
  vec2 z0 = u_Center + vec2(v_Pos.x * u_ViewSize * u_Aspect, v_Pos.y * u_ViewSize);
  vec2 c = (u_Julia == 1) ? u_JuliaC : z0;
  vec2 z = (u_Julia == 1) ? z0 : vec2(0.0);

  float n = 0.0;
  bool escaped = false;
  for (int i = 0; i < 1024; i++) {
    if (i >= u_MaxIter) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    n += 1.0;
    if (dot(z, z) > 4.0) { escaped = true; break; }
  }

  if (!escaped) {
    // 集合内部：极暗底色
    outColor = vec4(0.015, 0.02, 0.035, 1.0);
    return;
  }

  // 逃逸越快越暗、越靠近边界越亮
  float t = sqrt(clamp(n / float(u_MaxIter), 0.0, 1.0));
  vec3 col = texture(u_Lut, vec2(t, 0.5)).rgb;
  outColor = vec4(col, 1.0);
}`;

function uniformLocations(gl, program, names) {
  const map = {};
  for (const name of names) map[name] = gl.getUniformLocation(program, name);
  return map;
}

class Renderer {
  constructor(gl) {
    this.gl = gl;
    this.dpr = 1;
    this.lastDrawCount = 0;
    this.lastIter = 0;
    this.primitive = 'points';
    this.vertexCount = 0;

    // ---- 程序 A：谢尔宾斯基 ----
    const gProgram = createProgram(gl, GASKET_VS, GASKET_FS);
    this.gasket = {
      program: gProgram,
      aPosition: gl.getAttribLocation(gProgram, 'a_Position'),
      aT: gl.getAttribLocation(gProgram, 'a_T'),
      u: uniformLocations(gl, gProgram, ['u_Transform', 'u_PointSize', 'u_IsPoints', 'u_Lut']),
    };

    // ---- 程序 B：复平面分形 ----
    const fProgram = createProgram(gl, FIELD_VS, FIELD_FS);
    this.field = {
      program: fProgram,
      aPosition: gl.getAttribLocation(fProgram, 'a_Position'),
      u: uniformLocations(gl, fProgram, [
        'u_Center', 'u_ViewSize', 'u_Aspect', 'u_MaxIter', 'u_Julia', 'u_JuliaC', 'u_Lut',
      ]),
    };

    // ---- 缓冲对象 ----
    this.positionBuffer = gl.createBuffer();
    this.tBuffer = gl.createBuffer();
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    // ---- 配色 LUT 纹理 ----
    this.lutTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.paletteIndex = -1;

    gl.clearColor(0.024, 0.043, 0.075, 1.0);
  }

  setViewport(width, height, dpr) {
    this.dpr = dpr;
    this.gl.viewport(0, 0, width, height);
  }

  // 上传几何数据（位置向量 + 着色参数 t）
  setGeometry(geom) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geom.positions, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.tBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geom.t, gl.DYNAMIC_DRAW);

    this.vertexCount = geom.vertexCount;
    this.primitive = geom.primitive;
  }

  setPalette(index) {
    if (index === this.paletteIndex) return;
    const gl = this.gl;
    const data = buildLutData(index);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, LUT_SIZE, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    this.paletteIndex = index;
  }

  draw(state, camera, progress) {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);

    const isField = state.fractalType === 'mandelbrot' || state.fractalType === 'julia';
    if (isField) {
      this.drawField(state, camera, progress);
    } else {
      this.drawGasket(state, camera, progress);
    }
  }

  drawGasket(state, camera, progress) {
    const gl = this.gl;
    const P = this.gasket;
    gl.useProgram(P.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(P.aPosition);
    gl.vertexAttribPointer(P.aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.tBuffer);
    gl.enableVertexAttribArray(P.aT);
    gl.vertexAttribPointer(P.aT, 1, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix4fv(P.u.u_Transform, false, camera.matrix());
    gl.uniform1f(P.u.u_PointSize, state.pointSize * this.dpr);
    gl.uniform1i(P.u.u_IsPoints, this.primitive === 'points' ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
    gl.uniform1i(P.u.u_Lut, 0);

    // 生长动画：只绘制前 count 个顶点；线框按 2、实体按 3 对齐到完整图元
    let n = Math.floor(this.vertexCount * Math.max(0, Math.min(1, progress)));
    let mode = gl.POINTS;
    if (this.primitive === 'lines') {
      mode = gl.LINES;
      n -= n % 2;
    } else if (this.primitive === 'triangles') {
      mode = gl.TRIANGLES;
      n -= n % 3;
    }

    this.lastDrawCount = Math.max(0, n);
    if (n > 0) gl.drawArrays(mode, 0, n);
  }

  drawField(state, camera, progress = 1) {
    const gl = this.gl;
    const P = this.field;
    gl.useProgram(P.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(P.aPosition);
    gl.vertexAttribPointer(P.aPosition, 2, gl.FLOAT, false, 0, 0);

    // 生长动画：迭代上限随进度从 1 增长到设定值，逐层显现边界细节
    const p = Math.max(0, Math.min(1, progress));
    const iter = Math.max(1, Math.round(p * state.maxIter));
    this.lastIter = iter;

    gl.uniform2fv(P.u.u_Center, camera.center);
    gl.uniform1f(P.u.u_ViewSize, camera.viewSize);
    gl.uniform1f(P.u.u_Aspect, camera.aspect);
    gl.uniform1i(P.u.u_MaxIter, iter);
    gl.uniform1i(P.u.u_Julia, state.fractalType === 'julia' ? 1 : 0);
    gl.uniform2fv(P.u.u_JuliaC, state.juliaC);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
    gl.uniform1i(P.u.u_Lut, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.lastDrawCount = 0;
  }
}
