/* ============================================================
 * three-jelly.js — Three.js 果冻引擎
 * MeshPhysicalMaterial 透光果冻 + 顶点级软体变形 + 裁剪面切割
 * ============================================================ */
import * as THREE from 'three';

const V3 = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const TAU = Math.PI * 2;
const smooth01 = (v) => v * v * (3 - 2 * v);

/* ---------- 程序生成摄影棚环境贴图（5 块柔光箱） ----------
 * 移植自 ceramic-bot-3d/reference/lighting/studio-scene.js
 * 果冻表面漂亮反射的来源 */
function buildStudioEnvironment() {
  const width = 384, height = 192;
  const data = new Float32Array(width * height * 4);
  const softboxes = [
    { direction: new THREE.Vector3(0.45, 0.85, 0.35), intensity: 5.2, exponent: 16, color: [1, 0.98, 0.94] },
    { direction: new THREE.Vector3(-0.85, 0.25, 0.15), intensity: 1.5, exponent: 7, color: [0.82, 0.9, 1] },
    { direction: new THREE.Vector3(0.15, 0.35, -0.95), intensity: 2.6, exponent: 12, color: [1, 0.86, 0.66] },
    { direction: new THREE.Vector3(0.95, 0.05, 0.3), intensity: 0.9, exponent: 9, color: [1, 0.95, 0.85] },
    { direction: new THREE.Vector3(0, -1, 0), intensity: 0.5, exponent: 4, color: [1, 0.93, 0.82] },
  ];
  for (const s of softboxes) s.direction.normalize();
  const direction = new THREE.Vector3();
  for (let y = 0; y < height; y++) {
    const phi = ((y + 0.5) / height) * Math.PI;
    for (let x = 0; x < width; x++) {
      const theta = ((x + 0.5) / width) * TAU;
      direction.set(-Math.sin(phi) * Math.sin(theta), Math.cos(phi), -Math.sin(phi) * Math.cos(theta));
      const up = direction.y * 0.5 + 0.5;
      let red = THREE.MathUtils.lerp(0.32, 1.05, smooth01(up)) * 0.9;
      let green = red * 0.985, blue = red * 0.94;
      for (const s of softboxes) {
        const w = s.intensity * Math.pow(Math.max(direction.dot(s.direction), 0), s.exponent);
        red += w * s.color[0]; green += w * s.color[1]; blue += w * s.color[2];
      }
      const i = (y * width + x) * 4;
      data[i] = red; data[i+1] = green; data[i+2] = blue; data[i+3] = 1;
    }
  }
  const env = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  env.mapping = THREE.EquirectangularReflectionMapping;
  env.magFilter = THREE.LinearFilter;
  env.minFilter = THREE.LinearFilter;
  env.needsUpdate = true;
  return env;
}

/* ---------- 柔和接触阴影 ---------- */
function buildBlushTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size/2, size/2, 6, size/2, size/2, size/2);
  g.addColorStop(0, 'rgba(107, 92, 68, 0.48)');
  g.addColorStop(0.45, 'rgba(107, 92, 68, 0.22)');
  g.addColorStop(1, 'rgba(107, 92, 68, 0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- 渲染舞台 ---------- */
export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfaf3e8);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 2.6, 7.4);
  camera.lookAt(0, 0.2, 0);

  // 摄影棚环境反射（果冻"水光"关键）
  const environment = buildStudioEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(environment).texture;
  environment.dispose();
  pmrem.dispose();

  // 三点布光：暖主光（2048 软阴影）+ 冷补光 + 暖轮廓光
  const key = new THREE.DirectionalLight(0xffead4, 1.95);
  key.position.set(3.2, 4.4, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 14;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xcadcf2, 0.36);
  fill.position.set(-3.4, 1.8, 1.6);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffc98f, 0.65);
  rim.position.set(-1.4, 2.2, -3.6);
  scene.add(rim);

  // 地面：真实阴影 + 柔和接触阴影（去悬浮感）
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(16, 48),
    new THREE.ShadowMaterial({ opacity: 0.18 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.62;
  ground.receiveShadow = true;
  scene.add(ground);

  const blush = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 5.2),
    new THREE.MeshBasicMaterial({ map: buildBlushTexture(), transparent: true, depthWrite: false })
  );
  blush.rotation.x = -Math.PI / 2;
  blush.position.set(0, -1.618, 0);
  scene.add(blush);

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return { renderer, scene, camera, resize };
}

