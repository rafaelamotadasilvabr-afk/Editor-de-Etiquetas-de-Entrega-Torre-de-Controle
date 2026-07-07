const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const pasteImageArea = document.getElementById('pasteImageArea');
const addressText = document.getElementById('addressText');
const emptyState = document.getElementById('emptyState');
const fileInput = document.getElementById('fileInput');

let originalImage = null;
let zoom = 1;
let lastAppliedText = '';
let block = null;
let drag = { active:false, dx:0, dy:0 };

function defaultBlock(){
  return {
    x: Math.round(canvas.width * 0.54),
    y: Math.round(canvas.height * 0.57),
    width: Math.round(canvas.width * 0.39),
    minHeight: Math.round(canvas.height * 0.19)
  };
}

function fitRightBlock(){
  if(!originalImage) return;
  block = {
    x: Math.round(canvas.width * 0.53),
    y: Math.round(canvas.height * 0.58),
    width: Math.round(canvas.width * 0.40),
    minHeight: Math.round(canvas.height * 0.18)
  };
  drawLabel();
}

function resetBlock(){
  if(!originalImage) return;
  block = defaultBlock();
  drawLabel();
}

function setZoom(value){
  zoom = Math.max(0.4, Math.min(2.5, value));
  canvas.style.transformOrigin = 'top center';
  canvas.style.transform = `scale(${zoom})`;
  canvas.style.marginBottom = `${Math.max(0, canvas.height * (zoom - 1))}px`;
  document.getElementById('zoomLabel').textContent = Math.round(zoom*100)+'%';
}

function loadImageFromFile(file){
  if(!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      originalImage = img;
      canvas.width = originalImage.width;
      canvas.height = originalImage.height;
      block = defaultBlock();
      drawLabel();
      pasteImageArea.classList.add('active');
      pasteImageArea.innerHTML = '<div class="paste-icon">✅</div><strong>Etiqueta colada</strong><small>Você pode colar outra imagem por cima</small>';
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function handlePaste(e){
  const items = e.clipboardData?.items || [];
  for(const item of items){
    if(item.type.startsWith('image/')){
      e.preventDefault();
      loadImageFromFile(item.getAsFile());
      return;
    }
  }
}

document.addEventListener('paste', (e)=>{
  if(document.activeElement === addressText) return;
  handlePaste(e);
});
pasteImageArea.addEventListener('paste', handlePaste);
pasteImageArea.addEventListener('click', ()=>pasteImageArea.focus());
document.getElementById('btnFile').addEventListener('click', ()=>fileInput.click());
fileInput.addEventListener('change', ()=>loadImageFromFile(fileInput.files[0]));

function normalizeIfNeeded(text){
  const keepExact = document.getElementById('keepExact').checked;
  if(keepExact) return text.replace(/\r\n/g,'\n').trimEnd();
  return text.replace(/\r\n/g,'\n').split('\n').map(l=>l.trim()).filter(Boolean).join('\n');
}

function wrapText(ctx, text, maxWidth){
  const lines = [];
  text.split('\n').forEach(raw => {
    if(raw.trim()==='') { lines.push(''); return; }
    const words = raw.split(/\s+/);
    let line = '';
    words.forEach(word => {
      const test = line ? line + ' ' + word : word;
      if(ctx.measureText(test).width > maxWidth && line){
        lines.push(line);
        line = word;
      }else line = test;
    });
    lines.push(line);
  });
  return lines;
}

function drawLabel(){
  if(!originalImage){
    canvas.width = 620; canvas.height = 850;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';
  canvas.width = originalImage.width;
  canvas.height = originalImage.height;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(originalImage,0,0);
  if(!block) block = defaultBlock();
  const text = normalizeIfNeeded(addressText.value || lastAppliedText || '');
  if(text.trim()) drawCorrectAddressBlock(text);
  setZoom(zoom);
}

function drawCorrectAddressBlock(text){
  const pos = block || defaultBlock();
  const pad = Math.max(7, Math.round(canvas.width * 0.011));
  const fontSize = Math.max(11, Math.round(canvas.width * 0.024));
  const titleSize = Math.max(12, Math.round(canvas.width * 0.027));
  const lineHeight = Math.round(fontSize * 1.22);

  ctx.save();
  ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  const contentWidth = pos.width - pad*2;
  const lines = wrapText(ctx, text, contentWidth);
  const blockHeight = Math.max(pos.minHeight, pad*3 + titleSize + (lines.length * lineHeight));
  block.height = blockHeight;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pos.x, pos.y, pos.width, blockHeight);
  ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.004));
  ctx.strokeStyle = '#d00000';
  ctx.strokeRect(pos.x, pos.y, pos.width, blockHeight);

  ctx.fillStyle = '#000000';
  ctx.font = `bold ${titleSize}px Arial, Helvetica, sans-serif`;
  ctx.fillText('ENDEREÇO CORRETO', pos.x + pad, pos.y + pad + titleSize);

  ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  let y = pos.y + pad*2 + titleSize + lineHeight;
  lines.forEach(line => {
    ctx.fillText(line, pos.x + pad, y);
    y += lineHeight;
  });
  ctx.restore();
}

