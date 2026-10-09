// ============================================================================
// mobs.js — Zombis, arqueros, flechas, drops
// ============================================================================
import * as THREE from 'three';
import {
  MAX_ENTITIES, MAX_ANIMALS, WY,
  B, BD, I, clamp, lerpAngle, isLeaves,
  zSkin, zFace, zShirt, zPants, sBone, sFace, sTorso,
  tileTex, itemTex, cowSkin, cowFace, pigSkin, pigFace,
  sheepWool, sheepFace, chickenSkin, chickenFace
} from './nucleo.js';
import { scene, camera } from './render.js';
import {
  getBlock, getHeight, getBiome, solidAt, spawnParticles
} from './mundo.js';
import {
  player, hurtPlayer, moveEntity, raycastVoxel, addItem
} from './entidades.js';

// ============================ HOOKS (los rellena main.js) ============================
export const mobHooks = {
  addXP: () => {},
  getSunH: () => 0,
  getGameTime: () => 0
};

// ============================ GEOMETRÍAS COMPARTIDAS ============================
const GEO = {
  head:      new THREE.BoxGeometry(0.5, 0.5, 0.5),
  torso:     new THREE.BoxGeometry(0.5, 0.75, 0.25),
  limb:      new THREE.BoxGeometry(0.25, 0.75, 0.25),
  thin:      new THREE.BoxGeometry(0.13, 0.75, 0.13),
  bowA:      new THREE.BoxGeometry(0.05, 0.5, 0.05),
  bowS:      new THREE.BoxGeometry(0.02, 0.8, 0.02),
  bar:       new THREE.PlaneGeometry(0.8, 0.1),
  barFg:     new THREE.PlaneGeometry(0.76, 0.06),
  arrow:     new THREE.BoxGeometry(0.05, 0.05, 0.6),
  xp:        new THREE.IcosahedronGeometry(0.1, 0),
  dropCube:  new THREE.BoxGeometry(0.25, 0.25, 0.25),
  dropPlane: new THREE.PlaneGeometry(0.4, 0.4),
  animalDetail: new THREE.BoxGeometry(.16,.12,.1),
  chickenBeak: new THREE.BoxGeometry(.18,.12,.22),
  chickenComb: new THREE.BoxGeometry(.16,.16,.1)
};
const ANIMAL_GEO = {
  cow: { body:new THREE.BoxGeometry(1.1,.78,.78), head:new THREE.BoxGeometry(.52,.55,.52), leg:new THREE.BoxGeometry(.24,.62,.24), tail:new THREE.BoxGeometry(.09,.45,.09) },
  pig: { body:new THREE.BoxGeometry(.78,.58,1.02), head:new THREE.BoxGeometry(.48,.46,.48), leg:new THREE.BoxGeometry(.22,.38,.22), tail:new THREE.BoxGeometry(.08,.25,.08) },
  sheep: { body:new THREE.BoxGeometry(1.02,.82,.95), head:new THREE.BoxGeometry(.43,.48,.48), leg:new THREE.BoxGeometry(.17,.5,.17), tail:new THREE.BoxGeometry(.11,.22,.11) },
  chicken: { body:new THREE.BoxGeometry(.48,.5,.58), head:new THREE.BoxGeometry(.34,.34,.34), leg:new THREE.BoxGeometry(.09,.28,.09) }
};
const ANIMALS = new Set(['cow','pig','sheep','chicken']);
const barBgMat  = new THREE.MeshBasicMaterial({ color: 0x220000, side: THREE.DoubleSide });
const arrowMat  = new THREE.MeshLambertMaterial({ color: 0x8a6a3c });
const xpMat     = new THREE.MeshBasicMaterial({ color: 0xa8ff3e });
const bowMat    = new THREE.MeshLambertMaterial({ color: 0x7a5530 });

export const mobs = [], arrows = [], drops = [];
export function setMobsVisible(visible) {
  mobs.forEach(m=>m.group.visible=visible);
  arrows.forEach(a=>a.mesh.visible=visible);
  drops.forEach(d=>d.mesh.visible=visible);
}

