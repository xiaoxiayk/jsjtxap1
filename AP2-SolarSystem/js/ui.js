// ============================================================
// ui.js —— 参数面板绑定 + 键盘交互 + HUD 状态
//   键盘：O 切换投影 · 空格 暂停/继续漫游 · T 漫游/手动 · R 重置视角
//         1/2/3 自由/日食/月食视角（E2） · V 轨迹球开关（E3）
// ============================================================

const params = {
    orbitSpeed: 1.0,
    spinSpeed: 1.0,
    earthTilt: 23.5,
    showOrbits: true,
    showAxis: true,
    showBelt: true,
    showStars: true,
    projection: 'persp',     // 'persp' | 'ortho'
    trackball: false,        // E3：轨迹球拖拽模式
};

let camera = null;           // 由 main.js 赋值

function initUI() {
    const $ = function (id) { return document.getElementById(id); };

    // ---- 滑条 ----
    $('s-orbit').addEventListener('input', function () {
        params.orbitSpeed = parseFloat(this.value);
        $('v-orbit').textContent = params.orbitSpeed.toFixed(1) + '×';
    });
    $('s-spin').addEventListener('input', function () {
        params.spinSpeed = parseFloat(this.value);
        $('v-spin').textContent = params.spinSpeed.toFixed(1) + '×';
    });
    $('s-tilt').addEventListener('input', function () {
        params.earthTilt = parseFloat(this.value);
        $('v-tilt').textContent = params.earthTilt.toFixed(1) + '°';
    });

    // ---- 显示开关 ----
    $('c-orbits').addEventListener('change', function () { params.showOrbits = this.checked; });
    $('c-axis').addEventListener('change',   function () { params.showAxis = this.checked; });
    $('c-belt').addEventListener('change',   function () { params.showBelt = this.checked; });
    $('c-stars').addEventListener('change',  function () { params.showStars = this.checked; });

    // ---- 按钮 ----
    $('b-proj').addEventListener('click', toggleProjection);
    $('b-tour').addEventListener('click', toggleTourMode);
    $('b-pause').addEventListener('click', function () { camera.togglePause(); });
    $('b-reset').addEventListener('click', function () { camera.reset(); });

    // E2 视角按钮 / E3 轨迹球按钮
    $('b-view-free').addEventListener('click', function () { camera.setEclipseView(null); });
    $('b-eclipse-solar').addEventListener('click', function () { camera.setEclipseView('solar'); });
    $('b-eclipse-lunar').addEventListener('click', function () { camera.setEclipseView('lunar'); });
    $('b-trackball').addEventListener('click', function () {
        camera.setTrackball(!params.trackball);
        this.classList.toggle('active', params.trackball);
    });

    // ---- 键盘 ----
    window.addEventListener('keydown', function (e) {
        switch (e.code) {
            case 'KeyO': toggleProjection(); break;
            case 'Space': e.preventDefault(); camera.togglePause(); break;   // 漫游暂停/继续
            case 'KeyT': toggleTourMode(); break;
            case 'KeyR': camera.reset(); break;
            case 'Digit1': case 'Numpad1': camera.setEclipseView(null); break;      // E2 自由
            case 'Digit2': case 'Numpad2': camera.setEclipseView('solar'); break;   // E2 日食
            case 'Digit3': case 'Numpad3': camera.setEclipseView('lunar'); break;   // E2 月食
            case 'KeyV':                                                            // E3 轨迹球
                camera.setTrackball(!params.trackball);
                document.getElementById('b-trackball').classList.toggle('active', params.trackball);
                break;
        }
    });

    // 相机模式变化 → 刷新 HUD
    onCameraModeChanged = function () {
        const camEl = $('hud-cam');
        if (camera.eclipseView === 'solar') {
            camEl.textContent = '日食视角（快进 ' + ECLIPSE.timeWarp + '×·凌日自动慢放）';
        } else if (camera.eclipseView === 'lunar') {
            camEl.textContent = '月食视角（快进 ' + ECLIPSE.timeWarp + '×·入影自动慢放）';
        } else if (params.trackball) {
            camEl.textContent = '轨迹球视角';
        } else if (camera.mode === 'tour') {
            camEl.textContent = camera.paused ? '漫游已暂停' : '漫游中';
        } else {
            camEl.textContent = '手动视角';
        }
    };
    onCameraModeChanged();
}

// ---- 投影切换（O 键 / 按钮）----
function toggleProjection() {
    params.projection = (params.projection === 'persp') ? 'ortho' : 'persp';
    document.getElementById('hud-proj').textContent =
        (params.projection === 'persp') ? '透视投影' : '正交投影';
}

// ---- 漫游 / 手动切换（T 键 / 按钮）----
function toggleTourMode() {
    if (camera.mode === 'tour') camera.takeOver();
    else { camera.paused = false; camera.enterTour(); }
    onCameraModeChanged();
}
