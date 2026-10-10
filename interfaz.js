// ============================================================================
// interfaz.js — HUD, menús, input, panel de crafteo
// ============================================================================
import {
  clamp, HEARTS, HUNGER_ICONS, iconFor, itemName, keys, mouse,
  SMELTING, stackMax
} from './nucleo.js';
import { BIOMES, getBiome, getFurnaceState, getChestState } from './mundo.js';
import { activeDimension } from './dimensiones.js';
import { renderer, clockStr, sunH, setTimeOfDay, updateSky } from './render.js';
import {
  player, inventory, getSelSlot, setSelSlot,
  refreshHand, craft, craftTable, RECIPES, TABLE_RECIPES, canCraft, respawn,
  moveInventoryToFurnace, takeFurnaceSlot, addItem
} from './entidades.js';
import { mobs } from './mobs.js';

const $ = id => document.getElementById(id);

// ============================ ESTADO DE UI ============================
let locked = false;
let craftOpen = false;
let tableOpen = false;
let furnaceOpen = false;
let chestOpen = false;
let furnacePos = null;
let chestPos = null;
let furnaceTarget = 'input';
let started = false;
let pickSlot = -1;
let toastTimer = 0;
let lastHand = '';
let infoT = 0;

export const isLocked = () => locked;
export const isCraftOpen = () => craftOpen || tableOpen || furnaceOpen || chestOpen;
export const isStarted = () => started;
export const getToastTimer = () => toastTimer;
export const tickToastTimer = dt => { toastTimer -= dt; };
export const tickInfoTimer = dt => { infoT -= dt; return infoT <= 0; };
export const resetInfoTimer = () => { infoT = 0.25; };

// ============================ CALLBACKS EXTERNOS ============================
const cb = {
  onPrimary: () => {},
  onSecondary: () => {},
  onRespawnCleanup: () => {}
};

// ============================ HOTBAR ============================
const hotbarEl = $('hotbar');
for (let i = 0; i < 9; i++) {
  const d = document.createElement('div');
  d.className = 'slot';
  hotbarEl.appendChild(d);
}
function slotHTML(s) {
  if (!s) return '';
  return `<img src="${iconFor(s.id)}">${s.count > 1 ? `<span class="cnt">${s.count}</span>` : ''}`;
}
export function renderHotbar() {
  const sel = getSelSlot();
  for (let i = 0; i < 9; i++) {
    const el = hotbarEl.children[i];
    el.className = 'slot' + (i === sel ? ' sel' : '');
    el.innerHTML = slotHTML(inventory[i]);
  }
  const s = inventory[sel];
  const key = s ? s.id : 'none';
  if (key !== lastHand) { lastHand = key; refreshHand(); }
}

// ============================ CORAZONES Y XP ============================
// ============================ CORAZONES, HAMBRE Y XP ============================
export function renderHearts() {
  let html = '';
  for (let i = 0; i < 10; i++) {
    const v = player.health - i * 2;
    html += `<img src="${HEARTS[v >= 2 ? 2 : v === 1 ? 1 : 0]}">`;
  }
  $('hearts').innerHTML = html;
}
export function renderHunger() {
  let html = '';
  for (let i = 0; i < 10; i++) {
    const v = player.hunger - i * 2;
    html += `<img src="${HUNGER_ICONS[v >= 2 ? 2 : v === 1 ? 1 : 0]}">`;
  }
  $('hunger').innerHTML = html;
}
export function renderXP() {
  const need = 10 + player.level * 5;
  $('xpfill').style.width = (player.xp / need * 100) + '%';
  $('xplevel').textContent = player.level;
}
export function addXP(v) {
  player.xp += v;
  while (player.xp >= 10 + player.level * 5) {
    player.xp -= 10 + player.level * 5;
    player.level++;
    toast('¡Subiste a nivel ' + player.level + '!');
  }
  renderXP();
}
// ============================ TOAST ============================
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.style.opacity = 1;
  toastTimer = 2;
}
export function updateToastVisual() {
  if (toastTimer <= 0) $('toast').style.opacity = 0;
}

