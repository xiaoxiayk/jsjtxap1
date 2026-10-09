// js/gasket.js
// 几何生成模块（纯数据，不接触 WebGL）。
// 提供两种生成谢尔宾斯基垫片的算法：
//   1) 混沌游戏（Chaos Game / 随机迭代）—— 产生点集，对应 gl.POINTS；
//   2) 递归细分（Recursive Subdivision）—— 产生三角形列表，可导出为
//      点云 / 线框 / 实体三种图元顶点流。
// 扩展 E1：混沌游戏支持任意 n 边形（正五边形、正六边形……）。

// 顶点着色用的标量参数 t ∈ [0,1]：按顶点在 [-1,1]^2 包围盒中的
// 对角位置归一化，使配色在整个图形上呈现平滑的空间渐变。
function tOf(x, y) {
  const t = ((x + 1) * 0.5 + (y + 1) * 0.5) * 0.5;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

// 生成正 n 边形的 n 个顶点（单位圆上，第一个顶点朝正上方）
function polygonVertices(n, radius = 1) {
  const verts = [];
  const rotation = Math.PI / 2; // 使 n=3 时呈"尖端朝上"的经典三角形态
  for (let i = 0; i < n; i++) {
    const a = rotation + (i * 2 * Math.PI) / n;
    verts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return verts;
}

// ---- 算法一：混沌游戏 ----
// 初始点 p 随机取自单位圆盘内；反复执行 p <- (p + 随机顶点) / 2；
// 几何上它收敛到该 n 边形对应的自相似吸引子（n=3 时即谢尔宾斯基垫片）。
// warmup 步静默执行，用于跳过尚未收敛的暂态点，使画面更干净。
function chaosGame(n, count, warmup = 30) {
  const verts = polygonVertices(n);
  const positions = new Float32Array(count * 2);
  const t = new Float32Array(count);

  // 随机初始点（单位圆盘内均匀采样）
  const ang = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * 0.9;
  let px = r * Math.cos(ang);
  let py = r * Math.sin(ang);

  for (let i = 0; i < warmup; i++) {
    const v = verts[(Math.random() * n) | 0];
    px = (px + v[0]) * 0.5;
    py = (py + v[1]) * 0.5;
  }

  for (let i = 0; i < count; i++) {
    const v = verts[(Math.random() * n) | 0];
    px = (px + v[0]) * 0.5;
    py = (py + v[1]) * 0.5;
    positions[i * 2] = px;
    positions[i * 2 + 1] = py;
    t[i] = tOf(px, py);
  }

  return { positions, t, primitive: 'points', vertexCount: count };
}

// ---- 算法二：递归细分 ----
// subdivide(triangle, depth)：连接三边中点把三角形一分为四，
// 丢弃中间那个倒三角形，对剩余三个角三角形递归，即可逼近谢尔宾斯基垫片。
// 结果三角形个数 = 3^depth。
function subdivideRec(ax, ay, bx, by, cx, cy, depth, out) {
  if (depth <= 0) {
    out.push(ax, ay, bx, by, cx, cy);
    return;
  }
  const abx = (ax + bx) * 0.5, aby = (ay + by) * 0.5;
  const bcx = (bx + cx) * 0.5, bcy = (by + cy) * 0.5;
  const cax = (cx + ax) * 0.5, cay = (cy + ay) * 0.5;

  subdivideRec(ax, ay, abx, aby, cax, cay, depth - 1, out);
  subdivideRec(abx, aby, bx, by, bcx, bcy, depth - 1, out);
  subdivideRec(cax, cay, bcx, bcy, cx, cy, depth - 1, out);
}

// 返回递归细分后的扁平三角形列表：[ax,ay,bx,by,cx,cy, ...]
function subdivideTriangle(vertices, depth) {
  const out = [];
  subdivideRec(
    vertices[0][0], vertices[0][1],
    vertices[1][0], vertices[1][1],
    vertices[2][0], vertices[2][1],
    depth, out
  );
  return out;
}

// 统一入口：按生成算法与渲染模式产出 { positions, t, primitive, vertexCount }
//   generator: 'chaos' | 'subdivision'
//   mode:      'points' | 'lines' | 'triangles'（仅细分模式区分三种图元）
function buildSierpinski({ generator, mode, ngon, count, depth }) {
  if (generator === 'chaos') {
    return chaosGame(ngon, count);
  }

  const verts = polygonVertices(3);
  const tris = subdivideTriangle(verts, depth);
  const nTri = tris.length / 6;

  let positions, t, primitive;
  if (mode === 'points') {
    // 每个子三角形取 3 个顶点
    positions = new Float32Array(nTri * 6);
    t = new Float32Array(nTri * 3);
    for (let i = 0; i < nTri; i++) {
      for (let k = 0; k < 3; k++) {
        const x = tris[i * 6 + k * 2];
        const y = tris[i * 6 + k * 2 + 1];
        positions[i * 6 + k * 2] = x;
        positions[i * 6 + k * 2 + 1] = y;
        t[i * 3 + k] = tOf(x, y);
      }
    }
    primitive = 'points';
  } else if (mode === 'lines') {
    // 每个子三角形取 3 条边，共 6 个端点
    positions = new Float32Array(nTri * 12);
    t = new Float32Array(nTri * 6);
    for (let i = 0; i < nTri; i++) {
      const x0 = tris[i * 6], y0 = tris[i * 6 + 1];
      const x1 = tris[i * 6 + 2], y1 = tris[i * 6 + 3];
      const x2 = tris[i * 6 + 4], y2 = tris[i * 6 + 5];
      const edges = [
        [x0, y0, x1, y1],
        [x1, y1, x2, y2],
        [x2, y2, x0, y0],
      ];
      for (let s = 0; s < 3; s++) {
        for (let k = 0; k < 2; k++) {
          const vi = (i * 3 + s) * 2 + k;
          positions[vi * 2] = edges[s][k * 2];
          positions[vi * 2 + 1] = edges[s][k * 2 + 1];
          t[vi] = tOf(edges[s][k * 2], edges[s][k * 2 + 1]);
        }
      }
    }
    primitive = 'lines';
  } else {
    // 实体：每个子三角形 3 个顶点，作为独立三角形填充
    positions = new Float32Array(nTri * 6);
    t = new Float32Array(nTri * 3);
    for (let i = 0; i < nTri; i++) {
      for (let k = 0; k < 3; k++) {
        const x = tris[i * 6 + k * 2];
        const y = tris[i * 6 + k * 2 + 1];
        positions[i * 6 + k * 2] = x;
        positions[i * 6 + k * 2 + 1] = y;
        t[i * 3 + k] = tOf(x, y);
      }
    }
    primitive = 'triangles';
  }

  return { positions, t, primitive, vertexCount: t.length };
}
