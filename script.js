const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
let img = null;

const fields = {
  awb:{x:58,y:17,w:40,h:4,size:10,align:'right',bold:true,label:'AWB'},
  destinatario:{x:54,y:54,w:42,h:3.6,size:8,align:'left',bold:true,label:'Destinatário'},
  enderecoCorreto:{x:54,y:69.2,w:43,h:20.8,size:8,align:'left',bold:true,label:'Bloco endereço correto'}
};

function pct(v, total){ return v * total / 100; }
function val(id){ return ($(id)?.value || '').trim(); }

function whiteBox(f){
  const x=pct(f.x,canvas.width), y=pct(f.y,canvas.height), w=pct(f.w,canvas.width), h=pct(f.h,canvas.height);
  ctx.fillStyle='white';
  ctx.fillRect(x,y,w,h);
}

function writeSingle(text,f){
  if(!text) return;
  const x=pct(f.x,canvas.width), y=pct(f.y,canvas.height), w=pct(f.w,canvas.width);
  ctx.fillStyle='black';
  ctx.font=`${f.bold?'700':'400'} ${f.size}px Arial`;
  ctx.textAlign=f.align || 'left';
  ctx.textBaseline='top';
  const tx = f.align === 'right' ? x+w-2 : x+2;
  ctx.fillText(text, tx, y+1);
}

function wrapText(text, x, y, maxWidth, lineHeight){
  const words = String(text || '').split(' ');
  let line = '';
  for(let n=0;n<words.length;n++){
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if(metrics.width > maxWidth && n > 0){
      ctx.fillText(line.trim(), x, y);
      line = words[n] + ' ';
      y += lineHeight;
    }else{
      line = testLine;
    }
  }
  if(line.trim()) ctx.fillText(line.trim(), x, y);
  return y + lineHeight;
}

function drawCorrectAddressBlock(){
  const f = fields.enderecoCorreto;
  const x=pct(f.x,canvas.width), y=pct(f.y,canvas.height), w=pct(f.w,canvas.width), h=pct(f.h,canvas.height);
  const endereco = val('enderecoCorreto');
  const linha2 = val('linhaEndereco2');
  const complemento = val('complementoCorreto');
  const cidade = val('cidadeDestinoCorreta');
  const telefone = val('telefoneCorreto');
  const hasAny = endereco || linha2 || complemento || cidade || telefone;
  if(!hasAny) return;

  ctx.fillStyle='white';
  ctx.fillRect(x,y,w,h);
  ctx.strokeStyle='black';
  ctx.lineWidth=1;
  ctx.strokeRect(x,y,w,h);

  let cursorY = y + 4;
  const left = x + 4;
  const max = w - 8;
  ctx.textAlign='left';
  ctx.textBaseline='top';
  ctx.fillStyle='black';

  if($('tituloCorreto').checked){
    ctx.font='700 8px Arial';
    ctx.fillText('ENDEREÇO CORRETO', left, cursorY);
    cursorY += 10;
  }

  ctx.font='700 7.5px Arial';
  ctx.fillText('Endereço:', left, cursorY);
  cursorY += 8;
  ctx.font='700 8px Arial';
  if(endereco) cursorY = wrapText(endereco.toUpperCase(), left, cursorY, max, 9);
  if(linha2) cursorY = wrapText(linha2.toUpperCase(), left, cursorY, max, 9);

  cursorY += 2;
  ctx.font='700 7.5px Arial';
  ctx.fillText('Complemento:', left, cursorY);
  cursorY += 8;
  ctx.font='700 8px Arial';
  if(complemento) cursorY = wrapText(complemento, left, cursorY, max, 9);

  cursorY += 2;
  ctx.font='700 7.5px Arial';
  ctx.fillText('Cidade destino:', left, cursorY);
  cursorY += 8;
  ctx.font='700 8px Arial';
  if(cidade) cursorY = wrapText(cidade, left, cursorY, max, 9);

  cursorY += 2;
  ctx.font='700 7.5px Arial';
  ctx.fillText('Telefone:', left, cursorY);
  cursorY += 8;
  ctx.font='700 8px Arial';
  if(telefone) wrapText(telefone, left, cursorY, max, 9);
}

function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(img){
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
  }else{
    ctx.fillStyle='white';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#777';
    ctx.font='12px Arial';
    ctx.textAlign='center';
    ctx.fillText('Suba a imagem da etiqueta original',canvas.width/2,canvas.height/2);
    return;
  }

  const awb = val('awb');
  if(awb){
    whiteBox(fields.awb);
    writeSingle(`N° AWB ${awb}`, fields.awb);
  }

  const destinatario = val('destinatario');
  if(destinatario){
    whiteBox(fields.destinatario);
    writeSingle(destinatario.toUpperCase(), fields.destinatario);
  }

  drawCorrectAddressBlock();
}

function buildPositionControls(){
  const box = $('positions');
  Object.entries(fields).forEach(([key,f])=>{
    ['x','y','w','h'].forEach(prop=>{
      const label = document.createElement('label');
      label.textContent = `${f.label} ${prop.toUpperCase()}`;
      const input = document.createElement('input');
      input.type='number';
      input.step='0.2';
      input.value=f[prop];
      input.addEventListener('input',()=>{ f[prop]=parseFloat(input.value)||0; render(); });
      label.appendChild(input);
      box.appendChild(label);
    });
  });
}

$('fileInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    img = new Image();
    img.onload = ()=>{
      canvas.width=img.width;
      canvas.height=img.height;
      render();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

['awb','destinatario','enderecoCorreto','linhaEndereco2','complementoCorreto','cidadeDestinoCorreta','telefoneCorreto','tituloCorreto']
  .forEach(id=>$(id).addEventListener('input', render));

$('renderBtn').addEventListener('click', render);
$('downloadBtn').addEventListener('click', ()=>{
  const a=document.createElement('a');
  a.download='etiqueta-endereco-correto.png';
  a.href=canvas.toDataURL('image/png');
  a.click();
});
$('printBtn').addEventListener('click', ()=>window.print());

buildPositionControls();
render();
