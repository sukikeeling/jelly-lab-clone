/* ============================================================
 * three-jelly.js — Three.js 顶级透光果冻引擎
 * 120Hz XPBD 晶格 + 384 四面体体积守恒 + MeshPhysicalMaterial 色散透光
 * ============================================================ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { JellyPhysicsXPBD } from './physics.js';
import { bindGeometryToPhysics, FLAVOR_PRESETS } from './models.js';

const V3 = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);

/* ---------- 摄影棚环境贴图生成 (RoomEnvironment + 3 块专业柔光箱) ---------- */
export function buildStudioEnvironment(renderer) {
  const environment = new RoomEnvironment();
  const panelGeom = new THREE.PlaneGeometry(1, 1);
  const createdMats = [];

  // 5 块专业高亮摄影棚长条柔光箱 (Softbox Highlight Strips)
  const panels = [
    { pos: [-3.8, 4.6, 2.8], scale: [1.2, 5.5, 1], color: new THREE.Color(8.5, 8.5, 8.5) }, // 左前长条垂直柔光箱
    { pos: [4.2, 4.5, 2.5],  scale: [1.2, 5.0, 1], color: new THREE.Color(8.0, 8.0, 8.0) }, // 右前长条柔光箱
    { pos: [0.0, 7.2, 0.2],  scale: [4.5, 2.2, 1], color: new THREE.Color(7.5, 7.5, 7.5) }, // 顶部长矩形天幕柔光箱
    { pos: [3.2, 3.5, -3.5], scale: [3.2, 3.2, 1], color: new THREE.Color(5.0, 5.2, 6.0) }, // 后方冷光轮廓箱
    { pos: [-3.2, 2.2, -3.0],scale: [2.5, 2.5, 1], color: new THREE.Color(4.5, 4.0, 3.8) }  // 后方暖光轮廓箱
  ];

  for (const p of panels) {
    const mat = new THREE.MeshBasicMaterial({ color: p.color, side: THREE.DoubleSide });
    createdMats.push(mat);
    const mesh = new THREE.Mesh(panelGeom, mat);
    mesh.position.set(...p.pos);
    mesh.scale.set(...p.scale);
    mesh.lookAt(0, 0, 0);
    environment.add(mesh);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(environment, 0.04, 0.1, 100).texture;

  environment.dispose();
  panelGeom.dispose();
  createdMats.forEach(m => m.dispose());
  pmrem.dispose();

  return envTexture;
}

/* ---------- 动态接触阴影贴图 ---------- */
function buildContactShadowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 12, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.52)');
  grad.addColorStop(0.35, 'rgba(15, 23, 42, 0.30)');
  grad.addColorStop(0.7, 'rgba(15, 23, 42, 0.09)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- 渲染舞台 (Studio Stage) ---------- */
export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = false; // 使用高精度程序化动态接触阴影
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e2e8f0');
  scene.fog = new THREE.Fog('#e2e8f0', 14, 32);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  camera.position.set(0, 2.6, 7.2);
  camera.lookAt(0, 0.9, 0);

  // 摄影棚柔光环境反射
  const envTexture = buildStudioEnvironment(renderer);
  scene.environment = envTexture;
  scene.environmentIntensity = 0.95;

  // 影棚灯光：半球光 + 主光 + 轮廓光
  const hemi = new THREE.HemisphereLight('#f8fafc', '#cbd5e1', 1.9);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight('#fffbeb', 3.4);
  keyLight.position.set(-3.2, 7.5, 4.5);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight('#e0f2fe', 1.8);
  rimLight.position.set(4.2, 3.8, -3.5);
  scene.add(rimLight);

  // 极简微磨砂影棚台面
  const floorGeom = new THREE.PlaneGeometry(160, 160);
  const floorMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    roughness: 0.88,
    metalness: 0.0
  });
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.005;
  scene.add(floor);

  // 影棚网格（超淡）
  const grid = new THREE.GridHelper(40, 80, '#94a3b8', '#cbd5e1');
  grid.position.y = 0.001;
  grid.material.transparent = true;
  grid.material.opacity = 0.07;
  grid.material.depthWrite = false;
  scene.add(grid);

  // 动态接触阴影 Plane
  const shadowMat = new THREE.MeshBasicMaterial({
    map: buildContactShadowTexture(),
    transparent: true,
    depthWrite: false
  });
  const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 4.8), shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.003;
  scene.add(shadowMesh);

  // 抓取指示小球
  const grabMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false })
  );
  grabMarker.visible = false;
  grabMarker.renderOrder = 999;
  scene.add(grabMarker);

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return { renderer, scene, camera, resize, shadowMesh, grabMarker };
}

