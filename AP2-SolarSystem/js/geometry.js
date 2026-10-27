// ============================================================
// geometry.js —— 参数化几何数据生成
//   UV 球体（位图纹理映射）、土星环（径向 UV）、
//   轨道圆（线段）、地轴线、小行星带（轨道参数点集）
// ============================================================

// ---- UV 球体 ----
// i: 纬度带 0(北极)→stacks(南极)，j: 经度 0→slices
// 纹理坐标 v = 1 - i/stacks：v=1 对应北极。
// 配合上传纹理时的 UNPACK_FLIP_Y_WEBGL，图像首行（地图北方）落在 v=1，
// 地球北半球才会显示在球体上方（详见 README）。
function createSphereData(stacks, slices) {
    const positions = [], normals = [], texCoords = [], indices = [];

    for (let i = 0; i <= stacks; ++i) {
        const theta = i * Math.PI / stacks;      // 极角 0→π
        const sinT = Math.sin(theta), cosT = Math.cos(theta);
        for (let j = 0; j <= slices; ++j) {
            const phi = j * 2 * Math.PI / slices;
            const x = sinT * Math.cos(phi), y = cosT, z = sinT * Math.sin(phi);
            positions.push(x, y, z);
            normals.push(x, y, z);               // 单位球：法线 = 位置
            texCoords.push(j / slices, 1 - i / stacks);
        }
    }
    for (let i = 0; i < stacks; ++i) {
        for (let j = 0; j < slices; ++j) {
            const a = i * (slices + 1) + j;
            const b = a + slices + 1;
            indices.push(a, b, a + 1,  b, b + 1, a + 1);
        }
    }
    return { positions, normals, texCoords, indices };
}

// ---- 土星环：XY 平面内的圆环（之后经 R_x(90°) 放到行星赤道面）----
// u 沿半径方向 0(内缘)→1(外缘)，对应 ring_alpha 贴图的横向条带
function createRingData(inner, outer, segments) {
    const positions = [], normals = [], texCoords = [], indices = [];

    for (let j = 0; j <= segments; ++j) {
        const a = j * 2 * Math.PI / segments;
        const c = Math.cos(a), s = Math.sin(a);
        positions.push(inner * c, inner * s, 0,   outer * c, outer * s, 0);
        normals.push(0, 0, 1,  0, 0, 1);
        texCoords.push(0, 0.5,  1, 0.5);
    }
    for (let j = 0; j < segments; ++j) {
        const a = 2 * j, b = a + 1, c = a + 2, d = a + 3;
        indices.push(a, c, b,  b, c, d);
    }
    return { positions, normals, texCoords, indices };
}

// ---- 轨道线：XZ 平面单位圆（线段对），由模型矩阵缩放到各轨道半径 ----
function createCircleLineData(segments) {
    const positions = [];
    for (let j = 0; j < segments; ++j) {
        const a0 = j * 2 * Math.PI / segments;
        const a1 = (j + 1) * 2 * Math.PI / segments;
        positions.push(Math.cos(a0), 0, Math.sin(a0),
                       Math.cos(a1), 0, Math.sin(a1));
    }
    return { positions };
}

// ---- 地轴线：沿局部 Y 轴的线段（挂在"倾角旋转"之后的地球坐标系里）----
function createAxisLineData(halfLen) {
    return { positions: [0, -halfLen, 0,   0, halfLen, 0] };
}

// ---- 地影本影锥（选做 E2）：底圆在原点（地球处），锥顶在局部 +Y 方向 length 处 ----
// 之后用模型矩阵把 +Y 对齐到"背日方向"，即得从地球延伸出的本影
function createUmbraConeData(radius, length, segments) {
    const positions = [];
    for (let j = 0; j < segments; ++j) {
        const a0 = j * 2 * Math.PI / segments;
        const a1 = (j + 1) * 2 * Math.PI / segments;
        const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius;
        const x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
        positions.push(x0, 0, z0,  x1, 0, z1,  0, length, 0);   // 侧面三角形
    }
    return { positions };
}

// ---- 小行星带：每颗小行星一条圆轨道（半径/相位/角速度/高度）----
// 角速度同样服从 ω = K / r^(3/2)，在顶点着色器中随时间推进
function createBeltData(count, rMin, rMax, ySpread) {
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; ++i) {
        const r     = rMin + (rMax - rMin) * Math.random();
        const phase = Math.random() * 2 * Math.PI;
        const speed = KEPLER_K / Math.pow(r, 1.5);
        const y     = (Math.random() * 2 - 1) * ySpread;
        data.set([r, phase, speed, y], i * 4);
    }
    return data;
}

// ============================================================
// VAO 构建工具
// ============================================================

function buildTexturedVAO(gl, prog, geom) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    bufferAttrib(gl, prog, 'aPosition', new Float32Array(geom.positions), 3);
    bufferAttrib(gl, prog, 'aNormal',   new Float32Array(geom.normals),   3);
    bufferAttrib(gl, prog, 'aTexCoord', new Float32Array(geom.texCoords), 2);

    const idx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geom.indices), gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    return { vao, count: geom.indices.length };
}

function buildFlatVAO(gl, prog, geom) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    bufferAttrib(gl, prog, 'aPosition', new Float32Array(geom.positions), 3);
    gl.bindVertexArray(null);
    return { vao, count: geom.positions.length / 3 };
}

function buildBeltVAO(gl, prog, data) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    bufferAttrib(gl, prog, 'aOrbit', data, 4);
    gl.bindVertexArray(null);
    return { vao, count: data.length / 4 };
}

function bufferAttrib(gl, prog, name, data, size) {
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) throw new Error('attribute 不存在: ' + name);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
}
