// ============================================================================
// mundo.js — Datos del mundo, generación procedural, chunks, meshing, partículas
// ============================================================================
import * as THREE from 'three';
import {
  CH, WY, SEA,
  B, BD, noise, fbm, hash2, clamp, smooth,
  isOpaque, isLeaves, occl, atlasTex, TILES
} from './nucleo.js';
import { scene, dummy, worldGroup } from './render.js';
import { activeDimension, END_BASE_Y, getEndBlock, setEndBlock } from './dimensiones.js';
import { chunkIndex, getChunk, ensureChunkLoaded, registerChunkHandlers, markChunkDirty, isChunkQueued, buildDirtyMeshes } from './chunks.js';
import { mods, recordBlockChange, clearModAt } from './persistencia.js';

// ============================ ESTADO DEL MUNDO ============================
export const BIOMES = ['Llanuras', 'Bosque', 'Desierto', 'Tundra nevada', 'Montañas', 'Jungla', 'Pantano', 'Taiga', 'Playa', 'Océano profundo'];
export const furnaceState = new Map();
export const chestState = new Map();

const blockKey = (x, y, z) => `${x},${y},${z}`;
export function getFurnaceState(x, y, z) {
  const key = blockKey(x, y, z);
  if (!furnaceState.has(key)) {
    furnaceState.set(key, { input: null, fuel: null, output: null, progress: 0, fuelLeft: 0, fuelMax: 0 });
  }
  return furnaceState.get(key);
}
export function getChestState(x, y, z) {
  const key = blockKey(x, y, z);
  if (!chestState.has(key)) chestState.set(key, new Array(27).fill(null));
  return chestState.get(key);
}

const keyOf = (x, y, z) => `${x},${y},${z}`;
const loc = (x, z) => ({ cx: Math.floor(x / CH), cz: Math.floor(z / CH), lx: ((x % CH) + CH) % CH, lz: ((z % CH) + CH) % CH });
export function peekBlock(x, y, z) {
  if(activeDimension==='end')return getEndBlock(x,y,z);
  if (y < 0 || y >= WY) return B.AIR;
  const p = loc(x, z), ch = getChunk(p.cx, p.cz);
  return ch?.generated ? ch.blocks[chunkIndex(p.lx, y, p.lz)] : B.AIR;
}
function peekMeshBlock(x,y,z) {
  if(y<0||y>=WY)return B.AIR;
  const p=loc(x,z),ch=getChunk(p.cx,p.cz);
  return ch?.generated&&ch.wantMesh?ch.blocks[chunkIndex(p.lx,y,p.lz)]:B.AIR;
}
export function getBlock(x, y, z) {
  if(activeDimension==='end')return getEndBlock(x,y,z);
  if (y < 0 || y >= WY) return B.AIR;
  const p = loc(x, z), ch = getChunk(p.cx, p.cz);
  if (!ch && isChunkQueued(p.cx, p.cz)) return B.BEDROCK;
  const target = ch || ensureChunkLoaded(p.cx, p.cz);
  return target.blocks[chunkIndex(p.lx, y, p.lz)];
}
export function solidAt(x, y, z) {
  if (activeDimension === 'end') {
    if (y < 0 || y >= WY) return false;
    const b = getEndBlock(x,y,z);return b !== B.AIR && b !== B.WATER;
  }
  if (y < 0) return true;if (y >= WY) return false;
  const b=getBlock(x,y,z);return b !== B.AIR && b !== B.WATER;
}
export function getHeight(x, z) {
  if(activeDimension==='end')return END_BASE_Y;
  const p = loc(x,z), ch = getChunk(p.cx,p.cz) || ensureChunkLoaded(p.cx,p.cz);
  return ch.heightmap[p.lz * CH + p.lx];
}
export function getBiome(x, z) {
  if(activeDimension==='end')return 4;
  const p = loc(x,z), ch = getChunk(p.cx,p.cz) || ensureChunkLoaded(p.cx,p.cz);
  return ch.biome[p.lz * CH + p.lx];
}
export function setRaw(x, y, z, b) {
  if (y < 0 || y >= WY) return;
  const p=loc(x,z), ch=getChunk(p.cx,p.cz); if (ch) ch.blocks[chunkIndex(p.lx,y,p.lz)] = b;
}
export function setIfAir(x,y,z,b) { if (peekBlock(x,y,z) === B.AIR) setRaw(x,y,z,b); }

