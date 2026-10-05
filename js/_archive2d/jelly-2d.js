/* ============================================================
 * jelly.js — 2D 软体果冻物理引擎
 * 质点-弹簧 + 气压体积保持 + 三角剖分贴图扭曲
 * ============================================================ */
'use strict';

const TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

/* ---------- 多边形工具 ---------- */
function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

// 线段 ab 与直线 (p, dir) 的交点，返回 t（ab 上的参数）或 null
function segLineIntersect(ax, ay, bx, by, px, py, dx, dy) {
  const ex = bx - ax, ey = by - ay;
  const denom = ex * dy - ey * dx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((px - ax) * dy - (py - ay) * dx) / denom;
  if (t < -1e-6 || t > 1 + 1e-6) return null;
  return clamp(t, 0, 1);
}

// 用直线 (过 p 方向 dir) 分割凸/凹多边形，返回 [polyA, polyB] 或 null
function splitPolygonByLine(poly, px, py, dx, dy) {
  const n = poly.length;
  const marks = []; // 每条边与直线的交点
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % n];
    const t = segLineIntersect(ax, ay, bx, by, px, py, dx, dy);
    if (t !== null && t > 1e-4 && t < 1 - 1e-4) {
      marks.push({ edge: i, t, x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
    }
  }
  if (marks.length < 2) return null;
  // 取相距最远的两个交点（处理多次相交的凹多边形取主切割）
  let best = null, bestD = -1;
  for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) {
    const d = dist2(marks[i].x, marks[i].y, marks[j].x, marks[j].y);
    if (d > bestD) { bestD = d; best = [marks[i], marks[j]]; }
  }
  if (bestD < 400) return null; // 切线太短
  let [m1, m2] = best;
  // 确保 m1.edge < m2.edge 顺序
  if (m1.edge > m2.edge) { const t = m1; m1 = m2; m2 = t; }
  const P = (m) => [m.x, m.y];
  const polyA = [P(m1)];
  for (let i = m1.edge + 1; i <= m2.edge; i++) polyA.push(poly[i % n].slice());
  polyA.push(P(m2));
  const polyB = [P(m2)];
  for (let i = m2.edge + 1; i <= m1.edge + n; i++) polyB.push(poly[i % n].slice());
  polyB.push(P(m1));
  if (polyA.length < 3 || polyB.length < 3) return null;
  if (Math.abs(polyArea(polyA)) < 300 || Math.abs(polyArea(polyB)) < 300) return null;
  return [polyA, polyB];
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ============================================================
 * SoftBody — 单块果冻
 * art: { canvas, poly } — 贴图及其在贴图坐标系中的多边形
 * 粒子位置为屏幕坐标；artPoly 与粒子的对应关系按索引
 * ============================================================ */
class SoftBody {
  constructor(artCanvas, artPoly, screenPoly, opts = {}) {
    this.art = artCanvas;
    this.artPoly = artPoly.map(p => p.slice());
    const n = screenPoly.length;
    this.pts = screenPoly.map(([x, y]) => ({ x, y, px: x, py: y, fx: 0, fy: 0 }));
    // 中心粒子
    let cx = 0, cy = 0;
    screenPoly.forEach(([x, y]) => { cx += x; cy += y; });
    cx /= n; cy /= n;
    this.center = { x: cx, y: cy, px: cx, py: cy, fx: 0, fy: 0 };
    // 弹簧：边界相邻 + 隔一 + 中心放射
    this.springs = [];
    const addSpring = (a, b, k, damp) => {
      const dx = a.x - b.x, dy = a.y - b.y;
      this.springs.push({ a, b, rest: Math.hypot(dx, dy) || 1, k, damp });
    };
    const kEdge = opts.kEdge ?? 0.55, kDiag = opts.kDiag ?? 0.28, kRad = opts.kRad ?? 0.32;
    for (let i = 0; i < n; i++) {
      addSpring(this.pts[i], this.pts[(i + 1) % n], kEdge, 0.12);
      addSpring(this.pts[i], this.pts[(i + 2) % n], kDiag, 0.10);
      addSpring(this.pts[i], this.center, kRad, 0.08);
    }
    this.restArea = Math.abs(polyArea(screenPoly));
    this.pressureK = opts.pressureK ?? 0.045;
    this.gravity = opts.gravity ?? 0;
    this.damping = opts.damping ?? 0.985;
    this.maxDeform = 0; // 本帧最大形变（用于拉丝/音效触发）
    this.trail = []; // 拉丝粒子
    this.id = SoftBody._id = (SoftBody._id || 0) + 1;
  }

  get n() { return this.pts.length; }

