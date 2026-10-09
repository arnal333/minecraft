// ============================================================================
// main.js — Bootstrap, primaryAction/secondaryAction, hooks, game loop
// ============================================================================
import * as THREE from 'three';
import {
  CH, WY, B, BD, I, ITEMS, tileAvg, mouse, loadResourcePackTextures
} from './nucleo.js';
import {
  flushChunkMeshes, updateParticles,
  spawnParticles, getBlock, setBlock, getFurnaceState, getChestState
} from './mundo.js';
import { updateChunkStreaming, processChunkQueue, ensureChunkLoaded } from './chunks.js';
import { loadState, saveState, registerPersistence } from './persistencia.js';
import { furnaceState, chestState } from './mundo.js';
import {
  scene, camera, renderer, updateSky, highlight, sunH, setTimeOfDay,
  timeOfDay, clockStr
} from './render.js';
import {
  player, hooks, EYE, inventory, addItem, getSelSlot,
  updatePlayer, updateHand, refreshHand,
  findSpawn, spawnPoint,
  raycastVoxel, rayAABB, viewDir, triggerSwing,
  getGameTime, tickGameTime, removeItem, eatFood, hurtPlayer, tickFurnaces
} from './entidades.js';
import {
  mobs, mobHooks, removeMob, damageMob, mobDeath,
  updateMob, updateArrows, updateDrops, trySpawn, trySpawnAnimals, spawnDrop
} from './mobs.js';
import {
  setupUI, setTable, setFurnace, setChest, renderFurnaceUI,
  renderHotbar, renderHearts, renderHunger, renderXP, renderInventoryUI,
  toast, addXP, updateToastVisual, tickToastTimer, getToastTimer,
  tickInfoTimer, resetInfoTimer, updateInfoPanel,
  isLocked, isCraftOpen
} from './interfaz.js';
import { initEnd, updateEnd, isEndActive, getEndSaveState, restoreEndState } from './end.js';
import { tryActivatePortal, isPortalActive, updatePortalCrossing, breakPortalFrame, getPortalSaveState, restorePortalState } from './portal.js';
import { firePlayerArrow, updatePlayerArrows } from './arco.js';

const $ = id => document.getElementById(id);
let testMode=false;

// ============================================================================
// ACCIONES DEL JUGADOR
// ============================================================================
function currentDamage() {
  const s = inventory[getSelSlot()];
  return s && ITEMS[s.id] && ITEMS[s.id].dmg ? ITEMS[s.id].dmg : 2;
}

function primaryAction() {
  triggerSwing();
  const selected=inventory[getSelSlot()];
  if(selected?.id===I.BOW){if(!firePlayerArrow())toast('Necesitas flechas');return;}
  if(isEndActive())return;
  const o = camera.position, d = viewDir();
  const hit = raycastVoxel(o, d, 6);

  let best = null, bestT = 3.6;
  for (const m of mobs) {
    if (m.dying) continue;
    const t = rayAABB(
      o, d,
      new THREE.Vector3(m.pos.x - m.w / 2, m.pos.y, m.pos.z - m.w / 2),
      new THREE.Vector3(m.pos.x + m.w / 2, m.pos.y + m.h, m.pos.z + m.w / 2)
    );
    if (t !== null && t < bestT) { bestT = t; best = m; }
  }
  if (best && (!hit || bestT < hit.dist)) {
    damageMob(best, currentDamage(), player.pos);
    return;
  }
  if (!hit) return;

  // La minería se procesa de forma continua en updateMining(dt).
  // El clic principal aquí solo golpea criaturas; los bloques ya no desaparecen al instante.
}

