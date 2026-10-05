// XPBD (Extended Position-Based Dynamics) 3D Soft Body & Volume Preservation Engine
export class JellyPhysicsXPBD {
  constructor(options = {}) {
    this.n = options.gridSize || 5; // 5x5x5 = 125 nodes
    this.count = this.n ** 3;
    this.floorY = options.floorY ?? 0.038;
    this.initialDropHeight = options.initialDropHeight ?? 1.85;
    
    // Core lattice state
    this.position = new Float64Array(this.count * 3);
    this.rest = new Float64Array(this.count * 3);
    this.velocity = new Float64Array(this.count * 3);
    this.previous = new Float64Array(this.count * 3);
    
    // Constraints
    this.edges = [];
    this.tetra = [];
    this.gradients = new Float64Array(12);
    
    // Tentacles dynamic chains (for Jelly Squid)
    this.tentacles = []; // Array of chain objects
    
    // User interaction
    this.grab = null; // { indices, weights, target }
    
    // Material parameters
    this.firmness = options.firmness ?? 55; // 0 (soft) to 100 (firm)
    this.damping = options.damping ?? 24;   // 0 (resonant) to 100 (fast calm)
    this.jiggle = options.jiggle ?? 75;     // secondary high-frequency jiggle
    this.volumeStiffness = options.volumeStiffness ?? 1.0; // volume preservation multiplier
    
    this.initLattice();
    this.initTentacles();
    this.reset();
  }

  setFirmness(val) { this.firmness = Math.max(0, Math.min(100, val)); }
  setDamping(val) { this.damping = Math.max(0, Math.min(100, val)); }
  setJiggle(val) { this.jiggle = Math.max(0, Math.min(100, val)); }

  index(x, y, z) {
    return (z * this.n + y) * this.n + x;
  }