  currentPoly() { return this.pts.map(p => [p.x, p.y]); }
  area() { return Math.abs(polyArea(this.currentPoly())); }
  kinetic() {
    let e = 0;
    for (const p of this.pts) { const vx = p.x - p.px, vy = p.y - p.py; e += vx * vx + vy * vy; }
    return e;
  }
  centroid() {
    let cx = 0, cy = 0;
    for (const p of this.pts) { cx += p.x; cy += p.y; }
    return [cx / this.n, cy / this.n];
  }
  contains(x, y) { return pointInPoly(x, y, this.currentPoly()); }

  // 在 (x,y) 半径 r 内拖拽：粒子跟随 (dx,dy)，带衰减
  drag(x, y, dx, dy, r = 70) {
    let moved = 0;
    for (const p of this.pts) {
      const d2 = dist2(x, y, p.x, p.y);
      if (d2 < r * r) {
        const w = 1 - Math.sqrt(d2) / r;
        p.x += dx * (0.35 + 0.65 * w);
        p.y += dy * (0.35 + 0.65 * w);
        moved += w;
      }
    }
    // 中心也稍微跟随
    const dc = dist2(x, y, this.center.x, this.center.y);
    if (dc < r * r * 4) {
      const w = 0.25 * (1 - Math.sqrt(dc) / (r * 2));
      this.center.x += dx * w; this.center.y += dy * w;
    }
    return moved;
  }

  poke(x, y, ix, iy, r = 90) {
    for (const p of this.pts) {
      const d2 = dist2(x, y, p.x, p.y);
      if (d2 < r * r) {
        const w = 1 - Math.sqrt(d2) / r;
        p.px -= ix * w; p.py -= iy * w;
      }
    }
  }

  shake(strength = 14) {
    const [cx, cy] = this.centroid();
    for (const p of this.pts) {
      const ang = Math.atan2(p.y - cy, p.x - cx) + Math.PI / 2;
      const s = strength * (0.7 + Math.random() * 0.6);
      p.px -= Math.cos(ang) * s;
      p.py -= Math.sin(ang) * s * 0.6;
    }
  }