/* ---------- 果冻材质（陶瓷棚拍配方 + transmission） ---------- */
export function jellyMaterial(color, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    transmission: opts.transmission ?? 0.6,
    thickness: opts.thickness ?? 1.8,
    roughness: opts.roughness ?? 0.18,
    ior: 1.4,
    clearcoat: 1.0,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.05,
    specularIntensity: 1.2,
    attenuationColor: new THREE.Color(opts.attenuation || color),
    attenuationDistance: opts.attenuationDistance ?? 2.6,
    vertexColors: !!opts.vertexColors,
    map: opts.map || null,
    side: THREE.FrontSide,
  });
  m.envMapIntensity = opts.envMapIntensity ?? 1.1;
  return m;
}


export class JellyBody {
  constructor(mesh, opts = {}) {
    this.mesh = mesh;
    this.group = new THREE.Group();
    this.group.add(mesh);
    this.cap = null;
    this.pos = mesh.geometry.attributes.position;
    this.count = this.pos.count;
    this.rest = new Float32Array(this.pos.array);
    this.vel = new Float32Array(this.count * 3);
    this.k = opts.k ?? 120;          // 回弹刚度
    this.damping = opts.damping ?? 6.5;
    this.cohesion = opts.cohesion ?? 26; // 邻域黏合
    this.neighbors = buildNeighbors(this.pos, this.rest);
    this.grabbed = new Map();        // idx -> {target:Vector3, strength}
    this.followers = [];             // {obj, vert, offset:Vector3}
    this.clips = [];                 // clip planes（切割后）
    this.externalForce = V3();
    this.energy = 0;
  }

  /* --- 抓取 --- */
  grabPoint(worldPt, radius = 0.9) {
    const inv = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();
    const lp = worldPt.clone().applyMatrix4(inv);
    const arr = this.pos.array;
    let found = 0;
    for (let i = 0; i < this.count; i++) {
      const dx = arr[i*3]-lp.x, dy = arr[i*3+1]-lp.y, dz = arr[i*3+2]-lp.z;
      if (dx*dx+dy*dy+dz*dz < radius*radius) {
        this.grabbed.set(i, { target: new THREE.Vector3(arr[i*3], arr[i*3+1], arr[i*3+2]) });
        found++;
      }
    }
    return found;
  }
  dragTo(worldPt) {
    const inv = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();
    const lp = worldPt.clone().applyMatrix4(inv);
    for (const g of this.grabbed.values()) g.target.copy(lp);
  }
  release() { this.grabbed.clear(); }

  // 本地坐标增量拖拽（被抓取的顶点跟随）
  dragLocal(dx, dy, dz) {
    const arr = this.pos.array;
    for (const i of this.grabbed.keys()) {
      const i3 = i * 3;
      arr[i3] += dx; arr[i3+1] += dy; arr[i3+2] += dz;
      // 给一点速度感，松手有惯性
      this.vel[i3] = this.vel[i3] * 0.6 + dx * 2.2;
      this.vel[i3+1] = this.vel[i3+1] * 0.6 + dy * 2.2;
      this.vel[i3+2] = this.vel[i3+2] * 0.6 + dz * 2.2;
    }
  }

  poke(worldPt, impulse, radius = 1.1) {
    const inv = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();
    const lp = worldPt.clone().applyMatrix4(inv);
    const arr = this.pos.array;
    for (let i = 0; i < this.count; i++) {
      const dx = arr[i*3]-lp.x, dy = arr[i*3+1]-lp.y, dz = arr[i*3+2]-lp.z;
      const d2 = dx*dx+dy*dy+dz*dz;
      if (d2 < radius*radius) {
        const w = 1 - Math.sqrt(d2)/radius;
        this.vel[i*3] += impulse.x*w; this.vel[i*3+1] += impulse.y*w; this.vel[i*3+2] += impulse.z*w;
      }
    }
  }

  shake(strength = 1) {
    for (let i = 0; i < this.count; i++) {
      const a = Math.random()*Math.PI*2;
      const s = strength * (0.9 + Math.random()*0.9);
      this.vel[i*3] += Math.cos(a)*s;
      this.vel[i*3+1] += Math.abs(Math.sin(a))*s*0.7;
      this.vel[i*3+2] += Math.sin(a)*s*0.5;
    }
  }

