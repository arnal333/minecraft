// ============================================================================
// entidades.js — Jugador, física, inventario, mano, raycasting
// ============================================================================
import * as THREE from 'three';
import {
  WY, SEA, keys,
  clamp, B, BD, I, ITEMS, SMELTING, FUEL_TIMES, itemName, stackMax, isLeaves,
  tileTex, itemTex
} from './nucleo.js';
import { camera } from './render.js';
import { activeDimension, END_BASE_Y } from './dimensiones.js';
import {
  getBlock, peekBlock, solidAt, getHeight,
  furnaceState, getFurnaceState
} from './mundo.js';

const $ = id => document.getElementById(id);

// ============================ HOOKS (los rellena main.js) ============================
export const hooks = {
  renderHearts: () => {},
  renderHunger: () => {},
  renderInventoryUI: () => {},
  renderFurnaceUI: () => {},
  renderHotbar: () => {},
  toast: () => {},
  spawnDrop: () => {}
};

// ============================ ESTADO DEL JUGADOR ============================
export const player = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  move: new THREE.Vector3(), knock: new THREE.Vector3(),
  w: 0.6, h: 1.8, onGround: false, hitWall: false, yaw: 0, pitch: 0,
  health: 20, maxHealth: 20, invuln: 0, lastDamage: 0, regenT: 0,
  fallStart: 0, dead: false, inWater: false,
  xp: 0, level: 0, kills: 0, cactusT: 0,
  hunger: 20, maxHunger: 20, exhaustion: 0, starveT: 0
};
export const EYE = 1.62;
export const inventory = new Array(36).fill(null);
export const spawnPoint = new THREE.Vector3();

let selSlot = 0;
export const getSelSlot = () => selSlot;
export const setSelSlot = i => { selSlot = i; };

let gameTime = 0;
export const getGameTime = () => gameTime;
export const tickGameTime = dt => { gameTime += dt; };

// ============================ FÍSICA ============================
export function boxHits(px, py, pz, hw, h) {
  const x0 = Math.floor(px - hw), x1 = Math.floor(px + hw);
  const y0 = Math.floor(py), y1 = Math.floor(py + h);
  const z0 = Math.floor(pz - hw), z1 = Math.floor(pz + hw);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++)
        if (solidAt(x, y, z)) return true;
  return false;
}
export function moveEntity(e, dt) {
  const hw = e.w / 2;
  const maxV = Math.max(Math.abs(e.vel.x), Math.abs(e.vel.y), Math.abs(e.vel.z));
  const steps = Math.max(1, Math.ceil(maxV * dt / 0.3));
  const sdt = dt / steps;
  e.onGround = false; e.hitWall = false;
  for (let s = 0; s < steps; s++) {
    const dy = e.vel.y * sdt;
    if (dy !== 0) {
      e.pos.y += dy;
      if (boxHits(e.pos.x, e.pos.y, e.pos.z, hw, e.h)) {
        if (dy < 0) { e.pos.y = Math.floor(e.pos.y) + 1; e.onGround = true; }
        else e.pos.y = Math.floor(e.pos.y + e.h) - e.h - 0.001;
        e.vel.y = 0;
      }
    }
    const dx = e.vel.x * sdt;
    if (dx !== 0) {
      e.pos.x += dx;
      if (boxHits(e.pos.x, e.pos.y, e.pos.z, hw, e.h)) {
        if (dx > 0) e.pos.x = Math.floor(e.pos.x + hw) - hw - 0.001;
        else e.pos.x = Math.floor(e.pos.x - hw) + 1 + hw + 0.001;
        e.vel.x = 0; e.hitWall = true;
      }
    }
    const dz = e.vel.z * sdt;
    if (dz !== 0) {
      e.pos.z += dz;
      if (boxHits(e.pos.x, e.pos.y, e.pos.z, hw, e.h)) {
        if (dz > 0) e.pos.z = Math.floor(e.pos.z + hw) - hw - 0.001;
        else e.pos.z = Math.floor(e.pos.z - hw) + 1 + hw + 0.001;
        e.vel.z = 0; e.hitWall = true;
      }
    }
  }
}
export function touchingBlock(e, id) {
  const hw = e.w / 2 + 0.05;
  for (let y = Math.floor(e.pos.y); y <= Math.floor(e.pos.y + e.h); y++)
    for (let z = Math.floor(e.pos.z - hw); z <= Math.floor(e.pos.z + hw); z++)
      for (let x = Math.floor(e.pos.x - hw); x <= Math.floor(e.pos.x + hw); x++)
        if (getBlock(x, y, z) === id) return true;
  return false;
}
export function findSpawn() {
  for (let r = 0; r < 64; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = dx, z = dz, h = getHeight(x,z), top = getBlock(x,h,z);
        if (h > SEA && !isLeaves(top) && top !== B.CACTUS
          && getBlock(x, h + 1, z) === 0 && getBlock(x, h + 2, z) === 0)
          return new THREE.Vector3(x + 0.5, h + 1, z + 0.5);
      }
  return new THREE.Vector3(0.5, WY - 5, 0.5);
}