// ============================ GENERACIÓN PROCEDURAL POR CHUNK ============================
function sampleColumn(x,z) {
  const temp=fbm(x+1000,z+1000,2,.008), hum=fbm(x-2000,z+500,2,.009);
  const hills=fbm(x,z,4,.013), detail=fbm(x+300,z-300,2,.06);
  let mountain=fbm(x-777,z+777,3,.01);mountain=Math.max(0,mountain-.05)*2.2;mountain*=mountain;
  const hot=smooth(-.05,.42,temp), cold=1-smooth(-.34,-.05,temp);
  const wet=smooth(-.22,.32,hum), dry=1-wet;
  const jungle=hot*wet, desert=hot*dry, taiga=cold*wet;
  const mountainW=smooth(.16,.48,mountain);
  let landH=SEA+3+hills*9+detail*2+mountain*30;
  landH=landH*(1-desert*.6)+(SEA+3+hills*2)*desert*.6;
  landH+=jungle*3+taiga;
  const continent=fbm(x-5100,z+7300,2,.0024);
  const land=smooth(-.26,.12,continent);
  let h=12+(landH-12)*land;
  const moderate=clamp(1-Math.abs(temp-.08)/.48,0,1);
  const swamp=wet*moderate*(1-mountainW)*smooth(SEA+13,SEA+2,landH);
  const river=fbm(x+3187,z-2741,2,.006);
  const width=.026+(fbm(x-841,z+993,2,.035)*.5+.5)*.014;
  const riverPower=smooth(width,width*.58,Math.abs(river))*smooth(.18,.62,land);
  h-=riverPower*Math.max(0,h-(SEA-4));
  h-=swamp*2;
  const pondNoise=fbm(x+615,z-928,2,.045);
  const pond=swamp*smooth(.68,.86,pondNoise);
  h-=pond*Math.max(0,h-(SEA-1));
  h=clamp(Math.floor(h),4,WY-14);
  const shore=land<.78&&h>=SEA-5;
  let biome;
  if(land<.28)biome=9;
  else if(shore)biome=8;
  else if(mountainW>.52)biome=4;
  else if(swamp>.43)biome=6;
  else if(jungle>.48)biome=5;
  else if(desert>.48)biome=2;
  else if(cold>.76)biome=3;
  else if(taiga>.46)biome=7;
  else if(wet>.53)biome=1;
  else biome=0;
  const surfaceMix=fbm(x+221,z-719,2,.065)*.5+.5;
  const shoreSand=clamp((.84-land)/.32,0,1);
  const sandWeight=Math.max(shoreSand,smooth(.30,.68,desert));
  const snowWeight=Math.max(cold*.88,mountainW*(h>43?.82:.16))*(1-sandWeight*.55);
  let ground;
  if(surfaceMix<sandWeight||biome===2||biome===8||biome===9||riverPower>.78)ground=B.SAND;
  else if(surfaceMix<sandWeight+snowWeight||biome===3||(biome===4&&h>46))ground=B.SNOW;
  else if(jungle>.36||biome===5)ground=B.JUNGLE_GRASS;
  else if(swamp>.32||biome===6)ground=B.SWAMP_GRASS;
  else if(taiga>.34||biome===7)ground=B.TAIGA_GRASS;
  else if(biome===4&&h>40)ground=B.STONE;
  else ground=B.GRASS;
  return { h, biome, ground, riverPower, pond, jungle, swamp, taiga, cold, wet, hot, land };
}