// ============================ CREAR MOB ============================
function createAnimal(type,x,y,z) {
  const cfg={
    cow:{skin:cowSkin,face:cowFace,leg:cowSkin,w:1.4,h:1.4,speed:1.15,hp:10,bodyY:.78,headY:1.03,headZ:-.53,legY:.34,legX:.39,legZ:.25},
    pig:{skin:pigSkin,face:pigFace,leg:pigSkin,w:.9,h:.9,speed:1.55,hp:8,bodyY:.55,headY:.72,headZ:-.52,legY:.19,legX:.27,legZ:.33},
    sheep:{skin:sheepWool,face:sheepFace,leg:sBone,w:.9,h:1.3,speed:1.25,hp:9,bodyY:.72,headY:.94,headZ:-.55,legY:.25,legX:.34,legZ:.29},
    chicken:{skin:chickenSkin,face:chickenFace,leg:chickenFace,w:.4,h:.75,speed:2.1,hp:4,bodyY:.37,headY:.52,headZ:-.3,legY:.14,legX:.12,legZ:.14}
  }[type];
  const g=new THREE.Group(),bodyMat=new THREE.MeshLambertMaterial({map:cfg.skin}),headMat=new THREE.MeshLambertMaterial({map:cfg.face});
  const legMat=new THREE.MeshLambertMaterial({map:cfg.leg});
  const mats=[bodyMat,headMat,legMat];
  const body=new THREE.Mesh(ANIMAL_GEO[type].body,bodyMat);body.position.y=cfg.bodyY;g.add(body);
  const head=new THREE.Mesh(ANIMAL_GEO[type].head,headMat);head.position.set(0,cfg.headY,cfg.headZ);g.add(head);
  const legs=[];
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const pivot=new THREE.Group();pivot.position.set(sx*cfg.legX,cfg.legY,sz*cfg.legZ);
    const leg=new THREE.Mesh(ANIMAL_GEO[type].leg,legMat);leg.position.y=-ANIMAL_GEO[type].leg.parameters.height/2;
    pivot.add(leg);g.add(pivot);legs.push(pivot);
  }
  if(ANIMAL_GEO[type].tail){
    const tail=new THREE.Mesh(ANIMAL_GEO[type].tail,bodyMat);tail.position.set(0,cfg.bodyY+.08,.48);tail.rotation.x=-.6;g.add(tail);
  }
  if(type==='cow')for(const sx of [-1,1]){
    const horn=new THREE.Mesh(GEO.animalDetail,new THREE.MeshLambertMaterial({color:0xe3ddc8}));
    horn.position.set(sx*.22,cfg.headY+.32,cfg.headZ);g.add(horn);mats.push(horn.material);
  }
  if(type==='chicken'){
    const beakMat=new THREE.MeshLambertMaterial({color:0xe8ae32}),combMat=new THREE.MeshLambertMaterial({color:0xc93135});
    const beak=new THREE.Mesh(GEO.chickenBeak,beakMat);beak.position.set(0,cfg.headY-.04,cfg.headZ-.22);g.add(beak);
    const comb=new THREE.Mesh(GEO.chickenComb,combMat);comb.position.set(0,cfg.headY+.12,cfg.headZ);g.add(comb);mats.push(beakMat,combMat);
  }
  scene.add(g);
  const m={type,passive:true,group:g,head,legs,animLegs:legs,mats,pos:new THREE.Vector3(x,y,z),
    vel:new THREE.Vector3(),move:new THREE.Vector3(),knock:new THREE.Vector3(),w:cfg.w,h:cfg.h,
    onGround:false,hitWall:false,hp:cfg.hp,maxHp:cfg.hp,speed:cfg.speed,yaw:Math.random()*6.28,
    hurtCd:0,flash:0,burning:false,burnT:0,phase:0,wanderT:1+Math.random()*3,wanderDir:null,
    fleeT:0,fleeDir:new THREE.Vector3(),grazing:false,dying:false,deathT:0};
  mobs.push(m);return m;
}
export function createMob(type, x, y, z) {
  if(ANIMALS.has(type))return createAnimal(type,x,y,z);
  const Z = type === 'zombie';
  const lm = t => new THREE.MeshLambertMaterial({ map: t });
  const skin  = lm(Z ? zSkin  : sBone);
  const face  = lm(Z ? zFace  : sFace);
  const shirt = lm(Z ? zShirt : sTorso);
  const pants = lm(Z ? zPants : sBone);

  const g = new THREE.Group();
  const head = new THREE.Mesh(GEO.head, [skin, skin, skin, skin, face, skin]);
  head.position.y = 1.75;
  const torso = new THREE.Mesh(GEO.torso, shirt);
  torso.position.y = 1.125;

  const limbGeo = Z ? GEO.limb : GEO.thin;
  const mkLimb = (px, py, mat, off) => {
    const piv = new THREE.Group();
    piv.position.set(px, py, 0);
    const m = new THREE.Mesh(limbGeo, mat);
    m.position.y = off;
    piv.add(m);
    g.add(piv);
    return piv;
  };
  const armL = mkLimb(Z ?  0.375 :  0.33, 1.45, skin, -0.3);
  const armR = mkLimb(Z ? -0.375 : -0.33, 1.45, skin, -0.3);
  const legL = mkLimb( 0.125, 0.75, pants, -0.375);
  const legR = mkLimb(-0.125, 0.75, pants, -0.375);

  if (!Z) {
    const bow = new THREE.Group();
    const a1 = new THREE.Mesh(GEO.bowA, bowMat);
    a1.position.set(0, 0.2, 0.08);  a1.rotation.x = 0.5;
    const a2 = new THREE.Mesh(GEO.bowA, bowMat);
    a2.position.set(0, -0.2, 0.08); a2.rotation.x = -0.5;
    const st = new THREE.Mesh(GEO.bowS, new THREE.MeshBasicMaterial({ color: 0xdddddd }));
    st.position.set(0, 0, -0.03);
    bow.add(a1, a2, st);
    bow.position.set(0, -0.62, 0.05);
    bow.rotation.x = Math.PI / 2;
    armR.add(bow);
  }
  g.add(head, torso);

  const bar = new THREE.Group();
  bar.position.y = 2.25;
  const bg = new THREE.Mesh(GEO.bar, barBgMat);
  const fgMat = new THREE.MeshBasicMaterial({ color: 0x44dd33, side: THREE.DoubleSide });
  const fg = new THREE.Mesh(GEO.barFg, fgMat);
  fg.position.z = 0.002;
  bar.add(bg, fg);
  g.add(bar);

  g.scale.setScalar(0.95);
  scene.add(g);

  const maxHp = Z ? 20 : 16;
  const m = {
    type, group: g, head, armL, armR, legL, legR, bar, fg,
    mats: [skin, face, shirt, pants, fgMat],
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    move: new THREE.Vector3(),
    knock: new THREE.Vector3(),
    w: 0.6, h: 1.9, onGround: false, hitWall: false,
    hp: maxHp, maxHp,
    yaw: Math.random() * 6.28,
    atkCd: 0, shootCd: 1.5 + Math.random(),
    hurtCd: 0, flash: 0, burnT: 0, burning: false, phase: 0,
    wanderT: 0, wanderDir: null,
    strafe: Math.random() < 0.5 ? 1 : -1,
    dying: false, deathT: 0, aim: 0
  };
  mobs.push(m);
  return m;
}
export function removeMob(i) {
  const m = mobs[i];
  scene.remove(m.group);
  m.mats.forEach(mt => mt.dispose());
  m.group.traverse(o => {
    if (o.material && o.material !== bowMat
      && !Array.isArray(o.material)
      && o.material.type === 'MeshBasicMaterial'
      && o.material !== barBgMat) o.material.dispose();
  });
  mobs.splice(i, 1);
}
export function damageMob(m, dmg, src) {
  if (m.dying || m.hurtCd > 0) return;
  m.hp -= dmg;
  m.hurtCd = 0.35;
  m.flash = 0.25;
  spawnParticles(
    m.pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
    new THREE.Color(0.7, 0.05, 0.05), 6, 0.5
  );
  if (src) {
    const dx = m.pos.x - src.x, dz = m.pos.z - src.z;
    const l = Math.hypot(dx, dz) || 1;
    m.knock.set(dx / l * (m.passive ? 3.5 : 7), 0, dz / l * (m.passive ? 3.5 : 7));
    m.vel.y = m.passive ? 3.2 : 5.5;
    if(m.passive){m.fleeT=2;m.fleeDir.set(dx/l,0,dz/l);}
  }
  if (m.hp <= 0) {
    m.dying = true;
    m.deathT = 0;
    if (src === player.pos && !m.passive) player.kills++;
  }
}
export function mobDeath(m) {
  const c = m.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
  spawnParticles(c, new THREE.Color(0.85, 0.85, 0.85), 22, 1.2);
  if(m.passive){
    const loot={cow:[I.BEEF_RAW,1,3],pig:[I.PORK_RAW,1,3],sheep:[I.MUTTON_RAW,1,2],chicken:[I.CHICKEN_RAW,1,1]}[m.type];
    spawnDrop('item',loot[0],loot[1]+Math.floor(Math.random()*(loot[2]-loot[1]+1)),c);
    if(m.type==='sheep')spawnDrop('item',I.WOOL,1,c);
    if(m.type==='chicken')spawnDrop('item',I.FEATHER,1,c);
    return;
  }
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++)
    spawnDrop('xp', 0, 1 + Math.floor(Math.random() * 2), c);
  if (m.type === 'zombie') {
    if (Math.random() < 0.7)
      spawnDrop('item', I.FLESH, 1 + Math.floor(Math.random() * 2), c);
  } else {
    spawnDrop('item', I.BONE, 1 + Math.floor(Math.random() * 2), c);
  }
}

