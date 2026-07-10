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
let settingVolumePosition = false;
let volumeField = null;

const blockWidthInput = document.getElementById('blockWidth');
const blockHeightInput = document.getElementById('blockHeight');
const fontScaleInput = document.getElementById('fontScale');
const volumeCountInput = document.getElementById('volumeCount');
const btnSetVolumePos = document.getElementById('btnSetVolumePos');
const EXPORT_SCALE = 4;

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

function defaultVolumeField(){
  return {
    x: Math.round(canvas.width * 0.835),
    y: Math.round(canvas.height * 0.12),
    width: Math.round(canvas.width * 0.10),
    height: Math.round(canvas.height * 0.045),
    fontScale: 1
  };
}

function fitRightBlock(){
  if(!originalImage) return;
  const text = normalizeIfNeeded(addressText.value || lastAppliedText || '');
  block = isPhoneOnly(text) ? phoneDefaultBlock() : {
    x: Math.round(canvas.width * 0.53),
    y: Math.round(canvas.height * 0.58),
    width: Math.round(canvas.width * 0.40),
    minHeight: Math.round(canvas.height * 0.18),
    mode: 'address',
    fontScale: block?.fontScale || 1
  };
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
  document.getElementById('zoomLabel').textContent = Math.round(zoom * 100) + '%';
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
      volumeField = defaultVolumeField();
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

document.addEventListener('paste', (e) => {
  if(document.activeElement === addressText) return;
  handlePaste(e);
});
pasteImageArea.addEventListener('paste', handlePaste);
pasteImageArea.addEventListener('click', () => pasteImageArea.focus());
document.getElementById('btnFile').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => loadImageFromFile(fileInput.files[0]));

function normalizeIfNeeded(text){
  const keepExact = document.getElementById('keepExact').checked;
  if(keepExact) return text.replace(/\r\n/g, '\n').trimEnd();
  return text.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean).join('\n');
}

function compactText(text){
  return (text || '').replace(/\r\n/g, '\n').trim();
}

