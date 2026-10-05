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
  createPhysicalJellyMaterial,
  createPineappleRingGeometry,
  createPineappleRadialTexture,
  createGummyBearGeometry,
  createGummyBearFace,
  createMooncakeGeometry,
  createMooncakeMaterial,
  applyMooncakeGradientColors,
  MOONCAKE_FLAVORS,
  createOrangePithTexture,
  createOrangeSliceGeometry,
  createKitchenKnifeMesh,
  createDicePipIndentMeshes
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
  // 1. 水滴形饱满平躺外套膜 + 顶端宽大菱形双肉鳍 (严格对齐 shot-006.png)
  const squidGeom = createSquidGeometry();

  // 颜色方案：严格对齐 shot-006.png 娇嫩肉粉色果冻高透凝胶 (#ffedd5, attenuation #f43f5e)
  let baseColor = '#fff1ee';
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
    transmission: 0.96,
    thickness: 2.2,
    roughness: 0.035,
    ior: 1.40,
    attenuation: attColor,
    attenuationDistance: 1.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    dispersion: 0.055
  });
  const squidMesh = new THREE.Mesh(squidGeom, squidMat);
  squidMesh.frustumCulled = false;

  // 2. 两侧黑亮大眼睛 + 白色瞳孔高光 + 内部微发光心脏 (严格对齐 shot-006)
  const organs = createSquidOrgans();

  // 3. 触须系统：6 根波浪卷翘短触手 + 2 根长捕食触腕 (带颗粒吸盘与勺状掌)
  const tentacleMeshes = createTentacleMeshes(8);

  return {
    mesh: squidMesh,
    fleshColor: attColor,
    organs,
    followers: [],
    tentacles: tentacleMeshes,
    restY: 0.05,
    isSquid: true
  };
}

/* ============================================================
 * 02 🍍 菠萝圈 (对齐 shot-001.png target-watermelon 下方厚切菠萝片)
 * 1. 形状：18 瓣菠萝眼圆润凹凸波浪外圈 + 圆滑去芯内孔，上下圆角倒角饱满厚切
 * 2. 肌理：1024x1024 高精放射状果肉微纤维束 + 晶莹多汁微胞元孔隙
 * 3. 材质：高透光金黄蜜糖色 (fleshColor: #f59e0b, transmission 0.95, ior 1.42)
 * ============================================================ */