// ============================ FLECHAS ============================
export function hasLOS(from, to) {
  const d = to.clone().sub(from);
  const L = d.length();
  d.normalize();
  const h = raycastVoxel(from, d, L);
  return !h;
}
export function shootArrow(m) {
  const o = m.pos.clone().add(new THREE.Vector3(0, 1.45, 0));
  const target = player.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
  const d = target.clone().sub(o);
  const horiz = Math.hypot(d.x, d.z);
  const speed = 20;
  d.normalize();
  o.addScaledVector(d, 0.6);
  const vel = d.multiplyScalar(speed);
  const t = horiz / speed;
  vel.y += 0.5 * 12 * t;
  vel.x += (Math.random() - 0.5) * 1.2;
  vel.z += (Math.random() - 0.5) * 1.2;
  vel.y += (Math.random() - 0.5) * 0.8;
  const mesh = new THREE.Mesh(GEO.arrow, arrowMat);
  mesh.position.copy(o);
  scene.add(mesh);
  arrows.push({ mesh, pos: o, vel, stuck: false, life: 8 });
  m.aim = 0.35;
}
export function removeArrow(i) {
  scene.remove(arrows[i].mesh);
  arrows.splice(i, 1);
}
export function updateArrows(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.life -= dt;
    if (a.life <= 0) { removeArrow(i); continue; }
    if (a.stuck) continue;
    a.vel.y -= 12 * dt;
    const next = a.pos.clone().addScaledVector(a.vel, dt);
    if (solidAt(Math.floor(next.x), Math.floor(next.y), Math.floor(next.z))) {
      a.stuck = true;
      a.life = Math.min(a.life, 3);
      continue;
    }
    a.pos.copy(next);
    const p = player.pos;
    if (!player.dead
      && a.pos.x > p.x - 0.4 && a.pos.x < p.x + 0.4
      && a.pos.z > p.z - 0.4 && a.pos.z < p.z + 0.4
      && a.pos.y > p.y && a.pos.y < p.y + 1.85) {
      hurtPlayer(3, a.pos.clone().addScaledVector(a.vel, -0.1));
      removeArrow(i);
      continue;
    }
    a.mesh.position.copy(a.pos);
    a.mesh.lookAt(a.pos.clone().add(a.vel));
  }
}