function isPhoneOnly(text){
  const t = compactText(text);
  if(!t) return false;
  if(!/^[\d\s()+\-.]+$/.test(t)) return false;
  const digits = t.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

function getVolumeCount(){
  const n = parseInt(volumeCountInput?.value || '1', 10);
  return Math.max(1, Math.min(500, Number.isFinite(n) ? n : 1));
}

function volumeText(index, total){
  return total > 1 ? `${index}/${total}` : '';
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
  block.width = Math.round(canvas.width * (Number(blockWidthInput.value || 31) / 100));
  block.minHeight = Math.round(canvas.height * (Number(blockHeightInput.value || 6) / 100));
  block.fontScale = Number(fontScaleInput.value || 100) / 100;
  block.x = Math.max(0, Math.min(canvas.width - block.width, block.x));
  block.y = Math.max(0, Math.min(canvas.height - (block.height || block.minHeight), block.y));
  updateSizeLabels();
  drawLabel();
}

function setPhonePreset(){
  if(!originalImage) return;
  block = phoneDefaultBlock();
  block.width = Math.round(canvas.width * 0.22);
  block.minHeight = Math.round(canvas.height * 0.04);
  block.fontScale = 0.85;
  block.x = Math.round(canvas.width * 0.57);
  block.y = Math.round(canvas.height * 0.66);
  manualSize = true;
  syncControlsFromBlock();
  drawLabel();
}

function wrapText(context, text, maxWidth){
  const lines = [];
  text.split('\n').forEach(raw => {
    if(raw.trim() === '') { lines.push(''); return; }
    const words = raw.split(/\s+/);
    let line = '';
    words.forEach(word => {
      const test = line ? line + ' ' + word : word;
      if(context.measureText(test).width > maxWidth && line){
        lines.push(line);
        line = word;
      }else{
        line = test;
      }
    });
    lines.push(line);
  });
  return lines;
}

function drawVolumeValue(context, targetCanvas, field, index, total, showGuide = false){
  if(total <= 1 || !field) return;
  const value = volumeText(index, total);
  const fontSize = Math.max(10, Math.round(field.height * 0.58 * (field.fontScale || 1)));

  context.save();
  context.fillStyle = '#ffffff';
  context.fillRect(field.x, field.y, field.width, field.height);
  context.fillStyle = '#000000';
  context.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(value, field.x + field.width / 2, field.y + field.height / 2);
  if(showGuide){
    context.strokeStyle = '#2563eb';
    context.lineWidth = Math.max(1, Math.round(targetCanvas.width * 0.002));
    context.setLineDash([6, 4]);
    context.strokeRect(field.x, field.y, field.width, field.height);
    context.setLineDash([]);
  }
  context.restore();
}

function drawLabel(){
  if(!originalImage){
    canvas.width = 620;
    canvas.height = 850;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';
  canvas.width = originalImage.width;
  canvas.height = originalImage.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(originalImage, 0, 0);

  if(!block) block = defaultBlock();
  if(!volumeField) volumeField = defaultVolumeField();

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

  const total = getVolumeCount();
  drawVolumeValue(ctx, canvas, volumeField, 1, total, settingVolumePosition);
  setZoom(zoom);
}

function drawPhoneOnlyBlock(text){
  const pos = block || phoneDefaultBlock();
  const pad = Math.max(5, Math.round(canvas.width * 0.008));
  const fontSize = Math.max(9, Math.round(canvas.width * 0.023 * (pos.fontScale || 1)));
  const lineHeight = Math.round(fontSize * 1.22);
  ctx.save();
  ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  const lines = wrapText(ctx, text, pos.width - pad * 2);
  const blockHeight = Math.max(pos.minHeight, pad * 2 + lines.length * lineHeight);
  block.height = blockHeight;
  block.mode = 'phone';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pos.x, pos.y, pos.width, blockHeight);
  ctx.lineWidth = Math.max(1, Math.round(canvas.width * 0.0025));
  ctx.strokeStyle = '#d00000';
  ctx.strokeRect(pos.x, pos.y, pos.width, blockHeight);
  ctx.fillStyle = '#000000';
  let y = pos.y + pad + fontSize;
  lines.forEach(line => { ctx.fillText(line, pos.x + pad, y); y += lineHeight; });
  ctx.restore();
}

function drawCorrectAddressBlock(text){
  const pos = block || defaultBlock();
  block.mode = 'address';
  const pad = Math.max(7, Math.round(canvas.width * 0.011));
  const fontSize = Math.max(9, Math.round(canvas.width * 0.024 * (pos.fontScale || 1)));
  const lineHeight = Math.round(fontSize * 1.22);
  ctx.save();
  ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  const lines = wrapText(ctx, text, pos.width - pad * 2);
  const blockHeight = Math.max(pos.minHeight, pad * 2 + lines.length * lineHeight);
  block.height = blockHeight;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pos.x, pos.y, pos.width, blockHeight);
  ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.004));
  ctx.strokeStyle = '#d00000';
  ctx.strokeRect(pos.x, pos.y, pos.width, blockHeight);
  ctx.fillStyle = '#000000';
  let y = pos.y + pad + fontSize;
  lines.forEach(line => { ctx.fillText(line, pos.x + pad, y); y += lineHeight; });
  ctx.restore();
}

function applyBlock(){
  lastAppliedText = addressText.value;
  drawLabel();
}

function clearAll(){
  originalImage = null;
  block = null;
  volumeField = null;
  lastAppliedText = '';
  addressText.value = '';
  if(volumeCountInput) volumeCountInput.value = '1';
  settingVolumePosition = false;
  btnSetVolumePos?.classList.remove('primary');
  pasteImageArea.classList.remove('active');
  pasteImageArea.innerHTML = '<div class="paste-icon">📋</div><strong>Clique aqui e pressione Ctrl + V</strong><small>Cole o recorte da etiqueta original</small>';
  drawLabel();
}

