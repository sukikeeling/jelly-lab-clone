// Position-based elastic lattice. Fixed time steps keep the material consistent
// across refresh rates; a fine render surface is embedded in this coarser cage.
export class JellyPhysics {
  readonly n = 5;
  readonly count = this.n ** 3;
  readonly position = new Float64Array(this.count * 3);
  readonly rest = new Float64Array(this.count * 3);
  readonly velocity = new Float64Array(this.count * 3);
  private previous = new Float64Array(this.count * 3);
  private edges: { a: number; b: number; rest: number; lambda: number }[] = [];
  private tetra: { ids: number[]; rest: number; lambda: number }[] = [];
  private gradients = new Float64Array(12);
  grab: { indices: number[]; weights: number[]; target: number[] } | null = null;
  firmness = 55;
  damping = 25;
  constructor() {
    for (let z = 0; z < this.n; z++) for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) {
      const i = this.index(x, y, z) * 3;
      this.rest[i] = x / (this.n - 1) * 2 - 1;
      this.rest[i + 1] = y / (this.n - 1) * 2 - 1;
      this.rest[i + 2] = z / (this.n - 1) * 2 - 1;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= this.n || ny >= this.n || nz >= this.n) continue;
        const j = this.index(nx, ny, nz) * 3;
        if (j > i) this.edges.push({ a: i, b: j, rest: Math.hypot(dx, dy, dz) * 2 / (this.n - 1), lambda: 0 });
      }
    }
    this.position.set(this.rest);
    const patterns = [[0, 1, 3, 7], [0, 3, 2, 7], [0, 2, 6, 7], [0, 6, 4, 7], [0, 4, 5, 7], [0, 5, 1, 7]];
    for (let z = 0; z < this.n - 1; z++) for (let y = 0; y < this.n - 1; y++) for (let x = 0; x < this.n - 1; x++) {
      const ids = [0,1,2,3,4,5,6,7].map(k => this.index(x + (k & 1), y + ((k >> 1) & 1), z + ((k >> 2) & 1)) * 3);
      for (const pattern of patterns) {
        const t = pattern.map(k => ids[k]);
        this.tetra.push({ ids: t, rest: this.volume(t), lambda: 0 });
      }
    }
    this.reset();
  }
  index(x: number, y: number, z: number) { return (z * this.n + y) * this.n + x; }
  reset() {
    const c = Math.cos(-0.2), s = Math.sin(-0.2);
    for (let i = 0; i < this.position.length; i += 3) {
      this.position[i] = this.rest[i] * c + this.rest[i + 2] * s;
      this.position[i + 1] = this.rest[i + 1] + 1.8;
      this.position[i + 2] = -this.rest[i] * s + this.rest[i + 2] * c;
    }
    this.velocity.fill(0);
    this.previous.set(this.position);
    this.grab = null;
  }
  embed(x: number, y: number, z: number) {
    const q = [x, y, z].map(v => Math.max(0, Math.min(this.n - 1 - 1e-7, (v + 1) * (this.n - 1) / 2)));
    const cell = q.map(Math.floor), f = q.map((v, i) => v - cell[i]);
    const indices: number[] = [], weights: number[] = [];
    for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      indices.push(this.index(cell[0] + dx, cell[1] + dy, cell[2] + dz) * 3);
      weights.push((dx ? f[0] : 1 - f[0]) * (dy ? f[1] : 1 - f[1]) * (dz ? f[2] : 1 - f[2]));
    }
    return { indices, weights };
  }
  nudge() {
    for (let i = 0; i < this.velocity.length; i += 3) {
      const height = (this.rest[i + 1] + 1) / 2;
      this.velocity[i] += 1.0 + height * 2.3;
      this.velocity[i + 1] += 3.8 + this.rest[i] * 1.0;
      this.velocity[i + 2] += -0.8 + this.rest[i] * 0.8;
    }
  }
  private volume(ids: number[]) {
    const p = this.position, [a,b,c,d] = ids;
    const bx=p[b]-p[a], by=p[b+1]-p[a+1], bz=p[b+2]-p[a+2];
    const cx=p[c]-p[a], cy=p[c+1]-p[a+1], cz=p[c+2]-p[a+2];
    const dx=p[d]-p[a], dy=p[d+1]-p[a+1], dz=p[d+2]-p[a+2];
    return (bx*(cy*dz-cz*dy)+by*(cz*dx-cx*dz)+bz*(cx*dy-cy*dx))/6;
  }
  step(h: number) {
    const p = this.position, v = this.velocity;
    this.previous.set(p);
    let centerX = 0, centerZ = 0;
    for (let i=0;i<p.length;i+=3) { centerX+=p[i]; centerZ+=p[i+2]; }
    centerX/=this.count; centerZ/=this.count;
    const air = Math.exp(-0.12 * h);
    for (let i = 0; i < p.length; i += 3) {
      // A shallow centering force keeps repeated throws within the play area.
      v[i] = (v[i] - centerX * 0.7 * h) * air;
      v[i+1] -= 9.81*h;
      v[i+2] = (v[i+2] - centerZ * 0.7 * h) * air;
      const speed=Math.hypot(v[i],v[i+1],v[i+2]);
      if(speed>22) { const factor=22/speed; v[i]*=factor; v[i+1]*=factor; v[i+2]*=factor; }
      for(let k=0;k<3;k++) p[i+k]+=v[i+k]*h;
    }
    for(const e of this.edges) e.lambda=0;
    for(const t of this.tetra) t.lambda=0;
    const alpha=(0.000015 + 0.0008 * (1-this.firmness/100)**2)/(h*h);
    const volumeAlpha=0.000000015/(h*h);
    for(let iteration=0;iteration<7;iteration++) {
      for(const e of this.edges) {
        const {a,b}=e;
        const x=p[a]-p[b],y=p[a+1]-p[b+1],z=p[a+2]-p[b+2];
        const length=Math.hypot(x,y,z);
        if(length<1e-9) continue;
        const dl=(-(length-e.rest)-alpha*e.lambda)/(2+alpha);
        e.lambda+=dl;
        const scale=dl/length;
        p[a]+=x*scale;p[a+1]+=y*scale;p[a+2]+=z*scale;
        p[b]-=x*scale;p[b+1]-=y*scale;p[b+2]-=z*scale;
      }
      for(const t of this.tetra) {
        const [a,b,c,d]=t.ids, g=this.gradients;
        const bx=p[b]-p[a],by=p[b+1]-p[a+1],bz=p[b+2]-p[a+2];
        const cx=p[c]-p[a],cy=p[c+1]-p[a+1],cz=p[c+2]-p[a+2];
        const dx=p[d]-p[a],dy=p[d+1]-p[a+1],dz=p[d+2]-p[a+2];
        g[3]=(cy*dz-cz*dy)/6;g[4]=(cz*dx-cx*dz)/6;g[5]=(cx*dy-cy*dx)/6;
        g[6]=(dy*bz-dz*by)/6;g[7]=(dz*bx-dx*bz)/6;g[8]=(dx*by-dy*bx)/6;
        g[9]=(by*cz-bz*cy)/6;g[10]=(bz*cx-bx*cz)/6;g[11]=(bx*cy-by*cx)/6;
        for(let k=0;k<3;k++) g[k]=-g[k+3]-g[k+6]-g[k+9];
        let denom=volumeAlpha;
        for(let k=0;k<12;k++) denom+=g[k]*g[k];
        const vol=bx*g[3]+by*g[4]+bz*g[5];
        const dl=(-(vol-t.rest)-volumeAlpha*t.lambda)/denom;
        t.lambda+=dl;
        for(let j=0;j<4;j++) for(let k=0;k<3;k++) p[t.ids[j]+k]+=Math.max(-0.1,Math.min(0.1,dl*g[j*3+k]));
      }
      if(this.grab) {
        const {indices,weights,target}=this.grab;
        let denom=0.003/(h*h);
        for(const w of weights) denom+=w*w*30;
        for(let k=0;k<3;k++) {
          let current=0;for(let j=0;j<indices.length;j++) current+=p[indices[j]+k]*weights[j];
          const dl=(target[k]-current)/denom;
          for(let j=0;j<indices.length;j++) p[indices[j]+k]+=Math.max(-0.12,Math.min(0.12,dl*weights[j]*30));
        }
      }
      for(let i=0;i<p.length;i+=3) {
        p[i+1]=Math.max(0.035,p[i+1]);
        p[i]=Math.max(-3.7,Math.min(3.7,p[i]));
        p[i+2]=Math.max(-3.7,Math.min(3.7,p[i+2]));
      }
    }
    let vx=0,vy=0,vz=0;
    for(let i=0;i<p.length;i+=3) {
      for(let k=0;k<3;k++) v[i+k]=(p[i+k]-this.previous[i+k])/h;
      if(p[i+1]<=0.036) {v[i]*=0.93;v[i+2]*=0.93;v[i+1]=Math.max(0,v[i+1]);}
      vx+=v[i];vy+=v[i+1];vz+=v[i+2];
    }
    vx/=this.count;vy/=this.count;vz/=this.count;
    const damping=Math.exp(-(0.3+this.damping/100*12)*h);
    for(let i=0;i<p.length;i+=3) {
      v[i]=vx+(v[i]-vx)*damping;v[i+1]=vy+(v[i+1]-vy)*damping;v[i+2]=vz+(v[i+2]-vz)*damping;
    }
  }
  metrics() {
    let energy=0, stretch=0;
    for(const v of this.velocity) energy+=v*v;
    for(const e of this.edges) {
      const p=this.position,a=e.a,b=e.b;
      stretch+=Math.abs(Math.hypot(p[a]-p[b],p[a+1]-p[b+1],p[a+2]-p[b+2])/e.rest-1);
    }
    return {energy:energy/this.count/2,stretch:stretch/this.edges.length*100};
  }
}