  wave(strength = 1, time = 0) {
    // 正弦波浪（晃一晃）
    const arr = this.pos.array;
    for (let i = 0; i < this.count; i++) {
      const y = arr[i*3+1];
      const ph = time*10 + y*2.2;
      this.vel[i*3] += Math.sin(ph)*strength*0.55;
      this.vel[i*3+2] += Math.cos(ph*0.8)*strength*0.3;
    }
  }

  follow(obj, vertIdx, offset) {
    this.followers.push({ obj, vert: vertIdx, offset: offset || V3() });
  }

  update(dt, time) {
    const arr = this.pos.array, rest = this.rest, vel = this.vel;
    const k = this.k, damp = Math.exp(-this.damping*dt), coh = this.cohesion;
    let e = 0;
    // 邻域平均（先算，避免读写冲突用临时）
    for (let i = 0; i < this.count; i++) {
      const nb = this.neighbors[i];
      let ax=0, ay=0, az=0;
      if (nb.length) {
        for (let j = 0; j < nb.length; j++) {
          const m = nb[j]*3;
          ax += arr[m]; ay += arr[m+1]; az += arr[m+2];
        }
        const inv = 1/nb.length;
        ax = (ax*inv - arr[i*3]) * coh;
        ay = (ay*inv - arr[i*3+1]) * coh;
        az = (az*inv - arr[i*3+2]) * coh;
      }
      const i3 = i*3;
      let fx = (rest[i3]-arr[i3])*k + ax + this.externalForce.x;
      let fy = (rest[i3+1]-arr[i3+1])*k + ay + this.externalForce.y;
      let fz = (rest[i3+2]-arr[i3+2])*k + az + this.externalForce.z;
      const g = this.grabbed.get(i);
      if (g) {
        fx += (g.target.x-arr[i3])*420;
        fy += (g.target.y-arr[i3+1])*420;
        fz += (g.target.z-arr[i3+2])*420;
      }
      vel[i3] = (vel[i3]+fx*dt)*damp;
      vel[i3+1] = (vel[i3+1]+fy*dt)*damp;
      vel[i3+2] = (vel[i3+2]+fz*dt)*damp;
      arr[i3] += vel[i3]*dt; arr[i3+1] += vel[i3+1]*dt; arr[i3+2] += vel[i3+2]*dt;
      e += vel[i3]*vel[i3]+vel[i3+1]*vel[i3+1]+vel[i3+2]*vel[i3+2];
    }
    this.energy = e;
    this.pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    // 跟随物（籽、眼睛等）
    const m = this.mesh.matrixWorld;
    const tv = JellyBody._tv || (JellyBody._tv = new THREE.Vector3());
    for (const f of this.followers) {
      const i3 = f.vert*3;
      tv.set(arr[i3]+f.offset.x, arr[i3+1]+f.offset.y, arr[i3+2]+f.offset.z).applyMatrix4(m);
      f.obj.position.copy(this.group.worldToLocal(tv.clone()));
    }
  }

  setRestToCurrent() { this.rest.set(this.pos.array); this.vel.fill(0); }

  dispose() {
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) this.mesh.material.forEach(m=>m.dispose());
    else this.mesh.material.dispose();
  }
}

// 空间哈希邻域
function buildNeighbors(posAttr, restArr) {
  const count = posAttr.count;
  const cell = 0.34;
  const grid = new Map();
  const key = (x,y,z) => `${Math.floor(x/cell)},${Math.floor(y/cell)},${Math.floor(z/cell)}`;
  for (let i = 0; i < count; i++) {
    const k = key(restArr[i*3], restArr[i*3+1], restArr[i*3+2]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const neighbors = new Array(count);
  for (let i = 0; i < count; i++) {
    const x = restArr[i*3], y = restArr[i*3+1], z = restArr[i*3+2];
    const cx = Math.floor(x/cell), cy = Math.floor(y/cell), cz = Math.floor(z/cell);
    const list = [];
    for (let a=-1;a<=1;a++) for (let b=-1;b<=1;b++) for (let c=-1;c<=1;c++) {
      const cellList = grid.get(`${cx+a},${cy+b},${cz+c}`);
      if (!cellList) continue;
      for (const j of cellList) {
        if (j === i || list.length >= 14) continue;
        const dx = restArr[j*3]-x, dy = restArr[j*3+1]-y, dz = restArr[j*3+2]-z;
        if (dx*dx+dy*dy+dz*dz < 0.16) list.push(j);
      }
    }
    neighbors[i] = list;
  }
  return neighbors;
}