function drawExportBlock(exportCtx, exportCanvas, exportBlock, text){
  const isPhone = isPhoneOnly(text);
  const pad = Math.max((isPhone ? 5 : 7) * EXPORT_SCALE, Math.round(exportCanvas.width * (isPhone ? 0.008 : 0.011)));
  const fontSize = Math.max(9 * EXPORT_SCALE, Math.round(exportCanvas.width * (isPhone ? 0.023 : 0.024) * (exportBlock.fontScale || 1)));
  const lineHeight = Math.round(fontSize * 1.22);
  exportCtx.save();
  exportCtx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  const lines = wrapText(exportCtx, text, exportBlock.width - pad * 2);
  const blockHeight = Math.max(exportBlock.minHeight, pad * 2 + lines.length * lineHeight);
  exportCtx.fillStyle = '#ffffff';
  exportCtx.fillRect(exportBlock.x, exportBlock.y, exportBlock.width, blockHeight);
  exportCtx.lineWidth = Math.max(isPhone ? 1 : 2, Math.round(exportCanvas.width * (isPhone ? 0.0025 : 0.004)));
  exportCtx.strokeStyle = '#d00000';
  exportCtx.strokeRect(exportBlock.x, exportBlock.y, exportBlock.width, blockHeight);
  exportCtx.fillStyle = '#000000';
  let y = exportBlock.y + pad + fontSize;
  lines.forEach(line => { exportCtx.fillText(line, exportBlock.x + pad, y); y += lineHeight; });
  exportCtx.restore();
}

function renderExportCanvas(scale = EXPORT_SCALE, volumeIndex = 1, totalVolumes = 1){
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = originalImage.width * scale;
  exportCanvas.height = originalImage.height * scale;
  const exportCtx = exportCanvas.getContext('2d');
  exportCtx.imageSmoothingEnabled = true;
  exportCtx.imageSmoothingQuality = 'high';
  exportCtx.drawImage(originalImage, 0, 0, exportCanvas.width, exportCanvas.height);

  const text = normalizeIfNeeded(addressText.value || lastAppliedText || '');
  if(text.trim() && block){
    drawExportBlock(exportCtx, exportCanvas, {
      x: Math.round(block.x * scale),
      y: Math.round(block.y * scale),
      width: Math.round(block.width * scale),
      minHeight: Math.round((block.minHeight || block.height || 40) * scale),
      height: Math.round((block.height || block.minHeight || 40) * scale),
      mode: block.mode,
      fontScale: block.fontScale || 1
    }, text);
  }

  if(totalVolumes > 1 && volumeField){
    drawVolumeValue(exportCtx, exportCanvas, {
      x: Math.round(volumeField.x * scale),
      y: Math.round(volumeField.y * scale),
      width: Math.round(volumeField.width * scale),
      height: Math.round(volumeField.height * scale),
      fontScale: volumeField.fontScale || 1
    }, volumeIndex, totalVolumes, false);
  }
  return exportCanvas;
}

function confirmLargeBatch(total){
  return total <= 20 || window.confirm(`Serão geradas ${total} etiquetas. Deseja continuar?`);
}

function downloadPNG(){
  if(!originalImage){ alert('Cole a etiqueta original antes de baixar.'); return; }
  const total = getVolumeCount();
  if(!confirmLargeBatch(total)) return;
  if(total === 1){
    const a = document.createElement('a');
    a.download = 'etiqueta-corrigida.png';
    a.href = renderExportCanvas(EXPORT_SCALE, 1, 1).toDataURL('image/png');
    a.click();
    return;
  }

  const page = renderExportCanvas(EXPORT_SCALE, 1, total);
  const gap = Math.round(20 * EXPORT_SCALE);
  const combined = document.createElement('canvas');
  combined.width = page.width;
  combined.height = page.height * total + gap * (total - 1);
  const cctx = combined.getContext('2d');
  cctx.fillStyle = '#fff';
  cctx.fillRect(0, 0, combined.width, combined.height);
  for(let i = 1; i <= total; i++){
    cctx.drawImage(renderExportCanvas(EXPORT_SCALE, i, total), 0, (i - 1) * (page.height + gap));
  }
  const a = document.createElement('a');
  a.download = `etiquetas-corrigidas-${total}-volumes.png`;
  a.href = combined.toDataURL('image/png');
  a.click();
}

