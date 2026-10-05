import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Gourmet jelly flavor presets for MeshPhysicalMaterial
export const FLAVOR_PRESETS = {
  watermelon: {
    name: '西瓜果肉',
    color: '#ffe4e6',
    attenuationColor: '#e11d48',
    attenuationDistance: 0.65,
    ior: 1.40,
    roughness: 0.07,
    thickness: 2.8,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    dispersion: 0.058
  },
  squid_cyan: {
    name: '海洋薄荷',
    color: '#e0f2fe',
    attenuationColor: '#0284c7',
    attenuationDistance: 0.85,
    ior: 1.37,
    roughness: 0.07,
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
    roughness: 0.11,
    thickness: 2.3,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    dispersion: 0.048
  },
  berry: {
    name: '覆盆子莓',
    color: '#ffe4e6',
    attenuationColor: '#be123c',
    attenuationDistance: 0.85,
    ior: 1.40,
    roughness: 0.10,
    thickness: 2.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    dispersion: 0.050
  },
  mint: {
    name: '青提玉露',
    color: '#ecfdf5',
    attenuationColor: '#059669',
    attenuationDistance: 1.1,
    ior: 1.38,
    roughness: 0.09,
    thickness: 2.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
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

  const params = {
    color: new THREE.Color(config.color || '#ffe4e6'),
    roughness: config.roughness ?? 0.07,
    metalness: 0.0,
    transmission: config.transmission ?? 0.98,
    thickness: config.thickness ?? 2.8,
    ior: config.ior ?? 1.40,
    attenuationColor: new THREE.Color(config.attenuationColor || '#e11d48'),
    attenuationDistance: config.attenuationDistance ?? 0.65,
    clearcoat: config.clearcoat ?? 1.0,
    clearcoatRoughness: config.clearcoatRoughness ?? 0.03,
    side: config.side ?? THREE.FrontSide,
  };
  if ('dispersion' in THREE.MeshPhysicalMaterial.prototype) {
    params.dispersion = config.dispersion ?? 0.058;
  }
  const mat = new THREE.MeshPhysicalMaterial(params);
  mat.dispersion = config.dispersion ?? 0.058;
  mat.envMapIntensity = config.envMapIntensity ?? 1.3;
  return mat;
}

// Bind a visual geometry to the 5x5x5 lattice via trilinear interpolation
export function bindGeometryToPhysics(geometry, physics, scale = 1.0, offset = new THREE.Vector3(0, 0, 0)) {
  const posAttr = geometry.getAttribute('position');
  posAttr.setUsage(THREE.DynamicDrawUsage);
  
  const restPositions = new Float32Array(posAttr.count * 3);
  const bindings = [];

  for (let i = 0; i < posAttr.count; i++) {
    let x = (posAttr.getX(i) + offset.x) * scale;
    let y = (posAttr.getY(i) + offset.y) * scale;
    let z = (posAttr.getZ(i) + offset.z) * scale;

    // Safety clamp to ensure vertices lie within [-0.95, 0.95] lattice range
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

// 1. 🍉 西瓜切块 (Watermelon Slice) Procedural Generator
export function createWatermelonGeometry() {
  // A curved triangular wedge with soft rounded bevels
  // Tip at top (+Y), curved green rind at bottom (-Y), cut faces on sides
  const radialSegments = 24;
  const heightSegments = 16;
  const depthSegments = 10;
  
  const width = 1.7;
  const height = 1.6;
  const depth = 0.8;
  const radius = 1.35;
  const halfAngle = Math.PI * 0.22; // ~40 degrees half-wedge

  const boxGeom = new THREE.BoxGeometry(width, height, depth, radialSegments, heightSegments, depthSegments);
  const pos = boxGeom.getAttribute('position');
  const temp = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    temp.fromBufferAttribute(pos, i);

    // Normalize coordinates in [-0.5, 0.5]
    const u = temp.x / width; // -0.5 to 0.5
    const v = temp.y / height + 0.5; // 0 (bottom rind) to 1.0 (top peak)
    const w = temp.z / depth; // -0.5 to 0.5

    // Arc deformation: bottom is curved circular arc, top converges to rounded crest
    const angle = u * halfAngle * 2.0;
    const r = radius * (1.0 - v * 0.78); // converges upwards
    
    let wx = Math.sin(angle) * r;
    let wy = (1.0 - Math.cos(angle)) * 0.35 + (v * height - height * 0.5);
    let wz = w * depth * (1.0 - v * 0.25); // slightly thicker at base

    // Round the outer edges / bevels
    const edgeDistX = 0.5 - Math.abs(u);
    const edgeDistZ = 0.5 - Math.abs(w);
    const bevel = Math.min(edgeDistX, edgeDistZ);
    if (bevel < 0.1) {
      const soften = Math.sin((bevel / 0.1) * Math.PI * 0.5);
      wy *= (0.92 + 0.08 * soften);
    }

    pos.setXYZ(i, wx * 1.15, wy * 1.05 - 0.1, wz * 1.1);
  }

  boxGeom.deleteAttribute('normal');
  boxGeom.deleteAttribute('uv');
  const welded = mergeVertices(boxGeom, 0.001);
  boxGeom.dispose();
  welded.computeVertexNormals();
  return welded;
}

// 2. 🍉 西瓜皮外壳 (Watermelon Outer Rind Geometry)
export function createWatermelonRindGeometry() {
  const segments = 32;
  const depthSegments = 10;
  const radius = 1.35;
  const halfAngle = Math.PI * 0.24;
  const depth = 0.88;
  const height = 1.6;

  const ribbon = new THREE.PlaneGeometry(1.82, depth, segments, depthSegments);
  const pos = ribbon.getAttribute('position');
  const temp = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    temp.fromBufferAttribute(pos, i);
    const u = temp.x / 1.82; // -0.5 to 0.5
    const w = temp.y / depth; // -0.5 to 0.5

    const angle = u * halfAngle * 2.0;
    const r = radius * 1.02;
    let wx = Math.sin(angle) * r;
    let wy = (1.0 - Math.cos(angle)) * 0.35 - (height * 0.47);
    let wz = w * depth * 1.06;

    pos.setXYZ(i, wx * 1.15, wy * 1.05 - 0.1, wz);
  }

  ribbon.deleteAttribute('normal');
  ribbon.deleteAttribute('uv');
  const welded = mergeVertices(ribbon, 0.001);
  ribbon.dispose();
  welded.computeVertexNormals();
  return welded;
}

// 3. 🍉 西瓜籽布局 (Watermelon Seeds Generation)
export function createSeedMeshes(count = 10) {
  const seedGeom = new THREE.SphereGeometry(0.045, 12, 10);
  seedGeom.scale(0.8, 1.4, 0.45); // Teardrop seed shape

  const seedMat = new THREE.MeshStandardMaterial({
    color: '#1a1412',
    roughness: 0.18,
    metalness: 0.25
  });

  const seeds = [];
  const seedOffsets = [
    // Front face seeds
    { u: -0.22, v: 0.35, z: 0.32 },
    { u:  0.18, v: 0.42, z: 0.32 },
    { u: -0.10, v: 0.60, z: 0.28 },
    { u:  0.26, v: 0.25, z: 0.32 },
    { u: -0.28, v: 0.20, z: 0.32 },
    // Back face seeds
    { u: -0.18, v: 0.38, z: -0.32 },
    { u:  0.22, v: 0.45, z: -0.32 },
    { u:  0.08, v: 0.62, z: -0.28 },
    { u: -0.25, v: 0.24, z: -0.32 },
    { u:  0.25, v: 0.22, z: -0.32 }
  ];

  for (let i = 0; i < Math.min(count, seedOffsets.length); i++) {
    const mesh = new THREE.Mesh(seedGeom, seedMat);
    const { u, v, z } = seedOffsets[i];
    const angle = u * Math.PI * 0.44;
    const r = 1.35 * (1.0 - v * 0.78);
    const wx = Math.sin(angle) * r * 1.15;
    const wy = ((1.0 - Math.cos(angle)) * 0.35 + (v * 1.6 - 0.8)) * 1.05 - 0.1;
    mesh.position.set(wx, wy, z);
    mesh.rotation.z = angle + (Math.random() - 0.5) * 0.3;
    mesh.rotation.x = (Math.random() - 0.5) * 0.2;
    seeds.push({ mesh, restPos: [wx, wy, z] });
  }

  return seeds;
}

// 4. 🦑 果冻鱿鱼 (Jelly Squid) Procedural Generator
export function createSquidGeometry() {
  const radialSegments = 32;
  const heightSegments = 24;

  const points = [];
  const totalHeight = 1.65;

  for (let i = 0; i <= heightSegments; i++) {
    const t = i / heightSegments; // 0 (skirt) to 1.0 (dome tip)
    const y = (t - 0.5) * totalHeight;

    let r = 0;
    if (t < 0.18) {
      // Flared bottom skirt
      const st = t / 0.18;
      r = 0.75 - 0.15 * Math.sin(st * Math.PI * 0.5);
    } else {
      // Main mantle dome
      const dt = (t - 0.18) / 0.82; // 0 to 1
      r = 0.60 * Math.sqrt(Math.max(0, 1.0 - dt * dt * 0.95)) * (1.0 + 0.15 * Math.sin(dt * Math.PI));
    }

    points.push(new THREE.Vector2(Math.max(0.01, r), y));
  }

  const lathe = new THREE.LatheGeometry(points, radialSegments);

  // Add subtle organic scalloped waviness to the skirt
  const pos = lathe.getAttribute('position');
  const temp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    temp.fromBufferAttribute(pos, i);
    const angle = Math.atan2(temp.z, temp.x);
    const t = (temp.y / totalHeight) + 0.5;
    if (t < 0.25) {
      const ruffle = Math.sin(angle * 8.0) * 0.04 * (1.0 - t / 0.25);
      temp.x += Math.cos(angle) * ruffle;
      temp.z += Math.sin(angle) * ruffle;
      temp.y += Math.cos(angle * 8.0) * 0.02 * (1.0 - t / 0.25);
      pos.setXYZ(i, temp.x, temp.y, temp.z);
    }
  }

  lathe.deleteAttribute('normal');
  lathe.deleteAttribute('uv');
  const welded = mergeVertices(lathe, 0.001);
  lathe.dispose();
  welded.computeVertexNormals();
  return welded;
}

