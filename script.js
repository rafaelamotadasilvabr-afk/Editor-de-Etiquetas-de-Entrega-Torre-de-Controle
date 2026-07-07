const upload = document.getElementById('upload');
const baseLabel = document.getElementById('baseLabel');
const empty = document.querySelector('.empty');
const awbBox = document.getElementById('awbBox');
const destBox = document.getElementById('destBox');
const alertBox = document.getElementById('alertBox');
const destText = document.getElementById('destText');
const fields = ['awb','destinatario','logradouro','numero','complemento','bairro','cep','cidade','telefone'];
let imgLoaded = false;

function value(id){ return document.getElementById(id).value.trim(); }
function show(el, condition){ el.style.display = condition ? 'block' : 'none'; }

function render(){
  const awb = value('awb');
  const destinatario = value('destinatario');
  const logradouro = value('logradouro');
  const numero = value('numero');
  const complemento = value('complemento');
  const bairro = value('bairro');
  const cep = value('cep');
  const cidade = value('cidade');
  const telefone = value('telefone');

  const linhas = [];
  if (destinatario) linhas.push(destinatario.toUpperCase());
  if (logradouro || numero) linhas.push(`${logradouro.toUpperCase()}${numero ? ', Nº ' + numero : ''}`);
  if (complemento) linhas.push(`COMPL.: ${complemento.toUpperCase()}`);
  if (bairro) linhas.push(`BAIRRO: ${bairro.toUpperCase()}`);
  if (cep || cidade) linhas.push(`${cep}${cidade ? ' - ' + cidade.toUpperCase() : ''}`);
  if (telefone) linhas.push(`TEL.: ${telefone}`);

  awbBox.textContent = awb ? `Nº AWB ${awb}` : '';
  destText.textContent = linhas.join('\n');

  show(awbBox, imgLoaded && !!awb);
  show(destBox, imgLoaded && linhas.length > 0);
  show(alertBox, imgLoaded && document.getElementById('alerta').checked);
}

upload.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    baseLabel.src = reader.result;
    baseLabel.style.display = 'block';
    empty.style.display = 'none';
    imgLoaded = true;
    render();
  };
  reader.readAsDataURL(file);
});

fields.forEach(id => document.getElementById(id).addEventListener('input', render));
document.getElementById('alerta').addEventListener('change', render);

document.getElementById('btnPrint').addEventListener('click', () => {
  if (!imgLoaded) return alert('Suba a etiqueta original antes de imprimir.');
  window.print();
});

document.getElementById('btnClear').addEventListener('click', () => {
  fields.forEach(id => document.getElementById(id).value = '');
  render();
});

document.getElementById('btnDownload').addEventListener('click', () => {
  if (!imgLoaded) return alert('Suba a etiqueta original antes de baixar.');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,383,578);

    const awb = value('awb');
    if (awb) {
      ctx.fillStyle = '#fff'; ctx.fillRect(217,111,152,18);
      ctx.fillStyle = '#000'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
      ctx.fillText(`Nº AWB ${awb}`,293,124);
    }

    const text = destText.textContent;
    if (text) {
      ctx.fillStyle = '#fff'; ctx.fillRect(193,313,180,114);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(193,313,180,114);
      ctx.fillStyle = '#000'; ctx.fillRect(198,317,170,12);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 7px Arial'; ctx.textAlign = 'center';
      ctx.fillText('DESTINATÁRIO / ENDEREÇO CORRIGIDO',283,326);
      ctx.fillStyle = '#000'; ctx.font = 'bold 8.8px Arial'; ctx.textAlign = 'left';
      const lines = text.split('\n'); let y = 341;
      lines.forEach(line => {
        wrapText(ctx, line, 199, y, 168, 10);
        y += 11 * Math.ceil(ctx.measureText(line).width / 168 || 1);
      });
    }

    if (document.getElementById('alerta').checked) {
      ctx.fillStyle = '#fff'; ctx.fillRect(10,468,363,45);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(10,468,363,45);
      ctx.fillStyle = '#000'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
      wrapText(ctx, 'ATENÇÃO: ENDEREÇO CORRIGIDO. CONSIDERAR ESTA INFORMAÇÃO PARA ENTREGA.', 191, 487, 340, 12, true);
    }

    const link = document.createElement('a');
    link.download = 'etiqueta-endereco-corrigido.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  img.src = baseLabel.src;
});

function wrapText(ctx, text, x, y, maxWidth, lineHeight, centered=false) {
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}
