/* ============================================================
 * cut.js — 切割：裁剪面 + 横截面封盖
 * 约定：JellyBody.group 容纳 mesh（mesh 本地 transform 为单位）
 * ============================================================ */
import * as THREE from 'three';
import { JellyBody } from './three-jelly.js';

/**
 * 用竖直平面切割果冻
 * @param {JellyBody} jelly
 * @param {THREE.Vector3} p0 平面上一点（世界）
 * @param {THREE.Vector3} p1 平面上另一点（世界）
 * @param {string} capColor 封盖颜色
 * @returns [jellyA, jellyB] 或 null（jA 复用原 group）
 */
export function cutJelly(jelly, p0, p1, capColor = '#e0445a') {
  const up = new THREE.Vector3(0, 1, 0);
  const dir = p1.clone().sub(p0);
  dir.y = 0;
  if (dir.length() < 0.2) return null;
  dir.normalize();
  const normal = new THREE.Vector3().crossVectors(up, dir).normalize();

  const scene = jelly.group.parent;
  if (!scene) return null;
  const gPos = new THREE.Vector3();
  jelly.group.getWorldPosition(gPos);
  // mesh 本地坐标 = 世界 - group 位置（group 无旋转缩放约定）
  const lp0 = p0.clone().sub(gPos);

  const planeA = new THREE.Plane().setFromNormalAndCoplanarPoint(normal.clone(), lp0);
  const planeB = new THREE.Plane().setFromNormalAndCoplanarPoint(normal.clone().negate(), lp0);

  // B：克隆 mesh + 几何体
  const meshB = jelly.mesh.clone();
  meshB.geometry = jelly.mesh.geometry.clone();

  // 各自材质（克隆 + 裁剪面）
  const matA = jelly.mesh.material.clone();
  const matB = jelly.mesh.material.clone();
  matA.clippingPlanes = [planeA];
  matB.clippingPlanes = [planeB];
  matA.clipShadows = matB.clipShadows = false;
  jelly.mesh.material = matA;
  meshB.material = matB;

  // 封盖（用当前变形后的几何体求交）
  const capMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(capColor),
    roughness: 0.32, transmission: 0.45, thickness: 0.5,
    clearcoat: 0.5, side: THREE.DoubleSide,
  });
  const capGeoA = buildCapGeometry(jelly.mesh.geometry, planeA);
  const capGeoB = buildCapGeometry(jelly.mesh.geometry, planeB);

  // A 复用原 group（注意：JellyBody 构造器会把 mesh 抢走，需加回来）
  const jA = new JellyBody(jelly.mesh, { firmness: 60, damping: 18 });
  jelly.group.add(jelly.mesh);
  jA.group = jelly.group;
  jA.clips = [planeA];
  // 跟随物（籽等）保留在原 group，顶点索引对 meshA 依然有效
  if (capGeoA) {
    const capA = new THREE.Mesh(capGeoA, capMat);
    jA.group.add(capA);
    jA.cap = capA;
  }
  separate(jA, normal.clone());

  // B 新 group
  const gB = new THREE.Group();
  gB.position.copy(jelly.group.position);
  gB.rotation.copy(jelly.group.rotation);
  scene.add(gB);
  const jB = new JellyBody(meshB, { firmness: 60, damping: 18 });
  jB.group = gB;
  gB.add(meshB);
  // followers 加到新 group
  if (capGeoB) {
    const capB = new THREE.Mesh(capGeoB, capMat);
    gB.add(capB);
    jB.cap = capB;
  }
  jB.clips = [planeB];
  separate(jB, normal.clone().negate());

  return [jA, jB];
}

function separate(jb, dir) {
  const v = dir.multiplyScalar(1.7);
  for (let i = 0; i < jb.count; i++) {
    jb.vel[i*3]   += v.x * (0.7 + Math.random() * 0.6);
    jb.vel[i*3+1] += Math.random() * 1.0;
    jb.vel[i*3+2] += v.z * (0.7 + Math.random() * 0.6);
  }
}

// 平面与三角形求交 → 截面多边形 → 扇形三角化
function buildCapGeometry(geometry, plane) {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const pts = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), tmp = new THREE.Vector3();
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t*3) : t*3;
    const i1 = idx ? idx.getX(t*3+1) : t*3+1;
    const i2 = idx ? idx.getX(t*3+2) : t*3+2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    const da = plane.distanceToPoint(a), db = plane.distanceToPoint(b), dc = plane.distanceToPoint(c);
    const hits = [];
    if (edgeHit(a,b,da,db,tmp)) hits.push(tmp.clone());
    if (edgeHit(b,c,db,dc,tmp)) hits.push(tmp.clone());
    if (edgeHit(c,a,dc,da,tmp)) hits.push(tmp.clone());
    if (hits.length >= 2) { pts.push(hits[0], hits[1]); }
  }
  if (pts.length < 3) return null;
  const uniq = [];
  for (const p of pts) {
    if (!uniq.some(q => q.distanceToSquared(p) < 1e-8)) uniq.push(p);
  }
  if (uniq.length < 3) return null;
  const centroid = new THREE.Vector3();
  uniq.forEach(p => centroid.add(p));
  centroid.multiplyScalar(1 / uniq.length);
  const n = plane.normal;
  const ref = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
  const bu = new THREE.Vector3().crossVectors(n, ref).normalize();
  const bv = new THREE.Vector3().crossVectors(n, bu).normalize();
  const ang = p => Math.atan2(p.clone().sub(centroid).dot(bv), p.clone().sub(centroid).dot(bu));
  uniq.sort((p, q) => ang(p) - ang(q));
  const verts = [];
  const inner = uniq.map(p => p.clone().lerp(centroid, 0.015));
  for (let i = 0; i < inner.length; i++) {
    const p1 = inner[i], p2 = inner[(i+1) % inner.length];
    verts.push(centroid.x, centroid.y, centroid.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

function edgeHit(p, q, dp, dq, out) {
  if ((dp > 1e-9) !== (dq > 1e-9) && Math.abs(dp - dq) > 1e-12) {
    const t = dp / (dp - dq);
    if (t > 0 && t < 1) { out.copy(p).lerp(q, t); return true; }
  }
  return false;
}

// 世界点是否在 jelly 的保留侧（raycast 过滤被裁掉部分）
export function hitOnKeptSide(jelly, worldPt) {
  if (!jelly.clips || !jelly.clips.length) return true;
  const gp = new THREE.Vector3();
  jelly.group.getWorldPosition(gp);
  const lp = worldPt.clone().sub(gp);
  return jelly.clips.every(pl => pl.distanceToPoint(lp) >= -0.06);
}
