// ============================================================
// ui.js —— 参数面板绑定 + 键盘交互 + HUD 状态
//   键盘：O 切换投影 · 空格 暂停/继续漫游 · T 漫游/手动 · R 重置视角
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

    // ---- 键盘 ----
    window.addEventListener('keydown', function (e) {
        switch (e.code) {
            case 'KeyO': toggleProjection(); break;
            case 'Space': e.preventDefault(); camera.togglePause(); break;   // 漫游暂停/继续
            case 'KeyT': toggleTourMode(); break;
            case 'KeyR': camera.reset(); break;
        }
    });

    // 相机模式变化 → 刷新 HUD
    onCameraModeChanged = function () {
        const camEl = $('hud-cam');
        if (camera.mode === 'tour') {
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
