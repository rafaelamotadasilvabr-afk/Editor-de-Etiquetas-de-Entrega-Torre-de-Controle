const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
let img = null;
let zoom = 1;

const fields = {
  destinatario:{x:54,y:54,w:42,h:3.6,size:8,align:'left',bold:true,label:'Destinatário'},
  enderecoCorreto:{x:52,y:66,w:45,h:28,size:8,align:'left',bold:true,label:'Bloco endereço correto'}
};

const editableIds = ['destinatario','enderecoCorreto','complementoCorreto','bairroCorreto','cidadeDestinoCorreta','cepCorreto','referenciaCorreta','telefoneCorreto','tituloCorreto'];

function pct(v, total){ return v * total / 100; }
function val(id){ return ($(id)?.value || '').trim(); }
function px(n){ return Math.max(1, Math.round(n)); }
function norm(s){ return String(s || '').replace(/\r/g,'').trim(); }

function setCanvasDisplay(){
  const base = Math.min(canvas.width, 620);
  canvas.style.setProperty('--canvas-width', `${px(base * zoom)}px`);
  $('zoomLabel').textContent = `${Math.round(zoom*100)}%`;
}

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
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '';
  for(let n=0;n<words.length;n++){
    const testLine = line + words[n] + ' ';
    if(ctx.measureText(testLine).width > maxWidth && n > 0){
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

function readFieldFromBlock(text, label, nextLabels){
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const next = nextLabels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`${escaped}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${next})\\s*:|$)`, 'i');
  const m = text.match(re);
  return m ? norm(m[1]).replace(/\n+/g, ' ') : '';
}

function parseBlock(){
  const text = norm($('blocoEndereco').value);
  if(!text) return;
  const labels = ['Destinatário','Destinatario','Endereço','Endereco','Bairro','Cidade/UF','Cidade UF','Ponto de Referência','Ponto de Referencia','CEP','Contato','Telefone','Complemento'];

  const destinatario = readFieldFromBlock(text, 'Destinatário', labels) || readFieldFromBlock(text, 'Destinatario', labels);
  const endereco = readFieldFromBlock(text, 'Endereço', labels) || readFieldFromBlock(text, 'Endereco', labels);
  const bairro = readFieldFromBlock(text, 'Bairro', labels);
  const cidade = readFieldFromBlock(text, 'Cidade/UF', labels) || readFieldFromBlock(text, 'Cidade UF', labels);
  const referencia = readFieldFromBlock(text, 'Ponto de Referência', labels) || readFieldFromBlock(text, 'Ponto de Referencia', labels);
  const cep = readFieldFromBlock(text, 'CEP', labels).replace(/\s+-\s+/g,'-').replace(/\s+/g,'');
  const contato = readFieldFromBlock(text, 'Contato', labels) || readFieldFromBlock(text, 'Telefone', labels);
  const complemento = readFieldFromBlock(text, 'Complemento', labels);

  if(destinatario) $('destinatario').value = destinatario;
  if(endereco) $('enderecoCorreto').value = endereco;
  if(complemento) $('complementoCorreto').value = complemento;
  if(bairro) $('bairroCorreto').value = bairro;
  if(cidade) $('cidadeDestinoCorreta').value = cidade;
  if(referencia) $('referenciaCorreta').value = referencia;
  if(cep) $('cepCorreto').value = cep;
  if(contato) $('telefoneCorreto').value = contato;

  render();
}

function drawCorrectAddressBlock(){
  const f = fields.enderecoCorreto;
  const x=pct(f.x,canvas.width), y=pct(f.y,canvas.height), w=pct(f.w,canvas.width), h=pct(f.h,canvas.height);
  const destinatario = val('destinatario');
  const endereco = val('enderecoCorreto');
  const complemento = val('complementoCorreto');
  const bairro = val('bairroCorreto');
  const cidade = val('cidadeDestinoCorreta');
  const cep = val('cepCorreto');
  const referencia = val('referenciaCorreta');
  const telefone = val('telefoneCorreto');
  const hasAny = destinatario || endereco || complemento || bairro || cidade || cep || referencia || telefone;
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
    ctx.font='700 9px Arial';
    ctx.fillText('ENDEREÇO CORRETO', left, cursorY);
    cursorY += 11;
  }

  const line = (label, value, uppercase = false) => {
    if(!value) return;
    ctx.font='700 7.5px Arial';
    ctx.fillText(label, left, cursorY);
    cursorY += 8;
    ctx.font='700 8px Arial';
    cursorY = wrapText(uppercase ? value.toUpperCase() : value, left, cursorY, max, 9);
    cursorY += 2;
  };

  line('Destinatário:', destinatario, true);
  line('Endereço:', endereco, true);
  line('Complemento:', complemento, false);
  line('Bairro:', bairro, true);
  line('Cidade/UF:', cidade, false);
  line('CEP:', cep, false);
  line('Ponto de Referência:', referencia, false);
  line('Contato:', telefone, false);
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

  const destinatario = val('destinatario');
  if(destinatario){ whiteBox(fields.destinatario); writeSingle(destinatario.toUpperCase(), fields.destinatario); }
  drawCorrectAddressBlock();
}

function buildPositionControls(){
  const box = $('positions');
  box.innerHTML = '';
  Object.entries(fields).forEach(([key,f])=>{
    ['x','y','w','h'].forEach(prop=>{
      const label = document.createElement('label');
      label.textContent = `${f.label} ${prop.toUpperCase()}`;
      const input = document.createElement('input');
      input.type='number'; input.step='0.2'; input.value=f[prop];
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
      setCanvasDisplay();
      render();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

editableIds.forEach(id=>$(id).addEventListener('input', render));
$('parseBtn').addEventListener('click', parseBlock);
$('blocoEndereco').addEventListener('paste',()=> setTimeout(parseBlock, 80));
$('clearFieldsBtn').addEventListener('click',()=>{
  editableIds.filter(id=>id !== 'tituloCorreto').forEach(id=>$(id).value='');
  render();
});
$('downloadBtn').addEventListener('click', ()=>{ render(); const a=document.createElement('a'); a.download='etiqueta-endereco-correto.png'; a.href=canvas.toDataURL('image/png'); a.click(); });
$('printBtn').addEventListener('click', ()=>{ render(); window.print(); });
$('zoomIn').addEventListener('click',()=>{ zoom=Math.min(2, zoom+0.1); setCanvasDisplay(); });
$('zoomOut').addEventListener('click',()=>{ zoom=Math.max(0.4, zoom-0.1); setCanvasDisplay(); });
$('fitBtn').addEventListener('click',()=>{ zoom=1; setCanvasDisplay(); });

buildPositionControls();
setCanvasDisplay();
render();