/* ---------- 顶级透光色散果冻材质 ---------- */
export function jellyMaterial(color, opts = {}) {
  const c = new THREE.Color(color || '#ffe4e6');
  const att = opts.attenuation ? new THREE.Color(opts.attenuation) : c;

  const params = {
    color: opts.baseColor ? new THREE.Color(opts.baseColor) : (opts.transmission ? new THREE.Color('#ffe4e6') : c),
    transmission: opts.transmission ?? 0.98,
    thickness: opts.thickness ?? 2.8,
    roughness: opts.roughness ?? 0.07,
    metalness: opts.metalness ?? 0.0,
    ior: opts.ior ?? 1.40,
    clearcoat: opts.clearcoat ?? 1.0,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.03,
    attenuationColor: att,
    attenuationDistance: opts.attenuationDistance ?? 0.65,
    vertexColors: !!opts.vertexColors,
    map: opts.map || null,
    side: opts.side ?? THREE.FrontSide,
  };
  if ('dispersion' in THREE.MeshPhysicalMaterial.prototype) {
    params.dispersion = opts.dispersion ?? 0.058;
  }
  const mat = new THREE.MeshPhysicalMaterial(params);
  mat.dispersion = opts.dispersion ?? 0.058;
  mat.envMapIntensity = opts.envMapIntensity ?? 1.3;
  return mat;
}

/* ============================================================
 * JellyBody — 满血 XPBD 果冻刚柔体对象
 * 120Hz 亚步长物理驱动、384 四面体保体积、支持从属网格与动态触手
 * ============================================================ */
export class JellyBody {
  constructor(mesh, opts = {}) {
    this.mesh = mesh;
    this.group = new THREE.Group();
    this.group.add(mesh);
    this.cap = null;
    this.clips = [];

    // 120Hz XPBD 软体晶格核心
    this.physics = new JellyPhysicsXPBD({
      gridSize: 5,
      firmness: opts.firmness ?? 55,
      damping: opts.damping ?? 24,
      jiggle: opts.jiggle ?? 75,
      floorY: opts.floorY ?? 0.038,
      initialDropHeight: opts.initialDropHeight ?? 1.85
    });

    this.vel = this.physics.velocity;
    this.count = this.physics.count;
    this.pos = mesh.geometry.attributes.position;
    this.pos.setUsage(THREE.DynamicDrawUsage);

    // 将视觉几何体三线性嵌入到 [-1, 1] 物理晶格空间中
    const binding = bindGeometryToPhysics(mesh.geometry, this.physics, opts.scale ?? 1.0, opts.offset);
    this.mainBinding = { geometry: mesh.geometry, ...binding };
    this.rest = binding.restPositions;

    this.secondaryBindings = [];
    this.followers = [];
    this.tentacleLines = [];
    this.squidOrgans = null;
    this.wireMesh = null;

    this.accumulator = 0;
    this.slow = false;
    this.paused = false;
    this.energy = 0;
    this.stretch = 0;

    // 晶格线框调试辅助网格
    this.initWireframe();
    this.syncSurfaces();
  }

  initWireframe() {
    const wireMat = new THREE.MeshBasicMaterial({
      color: '#0f766e',
      wireframe: true,
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    });
    this.wireMesh = new THREE.Mesh(this.mesh.geometry, wireMat);
    this.wireMesh.frustumCulled = false;
    this.wireMesh.visible = false;
    this.group.add(this.wireMesh);
  }

  setWireframe(visible) {
    if (this.wireMesh) this.wireMesh.visible = !!visible;
  }

  setSlow(slow) {
    this.slow = !!slow;
  }

  setPaused(paused) {
    this.paused = !!paused;
    if (this.paused) this.release();
  }

  setFirmness(val) {
    this.physics.setFirmness(val);
  }

  setDamping(val) {
    this.physics.setDamping(val);
  }

  setJiggle(val) {
    this.physics.setJiggle(val);
  }

  /* --- 添加从属几何体（如西瓜皮） --- */
  addSecondaryMesh(secMesh, scale = 1.0, offset) {
    secMesh.frustumCulled = false;
    this.group.add(secMesh);
    const binding = bindGeometryToPhysics(secMesh.geometry, this.physics, scale, offset);
    this.secondaryBindings.push({ mesh: secMesh, geometry: secMesh.geometry, ...binding });
  }