// ============================ IA DE MOBS ============================
function updateAnimal(m,dt) {
  m.hurtCd-=dt;m.flash=Math.max(0,m.flash-dt);m.fleeT=Math.max(0,m.fleeT-dt);
  const dx=m.pos.x-player.pos.x,dz=m.pos.z-player.pos.z,dist=Math.hypot(dx,dz);
  let tx=0,tz=0,spd=0;
  if(!player.dead&&dist<8){
    const l=dist||1;m.fleeDir.set(dx/l,0,dz/l);tx=m.fleeDir.x;tz=m.fleeDir.z;spd=m.speed*1.5;m.fleeT=Math.max(m.fleeT,.2);
    m.grazing=false;
  }else if(m.fleeT>0){tx=m.fleeDir.x;tz=m.fleeDir.z;spd=3;m.grazing=false;}
  else {
    m.wanderT-=dt;
    if(m.wanderT<=0){m.wanderT=3+Math.random()*2;m.wanderDir=Math.random()<.34?null:Math.random()*Math.PI*2;
      m.grazing=(m.type==='cow'||m.type==='sheep')&&m.wanderDir===null;}
    if(m.wanderDir!==null){tx=Math.sin(m.wanderDir);tz=Math.cos(m.wanderDir);spd=m.speed*.55;}
  }
  if(spd>0)m.yaw=lerpAngle(m.yaw,Math.atan2(tx,tz),Math.min(1,dt*5));
  const acc=Math.min(1,8*dt);m.move.x+=(tx*spd-m.move.x)*acc;m.move.z+=(tz*spd-m.move.z)*acc;
  m.knock.multiplyScalar(Math.exp(-5*dt));
  const inWater=getBlock(Math.floor(m.pos.x),Math.floor(m.pos.y+.5),Math.floor(m.pos.z))===B.WATER;
  if(inWater)m.vel.y=Math.min(m.vel.y+30*dt,2.5);else m.vel.y=Math.max(m.vel.y-28*dt,-55);
  m.vel.x=m.move.x+m.knock.x;m.vel.z=m.move.z+m.knock.z;
  moveEntity(m,dt);
  if(m.hitWall&&m.onGround&&spd>0)m.vel.y=m.type==='chicken'?5.2:3.8;
  if(m.type==='chicken'&&m.onGround&&Math.random()<dt*.25)m.vel.y=4.2;
  if(m.hitWall)m.knock.set(0,0,0);
  const sw=Math.sin(m.phase+=Math.hypot(m.move.x,m.move.z)*dt*5)*.65;
  m.legs.forEach((leg,i)=>{leg.rotation.x=(i===0||i===3)?sw:-sw;});
  m.head.rotation.x=m.grazing?-.35:0;
  m.group.position.copy(m.pos);m.group.rotation.y=m.yaw;
  return false;
}

