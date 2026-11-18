import { World, Vec2, Polygon, type Body, type Fixture, type Contact } from 'planck';
import * as C from './config';
import {
  type Poly,
  clipAbove,
  clipBand,
  clipBelow,
  cleanPolygon,
  connectedGroups,
  largeEnough,
  polygonMass,
  shrinkPolygon,
  toLocal,
  toWorld,
  yRange,
  area,
} from './geometry';
import { PIECE_SHAPES } from './pieces';

/** 'cut' = game A (rows are sliced out by area), 'stack' = game B (no clearing, count pieces). */
export type FieldMode = 'cut' | 'stack';

export interface Controls {
  left: boolean;
  right: boolean;
  down: boolean;
  rotL: boolean;
  rotR: boolean;
}

export const NO_CONTROLS: Controls = { left: false, right: false, down: false, rotL: false, rotR: false };

export type FieldEvent = 'land' | 'clear' | 'clear4' | 'levelup' | 'topout' | 'fallout' | 'over';

export type FieldState = 'idle' | 'playing' | 'cutting' | 'toppedOut' | 'failing' | 'over';

export interface Piece {
  body: Body;
  /** Polygons in body-local physics pixels (unshrunk; used for drawing, area and cutting). */
  shapes: Poly[];
  kind: number;
}

export interface PieceView {
  x: number;
  y: number;
  angle: number;
  shapes: Poly[];
  kind: number;
}

type WallSide = 'left' | 'right' | 'ground' | 'ceiling';
interface FixtureTag {
  wall?: WallSide;
  piece?: Piece;
}

interface FieldOptions {
  mode: FieldMode;
  pickKind: () => number;
  emit?: (e: FieldEvent) => void;
}

const PX = C.PX_PER_M;
const v2 = (x: number, y: number) => Vec2(x / PX, y / PX);

export class Field {
  readonly mode: FieldMode;
  /** Inner edges of the side walls, in physics pixels. */
  readonly left: number;
  readonly right: number;

  state: FieldState = 'idle';
  pieces: Piece[] = [];
  active: Piece | null = null;
  nextKind: number;
  speed = C.BASE_SPEED;

  score = 0;
  level = 0;
  lines = 0;
  placed = 0;
  lastAdd = 0;
  addTimer = C.SCORE_POPUP_TIME;
  nextSpin = 0;

  /** Area held in each row, in px² (row is cut above CLEAR_THRESHOLD * BLOCK_AREA). */
  rowArea: number[] = new Array(C.ROWS).fill(0);
  removedRows: boolean[] = new Array(C.ROWS).fill(false);
  cutTimer = C.CLEAR_DURATION;
  /** What the field looked like right before the cut, drawn while the rows blink. */
  snapshot: PieceView[] = [];

  private world: World;
  private ground: Fixture | null = null;
  private landed = false;
  private densityTimer = 0;
  private levelUpPending = false;
  private failTime = 0;
  private pickKind: () => number;
  private emit: (e: FieldEvent) => void;

  constructor(opts: FieldOptions) {
    this.mode = opts.mode;
    this.pickKind = opts.pickKind;
    this.emit = opts.emit ?? (() => {});
    this.left = this.mode === 'cut' ? 56 : 64;
    this.right = 384;
    this.nextKind = this.pickKind();

    this.world = new World({ gravity: Vec2(0, C.GRAVITY / PX) });
    this.buildWalls();
    this.world.on('begin-contact', (c: Contact) => this.onContact(c));
  }

  get width(): number {
    return this.right - this.left;
  }