  update(dt, env = {}) {
    const damp = this.damping;
    const all = this.pts.concat([this.center]);
    // 弹簧力
    for (const s of this.springs) {
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const f = (d - s.rest) * s.k;
      const ux = dx / d, uy = dy / d;
      s.a.fx += ux * f; s.a.fy += uy * f;
      s.b.fx -= ux * f; s.b.fy -= uy * f;
    }
    // 气压：保持体积
    const area = this.area();
    const dp = (this.restArea - area) * this.pressureK;
    if (Math.abs(dp) > 0.01) {
      const n = this.n;
      for (let i = 0; i < n; i++) {
        const p = this.pts[i], q = this.pts[(i + 1) % n];
        // 法线
        let nx = -(q.y - p.y), ny = q.x - p.x;
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        p.fx += nx * dp * 0.5; p.fy += ny * dp * 0.5;
      }
    }
    // 积分
    const g = this.gravity + (env.gravity || 0);
    let maxD = 0;
    for (const p of all) {
      const vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
      p.px = p.x; p.py = p.y;
      p.x += vx + p.fx * dt * dt;
      p.y += vy + (p.fy + g) * dt * dt;
      p.fx = 0; p.fy = 0;
      const dd = Math.hypot(vx, vy);
      if (dd > maxD) maxD = dd;
    }
    this.maxDeform = maxD;
    // 世界边界（env.bounds = {x,y,w,h}）
    if (env.bounds) {
      const { x, y, w, h } = env.bounds;
      for (const p of this.pts) {
        if (p.x < x) { p.x = x; p.px = x + (p.x - p.px) * -0.4; }
        if (p.x > x + w) { p.x = x + w; p.px = p.x + (p.x - p.px) * -0.4; }
        if (p.y < y) { p.y = y; p.py = y + (p.y - p.py) * -0.4; }
        if (p.y > y + h) { p.y = y + h; p.py = p.y + (p.y - p.py) * -0.4; }
      }
    }
    // 拉丝粒子更新
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const t = this.trail[i];
      t.life -= dt;
      t.y += t.vy * dt; t.vy += 0.02;
      if (t.life <= 0) this.trail.splice(i, 1);
    }
  }

  spawnTrail(x, y) {
    if (this.trail.length > 40) return;
    this.trail.push({ x: x + (Math.random() - 0.5) * 10, y, vy: -0.4 - Math.random(), life: 0.9, r: 2 + Math.random() * 3 });
  }

  // 用直线切割，返回 [bodyA, bodyB] 或 null
  // line = {x1,y1,x2,y2} 屏幕坐标
  cut(line) {
    const poly = this.currentPoly();
    const dx = line.x2 - line.x1, dy = line.y2 - line.y1;
    const len = Math.hypot(dx, dy);
    if (len < 30) return null;
    const ux = dx / len, uy = dy / len;
    const res = splitPolygonByLine(poly, line.x1, line.y1, ux, uy);
    if (!res) return null;
    const [polyA, polyB] = res;
    const mkBody = (sp) => {
      // artPoly：把屏幕多边形映射回贴图坐标。
      // 近似：用原 artPoly 的包围盒做仿射映射（切割小块会有轻微贴图偏移，可接受）
      const sb = boundsOf(poly), ab = boundsOf(this.artPoly);
      const ap = sp.map(([x, y]) => [
        ab.x + (x - sb.x) / (sb.w || 1) * ab.w,
        ab.y + (y - sb.y) / (sb.h || 1) * ab.h,
      ]);
      const b = new SoftBody(this.art, ap, sp, {
        kEdge: 0.55, kDiag: 0.28, kRad: 0.32, pressureK: this.pressureK,
      });
      // 继承一点切分速度
      for (const p of b.pts) { p.px -= ux * 2; p.py -= uy * 2; }
      return b;
    };
    return [mkBody(polyA), mkBody(polyB)];
  }

  /* ---------- 渲染：三角剖分贴图扭曲 ---------- */
  draw(ctx) {
    const n = this.n;
    if (n < 3) return;
    const [ccx, ccy] = [this.center.x, this.center.y];
    // art 中心
    let acx = 0, acy = 0;
    for (const [x, y] of this.artPoly) { acx += x; acy += y; }
    acx /= this.artPoly.length; acy /= this.artPoly.length;

    ctx.save();
    for (let i = 0; i < n; i++) {
      const p1 = this.pts[i], p2 = this.pts[(i + 1) % n];
      const [a1x, a1y] = this.artPoly[i], [a2x, a2y] = this.artPoly[(i + 1) % n];
      drawTexturedTri(ctx, this.art,
        a1x, a1y, a2x, a2y, acx, acy,
        p1.x, p1.y, p2.x, p2.y, ccx, ccy);
    }
    ctx.restore();
    // 拉丝
    for (const t of this.trail) {
      ctx.globalAlpha = clamp(t.life, 0, 1) * 0.55;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, t.r * 0.45, t.r * 1.6, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function boundsOf(poly) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x; if (y < y0) y0 = y;
    if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// 把贴图三角形 (a1,a2,ac) 仿射映射到屏幕三角形 (p1,p2,pc)
function drawTexturedTri(ctx, img, a1x, a1y, a2x, a2y, acx, acy, p1x, p1y, p2x, p2y, pcx, pcy) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, p2y); ctx.lineTo(pcx, pcy);
  ctx.closePath(); ctx.clip();
  // 解仿射矩阵
  const d = a1x * (a2y - acy) + a2x * (acy - a1y) + acx * (a1y - a2y);
  if (Math.abs(d) < 1e-6) { ctx.restore(); return; }
  const m11 = (p1x * (a2y - acy) + p2x * (acy - a1y) + pcx * (a1y - a2y)) / d;
  const m12 = (p1x * (a2x - acx) + p2x * (acx - a1x) + pcx * (a1x - a2x)) / -d;
  const m21 = (p1y * (a2y - acy) + p2y * (acy - a1y) + pcy * (a1y - a2y)) / d;
  const m22 = (p1y * (a2x - acx) + p2y * (acx - a1x) + pcy * (a1x - a2x)) / -d;
  const dx = (p1x * (a2x * acy - acx * a2y) + p2x * (acx * a1y - a1x * acy) + pcx * (a1x * a2y - a2x * a1y)) / d;
  const dy = (p1y * (a2x * acy - acx * a2y) + p2y * (acx * a1y - a1x * acy) + pcy * (a1x * a2y - a2x * a1y)) / d;
  ctx.transform(m11, m21, m12, m22, dx, dy);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/* ---------- 形状生成器（贴图坐标系，400x400） ---------- */
const ART = 400;
function shapeSlice(cx, cy, r, a0, a1, n = 26) {
  // 扇形切片（如西瓜/橘子瓣）
  const pts = [[cx, cy]];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
function shapeEllipse(cx, cy, rx, ry, n = 30) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}
function shapeRing(cx, cy, ro, ri, n = 30) {
  // 菠萝圈：用外圈多边形近似（内圈画在贴图上，物理为实心软体更稳定）
  return shapeEllipse(cx, cy, ro, ro * 0.92, n);
}
function shapeStar(cx, cy, r, n = 10) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = i / (n * 2) * TAU - Math.PI / 2;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}
function shapeHeart(cx, cy, s, n = 28) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / n * TAU;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([cx + x * s / 16, cy - y * s / 16]);
  }
  return pts;
}
function shapeBear(cx, cy, s, n = 34) {
  // 小熊：超椭圆近似
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    const c = Math.cos(a), si = Math.sin(a);
    const r = s / Math.pow(Math.pow(Math.abs(c), 2.6) + Math.pow(Math.abs(si), 2.6), 1 / 2.6);
    pts.push([cx + c * r, cy + si * r * 1.08]);
  }
  return pts;
}

