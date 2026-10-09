import * as THREE from 'three';
import { B, mulberry32 } from './nucleo.js';
import { scene, worldGroup, renderer, camera, setEndLighting } from './render.js';
import { player, hurtPlayer } from './entidades.js';
import { setMobsVisible } from './mobs.js';
import { particles } from './mundo.js';
import { activeDimension, END_BASE_Y, setActiveDimension, clearEndBlocks, setEndBlock } from './dimensiones.js';
import { toast } from './interfaz.js';

const MAX_HP=200, $=id=>document.getElementById(id), RADIUS=38, TOWER_RADIUS=27;
const endGroup=new THREE.Group();endGroup.name='the-end';endGroup.visible=false;scene.add(endGroup);
const box=new THREE.BoxGeometry(1,1,1),up=new THREE.Vector3(0,1,0);
const data={hp:MAX_HP,crystals:Array(10).fill(true),defeated:false,dying:false,deathT:0,state:'circle',stateT:9,angle:0,phase:0,
  velocity:new THREE.Vector3(),chargeTarget:new THREE.Vector3(),chargeT:0,perchStage:0,returnPoint:null,flashT:0,shake:0};
let dragon=null,crystalMeshes=[],exitPortal=null,portalMaterial=null,elapsed=0,attackCd=0,creditsShown=false,built=false;
let endStars=null,driftDust=null,fountain=null,altarLight=null,particleMesh=null,particleGeo=null,particlePositions=null,particleColors=null;
let particleVelocity=null,particleLife=null,particleMaxLife=null,particleGravity=null,particleBaseColors=null,particleCursor=0,beamParticleT=0,deathParticleT=0;
const flashes=[];
const deathRings=[];
const endstoneTexture=pixelTexture('#dcd99a',['#e9e6b0','#c9c582','#d2cf8c','#bdb877','#e2dfa4'],7);
const towerTexture=pixelTexture('#140c1f',['#1e1230','#2c1a45','#0c0714','#3a2358','#1a0f29'],13,.5);
const stoneTexture=pixelTexture('#555',['#333','#777','#222','#8a8a8a','#444'],29,.35);
const dragonTexture=pixelTexture('#17161d',['#1f1d27','#101015','#25222e','#0b0b0f'],41,.5);
const endStoneMat=new THREE.MeshLambertMaterial({map:endstoneTexture,vertexColors:true});
const obsidianMat=new THREE.MeshLambertMaterial({map:towerTexture,vertexColors:true});
const crystalMat=new THREE.MeshPhongMaterial({color:0xd69cff,emissive:0x8a27ff,emissiveIntensity:1.15,shininess:90});
const dragonMat=new THREE.MeshLambertMaterial({map:dragonTexture,color:0xffffff,emissive:0x000000});
const wingMat=new THREE.MeshLambertMaterial({color:0x713a82,side:THREE.DoubleSide,emissive:0x000000});
const glowTexture=makeGlowTexture();

function makeGlowTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  const r=g.createRadialGradient(32,32,0,32,32,32);
  r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.22,'rgba(220,170,255,.9)');
  r.addColorStop(.55,'rgba(137,55,255,.38)');r.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=r;g.fillRect(0,0,64,64);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function pixelTexture(base,palette,seed,threshold=.55){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const ctx=canvas.getContext('2d');
  let value=seed%2147483647;if(value<=0)value+=2147483646;const rand=()=>((value=value*16807%2147483647)/2147483647);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    ctx.fillStyle=rand()<threshold?base:palette[Math.floor(rand()*palette.length)];ctx.fillRect(x,y,1,1);
  }
  const tex=new THREE.CanvasTexture(canvas);tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;
  tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function makeCube(parent,geometry,material,pos,scale){
  const m=new THREE.Mesh(geometry,material);m.position.set(...pos);if(scale)m.scale.set(...scale);parent.add(m);return m;
}
function seedHash(x,z){const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);}
function addBlockInstances(blocks,material){
  if(!blocks.length)return null;
  const mesh=new THREE.InstancedMesh(box,material,blocks.length),obj=new THREE.Object3D(),color=new THREE.Color();
  blocks.forEach(([x,y,z,tint=1],i)=>{
    obj.position.set(x+.5,y+.5,z+.5);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);
    color.setRGB(tint,tint,tint);mesh.setColorAt(i,color);
  });
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.frustumCulled=false;endGroup.add(mesh);return mesh;
}
function buildIsland(){
  clearEndBlocks();const depths=new Map(),blocks=[];
  for(let z=-42;z<=42;z++)for(let x=-42;x<=42;x++){
    const a=Math.atan2(z,x),edge=RADIUS+2.2*Math.sin(a*5+.7)+1.4*Math.sin(a*9+2.1)+.8*Math.sin(a*13);
    const d=Math.hypot(x,z);if(d>edge)continue;
    depths.set(`${x},${z}`,Math.max(1,Math.floor(1+Math.pow(1-d/edge,.6)*17+seedHash(x,z)*2.5)));
  }
  for(const [key,depth] of depths){
    const [x,z]=key.split(',').map(Number);
    for(let i=0;i<depth;i++){
      const y=END_BASE_Y-i;if(y<0)break;
      setEndBlock(x,y,z,B.END_STONE);
      let exposed=i===0||i===depth-1||Math.hypot(x,z)<3.6;
      if(!exposed)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])
        if((depths.get(`${x+dx},${z+dz}`)||0)<=i){exposed=true;break;}
      if(exposed){const tint=.84+seedHash(x*3+i,z*7)*.2;blocks.push([x,y,z,tint]);}
    }
  }
  addBlockInstances(blocks,endStoneMat);
}
function buildSky(){
  const sky=new THREE.Mesh(new THREE.SphereGeometry(900,32,16),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,toneMapped:false,
    uniforms:{uTime:{value:0}},
    vertexShader:'varying vec3 vP; void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec3 vP;uniform float uTime;void main(){float h=vP.y;float band=exp(-abs(h)*3.2);
      vec3 c=mix(vec3(.012,.006,.03),vec3(.11,.04,.19),band);
      float swirl=.5+.5*sin(atan(vP.z,vP.x)*3.0+h*6.0+uTime*.02);
      c+=vec3(.08,.02,.10)*band*swirl;gl_FragColor=vec4(c,1.0);}`
  }));sky.renderOrder=-100;endGroup.add(sky);endStars=sky;
  const rand=mulberry32(6750190),positions=new Float32Array(4500*3),colors=new Float32Array(4500*3);
  for(let i=0;i<4500;i++){
    const h=rand()*2-1,a=rand()*Math.PI*2,q=Math.sqrt(1-h*h),d=700+rand()*150;
    positions.set([Math.cos(a)*q*d,h*d,Math.sin(a)*q*d],i*3);
    const palette=rand()<.7?[1,1,1]:rand()<.5?[.8,.6,1]:[.6,1,1],v=.4+rand()*.6;
    colors.set(palette.map(n=>n*v),i*3);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const stars=new THREE.Points(g,new THREE.PointsMaterial({size:1.8,sizeAttenuation:false,vertexColors:true,fog:false,depthWrite:false}));
  stars.renderOrder=-90;endGroup.add(stars);endStars.stars=stars;
  const dustPos=new Float32Array(500*3),dustColor=new Float32Array(500*3),dustRand=mulberry32(12035);
  for(let i=0;i<500;i++){
    dustPos.set([(dustRand()-.5)*160,-40+dustRand()*90,(dustRand()-.5)*160],i*3);
    dustColor.set([.5,.75,1],i*3);
  }
  const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(dustPos,3));dg.setAttribute('color',new THREE.BufferAttribute(dustColor,3));
  driftDust=new THREE.Points(dg,new THREE.PointsMaterial({map:glowTexture,color:0x9ccfff,size:.35,transparent:true,opacity:.6,vertexColors:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  endGroup.add(driftDust);
}
function buildTowers(){
  const pillars=[],angles=Array.from({length:10},(_,i)=>i/10*Math.PI*2+.3),sizes=[2,2.6,3.1];
  angles.forEach((a,i)=>{
    const x=Math.round(Math.cos(a)*TOWER_RADIUS),z=Math.round(Math.sin(a)*TOWER_RADIUS);
    const h=15+(i*7%5)*3+i%2*2,r=sizes[i%3],inside=(dx,dz)=>Math.hypot(dx,dz)<=r+.2;
    for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){
      if(!inside(dx,dz))continue;
      const edge=[[1,0],[-1,0],[0,1],[0,-1]].some(([ax,az])=>!inside(dx+ax,dz+az));
      for(let y=0;y<h;y++)if(edge||y===h-1){
        const bx=x+dx,by=END_BASE_Y+y,bz=z+dz;setEndBlock(bx,by,bz,B.OBSIDIAN);
        pillars.push([bx,by,bz,.9+seedHash(bx*3+by,bz*7)*.18]);
      }
    }
    const group=new THREE.Group();group.position.set(x+.5,END_BASE_Y+h+2.6,z+.5);endGroup.add(group);
    const inner=makeCube(group,new THREE.OctahedronGeometry(.75),new THREE.MeshBasicMaterial({color:0xff789a}),[0,0,0],[1,1,1]);
    const core=makeCube(group,new THREE.OctahedronGeometry(.56),crystalMat,[0,0,0],[1,1.25,1]);
    const white=makeCube(group,new THREE.OctahedronGeometry(.34),new THREE.MeshBasicMaterial({color:0xffefff}),[0,0,0],[1,1.5,1]);
    const wireGeo=new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1));
    const cage1=new THREE.LineSegments(wireGeo,new THREE.LineBasicMaterial({color:0xffe4f5,transparent:true,opacity:.9}));cage1.scale.setScalar(1.35);group.add(cage1);
    const cage2=new THREE.LineSegments(wireGeo,new THREE.LineBasicMaterial({color:0x9a63ff,transparent:true,opacity:.8}));cage2.scale.setScalar(1.9);group.add(cage2);
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color:0xff70dd,transparent:true,opacity:.78,depthWrite:false,blending:THREE.AdditiveBlending}));glow.scale.setScalar(5.5);group.add(glow);
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.035,.08,1,8),new THREE.MeshBasicMaterial({color:0xbc7dff,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending}));
    beam.visible=false;endGroup.add(beam);
    crystalMeshes.push({group,inner,core,white,cage1,cage2,glow,beam,baseY:group.position.y,alive:true,index:i});
  });
  addBlockInstances(pillars,obsidianMat);
}
function buildFountain(){
  fountain=new THREE.Group();fountain.position.set(.5,END_BASE_Y+4,.5);endGroup.add(fountain);
  const mat=new THREE.MeshLambertMaterial({map:stoneTexture,color:0xffffff});
  [[.9,.4,.9],[.75,.3,.75],[.55,.25,.55],[.3,.15,.3]].reduce((y,[x,h,z])=>{
    makeCube(fountain,box,mat,[0,y+h/2,0],[x,h,z]);return y+h;
  },0);
  altarLight=new THREE.PointLight(0x9c67ff,0,30);altarLight.position.set(0,1,0);fountain.add(altarLight);
  const portalGeo=new THREE.CircleGeometry(2.55,40);
  portalMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{uTime:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec2 vUv;uniform float uTime;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){vec2 p=(vUv-.5)*2.0;float r=length(p);if(r>.98)discard;vec3 col=vec3(.01,.03,.05);
      for(int i=0;i<5;i++){float f=float(i);vec2 q=p*(.9+f*.55)+vec2(uTime*.07*(f+1.0),-uTime*.05*f);vec2 g=floor(q*5.0);vec2 d=fract(q*5.0);
      float s=step(.9,hash(g+f*17.0))*(1.0-smoothstep(0.0,.32,length(d-.5)));col+=mix(vec3(.15,.85,.75),vec3(.65,.35,1.0),hash(g+3.1+f))*s*(1.0-f*.15);}
      float rim=1.0-smoothstep(.78,.98,r);gl_FragColor=vec4(col*rim,.92*rim);}`
  });
  exitPortal=new THREE.Mesh(portalGeo,portalMaterial);exitPortal.rotation.x=-Math.PI/2;
  exitPortal.position.set(.5,END_BASE_Y+1.03,.5);exitPortal.visible=false;endGroup.add(exitPortal);
}
function buildParticlePool(){
  const max=4000;particlePositions=new Float32Array(max*3);particlePositions.fill(-9999);
  particleColors=new Float32Array(max*3);particleBaseColors=new Float32Array(max*3);particleVelocity=new Float32Array(max*3);
  particleLife=new Float32Array(max);particleMaxLife=new Float32Array(max);particleGravity=new Float32Array(max);
  particleGeo=new THREE.BufferGeometry();particleGeo.setAttribute('position',new THREE.BufferAttribute(particlePositions,3).setUsage(THREE.DynamicDrawUsage));
  particleGeo.setAttribute('color',new THREE.BufferAttribute(particleColors,3).setUsage(THREE.DynamicDrawUsage));
  particleMesh=new THREE.Points(particleGeo,new THREE.PointsMaterial({map:glowTexture,size:.45,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  particleMesh.frustumCulled=false;endGroup.add(particleMesh);
}
function buildDragon(){
  const root=new THREE.Group();root.position.set(0,END_BASE_Y+30,-48);endGroup.add(root);
  const rig=new THREE.Group();root.add(rig);const body=makeCube(rig,new THREE.BoxGeometry(3.2,2.6,7.5),dragonMat,[0,0,0]);
  for(let i=0;i<5;i++)makeCube(rig,new THREE.BoxGeometry(.35,.8,.7),wingMat,[0,1.65,-3+i*1.5]);
  const legs=[];for(const [x,z] of [[1.3,2.3],[-1.3,2.3],[1.4,-2.4],[-1.4,-2.4]]){
    legs.push(makeCube(rig,new THREE.BoxGeometry(.8,2.2,.9),dragonMat,[x,-2,z]));
  }
  const neckBase=new THREE.Group();neckBase.position.set(0,.5,3.75);rig.add(neckBase);
  const neck=[];let parent=neckBase;
  for(let i=0;i<5;i++){
    const joint=new THREE.Group();joint.position.set(0,0,i===0?.6:1.25);parent.add(joint);
    makeCube(joint,new THREE.BoxGeometry(1.3,1.3,1.4),dragonMat,[0,0,0]);
    makeCube(joint,new THREE.BoxGeometry(.3,.55,.5),wingMat,[0,.85,0]);neck.push(joint);parent=joint;
  }
  const head=new THREE.Group();head.position.z=1;parent.add(head);
  makeCube(head,new THREE.BoxGeometry(2.2,1.7,2.6),dragonMat,[0,0,1]);
  makeCube(head,new THREE.BoxGeometry(1.6,.85,1.9),wingMat,[0,-.2,3.1]);
  const eyes=[];for(const side of [-1,1]){
    makeCube(head,new THREE.BoxGeometry(.3,.2,.4),wingMat,[side*.45,.3,3.8]);
    const eye=makeCube(head,new THREE.BoxGeometry(.09,.1,.12),new THREE.MeshBasicMaterial({color:0xffd54d}),[side*.5,.34,3.95]);eyes.push(eye);
  }
  const jaw=new THREE.Group();jaw.position.set(0,-.65,2.1);head.add(jaw);
  makeCube(jaw,new THREE.BoxGeometry(1.5,.4,2.3),dragonMat,[0,0,.9]);
  for(const side of [-1,1]){
    makeCube(head,new THREE.BoxGeometry(.12,.32,.6),wingMat,[side*1.12,.35,1.5]);
    makeCube(head,new THREE.BoxGeometry(.3,.3,1.4),dragonMat,[side*.6,1.05,-.1]).rotation.x=-.5;
  }
  const tailBase=new THREE.Group();tailBase.position.set(0,.3,-3.75);rig.add(tailBase);
  const tail=[];parent=tailBase;
  for(let i=0;i<12;i++){
    const size=1.25*(1-i/15),joint=new THREE.Group();joint.position.z=i===0?-.6:-1.15;parent.add(joint);
    makeCube(joint,new THREE.BoxGeometry(size,size,1.2),dragonMat,[0,0,0]);
    makeCube(joint,new THREE.BoxGeometry(.25,.5*size,.5),dragonMat,[0,size*.5+.2,0]);tail.push(joint);parent=joint;
  }
  const wings=[];
  for(const side of [-1,1]){
    const shoulder=new THREE.Group();shoulder.position.set(side*1.5,1,1.6);rig.add(shoulder);
    const inner=new THREE.Group();shoulder.add(inner);
    makeCube(inner,new THREE.BoxGeometry(7,.4,.4),dragonMat,[side*3.5,0,0]);
    makeCube(inner,new THREE.BoxGeometry(7,.08,5.6),wingMat,[side*3.5,-.05,-2.8]);
    const outer=new THREE.Group();outer.position.x=side*7;inner.add(outer);
    makeCube(outer,new THREE.BoxGeometry(7,.3,.3),dragonMat,[side*3.5,0,0]);
    makeCube(outer,new THREE.BoxGeometry(7,.08,4.2),wingMat,[side*3.5,-.05,-2.1]);
    makeCube(outer,new THREE.BoxGeometry(3.5,.08,2),wingMat,[side*5.25,-.05,-5.2]);
    wings.push({side,shoulder,inner,outer});
  }
  dragon={root,rig,wings,body,neckBase,neck,head,jaw,tail,legs,eyes,mats:[dragonMat,wingMat],lastYaw:0};
  for(let i=0;i<16;i++){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.035,4,24),new THREE.MeshBasicMaterial({
      color:i%2?0xff5fae:0xffd477,transparent:true,opacity:.75,depthWrite:false,blending:THREE.AdditiveBlending
    }));
    ring.visible=false;ring.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,0);endGroup.add(ring);deathRings.push(ring);
  }
}
function buildEnd(){buildSky();buildIsland();buildTowers();buildFountain();buildParticlePool();buildDragon();built=true;}