// 5. 🦑 鱿鱼眼睛与内核 (Squid Eyes & Bioluminescent Nucleus)
export function createSquidOrgans() {
  const group = new THREE.Group();

  // 1. Glowing Bioluminescent Heart/Nucleus
  const coreGeom = new THREE.SphereGeometry(0.24, 20, 16);
  const coreMat = new THREE.MeshStandardMaterial({
    color: '#f43f5e',
    emissive: '#fb7185',
    emissiveIntensity: 2.2,
    roughness: 0.3,
    transparent: true,
    opacity: 0.85
  });
  const core = new THREE.Mesh(coreGeom, coreMat);
  core.position.set(0, 0.1, 0);
  group.add(core);

  // 2. Chibi Glossy Eyes
  const eyeGeom = new THREE.SphereGeometry(0.11, 16, 12);
  eyeGeom.scale(1.0, 1.25, 0.65);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.06,
    metalness: 0.1
  });

  const pupilGeom = new THREE.SphereGeometry(0.035, 12, 10);
  const pupilMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

  // Left Eye
  const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
  leftEye.position.set(0.38, -0.15, 0.44);
  leftEye.rotation.y = 0.45;
  const leftPupil = new THREE.Mesh(pupilGeom, pupilMat);
  leftPupil.position.set(0.02, 0.03, 0.09);
  leftEye.add(leftPupil);
  group.add(leftEye);

  // Right Eye
  const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
  rightEye.position.set(-0.38, -0.15, 0.44);
  rightEye.rotation.y = -0.45;
  const rightPupil = new THREE.Mesh(pupilGeom, pupilMat);
  rightPupil.position.set(-0.02, 0.03, 0.09);
  rightEye.add(rightPupil);
  group.add(rightEye);

  return {
    group,
    core,
    leftEye,
    rightEye,
    leftEyeRest: [0.38, -0.15, 0.44],
    rightEyeRest: [-0.38, -0.15, 0.44],
    coreRest: [0, 0.1, 0]
  };
}

// 6. 🦑 鱿鱼柔嫩触须网格构造器 (Dynamic Tentacle Tubes)
export function createTentacleMeshes(tentaclesCount = 8) {
  const meshes = [];
  const tentacleMat = new THREE.MeshPhysicalMaterial({
    color: '#e0f2fe',
    roughness: 0.09,
    metalness: 0.0,
    transmission: 0.96,
    thickness: 1.2,
    ior: 1.38,
    attenuationColor: new THREE.Color('#38bdf8'),
    attenuationDistance: 1.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05
  });

  for (let i = 0; i < tentaclesCount; i++) {
    const geom = new THREE.CylinderGeometry(0.045, 0.015, 1.4, 8, 8);
    geom.translate(0, -0.7, 0); // Origin at top anchor
    const restPos = new Float32Array(geom.getAttribute('position').array);
    const mesh = new THREE.Mesh(geom, tentacleMat);
    mesh.frustumCulled = false;
    meshes.push({ mesh, geom, restPos, index: i });
  }
  return meshes;
}

// 7. 🍯 经典晶莹方块 (Classic Rounded Cube)
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