const BLOCK_MINING = {
  [B.GRASS]: { hardness: 0.6, tool: 'shovel', requiresTool: false },
  [B.DIRT]: { hardness: 0.5, tool: 'shovel', requiresTool: false },
  [B.STONE]: { hardness: 1.5, tool: 'pickaxe', requiresTool: true },
  [B.LOG]: { hardness: 2, tool: 'axe', requiresTool: false },
  [B.LEAVES]: { hardness: 0.2, tool: null, requiresTool: false },
  [B.PLANKS]: { hardness: 2, tool: 'axe', requiresTool: false },
  [B.SAND]: { hardness: 0.5, tool: 'shovel', requiresTool: false },
  [B.SNOW]: { hardness: 0.2, tool: 'shovel', requiresTool: true },
  [B.CACTUS]: { hardness: 0.4, tool: null, requiresTool: false },
  [B.CRAFTING_TABLE]: { hardness: 2.5, tool: 'axe', requiresTool: false },
  [B.IRON_ORE]: { hardness: 3, tool: 'pickaxe', requiresTool: true },
  [B.FURNACE]: { hardness: 3.5, tool: 'pickaxe', requiresTool: true },
  [B.CHEST]: { hardness: 2.5, tool: 'axe', requiresTool: false },
  [B.GLASS]: { hardness: 0.3, tool: null, requiresTool: false },
  [B.JUNGLE_GRASS]: { hardness: 0.6, tool: 'shovel', requiresTool: false },
  [B.SWAMP_GRASS]: { hardness: 0.6, tool: 'shovel', requiresTool: false },
  [B.TAIGA_GRASS]: { hardness: 0.6, tool: 'shovel', requiresTool: false },
  [B.JUNGLE_LEAVES]: { hardness: 0.2, tool: null, requiresTool: false },
  [B.PORTAL_FRAME]: { hardness: 50, tool: 'pickaxe', requiresTool: true },
  [B.END_STONE]: { hardness: 3, tool: 'pickaxe', requiresTool: true },
  [B.OBSIDIAN]: { hardness: 50, tool: 'pickaxe', requiresTool: true }
};

function selectedTool() {
  const stack = inventory[getSelSlot()];
  const id = stack?.id;
  if ([I.WPICK, I.SPICK, I.IPICK].includes(id)) return { type: 'pickaxe', speed: id === I.WPICK ? 2 : id === I.SPICK ? 4 : 6 };
  if ([I.WAXE, I.SAXE].includes(id)) return { type: 'axe', speed: id === I.WAXE ? 2 : 4 };
  if ([I.WSHOVEL, I.SSHOVEL].includes(id)) return { type: 'shovel', speed: id === I.WSHOVEL ? 2 : 4 };
  return { type: null, speed: 1 };
}

function miningDuration(blockId) {
  const spec = BLOCK_MINING[blockId] || { hardness: 1, tool: null, requiresTool: false };
  if (!Number.isFinite(spec.hardness) || spec.hardness <= 0) return 0.05;
  const tool = selectedTool();
  const correctTool = !!spec.tool && tool.type === spec.tool;
  // La dureza determina el tiempo a mano; las herramientas correctas aceleran.
  // Tierra, arena, pasto y madera no penalizan por romperse a mano.
  const canHarvest = !spec.requiresTool || correctTool;
  const base = spec.hardness * (canHarvest ? 1.5 : 5);
  const multiplier = correctTool ? tool.speed : 1;
  return Math.max(0.05, Math.ceil((base / multiplier) / 0.05) * 0.05);
}

let miningKey = '';
let miningElapsed = 0;
let miningToastKey = '';

function breakBlockAt(hit) {
  const def = BD[hit.b];
  if (!def || def.unbreakable) return;
  if (hit.b === B.PORTAL_FRAME) breakPortalFrame(hit.x, hit.y, hit.z);
  const dropPos = new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  let stored = [];
  if (hit.b === B.CHEST) stored = getChestState(hit.x, hit.y, hit.z);
  if (hit.b === B.FURNACE) {
    const furnace = getFurnaceState(hit.x, hit.y, hit.z);
    stored = [furnace.input, furnace.fuel, furnace.output];
  }
  for (const stack of stored) {
    if (stack && stack.id !== undefined && stack.count > 0)
      spawnDrop('item', stack.id, stack.count, dropPos.clone());
  }
  setBlock(hit.x, hit.y, hit.z, B.AIR);
  spawnParticles(
    new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5),
    tileAvg[def.t[1]] || new THREE.Color(0x808080), 14, 0.8
  );
  const drop = def.drop || hit.b;
  const left = addItem(drop, 1);
  if (left > 0)
    spawnDrop('item', drop, left, new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5));
}

function updateMining(dt) {
  if (!mouse.left || !isLocked() || player.dead || isCraftOpen() || isEndActive()) {
    miningKey = ''; miningElapsed = 0; miningToastKey = '';
    return;
  }
  const hit = raycastVoxel(camera.position, viewDir(), 6);
  if (!hit) { miningKey = ''; miningElapsed = 0; return; }
  const def = BD[hit.b];
  if (def?.unbreakable) {
    const key = `${hit.x},${hit.y},${hit.z}`;
    if (miningToastKey !== key) toast('La roca madre es indestructible');
    miningToastKey = key; miningKey = ''; miningElapsed = 0;
    return;
  }
  const key = `${hit.x},${hit.y},${hit.z}`;
  if (key !== miningKey) { miningKey = key; miningElapsed = 0; }
  miningElapsed += dt;
  if (miningElapsed >= miningDuration(hit.b)) {
    breakBlockAt(hit);
    miningKey = ''; miningElapsed = 0; miningToastKey = '';
  }
}