function spawnParticles(pos,count,color,speed,life,gravity=0,spread=0){
  if(!particleLife)return;const c=new THREE.Color(color);
  for(let n=0;n<count;n++){
    const i=particleCursor++%particleLife.length,a=Math.random()*Math.PI*2,h=Math.random()*2-1,q=Math.sqrt(1-h*h),v=speed*(.3+Math.random()*.7),k=i*3;
    particlePositions[k]=pos.x+(Math.random()-.5)*spread;particlePositions[k+1]=pos.y+(Math.random()-.5)*spread;particlePositions[k+2]=pos.z+(Math.random()-.5)*spread;
    particleVelocity[k]=Math.cos(a)*q*v;particleVelocity[k+1]=h*v;particleVelocity[k+2]=Math.sin(a)*q*v;
    const brightness=.7+Math.random()*.3;
    particleBaseColors[k]=particleColors[k]=c.r*brightness;particleBaseColors[k+1]=particleColors[k+1]=c.g*brightness;particleBaseColors[k+2]=particleColors[k+2]=c.b*brightness;
    particleLife[i]=particleMaxLife[i]=life*(.5+Math.random()*.5);particleGravity[i]=gravity;
  }
}
function flash(pos,size,color,duration=.55){
  const m=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}));
  m.position.copy(pos);m.scale.setScalar(.3);endGroup.add(m);flashes.push({mesh:m,time:0,duration,size});
}
function explode(pos,power=1){
  spawnParticles(pos,160*power,0xffffff,18*power,1.2,4,1);
  spawnParticles(pos,220*power,0xff8bd8,14*power,1.6,2,1.5);
  spawnParticles(pos,120*power,0xffd947,10*power,1,6,1);
  flash(pos,7*power,0xffa5e8);data.shake=Math.max(data.shake,.7*power*Math.max(.15,1-pos.distanceTo(player.pos)/70));playEndSound('boom');
}
function updateEffects(dt){
  let dirty=false;
  for(let i=0;i<particleLife.length;i++){
    if(particleLife[i]<=0)continue;dirty=true;particleLife[i]-=dt;const k=i*3;
    if(particleLife[i]<=0){particlePositions[k+1]=-9999;particleColors[k]=particleColors[k+1]=particleColors[k+2]=0;continue;}
    particleVelocity[k+1]-=particleGravity[i]*dt;const damp=Math.exp(-1.2*dt);
    particleVelocity[k]*=damp;particleVelocity[k+1]*=damp;particleVelocity[k+2]*=damp;
    particlePositions[k]+=particleVelocity[k]*dt;particlePositions[k+1]+=particleVelocity[k+1]*dt;particlePositions[k+2]+=particleVelocity[k+2]*dt;
    const fade=particleLife[i]/particleMaxLife[i];
    particleColors[k]=particleBaseColors[k]*fade;particleColors[k+1]=particleBaseColors[k+1]*fade;particleColors[k+2]=particleBaseColors[k+2]*fade;
  }
  if(dirty){particleGeo.attributes.position.needsUpdate=true;particleGeo.attributes.color.needsUpdate=true;}
  for(let i=flashes.length-1;i>=0;i--){
    const f=flashes[i];f.time+=dt;const t=Math.min(1,f.time/f.duration);f.mesh.scale.setScalar(.3+t*f.size);f.mesh.material.opacity=.9*(1-t);
    if(t>=1){endGroup.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();flashes.splice(i,1);}
  }
  if(endStars?.material.uniforms)endStars.material.uniforms.uTime.value=elapsed;
  if(portalMaterial)portalMaterial.uniforms.uTime.value=elapsed;
  if(driftDust)driftDust.rotation.y+=dt*.01;
}
function playEndSound(kind){
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
    playEndSound.ctx??=new Ctx();const ctx=playEndSound.ctx;if(ctx.state==='suspended')ctx.resume();
    const presets={shoot:['square',880,260,.11,.045],hit:['triangle',320,120,.14,.08],boom:['sawtooth',90,35,.55,.11],
      roar:['sawtooth',120,42,1.05,.09],portal:['sine',180,900,1.5,.07]};
    const [wave,start,end,duration,volume]=presets[kind]||presets.hit,osc=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime;
    osc.type=wave;osc.frequency.setValueAtTime(start,now);osc.frequency.exponentialRampToValueAtTime(Math.max(1,end),now+duration);
    gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.0008,now+duration);osc.connect(gain).connect(ctx.destination);osc.start(now);osc.stop(now+duration+.02);
  }catch{}
}
export function emitEndArrowTrail(pos){spawnParticles(pos,2,0xffa9ed,1.5,.34,0,.1);}
export function playEndShot(){playEndSound('shoot');}

