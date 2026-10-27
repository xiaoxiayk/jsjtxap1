// ============================================================
// main.js —— WebGL 2.0 初始化、纹理加载、渲染循环
// ============================================================

let gl, canvas;
let progTex, progFlat, progBelt;
let uTex = {}, uFlat = {}, uBelt = {};      // uniform 位置缓存

// 几何对象
let sunVAO, planetVAO, moonVAO, starVAO, ringVAO;
let orbitLineVAO, moonOrbitLineVAO, earthAxisVAO, beltVAO, umbraVAO;

// 纹理表
const textures = {};

window.onload = function () {
    canvas = document.getElementById('gl-canvas');
    gl = canvas.getContext('webgl2');
    if (!gl) {
        alert('当前浏览器不支持 WebGL 2.0，请使用新版 Chrome / Edge / Firefox / Safari。');
        return;
    }

    // ---- 着色器程序（教材配套 initShaders，从 script 标签读取源码）----
    progTex  = initShaders(gl, 'vertex-tex',  'fragment-tex');
    progFlat = initShaders(gl, 'vertex-flat', 'fragment-flat');
    progBelt = initShaders(gl, 'vertex-belt', 'fragment-belt');

    uTex = uniforms(progTex,  ['uModel', 'uView', 'uProj', 'uNormalMat', 'uTexMap',
                               'uLightPos', 'uEyePos', 'uAmbient',
                               'uEmissive', 'uShininess', 'uSpecular', 'uEclipse']);
    uFlat = uniforms(progFlat, ['uModel', 'uView', 'uProj', 'uColor', 'uPointSize']);
    uBelt = uniforms(progBelt, ['uView', 'uProj', 'uSimTime', 'uColor', 'uPointSize']);

    // ---- 几何与 VAO ----
    sunVAO        = buildTexturedVAO(gl, progTex, createSphereData(48, 64));
    planetVAO     = buildTexturedVAO(gl, progTex, createSphereData(32, 48));
    moonVAO       = buildTexturedVAO(gl, progTex, createSphereData(24, 32));
    starVAO       = buildTexturedVAO(gl, progTex, createSphereData(24, 36));
    ringVAO       = buildTexturedVAO(gl, progTex, createRingData(1.0, 2.35, 160));

    orbitLineVAO  = buildFlatVAO(gl, progFlat, createCircleLineData(256));
    moonOrbitLineVAO = orbitLineVAO;
    earthAxisVAO  = buildFlatVAO(gl, progFlat, createAxisLineData(1));
    umbraVAO      = buildFlatVAO(gl, progFlat,
                      createUmbraConeData(EARTH.radius, MOON.dist * ECLIPSE.umbraLenMul, 48));
    beltVAO       = buildBeltVAO(gl, progBelt,
                      createBeltData(ASTEROID_BELT.count, ASTEROID_BELT.rMin,
                                     ASTEROID_BELT.rMax, ASTEROID_BELT.ySpread));

    // ---- 纹理 ----
    textures.sun    = loadTexture(SUN.texture);
    textures.moon   = loadTexture(MOON.texture);
    textures.stars  = loadTexture('textures/2k_stars_milky_way.jpg');
    textures.ring   = loadTexture(PLANETS[5].ring.texture, false);
    PLANETS.forEach(function (p) { textures[p.name] = loadTexture(p.texture); });

    // ---- 相机 / UI ----
    camera = new OrbitCamera(canvas);
    initUI();

    window.addEventListener('resize', resize);
    resize();

    // ---- 渲染循环 ----
    let last = performance.now();
    let simTime = 0, spinTime = 0;

    function frame(now) {
        let dt = (now - last) / 1000;
        if (!isFinite(dt) || dt < 0) dt = 0;      // 个别环境首帧时间戳可能异常
        dt = Math.min(dt, 0.1);
        last = now;
        // E2：日食/月食视角下自动快进，减少等待日月对齐的干等时间；
        // 月食视角一旦检测到入影（上一帧食分>0.02）立即切慢放，血月过程清晰可见
        let warp = camera.eclipseView ? ECLIPSE.timeWarp : 1.0;
        if (camera.eclipseView === 'lunar' && window.__lastEclipse > 0.02) {
            warp = ECLIPSE.eclipseSlowMo;
        }
        simTime  += dt * params.orbitSpeed * warp;   // 公转时钟（受公转速度倍率与视角快进）
        spinTime += dt * params.spinSpeed;           // 自转时钟（受自转速度倍率）
        const scene = buildSceneModelMatrices(simTime, spinTime, params.earthTilt);
        window.__lastScene = scene;   // 调试接口：控制台可查看每帧的层级矩阵
        camera.update(dt, scene);     // E2 专用机位需要地球/月球的实时位置
        render(scene, simTime);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
};

// ============================================================
// 渲染
// ============================================================

function render(scene, simTime) {
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.008, 0.008, 0.02, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);            // 星空球自内部观看；凸球体由深度测试消隐
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = canvas.width / canvas.height;
    const view = camera.viewMatrix();
    const proj = camera.projectionMatrix(aspect, params.projection);
    const eye = camera.eye();

    // ---- E2 月食系数：月球方向与"背日方向"夹角越小，进入地影越深 ----
    // 太阳位于世界原点，背日方向 = normalize(地球位置)；norm3 不改写共享的 earthPos
    const antiSun = norm3(scene.earthPos);
    const moonDir = norm3(vecSub(scene.moonPos, scene.earthPos));
    const lunarEclipse = smoothstep(ECLIPSE.lunarFadeStart, ECLIPSE.lunarFadeFull,
                                    dot(moonDir, antiSun));
    window.__lastEclipse = lunarEclipse;   // 调试/验收接口：控制台查看当前月食系数

    // 1) 星空背景：自发光、不写深度（最先绘制，只作背景）
    if (params.showStars) {
        gl.depthMask(false);
        drawTextured(starVAO, textures.stars,
            scalem(STAR_SPHERE_RADIUS, STAR_SPHERE_RADIUS, STAR_SPHERE_RADIUS),
            { emissive: 1.0 });
        gl.depthMask(true);
    }

    // 2) 小行星带：轨道运动在顶点着色器内计算（gl.POINTS）
    if (params.showBelt) {
        gl.useProgram(progBelt);
        gl.bindVertexArray(beltVAO.vao);
        gl.uniformMatrix4fv(uBelt.uView, false, flatten(view));
        gl.uniformMatrix4fv(uBelt.uProj, false, flatten(proj));
        gl.uniform1f(uBelt.uSimTime, simTime);
        gl.uniform1f(uBelt.uPointSize, 2.2);
        gl.uniform4f(uBelt.uColor, 0.72, 0.68, 0.6, 1.0);
        gl.drawArrays(gl.POINTS, 0, beltVAO.count);
        gl.bindVertexArray(null);
    }

    // 3) 太阳：自发光（不受光照）
    drawTextured(sunVAO, textures.sun, scene.sunModel, { emissive: 1.0 });

    // 4) 行星：Phong 光照（点光源 = 太阳，位于世界原点）
    scene.planets.forEach(function (p) {
        drawTextured(planetVAO, textures[p.cfg.name], p.model,
            { emissive: 0.0, shininess: 14, specular: 0.10 });

        // 土星环：半透明、双面、环境光加成以免侧对光源时全黑
        if (p.cfg.ring) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            drawTextured(ringVAO, textures.ring, scene.ring.ringModel,
                { emissive: 0.0, ambient: [0.55, 0.52, 0.48], shininess: 4, specular: 0.0 });
            gl.depthMask(true);
            gl.disable(gl.BLEND);
        }
    });

    // 5) 月球：挂在地球公转坐标系下的第四级变换；uEclipse 驱动"血月"变红变暗
    drawTextured(moonVAO, textures.moon, scene.moon.model,
        { emissive: 0.0, shininess: 6, specular: 0.04, eclipse: lunarEclipse });

    // 6) 轨道线 / 地轴线：半透明叠加，画在实体之后（深度测试开着，不写深度）
    gl.useProgram(progFlat);
    gl.uniformMatrix4fv(uFlat.uView, false, flatten(view));
    gl.uniformMatrix4fv(uFlat.uProj, false, flatten(proj));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    if (params.showOrbits) {
        gl.bindVertexArray(orbitLineVAO.vao);
        gl.uniform1f(uFlat.uPointSize, 1.0);
        gl.uniform4fv(uFlat.uColor, ORBIT_LINE_COLOR);
        scene.orbitLines.forEach(function (o) {
            gl.uniformMatrix4fv(uFlat.uModel, false, flatten(o.model));
            gl.drawArrays(gl.LINES, 0, orbitLineVAO.count);
        });
        // 月球轨道线（倾面）：手动矩阵的直观可视化
        gl.bindVertexArray(moonOrbitLineVAO.vao);
        gl.uniform4fv(uFlat.uColor, MOON_ORBIT_LINE_COLOR);
        gl.uniformMatrix4fv(uFlat.uModel, false, flatten(scene.moonOrbitLine.model));
        gl.drawArrays(gl.LINES, 0, moonOrbitLineVAO.count);
    }

    if (params.showAxis) {
        gl.bindVertexArray(earthAxisVAO.vao);
        gl.uniform4fv(uFlat.uColor, EARTH_AXIS_COLOR);
        gl.uniformMatrix4fv(uFlat.uModel, false, flatten(scene.earthAxis.model));
        gl.drawArrays(gl.LINES, 0, earthAxisVAO.count);
    }

    // E2 地影本影锥：月食视角下常显（便于理解几何），其他视角仅在发生月食时浮现
    if (camera.eclipseView === 'lunar' || lunarEclipse > 0.01) {
        gl.bindVertexArray(umbraVAO.vao);
        gl.uniform4f(uFlat.uColor, 0.0, 0.0, 0.05,
                     ECLIPSE.umbraAlpha + 0.24 * lunarEclipse);
        gl.uniformMatrix4fv(uFlat.uModel, false, flatten(scene.umbraCone.model));
        gl.drawArrays(gl.TRIANGLES, 0, umbraVAO.count);
        gl.bindVertexArray(null);
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
}