function secondaryAction() {
  const hit = raycastVoxel(camera.position, viewDir(), 6);
  const selected=inventory[getSelSlot()];
  if(hit?.b===B.PORTAL_FRAME&&selected?.id===I.TORCH){
    if(isPortalActive())return;
    if(tryActivatePortal(hit,selected.id))toast('¡Portal activado! Atraviésalo para entrar al End.');
    else toast('El portal necesita un marco completo de 3 × 3 bloques.');
    return;
  }
  if (hit && hit.b === B.CRAFTING_TABLE) {
    setTable(true);
    return;
  }
  if (hit && hit.b === B.FURNACE) {
    setFurnace(true, hit);
    return;
  }
  if (hit && hit.b === B.CHEST) {
    setChest(true, hit);
    return;
  }
  const s = inventory[getSelSlot()];
  if (!s) return;

  // Comer
  if (ITEMS[s.id] && ITEMS[s.id].food) {
    const ok = eatFood(ITEMS[s.id].food);
    if (!ok) { toast('No tienes hambre'); return; }
    removeItem(s.id, 1);
    triggerSwing();
    if(ITEMS[s.id].poisonChance&&Math.random()<ITEMS[s.id].poisonChance){hurtPlayer(2,null);toast('La carne cruda te cayó mal');}
    else toast(ITEMS[s.id].poisonChance?'Carne cruda: poca nutrición':'Ñam... ¡Delicioso!');
    return;
  }
  if(isEndActive())return;
  if (s.id >= 100) return;

  // Colocar bloque
  if (!hit) return;
  const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
  if (y < 0 || y >= WY) return;
  const cur = getBlock(x, y, z);
  if (cur !== 0 && cur !== B.WATER) return;

  const intersects = (e) =>
    x + 1 > e.pos.x - e.w / 2 && x < e.pos.x + e.w / 2 &&
    y + 1 > e.pos.y && y < e.pos.y + e.h &&
    z + 1 > e.pos.z - e.w / 2 && z < e.pos.z + e.w / 2;
  if (intersects(player) || mobs.some(intersects)) return;

  setBlock(x, y, z, s.id);
  s.count--;
  if (s.count <= 0) inventory[getSelSlot()] = null;
  triggerSwing();
  renderInventoryUI();
}

// ============================================================================
// HOOKS
// ============================================================================
Object.assign(hooks, {
  renderHearts,
  renderHunger,
  renderInventoryUI,
  renderHotbar,
  renderFurnaceUI,
  toast,
  spawnDrop
});

Object.assign(mobHooks, {
  addXP,
  getSunH: () => sunH,
  getGameTime
});

// ============================================================================
// LOOP
// ============================================================================
const clock = new THREE.Clock();
let fpsAcc = 0, fpsFrames = 0, fps = 60;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc >= 0.5) {
    fps = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
  }

  const active = isLocked() && !player.dead && !isCraftOpen();
  if (active) {
    tickGameTime(dt);
    updatePlayer(dt);

    if(!isEndActive()){
      for (let i = mobs.length - 1; i >= 0; i--) {
        const m = mobs[i];
        if (updateMob(m, dt)) { mobDeath(m); removeMob(i); continue; }
        if (m.pos.distanceTo(player.pos) > 64) removeMob(i);
      }
      updateArrows(dt);updateDrops(dt);trySpawn(dt);trySpawnAnimals(dt);updateSky(dt);
    }
    updatePlayerArrows(dt);updatePortalCrossing(dt);

    // Clic sostenido: el combate conserva su cadencia y la minería progresa cada frame.
    mouse.cdL -= dt;
    mouse.cdR -= dt;
    if (mouse.left  && mouse.cdL <= 0) { primaryAction();   mouse.cdL = 0.28; }
    if (mouse.right && mouse.cdR <= 0) { secondaryAction(); mouse.cdR = 0.25; }
    updateMining(dt);
  } else {
    updateMining(0);
    camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  }

  updateEnd(active?dt:0);
  tickFurnaces(dt);

  updateParticles(dt);
  updateHand(dt);

  if(!isEndActive()){updateChunkStreaming(player.pos);processChunkQueue(1);flushChunkMeshes();}

  const hit = raycastVoxel(camera.position, viewDir(), 6);
  if (hit && !player.dead) {
    highlight.visible = true;
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  } else {
    highlight.visible = false;
  }

  if (getToastTimer() > 0) { tickToastTimer(dt); updateToastVisual(); }
  if (tickInfoTimer(dt)) { resetInfoTimer(); updateInfoPanel(fps); }

  renderer.render(scene, camera);
}