function generateChunk(ch) {
  const {cx,cz}=ch,x0=cx*CH,z0=cz*CH,riverPower=new Float32Array(CH*CH),pond=new Uint8Array(CH*CH);
  for(let z=0;z<CH;z++)for(let x=0;x<CH;x++){
    const ax=x0+x,az=z0+z,s=sampleColumn(ax,az),ci=z*CH+x;
    ch.biome[ci]=s.biome;ch.heightmap[ci]=s.h;riverPower[ci]=s.riverPower;pond[ci]=s.pond>.52?1:0;
    for(let y=0;y<=s.h;y++){
      let b;
      if(y===0||(y===1&&hash2(ax,az,5)<.5))b=B.BEDROCK;
      else if(y<s.h-3)b=B.STONE;
      else if(y<s.h)b=s.ground===B.SAND?B.SAND:B.DIRT;
      else b=s.ground;
      ch.blocks[chunkIndex(x,y,z)]=b;
    }
    const waterTop=s.biome===9||s.h<SEA?SEA:riverPower[ci]>.58?SEA-1:pond[ci]?SEA:B.AIR;
    if(waterTop!==B.AIR)for(let y=s.h+1;y<=waterTop;y++)ch.blocks[chunkIndex(x,y,z)]=B.WATER;
  }
  for(let z=0;z<CH;z++)for(let x=0;x<CH;x++){
    const ax=x0+x,az=z0+z,h=ch.heightmap[z*CH+x];
    for(let y=2;y<h;y++){
      if(h<=SEA+2&&y>h-5)continue;
      const a=noise.n3(ax*.06,y*.09,az*.06),b=noise.n3(ax*.06+71,y*.09+13,az*.06-29);
      if(Math.abs(a)<=.08&&Math.abs(b)<.08)ch.blocks[chunkIndex(x,y,z)]=B.AIR;
    }
    for(let y=4;y<Math.min(h-3,40);y++){
      const i=chunkIndex(x,y,z);
      if(ch.blocks[i]===B.STONE&&hash2(ax+y*97,az-y*31,43)<.0025)ch.blocks[i]=B.IRON_ORE;
    }
  }
  // Trees are chosen from absolute coordinates and written only into this chunk.
  for(let az=z0-3;az<z0+CH+3;az++)for(let ax=x0-3;ax<x0+CH+3;ax++){
    const r=hash2(ax,az,11);if(r>=.095)continue;
    const s=sampleColumn(ax,az);let type='',height=0;
    if(s.biome===5&&r<.095){type='jungle';height=6+Math.floor(hash2(ax,az,12)*4);}
    else if(s.biome===6&&r<.035){type='swamp';height=3+Math.floor(hash2(ax,az,13)*3);}
    else if((s.biome===3||s.biome===7||(s.biome===4&&s.ground===B.SNOW))&&r<(s.biome===7?.065:s.biome===4?.018:.022)){type='spruce';height=6+Math.floor(hash2(ax,az,14)*3);}
    else if((s.biome===0||s.biome===1||s.biome===4)&&s.ground!==B.SAND&&s.ground!==B.SNOW&&s.ground!==B.STONE&&r<(s.biome===1?.05:s.biome===4?.012:.007)){type='oak';height=4+Math.floor(hash2(ax,az,15)*3);}
    if(!type||s.h<=SEA&&s.biome!==6)continue;
    const baseY=type==='swamp'?Math.max(s.h+1,SEA):s.h+1;
    const put=(wx,wy,wz,id)=>{if(wy<0||wy>=WY)return;const q=loc(wx,wz);if(q.cx!==cx||q.cz!==cz)return;
      const i=chunkIndex(q.lx,wy,q.lz),old=ch.blocks[i];if(old===B.AIR||(id===B.LOG&&old===B.WATER))ch.blocks[i]=id;};
    for(let dy=0;dy<height;dy++)put(ax,baseY+dy,az,B.LOG);
    const top=baseY+height;
    // Robles: algunas copas tienen ramas cortas, como en árboles naturales de Minecraft.
    if(type==='oak'&&height>=5&&hash2(ax,az,18)<.42){
      const branchCount=1+(hash2(ax,az,19)>.55?1:0);
      for(let n=0;n<branchCount;n++){
        const dir=Math.floor(hash2(ax,az,20+n)*4),len=1+(hash2(ax,az,24+n)>.55?1:0);
        const by=baseY+height-2-(n===1?1:0);
        for(let k=1;k<=len;k++){
          const bx=ax+(dir===0?k:dir===2?-k:0);
          const bz=az+(dir===1?k:dir===3?-k:0);
          put(bx,by+Math.floor(k/2),bz,B.LOG);
        }
      }
    }
    if(type==='jungle'){
      // Copas grandes, casi esféricas, con esquinas recortadas.
      for(let dy=-2;dy<=2;dy++){
        const rad=dy===0?3:dy===-2||dy===2?1:2;
        for(let dx=-rad;dx<=rad;dx++)for(let dz=-rad;dz<=rad;dz++)
          if(Math.abs(dx)+Math.abs(dz)<=rad+1)put(ax+dx,top+dy,az+dz,B.LEAVES);
      }
    }else if(type==='swamp'){
      // Copa ancha y baja para los robles de pantano.
      for(let dy=-1;dy<=1;dy++)for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)
        if(Math.abs(dx)+Math.abs(dz)<=5)put(ax+dx,top+dy,az+dz,B.LEAVES);
    }else if(type==='spruce'){
      // Abeto cónico: las capas inferiores son más anchas y se estrechan hacia la punta.
      for(let dy=-Math.floor(height/2);dy<=2;dy++){
        const rad=Math.max(0,Math.ceil((2-dy)/2));
        for(let dx=-rad;dx<=rad;dx++)for(let dz=-rad;dz<=rad;dz++)
          if(Math.abs(dx)+Math.abs(dz)<=rad+1)put(ax+dx,top+dy,az+dz,B.LEAVES);
      }
    }else{
      // Copa de roble de 5–7 bloques de ancho, con capas redondeadas e irregulares.
      for(let dy=-2;dy<=2;dy++){
        const rad=(dy===-2||dy===2)?1:2;
        for(let dx=-rad;dx<=rad;dx++)for(let dz=-rad;dz<=rad;dz++){
          const corner=Math.abs(dx)===rad&&Math.abs(dz)===rad;
          if(!(corner&&hash2(ax+dx,az+dz,dy+31)<.62))put(ax+dx,top+dy,az+dz,B.LEAVES);
        }
      }
    }
  }
  for(const [k,id] of mods){const [x,y,z]=k.split(',').map(Number),p=loc(x,z);
    if(p.cx===cx&&p.cz===cz&&y>=0&&y<WY){const i=chunkIndex(p.lx,y,p.lz);ch.originals.set(i,ch.blocks[i]);ch.blocks[i]=id;}}
  for(let z=0;z<CH;z++)for(let x=0;x<CH;x++){let h=-1;
    for(let y=WY-1;y>=0;y--){const b=ch.blocks[chunkIndex(x,y,z)];if(b!==B.AIR&&b!==B.WATER){h=y;break;}}
    ch.heightmap[z*CH+x]=h;
  }
}
registerChunkHandlers(generateChunk, ch => buildChunkMesh(ch));
export function findSpawn() {
  for(let r=0;r<64;r++)for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
    if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;
    const x=dx,z=dz,h=getHeight(x,z),top=getBlock(x,h,z);
    if(h>SEA&&!isLeaves(top)&&top!==B.CACTUS&&getBlock(x,h+1,z)===B.AIR&&getBlock(x,h+2,z)===B.AIR)
      return {x:x+.5,y:h+1,z:z+.5};
  }
  return {x:.5,y:WY-5,z:.5};
}