function applyVisibility(){
  const active=activeDimension==='end';endGroup.visible=active;worldGroup.visible=!active;setEndLighting(active);
  setMobsVisible(!active);particles.visible=!active;document.body.classList.toggle('inEnd',active);
  const hud=$('endBossHud');if(hud)hud.classList.toggle('hidden',!active||data.defeated);
  if(!active){$('endHealVignette')?.classList.remove('on');$('endHurtVignette')?.classList.remove('on');}
}
function updateHud(healing=false){
  const fill=$('endBossFill'),count=$('endCrystalCount'),bar=$('endBossBar');
  if(fill)fill.style.width=`${Math.max(0,data.hp/MAX_HP*100)}%`;
  if(count)count.textContent=String(data.crystals.filter(Boolean).length);
  if(bar)bar.classList.toggle('healing',healing);
  $('endHealVignette')?.classList.toggle('on',healing&&!data.defeated);
}
function showCredits(){
  if(creditsShown)return;creditsShown=true;
  const credits=$('endCredits'),roll=$('endRoll');if(credits)credits.classList.remove('hidden');
  if($('endContinue'))$('endContinue').textContent='Seguir hasta el portal del centro';
  if(roll){roll.classList.remove('go');void roll.offsetWidth;roll.classList.add('go');}
  if(document.pointerLockElement)document.exitPointerLock();
  setTimeout(()=>$('menu')?.classList.add('hidden'),0);
}
function hurtFlash(){
  const el=$('endHurtVignette');if(!el)return;el.classList.add('on');
  setTimeout(()=>el.classList.remove('on'),90);
}
function closeCredits(){
  $('endCredits')?.classList.add('hidden');if(!document.pointerLockElement)renderer.domElement.requestPointerLock();
}
function setupCreditControls(){
  $('endContinue')?.addEventListener('click',closeCredits);
  $('endReturn')?.addEventListener('click',exitEnd);
  document.addEventListener('keydown',e=>{
    if(creditsShown&&e.code==='Space'){$('endRoll')?.style.setProperty('--roll-speed','8s');e.preventDefault();}
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space')$('endRoll')?.style.removeProperty('--roll-speed');});
}
export function initEnd(saved=null){
  if(!built){buildEnd();setupCreditControls();}
  if(saved)restoreEndState(saved);else applyVisibility();
}
export function getEndSaveState(){return {dimension:activeDimension,returnPoint:data.returnPoint,hp:data.hp,crystals:data.crystals,defeated:data.defeated,dying:data.dying,deathT:data.deathT,state:data.state,stateT:data.stateT,angle:data.angle,phase:data.phase};}
export function restoreEndState(s={}){
  data.returnPoint=s.returnPoint||null;data.hp=Number.isFinite(s.hp)?s.hp:MAX_HP;
  if(Array.isArray(s.crystals)&&s.crystals.length===10)data.crystals=s.crystals.map(Boolean);
  data.defeated=!!s.defeated;data.dying=!!s.dying;data.deathT=s.deathT||0;
  data.state='circle';data.stateT=9;data.angle=0;data.phase=0;data.velocity.set(0,0,0);data.perchStage=0;data.chargeT=0;creditsShown=false;
  if(dragon)dragon.root.visible=!data.defeated;
  data.crystals.forEach((alive,i)=>{crystalMeshes[i].alive=alive;crystalMeshes[i].group.visible=alive;crystalMeshes[i].beam.visible=false;});
  if(data.defeated&&exitPortal)exitPortal.visible=true;
  setActiveDimension(s.dimension);applyVisibility();updateHud();
  if(data.defeated&&activeDimension==='end')showCredits();
}
export function enterEnd(){
  if(activeDimension==='end')return;
  data.returnPoint={x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:player.yaw,pitch:player.pitch};
  setActiveDimension('end');player.pos.set(.5,END_BASE_Y+1,21.5);player.vel.set(0,0,0);player.move.set(0,0,0);player.knock.set(0,0,0);
  player.yaw=0;player.pitch=-.18;player.onGround=false;player.fallStart=player.pos.y;applyVisibility();updateHud();
}
export function exitEnd(){
  if(data.returnPoint){player.pos.set(data.returnPoint.x,data.returnPoint.y,data.returnPoint.z);player.yaw=data.returnPoint.yaw;player.pitch=data.returnPoint.pitch;}
  else player.pos.set(.5,END_BASE_Y+1,21.5);
  player.vel.set(0,0,0);player.move.set(0,0,0);player.knock.set(0,0,0);player.onGround=false;player.fallStart=player.pos.y;
  setActiveDimension('overworld');applyVisibility();$('endCredits')?.classList.add('hidden');creditsShown=false;
  $('menu')?.classList.add('hidden');if(!document.pointerLockElement)renderer.domElement.requestPointerLock();
}
export function isEndActive(){return activeDimension==='end';}
export function isEndDefeated(){return data.defeated;}
function dragonParts(){
  if(!dragon)return [];
  return [[dragon.head,2.3,10],[dragon.neck[2],1.7,6],[dragon.root,3.4,6]].map(([obj,radius,damage])=>({pos:obj.getWorldPosition(new THREE.Vector3()),radius,damage}));
}
function segmentDistance(point,start,dir,length){
  const t=THREE.MathUtils.clamp(point.clone().sub(start).dot(dir),0,length);
  return {t,d:point.distanceTo(start.clone().addScaledVector(dir,t))};
}
function destroyCrystal(c){
  if(!c.alive)return;c.alive=false;data.crystals[c.index]=false;c.group.visible=false;c.beam.visible=false;
  const pos=c.group.getWorldPosition(new THREE.Vector3());explode(pos,1);
  const remaining=data.crystals.filter(Boolean).length;
  toast(remaining?`Cristal destruido · quedan ${remaining}`:'¡Sin cristales! Ya no puede curarse');updateHud();
}
function damageDragon(amount,pos){
  if(data.dying||data.defeated)return;
  const bonus=data.state==='perch'&&data.perchStage===1?1.5:1;
  data.hp=Math.max(0,data.hp-amount*bonus);data.flashT=.12;data.shake=Math.max(data.shake,.36);
  spawnParticles(pos,30,0xff1f55,8,.6,6);flash(pos,1.4,0xff4488,.18);playEndSound('hit');updateHud();
  if(data.hp===0)startDragonDeath();
}
function startDragonDeath(){
  data.dying=true;data.deathT=0;crystalMeshes.forEach(c=>c.beam.visible=false);$('endHealVignette')?.classList.remove('on');
  deathRings.forEach(r=>{r.visible=true;r.scale.setScalar(1);});
  toast('¡La Dragona cae!');playEndSound('roar');flash(dragon.root.position,2,0xff82e5,1.2);
}
export function hitEndProjectile(from,to){
  if(!isEndActive()||data.defeated||data.dying)return false;
  const start=new THREE.Vector3(from.x,from.y,from.z),delta=new THREE.Vector3(to.x-from.x,to.y-from.y,to.z-from.z),length=delta.length();
  if(length<1e-5)return false;const dir=delta.multiplyScalar(1/length);let hit=null,best=Infinity;
  for(const c of crystalMeshes)if(c.alive){
    const test=segmentDistance(c.group.getWorldPosition(new THREE.Vector3()),start,dir,length);
    if(test.d<1.8&&test.t<best){best=test.t;hit={type:'crystal',c};}
  }
  for(const part of dragonParts()){
    const test=segmentDistance(part.pos,start,dir,length);
    if(test.d<part.radius&&test.t<best){best=test.t;hit={type:'dragon',part};}
  }
  if(!hit)return false;
  if(hit.type==='crystal')destroyCrystal(hit.c);else damageDragon(hit.part.damage,hit.part.pos);
  return true;
}
function enterDragonState(state){
  data.state=state;
  if(state==='circle')data.stateT=7+Math.random()*5;
  if(state==='charge'){data.stateT=5;data.chargeT=0;data.chargeTarget.set(player.pos.x,player.pos.y+1.62,player.pos.z);toast('¡La Dragona embiste!');playEndSound('roar');}
  if(state==='perch'){data.stateT=7.5;data.perchStage=0;toast('Se posa en la fuente: ¡aprovecha para atacarla!');playEndSound('roar');}
}
function steerDragon(target,speed,accel,dt){
  const delta=target.clone().sub(dragon.root.position),distance=delta.length();
  if(distance>.001)delta.multiplyScalar(speed/distance);
  data.velocity.lerp(delta,1-Math.exp(-accel*dt));dragon.root.position.addScaledVector(data.velocity,dt);return distance;
}
function animateDragon(dt,rate,flap,shoulderTurn=0){
  data.phase+=dt*rate;const sway=Math.sin(data.phase);
  dragon.wings.forEach(w=>{
    w.inner.rotation.z=w.side*(sway*flap+.08);w.outer.rotation.z=w.side*(Math.sin(data.phase-.9)*flap*.8);
    w.shoulder.rotation.y+=(w.side*shoulderTurn-w.shoulder.rotation.y)*Math.min(1,dt*4);
  });
  dragon.rig.position.y=-sway*.35*(flap/.65);
  dragon.tail.forEach((t,i)=>{t.rotation.y=Math.sin(elapsed*2.1-i*.45)*.13;t.rotation.x=Math.sin(elapsed*1.6-i*.4)*.05;});
  dragon.neck.forEach((n,i)=>{n.rotation.y=Math.sin(elapsed*1.3-i*.5)*.05;});
  data.flashT=Math.max(0,data.flashT-dt);const glow=data.flashT>0?0xff5577:0;
  dragon.mats.forEach(m=>m.emissive.setHex(glow));
}
function updateFacing(dt){
  if(data.velocity.lengthSq()<.5)return;
  const yaw=Math.atan2(data.velocity.x,data.velocity.z),delta=THREE.MathUtils.euclideanModulo(yaw-dragon.lastYaw+Math.PI,Math.PI*2)-Math.PI;
  dragon.lastYaw+=delta*(1-Math.exp(-6*dt));
  dragon.root.rotation.y=dragon.lastYaw;
  const bank=THREE.MathUtils.clamp(-delta/Math.max(dt,.001)*.09,-.75,.75);
  dragon.rig.rotation.z+=(bank-dragon.rig.rotation.z)*Math.min(1,dt*3);
}
function nearestHealingCrystal(){
  let best=null,dist=48;
  for(const c of crystalMeshes)if(c.alive){const p=c.group.getWorldPosition(new THREE.Vector3()),d=p.distanceTo(dragon.root.position);if(d<dist){dist=d;best={c,p,d};}}
  return best;
}
function updateBeams(best,dt){
  crystalMeshes.forEach(c=>{c.beam.visible=!!best&&best.c===c&&!data.defeated;});
  if(!best)return false;
  const beam=best.c.beam,from=best.p,to=dragon.root.position.clone(),delta=to.clone().sub(from),len=delta.length();
  beam.position.copy(from).addScaledVector(delta,.5);beam.quaternion.setFromUnitVectors(up,delta.normalize());
  const pulse=1+Math.sin(elapsed*20)*.35;beam.scale.set(pulse,len,pulse);beam.material.opacity=.55+Math.sin(elapsed*13)*.25;
  beamParticleT-=dt;if(beamParticleT<=0){const p=best.p.clone().lerp(dragon.root.position,Math.random());spawnParticles(p,2,0xeabfff,.7,.5,0);beamParticleT=.045;}
  return true;
}
function updateCrystals(dt){
  for(let i=0;i<crystalMeshes.length;i++){
    const c=crystalMeshes[i];if(!c.alive)continue;
    c.group.position.y=c.baseY+Math.sin(elapsed*2+i)*.3;
    c.inner.rotation.y+=dt*1.3;c.inner.rotation.x+=dt*1.7;
    c.cage1.rotation.y-=dt*1.1;c.cage1.rotation.z+=dt*.7;
    c.cage2.rotation.x+=dt*.8;c.cage2.rotation.y+=dt*.5;
    c.glow.material.opacity=.7+Math.sin(elapsed*3+i)*.2;
  }
  if(fountain)fountain.rotation.y+=dt*.12;if(altarLight)altarLight.intensity=data.defeated?6:0;
}
function finishDragonDeath(){
  data.dying=false;data.defeated=true;dragon.root.visible=false;exitPortal.visible=true;
  deathRings.forEach(r=>{r.visible=false;});
  crystalMeshes.forEach(c=>c.beam.visible=false);spawnParticles(dragon.root.position,1300,0xffffff,30,2.5,-6,4);
  explode(dragon.root.position.clone(),2.6);playEndSound('portal');toast('Portal activado: entra en el centro para volver');showCredits();updateHud();
}
function updateDragonDeath(dt){
  data.deathT+=dt;const t=data.deathT,root=dragon.root.position;
  root.y+=dt*2.4;dragon.rig.rotation.y+=dt*(.4+t*.5);
  dragon.rig.position.set((Math.random()-.5)*.4,(Math.random()-.5)*.4,(Math.random()-.5)*.4);
  dragon.mats.forEach(m=>m.emissive.setHex(Math.random()<.5?0x5a0c30:0x200b20));animateDragon(dt,9,.9);
  deathRings.forEach((ring,i)=>{
    ring.position.copy(root);ring.position.y+=Math.sin(elapsed*3+i)*.35;
    ring.scale.setScalar(1+t*.3+i*.08);ring.rotation.x+=dt*(.8+i*.04);ring.rotation.y+=dt*(.6+i*.03);
    ring.material.opacity=Math.max(0,.75-t*.12);
  });
  deathParticleT-=dt;if(deathParticleT<=0){spawnParticles(root,20,Math.random()<.5?0xff8bd8:0xffe0a0,10,1.2,0,6);deathParticleT=.035;}
  data.shake=Math.max(data.shake,.15);
  if(t>5.5)finishDragonDeath();
}
export function updateEnd(dt){
  if(!isEndActive()||dt<=0)return;elapsed+=dt;attackCd=Math.max(0,attackCd-dt);updateEffects(dt);updateCrystals(dt);
  if(player.pos.y<END_BASE_Y-24&&!player.dead)hurtPlayer(player.maxHealth,null);
  if(data.shake>.001){camera.position.x+=(Math.random()-.5)*data.shake;camera.position.y+=(Math.random()-.5)*data.shake;camera.position.z+=(Math.random()-.5)*data.shake;data.shake*=Math.exp(-5*dt);}
  if(data.dying){updateDragonDeath(dt);return;}
  if(data.defeated){if(exitPortal)portalMaterial.uniforms.uTime.value=elapsed;return;}
  const healing=nearestHealingCrystal();if(healing)data.hp=Math.min(MAX_HP,data.hp+dt*4);
  const target=new THREE.Vector3();
  if(data.state==='circle'){
    data.angle+=dt*.3;target.set(Math.cos(data.angle+.5)*36,END_BASE_Y+21+Math.sin(elapsed*.7)*5,Math.sin(data.angle+.5)*36);
    steerDragon(target,18,1.4,dt);data.stateT-=dt;if(data.stateT<=0)enterDragonState(Math.random()<.55?'charge':'perch');
    dragon.jaw.rotation.x=0;dragon.neckBase.rotation.x*=Math.exp(-dt*2);animateDragon(dt,6,.65);
  }else if(data.state==='charge'){
    data.chargeT+=dt;if(data.chargeT<1.4)data.chargeTarget.lerp(new THREE.Vector3(player.pos.x,player.pos.y+1.62,player.pos.z),1-Math.exp(-4*dt));
    target.copy(data.chargeTarget);target.y=Math.max(END_BASE_Y+1.5,target.y);const distance=steerDragon(target,31,2.6,dt);data.stateT-=dt;
    const playerTarget=player.pos.clone().add(new THREE.Vector3(0,.9,0));
      if(attackCd<=0&&dragonParts().some(p=>p.pos.distanceTo(playerTarget)<p.radius+1.4)){
      hurtPlayer(6,dragon.root.position);hurtFlash();data.shake=Math.max(data.shake,.6);attackCd=.8;enterDragonState('circle');
    }
    dragon.jaw.rotation.x=.45;animateDragon(dt,9,.9,.45);if(distance<3||data.stateT<=0)enterDragonState('circle');
  }else{
    target.set(0,END_BASE_Y+7.3,0);
    if(data.perchStage===0){const distance=steerDragon(target,16,1.8,dt);if(distance<3.5){data.perchStage=1;data.stateT=7.5;}}
    else{
      dragon.root.position.lerp(target,1-Math.exp(-3*dt));data.velocity.multiplyScalar(Math.exp(-4*dt));data.stateT-=dt;
      dragon.root.lookAt(player.pos.x,dragon.root.position.y,player.pos.z);dragon.rig.rotation.z*=Math.exp(-4*dt);
      if(Math.hypot(player.pos.x-dragon.root.position.x,player.pos.z-dragon.root.position.z)<8.5&&attackCd<=0){
        hurtPlayer(3,dragon.root.position);hurtFlash();data.shake=Math.max(data.shake,.5);attackCd=1.6;spawnParticles(dragon.root.position,60,0xd9d2ff,12,.8,0,4);
      }
      dragon.neckBase.rotation.x+=(.35-dragon.neckBase.rotation.x)*Math.min(1,dt*2);
      if(data.stateT<=0){data.velocity.set(0,12,0);enterDragonState('circle');}
    }
    dragon.jaw.rotation.x=.08+Math.max(0,Math.sin(elapsed*.9))*.2;animateDragon(dt,4,.25);
  }
  updateFacing(dt);const healingBeam=updateBeams(healing,dt);updateHud(healingBeam);
}