// ============================ DAÑO Y MUERTE ============================
export function hurtPlayer(amount, src) {
  const p = player;
  if (p.dead || p.invuln > 0 || amount <= 0) return;
  p.health = Math.max(0, p.health - amount);
  p.invuln = 0.5;
  p.lastDamage = gameTime;
  p.regenT = 0;
  const v = $('vignette');
  if (v) {
    v.style.transition = 'none';
    v.style.opacity = 1;
    requestAnimationFrame(() => { v.style.transition = 'opacity .5s'; v.style.opacity = 0; });
  }
  if (src) {
    const dx = p.pos.x - src.x, dz = p.pos.z - src.z;
    const l = Math.hypot(dx, dz) || 1;
    p.knock.set(dx / l * 7, 0, dz / l * 7);
    p.vel.y = Math.max(p.vel.y, 5.5);
  }
  hooks.renderHearts();
  if (p.health <= 0) die();
}
export function die() {
  player.dead = true;
  const stats = $('goStats');
  if (stats) stats.textContent = `Nivel ${player.level} · ${player.kills} enemigos derrotados`;
  const go = $('gameover');
  if (go) go.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
export function respawn() {
  if(activeDimension==='end')player.pos.set(.5,END_BASE_Y+1,21.5);
  else{spawnPoint.copy(findSpawn());player.pos.copy(spawnPoint);}
  player.vel.set(0, 0, 0); player.move.set(0, 0, 0); player.knock.set(0, 0, 0);
  player.health = player.maxHealth;
  player.hunger = player.maxHunger;
  player.exhaustion = 0;
  player.starveT = 0;
  player.dead = false;
  player.invuln = 2;
  player.fallStart = player.pos.y;
  hooks.renderHearts();
  hooks.renderHunger();
}

// ============================ INVENTARIO ============================
export function addItem(id, count) {
  const max = stackMax(id);
  for (let i = 0; i < 36 && count > 0; i++) {
    const s = inventory[i];
    if (s && s.id === id && s.count < max) {
      const a = Math.min(count, max - s.count);
      s.count += a; count -= a;
    }
  }
  for (let i = 0; i < 36 && count > 0; i++) {
    if (!inventory[i]) {
      const a = Math.min(count, max);
      inventory[i] = { id, count: a };
      count -= a;
    }
  }
  hooks.renderInventoryUI();
  return count;
}
export function countItem(id) {
  let n = 0;
  for (const s of inventory) if (s && s.id === id) n += s.count;
  return n;
}
export function removeItem(id, n) {
  for (let i = 35; i >= 0 && n > 0; i--) {
    const s = inventory[i];
    if (s && s.id === id) {
      const a = Math.min(n, s.count);
      s.count -= a; n -= a;
      if (s.count <= 0) inventory[i] = null;
    }
  }
  hooks.renderInventoryUI();
  hooks.renderHotbar();
}
export const RECIPES = [
  { in: [[B.LOG, 1]], out: [B.PLANKS, 4] },
  { in: [[B.PLANKS, 2]], out: [I.STICK, 4] },
  { in: [[B.PLANKS, 2], [I.STICK, 1]], out: [I.WSWORD, 1] },
  { in: [[B.STONE, 3], [I.STICK, 2]], out: [I.SSWORD, 1] },
  { in: [[B.PLANKS, 4]], out: [B.CRAFTING_TABLE, 1] },
  { in: [[B.PLANKS, 8]], out: [B.CHEST, 1] },
  { in: [[B.STONE, 8]], out: [B.FURNACE, 1] }
];
export const TABLE_RECIPES = [
  { in: [[B.PLANKS, 3], [I.STICK, 2]], out: [I.WPICK, 1] },
  { in: [[B.PLANKS, 3], [I.STICK, 2]], out: [I.WAXE, 1] },
  { in: [[B.PLANKS, 1], [I.STICK, 2]], out: [I.WSHOVEL, 1] },
  { in: [[B.STONE, 3], [I.STICK, 2]], out: [I.SPICK, 1] },
  { in: [[B.STONE, 3], [I.STICK, 2]], out: [I.SAXE, 1] },
  { in: [[B.STONE, 1], [I.STICK, 2]], out: [I.SSHOVEL, 1] },
  { in: [[I.IRON_INGOT, 2], [I.STICK, 1]], out: [I.ISWORD, 1] },
  { in: [[I.IRON_INGOT, 3], [I.STICK, 2]], out: [I.IPICK, 1] },
  { in: [[I.BURNT_ROCK, 2]], out: [B.PORTAL_FRAME, 1] },
  { in: [[I.COAL, 1], [I.STICK, 1]], out: [I.TORCH, 4] },
  { in: [[I.STICK, 3], [I.WOOL, 3]], out: [I.BOW, 1] },
  { in: [[B.STONE, 1], [I.STICK, 1], [I.FEATHER, 1]], out: [I.ARROW, 4] }
];
export function canCraft(r) {
  return r.in.every(([id, n]) => countItem(id) >= n);
}
export function craft(i) {
  const r = RECIPES[i];
  craftRecipe(r);
}
export function craftTable(i) {
  craftRecipe(TABLE_RECIPES[i]);
}
function craftRecipe(r) {
  if (!canCraft(r)) return;
  r.in.forEach(([id, n]) => removeItem(id, n));
  const left = addItem(r.out[0], r.out[1]);
  if (left > 0) hooks.spawnDrop('item', r.out[0], left, player.pos.clone().add(new THREE.Vector3(0, 1, 0)));
  hooks.toast('Crafteado: ' + itemName(r.out[0]));
}

export function moveInventoryToFurnace(pos, index, slot) {
  const stack = inventory[index];
  if (!stack) return false;
  const isInput = slot === 'input';
  const allowed = isInput
    ? SMELTING.some(r => r.in === stack.id)
    : FUEL_TIMES[stack.id] !== undefined;
  if (!allowed) return false;
  const state = getFurnaceState(pos.x, pos.y, pos.z);
  const target = state[slot];
  if (target && target.id !== stack.id) return false;
  const amount = Math.min(stack.count, stackMax(stack.id) - (target ? target.count : 0));
  if (amount <= 0) return false;
  if (target) target.count += amount;
  else state[slot] = { id: stack.id, count: amount };
  stack.count -= amount;
  if (!stack.count) inventory[index] = null;
  hooks.renderInventoryUI();
  hooks.renderFurnaceUI(pos, state);
  return true;
}

export function takeFurnaceSlot(pos, slot) {
  const state = getFurnaceState(pos.x, pos.y, pos.z);
  const stack = state[slot];
  if (!stack) return false;
  const left = addItem(stack.id, stack.count);
  if (left === stack.count) return false;
  if (left) stack.count = left;
  else state[slot] = null;
  if (slot === 'input') state.progress = 0;
  hooks.renderFurnaceUI(pos, state);
  return true;
}

export function tickFurnaces(dt) {
  for (const [key, state] of furnaceState) {
    const pos = key.split(',').map(Number);
    if (peekBlock(pos[0], pos[1], pos[2]) !== B.FURNACE) continue;
    let changed = false, remaining = dt;
    const recipe = state.input && SMELTING.find(r => r.in === state.input.id);
    const canOutput = recipe && (!state.output || state.output.id === recipe.out)
      && (!state.output || state.output.count < stackMax(recipe.out));
    while (remaining > 0 && canOutput) {
      if (state.fuelLeft <= 0) {
        const burn = state.fuel && FUEL_TIMES[state.fuel.id];
        if (!burn) break;
        state.fuel.count--;
        if (!state.fuel.count) state.fuel = null;
        state.fuelLeft = state.fuelMax = burn;
        changed = true;
      }
      const step = Math.min(remaining, state.fuelLeft, recipe.time - state.progress);
      state.fuelLeft -= step;
      state.progress += step;
      remaining -= step;
      changed = true;
      if (state.progress >= recipe.time - 1e-6) {
        state.input.count--;
        if (!state.input.count) state.input = null;
        if (state.output) state.output.count++;
        else state.output = { id: recipe.out, count: 1 };
        state.progress = 0;
        changed = true;
        break;
      }
    }
    if (changed) hooks.renderFurnaceUI({ x: pos[0], y: pos[1], z: pos[2] }, state);
  }
}

// ============================ MANO EN PRIMERA PERSONA ============================
export const hand = new THREE.Group();
camera.add(hand);
const HAND_BASE = new THREE.Vector3(0.42, -0.4, -0.62);
hand.position.copy(HAND_BASE);
let swingT = 1, bobT = 0;
export const triggerSwing = () => { swingT = 0; };
const handMatCache = {};
function handMat(opts) {
  const m = new THREE.MeshLambertMaterial(opts);
  m.depthTest = false;
  m.depthWrite = false;
  return m;
}
export function refreshHand() {
  while (hand.children.length) hand.remove(hand.children[0]);
  const s = inventory[selSlot];
  let mesh;
  if (!s) {
    if (!handMatCache.arm) handMatCache.arm = handMat({ color: 0xd9a066 });
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.55), handMatCache.arm);
    mesh.position.set(0.05, -0.05, 0.05);
    mesh.rotation.set(0.2, -0.2, 0);
  } else if (s.id < 100) {
    const key = 'b' + s.id;
    if (!handMatCache[key]) {
      const t = BD[s.id].t;
      handMatCache[key] = [t[1], t[1], t[0], t[2], t[1], t[1]]
        .map(ti => handMat({ map: tileTex[ti], alphaTest: 0.5 }));
    }
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), handMatCache[key]);
    mesh.rotation.set(0.15, 0.7, 0);
  } else {
    const key = 'i' + s.id;
    if (!handMatCache[key]) handMatCache[key] = handMat({ map: itemTex[s.id], alphaTest: 0.5, side: THREE.DoubleSide });
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), handMatCache[key]);
    mesh.rotation.set(0, -1.2, 0.3);
    mesh.position.set(0, 0.1, 0);
  }
  mesh.renderOrder = 999;
  hand.add(mesh);
}
export function updateHand(dt) {
  swingT = Math.min(1, swingT + dt * 4.5);
  const moving = Math.hypot(player.move.x, player.move.z) > 0.5 && player.onGround;
  if (moving) bobT += dt * 9;
  const sw = Math.sin(swingT * Math.PI);
  hand.position.set(
    HAND_BASE.x - sw * 0.12 + Math.sin(bobT) * 0.015,
    HAND_BASE.y + sw * 0.08 + Math.abs(Math.cos(bobT)) * 0.02,
    HAND_BASE.z - sw * 0.1
  );
  hand.rotation.set(-sw * 0.9, sw * 0.3, 0);
}

