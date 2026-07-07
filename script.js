const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const pasteImageArea = document.getElementById('pasteImageArea');
const addressText = document.getElementById('addressText');
const emptyState = document.getElementById('emptyState');
const fileInput = document.getElementById('fileInput');

let originalImage = null;
let zoom = 1;
let lastAppliedText = '';

function setZoom(value){
  zoom = Math.max(0.4, Math.min(2.5, value));
  canvas.style.transformOrigin = 'top center';
  canvas.style.transform = `scale(${zoom})`;
  canvas.style.marginBottom = `${(canvas.height * (zoom - 1))}px`;
  document.getElementById('zoomLabel').textContent = Math.round(zoom*100)+'%';
}

function loadImageFromFile(file){
  if(!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      originalImage = img;
      drawLabel();
      pasteImageArea.classList.add('active');
      pasteImageArea.innerHTML = '<div class="paste-icon">✅</div><strong>Etiqueta colada</strong><small>Você pode colar outra imagem por cima</small>';
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function handlePaste(e){
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
  const active = document.activeElement;
  if(active === addressText) return;
  handlePaste(e);
});
pasteImageArea.addEventListener('paste', handlePaste);
pasteImageArea.addEventListener('click', ()=>pasteImageArea.focus());
document.getElementById('btnFile').addEventListener('click', ()=>fileInput.click());
fileInput.addEventListener('change', ()=>loadImageFromFile(fileInput.files[0]));

function normalizeIfNeeded(text){
  const keepExact = document.getElementById('keepExact').checked;
  if(keepExact) return text.replace(/\r\n/g,'\n').trimEnd();
  return text
    .replace(/\r\n/g,'\n')
    .split('\n')
    .map(l=>l.trim())
    .filter(Boolean)
    .join('\n');
}

function getBlockPosition(){
  const w = canvas.width, h = canvas.height;
  return {
    x: Math.round(w * 0.54),
    y: Math.round(h * 0.61),
    width: Math.round(w * 0.40),
    minHeight: Math.round(h * 0.20)
  };
}

function wrapText(ctx, text, maxWidth){
  const lines = [];
  const rawLines = text.split('\n');
  rawLines.forEach(raw => {
    if(raw.trim()==='') { lines.push(''); return; }
    const words = raw.split(/\s+/);
    let line = '';
    words.forEach(word => {
      const test = line ? line + ' ' + word : word;
      if(ctx.measureText(test).width > maxWidth && line){
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

  const text = normalizeIfNeeded(addressText.value || lastAppliedText || '');
  if(text.trim()) drawCorrectAddressBlock(text);
  setZoom(zoom);
}

function drawCorrectAddressBlock(text){
  const pos = getBlockPosition();
  const pad = Math.max(8, Math.round(canvas.width * 0.012));
  const fontSize = Math.max(12, Math.round(canvas.width * 0.026));
  const titleSize = Math.max(13, Math.round(canvas.width * 0.028));
  const lineHeight = Math.round(fontSize * 1.23);

  ctx.save();
  ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  const contentWidth = pos.width - pad*2;
  const lines = wrapText(ctx, text, contentWidth);
  const blockHeight = Math.max(pos.minHeight, pad*3 + titleSize + (lines.length * lineHeight));

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
  window.print();
}

document.getElementById('btnApply').addEventListener('click', applyBlock);
document.getElementById('btnApply2').addEventListener('click', applyBlock);
document.getElementById('btnClear').addEventListener('click', clearAll);
document.getElementById('btnDownload').addEventListener('click', downloadPNG);
document.getElementById('btnPrint').addEventListener('click', printCanvas);
document.getElementById('zoomIn').addEventListener('click', ()=>setZoom(zoom+0.1));
document.getElementById('zoomOut').addEventListener('click', ()=>setZoom(zoom-0.1));
addressText.addEventListener('input', applyBlock);
document.getElementById('keepExact').addEventListener('change', drawLabel);

drawLabel();
setZoom(1);
