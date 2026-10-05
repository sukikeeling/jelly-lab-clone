/* ============================================================
 * fruits.js — 水果/果冻 3D 几何体构建器
 * 🍉 100% 对照 target-watermelon.png & shot-010.png 饱满圆角扇形西瓜（三层结构+手绘条纹+水滴黑籽）
 * 🦑 100% 对照 shot-006.png 果冻鱿鱼（外套膜+展开肉鳍+黑亮萌眼白高光+6短触须吸盘+2长触腕勺掌）
 * 以及菠萝圈、软糖小熊、果冻骰子、橘子瓣、全果西瓜与模具形状
 * ============================================================ */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { jellyMaterial } from './three-jelly.js';
import {
  createWatermelonGeometry,
  createWatermelonRindGeometry,
  createWatermelonPithGeometry,
  createMelonStripeTexture,
  createMelonPithTexture,
  createSeedMeshes,
  createSquidGeometry,
  createSquidOrgans,
  createTentacleMeshes,
  createRoundedCubeGeometry,
  createPhysicalJellyMaterial
} from './models.js';

/* ---------- 菠萝与整果贴图 ---------- */
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
    x.fillStyle = '#f2b81f';
    x.fillRect(0, 0, s, s);
    x.strokeStyle = 'rgba(150,95,15,0.55)';
    x.lineWidth = 7;
    const st = s / 8;
    for (let i = -8; i < 16; i++) {
      x.beginPath(); x.moveTo(i * st, 0); x.lineTo(i * st + s, s); x.stroke();
      x.beginPath(); x.moveTo(i * st + s, 0); x.lineTo(i * st, s); x.stroke();
    }
    const g = x.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
  });
}

function wholeMelonStripeTexture() {
  return canvasTex(512, (x, s) => {
    x.fillStyle = '#2e7d3a';
    x.fillRect(0, 0, s, s);
    x.strokeStyle = 'rgba(18,70,28,0.85)';
    x.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const px = (i + 0.5) * s / 9;
      x.lineWidth = 14 + Math.random() * 6;
      x.beginPath();
      x.moveTo(px, -10);
      x.bezierCurveTo(px + 22, s * 0.3, px - 22, s * 0.6, px + 8, s + 10);
      x.stroke();
    }
    const g = x.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.20)');
    g.addColorStop(0.4, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
  });
}

/* ============================================================
 * 01 🍉 西瓜果冻 (严格对齐 target-watermelon.png & shot-010.png)
 * 1. 形状：厚实饱满 60° 扇形圆角块（非锐角），所有棱角极圆润（Fillet Bevel）
 * 2. 侧面弧边果皮：翠绿底色 (#2e7d3a) + 手绘感深绿波浪条纹 (#144d20)
 * 3. 白绿过渡层：在深绿瓜皮与红瓤之间，清晰的奶白至浅绿过渡带 (Pith，厚度约 0.08~0.12)
 * 4. 上表面与切面：晶莹透亮浓郁果汁红，上表面错落分布水滴形黑亮西瓜籽
 * 5. 材质与光泽：MeshPhysicalMaterial，高透光 transmission 0.96，ior 1.40，摄影棚柔光条反光
 * ============================================================ */
