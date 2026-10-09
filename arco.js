import * as THREE from 'three';
import { I } from './nucleo.js';
import { scene, worldGroup, camera } from './render.js';
import { player, inventory, removeItem, raycastVoxel, rayAABB, viewDir } from './entidades.js';
import { mobs, damageMob } from './mobs.js';
import { emitEndArrowTrail, hitEndProjectile, isEndActive, playEndShot } from './end.js';

const arrows=[];
const geometry=new THREE.CylinderGeometry(.025,.025,.62,5);
const tipGeometry=new THREE.ConeGeometry(.085,.2,6);
const material=new THREE.MeshLambertMaterial({color:0xe2d7bb});
const endMaterial=new THREE.MeshBasicMaterial({color:0xffc4f7});
const up=new THREE.Vector3(0,1,0);
const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=32;
const glowCtx=glowCanvas.getContext('2d'),glowGrad=glowCtx.createRadialGradient(16,16,0,16,16,16);
glowGrad.addColorStop(0,'rgba(255,255,255,1)');glowGrad.addColorStop(.25,'rgba(255,90,220,.9)');
glowGrad.addColorStop(1,'rgba(100,20,255,0)');glowCtx.fillStyle=glowGrad;glowCtx.fillRect(0,0,32,32);
const glowMap=new THREE.CanvasTexture(glowCanvas);
const glowMaterial=new THREE.SpriteMaterial({map:glowMap,color:0xff69db,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
export function firePlayerArrow(){
  if(!inventory.some(stack=>stack&&stack.id===I.ARROW))return false;
  removeItem(I.ARROW,1);
  const pos=camera.position.clone(),dir=viewDir().clone().normalize(),inEnd=isEndActive(),mesh=new THREE.Group();
  const shaft=new THREE.Mesh(geometry,inEnd?endMaterial:material);if(inEnd)shaft.position.y=.12;mesh.add(shaft);
  if(inEnd){
    const tip=new THREE.Mesh(tipGeometry,endMaterial);tip.position.y=.43;mesh.add(tip);
    const glow=new THREE.Sprite(glowMaterial);glow.scale.set(1.35,1.35,1);mesh.add(glow);playEndShot();
  }
  mesh.position.copy(pos);mesh.quaternion.setFromUnitVectors(up,dir);(inEnd?scene:worldGroup).add(mesh);
  arrows.push({mesh,pos,vel:dir.multiplyScalar(inEnd?58:28),life:inEnd?2.5:3,inEnd,gravity:inEnd ? .7 : 5,trail:0});return true;
}
export function updatePlayerArrows(dt){
  for(let i=arrows.length-1;i>=0;i--){
    const a=arrows[i];if(a.inEnd!==isEndActive()){removeArrow(i);continue;}a.life-=dt;
    if(a.life<=0){a.mesh.parent?.remove(a.mesh);arrows.splice(i,1);continue;}
    a.vel.y-=a.gravity*dt;const next=a.pos.clone().addScaledVector(a.vel,dt),delta=next.clone().sub(a.pos),length=delta.length();
    if(length){const dir=delta.clone().normalize();let target=null,targetT=length;
      for(const m of (isEndActive()?[]:mobs)){if(m.dying)continue;const t=rayAABB(a.pos,dir,new THREE.Vector3(m.pos.x-m.w/2,m.pos.y,m.pos.z-m.w/2),new THREE.Vector3(m.pos.x+m.w/2,m.pos.y+m.h,m.pos.z+m.w/2));
        if(t!==null&&t<=targetT){target=m;targetT=t;}}
      const endHit=hitEndProjectile(a.pos,next);
      if(target&&targetT<length){damageMob(target,9,player.pos);removeArrow(i);continue;}
      if(endHit){removeArrow(i);continue;}
      const block=raycastVoxel(a.pos,dir,length);
      if(block){removeArrow(i);continue;}
    }
    a.pos.copy(next);a.mesh.position.copy(a.pos);a.mesh.quaternion.setFromUnitVectors(up,a.vel.clone().normalize());
    if(a.inEnd){a.trail-=dt;if(a.trail<=0){emitEndArrowTrail(a.pos);a.trail=.035;}}
  }
}
function removeArrow(i){arrows[i].mesh.parent?.remove(arrows[i].mesh);arrows.splice(i,1);}
