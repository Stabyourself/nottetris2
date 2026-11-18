export interface Pt {
  x: number;
  y: number;
}
export type Poly = Pt[];

/** Shoelace signed area. Positive = counter-clockwise in math orientation (what Box2D expects). */
export function signedArea(p: Poly): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i];
    const r = p[(i + 1) % p.length];
    a += q.x * r.y - r.x * q.y;
  }
  return a / 2;
}

export function area(p: Poly): number {
  return Math.abs(signedArea(p));
}

export function ensurePositive(p: Poly): Poly {
  return signedArea(p) < 0 ? p.slice().reverse() : p;
}

export function centroid(p: Poly): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i];
    const r = p[(i + 1) % p.length];
    const cross = q.x * r.y - r.x * q.y;
    a += cross;
    cx += (q.x + r.x) * cross;
    cy += (q.y + r.y) * cross;
  }
  if (Math.abs(a) < 1e-12) {
    let sx = 0;
    let sy = 0;
    for (const q of p) {
      sx += q.x;
      sy += q.y;
    }
    return { x: sx / p.length, y: sy / p.length };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Sutherland–Hodgman clip against one half-plane: keeps points with nx*x + ny*y <= d. */
export function clipHalfPlane(p: Poly, nx: number, ny: number, d: number): Poly {
  const out: Poly = [];
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const da = nx * a.x + ny * a.y - d;
    const db = nx * b.x + ny * b.y - d;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** Part of the polygon with y <= limit (above the line on screen). */
export function clipAbove(p: Poly, limit: number): Poly {
  return clipHalfPlane(p, 0, 1, limit);
}

/** Part of the polygon with y >= limit (below the line on screen). */
export function clipBelow(p: Poly, limit: number): Poly {
  return clipHalfPlane(p, 0, -1, -limit);
}

export function clipBand(p: Poly, top: number, bottom: number): Poly {
  const a = clipAbove(p, bottom);
  return a.length < 3 ? a : clipBelow(a, top);
}

/** Drops duplicate and (nearly) collinear vertices. */
export function cleanPolygon(p: Poly, eps = 0.02): Poly {
  let pts = p.slice();
  let changed = true;
  while (changed && pts.length >= 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const len = Math.hypot(dx, dy);
      const dup = Math.abs(b.x - a.x) + Math.abs(b.y - a.y) < eps;
      const dist = len > 1e-9 ? Math.abs(dx * (b.y - a.y) - dy * (b.x - a.x)) / len : 0;
      if (dup || dist < eps) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

/** Moves every side of a convex polygon inwards by `amount`. Returns null if nothing is left. */
export function shrinkPolygon(points: Poly, amount: number): Poly | null {
  const src = ensurePositive(points);
  let poly = src;
  const n = src.length;
  for (let i = 0; i < n; i++) {
    const a = src[i];
    const b = src[(i + 1) % n];
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const len = Math.hypot(sx, sy);
    if (len === 0) continue;
    const nx = sy / len;
    const ny = -sx / len;
    poly = clipHalfPlane(poly, nx, ny, nx * a.x + ny * a.y - amount);
    if (poly.length < 3) return null;
  }
  return poly;
}

/** Box2D chokes on slivers: every side must be at least `minDist` from the centroid. */
export function largeEnough(points: Poly, minDist: number): boolean {
  if (points.length < 3) return false;
  const p = ensurePositive(points);
  if (area(p) < 1e-6) return false;
  const c = centroid(p);
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) return false;
    const nx = (b.y - a.y) / len;
    const ny = -(b.x - a.x) / len;
    if ((a.x - c.x) * nx + (a.y - c.y) * ny < minDist) return false;
  }
  return true;
}

export function toWorld(p: Poly, x: number, y: number, angle: number): Poly {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return p.map((q) => ({ x: x + c * q.x - s * q.y, y: y + s * q.x + c * q.y }));
}

export function toLocal(p: Poly, x: number, y: number, angle: number): Poly {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return p.map((q) => {
    const dx = q.x - x;
    const dy = q.y - y;
    return { x: c * dx + s * dy, y: -s * dx + c * dy };
  });
}

export function yRange(p: Poly): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const q of p) {
    if (q.y < lo) lo = q.y;
    if (q.y > hi) hi = q.y;
  }
  return [lo, hi];
}

/** Mass properties of a convex polygon, same maths as b2PolygonShape::ComputeMass. I is about the origin. */
export function polygonMass(points: Poly, density: number): { mass: number; cx: number; cy: number; I: number } {
  const v = ensurePositive(points);
  const s = v[0];
  let areaSum = 0;
  let cx = 0;
  let cy = 0;
  let I = 0;
  const inv3 = 1 / 3;
  for (let i = 0; i < v.length; i++) {
    const e1x = v[i].x - s.x;
    const e1y = v[i].y - s.y;
    const n = v[(i + 1) % v.length];
    const e2x = n.x - s.x;
    const e2y = n.y - s.y;
    const D = e1x * e2y - e1y * e2x;
    const tri = 0.5 * D;
    areaSum += tri;
    cx += tri * inv3 * (e1x + e2x);
    cy += tri * inv3 * (e1y + e2y);
    const intx2 = e1x * e1x + e2x * e1x + e2x * e2x;
    const inty2 = e1y * e1y + e2y * e1y + e2y * e2y;
    I += 0.25 * inv3 * D * (intx2 + inty2);
  }
  const mass = density * areaSum;
  cx /= areaSum;
  cy /= areaSum;
  const wx = cx + s.x;
  const wy = cy + s.y;
  I = density * I + mass * (wx * wx + wy * wy - (cx * cx + cy * cy));
  return { mass, cx: wx, cy: wy, I };
}

/** Groups polygons that touch (any two vertices closer than `tolerance`). */
export function connectedGroups(polys: Poly[], tolerance: number): Poly[][] {
  const parent = polys.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      if (find(i) === find(j)) continue;
      outer: for (const a of polys[i]) {
        for (const b of polys[j]) {
          if (Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance) {
            parent[find(i)] = find(j);
            break outer;
          }
        }
      }
    }
  }
  const groups = new Map<number, Poly[]>();
  polys.forEach((p, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(p);
    else groups.set(r, [p]);
  });
  return [...groups.values()];
}
