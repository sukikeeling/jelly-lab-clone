/* ============================================================
 * models.js — 顶级 Three.js 建模系统
 * 🍉 100% 对照 target-watermelon.png & shot-010.png 饱满圆角扇形西瓜（三层结构+手绘条纹+水滴黑籽）
 * 🦑 100% 对照 shot-006.png 果冻鱿鱼（外套膜+展开肉鳍+黑亮萌眼白高光+6短触须吸盘+2长触腕勺掌）
 * ============================================================ */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Gourmet jelly flavor presets for MeshPhysicalMaterial
export const FLAVOR_PRESETS = {
  watermelon: {
    name: '经典红瓜果肉',
    color: '#ff4d6d',
    attenuationColor: '#e11d48',
    attenuationDistance: 1.55,
    ior: 1.40,
    roughness: 0.04,
    thickness: 2.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    dispersion: 0.058
  },
  squid_peach: {
    name: '粉橘肉粉果冻鱿鱼 (原版)',
    color: '#ffedd5',
    attenuationColor: '#f43f5e',
    attenuationDistance: 1.35,
    ior: 1.39,
    roughness: 0.04,
    thickness: 2.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.025,
    dispersion: 0.052
  },
  squid_cyan: {
    name: '海洋薄荷',
    color: '#e0f2fe',
    attenuationColor: '#0284c7',
    attenuationDistance: 0.85,
    ior: 1.37,
    roughness: 0.06,
    thickness: 2.4,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    dispersion: 0.052
  },
  honey: {
    name: '琥珀蜂蜜',
    color: '#fff8db',
    attenuationColor: '#d97706',
    attenuationDistance: 1.05,
    ior: 1.42,
    roughness: 0.09,
    thickness: 2.3,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    dispersion: 0.048
  },
  berry: {
    name: '覆盆子莓',
    color: '#ffe4e6',
    attenuationColor: '#be123c',
    attenuationDistance: 0.85,
    ior: 1.40,
    roughness: 0.08,
    thickness: 2.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    dispersion: 0.050
  },
  mint: {
    name: '青提玉露',
    color: '#ecfdf5',
    attenuationColor: '#059669',
    attenuationDistance: 1.1,
    ior: 1.38,
    roughness: 0.07,
    thickness: 2.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    dispersion: 0.046
  }
};

export function createPhysicalJellyMaterial(flavorKeyOrOpts = 'watermelon') {
  let config = FLAVOR_PRESETS.watermelon;
  if (typeof flavorKeyOrOpts === 'string') {
    config = FLAVOR_PRESETS[flavorKeyOrOpts] || FLAVOR_PRESETS.watermelon;
  } else if (flavorKeyOrOpts && typeof flavorKeyOrOpts === 'object') {
    config = Object.assign({}, FLAVOR_PRESETS.watermelon, flavorKeyOrOpts);
  }

  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(config.color || '#ffe4e6'),
    roughness: config.roughness ?? 0.05,
    metalness: 0.0,
    transmission: config.transmission ?? 0.96,
    thickness: config.thickness ?? 2.8,
    ior: config.ior ?? 1.40,
    attenuationColor: new THREE.Color(config.attenuationColor || '#be123c'),
    attenuationDistance: config.attenuationDistance ?? 0.65,
    clearcoat: config.clearcoat ?? 1.0,
    clearcoatRoughness: config.clearcoatRoughness ?? 0.02,
    dispersion: config.dispersion ?? 0.058,
    side: config.side ?? THREE.FrontSide,
  });
  mat.envMapIntensity = config.envMapIntensity ?? 1.38;
  return mat;
}

// Bind visual geometry to 5x5x5 XPBD lattice
export function bindGeometryToPhysics(geometry, physics, scale = 1.0, offset = new THREE.Vector3(0, 0, 0)) {
  const posAttr = geometry.getAttribute('position');
  posAttr.setUsage(THREE.DynamicDrawUsage);
  
  const restPositions = new Float32Array(posAttr.count * 3);
  const bindings = [];

  for (let i = 0; i < posAttr.count; i++) {
    let x = (posAttr.getX(i) + offset.x) * scale;
    let y = (posAttr.getY(i) + offset.y) * scale;
    let z = (posAttr.getZ(i) + offset.z) * scale;

    // Safety clamp within [-0.95, 0.95] lattice space
    x = Math.max(-0.95, Math.min(0.95, x));
    y = Math.max(-0.95, Math.min(0.95, y));
    z = Math.max(-0.95, Math.min(0.95, z));

    restPositions[i * 3]     = x;
    restPositions[i * 3 + 1] = y;
    restPositions[i * 3 + 2] = z;

    bindings.push(physics.embed(x, y, z));
  }

  return { restPositions, bindings };
}

