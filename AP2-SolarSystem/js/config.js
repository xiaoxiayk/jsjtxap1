// ============================================================
// config.js —— 天体参数集中配置（半径 / 轨道半径 / 周期 / 轴倾角）
// 长度单位：场景单位；周期单位：秒（1× 速度下）
// 负的自转周期 / >90° 的轴倾角表示逆向自转（金星、天王星）
// ============================================================

const SUN = {
    name: '太阳',
    radius: 8,
    spinPeriod: 30,
    texture: 'textures/2k_sun.jpg',
};

const PLANETS = [
    { name: '水星',   radius: 0.90, dist: 18,  spinPeriod: 40,  tilt: 0.03, texture: 'textures/2k_mercury.jpg' },
    { name: '金星',   radius: 1.55, dist: 26,  spinPeriod: 60,  tilt: 177.4, texture: 'textures/2k_venus_atmosphere.jpg' },
    { name: '地球',   radius: 2.00, dist: 36,  spinPeriod: 9,   tilt: 23.5, texture: 'textures/2k_earth_daymap.jpg' }, // 倾角由面板滑条控制
    { name: '火星',   radius: 1.25, dist: 47,  spinPeriod: 9.3, tilt: 25.2, texture: 'textures/2k_mars.jpg' },
    { name: '木星',   radius: 4.80, dist: 68,  spinPeriod: 4.2, tilt: 3.1,  texture: 'textures/2k_jupiter.jpg' },
    { name: '土星',   radius: 4.10, dist: 92,  spinPeriod: 4.6, tilt: 26.7, texture: 'textures/2k_saturn.jpg',
      ring: { inner: 1.25, outer: 2.35, texture: 'textures/2k_saturn_ring_alpha.png' } },
    { name: '天王星', radius: 2.90, dist: 112, spinPeriod: 6.2, tilt: 97.8, texture: 'textures/2k_uranus.jpg' },
    { name: '海王星', radius: 2.80, dist: 128, spinPeriod: 6.6, tilt: 28.3, texture: 'textures/2k_neptune.jpg' },
];

const EARTH = PLANETS[2];

const MOON = {
    name: '月球',
    radius: 0.55,
    dist: 5.5,
    orbitPeriod: 15,    // 绕地球一圈 15 秒（1×）
    inclination: 5.14,  // 轨道面相对黄道面倾角（白道角）
    nodeLon: 125.0,     // 升交点经度（手动矩阵的旋转轴方位角）
    texture: 'textures/2k_moon.jpg',
};

// 开普勒第三定律：ω = K / d^(3/2)，令 1× 速度下地球公转约 45 秒
const KEPLER_K = 30.0;

const ASTEROID_BELT = {
    count: 1500,
    rMin: 54,          // 位于火星(47)与木星(68)轨道之间
    rMax: 63,
    ySpread: 1.6,
};

const STAR_SPHERE_RADIUS = 900;

// 每条轨道线的显示颜色（RGBA）
const ORBIT_LINE_COLOR = [0.62, 0.72, 0.95, 0.38];
const MOON_ORBIT_LINE_COLOR = [0.95, 0.88, 0.62, 0.5];
const EARTH_AXIS_COLOR = [0.35, 0.9, 1.0, 0.85];
