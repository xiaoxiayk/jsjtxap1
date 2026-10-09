// js/Common/MV.js
// 教材 Common 工具库中 MV.js 的 4x4 矩阵子集。
// 说明：本文件为参照教材 Angel & Shreiner《Interactive Computer Graphics》
// 配套 Common/MV.js 的同名 API 由本人自行实现（未复制原文件）。
//
// 约定：所有矩阵均以「列主序（column-major）」的 Float32Array(16) 存储，
// 与 WebGL 的 uniformMatrix4fv 直接兼容；矩阵左乘向量：v' = M * v。
// 元素 M[col][row] 存放于下标 (col * 4 + row)。

function mat4() {
  // 单位矩阵
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

// 矩阵乘法 c = a * b（列主序）
function mult(a, b) {
  const c = new Float32Array(16);
  for (let i = 0; i < 4; i++) {        // 结果矩阵的列
    for (let j = 0; j < 4; j++) {      // 结果矩阵的行
      c[i * 4 + j] =
        a[0 * 4 + j] * b[i * 4 + 0] +
        a[1 * 4 + j] * b[i * 4 + 1] +
        a[2 * 4 + j] * b[i * 4 + 2] +
        a[3 * 4 + j] * b[i * 4 + 3];
    }
  }
  return c;
}

// 返回 m * T(x,y,z)：右乘平移矩阵
function translate(m, x, y, z) {
  const t = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
  return mult(m, t);
}

// 返回 m * S(sx,sy,sz)：右乘缩放矩阵
function scale(m, sx, sy, sz) {
  const s = new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    0, 0, 0, 1,
  ]);
  return mult(m, s);
}

// 正交投影矩阵（2D 场景下仅取其线性部分也可）
function ortho(left, right, bottom, top, near, far) {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
  return new Float32Array([
    -2 * lr, 0, 0, 0,
    0, -2 * bt, 0, 0,
    0, 0, 2 * nf, 0,
    (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1,
  ]);
}