/* ============================================================
 * 🍉 西瓜统一几何系统常数与变换矩阵
 * 确保果肉、果皮、过渡层、水滴籽 100% 同轴严丝合缝对齐
 * ============================================================ */
const MELON_PARAMS = {
  radius: 1.58,           // 扇形半径
  halfAngle: Math.PI / 6, // 30 degrees (总夹角 60°)
  tipRadius: 0.20,        // 尖端极其圆润的圆角
  cornerRadius: 0.16,     // 外角平滑圆角
  depth: 0.68,            // 饱满厚度
  bevel: 0.12,            // 饱满倒角
  centerY: 0.92,          // 几何中心对齐
  centerZ: 0.34,
  // 严格对齐 target-watermelon.jpg & shot-010.png：
  // 翠绿波浪外弧面展现在左前至正前方，尖端在右后方，顶面红肉与切面完美展现
  viewRotY: Math.PI * 0.82
};

function applyMelonTransform(geom) {
  geom.translate(0, -MELON_PARAMS.centerY, -MELON_PARAMS.centerZ);
  geom.rotateX(-Math.PI * 0.5); // lay flat: thickness is along Y
  geom.rotateY(MELON_PARAMS.viewRotY);
}

/* ============================================================
 * 🍉 1. 西瓜切块 (Watermelon Slice)
 * 严格对齐 target-watermelon.png & shot-010.png：
 * - 60° 扇形圆角块（非锐角），所有棱角极圆润饱满（Fillet Bevel）
 * - 像一颗厚实晶莹的果冻橡皮糖平放在台面上
 * ============================================================ */
export function createWatermelonGeometry() {
  const { radius, halfAngle, tipRadius, cornerRadius, depth, bevel } = MELON_PARAMS;
  const shape = new THREE.Shape();
  const dTip = tipRadius / Math.sin(halfAngle);
  
  const tRightX = tipRadius * Math.cos(halfAngle);
  const tRightY = dTip - tipRadius * Math.sin(halfAngle);
  const tLeftX = -tipRadius * Math.cos(halfAngle);
  const tLeftY = dTip - tipRadius * Math.sin(halfAngle);

  // 1. 尖端圆滑圆弧 (无锐角)
  shape.moveTo(tLeftX, tLeftY);
  shape.absarc(0, dTip, tipRadius, Math.PI + halfAngle, Math.PI * 2 - halfAngle, true);

  // 2. 右侧切面直线
  const rayEndX = radius * Math.sin(halfAngle);
  const rayEndY = radius * Math.cos(halfAngle);
  const pCornerRayX = rayEndX - cornerRadius * Math.sin(halfAngle);
  const pCornerRayY = rayEndY - cornerRadius * Math.cos(halfAngle);
  shape.lineTo(pCornerRayX, pCornerRayY);

  // 3. 右外角过渡圆角
  const arcRightAngle = Math.PI * 0.5 - halfAngle + 0.08;
  const arcRightX = radius * Math.cos(arcRightAngle);
  const arcRightY = radius * Math.sin(arcRightAngle);
  shape.quadraticCurveTo(rayEndX, rayEndY, arcRightX, arcRightY);

  // 4. 外侧大圆弧
  shape.absarc(0, 0, radius, arcRightAngle, Math.PI * 0.5 + halfAngle - 0.08, false);

  // 5. 左外角过渡圆角
  const rayLeftEndX = -radius * Math.sin(halfAngle);
  const rayLeftEndY = radius * Math.cos(halfAngle);
  const pLeftRayX = rayLeftEndX + cornerRadius * Math.sin(halfAngle);
  const pLeftRayY = rayLeftEndY - cornerRadius * Math.cos(halfAngle);
  shape.quadraticCurveTo(rayLeftEndX, rayLeftEndY, pLeftRayX, pLeftRayY);

  // 6. 沿左侧切面引回左切点
  shape.lineTo(tLeftX, tLeftY);

  const extrudeSettings = {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 5,
    curveSegments: 18
  };

  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  applyMelonTransform(geom);

  geom.deleteAttribute('normal');
  const welded = mergeVertices(geom, 0.001);
  geom.dispose();
  welded.computeVertexNormals();
  return welded;
}