  /* --- 添加跟随物（如西瓜籽、骰子点、眼睛） --- */
  follow(obj, vertOrRestPos, offset = V3()) {
    let embedding = null;
    if (vertOrRestPos && vertOrRestPos.indices && vertOrRestPos.weights) {
      embedding = vertOrRestPos;
    } else if (Array.isArray(vertOrRestPos)) {
      embedding = this.physics.embed(vertOrRestPos[0], vertOrRestPos[1], vertOrRestPos[2]);
    } else if (vertOrRestPos instanceof THREE.Vector3) {
      embedding = this.physics.embed(vertOrRestPos.x, vertOrRestPos.y, vertOrRestPos.z);
    } else if (typeof vertOrRestPos === 'number') {
      const rx = this.rest[vertOrRestPos * 3] || 0;
      const ry = this.rest[vertOrRestPos * 3 + 1] || 0;
      const rz = this.rest[vertOrRestPos * 3 + 2] || 0;
      embedding = this.physics.embed(rx, ry, rz);
    } else {
      embedding = this.physics.embed(0, 0, 0);
    }
    this.followers.push({ obj, embedding, offset });
  }

  /* --- 鱿鱼器官与触手设置 --- */
  setSquidOrgans(organs) {
    this.squidOrgans = organs;
    this.group.add(organs.group);
    organs.coreEmbed = this.physics.embed(...organs.coreRest);
    organs.leftEyeEmbed = this.physics.embed(...organs.leftEyeRest);
    organs.rightEyeEmbed = this.physics.embed(...organs.rightEyeRest);
  }

  setTentacleMeshes(tentacleMeshes) {
    this.tentacleLines = [];
    for (const item of tentacleMeshes) {
      this.group.add(item.mesh);
      this.tentacleLines.push(item);
    }
  }

  /* --- 抓取与交互 --- */
  grabPoint(worldPt, radius = 0.95) {
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const lp = worldPt.clone().applyMatrix4(inv);
    const embed = this.physics.embed(lp.x, lp.y, lp.z);
    this.physics.grab = {
      ...embed,
      target: [lp.x, lp.y, lp.z]
    };
    this._grabPt = worldPt.clone();
    return embed.indices.length;
  }

  dragTo(worldPt) {
    if (!this.physics.grab) return;
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const lp = worldPt.clone().applyMatrix4(inv);
    this.physics.grab.target = [lp.x, lp.y, lp.z];
  }

  dragLocal(dx, dy, dz) {
    if (!this.physics.grab) return;
    this.physics.grab.target[0] += dx;
    this.physics.grab.target[1] += dy;
    this.physics.grab.target[2] += dz;
  }

  release() {
    this.physics.grab = null;
    this._grabPt = null;
  }

  poke(worldPt, impulse = V3(0, -3.5, 0), radius = 1.1) {
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const lp = worldPt.clone().applyMatrix4(inv);
    const str = impulse instanceof THREE.Vector3 ? impulse.length() * 2.2 : 5.0;
    this.physics.poke(lp, str);
  }

  shake(strength = 1) {
    this.physics.nudge(1.2 * strength, 3.8 * strength, -0.7 * strength);
  }

  wave(strength = 1, time = 0) {
    this.physics.nudge(1.0 * strength, 3.5 * strength, -0.5 * strength);
  }

