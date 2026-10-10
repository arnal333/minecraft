// ============================================================================
// nucleo.js — Config, RNG, matemáticas, bloques, texturas procedurales, input
// ============================================================================
import * as THREE from 'three';

// ============================ CONFIG ============================
export const CH = 16, WY = 64, SEA = 20;
export const CHUNK_RADIUS_LOAD = 6, CHUNK_RADIUS_MESH = 4, CHUNK_RADIUS_UNLOAD = 8;
export const DAY_LEN = 480;
export const MAX_ENTITIES = 16, MAX_ANIMALS = 10, MAX_MOBS = MAX_ENTITIES;
export let SEED = (Math.random() * 2147483647) | 0;

// ============================ INPUT COMPARTIDO ============================
export const keys = {};
export const mouse = { left: false, right: false, cdL: 0, cdR: 0 };

// ============================ RNG / NOISE ============================
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, z, s = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(SEED + s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export class Simplex {
  constructor(seed) {
    const r = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    this.pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.pm12[i] = this.perm[i] % 12;
    }
    this.g = new Float32Array([
      1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1
    ]);
  }
  n2(xin, yin) {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    const perm = this.perm, pm = this.pm12, g = this.g;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const gi = pm[ii + perm[jj]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (g[gi] * x0 + g[gi + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const gi = pm[ii + i1 + perm[jj + j1]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (g[gi] * x1 + g[gi + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const gi = pm[ii + 1 + perm[jj + 1]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (g[gi] * x2 + g[gi + 1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }
  n3(xin, yin, zin) {
    const F3 = 1 / 3, G3 = 1 / 6;
    const perm = this.perm, pm = this.pm12, g = this.g;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; }
      else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; }
      else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; }
    } else {
      if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; }
      else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; }
      else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n0 = 0, n1 = 0, n2 = 0, n3v = 0;
    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if (t0 > 0) {
      const gi = pm[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n0 = t0*t0*(g[gi]*x0 + g[gi+1]*y0 + g[gi+2]*z0);
    }
    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if (t1 > 0) {
      const gi = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n1 = t1*t1*(g[gi]*x1 + g[gi+1]*y1 + g[gi+2]*z1);
    }
    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if (t2 > 0) {
      const gi = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n2 = t2*t2*(g[gi]*x2 + g[gi+1]*y2 + g[gi+2]*z2);
    }
    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if (t3 > 0) {
      const gi = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n3v = t3*t3*(g[gi]*x3 + g[gi+1]*y3 + g[gi+2]*z3);
    }
    return 32 * (n0 + n1 + n2 + n3v);
  }
}
export let noise = new Simplex(SEED);
export function setSeed(seed) { SEED = seed | 0; noise = new Simplex(SEED); }
export function fbm(x, z, oct, freq) {
  let a = 1, f = freq, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += noise.n2(x * f, z * f) * a;
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

// ============================ MATEMÁTICAS ============================
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export function smooth(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

// ============================ BLOQUES E ÍTEMS ============================
export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, LOG: 4, LEAVES: 5,
  PLANKS: 6, SAND: 7, SNOW: 8, CACTUS: 9, BEDROCK: 10, WATER: 11,
  CRAFTING_TABLE: 12, IRON_ORE: 13, FURNACE: 14, CHEST: 15, GLASS: 16,
  JUNGLE_GRASS: 17, SWAMP_GRASS: 18, TAIGA_GRASS: 19, JUNGLE_LEAVES: 20,
  PORTAL_FRAME: 21, END_STONE: 22, OBSIDIAN: 23
};
export const BD = {
  1: { name: 'Bloque de pasto', t: [0,1,2], drop: 2 },
  2: { name: 'Tierra', t: [2,2,2] },
  3: { name: 'Piedra', t: [3,3,3] },
  4: { name: 'Tronco de madera', t: [5,4,5] },
  5: { name: 'Hojas', t: [6,6,6] },
  6: { name: 'Tablas de madera', t: [7,7,7] },
  7: { name: 'Arena', t: [8,8,8] },
  8: { name: 'Pasto nevado', t: [9,10,2], drop: 2 },
  9: { name: 'Cactus', t: [12,11,12] },
  10: { name: 'Roca madre', t: [13,13,13], unbreakable: true },
  11: { name: 'Agua', t: [14,14,14] },
  12: { name: 'Mesa de crafteo', t: [17,18,18] },
  13: { name: 'Mineral de hierro', t: [19,19,19], drop: 13 },
  14: { name: 'Horno', t: [26,20,20] },
  15: { name: 'Cofre', t: [15,21,21] },
  16: { name: 'Vidrio', t: [22,22,22] },
  17: { name: 'Pasto de jungla', t: [23,23,2], drop: 2 },
  18: { name: 'Pasto de pantano', t: [0,1,2], drop: 2 },
  19: { name: 'Pasto de taiga', t: [25,25,2], drop: 2 },
  20: { name: 'Hojas de jungla', t: [6,6,6], drop: 5 },
  21: { name: 'Marco del portal', t: [27,30,30] },
  22: { name: 'Piedra del End', t: [28,28,28] },
  23: { name: 'Obsidiana', t: [29,29,29] }
};
export const I = {
  STICK: 100, WSWORD: 101, SSWORD: 102, BONE: 103, FLESH: 104, MEAT: 105,
  IRON_INGOT: 106, WPICK: 107, WAXE: 108, WSHOVEL: 109,
  SPICK: 110, SAXE: 111, SSHOVEL: 112, IPICK: 113, ISWORD: 114, COAL: 115,
  BEEF_RAW: 116, PORK_RAW: 117, MUTTON_RAW: 118, CHICKEN_RAW: 119,
  BEEF_COOKED: 120, PORK_COOKED: 121, MUTTON_COOKED: 122, CHICKEN_COOKED: 123,
  WOOL: 124, FEATHER: 125, BURNT_ROCK: 126, TORCH: 127, BOW: 128, ARROW: 129
};
export const ITEMS = {
  100: { name: 'Palo' },
  101: { name: 'Espada de madera', dmg: 5, stack: 1 },
  102: { name: 'Espada de piedra', dmg: 7, stack: 1 },
  103: { name: 'Hueso' },
  104: { name: 'Carne podrida (clic der. para comer)', food: 4 },
  105: { name: 'Filete cocido (clic der. para comer)', food: 8 },
  106: { name: 'Lingote de hierro' },
  107: { name: 'Pico de madera', dmg: 3, stack: 1 },
  108: { name: 'Hacha de madera', dmg: 4, stack: 1 },
  109: { name: 'Pala de madera', dmg: 2, stack: 1 },
  110: { name: 'Pico de piedra', dmg: 4, stack: 1 },
  111: { name: 'Hacha de piedra', dmg: 5, stack: 1 },
  112: { name: 'Pala de piedra', dmg: 3, stack: 1 },
  113: { name: 'Pico de hierro', dmg: 6, stack: 1 },
  114: { name: 'Espada de hierro', dmg: 9, stack: 1 },
  115: { name: 'Carbón' },
  116: { name: 'Carne cruda de vaca', food: 2, poisonChance: .2 },
  117: { name: 'Carne cruda de cerdo', food: 2, poisonChance: .2 },
  118: { name: 'Carne cruda de oveja', food: 2, poisonChance: .2 },
  119: { name: 'Pollo crudo', food: 2, poisonChance: .2 },
  120: { name: 'Filete de vaca', food: 8 },
  121: { name: 'Chuleta cocida', food: 8 },
  122: { name: 'Cordero asado', food: 6 },
  123: { name: 'Pollo asado', food: 6 },
  124: { name: 'Lana' },
  125: { name: 'Pluma' },
  126: { name: 'Roca quemada' },
  127: { name: 'Antorcha' },
  128: { name: 'Arco', stack: 1, ranged: true },
  129: { name: 'Flecha' }
};
export const SMELTING = [
  { in: B.SAND, out: B.GLASS, time: 4 },
  { in: B.IRON_ORE, out: I.IRON_INGOT, time: 5 },
  { in: I.FLESH, out: I.MEAT, time: 5 },
  { in: B.LOG, out: I.COAL, time: 4 },
  { in: B.PLANKS, out: I.COAL, time: 3 },
  { in: B.STONE, out: I.BURNT_ROCK, time: 5 },
  { in: I.BEEF_RAW, out: I.BEEF_COOKED, time: 5 },
  { in: I.PORK_RAW, out: I.PORK_COOKED, time: 5 },
  { in: I.MUTTON_RAW, out: I.MUTTON_COOKED, time: 5 },
  { in: I.CHICKEN_RAW, out: I.CHICKEN_COOKED, time: 5 }
];
export const FUEL_TIMES = {
  [B.PLANKS]: 3, [B.LOG]: 3, [I.COAL]: 15, [I.STICK]: 1
};
export const itemName = id => id < 100 ? BD[id].name : ITEMS[id].name;
export const stackMax = id => (id >= 100 && ITEMS[id].stack) || 64;
export const isLeaves = b => b === B.LEAVES || b === B.JUNGLE_LEAVES;
export const isOpaque = b => b !== B.AIR && b !== B.WATER && !isLeaves(b) && b !== B.GLASS;
export const occl = b => b !== B.AIR && b !== B.WATER && b !== B.GLASS && !isLeaves(b);

// ============================ TEXTURAS PROCEDURALES ============================
export const TILES = 31;
export function rgba(c) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${c[3] === undefined ? 1 : c[3]})`;
}
export function vary(c, R, a) {
  const v = (R() - 0.5) * a;
  return [clamp(c[0] + v, 0, 255), clamp(c[1] + v, 0, 255), clamp(c[2] + v, 0, 255)];
}
export function paint(fn, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  const R = mulberry32(seed * 7919 + 13);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const col = fn(x, y, R);
    if (col) { g.fillStyle = rgba(col); g.fillRect(x, y, 1, 1); }
  }
  return c;
}
const GRASS_C = [95, 159, 53], DIRT_C = [134, 96, 67];
const grassPix = R => R() < 0.12 ? vary([125, 190, 70], R, 20) : vary(GRASS_C, R, 36);
const dirtPix = R => R() < 0.1 ? vary([100, 70, 48], R, 14) : vary(DIRT_C, R, 28);
export const tileCanvases = [
  paint((x, y, R) => grassPix(R), 1),
  paint((x, y, R) => (y < 3 || (y === 3 && R() < 0.6) || (y === 4 && R() < 0.25)) ? grassPix(R) : dirtPix(R), 2),
  paint((x, y, R) => dirtPix(R), 3),
  paint((x, y, R) => R() < 0.08 ? vary([92, 92, 92], R, 10) : vary([128, 128, 128], R, 26), 4),
  paint((x, y, R) => {
    const dark = (x % 4 === 0) || ((x * 7 + y * 3) % 11 === 0);
    return vary(dark ? [78, 60, 36] : [106, 83, 50], R, 16);
  }, 5),
  paint((x, y, R) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return vary([96, 74, 44], R, 14);
    return vary(Math.floor(d) % 2 ? [182, 148, 94] : [156, 124, 76], R, 12);
  }, 6),
  paint((x, y, R) => R() < 0.05 ? null : (R() < 0.28 ? vary([28, 76, 22], R, 14) : vary([42, 105, 30], R, 28)), 7),
  paint((x, y, R) => {
    if (y % 4 === 3) return vary([112, 84, 48], R, 8);
    if (x === ((y >> 2) * 5 + 3) % 16) return vary([130, 98, 58], R, 8);
    return vary([178, 140, 88], R, 18);
  }, 8),
  paint((x, y, R) => vary([222, 210, 162], R, 20), 9),
  paint((x, y, R) => vary([240, 246, 252], R, 12), 10),
  paint((x, y, R) => (y < 4 || (y === 4 && R() < 0.5)) ? vary([240, 246, 252], R, 12) : dirtPix(R), 11),
  paint((x, y, R) => {
    if (x % 5 === 1 && y % 4 === 1) return [230, 226, 180];
    if (x % 5 === 1) return vary([56, 108, 34], R, 12);
    return vary([86, 146, 52], R, 18);
  }, 12),
  paint((x, y, R) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return vary([56, 108, 34], R, 10);
    return vary(d < 2 ? [150, 196, 96] : [96, 158, 60], R, 14);
  }, 13),
  paint((x, y, R) => R() < 0.5 ? vary([46, 46, 46], R, 16) : vary([94, 94, 94], R, 20), 14),
  paint((x, y, R) => ((y + (x >> 2)) % 5 === 0) ? vary([96, 146, 232], R, 14) : vary([46, 94, 208], R, 18), 15),
  paint((x, y, R) => vary([200, 60, 200], R, 10), 16),
  paint((x, y, R) => {
    if (y < 4) return vary([156, 112, 62], R, 12);
    return vary([126, 83, 44], R, 12);
  }, 17),
  paint((x, y, R) => {
    if (x % 5 === 0 || y % 5 === 0) return vary([210, 166, 104], R, 10);
    return vary([142, 94, 51], R, 14);
  }, 18),
  paint((x, y, R) => {
    const fleck = ((x * 7 + y * 11) % 13) < 3;
    return vary(fleck ? [196, 158, 112] : [104, 101, 96], R, 22);
  }, 19),
  paint((x, y, R) => {
    if (x >= 5 && x <= 10 && y >= 5 && y <= 10) return vary([48, 43, 39], R, 12);
    return vary([112, 108, 103], R, 18);
  }, 20),
  paint((x, y, R) => {
    if (y === 3 || y === 12 || x === 3 || x === 12) return vary([178, 125, 65], R, 12);
    return vary([132, 88, 45], R, 18);
  }, 21),
  paint((x, y, R) => {
    if (x === 0 || x === 15 || y === 0 || y === 15) return [140, 192, 205, 0.28];
    if (x % 5 === 0 || y % 5 === 0) return [215, 241, 245, 0.38];
    return [170, 220, 230, 0.22];
  }, 22),
  paint((x, y, R) => vary(R() < .18 ? [65, 122, 42] : [54, 105, 38], R, 18), 23),
  paint((x, y, R) => vary(R() < .22 ? [101, 137, 54] : [82, 119, 47], R, 22), 24),
  paint((x, y, R) => vary(R() < .2 ? [82, 126, 70] : [67, 109, 62], R, 18), 25),
  paint((x, y, R) => vary(R() < .2 ? [42, 111, 38] : [35, 91, 33], R, 16), 26),
  paint((x,y,R) => ((x%8===0||y%8===0)&&R()<.8)?vary([109,75,139],R,18):vary([48,37,65],R,16),27),
  paint((x,y,R) => vary((x+y)%5===0?[202,190,220]:[170,157,193],R,20),28),
  paint((x,y,R) => ((x*3+y*7)%17<3)?vary([92,70,125],R,12):vary([35,27,49],R,14),29),
  paint((x,y,R) => ((x%4===0)||(y%4===0))?vary([110,160,175],R,10):vary([40,62,72],R,12),30)
];
export function mkTex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  // Las celdas del atlas no tienen extrusion/padding; usar nearest evita que
  // el filtrado mezcle píxeles de bloques vecinos y genere franjas en las caras.
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.anisotropy = 1;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ATLAS_COLUMNS = 32; // potencia de dos: evita perder mipmaps en WebGL.
const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = 512;
atlasCanvas.height = 256;
{
  const g = atlasCanvas.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  // Repetir la fila verticalmente evita mezclar las texturas con una zona vacía
  // al generar niveles mipmap; los UV usan una celda de 16x16 por bloque.
  for (let y = 0; y < atlasCanvas.height; y += 16)
    tileCanvases.forEach((c, i) => g.drawImage(c, i * 16, y, 16, 16));
}
export const atlasTex = mkTex(atlasCanvas);
export const tileTex = tileCanvases.map(mkTex);
export const tileAvg = tileCanvases.map(c => {
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 16, 16).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  }
  return new THREE.Color(r / n / 255, g / n / 255, b / n / 255);
});

// Texturas locales extraídas del paquete proporcionado. Si falta alguna imagen,
// se conserva la textura procedural original como alternativa.
const RESOURCE_PACK_TILES = [
  'grass_block_top','grass_block_side','dirt','stone','oak_log','oak_log_top','oak_leaves','oak_planks',
  'sand','snow','grass_block_snow','cactus_side','cactus_top','bedrock','water_still','barrel_top',
  'nether_portal','crafting_table_top','crafting_table_side','iron_ore','furnace_side','barrel_side','glass',
  'grass_block_top','moss_block','podzol_top','furnace_top','end_portal_frame_top','end_stone','obsidian',
  'end_portal_frame_side'
];

// Aplica el tinte de bioma que Minecraft utiliza para texturas en escala de grises.
// Se conserva el canal alfa para que hojas y agua sigan siendo transparentes.
function tintCanvas(canvas, tint) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, 16, 16);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i]     = Math.round(data[i]     * tint[0] / 255);
    data[i + 1] = Math.round(data[i + 1] * tint[1] / 255);
    data[i + 2] = Math.round(data[i + 2] * tint[2] / 255);
  }
  ctx.putImageData(imageData, 0, 0);
}

function averageCanvasColor(canvas, target) {
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 16, 16).data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) { r += data[i]; g += data[i + 1]; b += data[i + 2]; count++; }
  }
  if (count) target.setRGB(r / count / 255, g / count / 255, b / count / 255);
}

export async function loadResourcePackTextures() {
  const names = [...new Set(RESOURCE_PACK_TILES)];
  const images = new Map();
  await Promise.all(names.map(name => new Promise(resolve => {
    const image = new Image();
    image.onload = () => { images.set(name, image); resolve(); };
    image.onerror = () => { console.warn('No se pudo cargar la textura:', name); images.set(name, null); resolve(); };
    image.src = new URL(`./texturas/bloques/${name}.png`, import.meta.url).href;
  })));

  const atlasContext = atlasCanvas.getContext('2d', { willReadFrequently: true });
  atlasContext.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
  let loaded = 0;
  for (let i = 0; i < tileCanvases.length; i++) {
    const image = images.get(RESOURCE_PACK_TILES[i]);
    const canvas = tileCanvases[i];
    if (image) {
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, 16, 16);
      context.imageSmoothingEnabled = false;
      // Algunos PNG del paquete son tiras de animación verticales (agua/portal).
      // Usamos el primer fotograma sin comprimir toda la tira en un solo bloque.
      const frameWidth = Math.min(image.naturalWidth || 16, 16);
      const frameHeight = Math.min(image.naturalHeight || 16, 16);
      context.drawImage(image, 0, 0, frameWidth, frameHeight, 0, 0, 16, 16);

      // El paquete vanilla usa texturas en escala de grises para aplicar el tinte
      // de bioma por código. Sin este paso, el césped superior, las hojas y el agua
      // se ven grises aunque la textura correcta haya cargado.
      if (i === 0 || i === 23) tintCanvas(canvas, [121, 192, 90]); // césped
      if (i === 6) tintCanvas(canvas, [89, 174, 48]);              // hojas
      // Las hojas conservan los huecos totalmente transparentes, pero sus píxeles visibles quedan opacos.
      if (i === 6) {
        const leafCtx = canvas.getContext('2d');
        const leafData = leafCtx.getImageData(0, 0, 16, 16);
        for (let a = 3; a < leafData.data.length; a += 4) {
          if (leafData.data[a] > 0) leafData.data[a] = 255;
        }
        leafCtx.putImageData(leafData, 0, 0);
      }
      if (i === 14) tintCanvas(canvas, [63, 118, 228]);            // agua

      loaded++;
      averageCanvasColor(canvas, tileAvg[i]);
    }
    for (let y = 0; y < atlasCanvas.height; y += 16)
      atlasContext.drawImage(canvas, i * 16, y, 16, 16);
    tileTex[i].needsUpdate = true;
  }
  atlasTex.needsUpdate = true;
  return { loaded, total: RESOURCE_PACK_TILES.length };
}


// ============================ ICONOS DE ÍTEMS ============================
export function pix(fn) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  fn((x, y, col) => { g.fillStyle = rgba(col); g.fillRect(x, y, 1, 1); });
  return c;
}
function drawSword(p, blade, edge) {
  for (let i = 0; i < 9; i++) {
    const x = 14 - i, y = 1 + i;
    p(x, y, edge); p(x - 1, y, blade); p(x, y + 1, blade);
  }
  [[3,8],[4,9],[5,10],[6,11],[7,12]].forEach(([x, y]) => p(x, y, [80, 56, 30]));
  [[4,11],[3,12],[2,13]].forEach(([x, y]) => p(x, y, [120, 84, 46]));
  p(1, 14, [70, 48, 26]); p(2, 14, [70, 48, 26]); p(1, 13, [70, 48, 26]);
}
function drawTool(p, material, kind) {
  for (let i = 0; i < 10; i++) {
    p(4 + i, 14 - i, [112, 78, 42]);
    if (i < 9) p(5 + i, 14 - i, [154, 112, 64]);
  }
  if (kind === 'pick') {
    for (let x = 3; x <= 12; x++) p(x, 2 + Math.floor(Math.abs(x - 7.5) / 3), material);
  } else if (kind === 'axe') {
    for (let y = 2; y <= 8; y++) {
      p(5, y, material); p(6, y, material);
      if (y < 7) p(4, y + 1, material);
    }
    p(7, 2, material); p(4, 3, material);
  } else {
    for (let x = 4; x <= 11; x++) p(x, 2 + Math.floor(Math.abs(x - 7.5) / 2), material);
    p(5, 5, material); p(10, 5, material);
  }
}
const woodTool = [180, 143, 91], stoneTool = [155, 155, 155], ironTool = [220, 220, 211];
function meatIcon(raw, seed) {
  return pix(p => {
    const R=mulberry32(seed);
    for(let y=4;y<=11;y++)for(let x=3;x<=12;x++)if((x-7.5)**2/28+(y-7.5)**2/17<1) {
      const bone=x<5&&y<6;
      p(x,y,bone?[232,224,199]:raw?vary([177,62,58],R,28):vary([139,77,43],R,22));
    }
    if(raw){p(7,6,[232,117,109]);p(9,9,[210,91,83]);}
    else {p(6,5,[224,151,83]);p(9,8,[111,57,36]);}
  });
}
export const itemCanvases = {
  100: pix(p => {
    for (let i = 0; i < 11; i++) { p(3 + i, 13 - i, [138, 100, 58]); p(4 + i, 13 - i, [96, 68, 38]); }
  }),
  101: pix(p => drawSword(p, [182, 144, 90], [118, 88, 50])),
  102: pix(p => drawSword(p, [158, 158, 158], [96, 96, 96])),
  103: pix(p => {
    for (let i = 0; i < 8; i++) { p(4 + i, 11 - i, [232, 230, 214]); p(5 + i, 11 - i, [200, 198, 182]); }
    [[2,11],[3,12],[3,13],[4,12],[11,2],[12,3],[12,2],[13,3]].forEach(([x, y]) => p(x, y, [238, 236, 222]));
  }),
  104: pix(p => {
    const R = mulberry32(77);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, (y - 7.5) * 1.3);
      if (d < 6 + R() * 0.8) p(x, y, R() < 0.2 ? [110, 130, 60] : vary([156, 80, 60], R, 30));
    }

    
    
  }),
    105: pix(p => {
    const R = mulberry32(9001);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = (y - 7.5) * 1.1;
      const d = Math.hypot(dx, dy);
      if (d < 6.2 + R() * 0.6) {
        if (d < 2.5) p(x, y, vary([190, 90, 60], R, 18));
        else p(x, y, vary([140, 70, 40], R, 22));
      }
    }
    // Brillito
    p(6, 5, [220, 130, 90]);
    p(7, 5, [230, 140, 100]);
  }),
  106: pix(p => {
    for (let x = 3; x <= 12; x++) { p(x, 5, [225, 225, 215]); p(x, 10, [150, 150, 145]); }
    for (let y = 6; y < 10; y++) { p(3, y, [190, 190, 183]); p(12, y, [170, 170, 164]); }
    for (let x = 4; x < 12; x++) for (let y = 6; y < 10; y++) p(x, y, [205, 205, 196]);
    p(5, 6, [240, 240, 232]); p(6, 6, [240, 240, 232]);
  }),
  107: pix(p => drawTool(p, woodTool, 'pick')),
  108: pix(p => drawTool(p, woodTool, 'axe')),
  109: pix(p => drawTool(p, woodTool, 'shovel')),
  110: pix(p => drawTool(p, stoneTool, 'pick')),
  111: pix(p => drawTool(p, stoneTool, 'axe')),
  112: pix(p => drawTool(p, stoneTool, 'shovel')),
  113: pix(p => drawTool(p, ironTool, 'pick')),
  114: pix(p => drawSword(p, [224, 224, 214], [145, 145, 138])),
  115: pix(p => {
    for (let y = 3; y <= 12; y++) for (let x = 4; x <= 11; x++) {
      const edge = x === 4 || x === 11 || y === 3 || y === 12;
      p(x, y, edge ? [35, 35, 35] : ((x + y) % 3 ? [23, 23, 23] : [68, 68, 68]));
    }
    p(6, 5, [102, 102, 102]); p(9, 9, [93, 93, 93]);
  }),
  116: meatIcon(true,116), 117: meatIcon(true,117), 118: meatIcon(true,118), 119: meatIcon(true,119),
  120: meatIcon(false,120), 121: meatIcon(false,121), 122: meatIcon(false,122), 123: meatIcon(false,123),
  124: pix(p => { for(let y=4;y<=11;y++)for(let x=4;x<=11;x++)if((x-7.5)**2+(y-7.5)**2<25)p(x,y,vary([231,226,209],mulberry32(x*19+y*31),15)); }),
  125: pix(p => { for(let y=2;y<=13;y++){const w=Math.max(1,Math.floor((13-y)/3));for(let x=8-w;x<=8+w;x++)p(x,y,vary([237,231,210],mulberry32(x*13+y*17),18));}for(let y=10;y<=14;y++)p(8,y,[151,111,66]); }),
  126: pix(p => { for(let y=3;y<13;y++)for(let x=3;x<13;x++)p(x,y,((x+y)%4===0)?[72,61,84]:[105,91,120]); }),
  127: pix(p => { for(let y=3;y<10;y++)p(8,y,[244,169,48]);for(let y=8;y<14;y++)p(8,y,[137,91,48]);p(7,4,[255,224,98]);p(9,5,[255,224,98]); }),
  128: pix(p => { for(let i=0;i<10;i++){p(4+i,13-i,[137,89,45]);p(5+i,13-i,[205,165,100]);}for(let i=0;i<7;i++)p(5+i,4+i,[226,218,193]); }),
  129: pix(p => { for(let i=0;i<11;i++){p(3+i,12-i,[146,146,151]);if(i<8)p(4+i,12-i,[181,181,185]);}for(let i=0;i<4;i++)p(11+i,4-i,[220,220,225]); })
};
export const itemTex = {};
for (const k in itemCanvases) itemTex[k] = mkTex(itemCanvases[k]);

const iconCache = {};
export function iconFor(id) {
  if (iconCache[id]) return iconCache[id];
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (id >= 100) {
    g.drawImage(itemCanvases[id], 0, 0, 32, 32);
  } else {
    const t = BD[id].t;
    const top = tileCanvases[t[0]], side = tileCanvases[t[1]];
    g.setTransform(1, 0.5, -1, 0.5, 16, 0);
    g.drawImage(top, 0, 0, 16, 16);
    g.setTransform(1, 0.5, 0, 1, 0, 8);
    g.drawImage(side, 0, 0, 16, 16);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 0, 16, 16);
    g.setTransform(1, -0.5, 0, 1, 16, 16);
    g.drawImage(side, 0, 0, 16, 16);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 0, 16, 16);
  }
  return (iconCache[id] = c.toDataURL());
}

// ============================ TEXTURAS DE MOBS ============================
export const zSkin = mkTex(paint((x, y, R) => vary([88, 142, 78], R, 26), 21));
export const zFace = mkTex(paint((x, y, R) => {
  if ((y === 6 || y === 7) && ((x >= 3 && x <= 5) || (x >= 10 && x <= 12))) return [18, 18, 18];
  if (y === 11 && x >= 5 && x <= 10) return [44, 66, 40];
  if (y === 10 && (x === 7 || x === 8)) return [60, 96, 54];
  return vary([88, 142, 78], R, 26);
}, 22));
export const zShirt = mkTex(paint((x, y, R) => vary([38, 158, 160], R, 26), 23));
export const zPants = mkTex(paint((x, y, R) => vary([62, 58, 152], R, 22), 24));
export const sBone = mkTex(paint((x, y, R) => vary([200, 200, 194], R, 22), 25));
export const sFace = mkTex(paint((x, y, R) => {
  if (y >= 5 && y <= 8 && ((x >= 3 && x <= 6) || (x >= 9 && x <= 12))) return [22, 22, 22];
  if (y === 10 && (x === 7 || x === 8)) return [60, 60, 60];
  if (y === 12 && x >= 4 && x <= 11) return x % 2 ? [40, 40, 40] : [226, 226, 220];
  return vary([200, 200, 194], R, 22);
}, 26));
export const sTorso = mkTex(paint((x, y, R) => {
  if (x === 7 || x === 8) return vary([180, 180, 174], R, 10);
  if (y % 3 === 0) return vary([200, 200, 194], R, 16);
  return [50, 50, 50];
}, 27));
export const cowSkin = mkTex(paint((x,y,R) => {
  const spot=((x*7+y*11)%19<5)||((x*3-y*5+32)%23<4);
  return spot&&R()<.82?[35,33,31]:vary([235,231,216],R,12);
},31));
export const cowFace = mkTex(paint((x,y,R) => {
  if(y>=10&&x>=5&&x<=10)return vary([222,139,133],R,12);
  if(y>=5&&y<=6&&(x===4||x===11))return [20,18,18];
  return vary([236,232,218],R,12);
},32));
export const pigSkin = mkTex(paint((x,y,R)=>vary([231,151,158],R,14),33));
export const pigFace = mkTex(paint((x,y,R)=>{
  if(x>=4&&x<=11&&y>=7&&y<=12)return [194,93,111];
  if(y===5&&(x===3||x===12))return [20,18,18];
  if(y>=9&&y<=10&&(x===6||x===9))return [83,42,47];
  return vary([238,165,171],R,12);
},34));
export const sheepWool = mkTex(paint((x,y,R)=>vary((x+y)%3?[239,237,222]:[216,216,203],R,14),35));
export const sheepFace = mkTex(paint((x,y,R)=>{
  if(y>=5&&y<=6&&(x===4||x===11))return [250,250,238];
  if(y===5&&(x===5||x===10))return [20,18,18];
  return vary([39,38,36],R,12);
},36));
export const chickenSkin = mkTex(paint((x,y,R)=>vary([238,236,221],R,12),37));
export const chickenFace = mkTex(paint((x,y,R)=>{
  if(y<=2&&x>=5&&x<=10)return [192,44,42];
  if(y>=7&&y<=9&&x>=10&&x<=14)return [235,177,38];
  if(y>=5&&y<=6&&x===5)return [22,20,19];
  return vary([239,237,222],R,10);
},38));

// ============================ CORAZONES ============================
const HEART = [".XX.XX.", "XRRXRRX", "XRWRRRX", "XRRRRRX", ".XRRRX.", "..XRX..", "...X..."];
function heartImg(mode) {
  const c = document.createElement('canvas');
  c.width = c.height = 7;
  const g = c.getContext('2d');
  HEART.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    let col = ch === 'X' ? '#000' : ch === 'W' ? '#fff' : '#e3202b';
    if (ch !== 'X') { if (mode === 0 || (mode === 1 && x > 3)) col = '#3b3b3b'; }
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  }));
  return c.toDataURL();
}



export const HEARTS = [heartImg(0), heartImg(1), heartImg(2)];


// ============================ ICONOS DE HAMBRE ============================
const HUNGER = [
  "..XXX..",
  ".XBBBX.",
  "XBWWBBX",
  "XBWWBBX",
  ".XBBBX.",
  "..XBX..",
  "...X..."
];
function hungerImg(mode) {
  const c = document.createElement('canvas');
  c.width = c.height = 7;
  const g = c.getContext('2d');
  HUNGER.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    let col;
    if (ch === 'X') col = '#000';
    else if (ch === 'W') col = '#ffe4a8';
    else col = '#c8845a'; // B — carne
    // Modos: 0 = vacío, 1 = mitad, 2 = lleno
    if (ch !== 'X') {
      if (mode === 0) col = '#3b3b3b';
      else if (mode === 1 && y < 4) col = '#3b3b3b';
    }
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  }));
  return c.toDataURL();
}
export const HUNGER_ICONS = [hungerImg(0), hungerImg(1), hungerImg(2)];
