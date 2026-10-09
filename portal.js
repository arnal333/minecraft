import * as THREE from 'three';
import { B, I } from './nucleo.js';
import { worldGroup } from './render.js';
import { player, removeItem } from './entidades.js';
import { getBlock } from './mundo.js';
import { activeDimension } from './dimensiones.js';
import { enterEnd, exitEnd, isEndDefeated } from './end.js';

let portal=null,portalMesh=null;
function frameAt(x,y,z){return getBlock(x,y,z)===B.PORTAL_FRAME;}
function candidate(hit,axis,x0,y0,z0){
  const side=(dx,dy,dz)=>frameAt(x0+dx,y0+dy,z0+dz);
  for(let n=0;n<3;n++){
    if(axis==='z'){
      if(!side(n,-1,0)||!side(n,3,0)||!side(-1,n,0)||!side(3,n,0))return null;
    }else{
      if(!side(0,-1,n)||!side(0,3,n)||!side(0,n,-1)||!side(0,n,3))return null;
    }
  }
  for(let y=0;y<3;y++)for(let x=0;x<3;x++){
    const id=axis==='z'?getBlock(x0+x,y0+y,z0):getBlock(x0,y0+y,z0+x);
    if(id!==B.AIR)return null;
  }
  const onThisFrame=axis==='z'
    ?hit.z===z0&&hit.y>=y0-1&&hit.y<=y0+3&&hit.x>=x0-1&&hit.x<=x0+3
    :hit.x===x0&&hit.y>=y0-1&&hit.y<=y0+3&&hit.z>=z0-1&&hit.z<=z0+3;
  if(!onThisFrame)return null;
  return {axis,x0,y0,z0};
}
function findPortal(hit){
  for(const axis of ['z','x'])for(let y=hit.y-4;y<=hit.y+1;y++)
    for(let a=hit.x-4;a<=hit.x+1;a++)for(let b=hit.z-4;b<=hit.z+1;b++){
      const p=candidate(hit,axis,a,y,b);if(p)return p;
    }
  return null;
}
function drawPortal(){
  if(portalMesh){portalMesh.parent?.remove(portalMesh);portalMesh.geometry.dispose();portalMesh.material.dispose();portalMesh=null;}
  if(!portal)return;
  const mat=new THREE.MeshBasicMaterial({color:0x8e45d9,transparent:true,opacity:.72,side:THREE.DoubleSide,depthWrite:false});
  portalMesh=new THREE.Mesh(new THREE.PlaneGeometry(2.94,2.94),mat);
  if(portal.axis==='z')portalMesh.position.set(portal.x0+1.5,portal.y0+1.5,portal.z0+.5);
  else{portalMesh.rotation.y=Math.PI/2;portalMesh.position.set(portal.x0+.5,portal.y0+1.5,portal.z0+1.5);}
  portalMesh.renderOrder=2;worldGroup.add(portalMesh);
}
export function tryActivatePortal(hit,itemId){
  if(!hit||hit.b!==B.PORTAL_FRAME||itemId!==I.TORCH||portal)return false;
  const match=findPortal(hit);if(!match)return false;
  portal=match;removeItem(I.TORCH,1);drawPortal();return true;
}
export function breakPortalFrame(x,y,z){
  if(!portal)return;
  const onFrame=portal.axis==='z'?z===portal.z0&&x>=portal.x0-1&&x<=portal.x0+3&&y>=portal.y0-1&&y<=portal.y0+3
    :x===portal.x0&&z>=portal.z0-1&&z<=portal.z0+3&&y>=portal.y0-1&&y<=portal.y0+3;
  if(onFrame){portal=null;drawPortal();}
}
export function getPortalSaveState(){return portal;}
export function isPortalActive(){return !!portal;}
export function restorePortalState(saved){portal=saved&&['x','z'].includes(saved.axis)?saved:null;drawPortal();}
export function updatePortalCrossing(dt=0){
  if(portalMesh){portalMesh.rotation.z+=dt*.55;portalMesh.material.opacity=.64+Math.sin(performance.now()*.002)*.08;}
  if(activeDimension==='end'){
    if(isEndDefeated()&&Math.hypot(player.pos.x,player.pos.z)<1.8&&player.pos.y<45)exitEnd();
    return;
  }
  if(!portal)return;
  const plane=portal.axis==='z'?portal.z0+.5:portal.x0+.5;
  const normal=portal.axis==='z'?Math.abs(player.pos.z-plane):Math.abs(player.pos.x-plane);
  const along=portal.axis==='z'?player.pos.x:player.pos.z;
  const origin=portal.axis==='z'?portal.x0:portal.z0;
  if(normal<.65&&along>origin&&along<origin+3&&player.pos.y<portal.y0+3&&player.pos.y+player.h>portal.y0)enterEnd();
}