// ============================ RAYCASTING ============================
export function raycastVoxel(o, d, maxDist) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = d.x !== 0 ? Math.abs(1 / d.x) : Infinity;
  const tdy = d.y !== 0 ? Math.abs(1 / d.y) : Infinity;
  const tdz = d.z !== 0 ? Math.abs(1 / d.z) : Infinity;
  let tmx = d.x > 0 ? (x + 1 - o.x) * tdx : d.x < 0 ? (o.x - x) * tdx : Infinity;
  let tmy = d.y > 0 ? (y + 1 - o.y) * tdy : d.y < 0 ? (o.y - y) * tdy : Infinity;
  let tmz = d.z > 0 ? (z + 1 - o.z) * tdz : d.z < 0 ? (o.z - z) * tdz : Infinity;
  let t = 0, nx = 0, ny = 0, nz = 0;
  while (t <= maxDist) {
    const b = getBlock(x, y, z);
    if (b !== 0 && b !== B.WATER) return { x, y, z, b, nx, ny, nz, dist: t };
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}
export function rayAABB(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  for (const a of ['x', 'y', 'z']) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
      continue;
    }
    let t1 = (min[a] - o[a]) / d[a];
    let t2 = (max[a] - o[a]) / d[a];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmax < 0 ? null : Math.max(0, tmin);
}
const _dir = new THREE.Vector3();
export function viewDir() { return camera.getWorldDirection(_dir); }