  private buildWalls() {
    const walls = this.world.createBody({ type: 'static' });
    const rect = (x1: number, y1: number, x2: number, y2: number): Poly => [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ];
    const defs: [WallSide, Poly][] = [
      ['left', rect(this.left - 32, -128, this.left, 608)],
      ['right', rect(this.right, -128, this.right + 32, 608)],
      ['ground', rect(56, 576, 384, 608)],
      ['ceiling', rect(24, -160, 416, -128)],
    ];
    for (const [side, poly] of defs) {
      const f = this.addFixture(walls, poly, { wall: side });
      if (side === 'left' || side === 'right') f.setFriction(C.WALL_FRICTION);
      if (side === 'ground') this.ground = f;
    }
  }

  private addFixture(body: Body, shape: Poly, tag: FixtureTag): Fixture {
    const shrunk = shrinkPolygon(shape, C.FIXTURE_SHRINK) ?? shape;
    return body.createFixture({
      shape: new Polygon(shrunk.map((p) => v2(p.x, p.y))),
      density: C.DENSITY,
      friction: C.FRICTION,
      restitution: C.RESTITUTION,
      userData: tag,
    });
  }

  private createPiece(kind: number, shapes: Poly[], x: number, y: number, angle: number): Piece {
    const body = this.world.createBody({
      type: 'dynamic',
      position: v2(x, y),
      angle,
      linearDamping: C.LINEAR_DAMPING,
      bullet: true,
    });
    const piece: Piece = { body, shapes, kind };
    for (const s of shapes) this.addFixture(body, s, { piece });
    this.setMass(piece);
    return piece;
  }

  /** Mass from the unshrunk shapes, never lighter than MIN_MASS (settetrimass). */
  private setMass(piece: Piece) {
    let mass = 0;
    let cx = 0;
    let cy = 0;
    let I = 0;
    for (const s of piece.shapes) {
      const m = polygonMass(
        s.map((p) => ({ x: p.x / PX, y: p.y / PX })),
        C.DENSITY,
      );
      mass += m.mass;
      cx += m.cx * m.mass;
      cy += m.cy * m.mass;
      I += m.I;
    }
    if (mass <= 0) return;
    cx /= mass;
    cy /= mass;
    if (mass < C.MIN_MASS) {
      I *= C.MIN_MASS / mass;
      mass = C.MIN_MASS;
    }
    piece.body.setMassData({ mass, center: Vec2(cx, cy), I });
  }

  start() {
    this.state = 'playing';
    this.computeRowAreas();
    this.spawn();
  }

  private spawn() {
    const kind = this.nextKind;
    this.nextKind = this.pickKind();
    const p = this.createPiece(kind, PIECE_SHAPES[kind], C.SPAWN_X, C.SPAWN_Y, 0);
    p.body.setLinearVelocity(Vec2(0, this.speed / PX));
    this.active = p;
  }

  private onContact(c: Contact) {
    if (this.state !== 'playing' || !this.active) return;
    const a = c.getFixtureA().getUserData() as FixtureTag | null;
    const b = c.getFixtureB().getUserData() as FixtureTag | null;
    const aIsActive = a?.piece === this.active;
    const bIsActive = b?.piece === this.active;
    if (!aIsActive && !bIsActive) return;
    const other = aIsActive ? b : a;
    // Sliding along the side walls doesn't count as landing.
    if (other?.wall === 'left' || other?.wall === 'right') return;
    this.landed = true;
  }

