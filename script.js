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
let manualSize = false;
const blockWidthInput = document.getElementById('blockWidth');
const blockHeightInput = document.getElementById('blockHeight');
const fontScaleInput = document.getElementById('fontScale');

function defaultBlock(){
  return {
    x: Math.round(canvas.width * 0.54),
    y: Math.round(canvas.height * 0.57),
    width: Math.round(canvas.width * 0.39),
    minHeight: Math.round(canvas.height * 0.19),
    mode: 'address',
    fontScale: 1
  };
}

function fitRightBlock(){
  if(!originalImage) return;
  const text = normalizeIfNeeded(addressText.value || lastAppliedText || '');
  if(isPhoneOnly(text)){
    block = phoneDefaultBlock();
  }else{
    block = {
      x: Math.round(canvas.width * 0.53),
      y: Math.round(canvas.height * 0.58),
      width: Math.round(canvas.width * 0.40),
      minHeight: Math.round(canvas.height * 0.18),
      mode: 'address',
      fontScale: block?.fontScale || 1
    };
  }
  syncControlsFromBlock();
  drawLabel();
}

function resetBlock(){
  if(!originalImage) return;
  const text = normalizeIfNeeded(addressText.value || lastAppliedText || '');
  manualSize = false;
  block = isPhoneOnly(text) ? phoneDefaultBlock() : defaultBlock();
  syncControlsFromBlock();
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
      syncControlsFromBlock();
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

function compactText(text){
  return (text || '').replace(/\r\n/g,'\n').trim();
}

function isPhoneOnly(text){
  const t = compactText(text);
  if(!t) return false;
  // Aceita apenas telefone puro: dígitos, espaços, +, -, parênteses e quebras de linha.
  // Ex.: 11974929028 | (11) 97492-9028 | +55 11 97492-9028
  if(!/^[\d\s()+\-.]+$/.test(t)) return false;
  const digits = t.replace(/\D/g,'');
  return digits.length >= 8 && digits.length <= 15;
}

function phoneDefaultBlock(){
  return {
    x: Math.round(canvas.width * 0.54),
    y: Math.round(canvas.height * 0.69),
    width: Math.round(canvas.width * 0.31),
    minHeight: Math.round(canvas.height * 0.055),
    mode: 'phone',
    fontScale: 1
  };
}


function updateSizeLabels(){
  if(blockWidthInput) document.getElementById('blockWidthLabel').textContent = `${blockWidthInput.value}%`;
  if(blockHeightInput) document.getElementById('blockHeightLabel').textContent = `${blockHeightInput.value}%`;
  if(fontScaleInput) document.getElementById('fontScaleLabel').textContent = `${fontScaleInput.value}%`;
}

function syncControlsFromBlock(){
  if(!canvas.width || !block) return;
  const w = Math.round((block.width / canvas.width) * 100);
  const h = Math.round((block.minHeight / canvas.height) * 100);
  if(blockWidthInput) blockWidthInput.value = Math.max(+blockWidthInput.min, Math.min(+blockWidthInput.max, w));
  if(blockHeightInput) blockHeightInput.value = Math.max(+blockHeightInput.min, Math.min(+blockHeightInput.max, h));
  if(fontScaleInput) fontScaleInput.value = Math.round((block.fontScale || 1) * 100);
  updateSizeLabels();
}

function applySizeControls(){
  if(!originalImage || !block) return;
  manualSize = true;
  const widthPct = Number(blockWidthInput.value || 31) / 100;
  const heightPct = Number(blockHeightInput.value || 6) / 100;
  block.width = Math.round(canvas.width * widthPct);
  block.minHeight = Math.round(canvas.height * heightPct);
  block.fontScale = Number(fontScaleInput.value || 100) / 100;
  block.x = Math.max(0, Math.min(canvas.width - block.width, block.x));
  block.y = Math.max(0, Math.min(canvas.height - (block.height || block.minHeight), block.y));
  updateSizeLabels();
  drawLabel();
}

function setPhonePreset(){
  if(!originalImage) return;
  if(!block) block = phoneDefaultBlock();
  block.width = Math.round(canvas.width * 0.22);
  block.minHeight = Math.round(canvas.height * 0.04);
  block.fontScale = 0.85;
  block.mode = 'phone';
  block.x = Math.round(canvas.width * 0.57);
  block.y = Math.round(canvas.height * 0.66);
  manualSize = true;
  syncControlsFromBlock();
  drawLabel();
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
  if(text.trim()){
    if(isPhoneOnly(text)){
      if(!block || block.mode !== 'phone') block = phoneDefaultBlock();
      drawPhoneOnlyBlock(text);
    }else{
      if(!block || block.mode === 'phone') block = defaultBlock();
      drawCorrectAddressBlock(text);
    }
  }
  setZoom(zoom);
}


function drawPhoneOnlyBlock(text){
  const pos = block || phoneDefaultBlock();
  const pad = Math.max(5, Math.round(canvas.width * 0.008));
  const fontSize = Math.max(9, Math.round(canvas.width * 0.023 * (pos.fontScale || 1)));
  const lineHeight = Math.round(fontSize * 1.22);

  ctx.save();
  ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  const contentWidth = pos.width - pad*2;
  const lines = wrapText(ctx, text, contentWidth);
  const blockHeight = Math.max(pos.minHeight, pad*2 + (lines.length * lineHeight));
  block.height = blockHeight;
  block.mode = 'phone';
  block.fontScale = pos.fontScale || 1;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pos.x, pos.y, pos.width, blockHeight);
  ctx.lineWidth = Math.max(1, Math.round(canvas.width * 0.0025));
  ctx.strokeStyle = '#d00000';
  ctx.strokeRect(pos.x, pos.y, pos.width, blockHeight);

  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  let y = pos.y + pad + fontSize;
  lines.forEach(line => {
    ctx.fillText(line, pos.x + pad, y);
    y += lineHeight;
  });
  ctx.restore();
}