  /* --- 顶点与几何体表面同步 --- */
  syncSurfaces() {
    const p = this.physics.position;

    // 1. 同步主模型顶点
    if (this.mainBinding) {
      const { geometry, bindings } = this.mainBinding;
      const attr = geometry.getAttribute('position');
      for (let i = 0; i < attr.count; i++) {
        const b = bindings[i];
        if (!b) continue;
        const { indices, weights } = b;
        let x = 0, y = 0, z = 0;
        for (let j = 0; j < 8; j++) {
          const idx = indices[j], w = weights[j];
          x += p[idx] * w;
          y += p[idx + 1] * w;
          z += p[idx + 2] * w;
        }
        attr.setXYZ(i, x, y, z);
      }
      attr.needsUpdate = true;
      geometry.computeVertexNormals();
    }

    // 2. 同步从属模型（如西瓜皮外壳）
    for (const item of this.secondaryBindings) {
      const attr = item.geometry.getAttribute('position');
      for (let i = 0; i < attr.count; i++) {
        const b = item.bindings[i];
        if (!b) continue;
        const { indices, weights } = b;
        let x = 0, y = 0, z = 0;
        for (let j = 0; j < 8; j++) {
          const idx = indices[j], w = weights[j];
          x += p[idx] * w;
          y += p[idx + 1] * w;
          z += p[idx + 2] * w;
        }
        attr.setXYZ(i, x, y, z);
      }
      attr.needsUpdate = true;
      item.geometry.computeVertexNormals();
    }

    // 3. 同步嵌入跟随物（西瓜籽、骰子圆点等）
    for (const item of this.followers) {
      if (item.embedding) {
        const pos = this.physics.evaluateEmbedding(item.embedding);
        item.obj.position.set(pos[0] + item.offset.x, pos[1] + item.offset.y, pos[2] + item.offset.z);
      }
    }

    // 4. 同步鱿鱼器官（发光核心 + 大眼萌珠）
    if (this.squidOrgans) {
      const corePos = this.physics.evaluateEmbedding(this.squidOrgans.coreEmbed);
      this.squidOrgans.core.position.set(...corePos);
      const leftEyePos = this.physics.evaluateEmbedding(this.squidOrgans.leftEyeEmbed);
      this.squidOrgans.leftEye.position.set(...leftEyePos);
      const rightEyePos = this.physics.evaluateEmbedding(this.squidOrgans.rightEyeEmbed);
      this.squidOrgans.rightEye.position.set(...rightEyePos);
    }

    // 5. 同步鱿鱼柔韧触手连续动态管道
    if (this.tentacleLines && this.tentacleLines.length) {
      const tentacles = this.physics.tentacles;
      for (let t = 0; t < this.tentacleLines.length; t++) {
        const line = this.tentacleLines[t];
        const chain = tentacles[t];
        if (!chain) continue;

        const attr = line.geom.getAttribute('position');
        const rest = line.restPos;
        const segCount = chain.particles.length;
        const len = line.length || 1.2;

        for (let i = 0; i < attr.count; i++) {
          const rawY = Math.max(0, Math.min(1.0, -rest[i * 3 + 1] / len));
          const segIdx = Math.max(0, Math.min(segCount - 2, Math.floor(rawY * (segCount - 1))));
          const segT = (rawY * (segCount - 1)) - segIdx;

          const pA = chain.particles[segIdx].pos;
          const pB = chain.particles[segIdx + 1].pos;

          const cx = pA[0] + (pB[0] - pA[0]) * segT;
          const cy = pA[1] + (pB[1] - pA[1]) * segT;
          const cz = pA[2] + (pB[2] - pA[2]) * segT;

          const rx = rest[i * 3];
          const rz = rest[i * 3 + 2];
          attr.setXYZ(i, cx + rx, cy, cz + rz);
        }
        attr.needsUpdate = true;
        line.geom.computeVertexNormals();

        // 动态同步触须表面的吸盘颗粒
        if (line.suckersGroup && line.suckersGroup.children.length) {
          const children = line.suckersGroup.children;
          for (let c = 0; c < children.length; c++) {
            const cup = children[c];
            const frac = line.isLongTentacle ? (0.76 + ((c + 1) / (children.length + 1)) * 0.22) : (0.2 + ((c + 1) / (children.length + 1)) * 0.75);
            const segIdx = Math.max(0, Math.min(segCount - 2, Math.floor(frac * (segCount - 1))));
            const segT = (frac * (segCount - 1)) - segIdx;
            const pA = chain.particles[segIdx].pos;
            const pB = chain.particles[segIdx + 1].pos;

            const cx = pA[0] + (pB[0] - pA[0]) * segT;
            const cy = pA[1] + (pB[1] - pA[1]) * segT;
            const cz = pA[2] + (pB[2] - pA[2]) * segT;
            cup.position.set(cx, cy, cz + (line.isLongTentacle ? 0.045 : 0.038));
          }
        }
      }
    }
  }

  // 120Hz 亚步长物理模拟循环更新
  update(dt, time) {
    if (this.paused) return;

    const fixedDT = 1 / 120;
    this.accumulator += Math.min(dt, 0.05) * (this.slow ? 0.25 : 1.0);
    let steps = 0;
    while (this.accumulator >= fixedDT && steps < 6) {
      this.physics.step(fixedDT);
      this.accumulator -= fixedDT;
      steps++;
    }

    this.syncSurfaces();
    const m = this.physics.metrics();
    this.energy = m.energy;
    this.stretch = m.stretch;
  }

  dispose() {
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) this.mesh.material.forEach(m => m.dispose());
    else this.mesh.material.dispose();

    for (const sec of this.secondaryBindings) {
      sec.geometry.dispose();
      if (sec.mesh.material) sec.mesh.material.dispose();
    }
    if (this.wireMesh) {
      this.wireMesh.geometry.dispose();
      this.wireMesh.material.dispose();
    }
  }
}