// ============================ MALLADO POR CHUNKS ============================
const FACES = [
  { d: [-1, 0, 0], c: [[0,1,0,0,1],[0,0,0,0,0],[0,1,1,1,1],[0,0,1,1,0]] },
  { d: [ 1, 0, 0], c: [[1,1,1,0,1],[1,0,1,0,0],[1,1,0,1,1],[1,0,0,1,0]] },
  { d: [ 0,-1, 0], c: [[1,0,1,1,0],[0,0,1,0,0],[1,0,0,1,1],[0,0,0,0,1]] },
  { d: [ 0, 1, 0], c: [[0,1,1,1,1],[1,1,1,0,1],[0,1,0,1,0],[1,1,0,0,0]] },
  { d: [ 0, 0,-1], c: [[1,0,0,0,0],[0,0,0,1,0],[1,1,0,0,1],[0,1,0,1,1]] },
  { d: [ 0, 0, 1], c: [[0,0,1,0,0],[1,0,1,1,0],[0,1,1,0,1],[1,1,1,1,1]] }
];
const AO_CURVE = [0.5, 0.68, 0.84, 1.0], UV_EPS = 0.06;
export const solidMat = new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true, alphaTest: .5, side: THREE.DoubleSide });
export const waterMat = new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true, transparent: true, opacity: .82, depthWrite: false, side: THREE.DoubleSide });
export const glassMat = new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true, transparent: true, opacity: .88, alphaTest: .05, depthWrite: false, side: THREE.DoubleSide });
function lightAt(x,y,z) {
  const p=loc(x,z),ch=getChunk(p.cx,p.cz);
  return !ch||y>ch.heightmap[p.lz*CH+p.lx]?1:.55;
}
function aoAt(x,y,z,d,c) {
  const ax=d[0]?0:d[1]?1:2,u=(ax+1)%3,v=(ax+2)%3,bp=[x+d[0],y+d[1],z+d[2]];
  const su=c[u]?1:-1,sv=c[v]?1:-1,p1=bp.slice(),p2=bp.slice(),p3=bp.slice();
  p1[u]+=su;p2[v]+=sv;p3[u]+=su;p3[v]+=sv;
  const s1=occl(peekMeshBlock(...p1))?1:0,s2=occl(peekMeshBlock(...p2))?1:0,s3=occl(peekMeshBlock(...p3))?1:0;
  return s1&&s2?0:3-(s1+s2+s3);
}
export function buildChunkMesh(chunkOrX, cz) {
  const ch=typeof chunkOrX==='number'?getChunk(chunkOrX,cz):chunkOrX;
  if(!ch)return;
  if(!ch.wantMesh){Object.values(ch.meshes).forEach(m=>{if(m){m.parent?.remove(m);m.geometry.dispose();}});ch.meshes={solid:null,water:null,glass:null};return;}
  const S={p:[],n:[],u:[],c:[],i:[]}, W={p:[],n:[],u:[],c:[],i:[]}, G={p:[],n:[],u:[],c:[],i:[]};
  const x0=ch.cx*CH,z0=ch.cz*CH;
  for(let y=0;y<WY;y++)for(let z=0;z<CH;z++)for(let x=0;x<CH;x++){
    const b=ch.blocks[chunkIndex(x,y,z)];if(!b)continue;
    const A=b===B.WATER?W:b===B.GLASS?G:S,def=BD[b],gx=x0+x,gz=z0+z;
    for(let f=0;f<6;f++){
      const F=FACES[f],nx=gx+F.d[0],ny=y+F.d[1],nz=gz+F.d[2];if(ny<0||ny>=WY)continue;
      const nb=peekMeshBlock(nx,ny,nz);
      if(b===B.WATER){if(nb===B.WATER||isOpaque(nb))continue;}
      else if(isLeaves(b)){if(isLeaves(nb)||isOpaque(nb))continue;}
      else if(b===B.GLASS){if(nb===B.GLASS||isOpaque(nb))continue;}
      else if(isOpaque(nb)||nb===B.GLASS)continue;
      const tile=f===3?def.t[0]:f===2?def.t[2]:def.t[1],base=A.p.length/3,ao=[3,3,3,3];
      for(let k=0;k<4;k++){const c=F.c[k];A.p.push(x+c[0],y+c[1],z+c[2]);A.n.push(...F.d);
        A.u.push((tile+(c[3]?1-UV_EPS:UV_EPS))/(TILES+1),(c[4]?1-UV_EPS:UV_EPS)/16);
        if(b!==B.WATER&&b!==B.GLASS&&!isLeaves(b))ao[k]=aoAt(gx,y,gz,F.d,c);
        const s=AO_CURVE[ao[k]]*lightAt(nx,ny,nz);A.c.push(s,s,s);}
      if(ao[0]+ao[3]>ao[1]+ao[2])A.i.push(base,base+1,base+3,base,base+3,base+2);
      else A.i.push(base,base+1,base+2,base+2,base+1,base+3);
    }
  }
  const make=(A,mat,old)=>{if(old){old.parent?.remove(old);old.geometry.dispose();}if(!A.i.length)return null;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(A.p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(A.n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(A.u,2));
    g.setAttribute('color',new THREE.Float32BufferAttribute(A.c,3));g.setIndex(A.i);g.computeBoundingSphere();
    const m=new THREE.Mesh(g,mat);m.position.set(x0,0,z0);m.castShadow=mat===solidMat;m.receiveShadow=false;if(mat!==solidMat)m.renderOrder=1;worldGroup.add(m);return m;};
  ch.meshes.solid=make(S,solidMat,ch.meshes.solid);ch.meshes.water=make(W,waterMat,ch.meshes.water);
  ch.meshes.glass=make(G,glassMat,ch.meshes.glass);ch.dirty=false;
}
export const buildChunkMeshAt = buildChunkMesh;
export function markDirty(x,z){
  const cx=Math.floor(x/CH),cz=Math.floor(z/CH),lx=x-cx*CH,lz=z-cz*CH;
  markChunkDirty(cx,cz);if(lx===0)markChunkDirty(cx-1,cz);if(lx===CH-1)markChunkDirty(cx+1,cz);
  if(lz===0)markChunkDirty(cx,cz-1);if(lz===CH-1)markChunkDirty(cx,cz+1);
}
export function setBlock(x,y,z,b){
  if(y<0||y>=WY)return;
  if(activeDimension==='end'){setEndBlock(x,y,z,b);return;}
  const p=loc(x,z),ch=ensureChunkLoaded(p.cx,p.cz),i=chunkIndex(p.lx,y,p.lz),old=ch.blocks[i];
  if(old===b)return;
  if(old===B.FURNACE)furnaceState.delete(keyOf(x,y,z));
  if(old===B.CHEST)chestState.delete(keyOf(x,y,z));
  if(!ch.originals.has(i))ch.originals.set(i,old);
  ch.blocks[i]=b;
  if(ch.originals.get(i)===b){ch.originals.delete(i);clearModAt(x,y,z);}
  else recordBlockChange(x,y,z,b);
  markDirty(x,z);
  if(y>=ch.heightmap[p.lz*CH+p.lx]&&b!==B.AIR&&b!==B.WATER)ch.heightmap[p.lz*CH+p.lx]=y;
  else if(y===ch.heightmap[p.lz*CH+p.lx]){let h=y-1;while(h>=0&&(ch.blocks[chunkIndex(p.lx,h,p.lz)]===B.AIR||ch.blocks[chunkIndex(p.lx,h,p.lz)]===B.WATER))h--;ch.heightmap[p.lz*CH+p.lx]=h;}
}
export const flushChunkMeshes = buildDirtyMeshes;

// ============================ PARTÍCULAS ============================
const PMAX = 300;
export const particles = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.1, 0.1, 0.1),
  new THREE.MeshLambertMaterial({ color: 0xffffff }),
  PMAX
);
const pData = [];
{
  dummy.position.set(0, -999, 0);
  dummy.scale.setScalar(0);
  dummy.updateMatrix();
  for (let i = 0; i < PMAX; i++) {
    particles.setMatrixAt(i, dummy.matrix);
    particles.setColorAt(i, new THREE.Color(1, 1, 1));
    pData.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() });
  }
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.frustumCulled = false;
  scene.add(particles);
}
let pNext = 0;
export function spawnParticles(pos, color, n, spread = 1) {
  if (!color || typeof color.clone !== 'function') color = new THREE.Color(0x808080);
  for (let k = 0; k < n; k++) {
    const d = pData[pNext];
    d.life = 0.6 + Math.random() * 0.5;
    d.p.set(
      pos.x + (Math.random() - 0.5) * spread,
      pos.y + (Math.random() - 0.5) * spread,
      pos.z + (Math.random() - 0.5) * spread
    );
    d.v.set((Math.random() - 0.5) * 4, Math.random() * 4 + 1, (Math.random() - 0.5) * 4);
    const c = color.clone().multiplyScalar(0.8 + Math.random() * 0.4);
    particles.setColorAt(pNext, c);
    pNext = (pNext + 1) % PMAX;
  }
  particles.instanceColor.needsUpdate = true;
}
export function updateParticles(dt) {
  for (let i = 0; i < PMAX; i++) {
    const d = pData[i];
    if (d.life <= 0) continue;
    d.life -= dt;
    d.v.y -= 14 * dt;
    d.p.addScaledVector(d.v, dt);
    if (solidAt(Math.floor(d.p.x), Math.floor(d.p.y), Math.floor(d.p.z))) {
      d.v.set(0, 0, 0);
    }
    dummy.position.copy(d.p);
    dummy.scale.setScalar(d.life > 0 ? Math.min(1, d.life * 2) : 0);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    if (d.life <= 0) {
      dummy.position.set(0, -999, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
    }
    particles.setMatrixAt(i, dummy.matrix);
  }
  particles.instanceMatrix.needsUpdate = true;
}
