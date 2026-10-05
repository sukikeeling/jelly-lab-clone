/* ============================================================
   scene.js —— 摄影棚布光与当代艺术陈列台座
   - 程序生成浮点摄影棚环境贴图（5 块柔光箱）
   - 暖主光 + 冷补光 + 暖轮廓光 + 2048 软阴影
   - 大师级当代艺术陈列台座（Plinth Base）：
     双层梯形车削拉丝黄铜 + 象牙骨瓷托盘 + 金色聚能环，稳稳承托 Bot 底部
   - ShadowMaterial 地面 + 柔和接触阴影
   ============================================================ */
import * as THREE from "three";

const TAU = Math.PI * 2;
const GROUND_Y = -0.92;

function smooth01(value) {
  return value * value * (3 - 2 * value);
}

function buildStudioEnvironment() {
  const width = 384;
  const height = 192;
  const data = new Float32Array(width * height * 4);
  const softboxes = [
    { direction: new THREE.Vector3(0.45, 0.85, 0.35), intensity: 5.2, exponent: 16, color: [1, 0.98, 0.94] },
    { direction: new THREE.Vector3(-0.85, 0.25, 0.15), intensity: 1.5, exponent: 7, color: [0.82, 0.9, 1] },
    { direction: new THREE.Vector3(0.15, 0.35, -0.95), intensity: 2.6, exponent: 12, color: [1, 0.86, 0.66] },
    { direction: new THREE.Vector3(0.95, 0.05, 0.3), intensity: 0.9, exponent: 9, color: [1, 0.95, 0.85] },
    { direction: new THREE.Vector3(0, -1, 0), intensity: 0.5, exponent: 4, color: [1, 0.93, 0.82] },
  ];
  for (const softbox of softboxes) softbox.direction.normalize();
  const direction = new THREE.Vector3();
  for (let y = 0; y < height; y += 1) {
    const phi = ((y + 0.5) / height) * Math.PI;
    for (let x = 0; x < width; x += 1) {
      const theta = ((x + 0.5) / width) * TAU;
      direction.set(
        -Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
        -Math.sin(phi) * Math.cos(theta),
      );
      const up = direction.y * 0.5 + 0.5;
      let red = THREE.MathUtils.lerp(0.32, 1.05, smooth01(up)) * 0.9;
      let green = red * 0.985;
      let blue = red * 0.94;
      for (const softbox of softboxes) {
        const weight =
          softbox.intensity *
          Math.pow(Math.max(direction.dot(softbox.direction), 0), softbox.exponent);
        red += weight * softbox.color[0];
        green += weight * softbox.color[1];
        blue += weight * softbox.color[2];
      }
      const index = (y * width + x) * 4;
      data[index] = red;
      data[index + 1] = green;
      data[index + 2] = blue;
      data[index + 3] = 1;
    }
  }
  const environment = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.magFilter = THREE.LinearFilter;
  environment.minFilter = THREE.LinearFilter;
  environment.needsUpdate = true;
  return environment;
}

/* 柔和接触阴影 */
function buildBlushTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(107, 92, 68, 0.48)");
  gradient.addColorStop(0.45, "rgba(107, 92, 68, 0.22)");
  gradient.addColorStop(1, "rgba(107, 92, 68, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createStudioScene({ renderer, scene, camera }) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;

  scene.background = new THREE.Color(0xc9c2b8);

  const environment = buildStudioEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(environment);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.45;
  environment.dispose();
  pmrem.dispose();

  /* —— 主光（暖色 + 软阴影） —— */
  const key = new THREE.DirectionalLight(0xffead4, 1.95);
  key.position.set(3.2, 4.4, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -2.4;
  key.shadow.camera.bottom = -2.4;
  key.shadow.camera.right = 2.4;
  key.shadow.camera.top = 2.4;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 12;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);

  /* —— 补光 + 轮廓光 —— */
  const fill = new THREE.DirectionalLight(0xcadcf2, 0.36);
  fill.position.set(-3.4, 1.8, 1.6);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffc98f, 0.65);
  rim.position.set(-1.4, 2.2, -3.6);
  scene.add(rim);

  /* —— 大师级艺术陈列展台（Plinth Base，紧凑精致） —— */
  const plinthGroup = new THREE.Group();

  const brassMat = new THREE.MeshPhysicalMaterial({
    color: 0xc7973f,
    metalness: 1,
    roughness: 0.28,
    clearcoat: 0.5,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.0,
  });

  const porcelainMat = new THREE.MeshPhysicalMaterial({
    color: 0xf4f0e6,
    metalness: 0,
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    sheen: 0.8,
    sheenColor: new THREE.Color(0xffffff),
    envMapIntensity: 1.1,
  });

  // 1. 底层黄铜大台座（y: -0.90 ~ -0.84, 半径 1.22）
  const ring1 = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.24, 0.06, 48), brassMat);
  ring1.receiveShadow = true;
  ring1.castShadow = true;
  ring1.position.y = -0.87;
  plinthGroup.add(ring1);

  // 2. 中层象牙白瓷主托盘（y: -0.84 ~ -0.74, 半径 1.08）
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.14, 0.10, 48), porcelainMat);
  dish.receiveShadow = true;
  dish.castShadow = true;
  dish.position.y = -0.79;
  plinthGroup.add(dish);

  // 3. 顶层黄铜内嵌同心圆环（y: -0.73, 半径 0.80）
  const ring2 = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.82, 0.02, 48), brassMat);
  ring2.receiveShadow = true;
  ring2.position.y = -0.73;
  plinthGroup.add(ring2);

  // 4. 托盘中心发光金环
  const glowRingMat = new THREE.MeshBasicMaterial({
    color: 0xffd84d,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });
  const glowRing = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.65, 48), glowRingMat);
  glowRing.rotation.x = -Math.PI / 2;
  glowRing.position.y = -0.718;
  plinthGroup.add(glowRing);

  scene.add(plinthGroup);

  /* —— 地面 + 接触阴影 —— */
  const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.26 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 48), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  ground.receiveShadow = true;
  scene.add(ground);

  const blushMaterial = new THREE.MeshBasicMaterial({
    map: buildBlushTexture(),
    transparent: true,
    depthWrite: false,
  });
  const blush = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 5.0), blushMaterial);
  blush.rotation.x = -Math.PI / 2;
  blush.position.set(0, GROUND_Y + 0.002, 0);
  blush.renderOrder = -1;
  scene.add(blush);

  return {
    ground,
    blush,
    dispose() {
      scene.environment = null;
      envRT.texture.dispose();
      ground.geometry.dispose();
      groundMaterial.dispose();
      blush.geometry.dispose();
      blushMaterial.map.dispose();
      blushMaterial.dispose();
      ring1.geometry.dispose();
      dish.geometry.dispose();
      ring2.geometry.dispose();
      glowRing.geometry.dispose();
      glowRingMat.dispose();
      brassMat.dispose();
      porcelainMat.dispose();
    },
  };
}
