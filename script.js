const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
let img = null;

const fields = {
  awb:{x:58,y:17,w:40,h:4,size:10,align:'right',bold:true,label:'AWB'},
  destinatario:{x:54,y:54,w:42,h:3.5,size:8,align:'left',bold:true,label:'Destinatário'},
  rua:{x:54,y:58,w:43,h:3.5,size:8,align:'left',bold:true,label:'Rua'},
  numero:{x:54,y:61.5,w:18,h:3.5,size:8,align:'left',bold:true,label:'Número'},
  bairro:{x:54,y:65,w:20,h:3.5,size:8,align:'left',bold:true,label:'Bairro'},
  cep:{x:54,y:68.5,w:23,h:3.5,size:8,align:'left',bold:true,label:'CEP'},
  cidade:{x:54,y:72,w:32,h:3.5,size:8,align:'left',bold:true,label:'Cidade'},
  complemento:{x:54,y:77,w:40,h:3.5,size:8,align:'left',bold:true,label:'Complemento'},
  telefone:{x:54,y:80.5,w:38,h:3.5,size:8,align:'left',bold:true,label:'Telefone'}
};

function pct(v, total){ return v * total / 100; }
function val(id){ return $(id).value.trim(); }
function getAddressLines(){
  const rua = val('rua');
  const numero = val('numero');
  const bairro = val('bairro');
  const cep = val('cep');
  const cidade = val('cidade');
  const uf = val('uf').toUpperCase();
  const comp = val('complemento');
  const tel = val('telefone');
  return {
    destinatario: val('destinatario'),
    rua: rua ? `${rua}${numero ? ', ' + numero : ''}` : '',
    bairro: bairro ? `Bairro: ${bairro}` : '',
    cep: cep ? `CEP: ${cep}` : '',
    cidade: cidade ? `${cidade}${uf ? '/' + uf : ''}` : '',
    complemento: comp ? `Complemento: ${comp}` : '',
    telefone: tel ? `Telefone: ${tel}` : ''
  };
}

function whiteBox(f){
  const x=pct(f.x,canvas.width), y=pct(f.y,canvas.height), w=pct(f.w,canvas.width), h=pct(f.h,canvas.height);
  ctx.fillStyle='white'; ctx.fillRect(x,y,w,h);
}
function writeText(text,f){
  if(!text) return;
  const x=pct(f.x,canvas.width), y=pct(f.y,canvas.height), w=pct(f.w,canvas.width);
  ctx.fillStyle='black';
  ctx.font=`${f.bold?'700':'400'} ${f.size}px Arial`;
  ctx.textAlign=f.align || 'left';
  ctx.textBaseline='top';
  const tx = f.align === 'right' ? x+w-2 : x+2;
  ctx.fillText(text, tx, y+1);
}
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(img){ ctx.drawImage(img,0,0,canvas.width,canvas.height); }
  else { ctx.fillStyle='white'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#777'; ctx.font='12px Arial'; ctx.textAlign='center'; ctx.fillText('Suba a imagem da etiqueta original',canvas.width/2,canvas.height/2); return; }

  const data = getAddressLines();
  const awb = val('awb');
  if(awb){ whiteBox(fields.awb); writeText(`N° AWB ${awb}`, fields.awb); }

  ['destinatario','rua','bairro','cep','cidade','complemento','telefone'].forEach(k=>{
    if(data[k]){ whiteBox(fields[k]); writeText(data[k], fields[k]); }
  });

  if($('alerta').checked){
    const x=pct(54,canvas.width), y=pct(84,canvas.height), w=pct(43,canvas.width), h=pct(5,canvas.height);
    ctx.fillStyle='white'; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='black'; ctx.lineWidth=1; ctx.strokeRect(x,y,w,h);
    ctx.fillStyle='black'; ctx.font='700 8px Arial'; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('ENDEREÇO CORRIGIDO', x+w/2, y+3);
    ctx.font='700 6px Arial';
    ctx.fillText('CONSIDERAR ESTA INFORMAÇÃO', x+w/2, y+14);
  }
}

function buildPositionControls(){
  const box = $('positions');
  Object.entries(fields).forEach(([key,f])=>{
    ['x','y','w','h'].forEach(prop=>{
      const label = document.createElement('label');
      label.textContent = `${f.label} ${prop.toUpperCase()}`;
      const input = document.createElement('input');
      input.type='number'; input.step='0.5'; input.value=f[prop];
      input.addEventListener('input',()=>{ f[prop]=parseFloat(input.value)||0; render(); });
      label.appendChild(input); box.appendChild(label);
    });
  });
}

$('fileInput').addEventListener('change', e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    img = new Image();
    img.onload = ()=>{ canvas.width=img.width; canvas.height=img.height; render(); };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

['awb','destinatario','rua','numero','complemento','bairro','cep','cidade','uf','telefone','alerta'].forEach(id=>$(id).addEventListener('input', render));
$('renderBtn').addEventListener('click', render);
$('downloadBtn').addEventListener('click', ()=>{ const a=document.createElement('a'); a.download='etiqueta-corrigida.png'; a.href=canvas.toDataURL('image/png'); a.click(); });
$('printBtn').addEventListener('click', ()=>window.print());
buildPositionControls();
render();
