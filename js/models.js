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

// Bind visual geometry to 5x5x5 XPBD lattice using Free-Form Displacement Embedding
// Keeps original geometry shapes 100% intact (no flattening/clamping to cube)
export function bindGeometryToPhysics(geometry, physics, scale = 1.0, offset = new THREE.Vector3(0, 0, 0)) {
  const posAttr = geometry.getAttribute('position');
  posAttr.setUsage(THREE.DynamicDrawUsage);
  
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const maxExtent = Math.max(
    Math.abs(box.min.x), Math.abs(box.max.x),
    Math.abs(box.min.y), Math.abs(box.max.y),
    Math.abs(box.min.z), Math.abs(box.max.z),
    1.0
  );
  // Auto-fit comfortably inside [-0.85, 0.85] lattice domain without any clipping
  const autoScale = (scale && scale !== 1.0) ? scale : (0.82 / maxExtent);

  const origPositions = new Float32Array(posAttr.count * 3);
  const restPositions = new Float32Array(posAttr.count * 3);
  const bindings = [];

  for (let i = 0; i < posAttr.count; i++) {
    const ox = posAttr.getX(i);
    const oy = posAttr.getY(i);
    const oz = posAttr.getZ(i);

    origPositions[i * 3]     = ox;
    origPositions[i * 3 + 1] = oy;
    origPositions[i * 3 + 2] = oz;

    let lx = (ox + offset.x) * autoScale;
    let ly = (oy + offset.y) * autoScale;
    let lz = (oz + offset.z) * autoScale;

    // Safety clamp within [-0.92, 0.92] lattice space
    lx = Math.max(-0.92, Math.min(0.92, lx));
    ly = Math.max(-0.92, Math.min(0.92, ly));
    lz = Math.max(-0.92, Math.min(0.92, lz));

    restPositions[i * 3]     = lx;
    restPositions[i * 3 + 1] = ly;
    restPositions[i * 3 + 2] = lz;

    bindings.push(physics.embed(lx, ly, lz));
  }

  return { origPositions, restPositions, bindings, scale: autoScale, offset };
}

/* ============================================================
 * 🍉 西瓜统一几何系统常数与变换矩阵
 * 100% 对齐 target-watermelon.jpg & shot-010.png
 * - 60° 扇形圆角块（非锐角），尖端平滑外凸无锐角，两底角圆滑过渡
 * - 鲜翠绿底波浪墨绿条纹外皮、白绿过渡层（Pith）、黑亮水滴瓜籽
 * ============================================================ */
export const MELON_PARAMS = {
  radius: 1.75,           // 扇形半径
  halfAngle: Math.PI / 6, // 30 degrees (总夹角 60°)
  tipRadius: 0.22,        // 尖端极其平滑外凸的圆角 (非锐角，绝不内凹)
  cornerRadius: 0.16,     // 两腰与外圆弧平滑圆角过渡
  depth: 0.52,            // 饱满厚切片厚度
  bevel: 0.08,            // 饱满圆角倒角
  centerY: 0.96,          // 几何中心对齐
  centerZ: 0.26,
  // 翠绿波浪外弧面展现在左前至正前方，尖端在右后方，顶面红肉饱满展现给镜头
  viewRotY: Math.PI * 0.76
};

function applyMelonTransform(geom) {
  geom.translate(0, -MELON_PARAMS.centerY, -MELON_PARAMS.centerZ);
  geom.rotateX(-Math.PI * 0.5); // lay flat: thickness is along Y
  geom.rotateY(MELON_PARAMS.viewRotY);
}

/* ============================================================
 * 🍉 1. 地道 60° 扇形圆角西瓜果冻 (Watermelon Slice)
 * 严格对齐 target-watermelon.jpg & shot-010.png：
 * - 尖端外凸平滑圆角（角平分线上切两腰），绝对无锐角
 * - 两腰平直切面，底角圆润过渡到外大圆弧
 * - 上下边缘全圆润 Fillet Bevel 倒角
 * ============================================================ */