// ============================================================================
// INIT
// ============================================================================
async function init() {
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = 'Cargando texturas de Minecraft...';
  try {
    const textureResult = await loadResourcePackTextures();
    console.info(`Texturas cargadas: ${textureResult.loaded}/${textureResult.total}`);
  } catch (error) {
    console.warn('Se usarán las texturas de respaldo:', error);
  }
  if (loading) loading.textContent = 'Generando mundo...';
  initEnd();
  registerPersistence(
    () => ({ player: { x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:player.yaw,pitch:player.pitch,health:player.health,hunger:player.hunger },
      inventory, chests:Object.fromEntries(chestState), furnaces:Object.fromEntries(furnaceState),
      timeOfDay, end:getEndSaveState(),portal:getPortalSaveState() }),
    data => {
      if(data.inventory) inventory.splice(0,inventory.length,...data.inventory);
      for(const [k,v] of Object.entries(data.chests||{}))chestState.set(k,v);
      for(const [k,v] of Object.entries(data.furnaces||{}))furnaceState.set(k,v);
      restoreEndState(data.end||{});restorePortalState(data.portal);
      if(Number.isFinite(data.timeOfDay)) setTimeOfDay(((data.timeOfDay % 1) + 1) % 1);
      if(data.player) {
        const p=data.player; player.pos.set(p.x||0,p.y||0,p.z||0);
        player.yaw=p.yaw||0; player.pitch=p.pitch||0;
        if(Number.isFinite(p.health))player.health=p.health;
        if(Number.isFinite(p.hunger))player.hunger=p.hunger;
      }
    }
  );
  testMode=new URLSearchParams(location.search).has('endtest');
  const saved=testMode?null:loadState();
  if(testMode){restoreEndState({});restorePortalState(null);}
  if(testMode){
    inventory.fill(null);
    [[B.STONE,64],[B.FURNACE,1],[B.CRAFTING_TABLE,1],[B.PORTAL_FRAME,16],[I.TORCH,4],
      [I.BOW,1],[I.ARROW,64],[I.ISWORD,1],[I.BEEF_COOKED,64],[I.BURNT_ROCK,32],
      [I.COAL,32],[I.STICK,16],[I.WOOL,3],[I.FEATHER,16]].forEach(([id,count],i)=>inventory[i]={id,count});
  }
  spawnPoint.copy(findSpawn());
  if(!saved?.player){player.pos.copy(spawnPoint);player.yaw=Math.PI*.25;player.pitch=-.15;}
  else spawnPoint.copy(player.pos);
  player.fallStart = player.pos.y;
  const pcx=Math.floor(player.pos.x/CH),pcz=Math.floor(player.pos.z/CH);
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)ensureChunkLoaded(pcx+dx,pcz+dz);
  updateChunkStreaming(player.pos);

  if(!isEndActive())updateSky(0);
  renderHearts();
  renderHunger();
  renderXP();
  renderHotbar();
  refreshHand();

  setupUI({
    onPrimary: primaryAction,
    onSecondary: secondaryAction,
    onAdvanceTime: () => {
      if(isEndActive())return;
      setTimeOfDay((timeOfDay + 0.08) % 1);
      updateSky(0);
      toast('Hora: ' + clockStr());
    }
  });
  if(testMode)$('menuSub').textContent='MODO PRUEBA · portal, arco, flechas y equipo en inventario';

  window.__minecraft_getTime = () => timeOfDay;
  window.__minecraft = {
    player, mobs, inventory, addItem,
    getBlock, setBlock,
    setTime: t => { setTimeOfDay(t); if(!isEndActive())updateSky(0); }
  };

  $('loading').classList.add('hidden');
  if(!testMode){
    window.addEventListener('beforeunload',()=>saveState());
    setInterval(()=>saveState(),15000);
    window.addEventListener('pagehide',()=>saveState());
  }
  loop();
}

setTimeout(init, 30);