function printCanvas(){
  if(!originalImage){ alert('Cole a etiqueta original antes de imprimir.'); return; }
  const total = getVolumeCount();
  if(!confirmLargeBatch(total)) return;
  const printWidth = originalImage.width;
  const win = window.open('', '_blank');
  if(!win){ alert('Permita pop-ups para imprimir as etiquetas.'); return; }
  win.document.write(`<!doctype html><html><head><title>Imprimir etiquetas</title><style>
    @page{margin:0} html,body{margin:0;padding:0;background:#fff}
    .page{display:flex;align-items:flex-start;justify-content:center;page-break-after:always;break-after:page}
    .page:last-child{page-break-after:auto;break-after:auto}
    img{width:${printWidth}px;max-width:100%;height:auto;display:block;image-rendering:auto}
  </style></head><body></body></html>`);
  win.document.close();

  const addPages = async () => {
    for(let i = 1; i <= total; i++){
      const div = win.document.createElement('div');
      div.className = 'page';
      const img = win.document.createElement('img');
      img.src = renderExportCanvas(EXPORT_SCALE, i, total).toDataURL('image/png');
      div.appendChild(img);
      win.document.body.appendChild(div);
      if(i % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }
    setTimeout(() => win.print(), 500);
  };
  addPages();
}

function canvasPoint(evt){
  const r = canvas.getBoundingClientRect();
  return { x:(evt.clientX - r.left) / zoom, y:(evt.clientY - r.top) / zoom };
}

canvas.addEventListener('pointerdown', (e) => {
  if(!originalImage) return;
  const p = canvasPoint(e);

  if(settingVolumePosition){
    const width = Math.round(canvas.width * 0.10);
    const height = Math.round(canvas.height * 0.045);
    volumeField = {
      x: Math.max(0, Math.min(canvas.width - width, Math.round(p.x - width / 2))),
      y: Math.max(0, Math.min(canvas.height - height, Math.round(p.y - height / 2))),
      width,
      height,
      fontScale: 1
    };
    settingVolumePosition = false;
    btnSetVolumePos?.classList.remove('primary');
    drawLabel();
    return;
  }

  if(!block || !addressText.value.trim()) return;
  if(p.x >= block.x && p.x <= block.x + block.width && p.y >= block.y && p.y <= block.y + (block.height || block.minHeight)){
    drag.active = true;
    drag.dx = p.x - block.x;
    drag.dy = p.y - block.y;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  }
});

canvas.addEventListener('pointermove', (e) => {
  if(!drag.active) return;
  const p = canvasPoint(e);
  block.x = Math.max(0, Math.min(canvas.width - block.width, Math.round(p.x - drag.dx)));
  block.y = Math.max(0, Math.min(canvas.height - (block.height || block.minHeight), Math.round(p.y - drag.dy)));
  drawLabel();
});

canvas.addEventListener('pointerup', (e) => {
  drag.active = false;
  canvas.classList.remove('dragging');
  try{ canvas.releasePointerCapture(e.pointerId); }catch(err){}
});
canvas.addEventListener('pointercancel', () => {
  drag.active = false;
  canvas.classList.remove('dragging');
});

btnSetVolumePos?.addEventListener('click', () => {
  if(!originalImage){ alert('Cole a etiqueta antes de definir a posição do Volume.'); return; }
  settingVolumePosition = !settingVolumePosition;
  btnSetVolumePos.classList.toggle('primary', settingVolumePosition);
  if(settingVolumePosition) alert('Clique exatamente sobre o valor atual do campo Volume (ex.: 1/1).');
  drawLabel();
});

document.getElementById('btnApply').addEventListener('click', applyBlock);
document.getElementById('btnApply2').addEventListener('click', applyBlock);
document.getElementById('btnClear').addEventListener('click', clearAll);
document.getElementById('btnDownload').addEventListener('click', downloadPNG);
document.getElementById('btnPrint').addEventListener('click', printCanvas);
document.getElementById('zoomIn').addEventListener('click', () => setZoom(zoom + 0.1));
document.getElementById('zoomOut').addEventListener('click', () => setZoom(zoom - 0.1));
document.getElementById('btnResetPos').addEventListener('click', resetBlock);
document.getElementById('btnFit').addEventListener('click', fitRightBlock);
document.getElementById('btnPhonePreset').addEventListener('click', setPhonePreset);
[blockWidthInput, blockHeightInput, fontScaleInput].forEach(el => el && el.addEventListener('input', applySizeControls));
addressText.addEventListener('input', applyBlock);
document.getElementById('keepExact').addEventListener('change', drawLabel);
if(volumeCountInput) volumeCountInput.addEventListener('input', drawLabel);

updateSizeLabels();
drawLabel();
setZoom(1);
