/* <fragmentos-espelho>: cacos de espelho que carregam traços de um retrato e derivam pela área do elemento pai.
   Uso:
     <fragmentos-espelho aria-hidden="true">
       <script type="application/json">{ ...configuração... }</script>
     </fragmentos-espelho>
   Configuração (JSON):
     espelho:  { src, largura, altura }  imagem refletida no vidro, alinhada ao fundo real (opcional)
     retratos: [ { id, src, larguraRosto, pontos:[[x,y,peso],...] }, ... ]  o primeiro é o padrão
     gatilho:  { palavra, retrato }  digitar a palavra alterna entre o padrão e esse retrato (opcional)
     quantidade: { desktop, mobile }  cacos por tela (opcional)
   API: el.mostrar(id), el.alternar(), el.atual. Evento "fragmentos-espelho:retrato" ao trocar.
   O atributo "desligado" na tag impede a montagem. */
(()=>{
'use strict';
const DEFS='<filter id="fe-warp" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="13" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="38" xChannelSelector="R" yChannelSelector="G" result="warped"/><feConvolveMatrix in="warped" order="3" kernelMatrix="0 -.5 0 -.5 3 -.5 0 -.5 0" preserveAlpha="true" result="sharp"/><feTurbulence type="fractalNoise" baseFrequency="0.3 0.012" numOctaves="3" seed="4" result="grain"/><feColorMatrix in="grain" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 3.2 -2.3" result="streaks"/><feComposite in="streaks" in2="sharp" operator="over"/></filter><linearGradient id="fe-iris" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c9"/><stop offset=".3" stop-color="#f5c16f"/><stop offset=".55" stop-color="#ffe6a3"/><stop offset=".8" stop-color="#e2983a"/><stop offset="1" stop-color="#ffd98a"/></linearGradient>';
const num=v=>Number(v.toFixed(2));
/* Filtro de distorção e gradiente dourado, injetados uma única vez no documento. */
function garantirDefs(){
 if(document.getElementById('fe-warp'))return;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('width','0');svg.setAttribute('height','0');svg.setAttribute('aria-hidden','true');
 svg.style.position='absolute';svg.innerHTML=DEFS;
 document.body.prepend(svg);
}
class FragmentosEspelho extends HTMLElement{
 connectedCallback(){
  if(this._ligado||this.hasAttribute('desligado')||typeof this.animate!=='function')return;
  this._ligado=true;
  const json=this.querySelector('script[type="application/json"]');
  let cfg={};
  try{cfg=json?JSON.parse(json.textContent):{}}catch(e){console.error('fragmentos-espelho: JSON de configuração inválido',e)}
  this.cfg=Object.assign({retratos:[],quantidade:{desktop:9,mobile:4}},cfg);
  this.natural={};
  this.atual=this.cfg.retratos[0]?this.cfg.retratos[0].id:null;
  this.mobile=matchMedia('(max-width:700px),(pointer:coarse)');
  this.reduzido=matchMedia('(prefers-reduced-motion: reduce)');
  this.seed=4096;
  this._ultimo=[0,0];this._timer=0;
  garantirDefs();
  this._agendar=()=>this.agendar();
  this._reiniciar=()=>{this._ultimo=[0,0];this.agendar()};
  this._tecla=e=>this.tecla(e);
  this._observador=new ResizeObserver(this._agendar);
  this._observador.observe(this.area());
  this.mobile.addEventListener('change',this._reiniciar);
  this.reduzido.addEventListener('change',this._reiniciar);
  if(this.cfg.gatilho)document.addEventListener('keydown',this._tecla);
  /* Os recortes dependem do tamanho natural dos retratos: quando cada um carrega, os cacos são refeitos. */
  for(const r of this.cfg.retratos){
   const img=new Image();
   img.onload=()=>{this.natural[r.id]={w:img.naturalWidth,h:img.naturalHeight};this._reiniciar()};
   img.src=r.src;
  }
  this.agendar();
 }
 disconnectedCallback(){
  if(this._observador)this._observador.disconnect();
  this.mobile.removeEventListener('change',this._reiniciar);
  this.reduzido.removeEventListener('change',this._reiniciar);
  document.removeEventListener('keydown',this._tecla);
  clearTimeout(this._timer);this._ligado=false;
 }
 /* Área por onde os cacos passam: o elemento pai (o hero). */
 area(){return this.parentElement||this}
 /* API pública. */
 mostrar(id){
  if(!this.cfg.retratos.some(r=>r.id===id)||id===this.atual)return;
  this.atual=id;
  for(const camada of this.querySelectorAll('.glass-portrait'))camada.classList.toggle('ativo',camada.dataset.id===id);
  this.dispatchEvent(new CustomEvent('fragmentos-espelho:retrato',{detail:{id},bubbles:true}));
 }
 alternar(){
  const padrao=this.cfg.retratos[0].id,alt=this.cfg.gatilho?this.cfg.gatilho.retrato:(this.cfg.retratos[1]||{}).id;
  if(alt)this.mostrar(this.atual===padrao?alt:padrao);
 }
 /* Gatilho por teclado: digitar a palavra configurada alterna o retrato. */
 tecla(event){
  if(event.ctrlKey||event.metaKey||event.altKey||event.repeat||event.key.length!==1)return;
  const tag=event.target?.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||event.target?.isContentEditable)return;
  const palavra=this.cfg.gatilho.palavra.toLocaleLowerCase('pt-BR');
  this._palavra=((this._palavra||'')+event.key.toLocaleLowerCase('pt-BR')).slice(-palavra.length);
  if(this._palavra===palavra){this._palavra='';this.alternar()}
 }
 /* Gerador determinístico: o mesmo layout a cada reconstrução. */
 rand(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296}
 entre(a,b){return a+(b-a)*this.rand()}
 escolherPonto(lista){
  let total=0;for(const p of lista)total+=p[2];
  let r=this.rand()*total;
  for(const p of lista){r-=p[2];if(r<=0)return p}
  return lista[0];
 }
 /* Recorte do retrato para um caco de w x h: o rosto fica com cerca de 0,9 a 1,3 vezes o tamanho do caco, e o traço escolhido cai no centro dele. */
 recorte(retrato,w,h){
  const img=this.natural[retrato.id];
  if(!img)return 'background-image:none';
  const ponto=this.escolherPonto(retrato.pontos);
  const sw=Math.max(w,h)*this.entre(.9,1.3)/retrato.larguraRosto,sh=sw*img.h/img.w;
  const fx=Math.min(Math.max(ponto[0]+this.entre(-.012,.012),w/(2*sw)+.01),1-w/(2*sw)-.01);
  const fy=Math.min(Math.max(ponto[1]+this.entre(-.012,.012),h/(2*sh)+.01),1-h/(2*sh)-.01);
  return 'background-image:url('+retrato.src+');background-size:'+num(sw)+'px '+num(sh)+'px;background-position:'+num(w/2-fx*sw)+'px '+num(h/2-fy*sh)+'px';
 }
 /* Triângulo irregular, esticado para ocupar a caixa inteira do caco. */
 triangulo(){
  const a0=this.entre(0,Math.PI*2),a1=a0+this.entre(1.5,2.7),a2=a1+this.entre(1.5,2.7);
  const bruto=[a0,a1,a2].map(a=>{const r=this.entre(.7,1);return [r*Math.cos(a),r*Math.sin(a)]});
  const xs=bruto.map(p=>p[0]),ys=bruto.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return bruto.map(p=>[num(3+94*(p[0]-minX)/(maxX-minX)),num(3+94*(p[1]-minY)/(maxY-minY))]);
 }
 /* Arestas trincadas: cada lado do triângulo ganha lascas pequenas para dentro, como vidro lascado. */
 lascar(tri){
  const cx=(tri[0][0]+tri[1][0]+tri[2][0])/3,cy=(tri[0][1]+tri[1][1]+tri[2][1])/3,saida=[];
  for(let k=0;k<3;k++){
   const a=tri[k],b=tri[(k+1)%3],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
   let nx=-dy/len,ny=dx/len;
   if((cx-(a[0]+b[0])/2)*nx+(cy-(a[1]+b[1])/2)*ny<0){nx=-nx;ny=-ny}
   saida.push(a);
   const n=Math.floor(this.entre(3,6));
   for(let i=1;i<n;i++){
    const t=(i+this.entre(-.3,.3))/n,d=this.rand()<.45?0:this.entre(.8,3);
    saida.push([num(a[0]+dx*t+nx*d),num(a[1]+dy*t+ny*d)]);
   }
  }
  return saida;
 }
 /* Rachaduras: uma ou duas linhas retas com uma ou duas quinas, que entram por uma aresta e saem por outra. */
 rachaduras(tri){
  const linhas=[],total=this.rand()<.5?2:1;
  const naAresta=(i,t)=>{const a=tri[i],b=tri[(i+1)%3];return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]};
  for(let k=0;k<total;k++){
   const i=Math.floor(this.entre(0,3)),j=(i+1+Math.floor(this.entre(0,2)))%3;
   const A=naAresta(i,this.entre(.15,.85)),B=naAresta(j,this.entre(.15,.85));
   const quinas=this.rand()<.5?2:1,caminho=[A];
   for(let q=1;q<=quinas;q++){
    const t=q/(quinas+1);
    caminho.push([A[0]+(B[0]-A[0])*t+this.entre(-12,12),A[1]+(B[1]-A[1])*t+this.entre(-12,12)]);
   }
   caminho.push(B);
   linhas.push('M'+caminho.map(p=>num(p[0])+','+num(p[1])).join(' L'));
  }
  return linhas;
 }
 agendar(){
  clearTimeout(this._timer);
  this._timer=setTimeout(()=>{
   const area=this.area(),W=area.clientWidth,H=area.clientHeight;
   if(W===this._ultimo[0]&&H===this._ultimo[1])return;
   this._ultimo=[W,H];this.construir(W,H);
  },200);
 }
 construir(W,H){
  this.seed=4096;
  const json=this.querySelector('script[type="application/json"]');
  this.textContent='';
  if(json)this.appendChild(json);
  if(!W||!H)return;
  this.style.setProperty('--hero-w',W+'px');this.style.setProperty('--hero-h',H+'px');
  const esp=this.cfg.espelho;
  if(esp){
   /* Mesmo tamanho que object-fit:cover dá à imagem de fundo na área. */
   const cover=Math.max(W/esp.largura,H/esp.altura);
   this.style.setProperty('--cover-w',num(esp.largura*cover)+'px');this.style.setProperty('--cover-h',num(esp.altura*cover)+'px');
  }
  const pequeno=this.mobile.matches,total=pequeno?this.cfg.quantidade.mobile:this.cfg.quantidade.desktop;
  const frag=document.createDocumentFragment();
  for(let i=0;i<total;i++)frag.appendChild(this.caco(W,H,pequeno));
  this.appendChild(frag);
 }
 caco(W,H,pequeno){
  const w=Math.round(pequeno?this.entre(80,160):this.entre(110,300)),h=Math.round(w*this.entre(.45,1.4));
  const tri=this.triangulo(),pts=this.lascar(tri);
  const el=document.createElement('div');el.className='shard-orbit';
  el.style.width=w+'px';el.style.height=h+'px';
  const pontos=pts.map(p=>p[0]+','+p[1]).join(' ');
  const rachaduras=this.rachaduras(tri).map(d=>'<path class="crack-shadow" transform="translate(.7 .7)" d="'+d+'"/><path class="crack" d="'+d+'"/>').join('');
  /* Espessura do vidro: uma lateral por segmento do contorno lascado, em px, girada para trás (rotateX(-90deg) leva o eixo y local para -z). */
  const grossura=Math.max(2,Math.round(Math.min(w,h)*.025));
  let laterais='';
  for(let k=0;k<pts.length;k++){
   const a=pts[k],b=pts[(k+1)%pts.length];
   const ax=a[0]/100*w,ay=a[1]/100*h,bx=b[0]/100*w,by=b[1]/100*h;
   laterais+='<div class="shard-side" style="width:'+num(Math.hypot(bx-ax,by-ay))+'px;height:'+grossura+'px;transform:translate('+num(ax)+'px,'+num(ay)+'px) rotate('+num(Math.atan2(by-ay,bx-ax))+'rad) rotateX(-90deg)"></div>';
  }
  const espelho=this.cfg.espelho?'<div class="shard-mirror" style="background-image:url('+this.cfg.espelho.src+');transform-origin:'+num(w/2+W/2)+'px '+num(h/2+H/2)+'px"></div>':'';
  const retratos=this.cfg.retratos.map(r=>'<div class="glass-portrait'+(r.id===this.atual?' ativo':'')+'" data-id="'+r.id+'" style="'+this.recorte(r,w,h)+'"></div>').join('');
  el.innerHTML='<div class="shard" style="--shape:'+pts.map(p=>p[0]+'% '+p[1]+'%').join(',')+'">'+laterais
   +'<div class="shard-face"><div class="shard-lens" style="--zoom:'+this.entre(1,1.1).toFixed(2)+';--flip:'+(this.rand()<.5?-1:1)+';--skew:'+this.entre(-10,10).toFixed(1)+'deg">'+espelho
   +'<div class="shard-glass" style="--hue:'+this.entre(-12,12).toFixed(0)+'deg">'+retratos+'</div></div>'
   +'<div class="shard-sheen" style="--sheen-angle:'+this.entre(75,155).toFixed(0)+'deg"></div>'
   +'<svg class="shard-edge" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon class="edge-glow" points="'+pontos+'"/>'+rachaduras+'<polygon class="edge-line" points="'+pontos+'"/></svg></div></div>';
  const caco=el.firstElementChild,brilho=el.querySelector('.shard-sheen'),reflexo=el.querySelector('.shard-mirror');
  const pose=(p,r)=>'translate('+num(p[0])+'px,'+num(p[1])+'px) rotate('+num(r)+'deg)';
  /* Inversa da órbita, em torno do centro do caco: mantém o reflexo alinhado ao fundo real. */
  const inversa=(p,r)=>'rotate('+num(-r)+'deg) translate('+num(-p[0])+'px,'+num(-p[1])+'px)';
  /* Eixo do tombo inclinado para a tela: o caco gira e inclina até ~80°, mas nunca fica de perfil (viraria uma linha) nem mostra o verso. */
  const az=this.entre(.72,.86),resto=Math.sqrt(1-az*az),ang=this.entre(0,Math.PI*2),ax=resto*Math.cos(ang),ay=resto*Math.sin(ang);
  const tombo=a=>'perspective(900px) rotate3d('+num(ax)+','+num(ay)+','+num(az)+','+num(a)+'deg)';
  if(this.reduzido.matches){
   const p=[this.entre(0,W-w),this.entre(0,H-h)],r=this.entre(-40,40);
   el.style.transform=pose(p,r);caco.style.transform=tombo(this.entre(-35,35));
   if(reflexo)reflexo.style.transform=inversa(p,r);
   return el;
  }
  const giro=this.entre(16000,34000),atrasoGiro=-this.entre(0,giro);
  caco.animate([{transform:tombo(0)},{transform:tombo(360)}],{duration:giro,iterations:Infinity,easing:'linear',delay:atrasoGiro});
  /* O brilho acende quando a face encara a tela (0°) e apaga na inclinação máxima (180°). */
  brilho.animate([{opacity:1,offset:0},{opacity:.2,offset:.5},{opacity:1,offset:1}],{duration:giro,iterations:Infinity,easing:'ease-in-out',delay:atrasoGiro});
  /* Caminho: entra por um lado, sai pelo oposto, com um leve desvio no meio. */
  const margem=Math.max(w,h)+40;
  let p0,p1;
  if(this.rand()<.7){const x=this.entre(-w*.5,W-w*.5);p0=[x,-margem];p1=[x+this.entre(-.4,.4)*W,H+margem]}
  else{const y=this.entre(-h*.5,H-h*.5),ida=this.rand()<.5;p0=[ida?-margem:W+margem,y];p1=[ida?W+margem:-margem,y+this.entre(-.35,.35)*H]}
  const meio=[(p0[0]+p1[0])/2+this.entre(-70,70),(p0[1]+p1[1])/2+this.entre(-40,40)];
  const r0=this.entre(-180,180),r1=r0+this.entre(-110,110);
  const quadros=[[p0,r0],[meio,(r0+r1)/2],[p1,r1]];
  const duracao=this.entre(32000,64000);
  const tempo={duration:duracao,iterations:Infinity,easing:'linear',delay:-this.entre(0,duracao)};
  el.animate(quadros.map(([p,r])=>({transform:pose(p,r)})),tempo);
  if(reflexo)reflexo.animate(quadros.map(([p,r])=>({transform:inversa(p,r)})),tempo);
  return el;
 }
}
customElements.define('fragmentos-espelho',FragmentosEspelho);
})();
