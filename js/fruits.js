/* ============================================================
 * fruits.js — 水果几何体构建器（程序化贴图 + 顶点色 + 细节跟随）
 * 每个 builder 返回 { mesh, fleshColor, seedVerts?, extras }
 * ============================================================ */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { jellyMaterial } from './three-jelly.js';

/* ---------- 画布贴图 ---------- */
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function pineappleTexture() {
  return canvasTex(512, (x, s) => {
    x.fillStyle = '#f2b81f'; x.fillRect(0, 0, s, s);
    x.strokeStyle = 'rgba(150,95,15,0.55)'; x.lineWidth = 7;
    const st = s / 8;
    for (let i = -8; i < 16; i++) {
      x.beginPath(); x.moveTo(i*st, 0); x.lineTo(i*st + s, s); x.stroke();
      x.beginPath(); x.moveTo(i*st + s, 0); x.lineTo(i*st, s); x.stroke();
    }
    // 高光
    const g = x.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
}

function melonStripeTexture() {
  return canvasTex(512, (x, s) => {
    x.fillStyle = '#2e7d3a'; x.fillRect(0, 0, s, s);
    x.strokeStyle = 'rgba(18,70,28,0.8)'; x.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const px = (i + 0.5) * s / 9;
      x.lineWidth = 13 + Math.random()*6;
      x.beginPath();
      x.moveTo(px, -10);
      x.bezierCurveTo(px+22, s*0.3, px-22, s*0.6, px+8, s+10);
      x.stroke();
    }
    const g = x.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.20)'); g.addColorStop(0.4, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
}

/* ---------- 顶点色：西瓜瓤（按径向） ---------- */
function paintRadialWedge(geo, R, stops, apex) {
  // stops: [[rFrac, color], ...] 按到扇形顶点的距离
  apex = apex || new THREE.Vector3(0, 0, 0);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i) - apex.x, pos.getY(i) - apex.y) / R;
    let col = stops[stops.length-1][1];
    for (let s = 0; s < stops.length; s++) {
      if (r <= stops[s][0]) { col = stops[s][1]; break; }
    }
    c.set(col);
    colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/* ---------- 几何体合并（无 BufferGeometryUtils 依赖） ---------- */
function mergeNonIndexed(geos) {
  // 全部转 non-indexed 后拼接 position/normal/uv/color
  const list = geos.map(g => g.index ? g.toNonIndexed() : g);
  let total = 0;
  list.forEach(g => total += g.attributes.position.count);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const col = new Float32Array(total * 3);
  let o = 0;
  const offsets = [];
  list.forEach(g => {
    const n = g.attributes.position.count;
    offsets.push(o);
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
    else { const c = new THREE.Color('#ffffff'); for (let i = 0; i < n; i++) { col[(o+i)*3] = c.r; col[(o+i)*3+1] = c.g; col[(o+i)*3+2] = c.b; } }
    o += n;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // 焊接：按（位置+颜色）去重，转 indexed，让 computeVertexNormals 给出平滑着色
  const map = new Map();
  const index = new Uint32Array(total);
  let vc = 0;
  const keyOf = (i) => {
    const q = (v) => Math.round(v * 1000);
    return q(pos[i*3]) + ',' + q(pos[i*3+1]) + ',' + q(pos[i*3+2]) + '|' +
           q(col[i*3]) + ',' + q(col[i*3+1]) + ',' + q(col[i*3+2]);
  };
  const wpos = [], wnor = [], wuv = [], wcol = [];
  for (let i = 0; i < total; i++) {
    const k = keyOf(i);
    let vi = map.get(k);
    if (vi === undefined) {
      vi = vc++;
      map.set(k, vi);
      wpos.push(pos[i*3], pos[i*3+1], pos[i*3+2]);
      wnor.push(nor[i*3], nor[i*3+1], nor[i*3+2]);
      wuv.push(uv[i*2], uv[i*2+1]);
      wcol.push(col[i*3], col[i*3+1], col[i*3+2]);
    }
    index[i] = vi;
  }
  const wgeo = new THREE.BufferGeometry();
  wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wgeo.setAttribute('normal', new THREE.Float32BufferAttribute(wnor, 3));
  wgeo.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
  wgeo.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3));
  wgeo.setIndex(new THREE.BufferAttribute(index, 1));
  // 旧索引 → 焊接后索引（跟随物用）
  const indexMap = new Uint32Array(total);
  for (let i = 0; i < total; i++) indexMap[i] = index[i];
  return { geometry: wgeo, offsets, indexMap };
}

function mergeIndexed(geos) {
  // 保留索引 + 原始法线（软糖小熊：保持圆润不刻面）
  let vTotal = 0, iTotal = 0;
  geos.forEach(g => { vTotal += g.attributes.position.count; iTotal += g.index.count; });
  const pos = new Float32Array(vTotal * 3);
  const nor = new Float32Array(vTotal * 3);
  const uv = new Float32Array(vTotal * 2);
  const idx = new (vTotal > 65535 ? Uint32Array : Uint16Array)(iTotal);
  let vo = 0, io = 0;
  geos.forEach(g => {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += n; io += gi.length;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function paintSolid(geo, hex) {
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) { colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/* ---------- 西瓜瓣：三角楔形切片（对照 reference/shot-010） ---------- */
export function buildWatermelon(flesh = '#d92b3f', fleshDark = '#a51226') {
  // 2D 楔形：尖角在左 (-2.35,0)，弧形果皮在右 —— 像切下来的一牙西瓜
  const wedge = (s) => {
    const sh = new THREE.Shape();
    sh.moveTo(-2.35 * s, 0);
    sh.quadraticCurveTo(-0.7 * s, 1.02 * s, 0.85 * s, 1.48 * s);
    sh.quadraticCurveTo(1.7 * s, 1.72 * s, 1.92 * s, 0.92 * s);
    sh.quadraticCurveTo(2.08 * s, 0, 1.92 * s, -0.92 * s);
    sh.quadraticCurveTo(1.7 * s, -1.72 * s, 0.85 * s, -1.48 * s);
    sh.quadraticCurveTo(-0.7 * s, -1.02 * s, -2.35 * s, 0);
    return sh;
  };

  // 果皮（底层）：浅绿底 + 深绿竖条纹（柔和带，利落对比）
  const rindGeo = new THREE.ExtrudeGeometry(wedge(1.0), {
    depth: 0.8, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.16,
    bevelSegments: 3, curveSegments: 64,
  });
  {
    const p = rindGeo.attributes.position, n = p.count;
    const colors = new Float32Array(n * 3);
    const c = new THREE.Color(), gL = new THREE.Color('#4da34f'), gD = new THREE.Color('#2b7a32');
    const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let i = 0; i < n; i++) {
      const ang = Math.atan2(p.getY(i), p.getX(i));
      const s = Math.abs(Math.sin(ang * 6 + 0.3));
      const t = sstep(0.30, 0.62, s); // 柔和竖条纹带
      c.copy(gL).lerp(gD, t);
      colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
    }
    rindGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  // 白瓤（中层细线）：比果肉稍大，确保从顶部能看到一圈白边
  const pithGeo = new THREE.ExtrudeGeometry(wedge(0.965), {
    depth: 0.1, bevelEnabled: false, curveSegments: 48,
  });
  pithGeo.translate(0, 0, 0.92);
  paintSolid(pithGeo, '#f7f0de');

  // 果肉（顶层）：汁水红 —— 底色加深 + 暖调次表面感
  const fleshGeo = new THREE.ExtrudeGeometry(wedge(0.86), {
    depth: 0.42, bevelEnabled: true, bevelThickness: 0.26, bevelSize: 0.13,
    bevelSegments: 4, curveSegments: 64,
  });
  fleshGeo.translate(0, 0, 1.0);
  {
    const p = fleshGeo.attributes.position, n = p.count;
    const colors = new Float32Array(n * 3);
    const c = new THREE.Color(), cF = new THREE.Color(flesh), cD = new THREE.Color(fleshDark);
    const cSeed = new THREE.Color('#2a160e');
    // 籽心：从真实果肉顶面顶点里选，保证落在几何体上
    const topVerts = [];
    for (let i = 0; i < n; i++) {
      if (p.getZ(i) > 1.55) topVerts.push(i);
    }
    const seedPts = [];
    let guard = 0;
    while (seedPts.length < 16 && guard++ < 3000 && topVerts.length) {
      const vi = topVerts[(Math.random() * topVerts.length) | 0];
      const sx = p.getX(vi), sy = p.getY(vi);
      if (seedPts.every(q => Math.hypot(q[0]-sx, q[1]-sy) > 0.45)) seedPts.push([sx, sy]);
    }
    for (let i = 0; i < n; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const r = Math.min(1, Math.hypot(vx, vy) / 2.1);
      c.copy(cF).lerp(cD, r * 0.62);
      // 顶面籽：水滴形深色斑（y 向拉长）
      if (vz > 1.42) {
        for (const [sx, sy] of seedPts) {
          const dx = vx - sx, dy = (vy - sy) * 0.62;
          const d = Math.hypot(dx, dy);
          if (d < 0.11) {
            const t = 1 - d / 0.11;
            c.lerp(cSeed, t * t * 0.92);
            break;
          }
        }
      }
      colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
    }
    fleshGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  const { geometry: geo } = mergeNonIndexed([rindGeo, pithGeo, fleshGeo]);
  rindGeo.dispose(); pithGeo.dispose();
  fleshGeo.dispose();

  // 先 center，让后续坐标稳定
  geo.center();

  // 籽已烘进顶点色（见果肉绘制），无需跟随物
  const seeds = [];

  // 湿漉漉镜面果冻：陶瓷棚拍配方 + 轻 transmission
  // roughness 0.07 收紧反射（防整片奶白 veil），envMapIntensity 0.95 保亮度
  const mat = jellyMaterial('#ffffff', {
    vertexColors: true, thickness: 2.2, roughness: 0.07, transmission: 0.25,
    clearcoatRoughness: 0.03, attenuation: fleshDark, attenuationDistance: 1.2,
    envMapIntensity: 0.95,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // 3/4 俯视：尖角朝左上，弧形果皮转向右下（对照 target-watermelon.png 构图）
  mesh.rotation.set(-0.38, -0.55, 0.32);

  // center() 已在前面调用，跟随用当前顶点位置
  return { mesh, fleshColor: fleshDark, followers: seeds, restY: 0 };
}

/* ---------- 橘子瓣 ---------- */
export function buildOrange() {
  const R = 1.95;
  const shape = new THREE.Shape();
  shape.moveTo(0, -1.1);
  shape.absarc(0, -1.1, R, Math.PI * 1.15, Math.PI * 1.85, false);
  shape.lineTo(0, -1.1);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.8, bevelEnabled: true, bevelThickness: 0.28, bevelSize: 0.24,
    bevelSegments: 3, curveSegments: 26,
  });
  // 顶点色在 center 之前绘制（扇形顶点 (0,-1.1)）
  {
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i);
      const r = Math.hypot(vx, vy + 1.1) / R;
      const ang = Math.atan2(vy + 1.1, vx);
      const seg = Math.abs(((ang / Math.PI * 3 + 3) % 1) - 0.5);
      let col;
      if (r > 0.9) col = '#f0c98e';
      else if (r > 0.82) col = '#c25e04';
      else if (seg < 0.045 && r > 0.15) col = '#ffdf9e';
      else col = r < 0.5 ? '#ff8a12' : '#ef5f00';
      c.set(col);
      colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  geo.center();
  // 防洗白：transmission 降到 0.55 + 浓 attenuation + 降环境反射强度
  const mat = jellyMaterial('#ffffff', {
    vertexColors: true, thickness: 1.1, transmission: 0.55,
    attenuation: '#e86a00', attenuationDistance: 1.1, envMapIntensity: 0.65,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -0.12;
  return { mesh, fleshColor: '#d96a0a', followers: [], restY: 0 };
}

/* ---------- 菠萝圈 ---------- */
export function buildPineappleRing() {
  const geo = new THREE.TorusGeometry(1.15, 0.46, 26, 56);
  geo.scale(1, 1, 0.82);
  const mat = jellyMaterial('#ffffff', { map: pineappleTexture(), thickness: 1.1, roughness: 0.2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2 - 0.18;
  return { mesh, fleshColor: '#cf8f0e', followers: [], restY: 0.1 };
}

/* ---------- 软糖小熊 ---------- */
function bearShape() {
  const s = new THREE.Shape();
  // 身体椭圆 + 头 + 耳朵，用 absarc 拼
  s.absarc(0, -0.35, 0.95, 0, Math.PI * 2, false); // 身体
  return s;
}
export function buildGummyBear(color = '#f6911f') {
  // 用多个球体融合感：身体+头+耳朵+四肢，合并为一个几何体做软体
  const parts = [];
  const add = (g, x, y, z, sx=1, sy=1, sz=1) => {
    g.scale(sx, sy, sz); g.translate(x, y, z); parts.push(g);
  };
  add(new THREE.SphereGeometry(0.85, 22, 18), 0, -0.35, 0, 1, 1.12, 0.82);
  add(new THREE.SphereGeometry(0.55, 20, 16), 0, 0.72, 0, 1, 1, 0.85);
  add(new THREE.SphereGeometry(0.22, 12, 10), -0.42, 1.12, 0, 1, 1, 0.8);
  add(new THREE.SphereGeometry(0.22, 12, 10), 0.42, 1.12, 0, 1, 1, 0.8);
  add(new THREE.SphereGeometry(0.3, 12, 10), -0.72, -0.5, 0, 1, 1.25, 0.75);
  add(new THREE.SphereGeometry(0.3, 12, 10), 0.72, -0.5, 0, 1, 1.25, 0.75);
  add(new THREE.SphereGeometry(0.32, 12, 10), -0.34, -1.12, 0, 1, 1.1, 0.75);
  add(new THREE.SphereGeometry(0.32, 12, 10), 0.34, -1.12, 0, 1, 1.1, 0.75);
  // 保留索引合并（不转 non-indexed），保住球体原始平滑法线
  const geo = mergeIndexed(parts);
  const mat = jellyMaterial(color, { thickness: 1.2, roughness: 0.22 });
  const mesh = new THREE.Mesh(geo, mat);

  // 脸：眼睛 + 嘴（跟随顶点）
  const followers = [];
  const eyeGeo = new THREE.SphereGeometry(0.075, 10, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x5a2c10, roughness: 0.4 });
  const posA = geo.attributes.position;
  const surfZ = 0.62;
  [[-0.2, 0.78], [0.2, 0.78]].forEach(([ex, ey]) => {
    let best = 0, bd = 1e9;
    for (let i = 0; i < posA.count; i += 3) {
      const dx = posA.getX(i)-ex, dy = posA.getY(i)-ey, dz = posA.getZ(i)-surfZ;
      const d = dx*dx+dy*dy+dz*dz;
      if (d < bd) { bd = d; best = i; }
    }
    const m = new THREE.Mesh(eyeGeo, eyeMat);
    followers.push({ mesh: m, vert: best, off: new THREE.Vector3(0, 0, 0.05) });
  });
  return { mesh, fleshColor: color, followers, restY: 0 };
}

/* ---------- 果冻骰子 ---------- */
const DICE_PIPS = {
  1: [[0,0]], 2: [[-1,-1],[1,1]], 3: [[-1,-1],[0,0],[1,1]],
  4: [[-1,-1],[1,-1],[-1,1],[1,1]], 5: [[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],
  6: [[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]],
};
export function buildDice(face = 5) {
  const geo = new RoundedBoxGeometry(1.7, 1.7, 1.7, 4, 0.34);
  const mat = jellyMaterial('#3fbf6f', { transmission: 0.75, thickness: 1.8, roughness: 0.24 });
  const mesh = new THREE.Mesh(geo, mat);
  // 点数：白球微嵌表面
  const followers = [];
  const pipGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const pipMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  const posA = geo.attributes.position;
  const H = 0.851; // 半边长
  const faces = [
    { n: [0,0,1], u: [1,0,0], v: [0,1,0] },
    { n: [0,0,-1], u: [-1,0,0], v: [0,1,0] },
    { n: [1,0,0], u: [0,0,-1], v: [0,1,0] },
    { n: [-1,0,0], u: [0,0,1], v: [0,1,0] },
    { n: [0,1,0], u: [1,0,0], v: [0,0,-1] },
    { n: [0,-1,0], u: [1,0,0], v: [0,0,1] },
  ];
  const faceNums = [1, 6, 2, 5, 3, 4];
  faces.forEach((f, fi) => {
    const pips = DICE_PIPS[faceNums[fi]];
    pips.forEach(([px, py]) => {
      const tx = f.n[0]*H + f.u[0]*px*0.42 + f.v[0]*py*0.42;
      const ty = f.n[1]*H + f.u[1]*px*0.42 + f.v[1]*py*0.42;
      const tz = f.n[2]*H + f.u[2]*px*0.42 + f.v[2]*py*0.42;
      let best = 0, bd = 1e9;
      for (let i = 0; i < posA.count; i += 2) {
        const dx = posA.getX(i)-tx, dy = posA.getY(i)-ty, dz = posA.getZ(i)-tz;
        const d = dx*dx+dy*dy+dz*dz;
        if (d < bd) { bd = d; best = i; }
      }
      const m = new THREE.Mesh(pipGeo, pipMat);
      followers.push({ mesh: m, vert: best, off: new THREE.Vector3(f.n[0]*0.03, f.n[1]*0.03, f.n[2]*0.03) });
    });
  });
  void face;
  return { mesh, fleshColor: '#278a4d', followers, restY: 0.35 };
}

/* ---------- 果冻鱿鱼 ---------- */
export function buildSquid() {
  const geo = new THREE.SphereGeometry(1.0, 26, 22);
  geo.scale(0.95, 1.35, 0.9);
  const mat = jellyMaterial('#f78ba4', { transmission: 0.85, thickness: 1.0, roughness: 0.2 });
  const mesh = new THREE.Mesh(geo, mat);
  // 眼睛
  const followers = [];
  const eyeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x4a1626, roughness: 0.35 });
  const posA = geo.attributes.position;
  [[-0.3, 0.55], [0.3, 0.55]].forEach(([ex, ey]) => {
    let best = 0, bd = 1e9;
    for (let i = 0; i < posA.count; i += 2) {
      const dx = posA.getX(i)-ex, dy = posA.getY(i)-ey, dz = posA.getZ(i)-0.75;
      const d = dx*dx+dy*dy+dz*dz;
      if (d < bd) { bd = d; best = i; }
    }
    const m = new THREE.Mesh(eyeGeo, eyeMat);
    followers.push({ mesh: m, vert: best, off: new THREE.Vector3(0, 0, 0.06) });
  });
  return { mesh, fleshColor: '#e2607f', followers, restY: 0.35, isSquid: true };
}

/* ---------- 整西瓜 ---------- */
export function buildMelon() {
  const geo = new THREE.SphereGeometry(1.65, 40, 30);
  geo.scale(1, 0.94, 1);
  const mat = jellyMaterial('#ffffff', { map: melonStripeTexture(), transmission: 0.35, thickness: 2.2, roughness: 0.32 });
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, fleshColor: '#1d5c28', followers: [], restY: 0 };
}

/* ---------- 模具形状 ---------- */
export function buildMoldShape(kind, color = '#f68c1f') {
  let geo;
  if (kind === 'star') {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 1.5 : 0.68;
      const a = i / 10 * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      i ? s.lineTo(px, py) : s.moveTo(px, py);
    }
    s.closePath();
    geo = new THREE.ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.28, bevelSize: 0.24, bevelSegments: 3 });
  } else if (kind === 'heart') {
    const s = new THREE.Shape();
    s.moveTo(0, -1.1);
    s.bezierCurveTo(-1.7, 0.1, -1.15, 1.25, 0, 0.55);
    s.bezierCurveTo(1.15, 1.25, 1.7, 0.1, 0, -1.1);
    geo = new THREE.ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.28, bevelSize: 0.24, bevelSegments: 3 });
  } else {
    geo = new THREE.CylinderGeometry(1.35, 1.35, 0.85, 36);
  }
  geo.center();
  const mat = jellyMaterial(color, { thickness: 1.3, roughness: 0.18 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -0.1;
  return { mesh, fleshColor: color, followers: [], restY: 0 };
}