  initLattice() {
    this.edges = [];
    this.tetra = [];
    
    // 1. Generate rest grid in [-1, 1] range
    for (let z = 0; z < this.n; z++) {
      for (let y = 0; y < this.n; y++) {
        for (let x = 0; x < this.n; x++) {
          const i = this.index(x, y, z) * 3;
          this.rest[i]     = (x / (this.n - 1)) * 2 - 1;
          this.rest[i + 1] = (y / (this.n - 1)) * 2 - 1;
          this.rest[i + 2] = (z / (this.n - 1)) * 2 - 1;

          // Connect all 26 spatial neighbors
          for (let dz = -1; dz <= 1; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0 && dz === 0) continue;
                const nx = x + dx, ny = y + dy, nz = z + dz;
                if (nx < 0 || ny < 0 || nz < 0 || nx >= this.n || ny >= this.n || nz >= this.n) continue;
                const j = this.index(nx, ny, nz) * 3;
                if (j > i) {
                  const restDist = (Math.hypot(dx, dy, dz) * 2) / (this.n - 1);
                  this.edges.push({ a: i, b: j, rest: restDist, lambda: 0 });
                }
              }
            }
          }
        }
      }
    }

    this.position.set(this.rest);

    // 2. Tetrahedral decomposition (6 tetrahedra per cube cell for airtight volume preservation)
    const patterns = [
      [0, 1, 3, 7],
      [0, 3, 2, 7],
      [0, 2, 6, 7],
      [0, 6, 4, 7],
      [0, 4, 5, 7],
      [0, 5, 1, 7]
    ];

    for (let z = 0; z < this.n - 1; z++) {
      for (let y = 0; y < this.n - 1; y++) {
        for (let x = 0; x < this.n - 1; x++) {
          const ids = [0, 1, 2, 3, 4, 5, 6, 7].map(k => {
            const cx = x + (k & 1);
            const cy = y + ((k >> 1) & 1);
            const cz = z + ((k >> 2) & 1);
            return this.index(cx, cy, cz) * 3;
          });

          for (const pat of patterns) {
            const t = pat.map(k => ids[k]);
            const restVol = this.calcTetraVolume(t, this.rest);
            this.tetra.push({ ids: t, rest: restVol, lambda: 0 });
          }
        }
      }
    }
  }

  initTentacles() {
    // 8 tentacles: 6 short undulating arms + 2 long feeding tentacles with paddle clubs
    this.tentacles = [];
    const count = 8;

    // Tentacle angular layout (radians)
    // 0..5: 6 short arms radiating around the perimeter
    // 6..7: 2 long feeding tentacles extending forward/downwards
    const tentacleAngles = [
      -Math.PI * 0.78,
      -Math.PI * 0.52,
      -Math.PI * 0.22,
       Math.PI * 0.22,
       Math.PI * 0.52,
       Math.PI * 0.78,
      -Math.PI * 0.45, // Long Tentacle 1
       Math.PI * 0.45  // Long Tentacle 2
    ];

    for (let t = 0; t < count; t++) {
      const isLong = (t >= 6);
      const angle = tentacleAngles[t];
      const radius = isLong ? 0.42 : 0.62;
      const rootRestX = Math.cos(angle) * radius;
      const rootRestY = -0.76; // bottom of squid mantle lattice
      const rootRestZ = Math.sin(angle) * radius;

      const segCount = isLong ? 14 : 8;
      const segLength = isLong ? 0.16 : 0.14;

      const chain = {
        index: t,
        isLong,
        angle,
        rootEmbedding: this.embed(rootRestX, rootRestY, rootRestZ),
        particles: [], // [{ pos: [x,y,z], prev: [x,y,z], vel: [x,y,z] }]
        segLength
      };

      for (let s = 0; s < segCount; s++) {
        const py = rootRestY - s * segLength;
        const spread = isLong ? (s * 0.03) : (Math.sin(s * 0.5) * 0.08);
        const px = rootRestX + Math.cos(angle) * spread;
        const pz = rootRestZ + Math.sin(angle) * spread;
        chain.particles.push({
          pos: [px, py + 1.8, pz],
          prev: [px, py + 1.8, pz],
          vel: [0, 0, 0]
        });
      }
      this.tentacles.push(chain);
    }
  }

  calcTetraVolume(ids, array) {
    const [a, b, c, d] = ids;
    const bx = array[b] - array[a],     by = array[b+1] - array[a+1], bz = array[b+2] - array[a+2];
    const cx = array[c] - array[a],     cy = array[c+1] - array[a+1], cz = array[c+2] - array[a+2];
    const dx = array[d] - array[a],     dy = array[d+1] - array[a+1], dz = array[d+2] - array[a+2];
    return (bx * (cy * dz - cz * dy) + by * (cz * dx - cx * dz) + bz * (cx * dy - cy * dx)) / 6;
  }

  reset() {
    const c = Math.cos(-0.15), s = Math.sin(-0.15);
    for (let i = 0; i < this.position.length; i += 3) {
      this.position[i]     = this.rest[i] * c + this.rest[i + 2] * s;
      this.position[i + 1] = this.rest[i + 1] + this.initialDropHeight; // Drop initial height
      this.position[i + 2] = -this.rest[i] * s + this.rest[i + 2] * c;
    }
    this.velocity.fill(0);
    this.previous.set(this.position);
    this.grab = null;

    // Reset tentacles
    if (this.tentacles.length) {
      for (const chain of this.tentacles) {
        const rootPos = this.evaluateEmbedding(chain.rootEmbedding);
        for (let s = 0; s < chain.particles.length; s++) {
          const pt = chain.particles[s];
          const spread = chain.isLong ? (s * 0.03) : (Math.sin(s * 0.5) * 0.06);
          pt.pos[0] = rootPos[0] + Math.cos(chain.angle) * spread;
          pt.pos[1] = rootPos[1] - s * chain.segLength;
          pt.pos[2] = rootPos[2] + Math.sin(chain.angle) * spread;
          pt.prev[0] = pt.pos[0];
          pt.prev[1] = pt.pos[1];
          pt.prev[2] = pt.pos[2];
          pt.vel[0] = pt.vel[1] = pt.vel[2] = 0;
        }
      }
    }
  }

  embed(x, y, z) {
    // Clamps coordinates inside [-1, 1] lattice space
    const qx = Math.max(0, Math.min(this.n - 1 - 1e-7, ((x + 1) * 0.5) * (this.n - 1)));
    const qy = Math.max(0, Math.min(this.n - 1 - 1e-7, ((y + 1) * 0.5) * (this.n - 1)));
    const qz = Math.max(0, Math.min(this.n - 1 - 1e-7, ((z + 1) * 0.5) * (this.n - 1)));

    const cx = Math.floor(qx), cy = Math.floor(qy), cz = Math.floor(qz);
    const fx = qx - cx,        fy = qy - cy,        fz = qz - cz;

    const indices = [];
    const weights = [];

    for (let dz = 0; dz <= 1; dz++) {
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          indices.push(this.index(cx + dx, cy + dy, cz + dz) * 3);
          weights.push((dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz));
        }
      }
    }
    return { indices, weights };
  }

  evaluateEmbedding(embedding) {
    const { indices, weights } = embedding;
    let x = 0, y = 0, z = 0;
    const p = this.position;
    for (let j = 0; j < 8; j++) {
      const idx = indices[j], w = weights[j];
      x += p[idx] * w;
      y += p[idx + 1] * w;
      z += p[idx + 2] * w;
    }
    return [x, y, z];
  }

  nudge(dirX = 1.2, dirY = 3.6, dirZ = -0.7) {
    // Apply upward thrust with organic torque
    for (let i = 0; i < this.velocity.length; i += 3) {
      const h = (this.rest[i + 1] + 1) * 0.5;
      this.velocity[i]     += dirX + h * 2.1 + (Math.random() - 0.5) * 0.5;
      this.velocity[i + 1] += dirY + this.rest[i] * 0.9;
      this.velocity[i + 2] += dirZ + this.rest[i] * 0.7 + (Math.random() - 0.5) * 0.5;
    }
  }

  poke(hitPoint, impulse = 5.0) {
    // Poke a point inwards
    const embed = this.embed(hitPoint.x, hitPoint.y, hitPoint.z);
    for (let j = 0; j < 8; j++) {
      const idx = embed.indices[j];
      this.velocity[idx + 1] -= impulse * embed.weights[j];
    }
  }

  step(h) {
    const p = this.position;
    const v = this.velocity;
    this.previous.set(p);

    // Compute center of mass
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < p.length; i += 3) {
      cx += p[i]; cy += p[i + 1]; cz += p[i + 2];
    }
    cx /= this.count; cy /= this.count; cz /= this.count;

    // 极端异常熔断保护：数值 NaN 或极端远离中心，强制平滑重置至屏幕中央
    const distHorizCenter = Math.hypot(cx, cz);
    if (Number.isNaN(cx) || distHorizCenter > 3.6 || cy > 4.5 || cy < -0.5) {
      for (let i = 0; i < p.length; i += 3) {
        p[i] = this.rest[i] * 0.95;
        p[i + 1] = this.rest[i + 1] + 0.85;
        p[i + 2] = this.rest[i + 2] * 0.95;
        v[i] = 0; v[i + 1] = -0.3; v[i + 2] = 0;
      }
      cx = 0; cy = 0.85; cz = 0;
    }

    // 视锥安全向心力与丝滑吸回系统
    const airDrag = Math.exp(-0.20 * h);
    const pullHoriz = distHorizCenter > 0.65 ? Math.min(22.0, (distHorizCenter - 0.5) * 16.0) : 0;
    const nx = distHorizCenter > 1e-5 ? (cx / distHorizCenter) : 0;
    const nz = distHorizCenter > 1e-5 ? (cz / distHorizCenter) : 0;
    const pullTop = cy > 2.2 ? (cy - 1.2) * 14.0 : 0;

    for (let i = 0; i < p.length; i += 3) {
      // 丝滑弹性向心恢复力 + 重力
      v[i]     = (v[i] - nx * pullHoriz * h) * airDrag;
      v[i + 1] = (v[i + 1] - (9.81 + pullTop) * h) * airDrag;
      v[i + 2] = (v[i + 2] - nz * pullHoriz * h) * airDrag;

      // 严格速度硬截断（Speed Clamp）彻底杜绝数值飞车
      const spd = Math.hypot(v[i], v[i + 1], v[i + 2]);
      if (spd > 12.0) {
        const factor = 12.0 / spd;
        v[i] *= factor; v[i + 1] *= factor; v[i + 2] *= factor;
      }

      p[i]     += v[i] * h;
      p[i + 1] += v[i + 1] * h;
      p[i + 2] += v[i + 2] * h;
    }

    // Reset constraint multipliers (XPBD)
    for (let i = 0; i < this.edges.length; i++) this.edges[i].lambda = 0;
    for (let i = 0; i < this.tetra.length; i++) this.tetra[i].lambda = 0;

    // Compliance coefficients (inverse stiffness)
    // Firmness: 0 (jelly soft) to 100 (firm rubber)
    const normalizedFirmness = this.firmness / 100;
    const alphaEdge = (0.000012 + 0.00075 * ((1 - normalizedFirmness) ** 2)) / (h * h);
    const alphaVol  = (0.000000012 / this.volumeStiffness) / (h * h); // Ultra-stiff volume conservation

    const iterations = 8;
    for (let it = 0; it < iterations; it++) {
      // 1. Distance constraints (Stretch & Shear resistance)
      for (let e = 0; e < this.edges.length; e++) {
        const edge = this.edges[e];
        const a = edge.a, b = edge.b;
        const dx = p[a] - p[b];
        const dy = p[a + 1] - p[b + 1];
        const dz = p[a + 2] - p[b + 2];
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-9) continue;

        const C = len - edge.rest;
        const dl = (-C - alphaEdge * edge.lambda) / (2.0 + alphaEdge);
        edge.lambda += dl;

        const scale = dl / len;
        p[a]     += dx * scale;
        p[a + 1] += dy * scale;
        p[a + 2] += dz * scale;
        p[b]     -= dx * scale;
        p[b + 1] -= dy * scale;
        p[b + 2] -= dz * scale;
      }

      // 2. Tetrahedral Volume Preservation Constraints (气压与流体体积守恒)
      const g = this.gradients;
      for (let t = 0; t < this.tetra.length; t++) {
        const tet = this.tetra[t];
        const [a, b, c, d] = tet.ids;

        const bx = p[b] - p[a],     by = p[b + 1] - p[a + 1], bz = p[b + 2] - p[a + 2];
        const cx = p[c] - p[a],     cy = p[c + 1] - p[a + 1], cz = p[c + 2] - p[a + 2];
        const dx = p[d] - p[a],     dy = p[d + 1] - p[a + 1], dz = p[d + 2] - p[a + 2];

        // Gradient of volume w.r.t b, c, d
        g[3]  = (cy * dz - cz * dy) / 6;
        g[4]  = (cz * dx - cx * dz) / 6;
        g[5]  = (cx * dy - cy * dx) / 6;

        g[6]  = (dy * bz - dz * by) / 6;
        g[7]  = (dz * bx - dx * bz) / 6;
        g[8]  = (dx * by - dy * bx) / 6;

        g[9]  = (by * cz - bz * cy) / 6;
        g[10] = (bz * cx - bx * cz) / 6;
        g[11] = (bx * cy - by * cx) / 6;

        // Gradient w.r.t a (sum of negatives)
        g[0] = -g[3] - g[6] - g[9];
        g[1] = -g[4] - g[7] - g[10];
        g[2] = -g[5] - g[8] - g[11];

        let denom = alphaVol;
        for (let k = 0; k < 12; k++) denom += g[k] * g[k];

        const curVol = bx * g[3] + by * g[4] + bz * g[5];
        const Cvol = curVol - tet.rest;
        const dl = (-Cvol - alphaVol * tet.lambda) / denom;
        tet.lambda += dl;

        // Project displacement with clamping to prevent violent inversion
        for (let j = 0; j < 4; j++) {
          const ptIdx = tet.ids[j];
          for (let k = 0; k < 3; k++) {
            const disp = dl * g[j * 3 + k];
            p[ptIdx + k] += Math.max(-0.11, Math.min(0.11, disp));
          }
        }
      }

      // 3. User Grab Constraint (Mouse / Touch spring pull)
      if (this.grab) {
        const { indices, weights, target } = this.grab;
        let denom = 0.0028 / (h * h);
        for (const w of weights) denom += w * w * 32;

        for (let k = 0; k < 3; k++) {
          let currentVal = 0;
          for (let j = 0; j < indices.length; j++) {
            currentVal += p[indices[j] + k] * weights[j];
          }
          const dl = (target[k] - currentVal) / denom;
          for (let j = 0; j < indices.length; j++) {
            p[indices[j] + k] += Math.max(-0.14, Math.min(0.14, dl * weights[j] * 32));
          }
        }
      }

      // 4. Ground Collision & Camera Frustum Safety Bounding Clamping
      const B_MIN_X = -2.35, B_MAX_X = 2.35;
      const B_MIN_Z = -2.05, B_MAX_Z = 2.05;
      const B_MAX_Y = 3.35;
      for (let i = 0; i < p.length; i += 3) {
        p[i + 1] = Math.max(this.floorY, Math.min(B_MAX_Y, p[i + 1]));
        p[i]     = Math.max(B_MIN_X, Math.min(B_MAX_X, p[i]));
        p[i + 2] = Math.max(B_MIN_Z, Math.min(B_MAX_Z, p[i + 2]));
      }
    }

    // Velocity update, Boundary Bounce & Ground friction
    let totalVx = 0, totalVy = 0, totalVz = 0;
    const B_MIN_X = -2.35, B_MAX_X = 2.35;
    const B_MIN_Z = -2.05, B_MAX_Z = 2.05;
    const B_MAX_Y = 3.35;
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        v[i + k] = (p[i + k] - this.previous[i + k]) / h;
      }
      // 触碰边界时的丝滑弹性反弹与动能吸收 (Boundary Elastic Bounce)
      if (p[i] <= B_MIN_X + 0.002 && v[i] < 0) {
        v[i] = -v[i] * 0.42;
      } else if (p[i] >= B_MAX_X - 0.002 && v[i] > 0) {
        v[i] = -v[i] * 0.42;
      }
      if (p[i + 2] <= B_MIN_Z + 0.002 && v[i + 2] < 0) {
        v[i + 2] = -v[i + 2] * 0.42;
      } else if (p[i + 2] >= B_MAX_Z - 0.002 && v[i + 2] > 0) {
        v[i + 2] = -v[i + 2] * 0.42;
      }
      if (p[i + 1] >= B_MAX_Y - 0.002 && v[i + 1] > 0) {
        v[i + 1] = -v[i + 1] * 0.35;
      }
      // 地面摩擦与微弱 Q 弹吸附
      if (p[i + 1] <= this.floorY + 0.001) {
        v[i]     *= 0.90;
        v[i + 2] *= 0.90;
        v[i + 1] = Math.max(0, -v[i + 1] * 0.22);
      }
      totalVx += v[i];
      totalVy += v[i + 1];
      totalVz += v[i + 2];
    }

    // Rigid body velocity vs. internal relative vibration
    const vRigidX = totalVx / this.count;
    const vRigidY = totalVy / this.count;
    const vRigidZ = totalVz / this.count;

    // High-frequency jiggle & internal relative damping
    const dampingExp = Math.exp(-(0.25 + (this.damping / 100) * 11.5) * h);
    for (let i = 0; i < p.length; i += 3) {
      v[i]     = vRigidX + (v[i] - vRigidX) * dampingExp;
      v[i + 1] = vRigidY + (v[i + 1] - vRigidY) * dampingExp;
      v[i + 2] = vRigidZ + (v[i + 2] - vRigidZ) * dampingExp;
    }

    // Step Tentacles (Secondary flexible chains)
    this.stepTentacles(h);
  }

  stepTentacles(h) {
    if (!this.tentacles.length) return;
    const floorY = this.floorY - 0.018;

    for (const chain of this.tentacles) {
      // 1. Particle 0 is anchored to the animated squid base lattice
      const rootPos = this.evaluateEmbedding(chain.rootEmbedding);
      const rootPt = chain.particles[0];
      rootPt.pos[0] = rootPos[0];
      rootPt.pos[1] = rootPos[1];
      rootPt.pos[2] = rootPos[2];

      // 2. Integrate trailing particles
      for (let s = 1; s < chain.particles.length; s++) {
        const pt = chain.particles[s];
        pt.prev[0] = pt.pos[0];
        pt.prev[1] = pt.pos[1];
        pt.prev[2] = pt.pos[2];

        pt.vel[1] -= 9.81 * 0.7 * h; // slightly lighter gravity for soft underwater tentacles
        pt.vel[0] *= 0.98;
        pt.vel[2] *= 0.98;

        pt.pos[0] += pt.vel[0] * h;
        pt.pos[1] += pt.vel[1] * h;
        pt.pos[2] += pt.vel[2] * h;
      }

      // 3. Distance constraint iterations along tentacle chain
      for (let it = 0; it < 5; it++) {
        for (let s = 0; s < chain.particles.length - 1; s++) {
          const p1 = chain.particles[s];
          const p2 = chain.particles[s + 1];

          const dx = p2.pos[0] - p1.pos[0];
          const dy = p2.pos[1] - p1.pos[1];
          const dz = p2.pos[2] - p1.pos[2];
          const dist = Math.hypot(dx, dy, dz);
          if (dist < 1e-6) continue;

          const diff = (dist - chain.segLength) / dist;
          if (s === 0) {
            // Root is fixed, move only p2
            p2.pos[0] -= dx * diff;
            p2.pos[1] -= dy * diff;
            p2.pos[2] -= dz * diff;
          } else {
            p1.pos[0] += dx * diff * 0.5;
            p1.pos[1] += dy * diff * 0.5;
            p1.pos[2] += dz * diff * 0.5;
            p2.pos[0] -= dx * diff * 0.5;
            p2.pos[1] -= dy * diff * 0.5;
            p2.pos[2] -= dz * diff * 0.5;
          }
        }

        // Floor collision for tentacles
        for (let s = 1; s < chain.particles.length; s++) {
          const pt = chain.particles[s];
          if (pt.pos[1] < floorY) {
            pt.pos[1] = floorY;
          }
        }
      }

      // Update velocities
      for (let s = 1; s < chain.particles.length; s++) {
        const pt = chain.particles[s];
        pt.vel[0] = (pt.pos[0] - pt.prev[0]) / h;
        pt.vel[1] = (pt.pos[1] - pt.prev[1]) / h;
        pt.vel[2] = (pt.pos[2] - pt.prev[2]) / h;
      }
    }
  }

  metrics() {
    let energy = 0, stretch = 0;
    for (let i = 0; i < this.velocity.length; i++) {
      energy += this.velocity[i] * this.velocity[i];
    }
    for (let e = 0; e < this.edges.length; e++) {
      const edge = this.edges[e];
      const a = edge.a, b = edge.b;
      const curDist = Math.hypot(
        this.position[a] - this.position[b],
        this.position[a + 1] - this.position[b + 1],
        this.position[a + 2] - this.position[b + 2]
      );
      stretch += Math.abs(curDist / edge.rest - 1);
    }
    return {
      energy: energy / (this.count * 2),
      stretch: (stretch / this.edges.length) * 100
    };
  }
}