// ============================ PANEL DE CRAFTEO ============================
export function renderInventoryUI() {
  renderHotbar();
  if (tableOpen) renderTableRecipes();
  if (furnaceOpen) renderFurnaceInventory();
  if (chestOpen) renderChestInventory();
  if (!craftOpen) return;

  const rec = $('recipes');
  rec.innerHTML = '';
  RECIPES.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'recipe';
    const ing = r.in
      .map(([id, n]) => `<span class="ing"><img src="${iconFor(id)}" title="${itemName(id)}">x${n}</span>`)
      .join(' + ');
    div.innerHTML = `${ing}<span class="arrow">→</span><span class="ing"><img src="${iconFor(r.out[0])}">x${r.out[1]} ${itemName(r.out[0])}</span>`;
    const b = document.createElement('button');
    b.textContent = 'Craftear';
    b.disabled = !canCraft(r);
    b.onclick = () => craft(i);
    div.appendChild(b);
    rec.appendChild(div);
  });

  const fill = (el, from, to) => {
    el.innerHTML = '';
    for (let i = from; i < to; i++) {
      const d = document.createElement('div');
      d.className = 'slot' + (i === pickSlot ? ' pick' : '');
      d.innerHTML = slotHTML(inventory[i]);
      d.title = inventory[i] ? itemName(inventory[i].id) : '';
      d.onclick = () => {
        if (pickSlot < 0) {
          if (inventory[i]) pickSlot = i;
        } else {
          const t = inventory[i];
          inventory[i] = inventory[pickSlot];
          inventory[pickSlot] = t;
          pickSlot = -1;
        }
        renderInventoryUI();
      };
      el.appendChild(d);
    }
  };
  fill($('invgrid'), 9, 36);
  fill($('invhot'), 0, 9);
}

function renderTableRecipes() {
  const grid = $('tableRecipes');
  if (!grid) return;
  grid.innerHTML = '';
  TABLE_RECIPES.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'tableRecipe';
    const ingredients = r.in.map(([id, n]) =>
      `<span title="${itemName(id)}"><img src="${iconFor(id)}">×${n}</span>`
    ).join('');
    card.innerHTML = `<div class="tableIngredients">${ingredients}</div><span class="arrow">→</span><img class="tableOutput" src="${iconFor(r.out[0])}" title="${itemName(r.out[0])}">`;
    const button = document.createElement('button');
    button.textContent = itemName(r.out[0]);
    button.disabled = !canCraft(r);
    button.onclick = () => craftTable(i);
    card.appendChild(button);
    grid.appendChild(card);
  });
}

function renderFurnaceInventory() {
  const grid = $('furnaceInv');
  if (!grid || !furnacePos) return;
  grid.innerHTML = '';
  inventory.forEach((stack, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.innerHTML = slotHTML(stack);
    slot.title = stack ? itemName(stack.id) : '';
    slot.onclick = () => {
      if (!moveInventoryToFurnace(furnacePos, i, furnaceTarget))
        toast(furnaceTarget === 'input' ? 'Ese objeto no se puede fundir' : 'Ese objeto no sirve de combustible');
    };
    grid.appendChild(slot);
  });
}

export function renderFurnaceUI(pos, state = getFurnaceState(pos.x, pos.y, pos.z)) {
  if (!furnaceOpen || !furnacePos || pos.x !== furnacePos.x || pos.y !== furnacePos.y || pos.z !== furnacePos.z) return;
  const drawSlot = (id, stack, action) => {
    const el = $(id);
    el.className = 'slot machineSlot';
    el.innerHTML = slotHTML(stack);
    el.title = stack ? itemName(stack.id) : '';
    el.onclick = action;
  };
  drawSlot('furnaceInput', state.input, () => state.input
    ? takeFurnaceSlot(furnacePos, 'input') : setFurnaceTarget('input'));
  drawSlot('furnaceFuel', state.fuel, () => state.fuel
    ? takeFurnaceSlot(furnacePos, 'fuel') : setFurnaceTarget('fuel'));
  drawSlot('furnaceOutput', state.output, () => takeFurnaceSlot(furnacePos, 'output'));
  $('furnaceInputTarget').classList.toggle('active', furnaceTarget === 'input');
  $('furnaceFuelTarget').classList.toggle('active', furnaceTarget === 'fuel');
  const recipe = state.input && SMELTING.find(r => r.in === state.input.id);
  $('smeltProgress').style.width = (recipe ? Math.min(100, state.progress / recipe.time * 100) : 0) + '%';
  $('fuelLevel').style.height = (state.fuelMax ? Math.min(100, state.fuelLeft / state.fuelMax * 100) : 0) + '%';
  const full = recipe && state.output && (state.output.id !== recipe.out || state.output.count >= stackMax(recipe.out));
  $('furnaceStatus').textContent = !recipe ? 'Coloca un material fundible'
    : full ? 'Retira el resultado'
    : state.fuelLeft <= 0 && !state.fuel ? 'Falta combustible'
    : `Fundiendo: ${itemName(recipe.out)}`;
}

