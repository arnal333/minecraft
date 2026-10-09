import { B, WY } from './nucleo.js';

// Superficie central del End. Deja espacio bajo la isla y sobre las torres.
export const END_BASE_Y = 22;
export let activeDimension = 'overworld';
const endBlocks = new Map();
const key = (x,y,z) => `${x},${y},${z}`;

export function setActiveDimension(name) {
  activeDimension = name === 'end' ? 'end' : 'overworld';
}
export function getEndBlock(x,y,z) {
  if(y<0||y>=WY)return B.AIR;
  return endBlocks.get(key(x,y,z)) ?? B.AIR;
}
export function setEndBlock(x,y,z,id) {
  if(y<0||y>=WY)return;
  const k=key(x,y,z);
  if(id===B.AIR)endBlocks.delete(k);else endBlocks.set(k,id);
}
export function clearEndBlocks() { endBlocks.clear(); }