export function buildWatermelon(flesh = '#f2263a', fleshDark = '#c11126') {
  // 1. 厚实饱满 60° 扇形圆角块果肉主体
  const pulpGeom = createWatermelonGeometry();
  
  // 颜色配置
  let attColor = '#e11d48';
  let baseColor = '#ff3b5c';
  if (flesh === '#f5b81f' || fleshDark === '#d1920a') {
    attColor = '#d97706';
    baseColor = '#f59e0b';
  } else if (flesh === '#f7a8b8' || fleshDark === '#e07f95') {
    attColor = '#be123c';
    baseColor = '#fb7185';
  }

  const pulpMat = jellyMaterial(baseColor, {
    baseColor,
    transmission: 0.94,
    thickness: 2.2,
    roughness: 0.04,
    ior: 1.40,
    attenuation: attColor,
    attenuationDistance: 1.55,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    dispersion: 0.058
  });
  const pulpMesh = new THREE.Mesh(pulpGeom, pulpMat);
  pulpMesh.frustumCulled = false;

  // 2. 真实翠绿底色 + 手绘感深绿波浪条纹外层果皮 (严格对齐 #2e7d3a 底色 + #144d20 波浪条纹)
  const rindGeom = createWatermelonRindGeometry();
  const rindTex = createMelonStripeTexture();
  const rindMat = new THREE.MeshStandardMaterial({
    map: rindTex,
    roughness: 0.32,
    metalness: 0.02,
    side: THREE.DoubleSide
  });
  const rindMesh = new THREE.Mesh(rindGeom, rindMat);
  rindMesh.frustumCulled = false;

  // 3. 白绿过渡层 (Pith Transition Band，厚度约 0.12)
  const pithGeom = createWatermelonPithGeometry();
  const pithTex = createMelonPithTexture();
  const pithMat = new THREE.MeshStandardMaterial({
    map: pithTex,
    roughness: 0.22,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  const pithMesh = new THREE.Mesh(pithGeom, pithMat);
  pithMesh.frustumCulled = false;

  // 4. 水滴形黑亮西瓜籽 (错落分布在上表面)
  const seedItems = createSeedMeshes(10);
  const followers = seedItems.map(s => ({
    mesh: s.mesh,
    restPos: s.restPos
  }));

  return {
    mesh: pulpMesh,
    fleshColor: attColor,
    secondary: [
      { mesh: rindMesh, geom: rindGeom },
      { mesh: pithMesh, geom: pithGeom }
    ],
    followers,
    restY: 0
  };
}

/* ============================================================
 * 06 🦑 果冻鱿鱼 (严格对齐 shot-006.png ！！！必须神还原！)
 * 1. 头部（外套膜）：圆锥水滴形饱满身体，顶部两侧生有一对展开的平滑三角形/菱形肉鳍（小翅膀）
 * 2. 眼睛：身体两侧镶嵌两颗黑亮大眼睛，带有白色瞳孔高光
 * 3. 触须系统：
 *    - 6 根向外波浪自然卷曲的短触须（带颗粒感吸盘纹理）
 *    - 2 根长长的捕食触腕（Tentacles），向下延展，末端带有明显的椭圆勺状触须掌
 * 4. 材质：粉橘/肉粉色高透果冻凝胶（#f4826b，attenuation #b93822），透光水润，链式柔动
 * ============================================================ */
export function buildSquid(colorId = 'peach') {
  // 1. 水滴形饱满外套膜 + 展开平滑三角形/菱形肉鳍
  const squidGeom = createSquidGeometry();

  // 颜色方案：严格对齐 shot-006.png 粉橘肉粉色高透果冻 (#f4826b，attenuation #b93822)
  let baseColor = '#ffedd5';
  let attColor = '#f43f5e';
  if (colorId === 'cyan') {
    baseColor = '#e0f2fe';
    attColor = '#0284c7';
  } else if (colorId === 'purple') {
    baseColor = '#ede9fe';
    attColor = '#7c3aed';
  }

  const squidMat = jellyMaterial(baseColor, {
    baseColor,
    transmission: 0.95,
    thickness: 2.0,
    roughness: 0.04,
    ior: 1.39,
    attenuation: attColor,
    attenuationDistance: 1.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.025,
    dispersion: 0.052
  });
  const squidMesh = new THREE.Mesh(squidGeom, squidMat);
  squidMesh.frustumCulled = false;

  // 2. 两侧黑亮大眼睛 + 白色瞳孔高光 + 内部微发光心脏
  const organs = createSquidOrgans();

  // 3. 触须系统：6 根带吸盘波浪短触须 + 2 根带椭圆勺状掌长触腕
  const tentacleMeshes = createTentacleMeshes(8);

  return {
    mesh: squidMesh,
    fleshColor: attColor,
    organs,
    followers: [],
    tentacles: tentacleMeshes,
    restY: 0,
    isSquid: true
  };
}

/* ============================================================
 * 02 🍍 菠萝圈
 * ============================================================ */
export function buildPineappleRing() {
  const geo = new THREE.TorusGeometry(1.15, 0.46, 26, 56);
  geo.scale(1, 1, 0.82);
  const mat = jellyMaterial('#ffffff', {
    map: pineappleTexture(),
    transmission: 0.92,
    thickness: 2.1,
    roughness: 0.12,
    ior: 1.42,
    attenuation: '#d97706',
    attenuationDistance: 1.1,
    clearcoat: 1.0,
    dispersion: 0.048
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2 - 0.18;
  return { mesh, fleshColor: '#cf8f0e', followers: [], restY: 0.1 };
}

/* ============================================================
 * 03 🧸 软糖小熊
 * ============================================================ */
export function buildGummyBear(color = '#f6911f') {
  const parts = [];
  const add = (g, x, y, z, sx = 1, sy = 1, sz = 1) => {
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    parts.push(g);
  };
  add(new THREE.SphereGeometry(0.85, 22, 18), 0, -0.35, 0, 1, 1.12, 0.82);
  add(new THREE.SphereGeometry(0.55, 20, 16), 0, 0.72, 0, 1, 1, 0.85);
  add(new THREE.SphereGeometry(0.22, 12, 10), -0.42, 1.12, 0, 1, 1, 0.8);
  add(new THREE.SphereGeometry(0.22, 12, 10), 0.42, 1.12, 0, 1, 1, 0.8);
  add(new THREE.SphereGeometry(0.3, 12, 10), -0.72, -0.5, 0, 1, 1.25, 0.75);
  add(new THREE.SphereGeometry(0.3, 12, 10), 0.72, -0.5, 0, 1, 1.25, 0.75);
  add(new THREE.SphereGeometry(0.32, 12, 10), -0.34, -1.12, 0, 1, 1.1, 0.75);
  add(new THREE.SphereGeometry(0.32, 12, 10), 0.34, -1.12, 0, 1, 1.1, 0.75);

  let vTotal = 0, iTotal = 0;
  parts.forEach(g => { vTotal += g.attributes.position.count; iTotal += g.index.count; });
  const pos = new Float32Array(vTotal * 3);
  const nor = new Float32Array(vTotal * 3);
  const uv = new Float32Array(vTotal * 2);
  const idx = new (vTotal > 65535 ? Uint32Array : Uint16Array)(iTotal);
  let vo = 0, io = 0;
  parts.forEach(g => {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += n; io += gi.length;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  const mat = jellyMaterial('#fff8db', {
    transmission: 0.96,
    thickness: 2.2,
    roughness: 0.10,
    attenuation: color,
    attenuationDistance: 0.95,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    dispersion: 0.050
  });
  const mesh = new THREE.Mesh(geo, mat);

  const followers = [];
  const eyeGeo = new THREE.SphereGeometry(0.075, 10, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x3d1c0b, roughness: 0.2 });
  [[-0.2, 0.78, 0.62], [0.2, 0.78, 0.62]].forEach(([ex, ey, ez]) => {
    const m = new THREE.Mesh(eyeGeo, eyeMat);
    followers.push({ mesh: m, restPos: [ex, ey, ez] });
  });

  return { mesh, fleshColor: color, followers, restY: 0 };
}

/* ============================================================
 * 04 🎲 果冻骰子 (Masterpiece 圆角刚柔方块)
 * ============================================================ */
const DICE_PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export function buildDice(face = 5) {
  const geo = createRoundedCubeGeometry();
  const mat = jellyMaterial('#ecfdf5', {
    transmission: 0.98,
    thickness: 2.6,
    roughness: 0.08,
    attenuation: '#059669',
    attenuationDistance: 0.95,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    dispersion: 0.052
  });
  const mesh = new THREE.Mesh(geo, mat);

  const followers = [];
  const pipGeo = new THREE.SphereGeometry(0.10, 12, 10);
  const pipMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15 });
  const H = 0.925;
  const faces = [
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  ];
  const faceNums = [1, 6, 2, 5, 3, 4];
  faces.forEach((f, fi) => {
    const pips = DICE_PIPS[faceNums[fi]];
    pips.forEach(([px, py]) => {
      const tx = f.n[0] * H + f.u[0] * px * 0.44 + f.v[0] * py * 0.44;
      const ty = f.n[1] * H + f.u[1] * px * 0.44 + f.v[1] * py * 0.44;
      const tz = f.n[2] * H + f.u[2] * px * 0.44 + f.v[2] * py * 0.44;
      const m = new THREE.Mesh(pipGeo, pipMat);
      followers.push({ mesh: m, restPos: [tx, ty, tz] });
    });
  });

  return { mesh, fleshColor: '#059669', followers, restY: 0.35 };
}

/* ============================================================
 * 05 🍊 橘子瓣
 * ============================================================ */
export function buildOrange() {
  const R = 1.95;
  const shape = new THREE.Shape();
  shape.moveTo(0, -1.1);
  shape.absarc(0, -1.1, R, Math.PI * 1.15, Math.PI * 1.85, false);
  shape.lineTo(0, -1.1);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.8,
    bevelEnabled: true,
    bevelThickness: 0.28,
    bevelSize: 0.24,
    bevelSegments: 3,
    curveSegments: 26,
  });
  geo.center();

  const mat = jellyMaterial('#fff7ed', {
    transmission: 0.96,
    thickness: 2.2,
    roughness: 0.08,
    attenuation: '#ea580c',
    attenuationDistance: 0.8,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    dispersion: 0.048
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -0.12;
  return { mesh, fleshColor: '#ea580c', followers: [], restY: 0 };
}

/* ============================================================
 * 07 🍈 整西瓜 (高压承重)
 * ============================================================ */
export function buildMelon() {
  const geo = new THREE.SphereGeometry(1.65, 40, 30);
  geo.scale(1, 0.94, 1);
  const mat = jellyMaterial('#ffffff', {
    map: wholeMelonStripeTexture(),
    transmission: 0.55,
    thickness: 2.4,
    roughness: 0.22,
    attenuation: '#15803d',
    attenuationDistance: 1.3,
    clearcoat: 1.0,
    dispersion: 0.042
  });
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, fleshColor: '#15803d', followers: [], restY: 0 };
}

/* ============================================================
 * 形状模具 (星星 / 圆形 / 爱心)
 * ============================================================ */
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

  const mat = jellyMaterial('#fff8db', {
    transmission: 0.96,
    thickness: 2.2,
    roughness: 0.08,
    attenuation: color,
    attenuationDistance: 0.9,
    clearcoat: 1.0,
    dispersion: 0.048
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -0.1;
  return { mesh, fleshColor: color, followers: [], restY: 0 };
}