// ---- 带纹理物体的绘制 ----
function drawTextured(vao, texObj, model, opt) {
    opt = opt || {};
    gl.useProgram(progTex);
    gl.bindVertexArray(vao.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texObj);
    gl.uniform1i(uTex.uTexMap, 0);

    gl.uniformMatrix4fv(uTex.uModel, false, flatten(model));
    gl.uniformMatrix4fv(uTex.uView, false, flatten(camera.viewMatrix()));
    gl.uniformMatrix4fv(uTex.uProj, false,
        flatten(camera.projectionMatrix(canvas.width / canvas.height, params.projection)));
    gl.uniformMatrix3fv(uTex.uNormalMat, false, flatten(normalMatrix(model, true)));

    gl.uniform3fv(uTex.uLightPos, [0, 0, 0]);          // 太阳 = 世界原点点光源
    gl.uniform3fv(uTex.uEyePos, camera.eye());
    gl.uniform3fv(uTex.uAmbient, opt.ambient || [0.07, 0.07, 0.10]);
    gl.uniform1f(uTex.uEmissive, opt.emissive || 0.0);
    gl.uniform1f(uTex.uShininess, opt.shininess || 12.0);
    gl.uniform1f(uTex.uSpecular, opt.specular || 0.1);
    gl.uniform1f(uTex.uEclipse, opt.eclipse || 0.0);   // E2：月食系数（仅月球>0）

    gl.drawElements(gl.TRIANGLES, vao.count, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
}

// ============================================================
// 纹理加载
// ============================================================
// 关键点：图像坐标系原点在左上角，纹理 UV 原点在左下角。
// 上传前设置 UNPACK_FLIP_Y_WEBGL = true 让 WebGL 在上传时垂直翻转，
// 否则地球 / 月球贴图会上下颠倒（北半球在下方）。详见 README。
function loadTexture(url, repeat) {
    if (repeat === undefined) repeat = true;

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // 先填一个 1×1 占位像素，图片异步加载完成前程序照常运行
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([90, 90, 110, 255]));

    // 加载失败自动重试（最多 3 次），应对公网访问时的网络抖动
    let attempts = 0;
    function tryLoad() {
        attempts++;
        const image = new Image();
        image.onload = function () {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);          // ★ 垂直翻转
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        };
        image.onerror = function () {
            if (attempts < 3) setTimeout(tryLoad, 1500 * attempts);
        };
        image.src = url;
    }
    tryLoad();
    return tex;
}

// ============================================================
// 工具
// ============================================================

function uniforms(prog, names) {
    const o = {};
    names.forEach(function (n) { o[n] = gl.getUniformLocation(prog, n); });
    return o;
}

// 平滑过渡（E2 月食系数用）：edge0→edge1 之间 0→1，Hermite 缓动
function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
    }
}
