import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { JellyPhysics } from './jelly-physics';

export type JellySettings = { flavor: 'honey' | 'berry' | 'mint'; firmness: number; damping: number; slow: boolean; wireframe: boolean; paused: boolean };
export type JellyController = { backend: string; update(s: JellySettings): void; nudge(): void; reset(): void; dispose(): void };
type Metrics = { energy: number; stretch: number };
const colors = {
  honey: { color: '#fff1bc', attenuation: '#dc940e' },
  berry: { color: '#ffe6ec', attenuation: '#bd315c' },
  mint: { color: '#d9fff0', attenuation: '#3caa86' },
};

export async function createJellyScene(host: HTMLDivElement, initial: JellySettings, onMetrics: (m: Metrics) => void): Promise<JellyController> {
  let settings = { ...initial };
  let disposed = false;
  const physics = new JellyPhysics();
  physics.firmness = settings.firmness;
  physics.damping = settings.damping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dce0df');
  scene.fog = new THREE.Fog('#dce0df', 15, 34);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  try { await renderer.init(); } catch (error) { renderer.dispose(); throw error; }
  host.appendChild(renderer.domElement);

  const environment = new RoomEnvironment();
  // Large luminous panels produce distinct studio highlights on the jelly.
  const panelGeometry = new THREE.PlaneGeometry(1, 1);
  const panelMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6), side: THREE.DoubleSide });
  for (const [x, y, z, width, height] of [[-3,4,2,1.2,4],[3,4,-3,2.5,3],[0,6,0,3,2]]) {
    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
    panel.position.set(x,y,z); panel.scale.set(width,height,1); panel.lookAt(0,0,0); environment.add(panel);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(environment, 0.035, 0.1, 100);
  scene.environment = envMap.texture;
  scene.environmentIntensity = 0.85;
  environment.dispose();
  panelGeometry.dispose(); panelMaterial.dispose(); pmrem.dispose();

  scene.add(new THREE.HemisphereLight('#f9fff9', '#b7c2bd', 2.1));
  const key = new THREE.DirectionalLight('#fff9ed', 3.3);
  key.position.set(-3,7,4); scene.add(key);
  const fill = new THREE.DirectionalLight('#e5f2ff', 1.2);
  fill.position.set(4,3,-3); scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200), new THREE.MeshStandardMaterial({ color: '#cbd1ce', roughness: 0.85, metalness: 0 }));
  floor.rotation.x=-Math.PI/2; floor.position.y=-0.012; scene.add(floor);
  const grid = new THREE.GridHelper(50,100,'#81928b','#94a29c');
  grid.position.y=-0.004;
  const gridMaterial = grid.material as THREE.LineBasicMaterial;
  gridMaterial.transparent=true;gridMaterial.opacity=0.055;gridMaterial.depthWrite=false;
  scene.add(grid);

  const shadowCanvas=document.createElement('canvas');
  shadowCanvas.width=128;shadowCanvas.height=128;
  const context=shadowCanvas.getContext('2d')!;
  const gradient=context.createRadialGradient(64,64,8,64,64,64);
  gradient.addColorStop(0,'rgba(24,37,27,0.45)');
  gradient.addColorStop(0.4,'rgba(24,37,27,0.3)');
  gradient.addColorStop(0.75,'rgba(24,37,27,0.1)');
  gradient.addColorStop(1,'rgba(24,37,27,0)');
  context.fillStyle=gradient;context.fillRect(0,0,128,128);
  const shadowTexture=new THREE.CanvasTexture(shadowCanvas);
  const shadowMaterial=new THREE.MeshBasicMaterial({ map:shadowTexture,transparent:true,depthWrite:false });
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(4.8,4.8),shadowMaterial);
  shadow.rotation.x=-Math.PI/2;shadow.position.y=0.002;scene.add(shadow);

  // An evenly tessellated rounded cube, with welded seams for smooth normals.
  const raw=new THREE.BoxGeometry(2,2,2,24,24,24);
  const rawPosition=raw.getAttribute('position');
  const point=new THREE.Vector3(), core=new THREE.Vector3();
  for(let i=0;i<rawPosition.count;i++) {
    point.fromBufferAttribute(rawPosition,i);
    core.copy(point).clampScalar(-0.7,0.7);
    point.sub(core).normalize().multiplyScalar(0.3).add(core);
    rawPosition.setXYZ(i,point.x,point.y,point.z);
  }
  raw.deleteAttribute('normal');raw.deleteAttribute('uv');
  const geometry=mergeVertices(raw,0.0001);raw.dispose();
  const surface=geometry.getAttribute('position') as THREE.BufferAttribute;
  surface.setUsage(THREE.DynamicDrawUsage);
  const surfaceRest=new Float32Array(surface.array);
  const bindings=Array.from({length:surface.count},(_,i)=>physics.embed(surfaceRest[i*3],surfaceRest[i*3+1],surfaceRest[i*3+2]));
  const material=new THREE.MeshPhysicalNodeMaterial({
    color:colors[settings.flavor].color,
    metalness:0, roughness:0.115, transmission:1, thickness:2.15,
    ior:1.43, attenuationColor:new THREE.Color(colors[settings.flavor].attenuation),
    attenuationDistance:1.0, clearcoat:1, clearcoatRoughness:0.07,
    dispersion:0.045, envMapIntensity:1.25,
  });
  const jelly=new THREE.Mesh(geometry,material);
  jelly.frustumCulled=false;scene.add(jelly);
  const wireMaterial=new THREE.MeshBasicMaterial({color:'#293b34',wireframe:true,transparent:true,opacity:0.18,depthWrite:false});
  const wire=new THREE.Mesh(geometry,wireMaterial);wire.frustumCulled=false;wire.visible=settings.wireframe;scene.add(wire);
  const marker=new THREE.Mesh(new THREE.SphereGeometry(0.043,16,12),new THREE.MeshBasicMaterial({color:'#ffffff',depthTest:false}));
  marker.visible=false;marker.renderOrder=5;scene.add(marker);

  const syncSurface=()=> {
    const p=physics.position;
    for(let i=0;i<surface.count;i++) {
      const {indices,weights}=bindings[i];let x=0,y=0,z=0;
      for(let j=0;j<8;j++) { const index=indices[j],w=weights[j];x+=p[index]*w;y+=p[index+1]*w;z+=p[index+2]*w; }
      surface.setXYZ(i,x,y,z);
    }
    surface.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
    let x=0,y=0,z=0;for(let i=0;i<p.length;i+=3){x+=p[i];y+=p[i+1];z+=p[i+2];}
    x/=physics.count;y/=physics.count;z/=physics.count;
    shadow.position.x=x;shadow.position.z=z;
    const height=Math.max(0,y-1);shadow.scale.setScalar(1+height*0.18);
    shadowMaterial.opacity=Math.max(0.13,0.87-height*0.22);
    if(physics.grab) {marker.position.fromArray(physics.grab.target);marker.visible=true;}else marker.visible=false;
  };
  const resize=()=> {
    const width=host.clientWidth,height=host.clientHeight;
    camera.aspect=width/height;
    if(width<=700) {camera.position.set(5.4,4.2,7.8);camera.lookAt(0,1.15,0);camera.fov=40;camera.setViewOffset(width,height,0,-height*0.08,width,height);}
    else {camera.position.set(5,3.6,7);camera.lookAt(0,1,0);camera.fov=34;camera.setViewOffset(width,height,width*0.055,-height*0.035,width,height);}
    camera.updateProjectionMatrix();renderer.setSize(width,height);
  };
  resize();
  const observer=new ResizeObserver(resize);observer.observe(host);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const dragPlane=new THREE.Plane(),normal=new THREE.Vector3(),target=new THREE.Vector3();
  let activePointer:number|null=null;
  const setRay=(event:PointerEvent)=> {
    const box=renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);
    raycaster.setFromCamera(pointer,camera);
  };
  const down=(event:PointerEvent)=> {
    if(event.button!==0||settings.paused||activePointer!==null)return;
    setRay(event);
    const hit=raycaster.intersectObject(jelly)[0];
    if(!hit?.face)return;
    const {a,b,c}=hit.face;
    const pa=new THREE.Vector3().fromBufferAttribute(surface,a),pb=new THREE.Vector3().fromBufferAttribute(surface,b),pc=new THREE.Vector3().fromBufferAttribute(surface,c);
    const bary=new THREE.Vector3();
    THREE.Triangle.getBarycoord(hit.point,pa,pb,pc,bary);
    const restPoint=new THREE.Vector3();
    restPoint.addScaledVector(new THREE.Vector3().fromArray(surfaceRest,a*3),bary.x);
    restPoint.addScaledVector(new THREE.Vector3().fromArray(surfaceRest,b*3),bary.y);
    restPoint.addScaledVector(new THREE.Vector3().fromArray(surfaceRest,c*3),bary.z);
    physics.grab={...physics.embed(restPoint.x,restPoint.y,restPoint.z),target:hit.point.toArray()};
    camera.getWorldDirection(normal);dragPlane.setFromNormalAndCoplanarPoint(normal,hit.point);
    activePointer=event.pointerId;renderer.domElement.setPointerCapture(event.pointerId);
    renderer.domElement.style.cursor='grabbing';event.preventDefault();
  };
  const move=(event:PointerEvent)=> {
    if(activePointer!==event.pointerId||!physics.grab)return;
    setRay(event);
    if(raycaster.ray.intersectPlane(dragPlane,target)) {
      target.x=THREE.MathUtils.clamp(target.x,-2.8,2.8);target.y=THREE.MathUtils.clamp(target.y,0.1,4.8);target.z=THREE.MathUtils.clamp(target.z,-2.8,2.8);
      physics.grab.target=target.toArray();
    }
  };
  const up=()=> {
    if(activePointer!==null&&renderer.domElement.hasPointerCapture(activePointer))renderer.domElement.releasePointerCapture(activePointer);
    activePointer=null;physics.grab=null;renderer.domElement.style.cursor='grab';
  };
  renderer.domElement.addEventListener('pointerdown',down);
  renderer.domElement.addEventListener('pointermove',move);
  renderer.domElement.addEventListener('pointerup',up);
  renderer.domElement.addEventListener('pointercancel',up);
  renderer.domElement.addEventListener('lostpointercapture',up);
  window.addEventListener('blur',up);
  syncSurface();
  let previous=performance.now(),accumulator=0,lastMetrics=0;
  const update=(s:JellySettings)=> {
    settings={...s};physics.firmness=s.firmness;physics.damping=s.damping;
    material.color.set(colors[s.flavor].color);material.attenuationColor.set(colors[s.flavor].attenuation);
    wire.visible=s.wireframe;
    if(s.paused)up();
  };
  const dispose=()=> {
    if(disposed)return;disposed=true;up();renderer.setAnimationLoop(null);observer.disconnect();
    renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointermove',move);
    renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('pointercancel',up);renderer.domElement.removeEventListener('lostpointercapture',up);
    window.removeEventListener('blur',up);
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    scene.traverse(object=> {if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){geometries.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material])materials.add(m);}});
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
    shadowTexture.dispose();envMap.dispose();renderer.dispose();renderer.domElement.remove();
  };
  try {
    await renderer.compileAsync(scene,camera);
    renderer.render(scene,camera);
  } catch(error) { dispose();throw error; }
  previous=performance.now();
  renderer.setAnimationLoop((now:number)=> {
    if(disposed)return;
    const elapsed=Math.min((now-previous)/1000,0.04);previous=now;
    if(!document.hidden&&!settings.paused) {
      accumulator+=elapsed*(settings.slow?0.25:1);
      let steps=0;
      while(accumulator>=1/120&&steps<5) {physics.step(1/120);accumulator-=1/120;steps++;}
      syncSurface();
    }
    if(document.hidden)return;
    renderer.render(scene,camera);
    if(now-lastMetrics>180) {onMetrics(physics.metrics());lastMetrics=now;}
  });
  return {
    backend:(renderer.backend as unknown as {isWebGPUBackend?:boolean}).isWebGPUBackend?'WebGPU':'WebGL 2',
    update,nudge:()=>physics.nudge(),reset:()=>{up();physics.reset();accumulator=0;syncSurface();onMetrics(physics.metrics());},dispose,
  };
}
