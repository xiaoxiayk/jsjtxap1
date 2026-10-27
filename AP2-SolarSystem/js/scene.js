// ============================================================
// scene.js —— 层级建模：模型矩阵逐层相乘（对应教材 Ch4–5、Ch9 思想）
//
// 变换嵌套树（自顶向下）：
//
//   太阳系（世界坐标系）
//   ├── 太阳  M_sun = R_y(spin_sun) · S(r_sun)
//   ├── 行星 i
//   │     M_orbit_i = R_y(θ_i) · T(d_i, 0, 0)                    ← 公转
//   │     M_i = M_orbit_i · R_z(tilt_i) · R_y(spin_i) · S(r_i)
//   │           └── 土星环  M_ring = M_orbit_sat · R_z(26.7°) · R_x(90°) · S(r_sat)
//   └── 地球分支
//         M_earth = M_orbit_e · R_z(tilt) · R_y(spin_e) · S(r_e)
//               ├── 地轴线  M_axis = M_orbit_e · R_z(tilt)
//               └── 月球
//                     M_moonOrbit = M_orbit_e · M_tilt_manual · R_y(θ_m) · T(d_m,0,0)
//                     M_moon = M_moonOrbit · R_y(spin_m) · S(r_m)
//
// 关键点 1（地球轴倾角）：先在地球自身的模型矩阵上施加倾角旋转 R_z(tilt)，
// 再在其外侧叠加公转轨道变换 M_orbit —— "倾角先转、公转后挂"，
// 顺序颠倒则倾斜将被平移/公转吞掉，体会"变换顺序决定结构"。
//
// 关键点 2（手动矩阵）：月球轨道面倾斜 M_tilt_manual 不调用工具库封装的
// rotate(angle, axis) 复合函数，而是用 MV.js 基本变换 rotateX/rotateY 与 mult
// 手工共轭组合而成（推导见 README）：
//     M_tilt_manual = R_y(-Ω) · R_x(i) · R_y(Ω)
// ============================================================

// 弧度 → 角度（MV.js 的 rotateX/Y/Z 均以角度为单位）
function deg(a) { return a * 180 / Math.PI; }

// 行星公转角速度：开普勒第三定律 ω = K / d^(3/2)（rad/s，1× 速度）
function orbitalOmega(dist) {
    return KEPLER_K / Math.pow(dist, 1.5);
}

// 自转角：周期可为负（逆向自转）
function spinAngle(period, spinTime) {
    return period ? 2 * Math.PI * spinTime / period : 0;
}

function buildSceneModelMatrices(simTime, spinTime, earthTiltDeg) {
    const scene = {};

    // ---------- 太阳 ----------
    scene.sunModel = mult(
        rotateY(deg(spinAngle(SUN.spinPeriod, spinTime))),
        scalem(SUN.radius, SUN.radius, SUN.radius)
    );

    // ---------- 行星 ----------
    scene.planets = PLANETS.map(function (p) {
        // 公转：先平移到轨道半径处，再绕 Y 转过公转角（复合在同一矩阵中）
        const theta = orbitalOmega(p.dist) * simTime;
        const orbitModel = mult(
            rotateY(deg(theta)),
            translate(p.dist, 0, 0)
        );

        // 自身模型：倾角先转（R_z），自转再转（R_y），最后缩放；
        // 公转矩阵在外侧逐层相乘 —— 层级建模的核心
        const tilt = (p === EARTH) ? earthTiltDeg : p.tilt;
        const model = mult(orbitModel, mult(
            rotateZ(tilt), mult(
                rotateY(deg(spinAngle(p.spinPeriod, spinTime))),
                scalem(p.radius, p.radius, p.radius))));

        // 土星环：挂在土星公转坐标系下，随轴倾角倾斜、位于行星赤道面
        let ringModel = null;
        if (p.ring) {
            ringModel = mult(orbitModel, mult(
                rotateZ(tilt), mult(
                    rotateX(90),
                    scalem(p.radius, p.radius, p.radius))));
        }

        return { cfg: p, orbitModel: orbitModel, model: model, ringModel: ringModel };
    });

    // ---------- 手动矩阵：月球轨道面倾斜 ----------
    // 绕"节点线" n = (cos Ω, 0, sin Ω) 把月球轨道面倾斜 i 角。
    // 不使用封装好的 rotate(angle, axis)，而是共轭分解为三次基本旋转：
    //   1) R_y(Ω)   把节点线对齐到 X 轴
    //   2) R_x(i)   绕 X 轴倾斜轨道面
    //   3) R_y(-Ω)  把节点线转回原方位
    // 即 M_tilt = R_y(-Ω) · R_x(i) · R_y(Ω)，逐层 mult 手工组合。
    const i = MOON.inclination, Omega = MOON.nodeLon;
    const moonTiltManual = mult(
        rotateY(-Omega),
        mult(rotateX(i), rotateY(Omega))
    );
    scene.moonTiltManual = moonTiltManual;

    const earthEntry = scene.planets[PLANETS.indexOf(EARTH)];
    const earthOrbit = earthEntry.orbitModel;

    // 月球公转（挂在地球公转坐标系之内）：倾斜轨道面 → 沿轨道公转 → 推出到轨道半径
    const moonTheta = 2 * Math.PI * simTime / MOON.orbitPeriod;   // 随公转速度倍率缩放
    const moonOrbitModel = mult(earthOrbit, mult(
        moonTiltManual, mult(
            rotateY(deg(moonTheta)),
            translate(MOON.dist, 0, 0))));

    // 月球自转：潮汐锁定，自转周期 = 公转周期
    scene.moon = {
        cfg: MOON,
        orbitModel: moonOrbitModel,
        model: mult(moonOrbitModel, mult(
            rotateY(deg(spinAngle(MOON.orbitPeriod, spinTime))),
            scalem(MOON.radius, MOON.radius, MOON.radius))),
    };

    // ---------- 土星环模型（取自行星循环中已构造的矩阵）----------
    scene.ring = scene.planets.find(function (e) { return e.ringModel; });

    // ---------- 地轴线（直观展示 23.5° 倾角）----------
    scene.earthAxis = {
        model: mult(earthOrbit, rotateZ(earthTiltDeg)),
        halfLen: EARTH.radius * 1.9,
    };

    // ---------- 轨道线（单位圆 × 轨道半径）----------
    scene.orbitLines = PLANETS.map(function (p) {
        return { cfg: p, model: scalem(p.dist, p.dist, p.dist) };
    });
    scene.moonOrbitLine = {
        model: mult(earthOrbit, mult(moonTiltManual,
            scalem(MOON.dist, MOON.dist, MOON.dist))),
    };

    return scene;
}