/* ============================================================
 * 🍉 2. 侧面弧边果皮 (Watermelon Outer Rind Geometry)
 * 严格同轴覆盖在外侧大圆弧及左右转角，边缘圆润包裹
 * ============================================================ */
export function createWatermelonRindGeometry() {
  const { radius, halfAngle, depth, bevel } = MELON_PARAMS;
  const geom = new THREE.BufferGeometry();
  const rSteps = 42, hSteps = 12;
  const positions = [], uvs = [], indices = [];

  for (let j = 0; j <= hSteps; j++) {
    const v = j / hSteps; // 0 to 1 along thickness
    const z = -bevel + v * (depth + 2 * bevel);

    // Bevel curl at top and bottom edges (inward curl like natural rind)
    const edgeDist = Math.min(v, 1.0 - v);
    const curl = edgeDist < 0.16 ? Math.cos((edgeDist / 0.16) * Math.PI * 0.5) * 0.038 : 0;
    const curR = radius + bevel * 0.88 + 0.015 - curl; // slightly proud to avoid Z-fighting

    for (let i = 0; i <= rSteps; i++) {
      const u = i / rSteps;
      const angle = (Math.PI * 0.5 + halfAngle - 0.06) - u * ((halfAngle - 0.06) * 2.0);
      const x = Math.cos(angle) * curR;
      const y = Math.sin(angle) * curR;

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  for (let j = 0; j < hSteps; j++) {
    for (let i = 0; i < rSteps; i++) {
      const a = j * (rSteps + 1) + i;
      const b = (j + 1) * (rSteps + 1) + i;
      const c = (j + 1) * (rSteps + 1) + (i + 1);
      const d = j * (rSteps + 1) + (i + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  applyMelonTransform(geom);
  geom.computeVertexNormals();
  return geom;
}

/* ============================================================
 * 🍉 3. 白绿过渡层 (Watermelon Pith Layer Geometry)
 * 严格对齐要求：在深绿瓜皮与红瓤之间，必须有一圈清晰的奶白至浅绿过渡带（Pith，厚度约 0.08~0.12）
 * 紧贴瓜皮内侧，并在顶面与底面边缘清晰露出白绿过渡带
 * ============================================================ */
export function createWatermelonPithGeometry() {
  const { radius, halfAngle, depth, bevel } = MELON_PARAMS;
  const geom = new THREE.BufferGeometry();
  const rSteps = 42, wSteps = 6;
  const positions = [], uvs = [], indices = [];

  const pithThickness = 0.12;
  const outerR = radius + bevel * 0.78 + 0.010;

  // Top pith ribbon (visible from top view and sides)
  for (let j = 0; j <= wSteps; j++) {
    const w = j / wSteps; // 0 (outer green edge) to 1 (inner flesh boundary)
    const curR = outerR - w * pithThickness;
    const z = (depth + bevel + 0.008) - Math.pow(w, 1.2) * 0.038;

    for (let i = 0; i <= rSteps; i++) {
      const u = i / rSteps;
      const angle = (Math.PI * 0.5 + halfAngle - 0.06) - u * ((halfAngle - 0.06) * 2.0);
      const x = Math.cos(angle) * curR;
      const y = Math.sin(angle) * curR;

      positions.push(x, y, z);
      uvs.push(w, u);
    }
  }

  for (let j = 0; j < wSteps; j++) {
    for (let i = 0; i < rSteps; i++) {
      const a = j * (rSteps + 1) + i;
      const b = (j + 1) * (rSteps + 1) + i;
      const c = (j + 1) * (rSteps + 1) + (i + 1);
      const d = j * (rSteps + 1) + (i + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  // Bottom pith ribbon
  const baseOffset = positions.length / 3;
  for (let j = 0; j <= wSteps; j++) {
    const w = j / wSteps;
    const curR = outerR - w * pithThickness;
    const z = -bevel - 0.008 + Math.pow(w, 1.2) * 0.038;

    for (let i = 0; i <= rSteps; i++) {
      const u = i / rSteps;
      const angle = (Math.PI * 0.5 + halfAngle - 0.06) - u * ((halfAngle - 0.06) * 2.0);
      const x = Math.cos(angle) * curR;
      const y = Math.sin(angle) * curR;

      positions.push(x, y, z);
      uvs.push(w, u);
    }
  }

  for (let j = 0; j < wSteps; j++) {
    for (let i = 0; i < rSteps; i++) {
      const a = baseOffset + j * (rSteps + 1) + i;
      const b = baseOffset + (j + 1) * (rSteps + 1) + i;
      const c = baseOffset + (j + 1) * (rSteps + 1) + (i + 1);
      const d = baseOffset + j * (rSteps + 1) + (i + 1);
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  applyMelonTransform(geom);
  geom.computeVertexNormals();
  return geom;
}

/* ============================================================
 * 🍉 4. 西瓜皮手绘条纹与白绿过渡贴图生成器
 * 翠绿底色 (#2e7d3a) + 手绘感深绿波浪条纹 (#144d20)
 * ============================================================ */
export function createMelonStripeTexture() {
  const width = 1024, height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. 真实翠绿底色 (#2e7d3a)
  ctx.fillStyle = '#2e7d3a';
  ctx.fillRect(0, 0, width, height);

  // Subtle organic emerald variations
  const g = ctx.createLinearGradient(0, 0, width, 0);
  g.addColorStop(0, '#266b31');
  g.addColorStop(0.3, '#348d42');
  g.addColorStop(0.65, '#2b7837');
  g.addColorStop(1, '#25672f');
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1.0;

  // 2. 手绘感深绿垂直波浪条纹 (#144d20)
  const stripeCount = 8;
  ctx.fillStyle = '#144d20';
  ctx.strokeStyle = '#144d20';

  for (let i = 0; i < stripeCount; i++) {
    const cx = ((i + 0.5) / stripeCount) * width;
    const w = 36 + (i % 3) * 6; // stripe width

    ctx.beginPath();
    const wave1 = (i % 2 === 0 ? 1 : -1) * 28;
    const wave2 = (i % 2 === 0 ? -1 : 1) * 22;

    ctx.moveTo(cx - w * 0.5, 0);
    ctx.bezierCurveTo(cx - w * 0.45 + wave1, height * 0.32, cx - w * 0.55 + wave2, height * 0.68, cx - w * 0.48, height);
    ctx.lineTo(cx + w * 0.48, height);
    ctx.bezierCurveTo(cx + w * 0.55 + wave2, height * 0.68, cx + w * 0.45 + wave1, height * 0.32, cx + w * 0.5, 0);
    ctx.closePath();
    ctx.fill();

    // Jagged organic ink bleed edges
    ctx.lineWidth = 4;
    for (let step = 0; step < 8; step++) {
      const py = (step / 8) * height;
      const jitter = ((step % 2) - 0.5) * 8;
      ctx.fillRect(cx - w * 0.5 + jitter, py, 6, 24);
      ctx.fillRect(cx + w * 0.5 - jitter, py + 12, 6, 24);
    }
  }

  // Studio highlight gradient sheen
  const sheen = ctx.createLinearGradient(0, 0, 0, height);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
  sheen.addColorStop(0.18, 'rgba(255, 255, 255, 0.08)');
  sheen.addColorStop(0.82, 'rgba(0, 0, 0, 0.05)');
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function createMelonPithTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Gradient across pith:
  // w = 0 (outer, near green rind): Tender lime green (#84cc16 / #a3e635)
  // w = 0.45 (mid pith): Creamy milky white (#f8fafc / #ffffff)
  // w = 1.0 (inner flesh): Soft juicy watermelon pink (#fda4af / #f43f5e)
  const grad = ctx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, '#5ea832');       // 浅青绿贴近瓜皮
  grad.addColorStop(0.18, '#a3e635');    // 嫩青黄
  grad.addColorStop(0.42, '#f8fafc');    // 纯正奶白 (Pith 核心)
  grad.addColorStop(0.70, '#ffffff');    // 奶白
  grad.addColorStop(0.88, '#fecdd3');    // 柔粉过渡
  grad.addColorStop(1.0, '#fb7185');     // 果肉浅粉红

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* ============================================================
 * 🍉 5. 水滴形黑亮西瓜籽 (Teardrop Watermelon Seeds)
 * 严格对齐要求：上表面错落分布水滴形黑亮西瓜籽，带高光点
 * ============================================================ */
export function createSeedMeshes(count = 10) {
  const seedGeom = new THREE.SphereGeometry(0.048, 14, 12);
  const pos = seedGeom.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const ny = (y / 0.048 + 1.0) * 0.5;
    const taper = 0.35 + 0.65 * (1.0 - ny * 0.75);
    x *= taper;
    z *= taper * 0.45;
    y *= 1.45;

    pos.setXYZ(i, x, y, z);
  }
  seedGeom.computeVertexNormals();

  const seedMat = new THREE.MeshStandardMaterial({
    color: '#0e0f12',
    roughness: 0.08,
    metalness: 0.35
  });

  const dotGeom = new THREE.SphereGeometry(0.012, 8, 6);
  const dotMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

  const seeds = [];
  const seedConfigs = [
    { r: 0.58, angle: -0.15, rot: 0.25 },
    { r: 0.92, angle: -0.20, rot: -0.32 },
    { r: 1.18, angle: -0.12, rot: 0.18 },
    { r: 0.72, angle:  0.03, rot: -0.12 },
    { r: 1.02, angle:  0.05, rot: 0.22 },
    { r: 1.25, angle:  0.02, rot: -0.15 },
    { r: 0.64, angle:  0.18, rot: 0.35 },
    { r: 0.96, angle:  0.22, rot: -0.28 },
    { r: 1.22, angle:  0.15, rot: 0.14 },
    { r: 0.48, angle: -0.05, rot: -0.18 }
  ];

  const { depth, bevel, centerY, centerZ, viewRotY } = MELON_PARAMS;
  const rawZ = depth + bevel * 0.95; // upper surface

  for (let i = 0; i < Math.min(count, seedConfigs.length); i++) {
    const { r, angle, rot } = seedConfigs[i];
    const mesh = new THREE.Mesh(seedGeom, seedMat);

    const angleFromY = Math.PI * 0.5 - angle;
    const rawX = Math.cos(angleFromY) * r;
    const rawY = Math.sin(angleFromY) * r;

    const p = new THREE.Vector3(rawX, rawY - centerY, rawZ - centerZ);
    p.applyAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI * 0.5);
    p.applyAxisAngle(new THREE.Vector3(0, 1, 0), viewRotY);

    mesh.position.copy(p);
    mesh.rotation.y = viewRotY - angle + rot;
    mesh.rotation.x = 0.08;
    mesh.rotation.z = rot * 0.4;

    const dot = new THREE.Mesh(dotGeom, dotMat);
    dot.position.set(0.015, -0.01, 0.025);
    mesh.add(dot);

    seeds.push({ mesh, restPos: [p.x, p.y, p.z] });
  }

  return seeds;
}

/* ============================================================
 * 🦑 6. 果冻鱿鱼 (Jelly Squid)
 * 严格对齐 shot-006.png ！！！必须神还原！
 * - 头部（外套膜）：圆锥水滴形饱满身体
 * - 顶部两侧生有一对展开的平滑三角形/菱形肉鳍（小翅膀）
 * ============================================================ */
export function createSquidGeometry() {
  const radialSegments = 40;
  const heightSegments = 36;
  const totalH = 1.62;

  const geom = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let j = 0; j <= heightSegments; j++) {
    const v = j / heightSegments; // 0 (tentacle base at bottom -Y) to 1.0 (apex dome at top +Y)
    const y = (v - 0.46) * totalH;

    // 1. Plump teardrop mantle body baseline profile
    const bodyR = 0.52 * Math.sin(Math.PI * Math.pow(v, 0.70)) * (1.1 - 0.22 * v) + 0.08 * (1.0 - v);

    // 2. Pair of smooth triangular/diamond lateral fins (小翅膀)
    // Expanding laterally along X axis near upper section (v in [0.36, 0.92])
    let finSpan = 0;
    if (v >= 0.36 && v <= 0.92) {
      const fv = (v - 0.66) / 0.26;
      const finCurve = Math.max(0, 1.0 - fv * fv);
      finSpan = 0.54 * Math.pow(finCurve, 1.5);
    }

    for (let i = 0; i <= radialSegments; i++) {
      const u = i / radialSegments;
      const phi = u * Math.PI * 2;

      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      const finWeight = Math.pow(Math.abs(cosP), 3.2);
      const curFin = finSpan * finWeight;

      const x = (bodyR + curFin) * Math.sign(cosP);
      const zThickness = 1.0 - 0.48 * (curFin / (0.54 + 1e-5));
      const z = bodyR * sinP * zThickness * 0.90;

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  for (let j = 0; j < heightSegments; j++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = j * (radialSegments + 1) + i;
      const b = (j + 1) * (radialSegments + 1) + i;
      const c = (j + 1) * (radialSegments + 1) + (i + 1);
      const d = j * (radialSegments + 1) + (i + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/* ============================================================
 * 🦑 7. 鱿鱼眼睛与内核 (Squid Eyes & Bioluminescent Nucleus)
 * 严格对齐 shot-006.png：
 * - 身体两侧镶嵌两颗黑亮大眼睛，带有白色瞳孔高光！
 * ============================================================ */
export function createSquidOrgans() {
  const group = new THREE.Group();

  // 1. 发光桃粉果冻心脏/内核 (Bioluminescent Core)
  const coreGeom = new THREE.SphereGeometry(0.24, 20, 16);
  const coreMat = new THREE.MeshStandardMaterial({
    color: '#fb7185',
    emissive: '#f43f5e',
    emissiveIntensity: 1.8,
    roughness: 0.25,
    transparent: true,
    opacity: 0.75
  });
  const core = new THREE.Mesh(coreGeom, coreMat);
  core.position.set(0, -0.05, 0);
  group.add(core);

  // 2. 黑曜石萌趣大眼珠 (Glossy Jet-Black Beads) - 凸起于身体表面 (Z ~ 0.50)
  const eyeGeom = new THREE.SphereGeometry(0.13, 18, 14);
  eyeGeom.scale(1.0, 1.25, 0.85);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: '#090a0d',
    roughness: 0.04,
    metalness: 0.2
  });

  // 白色瞳孔高光 (White Specular Highlight)
  const pupilGeom = new THREE.SphereGeometry(0.045, 12, 10);
  const pupilMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

  // Left Eye (sitting proudly on front-lateral surface)
  const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
  leftEye.position.set(0.35, -0.28, 0.49);
  leftEye.rotation.y = 0.50;
  leftEye.rotation.x = 0.15;
  const leftPupil = new THREE.Mesh(pupilGeom, pupilMat);
  leftPupil.position.set(0.035, 0.045, 0.11);
  leftEye.add(leftPupil);
  group.add(leftEye);

  // Right Eye
  const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
  rightEye.position.set(-0.35, -0.28, 0.49);
  rightEye.rotation.y = -0.50;
  rightEye.rotation.x = 0.15;
  const rightPupil = new THREE.Mesh(pupilGeom, pupilMat);
  rightPupil.position.set(-0.035, 0.045, 0.11);
  rightEye.add(rightPupil);
  group.add(rightEye);

  return {
    group,
    core,
    leftEye,
    rightEye,
    leftEyeRest: [0.35, -0.28, 0.49],
    rightEyeRest: [-0.35, -0.28, 0.49],
    coreRest: [0, -0.05, 0]
  };
}

/* ============================================================
 * 🦑 8. 触须系统 (Tentacle System)
 * 严格对齐 shot-006.png ！！！必须神还原！
 * - 6 根向外波浪自然卷曲的短触须（带颗粒感吸盘纹理）
 * - 2 根长长的捕食触腕（Tentacles），向下延展，末端带有明显的椭圆勺状触须掌！
 * ============================================================ */
export function createTentacleMeshes(tentaclesCount = 8) {
  const meshes = [];

  const tentacleMat = new THREE.MeshPhysicalMaterial({
    color: '#fff1ee',
    roughness: 0.05,
    metalness: 0.0,
    transmission: 0.96,
    thickness: 1.8,
    ior: 1.39,
    attenuationColor: new THREE.Color('#b93822'),
    attenuationDistance: 0.80,
    clearcoat: 1.0,
    clearcoatRoughness: 0.025
  });

  const suckerMat = new THREE.MeshStandardMaterial({
    color: '#ffedd5',
    roughness: 0.22,
    metalness: 0.05
  });

  const suckerGeom = new THREE.SphereGeometry(0.026, 8, 6);
  suckerGeom.scale(1.0, 0.55, 1.0);

  for (let i = 0; i < tentaclesCount; i++) {
    const isLongTentacle = (i >= 6);
    const length = isLongTentacle ? 2.15 : 1.08;
    const topRadius = isLongTentacle ? 0.036 : 0.048;
    const bottomRadius = isLongTentacle ? 0.022 : 0.016;
    const radialSegments = 8;
    const heightSegments = isLongTentacle ? 24 : 16;

    const geom = new THREE.CylinderGeometry(bottomRadius, topRadius, length, radialSegments, heightSegments);
    geom.translate(0, -length * 0.5, 0);

    const pos = geom.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      const py = pos.getY(k);
      const progress = Math.max(0, Math.min(1.0, -py / length));

      if (isLongTentacle) {
        // Long tentacles: elegant S-curve and expanding into paddle club at tip
        const wave = Math.sin(progress * Math.PI * 1.5) * 0.08;
        pos.setX(k, pos.getX(k) + wave);

        if (progress > 0.76) {
          const clubFactor = Math.sin(((progress - 0.76) / 0.24) * Math.PI);
          pos.setX(k, pos.getX(k) * (1.0 + clubFactor * 3.4));
          pos.setZ(k, pos.getZ(k) * (1.0 + clubFactor * 1.5));
        }
      } else {
        // Short arms: natural undulating wave
        const wave = Math.sin(progress * Math.PI * 1.8) * 0.12 * progress;
        pos.setZ(k, pos.getZ(k) + wave);
      }
    }
    geom.computeVertexNormals();

    const restPos = new Float32Array(geom.getAttribute('position').array);
    const mesh = new THREE.Mesh(geom, tentacleMat);
    mesh.frustumCulled = false;

    const suckersGroup = new THREE.Group();
    const cupCount = isLongTentacle ? 12 : 7;
    for (let c = 1; c <= cupCount; c++) {
      const frac = isLongTentacle ? (0.76 + (c / cupCount) * 0.22) : (0.2 + (c / cupCount) * 0.75);
      const cy = -frac * length;
      const cup = new THREE.Mesh(suckerGeom, suckerMat);
      cup.position.set(0, cy, 0.038);
      cup.scale.setScalar(isLongTentacle ? 0.95 : (0.8 + 0.3 * (1 - frac)));
      suckersGroup.add(cup);
    }
    mesh.add(suckersGroup);

    meshes.push({
      mesh,
      geom,
      restPos,
      index: i,
      isLongTentacle,
      length,
      suckersGroup
    });
  }

  return meshes;
}

/* ============================================================
 * 🍯 9. 经典晶莹方块 (Classic Rounded Cube)
 * ============================================================ */
export function createRoundedCubeGeometry() {
  const raw = new THREE.BoxGeometry(1.85, 1.85, 1.85, 24, 24, 24);
  const rawPos = raw.getAttribute('position');
  const pt = new THREE.Vector3(), core = new THREE.Vector3();

  for (let i = 0; i < rawPos.count; i++) {
    pt.fromBufferAttribute(rawPos, i);
    core.copy(pt).clampScalar(-0.65, 0.65);
    pt.sub(core).normalize().multiplyScalar(0.28).add(core);
    rawPos.setXYZ(i, pt.x, pt.y, pt.z);
  }

  raw.deleteAttribute('normal');
  raw.deleteAttribute('uv');
  const welded = mergeVertices(raw, 0.0001);
  raw.dispose();
  welded.computeVertexNormals();
  return welded;
}
