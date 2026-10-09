// js/colors.js
// 配色方案：每个方案是一个 t -> [r,g,b] 的映射，t ∈ [0,1]，输出各分量 ∈ [0,1]。
// 所有方案均设计为「t 小 → 暗，t 大 → 亮」，因此既可用于谢尔宾斯基的
// 位置渐变着色（左下暗、右上亮），也可直接用于 Mandelbrot 的迭代次数着色
// （远离集合暗、靠近边界亮）。
//
// 渲染端把配色烘培成一张 512x1 的查找表纹理（LUT），片元着色器按 t 采样，
// 这样切换配色无需重建几何 / 顶点颜色缓冲。

function hsv2rgb(h, s, v) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return [r, g, b];
}

const PALETTES = [
  {
    name: '青瓷流光',
    fn: (t) => hsv2rgb(0.46 + 0.14 * t, 0.70, 0.34 + 0.66 * Math.pow(t, 0.6)),
  },
  {
    name: '霓虹彩虹',
    fn: (t) => hsv2rgb(0.02 + 0.72 * t, 0.85, 0.38 + 0.62 * Math.pow(t, 0.6)),
  },
  {
    name: '熔岩蓝橙',
    fn: (t) => hsv2rgb(0.62 - 0.62 * t, 0.85, 0.36 + 0.64 * Math.pow(t, 0.6)),
  },
  {
    name: '翡翠单色',
    fn: (t) => hsv2rgb(0.40, 0.55, 0.28 + 0.72 * Math.pow(t, 0.7)),
  },
  {
    name: '星尘紫晶',
    fn: (t) => hsv2rgb(0.76 + 0.16 * t, 0.55, 0.32 + 0.68 * Math.pow(t, 0.7)),
  },
];

const LUT_SIZE = 512;

// 把某个配色方案烘培为 Uint8Array(LUT_SIZE * 4) 的 RGBA 纹理数据
function buildLutData(paletteIndex) {
  const palette = PALETTES[paletteIndex] || PALETTES[0];
  const data = new Uint8Array(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    const [r, g, b] = palette.fn(t);
    data[i * 4 + 0] = Math.max(0, Math.min(255, Math.round(r * 255)));
    data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    data[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
    data[i * 4 + 3] = 255;
  }
  return data;
}