export function createWatermelonGeometry() {
  const { radius, halfAngle, tipRadius, cornerRadius, depth, bevel } = MELON_PARAMS;
  const shape = new THREE.Shape();
  
  // 1. 尖端圆滑外凸圆角
  // 角平分线为 +Y 轴，夹角 60° (halfAngle = 30°)。
  // 圆心在 (0, 2 * tipRadius)，半径 tipRadius。
  const tipCenterY = 2.0 * tipRadius;
  const tRightX = tipRadius * Math.cos(Math.PI / 6); // tipRadius * sqrt(3)/2
  const tRightY = tipCenterY - tipRadius * Math.sin(Math.PI / 6); // 1.5 * tipRadius
  const tLeftX = -tRightX;
  const tLeftY = tRightY;

  // 从左切点开始
  shape.moveTo(tLeftX, tLeftY);
  // 顺时针经过尖端最底部 (0, tipRadius) 到右切点 (外凸平滑圆角，无锐角)
  shape.absarc(0, tipCenterY, tipRadius, Math.PI * 7 / 6, Math.PI * 11 / 6, false);

  // 2. 右侧切面直线
  const rayEndX = radius * Math.sin(halfAngle);
  const rayEndY = radius * Math.cos(halfAngle);
  const pCornerRayX = rayEndX - cornerRadius * Math.sin(halfAngle);
  const pCornerRayY = rayEndY - cornerRadius * Math.cos(halfAngle);
  shape.lineTo(pCornerRayX, pCornerRayY);

  // 3. 右外角平滑过渡圆角
  const arcRightAngle = Math.PI * 0.5 - halfAngle + 0.09;
  const arcRightX = radius * Math.cos(arcRightAngle);
  const arcRightY = radius * Math.sin(arcRightAngle);
  shape.quadraticCurveTo(rayEndX, rayEndY, arcRightX, arcRightY);

  // 4. 外侧大圆弧
  const arcLeftAngle = Math.PI * 0.5 + halfAngle - 0.09;
  shape.absarc(0, 0, radius, arcRightAngle, arcLeftAngle, false);

  // 5. 左外角平滑过渡圆角
  const rayLeftEndX = -rayEndX;
  const rayLeftEndY = rayEndY;
  const pLeftRayX = -pCornerRayX;
  const pLeftRayY = pCornerRayY;
  shape.quadraticCurveTo(rayLeftEndX, rayLeftEndY, pLeftRayX, pLeftRayY);

  // 6. 沿左侧切面引回左切点
  shape.lineTo(tLeftX, tLeftY);
  shape.closePath();

  const extrudeSettings = {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 36
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
 * 🍉 2. 顶面/底面高精贴图：鲜红果肉 + 白绿过渡层 + 水滴黑籽
 * 100% 对齐 target-watermelon.jpg 顶面层次与通透光泽
 * ============================================================ */
export function createMelonCapTexture(fleshColor = '#ff2a4b') {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // 底色填充柔和果肉红
  ctx.fillStyle = fleshColor;
  ctx.fillRect(0, 0, size, size);

  // 水灵果肉微漫射高光层
  const pulpG = ctx.createRadialGradient(size * 0.5, size * 0.45, 40, size * 0.5, size * 0.5, size * 0.6);
  pulpG.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  pulpG.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)');
  pulpG.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
  ctx.fillStyle = pulpG;
  ctx.fillRect(0, 0, size, size);

  // 绘制靠近外弧边缘的白绿过渡层 (Pith Transition Band) 与外皮绿边
  const rindR = size * 0.88;
  const cx = size * 0.5;
  const cy = size * 0.08;

  // 弧形白绿过渡层
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rindR + 10, 0, Math.PI, false);
  ctx.lineWidth = 150;
  const pithGrad = ctx.createLinearGradient(0, cy + rindR - 80, 0, cy + rindR + 10);
  pithGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  pithGrad.addColorStop(0.32, '#fecdd3'); // 浅粉红过渡
  pithGrad.addColorStop(0.62, '#ffffff'); // 纯奶白层
  pithGrad.addColorStop(0.84, '#bbf7d0'); // 浅青白绿
  pithGrad.addColorStop(1.0, '#278e38');  // 鲜翠绿边缘
  ctx.strokeStyle = pithGrad;
  ctx.stroke();

  // 最外侧翠绿果皮边缘封边
  ctx.beginPath();
  ctx.arc(cx, cy, rindR + 5, 0, Math.PI, false);
  ctx.lineWidth = 44;
  ctx.strokeStyle = '#278e38';
  ctx.stroke();
  ctx.restore();

  // 绘制 10 颗黑亮水滴形西瓜籽 (错落点缀在果肉中下部)
  const seedPositions = [
    { x: size * 0.50, y: size * 0.48, r: 18, rot: 0.1 },
    { x: size * 0.38, y: size * 0.42, r: 16, rot: -0.3 },
    { x: size * 0.62, y: size * 0.43, r: 16, rot: 0.25 },
    { x: size * 0.28, y: size * 0.52, r: 15, rot: -0.4 },
    { x: size * 0.72, y: size * 0.53, r: 15, rot: 0.35 },
    { x: size * 0.44, y: size * 0.62, r: 17, rot: -0.15 },
    { x: size * 0.56, y: size * 0.63, r: 17, rot: 0.18 },
    { x: size * 0.34, y: size * 0.70, r: 15, rot: -0.25 },
    { x: size * 0.66, y: size * 0.71, r: 15, rot: 0.22 },
    { x: size * 0.50, y: size * 0.78, r: 14, rot: 0.05 }
  ];

  for (const s of seedPositions) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    
    // 水滴西瓜籽主体 (黑亮、上尖下圆)
    ctx.beginPath();
    ctx.moveTo(0, -s.r * 1.3);
    ctx.bezierCurveTo(s.r * 0.85, -s.r * 0.4, s.r * 0.85, s.r * 0.9, 0, s.r);
    ctx.bezierCurveTo(-s.r * 0.85, s.r * 0.9, -s.r * 0.85, -s.r * 0.4, 0, -s.r * 1.3);
    ctx.closePath();
    
    ctx.fillStyle = '#111215';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fill();

    // 晶莹高光小白点
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.ellipse(s.r * 0.22, -s.r * 0.28, s.r * 0.18, s.r * 0.35, 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();

    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ============================================================
 * 🍉 3. 侧面高清贴图：鲜翠绿底波浪墨绿粗条纹外皮 + 通透红肉切面
 * ============================================================ */
export function createMelonSideTexture(fleshColor = '#ff2a4b') {
  const width = 2048, height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 切面区域底色：通透果肉红
  ctx.fillStyle = fleshColor;
  ctx.fillRect(0, 0, width, height);

  // 外圆弧外皮区域（位于中央 30% ~ 70% 区间）
  const arcLeft = width * 0.30;
  const arcRight = width * 0.70;
  const arcW = arcRight - arcLeft;

  // 1. 鲜翠绿底色 (#278e38 到 #2fa342)
  const rindG = ctx.createLinearGradient(arcLeft, 0, arcRight, 0);
  rindG.addColorStop(0, '#227830');
  rindG.addColorStop(0.12, '#2da03f');
  rindG.addColorStop(0.5, '#35af49');
  rindG.addColorStop(0.88, '#2da03f');
  rindG.addColorStop(1.0, '#227830');
  ctx.fillStyle = rindG;
  ctx.fillRect(arcLeft, 0, arcW, height);

  // 2. 手绘感深墨绿纵向波浪锯齿粗条纹 (#0d3915)
  const stripeCount = 10;
  ctx.fillStyle = '#0d3915';
  ctx.strokeStyle = '#0d3915';

  for (let i = 0; i < stripeCount; i++) {
    const cx = arcLeft + ((i + 0.5) / stripeCount) * arcW;
    const w = 38 + (i % 3) * 8; // stripe width

    ctx.beginPath();
    const wave1 = (i % 2 === 0 ? 1 : -1) * 32;
    const wave2 = (i % 2 === 0 ? -1 : 1) * 26;

    ctx.moveTo(cx - w * 0.5, 0);
    ctx.bezierCurveTo(cx - w * 0.45 + wave1, height * 0.32, cx - w * 0.55 + wave2, height * 0.68, cx - w * 0.48, height);
    ctx.lineTo(cx + w * 0.48, height);
    ctx.bezierCurveTo(cx + w * 0.55 + wave2, height * 0.68, cx + w * 0.45 + wave1, height * 0.32, cx + w * 0.5, 0);
    ctx.closePath();
    ctx.fill();

    // 墨晕锯齿边缘
    for (let step = 0; step < 7; step++) {
      const py = (step / 7) * height;
      const jitter = ((step % 2) - 0.5) * 10;
      ctx.fillRect(cx - w * 0.5 + jitter, py, 8, 28);
      ctx.fillRect(cx + w * 0.5 - jitter, py + 14, 8, 28);
    }
  }

  // 顶部白绿过渡层侧边自然光带 (靠近顶部倒角)
  const topPithG = ctx.createLinearGradient(0, 0, 0, 90);
  topPithG.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  topPithG.addColorStop(0.4, 'rgba(187, 247, 208, 0.28)');
  topPithG.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = topPithG;
  ctx.fillRect(arcLeft, 0, arcW, 90);

  // 摄影棚表面高光柔光带
  const sheen = ctx.createLinearGradient(0, 0, 0, height);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
  sheen.addColorStop(0.2, 'rgba(255, 255, 255, 0.05)');
  sheen.addColorStop(0.85, 'rgba(0, 0, 0, 0.04)');
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// 兼容接口保留
export function createWatermelonRindGeometry() { return new THREE.BufferGeometry(); }
export function createWatermelonPithGeometry() { return new THREE.BufferGeometry(); }
export function createMelonStripeTexture() { return createMelonSideTexture(); }
export function createMelonPithTexture() { return createMelonCapTexture(); }

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
 * 严格对齐 shot-006.png ！！！神还原：
 * - 趴卧在台面上的圆锥水滴形饱满身体
 * - 顶端生有一对宽大挺括的平滑菱形双肉鳍（小翅膀）
 * - 表面带有发光微星点果冻透光质感
 * ============================================================ */
export function createSquidGeometry() {
  const radialSegments = 44;
  const heightSegments = 40;
  const totalL = 1.75; // 身体轴向总长

  const geom = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let j = 0; j <= heightSegments; j++) {
    const v = j / heightSegments; // 0: 颈部触手端 (+Z) -> 1.0: 尾端顶尖 (-Z)
    // 轴向位置 (头部在 +Z ~ 0.42，顶尖尾部在 -Z ~ -1.15)
    const z = 0.42 - v * totalL;

    // 1. 水滴圆锥外套膜饱满曲线
    // 头部微束(0.28) -> 腹部圆润饱满(0.56) -> 顶端圆锥收细至顶尖
    const bodyR = 0.55 * Math.sin(Math.pow(v, 0.65) * Math.PI) * (1.08 - 0.25 * v) + 0.12 * Math.pow(1.0 - v, 1.5);

    // 2. 顶端菱形双肉鳍 (小翅膀 - 严格对齐 shot-006.png 宽阔挺括菱形翼展)
    // 肉鳍生长在顶端区域 v in [0.45, 0.98]，最大展宽在 v = 0.78 处
    let finSpan = 0;
    if (v >= 0.45 && v <= 0.98) {
      const fv = (v - 0.78) / 0.22;
      // 菱形轮廓：中间宽两头收尖
      const finCurve = Math.max(0, 1.0 - Math.abs(fv) * 1.05);
      finSpan = 0.72 * Math.pow(finCurve, 1.15); // 宽大菱形翼展
    }

    for (let i = 0; i <= radialSegments; i++) {
      const u = i / radialSegments;
      const phi = u * Math.PI * 2;

      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      // 横向沿 X 轴展开肉鳍
      const finWeight = Math.pow(Math.abs(cosP), 3.5);
      const curFin = finSpan * finWeight;

      // X 轴宽度（身体 + 肉鳍）
      const x = (bodyR + curFin) * Math.sign(cosP);

      // Y 轴高度（趴在桌面上，上下适度压扁呈饱满椭圆截面，肉鳍呈轻薄翼展）
      const finThin = Math.max(0.12, 1.0 - 0.75 * (curFin / (0.72 + 1e-5)));
      // 台面微抬高 (Y 约 0.18 ~ 0.42)
      const y = (bodyR * sinP * finThin) * 0.78 + 0.28;

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
 * 🦑 7. 鱿鱼萌眼与高光内核 (Squid Eyes & Bioluminescent Nucleus)
 * 严格对齐 shot-006.png：
 * - 头部两侧凸起乌黑水润大眼珠
 * - 明亮皎洁纯白圆形瞳孔高光 (Specular Highlight)
 * ============================================================ */
export function createSquidOrgans() {
  const group = new THREE.Group();

  // 1. 发光桃粉果冻心脏/内核 (Bioluminescent Core)
  const coreGeom = new THREE.SphereGeometry(0.22, 20, 16);
  coreGeom.scale(1.0, 0.75, 1.35);
  const coreMat = new THREE.MeshStandardMaterial({
    color: '#fb7185',
    emissive: '#f43f5e',
    emissiveIntensity: 1.5,
    roughness: 0.25,
    transparent: true,
    opacity: 0.8
  });
  const core = new THREE.Mesh(coreGeom, coreMat);
  core.position.set(0, 0.26, -0.22);
  group.add(core);

  // 2. 黑曜石萌趣大眼珠 (Glossy Jet-Black Beads) - 凸起于头部两侧
  const eyeGeom = new THREE.SphereGeometry(0.125, 20, 16);
  eyeGeom.scale(1.0, 1.15, 1.0);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: '#08080c',
    roughness: 0.02,
    metalness: 0.15
  });

  // 纯白圆形高光 (Specular Highlights) - 漫画级大高光
  const pupilGeom = new THREE.SphereGeometry(0.048, 14, 12);
  const pupilMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

  // 小辅助副高光
  const subPupilGeom = new THREE.SphereGeometry(0.022, 10, 8);
  const subPupilMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

  // Left Eye (趴卧姿态下位于左前侧 X: +0.36, Y: 0.29, Z: 0.16)
  const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
  leftEye.position.set(0.36, 0.29, 0.16);
  leftEye.rotation.set(0.22, 0.45, 0.12);

  const leftPupil = new THREE.Mesh(pupilGeom, pupilMat);
  leftPupil.position.set(0.038, 0.055, 0.10);
  leftEye.add(leftPupil);

  const leftSubPupil = new THREE.Mesh(subPupilGeom, subPupilMat);
  leftSubPupil.position.set(-0.035, -0.045, 0.10);
  leftEye.add(leftSubPupil);

  group.add(leftEye);

  // Right Eye (位于右前侧 X: -0.36, Y: 0.29, Z: 0.16)
  const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
  rightEye.position.set(-0.36, 0.29, 0.16);
  rightEye.rotation.set(0.22, -0.45, -0.12);

  const rightPupil = new THREE.Mesh(pupilGeom, pupilMat);
  rightPupil.position.set(-0.038, 0.055, 0.10);
  rightEye.add(rightPupil);

  const rightSubPupil = new THREE.Mesh(subPupilGeom, subPupilMat);
  rightSubPupil.position.set(0.035, -0.045, 0.10);
  rightEye.add(rightSubPupil);

  group.add(rightEye);

  return {
    group,
    core,
    leftEye,
    rightEye,
    leftEyeRest: [0.36, 0.29, 0.16],
    rightEyeRest: [-0.36, 0.29, 0.16],
    coreRest: [0, 0.26, -0.22]
  };
}

/* ============================================================
 * 🦑 8. 触须系统 (Tentacle System)
 * 严格对齐 shot-006.png ！！！
 * - 6 根向外波浪自然卷翘的短触须（平铺在台面上，带一粒粒小吸盘）
 * - 2 根长长的捕食触腕（Tentacles），向前延展，末端带有明显的肉粉色椭圆勺状掌 + 两排颗粒吸盘！
 * ============================================================ */
export function createTentacleMeshes(tentaclesCount = 8) {
  const meshes = [];

  const tentacleMat = new THREE.MeshPhysicalMaterial({
    color: '#ffedd5',
    roughness: 0.04,
    metalness: 0.0,
    transmission: 0.95,
    thickness: 1.6,
    ior: 1.39,
    attenuationColor: new THREE.Color('#f43f5e'),
    attenuationDistance: 1.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02
  });

  const suckerMat = new THREE.MeshStandardMaterial({
    color: '#fff1f2',
    roughness: 0.25,
    metalness: 0.05
  });

  const suckerGeom = new THREE.SphereGeometry(0.028, 8, 6);
  suckerGeom.scale(1.0, 0.6, 1.0);

  // 6 根短触须 + 2 根长触腕的 Rest Pose 曲线设定 (平铺趴卧在台面 Y ~ 0.04 上)
  // 触须在水平 X-Z 平面上展开
  for (let i = 0; i < tentaclesCount; i++) {
    const isLongTentacle = (i >= 6);
    const length = isLongTentacle ? 2.15 : 1.05;
    const topRadius = isLongTentacle ? 0.038 : 0.052;
    const bottomRadius = isLongTentacle ? 0.022 : 0.016;
    const radialSegments = 8;
    const heightSegments = isLongTentacle ? 26 : 18;

    const geom = new THREE.CylinderGeometry(bottomRadius, topRadius, length, radialSegments, heightSegments);
    geom.translate(0, -length * 0.5, 0);

    const pos = geom.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      const py = pos.getY(k);
      const progress = Math.max(0, Math.min(1.0, -py / length));

      if (isLongTentacle) {
        // 长触腕：前端纤细 S 弯波浪，在后段 0.72~1.0 膨大展开为勺状触须掌 (Paddle Club)
        const wave = Math.sin(progress * Math.PI * 1.5) * 0.06;
        pos.setX(k, pos.getX(k) + wave);

        if (progress > 0.72) {
          const clubFactor = Math.sin(((progress - 0.72) / 0.28) * Math.PI);
          // 勺状膨大展宽
          pos.setX(k, pos.getX(k) * (1.0 + clubFactor * 3.6));
          pos.setZ(k, pos.getZ(k) * (1.0 + clubFactor * 1.4));
        }
      } else {
        // 6 根短触手：优雅自然的外展卷翘弧度 (S-curve wave curls)
        const wave = Math.sin(progress * Math.PI * 1.6) * 0.14 * progress;
        pos.setX(k, pos.getX(k) + wave);
      }
    }
    geom.computeVertexNormals();

    const restPos = new Float32Array(geom.getAttribute('position').array);
    const mesh = new THREE.Mesh(geom, tentacleMat);
    mesh.frustumCulled = false;

    // 吸盘颗粒组
    const suckersGroup = new THREE.Group();
    const cupCount = isLongTentacle ? 14 : 7;
    for (let c = 1; c <= cupCount; c++) {
      const frac = isLongTentacle ? (0.72 + (c / cupCount) * 0.26) : (0.2 + (c / cupCount) * 0.75);
      const cy = -frac * length;
      const cup = new THREE.Mesh(suckerGeom, suckerMat);
      // 吸盘位置
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

/* ============================================================
 * 🍍 10. 菠萝圈专属几何与放射状微肌理系统
 * 严格对齐 shot-001.png target-watermelon 下方厚切菠萝圆片：
 * - 18 瓣菠萝眼凹凸波浪外缘 + 圆润平滑内去芯孔
 * - 上下厚度饱满带圆润倒角 (Fillet Bevel)
 * - 专属放射状果肉微纤维高精度贴图 (Radial pulp fibrous texture)
 * ============================================================ */
export function createPineappleRingGeometry() {
  const outerR = 1.25;
  const innerR = 0.44;
  const lobes = 18; // 18 瓣去眼外缘波浪
  const shape = new THREE.Shape();
  const nOut = 144;

  for (let i = 0; i < nOut; i++) {
    const a = (i / nOut) * Math.PI * 2;
    const wave = Math.sin(a * lobes) * 0.052;
    const r = outerR + wave;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const hole = new THREE.Path();
  const nIn = 72;
  for (let i = 0; i < nIn; i++) {
    const a = (i / nIn) * Math.PI * 2;
    const wave = Math.sin(a * lobes) * 0.012;
    const r = innerR + wave;
    const x = Math.cos(-a) * r; // 内孔顺时针
    const y = Math.sin(-a) * r;
    if (i === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  hole.closePath();
  shape.holes.push(hole);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.36,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.10,
    bevelSegments: 4,
    curveSegments: 36
  });
  geom.center();
  geom.rotateX(Math.PI / 2); // 平放在台面

  // 重置放射状投影 UV (以中心孔为圆心，UV 在 0~1)
  const pos = geom.getAttribute('position');
  const uvs = new Float32Array(pos.count * 2);
  const maxR = outerR + 0.15;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    uvs[i * 2] = px / (maxR * 2) + 0.5;
    uvs[i * 2 + 1] = pz / (maxR * 2) + 0.5;
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.computeVertexNormals();

  return geom;
}

export function createPineappleRadialTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;

  // 1. 金黄多汁通透菠萝底色 (径向柔和晕染)
  const bgGrad = ctx.createRadialGradient(cx, cy, 140, cx, cy, 500);
  bgGrad.addColorStop(0.0, '#fef08a'); // 内芯明亮透光黄
  bgGrad.addColorStop(0.35, '#facc15'); // 饱满菠萝果肉金黄
  bgGrad.addColorStop(0.72, '#f59e0b'); // 浓郁果汁蜜糖色
  bgGrad.addColorStop(1.0, '#d97706');  // 边缘深蜜色
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // 2. 放射状果肉微纤维束 (Radial pulp fiber strands)
  ctx.save();
  ctx.translate(cx, cy);
  const fibersCount = 360;
  for (let i = 0; i < fibersCount; i++) {
    const angle = (i / fibersCount) * Math.PI * 2 + (Math.sin(i * 3.7) * 0.008);
    const rStart = 150 + (i % 7) * 3;
    const rEnd = 485 + Math.sin(i * 18) * 12;
    const curW = 0.8 + (i % 5 === 0 ? 1.4 : 0.4);

    ctx.beginPath();
    ctx.lineWidth = curW;
    const isBright = (i % 3 === 0);
    ctx.strokeStyle = isBright ? 'rgba(254, 240, 138, 0.42)' : 'rgba(180, 83, 9, 0.22)';
    
    // 微弧放射线模拟天然果肉植物导管
    const x0 = Math.cos(angle) * rStart;
    const y0 = Math.sin(angle) * rStart;
    const cpAngle = angle + 0.02 * Math.sin(i * 0.5);
    const rMid = (rStart + rEnd) * 0.5;
    const cpx = Math.cos(cpAngle) * rMid;
    const cpy = Math.sin(cpAngle) * rMid;
    const x1 = Math.cos(angle) * rEnd;
    const y1 = Math.sin(angle) * rEnd;

    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cpx, cpy, x1, y1);
    ctx.stroke();
  }

  // 3. 菠萝果肉多汁微胞元 (Juice vesicles / micro-pore texture)
  for (let j = 0; j < 600; j++) {
    const a = Math.random() * Math.PI * 2;
    const r = 160 + Math.random() * 320;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    const rw = 2.5 + Math.random() * 4.5;
    const rh = 1.2 + Math.random() * 2.8;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = Math.random() > 0.4 ? 'rgba(255, 255, 255, 0.35)' : 'rgba(217, 119, 6, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 4. 同心微年轮晕染
  for (let k = 1; k <= 4; k++) {
    ctx.beginPath();
    ctx.arc(0, 0, 160 + k * 75, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.restore();

  // 5. 内孔与外圈自然半透暗调
  const holeDark = ctx.createRadialGradient(cx, cy, 140, cx, cy, 175);
  holeDark.addColorStop(0.0, 'rgba(180, 83, 9, 0.45)');
  holeDark.addColorStop(1.0, 'rgba(180, 83, 9, 0.0)');
  ctx.fillStyle = holeDark;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ============================================================
 * 🧸 11. 经典软糖小熊 (Gummy Bear 萌趣圆滚滚造型系统)
 * - 饱满圆润大头 + Q 萌小圆耳 (内耳浅窝) + 凸起萌吻 (Snout)
 * - 圆滚滚小肚腩 + 肉乎乎小短手 + 敦实微翘坐姿脚掌
 * - 全网格高精度平滑焊接 (mergeVertices) + 法线重新计算
 * ============================================================ */
export function createGummyBearGeometry() {
  const parts = [];

  const addPart = (geom, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
    geom.scale(sx, sy, sz);
    if (rx) geom.rotateX(rx);
    if (ry) geom.rotateY(ry);
    if (rz) geom.rotateZ(rz);
    geom.translate(x, y, z);
    parts.push(geom);
  };

  // 1. 身体与圆滚滚小肚腩 (Belly & Torso) - 饱满椭球，前凸憨厚小肚子
  addPart(new THREE.SphereGeometry(0.72, 28, 22), 0, -0.32, 0.04, 1.05, 1.15, 0.95);
  addPart(new THREE.SphereGeometry(0.52, 22, 18), 0, -0.35, 0.28, 0.95, 0.95, 0.65); // 肚腩肉肉凸起

  // 2. 萌萌大头 (Head) - 幼态饱满扁圆
  addPart(new THREE.SphereGeometry(0.58, 28, 22), 0, 0.62, 0.02, 1.08, 0.98, 0.95);

  // 3. 凸起口吻部 (Snout / Muzzle)
  addPart(new THREE.SphereGeometry(0.24, 20, 16), 0, 0.52, 0.42, 1.15, 0.85, 0.85);

  // 4. Q 萌双耳 (Ears) - 圆润外耳 + 内耳窝
  addPart(new THREE.SphereGeometry(0.22, 18, 14), -0.44, 1.06, 0.02, 0.95, 0.95, 0.65, 0, 0, 0.25);
  addPart(new THREE.SphereGeometry(0.22, 18, 14), 0.44, 1.06, 0.02, 0.95, 0.95, 0.65, 0, 0, -0.25);

  // 5. 肉乎乎双手前爪 (Arms) - 微向前抱
  addPart(new THREE.SphereGeometry(0.26, 18, 14), -0.66, -0.16, 0.16, 0.82, 1.25, 0.82, 0.2, 0, 0.35);
  addPart(new THREE.SphereGeometry(0.26, 18, 14), 0.66, -0.16, 0.16, 0.82, 1.25, 0.82, 0.2, 0, -0.35);

  // 6. 粗短小腿与肉肉脚掌 (Legs & Feet) - 稳稳坐在台面上，脚掌微翘
  addPart(new THREE.SphereGeometry(0.32, 20, 16), -0.38, -0.92, 0.22, 0.92, 0.88, 1.25, -0.1, 0, 0.05);
  addPart(new THREE.SphereGeometry(0.32, 20, 16), 0.38, -0.92, 0.22, 0.92, 0.88, 1.25, -0.1, 0, -0.05);

  // 7. 小熊圆圆短短尾巴 (Tail)
  addPart(new THREE.SphereGeometry(0.16, 14, 12), 0, -0.72, -0.64, 1.0, 1.0, 0.85);

  // 顶点融合合并
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

  const rawGeom = new THREE.BufferGeometry();
  rawGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rawGeom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  rawGeom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  rawGeom.setIndex(new THREE.BufferAttribute(idx, 1));

  // 焊接多部件并重新平滑法线
  rawGeom.deleteAttribute('normal');
  rawGeom.deleteAttribute('uv');
  const welded = mergeVertices(rawGeom, 0.0001);
  rawGeom.dispose();
  welded.computeVertexNormals();

  // 整体居中微调使底部平稳着陆在台面上
  welded.center();
  welded.translate(0, 0.12, 0);

  return welded;
}

export function createGummyBearFace() {
  const followers = [];
  // 黑亮晶莹小眼睛 (黑巧圆滴)
  const eyeGeo = new THREE.SphereGeometry(0.062, 14, 10);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x1c1917,
    roughness: 0.15,
    metalness: 0.1
  });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  followers.push({ mesh: leftEye, restPos: [-0.18, 0.68, 0.44] });
  followers.push({ mesh: rightEye, restPos: [0.18, 0.68, 0.44] });

  // 萌萌小鼻子 (小黑滴)
  const noseGeo = new THREE.SphereGeometry(0.054, 14, 10);
  noseGeo.scale(1.2, 0.85, 0.9);
  const noseMat = new THREE.MeshStandardMaterial({
    color: 0x1c1917,
    roughness: 0.2
  });
  const noseMesh = new THREE.Mesh(noseGeo, noseMat);
  followers.push({ mesh: noseMesh, restPos: [0, 0.54, 0.62] });

  return followers;
}

/* ============================================================
 * 🥮 12. 08 冰皮月饼捏捏 · 月柔 (SOFT MOON 盛世八瓣宝相莲花浮雕 + 20 齿圆润波浪裙边)
 * 严格对齐殿下最新参考截图：
 * - 顶面八瓣宝相花/莲花立体浮雕压纹 (真实 3D 几何立体起伏)
 * - 侧面 20 齿圆润波浪裙边 (Fluted Rim)
 * - 绝美三层垂直渐变色：顶层鲜荔枝玫瑰粉 ➔ 中层奶黄落日橙 ➔ 底层冰白微蓝玉光 (Opal / Fresnel)
 * - 5 种高阶风味系统：玫瑰芭乐、落日橙、冰川海盐、开心果抹茶、芋泥啵啵
 * ============================================================ */
export const MOONCAKE_FLAVORS = {
  rose_guava: {
    id: 'rose_guava',
    name: '玫瑰芭乐',
    dot: 'linear-gradient(135deg, #f43f5e, #fde047, #e0f2fe)',
    cardBg: '#fff1f2',
    topColor: '#f43f5e',   // 顶层鲜荔枝玫瑰粉
    midColor: '#fde047',   // 中层奶黄落日橙
    botColor: '#e0f2fe',   // 底层与边缘冰白微蓝玉光
    attenuationColor: '#f43f5e',
    baseColor: '#fff1f2',
    fresnelCyan: [0.68, 0.88, 1.0]
  },
  sunset_orange: {
    id: 'sunset_orange',
    name: '落日橙',
    dot: 'linear-gradient(135deg, #ea580c, #fbbf24, #fef3c7)',
    cardBg: '#fffbeb',
    topColor: '#ea580c',   // 暖金落日橙
    midColor: '#fbbf24',   // 蜜杏黄
    botColor: '#fef3c7',   // 香草奶白
    attenuationColor: '#ea580c',
    baseColor: '#fffbeb',
    fresnelCyan: [1.0, 0.92, 0.72]
  },
  glacier_salt: {
    id: 'glacier_salt',
    name: '冰川海盐',
    dot: 'linear-gradient(135deg, #0284c7, #38bdf8, #f0f9ff)',
    cardBg: '#f0f9ff',
    topColor: '#0284c7',   // 深海冰蓝
    midColor: '#38bdf8',   // 薄荷天青
    botColor: '#f0f9ff',   // 冰川霜白
    attenuationColor: '#0284c7',
    baseColor: '#f0f9ff',
    fresnelCyan: [0.65, 0.92, 1.0]
  },
  pistachio_matcha: {
    id: 'pistachio_matcha',
    name: '开心果抹茶',
    dot: 'linear-gradient(135deg, #16a34a, #a3e635, #f0fdf4)',
    cardBg: '#f0fdf4',
    topColor: '#16a34a',   // 抹茶绿
    midColor: '#a3e635',   // 奶香开心果黄绿
    botColor: '#f0fdf4',   // 玉露冰白
    attenuationColor: '#16a34a',
    baseColor: '#f0fdf4',
    fresnelCyan: [0.72, 0.98, 0.82]
  },
  taro_boba: {
    id: 'taro_boba',
    name: '芋泥啵啵',
    dot: 'linear-gradient(135deg, #9333ea, #c084fc, #faf5ff)',
    cardBg: '#faf5ff',
    topColor: '#9333ea',   // 香芋紫
    midColor: '#c084fc',   // 浅芋奶紫
    botColor: '#faf5ff',   // 椰奶雪白
    attenuationColor: '#9333ea',
    baseColor: '#faf5ff',
    fresnelCyan: [0.85, 0.80, 1.0]
  }
};

export function createMooncakeGeometry() {
  const flutes = 20;     // 20 齿圆润波浪裙边
  const petals = 8;      // 8 瓣宝相莲花立体浮雕
  const rTop = 1.15;     // 顶半径
  const rBot = 1.22;     // 底半径
  const height = 0.74;   // 厚实饱满高度
  const halfH = height / 2;
  const fluteAmp = 0.054;// 裙边波浪齿深

  const nTh = 160;       // 极角细分 (能整除 20 齿与 8 瓣)
  const nR = 40;         // 顶底面径向细分
  const nY = 32;         // 侧面高度细分

  const vertices = [];
  const uvs = [];
  const indices = [];

  // 1. 顶面网格 (圆盘，叠加真实的八瓣宝相莲花立体几何浮雕)
  // 中心点
  const topCenterIdx = 0;
  vertices.push(0, halfH + 0.045, 0); // 中心花蕊顶端略高
  uvs.push(0.5, 0.5);

  const topRingStart = 1;
  for (let ri = 1; ri <= nR; ri++) {
    const fracR = ri / nR;
    const rBase = fracR * rTop;

    for (let ti = 0; ti < nTh; ti++) {
      const theta = (ti / nTh) * Math.PI * 2;
      
      // 边缘波浪与 20 齿裙边自然咬合过渡
      const fluteInfluence = Math.pow(fracR, 4.0) * (fluteAmp * Math.cos(flutes * theta));
      const curR = rBase + fluteInfluence;

      // --- 八瓣宝相莲花 3D 浮雕立体位移计算 ---
      let deltaY = 0;

      if (fracR <= 0.16) {
        // 中心花蕊环与微凹槽
        const pCore = fracR / 0.16;
        deltaY = 0.045 * Math.cos(pCore * Math.PI) - (pCore > 0.7 ? 0.012 : 0);
      } else if (fracR <= 0.75) {
        // 八瓣宝相花展开花瓣 (外扩、起伏、中轴棱脊)
        const pPetal = (fracR - 0.16) / 0.59; // 0 ~ 1
        const petalShape = Math.sin(pPetal * Math.PI); // 花瓣饱满隆起
        const petalAngleCos = Math.max(0, Math.cos((petals * theta) / 2));
        const ridgeCos = Math.max(0, Math.cos(petals * theta));

        // 莲花立体肉感隆起 + 花瓣中央棱脊
        deltaY = 0.062 * Math.pow(petalAngleCos, 3.2) * petalShape
               + 0.038 * Math.pow(ridgeCos, 4.0) * Math.pow(petalShape, 1.5);
      } else if (fracR <= 0.94) {
        // 外圈如意云纹波浪边饰 (16 瓣微如意波浪)
        const pCloud = (fracR - 0.75) / 0.19;
        const cloudShape = Math.sin(pCloud * Math.PI);
        deltaY = 0.026 * Math.cos(petals * 2 * theta) * cloudShape;
      } else {
        // 边缘 Fillet 倒角顺滑过渡
        const pEdge = (fracR - 0.94) / 0.06;
        deltaY = -0.045 * Math.pow(pEdge, 2.0);
      }

      const vx = Math.cos(theta) * curR;
      const vz = Math.sin(theta) * curR;
      const vy = halfH + deltaY;

      vertices.push(vx, vy, vz);
      uvs.push(vx / (rBot * 2.5) + 0.5, vz / (rBot * 2.5) + 0.5);
    }
  }

  // 顶面索引构建
  // 第一圈连接中心点
  for (let ti = 0; ti < nTh; ti++) {
    const nextTi = (ti + 1) % nTh;
    indices.push(topCenterIdx, topRingStart + ti, topRingStart + nextTi);
  }
  // 其余同心环连接
  for (let ri = 1; ri < nR; ri++) {
    const ringA = topRingStart + (ri - 1) * nTh;
    const ringB = topRingStart + ri * nTh;
    for (let ti = 0; ti < nTh; ti++) {
      const nextTi = (ti + 1) % nTh;
      const a0 = ringA + ti, a1 = ringA + nextTi;
      const b0 = ringB + ti, b1 = ringB + nextTi;
      indices.push(a0, b0, a1);
      indices.push(a1, b0, b1);
    }
  }

  // 2. 侧面 20 齿圆润波浪裙边 (Wall with 20 flutes and rounded corners)
  const wallStartIdx = vertices.length / 3;
  for (let yi = 0; yi <= nY; yi++) {
    const fracY = yi / nY; // 0 (顶) -> 1 (底)
    const curY = halfH - fracY * height;

    // 半径随高度微锥度展开 (顶小底大，增强视觉稳重感)
    const baseR = rTop + fracY * (rBot - rTop);

    // 顶角和底角的 Fillet 圆角平滑因子
    let cornerFillet = 1.0;
    if (fracY < 0.12) {
      cornerFillet = 0.94 + 0.06 * Math.sin((fracY / 0.12) * (Math.PI / 2));
    } else if (fracY > 0.88) {
      cornerFillet = 0.94 + 0.06 * Math.sin(((1.0 - fracY) / 0.12) * (Math.PI / 2));
    }

    for (let ti = 0; ti < nTh; ti++) {
      const theta = (ti / nTh) * Math.PI * 2;
      // 20 齿圆润波浪起伏
      const fluteWave = fluteAmp * Math.cos(flutes * theta);
      const curR = (baseR + fluteWave) * cornerFillet;

      const vx = Math.cos(theta) * curR;
      const vz = Math.sin(theta) * curR;

      vertices.push(vx, curY, vz);
      uvs.push(ti / nTh, fracY);
    }
  }

  // 连接顶面外圈与侧面顶层
  const topEdgeStart = topRingStart + (nR - 1) * nTh;
  for (let ti = 0; ti < nTh; ti++) {
    const nextTi = (ti + 1) % nTh;
    const t0 = topEdgeStart + ti, t1 = topEdgeStart + nextTi;
    const w0 = wallStartIdx + ti, w1 = wallStartIdx + nextTi;
    indices.push(t0, w0, t1);
    indices.push(t1, w0, w1);
  }

  // 侧面网格四边形连接
  for (let yi = 0; yi < nY; yi++) {
    const rowA = wallStartIdx + yi * nTh;
    const rowB = wallStartIdx + (yi + 1) * nTh;
    for (let ti = 0; ti < nTh; ti++) {
      const nextTi = (ti + 1) % nTh;
      const a0 = rowA + ti, a1 = rowA + nextTi;
      const b0 = rowB + ti, b1 = rowB + nextTi;
      indices.push(a0, b0, a1);
      indices.push(a1, b0, b1);
    }
  }

  // 3. 底面网格 (圆盘平底，微内凹 0.015 确保稳固平放)
  const botWallEdgeStart = wallStartIdx + nY * nTh;
  const botCenterIdx = vertices.length / 3;
  vertices.push(0, -halfH + 0.015, 0); // 底心微内凹
  uvs.push(0.5, 0.5);

  const botRingStart = botCenterIdx + 1;
  for (let ri = 1; ri <= 10; ri++) {
    const fracR = ri / 10;
    const rBase = fracR * rBot;
    for (let ti = 0; ti < nTh; ti++) {
      const theta = (ti / nTh) * Math.PI * 2;
      const fluteInfluence = Math.pow(fracR, 3.0) * (fluteAmp * Math.cos(flutes * theta));
      const curR = (rBase + fluteInfluence) * 0.94;
      const vx = Math.cos(theta) * curR;
      const vz = Math.sin(theta) * curR;
      const vy = -halfH + (1.0 - fracR) * 0.015;

      vertices.push(vx, vy, vz);
      uvs.push(vx / (rBot * 2.5) + 0.5, vz / (rBot * 2.5) + 0.5);
    }
  }

  // 连接底面中心与第一圈
  for (let ti = 0; ti < nTh; ti++) {
    const nextTi = (ti + 1) % nTh;
    indices.push(botCenterIdx, botRingStart + nextTi, botRingStart + ti);
  }
  // 底面同心环连接
  for (let ri = 1; ri < 10; ri++) {
    const ringA = botRingStart + (ri - 1) * nTh;
    const ringB = botRingStart + ri * nTh;
    for (let ti = 0; ti < nTh; ti++) {
      const nextTi = (ti + 1) % nTh;
      const a0 = ringA + ti, a1 = ringA + nextTi;
      const b0 = ringB + ti, b1 = ringB + nextTi;
      indices.push(a0, a1, b0);
      indices.push(a1, b1, b0);
    }
  }
  // 连接底面最外圈与侧面下边缘
  const botOuterStart = botRingStart + 9 * nTh;
  for (let ti = 0; ti < nTh; ti++) {
    const nextTi = (ti + 1) % nTh;
    const bo0 = botOuterStart + ti, bo1 = botOuterStart + nextTi;
    const bw0 = botWallEdgeStart + ti, bw1 = botWallEdgeStart + nextTi;
    indices.push(bw0, bw1, bo0);
    indices.push(bw1, bo1, bo0);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);

  // 焊接极近顶点并重新计算完美法线
  const welded = mergeVertices(geom, 0.0001);
  geom.dispose();
  welded.computeVertexNormals();

  // 居中至桌面接触平面上方
  welded.center();
  const box = new THREE.Box3().setFromBufferAttribute(welded.getAttribute('position'));
  welded.translate(0, -box.min.y + 0.02, 0);

  return welded;
}

export function createMooncakeMaterial(flavorKey = 'rose_guava') {
  const flavor = MOONCAKE_FLAVORS[flavorKey] || MOONCAKE_FLAVORS.rose_guava;

  const topC = new THREE.Color(flavor.topColor);
  const midC = new THREE.Color(flavor.midColor);
  const botC = new THREE.Color(flavor.botColor);

  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(flavor.baseColor),
    transmission: 0.95,
    thickness: 2.6,
    roughness: 0.05,
    metalness: 0.0,
    ior: 1.43,
    attenuationColor: new THREE.Color(flavor.attenuationColor),
    attenuationDistance: 1.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    vertexColors: true,
    side: THREE.FrontSide
  });
  if ('dispersion' in mat) mat.dispersion = 0.055;

  // 注入欧泊玉光 (Opal / Fresnel Glow) 到着色器中
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFresnelCyan = { value: new THREE.Vector3(...flavor.fresnelCyan) };

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      uniform vec3 uFresnelCyan;
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      #include <dithering_fragment>
      // 欧泊玉光次表面晕染：在边缘掠射角散发出冰蓝玉石微光
      vec3 viewDir_opal = normalize(vViewPosition);
      vec3 normalDir_opal = normalize(vNormal);
      float fresnel_val = pow(1.0 - abs(dot(viewDir_opal, normalDir_opal)), 2.6);
      vec3 opalGlow = uFresnelCyan * fresnel_val * 0.38;
      gl_FragColor.rgb += opalGlow;
      `
    );
  };

  return { mat, flavor };
}

// 应用三层垂直渐变色顶点颜色到几何体
export function applyMooncakeGradientColors(geometry, flavorKey = 'rose_guava') {
  const flavor = MOONCAKE_FLAVORS[flavorKey] || MOONCAKE_FLAVORS.rose_guava;
  const pos = geometry.getAttribute('position');
  const count = pos.count;

  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const rangeY = Math.max(0.001, maxY - minY);

  const cTop = new THREE.Color(flavor.topColor);
  const cMid = new THREE.Color(flavor.midColor);
  const cBot = new THREE.Color(flavor.botColor);

  const colors = new Float32Array(count * 3);
  const cCur = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const h = (pos.getY(i) - minY) / rangeY; // 0 (底) ~ 1 (顶)

    if (h < 0.35) {
      // 底层冰白微蓝 ➔ 中层奶黄落日橙
      const t = Math.min(1, Math.max(0, h / 0.35));
      const smoothT = t * t * (3 - 2 * t);
      cCur.copy(cBot).lerp(cMid, smoothT);
    } else {
      // 中层奶黄落日橙 ➔ 顶层鲜荔枝玫瑰粉
      const t = Math.min(1, Math.max(0, (h - 0.35) / 0.65));
      const smoothT = t * t * (3 - 2 * t);
      cCur.copy(cMid).lerp(cTop, smoothT);
    }

    colors[i * 3]     = cCur.r;
    colors[i * 3 + 1] = cCur.g;
    colors[i * 3 + 2] = cCur.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.attributes.color.needsUpdate = true;
}

/* ============================================================
 * 🍊 13. 橘子切切 (Orange Slices & Pith Veins System)
 * 严格对齐 shot-026.png：
 * - 饱满圆润厚切橘瓣几何体（带细腻圆角倒角 Fillet Bevel）
 * - 橙黄半透明果肉 + 真实白色经络（橘络主脉与网状分叉白丝）
 * - 真实 3D 宽刃大菜刀（金属拉丝刀身+刀背折角+胡桃木手柄）
 * ============================================================ */

// 1. 白色经络（橘络）高精度贴图生成器 (1024x1024)
export function createOrangePithTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // 底色：晶莹透亮蜜柑橙肉质感
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0.0, '#fb923c'); // 鲜亮橘黄
  grad.addColorStop(0.5, '#f97316'); // 浓郁蜜柑橙
  grad.addColorStop(1.0, '#ea580c'); // 深橙果肉
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // 绘制果肉内部微细多汁囊包（Juice Vesicles）微粒子
  for (let i = 0; i < 900; i++) {
    const vx = Math.random() * size;
    const vy = Math.random() * size;
    const vr = 2 + Math.random() * 5;
    ctx.fillStyle = Math.random() > 0.4 ? 'rgba(254, 215, 170, 0.28)' : 'rgba(194, 65, 12, 0.22)';
    ctx.beginPath();
    ctx.ellipse(vx, vy, vr * 1.5, vr * 0.8, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // 绘制神还原 shot-026.png 的白色经络（橘络 White Pith Veins）
  ctx.save();
  ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
  ctx.shadowBlur = 4;

  // 主干纵向/横向主脉络（粗白丝）
  const mainVeins = [
    { x0: 80, y0: 520, cp1x: 320, cp1y: 490, cp2x: 680, cp2y: 530, x1: 960, y1: 510, w: 9 },
    { x0: 240, y0: 500, cp1x: 420, cp1y: 260, cp2x: 580, cp2y: 180, x1: 780, y1: 120, w: 7 },
    { x0: 512, y0: 510, cp1x: 490, cp1y: 720, cp2x: 530, cp2y: 860, x1: 520, y1: 980, w: 7 },
    { x0: 380, y0: 320, cp1x: 280, cp1y: 220, cp2x: 200, cp2y: 160, x1: 140, y1: 120, w: 5.5 },
    { x0: 620, y0: 340, cp1x: 740, cp1y: 260, cp2x: 820, cp2y: 210, x1: 900, y1: 180, w: 5.5 },
  ];

  for (const v of mainVeins) {
    ctx.beginPath();
    ctx.moveTo(v.x0, v.y0);
    ctx.bezierCurveTo(v.cp1x, v.cp1y, v.cp2x, v.cp2y, v.x1, v.y1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = v.w;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 经络中心高亮纯白细核
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = v.w * 0.45;
    ctx.stroke();
  }

  // 放射状网络细丝经络（Branching Fiber Strands）
  const branches = 48;
  for (let b = 0; b < branches; b++) {
    const startX = 120 + Math.random() * 780;
    const startY = 400 + Math.random() * 240;
    const angle = (Math.random() - 0.5) * Math.PI * 0.85 + (b % 2 === 0 ? -Math.PI / 2 : Math.PI / 2);
    const length = 60 + Math.random() * 180;
    const endX = startX + Math.cos(angle) * length;
    const endY = startY + Math.sin(angle) * length;
    const cpX = (startX + endX) * 0.5 + (Math.random() - 0.5) * 45;
    const cpY = (startY + endY) * 0.5 + (Math.random() - 0.5) * 45;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(cpX, cpY, endX, endY);
    ctx.strokeStyle = Math.random() > 0.3 ? 'rgba(255, 255, 255, 0.88)' : 'rgba(254, 243, 199, 0.75)';
    ctx.lineWidth = 2.2 + Math.random() * 3.2;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // 边缘白色包衣膜微晕光
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 14;
  ctx.strokeRect(8, 8, size - 16, size - 16);

  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 2. 单段饱满圆角橘子瓣切块几何体
export function createOrangeSliceGeometry(width = 0.88, height = 1.25, thickness = 0.32) {
  // 橘瓣切面形状：背部圆弧饱满，两侧对称收敛成圆滑内尖端
  const shape = new THREE.Shape();
  const halfW = width * 0.5;
  const topY = height * 0.55;
  const botY = -height * 0.45;

  // 内尖端圆弧底
  shape.moveTo(0, botY);
  // 右侧内壁向外拱出饱满果肉
  shape.bezierCurveTo(halfW * 0.42, botY + 0.15, halfW * 1.05, topY * 0.2, halfW, topY * 0.75);
  // 背部圆弧脊
  shape.bezierCurveTo(halfW * 0.75, topY, halfW * 0.3, topY + 0.08, 0, topY + 0.08);
  // 左侧对称曲线
  shape.bezierCurveTo(-halfW * 0.3, topY + 0.08, -halfW * 0.75, topY, -halfW, topY * 0.75);
  shape.bezierCurveTo(-halfW * 1.05, topY * 0.2, -halfW * 0.42, botY + 0.15, 0, botY);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.065,
    bevelSize: 0.055,
    bevelOffset: -0.01,
    bevelSegments: 4,
    curveSegments: 28
  });

  geom.center();
  geom.computeVertexNormals();
  return geom;
}

// 3. 真实 3D 宽刃大菜刀 (严格对齐 shot-026.png 左上方)
export function createKitchenKnifeMesh() {
  const group = new THREE.Group();

  // (1) 宽大金属刀身 (Blade)
  const bladeShape = new THREE.Shape();
  // 刀长 2.5，刀宽 1.05
  bladeShape.moveTo(0, 0);
  bladeShape.lineTo(2.35, 0); // 平直锋刃底线
  bladeShape.lineTo(2.42, 0.45); // 刀尖轻微圆弧收起
  bladeShape.lineTo(2.28, 1.05); // 刀头斜切折角 (对齐 shot-026)
  bladeShape.lineTo(0, 1.05); // 平直刀背
  bladeShape.lineTo(0, 0); // 刀根

  const bladeGeom = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.026,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2
  });
  bladeGeom.center();
  // 调整原点在刀身中央微偏刀根
  bladeGeom.translate(0.5, 0, 0);

  // 金属拉丝灰调刀面材质
  const bladeMat = new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    metalness: 0.88,
    roughness: 0.22,
    envMapIntensity: 1.4
  });
  const bladeMesh = new THREE.Mesh(bladeGeom, bladeMat);
  group.add(bladeMesh);

  // 刀刃刃线高亮锋边 (Cutting Edge Strip)
  const edgeGeom = new THREE.BoxGeometry(2.4, 0.045, 0.032);
  const edgeMat = new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    metalness: 0.95,
    roughness: 0.08
  });
  const edgeMesh = new THREE.Mesh(edgeGeom, edgeMat);
  edgeMesh.position.set(0.55, -0.51, 0);
  group.add(edgeMesh);

  // (2) 刀柄锁箍 (Bolster)
  const bolsterGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.15, 16);
  bolsterGeom.rotateZ(Math.PI / 2);
  const bolsterMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    metalness: 0.92,
    roughness: 0.18
  });
  const bolster = new THREE.Mesh(bolsterGeom, bolsterMat);
  bolster.position.set(-0.76, 0.18, 0);
  group.add(bolster);

  // (3) 深胡桃木实木刀柄 (Wooden Handle)
  const handleGeom = new THREE.CylinderGeometry(0.11, 0.125, 1.15, 18);
  handleGeom.scale(1.0, 1.0, 0.82); // 扁椭圆手握手感
  handleGeom.rotateZ(Math.PI / 2);
  const handleMat = new THREE.MeshStandardMaterial({
    color: '#3e1a06', // 深胡桃木色
    roughness: 0.55,
    metalness: 0.05
  });
  const handle = new THREE.Mesh(handleGeom, handleMat);
  handle.position.set(-1.38, 0.18, 0);
  group.add(handle);

  // 刀柄双金属铆钉 (Rivets)
  const rivetGeom = new THREE.CylinderGeometry(0.024, 0.024, 0.19, 12);
  rivetGeom.rotateX(Math.PI / 2);
  const rivetMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.9, roughness: 0.2 });
  const rivet1 = new THREE.Mesh(rivetGeom, rivetMat);
  rivet1.position.set(-1.18, 0.18, 0);
  const rivet2 = new THREE.Mesh(rivetGeom, rivetMat);
  rivet2.position.set(-1.56, 0.18, 0);
  group.add(rivet1, rivet2);

  // 整体比例缩放与坐标归正
  group.scale.setScalar(1.22);
  return group;
}

/* ============================================================
 * 🎲 14. 果冻骰子真实点数内凹系统 (Indented Pips System)
 * 严格对齐殿下要求：
 * - Q 弹圆角立方体
 * - 点数凹陷（半球形内凹圆坑 + 内壁阴影 + 朱红1点/深炭灰2~6点）
 * ============================================================ */
export function createDicePipIndentMeshes() {
  const pips = [];
  // 半球内凹坑几何体（内扣半球，法线朝内）
  const indentGeom = new THREE.SphereGeometry(0.115, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
  indentGeom.scale(1.0, 0.65, 1.0); // 适度扁平内凹深度

  const redMat = new THREE.MeshStandardMaterial({
    color: '#dc2626', // 1点正统大朱红
    roughness: 0.32,
    metalness: 0.05
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: '#1e293b', // 2~6点深炭黑灰
    roughness: 0.28,
    metalness: 0.1
  });

  // 标准骰子相对面点数之和为 7：
  // 顶(1)对底(6), 前(2)对后(5), 右(3)对左(4)
  const H = 0.925; // 半立方体边长表面位置
  const pipSpacing = 0.44;

  const PIP_PATTERNS = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };

  const FACES = [
    { num: 1, n: new THREE.Vector3(0, 1, 0),  u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), mat: redMat },  // Top 1
    { num: 6, n: new THREE.Vector3(0, -1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1), mat: darkMat },// Bottom 6
    { num: 2, n: new THREE.Vector3(0, 0, 1),  u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), mat: darkMat }, // Front 2
    { num: 5, n: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(-1, 0, 0), v: new THREE.Vector3(0, 1, 0), mat: darkMat },// Back 5
    { num: 3, n: new THREE.Vector3(1, 0, 0),  u: new THREE.Vector3(0, 0, -1), v: new THREE.Vector3(0, 1, 0), mat: darkMat },// Right 3
    { num: 4, n: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0), mat: darkMat }, // Left 4
  ];

  for (const face of FACES) {
    const coords = PIP_PATTERNS[face.num];
    const isOne = (face.num === 1);
    const radiusScale = isOne ? 1.45 : 1.0; // 1点大红心凹坑更大

    for (const [px, py] of coords) {
      const pos = new THREE.Vector3()
        .copy(face.n).multiplyScalar(H)
        .addScaledVector(face.u, px * pipSpacing)
        .addScaledVector(face.v, py * pipSpacing);

      // 内凹朝向：凹坑向内沉陷，法线背向面法向量
      const mesh = new THREE.Mesh(indentGeom, face.mat);
      mesh.scale.set(radiusScale, radiusScale, radiusScale);
      
      // 使半球碗底朝内沉陷
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), face.n.clone().negate());
      mesh.position.copy(pos);

      // 添加内凹微暗影晕圈增加立体深度
      pips.push({
        mesh,
        restPos: [pos.x, pos.y, pos.z],
        faceNum: face.num
      });
    }
  }

  return pips;
}

/* ============================================================
 * 🍈 07 全果大条纹西瓜贴图 (严格对照 shot-004.png)
 * 鲜翠绿底色 (#2ca244) + 12 条墨绿波浪纵向粗条纹 (#0d3a16)
 * ============================================================ */
export function createWholeMelonTexture() {
  const width = 1024, height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. 鲜翠绿底色
  ctx.fillStyle = '#2ca244';
  ctx.fillRect(0, 0, width, height);

  // 斑驳有机果皮微质感
  const bgGrad = ctx.createLinearGradient(0, 0, width, 0);
  bgGrad.addColorStop(0, '#26933c');
  bgGrad.addColorStop(0.35, '#35af4f');
  bgGrad.addColorStop(0.7, '#2ca244');
  bgGrad.addColorStop(1, '#25903b');
  ctx.fillStyle = bgGrad;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1.0;

  // 2. 12 条纵向墨绿色波浪锯齿粗条纹
  const stripeCount = 12;
  ctx.fillStyle = '#0d3a16';
  ctx.strokeStyle = '#0d3a16';

  for (let i = 0; i < stripeCount; i++) {
    const cx = ((i + 0.5) / stripeCount) * width;
    const w = 32 + (i % 3) * 6;

    ctx.beginPath();
    const wave1 = (i % 2 === 0 ? 1 : -1) * 26;
    const wave2 = (i % 2 === 0 ? -1 : 1) * 22;

    ctx.moveTo(cx - w * 0.45, 0);
    ctx.bezierCurveTo(cx - w * 0.4 + wave1, height * 0.32, cx - w * 0.5 + wave2, height * 0.68, cx - w * 0.45, height);
    ctx.lineTo(cx + w * 0.45, height);
    ctx.bezierCurveTo(cx + w * 0.5 + wave2, height * 0.68, cx + w * 0.4 + wave1, height * 0.32, cx + w * 0.45, 0);
    ctx.closePath();
    ctx.fill();

    // 边缘手绘锯齿
    for (let step = 0; step < 8; step++) {
      const py = (step / 8) * height;
      const jitter = ((step % 2) - 0.5) * 8;
      ctx.fillRect(cx - w * 0.45 + jitter, py, 6, 20);
      ctx.fillRect(cx + w * 0.45 - jitter, py + 10, 6, 20);
    }
  }

  // 顶部与底部极点收敛暗影
  const pole = ctx.createLinearGradient(0, 0, 0, height);
  pole.addColorStop(0, 'rgba(10, 45, 18, 0.45)');
  pole.addColorStop(0.12, 'rgba(0,0,0,0)');
  pole.addColorStop(0.88, 'rgba(0,0,0,0)');
  pole.addColorStop(1, 'rgba(10, 45, 18, 0.45)');
  ctx.fillStyle = pole;
  ctx.fillRect(0, 0, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ============================================================
 * 💥 07 西瓜炸裂碎片 (Explosion Jelly Chunks)
 * 生成带外皮与鲜红果肉的 Q 弹立体果冻碎片
 * ============================================================ */
export function createMelonChunkMesh(index = 0, total = 8) {
  // 生成 1/8 椭球切块
  const geom = new THREE.SphereGeometry(0.72, 16, 12, (index % 4) * Math.PI * 0.5, Math.PI * 0.5, index >= 4 ? Math.PI * 0.5 : 0, Math.PI * 0.5);
  geom.center();

  const mat = new THREE.MeshPhysicalMaterial({
    color: '#ff3b5c',
    transmission: 0.88,
    thickness: 1.5,
    roughness: 0.08,
    ior: 1.39,
    attenuationColor: '#e11d48',
    attenuationDistance: 1.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    dispersion: 0.045,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geom, mat);
  return mesh;
}