function setFurnaceTarget(slot) {
  furnaceTarget = slot;
  renderFurnaceUI(furnacePos);
}

function renderChestInventory() {
  const grid = $('chestInv');
  if (!grid || !chestPos) return;
  grid.innerHTML = '';
  inventory.forEach((stack, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.innerHTML = slotHTML(stack);
    slot.title = stack ? itemName(stack.id) : '';
    slot.onclick = () => moveInventoryToChest(i);
    grid.appendChild(slot);
  });
}

function renderChestSlots() {
  const grid = $('chestSlots');
  if (!grid || !chestPos) return;
  const contents = getChestState(chestPos.x, chestPos.y, chestPos.z);
  grid.innerHTML = '';
  contents.forEach((stack, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.innerHTML = slotHTML(stack);
    slot.title = stack ? itemName(stack.id) : '';
    slot.onclick = () => moveChestToInventory(i);
    grid.appendChild(slot);
  });
}

function moveInventoryToChest(index) {
  const stack = inventory[index];
  if (!stack || !chestPos) return;
  const contents = getChestState(chestPos.x, chestPos.y, chestPos.z);
  let count = stack.count;
  for (const target of contents) {
    if (!target || target.id !== stack.id || target.count >= stackMax(stack.id)) continue;
    const amount = Math.min(count, stackMax(stack.id) - target.count);
    target.count += amount; count -= amount;
    if (!count) break;
  }
  for (let i = 0; i < contents.length && count; i++) {
    if (contents[i]) continue;
    const amount = Math.min(count, stackMax(stack.id));
    contents[i] = { id: stack.id, count: amount }; count -= amount;
  }
  if (count === stack.count) return;
  stack.count = count;
  if (!count) inventory[index] = null;
  renderInventoryUI(); renderChestSlots();
}

function moveChestToInventory(index) {
  if (!chestPos) return;
  const contents = getChestState(chestPos.x, chestPos.y, chestPos.z);
  const stack = contents[index];
  if (!stack) return;
  const left = addItem(stack.id, stack.count);
  if (left === stack.count) return;
  if (left) stack.count = left;
  else contents[index] = null;
  renderChestSlots();
}

// ============================ SELECCIÓN DE SLOT ============================
export function selectSlot(i) {
  setSelSlot((i + 9) % 9);
  renderHotbar();
  const s = inventory[getSelSlot()];
  if (s) toast(itemName(s.id));
}