function applyBlock(){
  lastAppliedText = addressText.value;
  drawLabel();
}

function clearAll(){
  originalImage = null;
  block = null;
  lastAppliedText = '';
  addressText.value = '';
  pasteImageArea.classList.remove('active');
  pasteImageArea.innerHTML = '<div class="paste-icon">📋</div><strong>Clique aqui e pressione Ctrl + V</strong><small>Cole o recorte da etiqueta original</small>';
  drawLabel();
}

function downloadPNG(){
  if(!originalImage){ alert('Cole a etiqueta original antes de baixar.'); return; }
  drawLabel();
  const a = document.createElement('a');
  a.download = 'etiqueta-endereco-correto.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

function printCanvas(){
  if(!originalImage){ alert('Cole a etiqueta original antes de imprimir.'); return; }
  drawLabel();
  const dataUrl = canvas.toDataURL('image/png');
  const win = window.open('', '_blank');
  win.document.write(`<!doctype html><html><head><title>Imprimir etiqueta</title><style>
    @page{margin:0} body{margin:0;display:flex;align-items:flex-start;justify-content:center;background:#fff}
    img{max-width:100%;height:auto;display:block}
  </style></head><body><img src="${dataUrl}" onload="setTimeout(()=>{window.print();},250)"></body></html>`);
  win.document.close();
}

function canvasPoint(evt){
  const r = canvas.getBoundingClientRect();
  return { x:(evt.clientX-r.left)/zoom, y:(evt.clientY-r.top)/zoom };
}

canvas.addEventListener('pointerdown', (e)=>{
  if(!originalImage || !block || !addressText.value.trim()) return;
  const p = canvasPoint(e);
  if(p.x >= block.x && p.x <= block.x + block.width && p.y >= block.y && p.y <= block.y + (block.height || block.minHeight)){
    drag.active = true;
    drag.dx = p.x - block.x;
    drag.dy = p.y - block.y;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  }
});

canvas.addEventListener('pointermove', (e)=>{
  if(!drag.active) return;
  const p = canvasPoint(e);
  block.x = Math.max(0, Math.min(canvas.width - block.width, Math.round(p.x - drag.dx)));
  block.y = Math.max(0, Math.min(canvas.height - (block.height || block.minHeight), Math.round(p.y - drag.dy)));
  drawLabel();
});

canvas.addEventListener('pointerup', (e)=>{
  drag.active = false;
  canvas.classList.remove('dragging');
  try{ canvas.releasePointerCapture(e.pointerId); }catch(err){}
});

canvas.addEventListener('pointercancel', ()=>{
  drag.active = false;
  canvas.classList.remove('dragging');
});

document.getElementById('btnApply').addEventListener('click', applyBlock);
document.getElementById('btnApply2').addEventListener('click', applyBlock);
document.getElementById('btnClear').addEventListener('click', clearAll);
document.getElementById('btnDownload').addEventListener('click', downloadPNG);
document.getElementById('btnPrint').addEventListener('click', printCanvas);
document.getElementById('zoomIn').addEventListener('click', ()=>setZoom(zoom+0.1));
document.getElementById('zoomOut').addEventListener('click', ()=>setZoom(zoom-0.1));
document.getElementById('btnResetPos').addEventListener('click', resetBlock);
document.getElementById('btnFit').addEventListener('click', fitRightBlock);
addressText.addEventListener('input', applyBlock);
document.getElementById('keepExact').addEventListener('change', drawLabel);

drawLabel();
setZoom(1);