/* ---------- 贴图绘制（果冻美术） ---------- */
// 在 400x400 canvas 上按多边形绘制果冻质感，detail 回调画果肉细节
function paintJelly(poly, base, dark, light, detailFn) {
  const c = document.createElement('canvas');
  c.width = c.height = ART;
  const x = c.getContext('2d');
  const b = boundsOf(poly);
  // 主体渐变
  const g = x.createRadialGradient(b.x + b.w * 0.38, b.y + b.h * 0.3, 10, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) * 0.75);
  g.addColorStop(0, light);
  g.addColorStop(0.55, base);
  g.addColorStop(1, dark);
  x.beginPath();
  poly.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py));
  x.closePath();
  x.fillStyle = g;
  x.fill();
  // 果肉细节
  x.save();
  x.clip();
  if (detailFn) detailFn(x, b);
  // 底部阴影
  const g2 = x.createLinearGradient(0, b.y, 0, b.y + b.h);
  g2.addColorStop(0.62, 'rgba(0,0,0,0)');
  g2.addColorStop(1, 'rgba(60,20,10,0.28)');
  x.fillStyle = g2;
  x.fillRect(b.x - 20, b.y - 20, b.w + 40, b.h + 40);
  x.restore();
  // 高光
  x.save();
  x.beginPath();
  poly.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py));
  x.closePath(); x.clip();
  x.globalAlpha = 0.5;
  const hg = x.createRadialGradient(b.x + b.w * 0.32, b.y + b.h * 0.24, 4, b.x + b.w * 0.32, b.y + b.h * 0.24, b.w * 0.42);
  hg.addColorStop(0, 'rgba(255,255,255,0.85)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = hg;
  x.beginPath();
  x.ellipse(b.x + b.w * 0.32, b.y + b.h * 0.26, b.w * 0.3, b.h * 0.2, -0.5, 0, TAU);
  x.fill();
  x.restore();
  // 描边
  x.beginPath();
  poly.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py));
  x.closePath();
  x.strokeStyle = 'rgba(120,60,30,0.25)';
  x.lineWidth = 3;
  x.stroke();
  return c;
}

/* ---------- 果冻世界 ---------- */
class JellyWorld {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pieces = [];
    this.env = { gravity: 0, bounds: null };
    this.paused = false;
    this.onStats = null;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    this._t = performance.now();
    this._raf = 0;
    this.extraDraw = null; // (ctx) => 自定义叠加绘制（如橡皮筋、触手）
    this.ambient = true; // 待机微抖
    this._at = 0;
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, r.width * this.dpr);
    this.canvas.height = Math.max(1, r.height * this.dpr);
    this.W = r.width; this.H = r.height;
  }
  addPiece(p) { this.pieces.push(p); return p; }
  clear() { this.pieces = []; }
  start() {
    if (this._raf) return;
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      let dt = (t - this._t) / 1000;
      this._t = t;
      dt = clamp(dt, 0.001, 0.033);
      if (!this.paused) {
        this._at += dt;
        // 待机呼吸微抖
        if (this.ambient) {
          const s = Math.sin(this._at * 2.1) * 0.35;
          for (const p of this.pieces) {
            const [cx, cy] = p.centroid();
            p.poke(cx, cy - 10, s * 0.4, 0, 400);
          }
        }
        for (const p of this.pieces) p.update(dt, this.env);
      }
      this.draw();
      if (this.onStats) this.onStats(this.stats());
    };
    this._t = performance.now();
    this._raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this._raf); this._raf = 0; }
  stats() {
    let mass = 0, ke = 0, area = 0, rest = 0;
    for (const p of this.pieces) {
      mass += p.n; ke += p.kinetic(); area += p.area(); rest += p.restArea;
    }
    return { pieces: this.pieces.length, mass, ke, area, restArea: rest };
  }
  draw() {
    const { ctx, canvas } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    // 阴影
    for (const p of this.pieces) {
      const [cx, cy] = p.centroid();
      const r = Math.sqrt(p.area() / Math.PI);
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#7a4a2a';
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.72, r * 0.85, r * 0.2, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    for (const p of this.pieces) p.draw(ctx);
    if (this.extraDraw) this.extraDraw(ctx);
  }
}

// 导出给 app.js
window.JellyFX = { SoftBody, JellyWorld, paintJelly, shapeSlice, shapeEllipse, shapeRing, shapeStar, shapeHeart, shapeBear, ART, TAU, clamp, pointInPoly, splitPolygonByLine };