// ============================ POINTER LOCK Y CRAFT ============================
export function requestLock() {
  try {
    const r = renderer.domElement.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch (e) {}
}
export function setCraft(open) {
  craftOpen = open;
  tableOpen = false;
  furnaceOpen = false; chestOpen = false;
  pickSlot = -1;
  $('craft').classList.toggle('hidden', !open);
  $('table').classList.add('hidden');
  $('furnace').classList.add('hidden'); $('chest').classList.add('hidden');
  if (open) {
    if (document.pointerLockElement) document.exitPointerLock();
    renderInventoryUI();
  } else {
    requestLock();
  }
}
export function setTable(open) {
  tableOpen = open;
  craftOpen = false;
  furnaceOpen = false; chestOpen = false;
  pickSlot = -1;
  $('craft').classList.add('hidden');
  $('table').classList.toggle('hidden', !open);
  $('furnace').classList.add('hidden'); $('chest').classList.add('hidden');
  if (open) {
    if (document.pointerLockElement) document.exitPointerLock();
    renderTableRecipes();
  } else {
    requestLock();
  }
}
export function setFurnace(open, pos = null) {
  furnaceOpen = open; chestOpen = false; craftOpen = false; tableOpen = false;
  furnacePos = open ? { x: pos.x, y: pos.y, z: pos.z } : null;
  furnaceTarget = 'input';
  $('craft').classList.add('hidden'); $('table').classList.add('hidden'); $('chest').classList.add('hidden');
  $('furnace').classList.toggle('hidden', !open);
  if (open) {
    if (document.pointerLockElement) document.exitPointerLock();
    renderFurnaceInventory();
    renderFurnaceUI(furnacePos);
  } else requestLock();
}
export function setChest(open, pos = null) {
  chestOpen = open; furnaceOpen = false; craftOpen = false; tableOpen = false;
  chestPos = open ? { x: pos.x, y: pos.y, z: pos.z } : null;
  $('craft').classList.add('hidden'); $('table').classList.add('hidden'); $('furnace').classList.add('hidden');
  $('chest').classList.toggle('hidden', !open);
  if (open) {
    if (document.pointerLockElement) document.exitPointerLock();
    renderChestInventory(); renderChestSlots();
  } else requestLock();
}

// ============================ PANEL INFO (esquina superior) ============================
export function updateInfoPanel(fps) {
  const bx = Math.floor(player.pos.x);
  const bz = Math.floor(player.pos.z);
  const zombies  = mobs.filter(m => m.type === 'zombie').length;
  const archers  = mobs.filter(m => m.type === 'skeleton').length;
  const animals  = mobs.filter(m => m.passive).length;
  const night    = sunH < -0.05 ? ' (noche)' : '';
  const swim     = player.inWater ? '\nBajo el agua' : '';
  $('info').textContent =
`FPS: ${fps}
VERSIÓN: v.0.0.6
XYZ: ${player.pos.x.toFixed(1)} / ${player.pos.y.toFixed(1)} / ${player.pos.z.toFixed(1)}
Bioma: ${activeDimension==='end'?'The End':BIOMES[getBiome(bx,bz)]}
Hora: ${clockStr()}${night}${swim}
Vida: ${player.health}/${player.maxHealth}  Hambre: ${player.hunger}/${player.maxHunger}
Enemigos: ${zombies} zombis, ${archers} arqueros · Animales: ${animals}`;
}

// ============================ SETUP DE EVENTOS ============================
export function setupUI(callbacks = {}) {
  Object.assign(cb, callbacks);

  // Pointer lock
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === renderer.domElement;
    if (locked) {
      $('menu').classList.add('hidden');
    } else {
      mouse.left = mouse.right = false;
      for (const k in keys) keys[k] = false;
      if (!isCraftOpen() && !player.dead && started) {
        $('menuSub').textContent = 'Pausa';
        $('playBtn').textContent = 'Continuar';
        $('menu').classList.remove('hidden');
      }
    }
  });

  // Botones del menú y game over
  $('playBtn').onclick = () => { started = true; requestLock(); };
  $('tableClose').onclick = () => setTable(false);
  $('furnaceClose').onclick = () => setFurnace(false);
  $('chestClose').onclick = () => setChest(false);
  $('furnaceInputTarget').onclick = () => setFurnaceTarget('input');
  $('furnaceFuelTarget').onclick = () => setFurnaceTarget('fuel');
  $('furnace').onclick = e => { if (e.target.id === 'furnace') setFurnace(false); };
  $('chest').onclick = e => { if (e.target.id === 'chest') setChest(false); };
  $('respawnBtn').onclick = () => {
    respawn();
    cb.onRespawnCleanup();
    $('gameover').classList.add('hidden');
    requestLock();
  };

  // Click en el canvas para recuperar el lock
  renderer.domElement.addEventListener('click', () => {
    if (!locked && started && !isCraftOpen() && !player.dead) requestLock();
  });

  // Mouse
  document.addEventListener('mousemove', e => {
    if (!locked) return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch -= e.movementY * 0.0022;
    player.pitch = clamp(player.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  });
  document.addEventListener('mousedown', e => {
    if (!locked || player.dead) return;
    if (e.button === 0) { mouse.left = true;  cb.onPrimary();   mouse.cdL = 0.28; }
    if (e.button === 2) { mouse.right = true; cb.onSecondary(); mouse.cdR = 0.25; }
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('wheel', e => {
    if (!locked) return;
    selectSlot(getSelSlot() + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });

  // Teclado
  document.addEventListener('keydown', e => {
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyC' && started && !player.dead && locked) {
      cb.onToggleCreative?.();
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyE' && started && !player.dead) {
      if (tableOpen) setTable(false);
      else if (furnaceOpen) setFurnace(false);
      else if (chestOpen) setChest(false);
      else setCraft(!craftOpen);
      return;
    }
    if (e.code === 'Escape' && isCraftOpen()) {
      if (tableOpen) setTable(false);
      else if (furnaceOpen) setFurnace(false);
      else if (chestOpen) setChest(false);
      else setCraft(false);
      return;
    }
    if (!locked) return;
    keys[e.code] = true;
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= 9) selectSlot(n - 1);
    }
    if (e.code === 'KeyT') {
      // T adelanta el tiempo ~2h y refresca el cielo al instante
      setTimeOfDay((((window.__minecraft_getTime ? window.__minecraft_getTime() : 0) + 0.08) % 1 + 1) % 1);
      if(activeDimension!=='end')updateSky(0);
    }
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });
}