// ============================ UPDATE DEL JUGADOR ============================
export function updatePlayer(dt) {
  const p = player;
  p.invuln -= dt;
  const feet = getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.4), Math.floor(p.pos.z));
  p.inWater = feet === B.WATER;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  let wx = 0, wz = 0;
  if (keys.KeyW) { wx += fx; wz += fz; }
  if (keys.KeyS) { wx -= fx; wz -= fz; }
  if (keys.KeyD) { wx += rx; wz += rz; }
  if (keys.KeyA) { wx -= rx; wz -= rz; }
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }
  const speed = p.inWater ? 2.3 : (keys.ShiftLeft || keys.ShiftRight) ? 5.8 : 4.3;
  const acc = Math.min(1, (p.onGround ? 14 : p.inWater ? 6 : 5) * dt);
  p.move.x += (wx * speed - p.move.x) * acc;
  p.move.z += (wz * speed - p.move.z) * acc;
  p.knock.multiplyScalar(Math.exp(-5 * dt));
  if (p.inWater) {
    p.vel.y = Math.max(p.vel.y - 10 * dt, -3);
    if (keys.Space) p.vel.y = Math.min(p.vel.y + 30 * dt, 3.8);
    p.fallStart = p.pos.y;
  } else {
    p.vel.y = Math.max(p.vel.y - 28 * dt, -55);
    if (keys.Space && p.onGround) { p.vel.y = 8.6; p.exhaustion += 0.2; }
  }
  p.vel.x = p.move.x + p.knock.x;
  p.vel.z = p.move.z + p.knock.z;
  const wasGround = p.onGround;
  moveEntity(p, dt);
  if (p.hitWall) p.knock.set(0, 0, 0);
  if (!p.onGround) {
    p.fallStart = Math.max(p.fallStart, p.pos.y);
  } else {
    if (!wasGround) {
      const fall = p.fallStart - p.pos.y;
      if (fall > 3.5 && !p.inWater) hurtPlayer(Math.floor(fall - 3), null);
    }
    p.fallStart = p.pos.y;
  }
  p.cactusT -= dt;
  if (p.cactusT <= 0 && touchingBlock(p, B.CACTUS)) {
    hurtPlayer(1, null);
    p.cactusT = 0.6;
  }
    // Sprint consume hambre
  if ((keys.ShiftLeft || keys.ShiftRight) && wl > 0 && !p.inWater && p.onGround) {
    p.exhaustion += 0.1 * dt;
  }
  // Regeneración: solo si hambre >= 18
  if (p.health < p.maxHealth && p.hunger >= 18 && gameTime - p.lastDamage > 5) {
    p.regenT += dt;
    if (p.regenT > 2.5) {
      p.regenT = 0;
      p.health++;
      p.exhaustion += 6;
      hooks.renderHearts();
    }
  }
  // Aplicar agotamiento: cada 4 puntos = 1 de hambre
  while (p.exhaustion >= 4 && p.hunger > 0) {
    p.exhaustion -= 4;
    p.hunger--;
    hooks.renderHunger();
  }
  if (p.exhaustion > 20) p.exhaustion = 20;
  // Daño por inanición (hambre = 0)
  if (p.hunger === 0) {
    p.starveT += dt;
    if (p.starveT > 4) {
      p.starveT = 0;
      hurtPlayer(1, null);
    }
  } else {
    p.starveT = 0;
  }

  camera.position.set(p.pos.x, p.pos.y + EYE, p.pos.z);
  camera.rotation.y = p.yaw;
  camera.rotation.x = p.pitch;
  camera.rotation.z = p.invuln > 0.25 ? Math.sin(gameTime * 60) * 0.03 : 0;
  const headB = getBlock(
    Math.floor(camera.position.x),
    Math.floor(camera.position.y),
    Math.floor(camera.position.z)
  );
  const uw = $('underwater');
  if (uw) uw.style.opacity = headB === B.WATER ? 1 : 0;
}

// ============================ COMER ============================
export function eatFood(foodValue) {
  const p = player;
  if (p.hunger >= p.maxHunger && p.health >= p.maxHealth) return false;
  p.hunger = Math.min(p.maxHunger, p.hunger + foodValue);
  p.starveT = 0;
  hooks.renderHunger();
  return true;
}
