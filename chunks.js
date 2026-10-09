import { CH, WY, CHUNK_RADIUS_LOAD, CHUNK_RADIUS_MESH, CHUNK_RADIUS_UNLOAD } from './nucleo.js';

const loaded = new Map(), pending = new Map(), queue = [];
const dirty = new Set();
let generateHandler = () => {}, meshHandler = () => {};
export const chunkKey = (cx, cz) => `${cx},${cz}`;
export const getChunk = (cx, cz) => loaded.get(chunkKey(cx, cz)) || null;
export const isChunkQueued = (cx, cz) => pending.has(chunkKey(cx, cz));
export const chunkIndex = (x, y, z) => (y * CH + z) * CH + x;
export function registerChunkHandlers(generate, mesh) { generateHandler = generate; meshHandler = mesh; }
export function queueChunkGeneration(cx, cz, wantMesh = true) {
  const key = chunkKey(cx, cz);
  if (loaded.has(key)) return;
  if (pending.has(key)) {
    pending.get(key).wantMesh = wantMesh;
    const item=queue.find(q=>q.cx===cx&&q.cz===cz); if(item)item.wantMesh=wantMesh;
    return;
  }
  pending.set(key, { cx, cz, wantMesh }); queue.push({ cx, cz, wantMesh });
}
export function ensureChunkLoaded(cx, cz) {
  const key = chunkKey(cx, cz);
  if (loaded.has(key)) return loaded.get(key);
  const ch = { cx, cz, blocks: new Uint8Array(CH * WY * CH), biome: new Uint8Array(CH * CH),
    heightmap: new Int16Array(CH * CH), meshes: { solid: null, water: null, glass: null },
    originals: new Map(), dirty: true, generated: false, wantMesh: true };
  loaded.set(key, ch); pending.delete(key);
  generateHandler(ch); ch.generated = true; ch.dirty = true;
  dirty.add(key);
  for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) { const n = loaded.get(chunkKey(cx+dx, cz+dz)); if (n) { n.dirty = true; dirty.add(chunkKey(cx+dx, cz+dz)); } }
  return ch;
}
export function processChunkQueue(maxPerFrame = 1) {
  for (let i = 0; i < maxPerFrame && queue.length; i++) {
    const { cx, cz, wantMesh } = queue.shift();
    if (pending.has(chunkKey(cx, cz))) { const ch=ensureChunkLoaded(cx, cz); ch.wantMesh=wantMesh; dirty.add(chunkKey(cx,cz)); }
  }
}
export function takeDirtyChunks() { const out = [...dirty]; dirty.clear(); return out; }
export function markChunkDirty(cx, cz) { const key = chunkKey(cx, cz), ch = loaded.get(key); if (ch) { ch.dirty = true; dirty.add(key); } }
export function updateChunkStreaming(pos) {
  const pcx = Math.floor(pos.x / CH), pcz = Math.floor(pos.z / CH);
  for (let dz = -CHUNK_RADIUS_LOAD; dz <= CHUNK_RADIUS_LOAD; dz++) for (let dx = -CHUNK_RADIUS_LOAD; dx <= CHUNK_RADIUS_LOAD; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) > CHUNK_RADIUS_LOAD) continue;
    const cx = pcx + dx, cz = pcz + dz, d = Math.max(Math.abs(dx), Math.abs(dz));
    if (d <= CHUNK_RADIUS_MESH) { const ch = getChunk(cx, cz); if (ch&&!ch.wantMesh) {ch.wantMesh=true;ch.dirty=true;dirty.add(chunkKey(cx,cz));} else if (!ch) queueChunkGeneration(cx, cz, true); }
    else if (!getChunk(cx, cz)) queueChunkGeneration(cx, cz, false);
  }
  for (const [key, ch] of loaded) {
    const d = Math.max(Math.abs(ch.cx - pcx), Math.abs(ch.cz - pcz));
    const want = d <= CHUNK_RADIUS_MESH;
    if (ch.wantMesh !== want) { ch.wantMesh = want; ch.dirty = true; dirty.add(key); }
    if (d > CHUNK_RADIUS_UNLOAD) unloadChunk(ch.cx, ch.cz);
  }
  for(const [key,item] of pending){
    const d=Math.max(Math.abs(item.cx-pcx),Math.abs(item.cz-pcz));
    if(d>CHUNK_RADIUS_UNLOAD)pending.delete(key);
  }
  for(let i=queue.length-1;i>=0;i--)if(!pending.has(chunkKey(queue[i].cx,queue[i].cz)))queue.splice(i,1);
}
export function buildDirtyMeshes() {
  for (const key of takeDirtyChunks()) { const ch = loaded.get(key); if (ch) meshHandler(ch); }
}
export function unloadChunk(cx, cz) {
  const key = chunkKey(cx, cz), ch = loaded.get(key); if (!ch) return;
  Object.values(ch.meshes).forEach(mesh => { if (mesh) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); } });
  loaded.delete(key); dirty.delete(key);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])markChunkDirty(cx+dx,cz+dz);
}