  update(dt: number, controls: Controls) {
    if (this.state === 'idle' || this.state === 'over') return;

    if (this.state === 'cutting') {
      this.cutTimer += dt;
      if (this.cutTimer >= C.CLEAR_DURATION) {
        this.cutTimer = C.CLEAR_DURATION;
        this.state = 'playing';
        this.addTimer = 0;
        this.computeRowAreas();
        if (this.levelUpPending) {
          this.levelUpPending = false;
          this.emit('levelup');
        }
      }
      return;
    }

    this.nextSpin = (this.nextSpin + C.NEXT_SPIN_SPEED * dt) % (Math.PI * 2);
    if (this.addTimer < C.SCORE_POPUP_TIME) this.addTimer = Math.min(C.SCORE_POPUP_TIME, this.addTimer + dt);

    if (this.state === 'playing' && this.active) this.applyControls(dt, controls);

    this.landed = false;
    this.world.step(dt, C.VELOCITY_ITERATIONS, C.POSITION_ITERATIONS);
    if (this.landed && this.state === 'playing' && this.active) this.endBlock();

    // endBlock() may have just switched to 'cutting' (TS can't see that through the call).
    if (this.mode === 'cut' && (this.state as FieldState) !== 'cutting') {
      this.densityTimer += dt;
      if (this.densityTimer >= C.DENSITY_INTERVAL) {
        this.densityTimer %= C.DENSITY_INTERVAL;
        this.computeRowAreas();
      }
    }

    if (this.state === 'failing') {
      this.failTime += dt;
      const allGone = this.pieces.every((p) => p.body.getPosition().y * PX >= C.FALLOUT_Y);
      if (allGone || this.failTime > 8) {
        this.state = 'over';
        this.emit('over');
      }
    }
  }

  private applyControls(dt: number, k: Controls) {
    const body = this.active!.body;
    const spin = body.getAngularVelocity();
    if (k.rotR && spin < C.MAX_SPIN) body.applyTorque(C.TORQUE, true);
    if (k.rotL && spin > -C.MAX_SPIN) body.applyTorque(-C.TORQUE, true);

    const centre = body.getWorldCenter();
    if (k.left) body.applyForce(Vec2(-C.SIDE_FORCE, 0), centre, true);
    if (k.right) body.applyForce(Vec2(C.SIDE_FORCE, 0), centre, true);

    const vel = body.getLinearVelocity();
    const vy = vel.y * PX;
    const maxDrop = this.mode === 'cut' ? C.MAX_DROP_SPEED : this.speed * 5;
    if (k.down) {
      if (vy > maxDrop) body.setLinearVelocity(Vec2(vel.x, maxDrop / PX));
      else body.applyForce(Vec2(0, C.DOWN_FORCE), centre, true);
    } else if (vy > this.speed) {
      body.setLinearVelocity(Vec2(vel.x, (vy - C.FALL_BRAKE * dt) / PX));
    }
  }

  private endBlock() {
    const piece = this.active!;
    this.active = null;
    this.pieces.push(piece);

    if (piece.body.getPosition().y * PX < C.LOSING_Y) {
      this.state = 'toppedOut';
      this.emit('topout');
      return;
    }

    this.placed++;
    if (this.mode === 'stack') {
      this.score = this.placed * 100;
      this.emit('land');
    } else {
      this.checkRows();
    }
    this.spawn();
  }

  /** Lets every piece drop out through the floor (the game-over animation). */
  startFallout() {
    if (this.state === 'failing' || this.state === 'over') return;
    if (this.active) {
      this.pieces.push(this.active);
      this.active = null;
    }
    this.state = 'failing';
    this.failTime = 0;
    if (this.ground) {
      this.ground.getBody().destroyFixture(this.ground);
      this.ground = null;
    }
    for (const p of this.pieces) p.body.setAwake(true);
    this.emit('fallout');
  }

  /** Row fill meter: area of all settled pieces inside each row. */
  computeRowAreas() {
    this.rowArea.fill(0);
    for (const p of this.pieces) {
      const pos = p.body.getPosition();
      const angle = p.body.getAngle();
      for (const s of p.shapes) {
        const w = toWorld(s, pos.x * PX, pos.y * PX, angle);
        const [lo, hi] = yRange(w);
        const r0 = Math.max(0, Math.floor(lo / C.BLOCK));
        const r1 = Math.min(C.ROWS - 1, Math.floor(hi / C.BLOCK));
        for (let r = r0; r <= r1; r++) {
          const part = clipBand(w, r * C.BLOCK, (r + 1) * C.BLOCK);
          if (part.length >= 3) this.rowArea[r] += area(part);
        }
      }
    }
  }

