// Persistencia local por seed. Los sistemas registran el snapshot desde main.js.
import { SEED, setSeed } from './nucleo.js';

export const mods = new Map();
let activeSeed = SEED;
let provider = () => ({});
let restore = () => {};
const keyFor = seed => `minecraft_save_${seed}`;
const legacyKeyFor = seed => `voxelcraft_save_${seed}`;
export function registerPersistence(read, write) { provider = read; restore = write; }
export function saveKey() { return keyFor(activeSeed); }
export function recordBlockChange(x, y, z, id) { mods.set(`${x},${y},${z}`, id); }
export function getBlockMod(x, y, z) { return mods.get(`${x},${y},${z}`); }
export function clearModAt(x, y, z) { mods.delete(`${x},${y},${z}`); }
export function loadState() {
  try {
    const savedSeed = localStorage.getItem('minecraft_last_seed') ?? localStorage.getItem('voxelcraft_last_seed');
    const hinted = savedSeed === null ? NaN : Number(savedSeed);
    if (Number.isFinite(hinted)) { activeSeed = hinted | 0; setSeed(activeSeed); }
    const raw = localStorage.getItem(keyFor(activeSeed)) || localStorage.getItem(legacyKeyFor(activeSeed));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1) return null;
    activeSeed = data.seed | 0; setSeed(activeSeed);
    mods.clear(); Object.entries(data.mods || {}).forEach(([k, v]) => mods.set(k, v));
    restore(data);
    return data;
  } catch (e) { console.warn('No se pudo cargar el mundo guardado:', e); return null; }
}
export function saveState(snapshot = provider()) {
  try {
    const data = { version: 1, seed: activeSeed, ...snapshot,
      mods: Object.fromEntries(mods) };
    localStorage.setItem(keyFor(activeSeed), JSON.stringify(data));
    localStorage.setItem('minecraft_last_seed', String(activeSeed));
    return true;
  } catch (e) { console.warn('No se pudo guardar el mundo:', e); return false; }
}