export function updateMob(m, dt) {
  const g = m.group;
  const gameTime = mobHooks.getGameTime();
  const sunH = mobHooks.getSunH();
  if (m.dying) {
    m.deathT += dt;
    g.rotation.z = Math.min(1, m.deathT / 0.4) * Math.PI / 2;
    m.mats.forEach(mt => { if (mt.emissive) mt.emissive.setRGB(0.6, 0, 0); });
    return m.deathT > 0.8;
  }
  if(m.passive)return updateAnimal(m,dt);
  m.hurtCd -= dt; m.atkCd -= dt; m.shootCd -= dt;
  m.flash -= dt; m.aim -= dt;
  const dx = player.pos.x - m.pos.x;
  const dz = player.pos.z - m.pos.z;
  const dy = player.pos.y - m.pos.y;
  const dist = Math.hypot(dx, dz);
  const detect = !player.dead && dist < 18 && Math.abs(dy) < 12;
  let tx = 0, tz = 0, spd = 0;
  if (detect) {
    const nx = dx / (dist || 1), nz = dz / (dist || 1);
    m.yaw = lerpAngle(m.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
    if (m.type === 'zombie') {
      tx = nx; tz = nz; spd = 2.3;
      if (dist < 1.0 && Math.abs(dy) < 1.6 && m.atkCd <= 0) {
        hurtPlayer(3, m.pos);
        m.atkCd = 1;
      }
    } else {
      if (dist > 11) { tx = nx; tz = nz; spd = 1.9; }
      else if (dist < 6) { tx = -nx; tz = -nz; spd = 1.6; }
      else {
        tx = -nz * m.strafe;
        tz =  nx * m.strafe;
        spd = 1.1;
        if (Math.random() < dt * 0.3) m.strafe *= -1;
      }
      if (m.shootCd <= 0 && dist < 16) {
        m.shootCd = 1.8 + Math.random() * 1.2;
        if (hasLOS(
          m.pos.clone().add(new THREE.Vector3(0, 1.5, 0)),
          camera.position.clone()
        )) shootArrow(m);
      }
    }
  } else {
    m.wanderT -= dt;
    if (m.wanderT <= 0) {
      m.wanderT = 2 + Math.random() * 4;
      m.wanderDir = Math.random() < 0.4 ? null : Math.random() * Math.PI * 2;
    }
    if (m.wanderDir !== null) {
      tx = Math.sin(m.wanderDir);
      tz = Math.cos(m.wanderDir);
      spd = 0.9;
      m.yaw = lerpAngle(m.yaw, m.wanderDir, Math.min(1, dt * 4));
    }
  }
  const acc = Math.min(1, 10 * dt);
  m.move.x += (tx * spd - m.move.x) * acc;
  m.move.z += (tz * spd - m.move.z) * acc;
  m.knock.multiplyScalar(Math.exp(-5 * dt));
  const inWater = getBlock(
    Math.floor(m.pos.x),
    Math.floor(m.pos.y + 0.5),
    Math.floor(m.pos.z)
  ) === B.WATER;
  if (inWater) m.vel.y = Math.min(m.vel.y + 30 * dt, 2.5);
  else m.vel.y = Math.max(m.vel.y - 28 * dt, -55);
  m.vel.x = m.move.x + m.knock.x;
  m.vel.z = m.move.z + m.knock.z;
  const wantJump = spd > 0;
  moveEntity(m, dt);
  if (m.hitWall && m.onGround && wantJump) m.vel.y = 8.2;
  if (m.hitWall) m.knock.set(0, 0, 0);
  // Quemarse con el sol
  const col = getHeight(Math.floor(m.pos.x), Math.floor(m.pos.z));
  m.burning = sunH > 0.15 && m.pos.y + 1.5 > col && !inWater;
  if (m.burning) {
    m.burnT += dt;
    if (m.burnT > 1) {
      m.burnT = 0;
      m.hurtCd = 0;
      damageMob(m, 2, null);
      if (Math.random() < 0.5)
        spawnParticles(
          m.pos.clone().add(new THREE.Vector3(0, 1.5, 0)),
          new THREE.Color(1, 0.5, 0.1), 4, 0.5
        );
    }
  }
  // Animación
  const hs = Math.hypot(m.move.x, m.move.z);
  m.phase += hs * dt * 4.5;
  const sw = Math.sin(m.phase) * 0.7 * Math.min(1, hs / 1.5);
  m.legL.rotation.x = sw;
  m.legR.rotation.x = -sw;
  if (m.type === 'zombie') {
    m.armL.rotation.x = -Math.PI / 2 + Math.sin(gameTime * 3) * 0.08 - (m.atkCd > 0.7 ? 0.4 : 0);
    m.armR.rotation.x = -Math.PI / 2 + Math.sin(gameTime * 3 + 1) * 0.08 - (m.atkCd > 0.7 ? 0.4 : 0);
  } else {
    const aimPose = detect ? -Math.PI / 2 : -sw * 0.8;
    m.armR.rotation.x = aimPose;
    m.armL.rotation.x = detect ? -Math.PI / 2 + (m.aim > 0 ? 0.3 : 0) : sw * 0.8;
    m.armL.rotation.y = detect ? -0.5 : 0;
  }
  const emi = m.flash > 0 ? [0.7, 0, 0] : m.burning ? [0.45, 0.18, 0] : [0, 0, 0];
  for (let i = 0; i < 4; i++) m.mats[i].emissive.setRGB(emi[0], emi[1], emi[2]);
  g.position.copy(m.pos);
  g.rotation.y = m.yaw;
  const r = Math.max(0, m.hp / m.maxHp);
  m.fg.scale.x = Math.max(0.001, r);
  m.fg.position.x = -(1 - r) * 0.38;
  m.fg.material.color.setRGB(1 - r, 0.2 + r * 0.7, 0.15);
  m.bar.quaternion.copy(g.quaternion).invert().multiply(camera.quaternion);
  return false;
}

// ============================ SPAWN ============================
let spawnTimer = 3;
export function trySpawn(dt) {
  spawnTimer -= dt;
  if (spawnTimer > 0) return;
  spawnTimer = 2.5;
  if (mobs.length >= MAX_ENTITIES || player.dead) return;
  const sunH = mobHooks.getSunH();
  const night = sunH < -0.05;
  for (let tries = 0; tries < 6; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = 12 + Math.random() * 18;
    const x = Math.floor(player.pos.x + Math.cos(a) * r);
    const z = Math.floor(player.pos.z + Math.sin(a) * r);
    let y = -1;
    if (night) {
      const h = getHeight(x,z);
      const top = getBlock(x,h,z);
      if (isLeaves(top) || top === B.CACTUS || getBlock(x, h + 1, z) === B.WATER) continue;
      y = h + 1;
    } else {
      const yy = Math.floor(player.pos.y) - 8 + Math.floor(Math.random() * 14);
      if (yy < 2 || yy >= WY - 2) continue;
      if (!(solidAt(x, yy - 1, z)
        && getBlock(x, yy, z) === 0
        && getBlock(x, yy + 1, z) === 0
        && yy + 2 < getHeight(x,z))) continue;
      y = yy;
    }
    if (getBlock(x, y, z) !== 0 || getBlock(x, y + 1, z) !== 0) continue;
    createMob(Math.random() < 0.6 ? 'zombie' : 'skeleton', x + 0.5, y, z + 0.5);
    return;
  }
}

let animalSpawnTimer=5;
export function trySpawnAnimals(dt) {
  animalSpawnTimer-=dt;
  if(animalSpawnTimer>0||player.dead||mobHooks.getSunH()<=.2)return;
  const count=mobs.filter(m=>m.passive).length;
  animalSpawnTimer=count<5?2:5;
  if(count>=MAX_ANIMALS||mobs.length>=MAX_ENTITIES)return;
  const grass=new Set([B.GRASS,B.JUNGLE_GRASS,B.SWAMP_GRASS,B.TAIGA_GRASS]);
  for(let tries=0;tries<10;tries++){
    const a=Math.random()*Math.PI*2,r=24+Math.random()*24;
    const x=Math.floor(player.pos.x+Math.cos(a)*r),z=Math.floor(player.pos.z+Math.sin(a)*r);
    const h=getHeight(x,z),top=getBlock(x,h,z),biome=getBiome(x,z);
    if(h<=0||biome===2||biome===9||!grass.has(top))continue;
    if(getBlock(x,h+1,z)!==B.AIR||getBlock(x,h+2,z)!==B.AIR)continue;
    const roll=Math.random(),type=roll<.3?'cow':roll<.55?'pig':roll<.8?'sheep':'chicken';
    createMob(type,x+.5,h+1,z+.5);return;
  }
}

// ============================ DROPS ============================
const dropMatCache = {};
export function spawnDrop(kind, id, count, pos) {
  let mesh;
  if (kind === 'xp') {
    mesh = new THREE.Mesh(GEO.xp, xpMat);
  } else if (id < 100) {
    if (!dropMatCache['b' + id]) {
      const t = BD[id].t;
      dropMatCache['b' + id] = [t[1], t[1], t[0], t[2], t[1], t[1]]
        .map(ti => new THREE.MeshLambertMaterial({ map: tileTex[ti], alphaTest: 0.5 }));
    }
    mesh = new THREE.Mesh(GEO.dropCube, dropMatCache['b' + id]);
  } else {
    if (!dropMatCache['i' + id])
      dropMatCache['i' + id] = new THREE.MeshLambertMaterial({
        map: itemTex[id], alphaTest: 0.5, side: THREE.DoubleSide
      });
    mesh = new THREE.Mesh(GEO.dropPlane, dropMatCache['i' + id]);
  }
  mesh.position.copy(pos);
  scene.add(mesh);
  drops.push({
    kind, id, count, mesh,
    pos: pos.clone(),
    vel: new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      3 + Math.random() * 2,
      (Math.random() - 0.5) * 4
    ),
    w: 0.25, h: 0.25,
    onGround: false, hitWall: false, age: 0
  });
}
export function updateDrops(dt) {
  const center = player.pos.clone().add(new THREE.Vector3(0, 0.9, 0));
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.age += dt;
    if (d.age > 180) { scene.remove(d.mesh); drops.splice(i, 1); continue; }
    const dist = d.pos.distanceTo(center);
    if (!player.dead && d.age > 0.5 && dist < 3.5) {
      const dir = center.clone().sub(d.pos).normalize();
      d.vel.x += dir.x * 30 * dt;
      d.vel.z += dir.z * 30 * dt;
      d.vel.y += dir.y * 30 * dt;
      if (dist < 1.1) {
        if (d.kind === 'xp') {
          mobHooks.addXP(d.count);
          scene.remove(d.mesh);
          drops.splice(i, 1);
          continue;
        }
        const left = addItem(d.id, d.count);
        if (left === 0) { scene.remove(d.mesh); drops.splice(i, 1); continue; }
        d.count = left;
      }
    }
    d.vel.y = Math.max(d.vel.y - 16 * dt, -30);
    if (d.onGround) {
      d.vel.x *= Math.exp(-6 * dt);
      d.vel.z *= Math.exp(-6 * dt);
    }
    moveEntity(d, dt);
    d.mesh.position.set(
      d.pos.x,
      d.pos.y + 0.15 + Math.sin(d.age * 3) * 0.05,
      d.pos.z
    );
    d.mesh.rotation.y += dt * 2;
  }
}
