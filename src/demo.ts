import * as C from './config';
import { type Controls, Field, NO_CONTROLS } from './field';
import { toWorld } from './geometry';
import { randomKind } from './pieces';

/**
 * Self-playing field behind the title screen. A tiny autopilot steers each piece
 * towards the lowest part of the stack, keeping it roughly axis-aligned.
 */
export class Demo {
  field = new Field({ pickKind: randomKind });
  private target: { x: number; angle: number } | null = null;
  private piece: unknown = null;

  constructor() {
    this.field.start();
  }

  update(dt: number) {
    const f = this.field;
    if (f.state === 'toppedOut') f.startFallout();
    if (f.state === 'over') {
      this.field = new Field({ pickKind: randomKind });
      this.field.start();
      return;
    }
    f.update(dt, this.steer());
  }

  private steer(): Controls {
    const f = this.field;
    const a = f.active;
    if (!a || f.state !== 'playing') return NO_CONTROLS;
    if (this.piece !== a) {
      this.piece = a;
      this.target = this.pickTarget();
    }
    const t = this.target!;
    const pos = a.body.getPosition();
    const vel = a.body.getLinearVelocity();
    const x = pos.x * C.PX_PER_M;
    const vx = vel.x * C.PX_PER_M;
    const u = (t.x - x) * 1.2 - vx * 0.9;

    let err = t.angle - a.body.getAngle();
    err = Math.atan2(Math.sin(err), Math.cos(err));
    const w = (err * 5 - a.body.getAngularVelocity()) * 1;

    const aligned = Math.abs(t.x - x) < 10 && Math.abs(err) < 0.08;
    return {
      left: u < -14,
      right: u > 14,
      rotR: w > 0.4,
      rotL: w < -0.4,
      down: aligned && pos.y * C.PX_PER_M > 40,
    };
  }

  private pickTarget(): { x: number; angle: number } {
    const f = this.field;
    const a = f.active!;
    const quarter = Math.round(Math.random() * 3) * (Math.PI / 2);
    // Width of the piece at that rotation.
    const pts = a.shapes.flatMap((s) => toWorld(s, 0, 0, quarter));
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));

    // Surface height: highest settled vertex inside each candidate span.
    const verts = f.pieces.flatMap((p) => {
      const pos = p.body.getPosition();
      return p.shapes.flatMap((s) => toWorld(s, pos.x * C.PX_PER_M, pos.y * C.PX_PER_M, p.body.getAngle()));
    });
    let best = { x: (f.left + f.right) / 2, score: -Infinity };
    for (let x = f.left - minX + 2; x <= f.right - maxX - 2; x += 8) {
      let top: number = C.FIELD_HEIGHT;
      for (const v of verts) if (v.x > x + minX && v.x < x + maxX && v.y < top) top = v.y;
      const score = top + Math.random() * 6;
      if (score > best.score) best = { x, score };
    }
    return { x: best.x, angle: quarter };
  }
}