export function buildPineappleRing() {
  const geo = createPineappleRingGeometry();
  const tex = createPineappleRadialTexture();

  const mat = jellyMaterial('#fffbeb', {
    map: tex,
    baseColor: '#fffbeb',
    transmission: 0.95,
    thickness: 2.3,
    roughness: 0.05,
    ior: 1.42,
    attenuation: '#f59e0b',
    attenuationDistance: 1.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    dispersion: 0.052
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, fleshColor: '#f59e0b', followers: [], restY: 0.06 };
}

/* ============================================================
 * 03 🧸 软糖小熊 (圆滚滚萌趣造型 + 晶莹橙黄果冻胶质感)
 * 1. 造型：圆滚滚大头 + Q 萌小圆耳 (内耳浅窝) + 凸起萌吻 + 饱满肉肚腩 + 敦实坐姿小短爪
 * 2. 质感：晶莹橙黄果冻胶 (transmission 0.96, ior 1.41, clearcoat 1.0, 晶莹微色散)
 * 3. 表情：黑亮晶莹小眼睛 + 萌萌小鼻尖，随软体物理自然抖动
 * ============================================================ */
export function buildGummyBear(color = '#f97316') {
  const geo = createGummyBearGeometry();

  const mat = jellyMaterial('#fff7ed', {
    baseColor: '#fff7ed',
    transmission: 0.96,
    thickness: 2.6,
    roughness: 0.05,
    ior: 1.41,
    attenuation: color,
    attenuationDistance: 1.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    dispersion: 0.050
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  const followers = createGummyBearFace();

  return { mesh, fleshColor: color, followers, restY: 0.0 };
}

/* ============================================================
 * 04 🎲 果冻骰子 (严格对齐殿下要求：Q 弹圆角立方体 + 真实点数凹陷 + 摇一摇稳定对齐)
 * ============================================================ */
export function buildDice(colorId = 'white') {
  const geo = createRoundedCubeGeometry();
  
  // 晶莹透亮温润白玉果冻材质 (高透光、高折射率、清亮温润)
  let baseColor = '#ffffff';
  let attColor = '#f59e0b'; // 暖金果冻透光
  if (colorId === 'green') {
    baseColor = '#ecfdf5';
    attColor = '#059669'; // 清透翡翠
  } else if (colorId === 'pink') {
    baseColor = '#fff1f2';
    attColor = '#f43f5e'; // 蜜桃果冻
  }

  const mat = jellyMaterial(baseColor, {
    baseColor,
    transmission: 0.96,
    thickness: 2.8,
    roughness: 0.04,
    ior: 1.42,
    attenuation: attColor,
    attenuationDistance: 1.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    dispersion: 0.055
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  // 严格点数凹陷 (Indented Pips: 1点朱红半球凹坑，2~6点深炭黑半球凹坑，相对面之和为7)
  const pipItems = createDicePipIndentMeshes();
  const followers = pipItems.map(p => ({
    mesh: p.mesh,
    restPos: p.restPos,
    faceNum: p.faceNum
  }));

  return { mesh, fleshColor: attColor, followers, restY: 0.35, isDice: true };
}

/* ============================================================
 * 05 🍊 橘子切切 (严格对齐 shot-026.png)
 * 1. 饱满圆润厚切橘瓣几何体 (带柔和圆角倒角)
 * 2. 橙黄半透明果肉 + 真实白色经络 (橘络主脉与网状分叉白丝)
 * 3. 严格对齐 8 段切片月牙排布，支持各自物理联动与大菜刀斩落！
 * ============================================================ */
export function buildOrange(colorId = 'orange') {
  let baseColor = '#fff7ed';
  let attColor = '#ea580c';
  if (colorId === 'grapefruit') {
    attColor = '#f43f5e';
  } else if (colorId === 'lemon') {
    attColor = '#eab308';
  }

  // 白色经络（橘络）高精度贴图 (1024x1024)
  const pithTex = createOrangePithTexture();

  const mat = jellyMaterial(baseColor, {
    map: pithTex,
    baseColor,
    transmission: 0.94,
    thickness: 2.2,
    roughness: 0.05,
    ior: 1.41,
    attenuation: attColor,
    attenuationDistance: 1.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.025,
    dispersion: 0.052
  });

  // 严格对齐 shot-026.png 的 8 段橘子切片组合
  // 每段均为圆润厚切橘瓣，沿月牙弧排列
  const sliceCount = 8;
  const arcRadius = 2.45;
  const startAngle = -0.72;
  const endAngle = 0.72;

  // 构建由 8 段厚切切片组合而成的完整几何体（并保留各切片独立参数以供多段联动）
  const parts = [];
  const sliceTransforms = [];

  for (let s = 0; s < sliceCount; s++) {
    const t = s / (sliceCount - 1);
    const angle = startAngle + t * (endAngle - startAngle);
    // 两端略小略薄、中间饱满厚实 (对齐 shot-026 形状)
    const factor = 1.0 - 0.32 * Math.pow((t - 0.5) * 2, 2);
    const w = 0.86 * factor;
    const h = 1.28 * factor;
    const th = 0.30;

    const sliceGeom = createOrangeSliceGeometry(w, h, th);
    // 旋转切片使其法向沿月牙放射方向
    sliceGeom.rotateY(-angle);

    // 沿月牙弧排列，微留 0.03 间隙
    const px = Math.sin(angle) * arcRadius;
    const pz = (Math.cos(angle) - 1.0) * arcRadius * 0.75;
    const py = 0.02;
    sliceGeom.translate(px, py, pz);

    sliceTransforms.push({ px, py, pz, angle, factor, s });
    parts.push(sliceGeom);
  }

  // 合并为单体主网格 (用于初始揉捏与物理晶格绑定)
  let vTotal = 0, iTotal = 0;
  parts.forEach(g => {
    vTotal += g.attributes.position.count;
    iTotal += g.index.count;
  });

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
    vo += n;
    io += gi.length;
    g.dispose();
  });

  const mergedGeom = new THREE.BufferGeometry();
  mergedGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  mergedGeom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  mergedGeom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mergedGeom.setIndex(new THREE.BufferAttribute(idx, 1));
  mergedGeom.computeVertexNormals();

  const mesh = new THREE.Mesh(mergedGeom, mat);
  mesh.frustumCulled = false;

  return {
    mesh,
    fleshColor: attColor,
    followers: [],
    restY: 0,
    isOrange: true,
    sliceCount: 8,
    sliceTransforms
  };
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

/* ============================================================
 * 08 🥮 月柔 · 冰皮月饼捏捏 (严格对齐殿下最新参考截图 SOFT MOON)
 * 1. 顶面：八瓣宝相花/莲花立体浮雕压纹 (真实 3D 几何起伏，中央花蕊环+8瓣舒展莲瓣+祥云外缘)
 * 2. 侧面：20 齿圆润波浪裙边 (Fluted Rim，每个齿圆润饱满，上下 Fillet 倒角)
 * 3. 绝美三层垂直渐变色：顶层鲜荔枝玫瑰粉 (#f43f5e) ➔ 中层奶黄落日橙 (#fde047) ➔ 底层与边缘冰白微蓝玉光 (Opal / Fresnel)
 * 4. 5 种风味支持：玫瑰芭乐、落日橙、冰川海盐、开心果抹茶、芋泥啵啵
 * ============================================================ */
export function buildMooncake(flavorKey = 'rose_guava') {
  const geo = createMooncakeGeometry();

  // 应用三层垂直渐变色 (顶点颜色平滑过渡)
  applyMooncakeGradientColors(geo, flavorKey);

  // 创建欧泊玉光材质 (Opal / Fresnel 掠射角微蓝幻彩)
  const { mat, flavor } = createMooncakeMaterial(flavorKey);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  return {
    mesh,
    fleshColor: flavor.topColor,
    followers: [],
    restY: 0.02,
    isMooncake: true,
    flavorKey
  };
}