function drawCorrectAddressBlock(text){
  const pos = block || defaultBlock();
  block.mode = 'address';
  block.fontScale = pos.fontScale || 1;
  const pad = Math.max(7, Math.round(canvas.width * 0.011));
  const fontSize = Math.max(9, Math.round(canvas.width * 0.024 * (pos.fontScale || 1)));
  const lineHeight = Math.round(fontSize * 1.22);

  ctx.save();
  ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  const contentWidth = pos.width - pad*2;
  const lines = wrapText(ctx, text, contentWidth);
  const blockHeight = Math.max(pos.minHeight, pad*2 + (lines.length * lineHeight));
  block.height = blockHeight;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pos.x, pos.y, pos.width, blockHeight);
  ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.004));
  ctx.strokeStyle = '#d00000';
  ctx.strokeRect(pos.x, pos.y, pos.width, blockHeight);

  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  let y = pos.y + pad + fontSize;
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

function drawExportBlock(exportCtx, exportCanvas, exportBlock, text){
  const isPhone = isPhoneOnly(text);
  const pad = Math.max(isPhone ? 5 : 7, Math.round(exportCanvas.width * (isPhone ? 0.008 : 0.011)));
  const fontSize = Math.max(9 * EXPORT_SCALE, Math.round(exportCanvas.width * (isPhone ? 0.023 : 0.024) * (exportBlock.fontScale || 1)));
  const lineHeight = Math.round(fontSize * 1.22);

  exportCtx.save();
  exportCtx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  exportCtx.textBaseline = 'alphabetic';

  const contentWidth = exportBlock.width - pad * 2;
  const lines = wrapText(exportCtx, text, contentWidth);
  const blockHeight = Math.max(exportBlock.minHeight, pad * 2 + (lines.length * lineHeight));

  exportCtx.fillStyle = '#ffffff';
  exportCtx.fillRect(exportBlock.x, exportBlock.y, exportBlock.width, blockHeight);

  exportCtx.lineWidth = Math.max(isPhone ? 1 : 2, Math.round(exportCanvas.width * (isPhone ? 0.0025 : 0.004)));
  exportCtx.strokeStyle = '#d00000';
  exportCtx.strokeRect(exportBlock.x, exportBlock.y, exportBlock.width, blockHeight);

  exportCtx.fillStyle = '#000000';
  let y = exportBlock.y + pad + fontSize;
  lines.forEach(line => {
    exportCtx.fillText(line, exportBlock.x + pad, y);
    y += lineHeight;
  });

  exportCtx.restore();
}

const EXPORT_SCALE = 4;

function renderExportCanvas(scale = EXPORT_SCALE){
  drawLabel();

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = originalImage.width * scale;
  exportCanvas.height = originalImage.height * scale;

  const exportCtx = exportCanvas.getContext('2d');
  exportCtx.imageSmoothingEnabled = false;
  exportCtx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
  exportCtx.drawImage(originalImage, 0, 0, exportCanvas.width, exportCanvas.height);

  const text = normalizeIfNeeded(addressText.value || lastAppliedText || '');
  if(text.trim() && block){
    const exportBlock = {
      x: Math.round(block.x * scale),
      y: Math.round(block.y * scale),
      width: Math.round(block.width * scale),
      minHeight: Math.round((block.minHeight || block.height || 40) * scale),
      height: Math.round((block.height || block.minHeight || 40) * scale),
      mode: block.mode,
      fontScale: block.fontScale || 1
    };
    drawExportBlock(exportCtx, exportCanvas, exportBlock, text);
  }

  return exportCanvas;
}

function downloadPNG(){
  if(!originalImage){ alert('Cole a etiqueta original antes de baixar.'); return; }
  const exportCanvas = renderExportCanvas(EXPORT_SCALE);
  const a = document.createElement('a');
  a.download = 'etiqueta-endereco-correto.png';
  a.href = exportCanvas.toDataURL('image/png');
  a.click();
}

function printCanvas(){
  if(!originalImage){ alert('Cole a etiqueta original antes de imprimir.'); return; }
  const exportCanvas = renderExportCanvas(EXPORT_SCALE);
  const dataUrl = exportCanvas.toDataURL('image/png');
  const printWidth = originalImage.width;
  const win = window.open('', '_blank');
  win.document.write(`<!doctype html><html><head><title>Imprimir etiqueta</title><style>
    @page{margin:0} html,body{margin:0;padding:0;background:#fff}
    body{display:flex;align-items:flex-start;justify-content:center}
    img{width:${printWidth}px;max-width:100%;height:auto;display:block;image-rendering:auto}
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
document.getElementById('btnPhonePreset').addEventListener('click', setPhonePreset);
[blockWidthInput, blockHeightInput, fontScaleInput].forEach(el => el && el.addEventListener('input', applySizeControls));
addressText.addEventListener('input', applyBlock);
document.getElementById('keepExact').addEventListener('change', drawLabel);

updateSizeLabels();
drawLabel();
setZoom(1);