  rowFullness(r: number): number {
    return Math.min(1, this.rowArea[r] / (C.BLOCK_AREA * C.CLEAR_THRESHOLD));
  }

  private checkRows() {
    this.computeRowAreas();
    const rows: number[] = [];
    for (let r = 0; r < C.ROWS; r++) {
      if (this.rowArea[r] > C.BLOCK_AREA * C.CLEAR_THRESHOLD) rows.push(r);
    }
    if (rows.length === 0) {
      this.emit('land');
      return;
    }

    this.state = 'cutting';
    this.cutTimer = 0;
    this.snapshot = this.views();
    this.removedRows.fill(false);
    for (const r of rows) this.removedRows[r] = true;

    const n = rows.length;
    this.emit(n >= 4 ? 'clear4' : 'clear');

    // Scoring from the original: rewards both the number of rows and how densely they were packed.
    const avg = rows.reduce((s, r) => s + this.rowArea[r], 0) / n / (C.BLOCK_AREA * 10);
    const add = Math.ceil(Math.pow(n * 3, Math.pow(avg, 10)) * 20 + n * n * 40);
    this.score += add;
    this.lastAdd = add;
    this.addTimer = C.SCORE_POPUP_TIME;

    this.lines += n;
    if (Math.floor(this.lines / 10) > this.level) {
      this.level++;
      this.speed = C.BASE_SPEED + this.level * C.SPEED_PER_LEVEL;
      this.levelUpPending = true;
    }

    for (const r of rows) this.removeRow(r);
    // Pieces that rested on something that vanished must not stay asleep in mid-air.
    for (const p of this.pieces) p.body.setAwake(true);
  }

  /** Slices every settled piece along the row's top and bottom edge and drops what was inside. */
  private removeRow(row: number) {
    const top = row * C.BLOCK;
    const bottom = top + C.BLOCK;
    const kept: Piece[] = [];

    for (const p of this.pieces) {
      const pos = p.body.getPosition();
      const x = pos.x * PX;
      const y = pos.y * PX;
      const angle = p.body.getAngle();
      const world = p.shapes.map((s) => toWorld(s, x, y, angle));
      const touches = world.some((w) => {
        const [lo, hi] = yRange(w);
        return lo < bottom && hi > top;
      });
      if (!touches) {
        kept.push(p);
        continue;
      }

      const parts: Poly[] = [];
      for (const w of world) {
        for (const part of [clipAbove(w, top), clipBelow(w, bottom)]) {
          if (part.length < 3) continue;
          const clean = cleanPolygon(part);
          if (clean.length >= 3 && clean.length <= 8 && largeEnough(clean, C.MIN_SIDE_DIST)) parts.push(clean);
        }
      }

      this.world.destroyBody(p.body);
      if (parts.length === 0) continue;

      // Whatever is left may have fallen apart into separate chunks; each becomes its own body.
      for (const group of connectedGroups(parts, 2)) {
        const local = group.map((g) => toLocal(g, x, y, angle));
        kept.push(this.createPiece(p.kind, local, x, y, angle));
      }
    }
    this.pieces = kept;
  }

  views(): PieceView[] {
    const out: PieceView[] = [];
    const add = (p: Piece) => {
      const pos = p.body.getPosition();
      out.push({ x: pos.x * PX, y: pos.y * PX, angle: p.body.getAngle(), shapes: p.shapes, kind: p.kind });
    };
    for (const p of this.pieces) add(p);
    if (this.active) add(this.active);
    return out;
  }

  isCutting(): boolean {
    return this.state === 'cutting';
  }

  /** Blink phase for cut rows, as in the original (odd sections are lit). */
  rowsLit(): boolean {
    const section = Math.ceil(this.cutTimer / (C.CLEAR_DURATION / C.CLEAR_BLINKS));
    return section % 2 === 1 || this.cutTimer === 0;
  }
}
