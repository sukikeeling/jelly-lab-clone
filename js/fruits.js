/* ============================================================
 * fruits.js — 水果/果冻 3D 几何体构建器
 * 融合 Masterpiece 高保真西瓜（果肉/果皮/果籽）、发光鱿鱼（裙摆/萌眼/发光核/触须）、
 * 以及菠萝圈、软糖小熊、果冻骰子、橘子瓣、全果西瓜与模具形状
 * ============================================================ */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { jellyMaterial } from './three-jelly.js';
import {
  createWatermelonGeometry,
  createWatermelonRindGeometry,
  createSeedMeshes,
  createSquidGeometry,
  createSquidOrgans,
  createTentacleMeshes,
  createRoundedCubeGeometry,
  createPhysicalJellyMaterial
} from './models.js';

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

function melonStripeTexture() {
  return canvasTex(512, (x, s) => {
    x.fillStyle = '#2e7d3a';
    x.fillRect(0, 0, s, s);
    x.strokeStyle = 'rgba(18,70,28,0.8)';
    x.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const px = (i + 0.5) * s / 9;
      x.lineWidth = 13 + Math.random() * 6;
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
 * 01 🍉 西瓜果冻 (Masterpiece 级高精度曲面切块 + 绿皮 + 独立果籽)
 * ============================================================ */
export function buildWatermelon(flesh = '#f2263a', fleshDark = '#c11126') {
  // 1. 水嫩晶莹果肉
  const pulpGeom = createWatermelonGeometry();
  
  // 适配不同心情色
  let attColor = '#e11d48';
  let baseColor = '#ffe4e6';
  if (flesh === '#f5b81f' || fleshDark === '#d1920a') {
    attColor = '#d97706';
    baseColor = '#fffbeb';
  } else if (flesh === '#f7a8b8' || fleshDark === '#e07f95') {
    attColor = '#be123c';
    baseColor = '#fff1f2';
  }

  const pulpMat = jellyMaterial(baseColor, {
    transmission: 0.98,
    thickness: 2.8,
    roughness: 0.07,
    ior: 1.40,
    attenuation: attColor,
    attenuationDistance: 0.65,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    dispersion: 0.058
  });
  const pulpMesh = new THREE.Mesh(pulpGeom, pulpMat);
  pulpMesh.frustumCulled = false;

  // 2. 弧形翠绿外壳果皮
  const rindGeom = createWatermelonRindGeometry();
  const rindMat = new THREE.MeshStandardMaterial({
    color: '#16a34a',
    roughness: 0.38,
    metalness: 0.05,
    side: THREE.DoubleSide
  });
  const rindMesh = new THREE.Mesh(rindGeom, rindMat);
  rindMesh.frustumCulled = false;

  // 3. 独立水滴黑籽
  const seedItems = createSeedMeshes(10);
  const followers = seedItems.map(s => ({
    mesh: s.mesh,
    restPos: s.restPos
  }));

  return {
    mesh: pulpMesh,
    fleshColor: attColor,
    secondary: [{ mesh: rindMesh, geom: rindGeom }],
    followers,
    restY: 0
  };
}

/* ============================================================
 * 06 🦑 果冻鱿鱼 (Masterpiece 级波浪裙摆 + 发光内核 + 大眼萌珠 + 柔韧触手)
 * ============================================================ */
export function buildSquid() {
  // 1. 晶莹半透明鱿鱼冠部
  const squidGeom = createSquidGeometry();
  const squidMat = jellyMaterial('#e0f2fe', {
    transmission: 0.96,
    thickness: 2.4,
    roughness: 0.07,
    ior: 1.37,
    attenuation: '#0284c7',
    attenuationDistance: 0.85,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    dispersion: 0.052
  });
  const squidMesh = new THREE.Mesh(squidGeom, squidMat);
  squidMesh.frustumCulled = false;

  // 2. 发光内核 + 眼睛器官
  const organs = createSquidOrgans();

  // 3. 8 根连续物理仿真管状触手
  const tentacleMeshes = createTentacleMeshes(8);

  return {
    mesh: squidMesh,
    fleshColor: '#0284c7',
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
    map: melonStripeTexture(),
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
