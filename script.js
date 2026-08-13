const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const pasteImageArea = document.getElementById('pasteImageArea');
const addressText = document.getElementById('addressText');
const emptyState = document.getElementById('emptyState');
const fileInput = document.getElementById('fileInput');

const blockWidthInput = document.getElementById('blockWidth');
const blockHeightInput = document.getElementById('blockHeight');
const fontScaleInput = document.getElementById('fontScale');
const volumeCountInput = document.getElementById('volumeCount');

let originalImage = null;
let zoom = 1;
let lastAppliedText = '';
let block = null;

let drag = {
  active: false,
  dx: 0,
  dy: 0
};

let manualSize = false;


/* =========================================================
   CÓDIGO DE BARRAS
   ========================================================= */

/*
  Exemplo real da etiqueta:

  AWB:
  577-06276034

  Base usada no barcode:
  57706276034

  Volume 1:
  577062760340001

  Volume 2:
  577062760340002

  Portanto:
  BASE = primeiros 11 dígitos
  SEQUÊNCIA = últimos 4 dígitos
*/

let originalBarcode = '';
let barcodeStatus = 'idle';
let barcodeDetectionPromise = null;


/*
  Regiões onde o sistema tentará localizar
  o código de barras inferior.

  Usamos mais de uma região para aumentar
  a chance de leitura em recortes diferentes.
*/
const BARCODE_SCAN_FIELDS = [
  {
    x: 0.12,
    y: 0.785,
    width: 0.76,
    height: 0.12
  },
  {
    x: 0.08,
    y: 0.76,
    width: 0.84,
    height: 0.16
  },
  {
    x: 0.04,
    y: 0.73,
    width: 0.92,
    height: 0.21
  }
];


/*
  Região onde o NOVO código será desenhado.

  Essa posição corresponde ao código inferior
  da etiqueta enviada.
*/
const BARCODE_FIELD = {
  x: 0.155,
  y: 0.802,
  width: 0.690,
  height: 0.088
};


/* =========================================================
   VALIDAÇÃO DAS BIBLIOTECAS
   ========================================================= */

function barcodeLibrariesAvailable() {
  return (
    window.ZXingBrowser &&
    typeof window.JsBarcode === 'function'
  );
}


/* =========================================================
   CRIAR RECORTE PARA LEITURA DO BARCODE
   ========================================================= */

function createBarcodeScanCanvas(
  img,
  field,
  scale = 3,
  useThreshold = false
) {
  const sourceWidth =
    img.naturalWidth || img.width;

  const sourceHeight =
    img.naturalHeight || img.height;

  const sx = Math.max(
    0,
    Math.round(sourceWidth * field.x)
  );

  const sy = Math.max(
    0,
    Math.round(sourceHeight * field.y)
  );

  const sw = Math.max(
    1,
    Math.min(
      sourceWidth - sx,
      Math.round(sourceWidth * field.width)
    )
  );

  const sh = Math.max(
    1,
    Math.min(
      sourceHeight - sy,
      Math.round(sourceHeight * field.height)
    )
  );

  const scanCanvas = document.createElement('canvas');

  scanCanvas.width = sw * scale;
  scanCanvas.height = sh * scale;

  const scanCtx = scanCanvas.getContext('2d');

  scanCtx.fillStyle = '#ffffff';

  scanCtx.fillRect(
    0,
    0,
    scanCanvas.width,
    scanCanvas.height
  );

  scanCtx.imageSmoothingEnabled = false;

  scanCtx.drawImage(
    img,

    sx,
    sy,
    sw,
    sh,

    0,
    0,
    scanCanvas.width,
    scanCanvas.height
  );


  /*
    Em uma segunda tentativa fazemos
    preto e branco com contraste forte.

    Isso ajuda quando a imagem foi colada
    com resolução ou contraste menor.
  */
  if (useThreshold) {
    try {
      const imageData = scanCtx.getImageData(
        0,
        0,
        scanCanvas.width,
        scanCanvas.height
      );

      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const gray =
          (data[i] * 0.299) +
          (data[i + 1] * 0.587) +
          (data[i + 2] * 0.114);

        const value = gray < 175 ? 0 : 255;

        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 255;
      }

      scanCtx.putImageData(
        imageData,
        0,
        0
      );

    } catch (error) {
      console.warn(
        'Não foi possível aplicar contraste no barcode.',
        error
      );
    }
  }

  return scanCanvas;
}


/* =========================================================
   VALIDAR O VALOR LIDO
   ========================================================= */

function normalizeBarcodeValue(value) {
  const digits = String(value || '')
    .replace(/\D/g, '');

  /*
    Modelo atual:

    11 dígitos da AWB sem hífen
    +
    4 dígitos da sequência
    =
    15 dígitos
  */
  if (digits.length !== 15) {
    return '';
  }

  return digits;
}


/* =========================================================
   LER AUTOMATICAMENTE O BARCODE ORIGINAL
   ========================================================= */

async function detectOriginalBarcode(img) {
  if (!img) {
    return '';
  }

  /*
    Se uma leitura já estiver acontecendo,
    aguardamos a mesma leitura.
  */
  if (
    barcodeStatus === 'loading' &&
    barcodeDetectionPromise
  ) {
    return barcodeDetectionPromise;
  }

  if (!barcodeLibrariesAvailable()) {
    barcodeStatus = 'error';

    console.error(
      'ZXing ou JsBarcode não foram carregados pelo index.html.'
    );

    return '';
  }

  const targetImage = img;

  originalBarcode = '';
  barcodeStatus = 'loading';

  const task = (async () => {
    try {
      const ReaderClass =
        window.ZXingBrowser.BrowserMultiFormatOneDReader ||
        window.ZXingBrowser.BrowserMultiFormatReader;

      if (!ReaderClass) {
        throw new Error(
          'Leitor ZXing não encontrado.'
        );
      }

      const reader = new ReaderClass();


      /*
        Para cada região:
        1ª tentativa = imagem normal
        2ª tentativa = preto e branco
      */
      for (const field of BARCODE_SCAN_FIELDS) {
        for (const threshold of [false, true]) {
          try {
            const scanCanvas =
              createBarcodeScanCanvas(
                targetImage,
                field,
                3,
                threshold
              );

            /*
              IMPORTANTE:
              decodeFromCanvas é assíncrono.
            */
            const result =
              await reader.decodeFromCanvas(
                scanCanvas
              );

            const rawValue =
              typeof result?.getText === 'function'
                ? result.getText()
                : String(result?.text || '');

            const value =
              normalizeBarcodeValue(rawValue);


            /*
              Se outra etiqueta foi carregada
              enquanto a leitura acontecia,
              ignoramos o resultado antigo.
            */
            if (originalImage !== targetImage) {
              return '';
            }


            if (value) {
              originalBarcode = value;
              barcodeStatus = 'ready';

              console.info(
                '[TC Label Editor] Barcode identificado:',
                originalBarcode
              );

              return originalBarcode;
            }

          } catch (error) {
            /*
              Não encontrou nessa tentativa.
              Continua para a próxima região.
            */
          }
        }
      }


      if (originalImage === targetImage) {
        originalBarcode = '';
        barcodeStatus = 'error';
      }

      console.warn(
        '[TC Label Editor] Não foi possível identificar o código de barras inferior.'
      );

      return '';

    } catch (error) {
      if (originalImage === targetImage) {
        originalBarcode = '';
        barcodeStatus = 'error';
      }

      console.error(
        '[TC Label Editor] Erro ao ler código de barras:',
        error
      );

      return '';
    }
  })();


  barcodeDetectionPromise = task;

  try {
    return await task;

  } finally {
    if (barcodeDetectionPromise === task) {
      barcodeDetectionPromise = null;
    }
  }
}


/* =========================================================
   GERAR BARCODE DE CADA VOLUME
   ========================================================= */

function barcodeForVolume(volumeIndex) {
  const clean =
    normalizeBarcodeValue(originalBarcode);

  if (!clean) {
    return '';
  }


  /*
    Exemplo:

    ORIGINAL
    577062760340001

    REMOVE OS 4 ÚLTIMOS
    57706276034
  */
  const base =
    clean.slice(0, -4);


  /*
    Volume 1 => 0001
    Volume 2 => 0002
    Volume 3 => 0003
  */
  const sequence =
    String(volumeIndex)
      .padStart(4, '0');


  return base + sequence;
}


/* =========================================================
   DESENHAR NOVO CODE128
   ========================================================= */

function drawBarcodeField(
  targetCtx,
  targetCanvas,
  value
) {
  if (!value) {
    return;
  }

  if (typeof window.JsBarcode !== 'function') {
    console.error(
      'JsBarcode não está disponível.'
    );

    return;
  }


  const fieldX =
    Math.round(
      targetCanvas.width *
      BARCODE_FIELD.x
    );

  const fieldY =
    Math.round(
      targetCanvas.height *
      BARCODE_FIELD.y
    );

  const fieldWidth =
    Math.round(
      targetCanvas.width *
      BARCODE_FIELD.width
    );

  const fieldHeight =
    Math.round(
      targetCanvas.height *
      BARCODE_FIELD.height
    );


  const barcodeCanvas =
    document.createElement('canvas');


  /*
    Gera o novo CODE128
    com o número correspondente ao volume.
  */
  window.JsBarcode(
    barcodeCanvas,
    value,
    {
      format: 'CODE128',

      width: 2,
      height: 32,

      displayValue: true,

      font: 'Arial',
      fontSize: 15,

      textAlign: 'center',
      textPosition: 'bottom',
      textMargin: 2,

      margin: 0,

      background: '#ffffff',
      lineColor: '#000000'
    }
  );


  /*
    Ajusta proporcionalmente para caber
    no mesmo espaço da etiqueta original.
  */
  const maxWidth =
    fieldWidth * 0.96;

  const maxHeight =
    fieldHeight * 0.96;


  const scale = Math.min(
    maxWidth / barcodeCanvas.width,
    maxHeight / barcodeCanvas.height
  );


  const drawWidth =
    Math.max(
      1,
      Math.round(
        barcodeCanvas.width * scale
      )
    );

  const drawHeight =
    Math.max(
      1,
      Math.round(
        barcodeCanvas.height * scale
      )
    );


  const drawX =
    Math.round(
      fieldX +
      ((fieldWidth - drawWidth) / 2)
    );

  const drawY =
    Math.round(
      fieldY +
      ((fieldHeight - drawHeight) / 2)
    );


  targetCtx.save();


  /*
    Apaga SOMENTE o barcode e
    o número antigos.

    Não mexe nas bordas da etiqueta.
  */
  targetCtx.fillStyle = '#ffffff';

  targetCtx.fillRect(
    fieldX,
    fieldY,
    fieldWidth,
    fieldHeight
  );


  targetCtx.imageSmoothingEnabled = false;


  targetCtx.drawImage(
    barcodeCanvas,

    0,
    0,
    barcodeCanvas.width,
    barcodeCanvas.height,

    drawX,
    drawY,
    drawWidth,
    drawHeight
  );


  targetCtx.restore();
}


/* =========================================================
   VALIDAR ANTES DE IMPRIMIR / BAIXAR
   ========================================================= */

async function prepareBarcodeForOutput(totalVolumes) {
  if (!originalImage) {
    return false;
  }


  /*
    Para múltiplos volumes precisamos
    obrigatoriamente das bibliotecas.
  */
  if (!barcodeLibrariesAvailable()) {
    if (totalVolumes > 1) {
      alert(
        'Não foi possível carregar o leitor de código de barras.\n\n' +
        'Verifique se o index.html contém ZXing e JsBarcode antes do script.js.'
      );

      return false;
    }

    return true;
  }


  /*
    Se a leitura automática ainda estiver
    acontecendo, aguardamos.
  */
  if (
    barcodeStatus === 'loading' &&
    barcodeDetectionPromise
  ) {
    await barcodeDetectionPromise;
  }


  /*
    Se ainda não temos código,
    tentamos novamente.
  */
  if (!originalBarcode) {
    await detectOriginalBarcode(
      originalImage
    );

    drawLabel();
  }


  /*
    Mais de um volume:
    SEM barcode identificado,
    NÃO vamos gerar códigos incorretos.
  */
  if (
    totalVolumes > 1 &&
    !originalBarcode
  ) {
    alert(
      'Não consegui identificar o código de barras inferior da etiqueta.\n\n' +
      'Para gerar vários volumes com segurança, cole a etiqueta completa e com o código de barras inferior legível.'
    );

    return false;
  }

  return true;
}


/* =========================================================
   BLOCO PADRÃO DE CORREÇÃO
   ========================================================= */

function defaultBlock() {
  return {
    x:
      Math.round(
        canvas.width * 0.54
      ),

    y:
      Math.round(
        canvas.height * 0.57
      ),

    width:
      Math.round(
        canvas.width * 0.39
      ),

    minHeight:
      Math.round(
        canvas.height * 0.19
      ),

    mode: 'address',

    fontScale: 1
  };
}


function fitRightBlock() {
  if (!originalImage) {
    return;
  }

  const text =
    normalizeIfNeeded(
      addressText.value ||
      lastAppliedText ||
      ''
    );


  if (isPhoneOnly(text)) {
    block = phoneDefaultBlock();

  } else {
    block = {
      x:
        Math.round(
          canvas.width * 0.53
        ),

      y:
        Math.round(
          canvas.height * 0.58
        ),

      width:
        Math.round(
          canvas.width * 0.40
        ),

      minHeight:
        Math.round(
          canvas.height * 0.18
        ),

      mode: 'address',

      fontScale:
        block?.fontScale || 1
    };
  }

  syncControlsFromBlock();
  drawLabel();
}


function resetBlock() {
  if (!originalImage) {
    return;
  }

  const text =
    normalizeIfNeeded(
      addressText.value ||
      lastAppliedText ||
      ''
    );

  manualSize = false;

  block =
    isPhoneOnly(text)
      ? phoneDefaultBlock()
      : defaultBlock();

  syncControlsFromBlock();
  drawLabel();
}


/* =========================================================
   ZOOM
   ========================================================= */

function setZoom(value) {
  zoom =
    Math.max(
      0.4,
      Math.min(
        2.5,
        value
      )
    );

  canvas.style.transformOrigin =
    'top center';

  canvas.style.transform =
    `scale(${zoom})`;

  canvas.style.marginBottom =
    `${Math.max(
      0,
      canvas.height * (zoom - 1)
    )}px`;

  document
    .getElementById('zoomLabel')
    .textContent =
      Math.round(zoom * 100) + '%';
}


/* =========================================================
   CARREGAR ETIQUETA
   ========================================================= */

function loadImageFromFile(file) {
  if (
    !file ||
    !file.type.startsWith('image/')
  ) {
    return;
  }


  const reader =
    new FileReader();


  reader.onload = () => {
    const img = new Image();


    img.onload = () => {
      originalImage = img;

      canvas.width =
        originalImage.width;

      canvas.height =
        originalImage.height;


      block =
        defaultBlock();


      /*
        Nova etiqueta =
        nova leitura do código.
      */
      originalBarcode = '';
      barcodeStatus = 'idle';
      barcodeDetectionPromise = null;


      syncControlsFromBlock();
      drawLabel();


      pasteImageArea
        .classList
        .add('active');


      pasteImageArea.innerHTML =
        '<div class="paste-icon">✅</div>' +
        '<strong>Etiqueta colada</strong>' +
        '<small>Você pode colar outra imagem por cima</small>';


      /*
        Inicia leitura automática
        sem exigir nenhum campo novo.
      */
      detectOriginalBarcode(
        originalImage
      ).then(() => {
        drawLabel();
      });
    };


    img.src =
      reader.result;
  };


  reader.readAsDataURL(file);
}


/* =========================================================
   COLAR IMAGEM
   ========================================================= */

function handlePaste(e) {
  const items =
    e.clipboardData?.items || [];


  for (const item of items) {
    if (
      item.type.startsWith('image/')
    ) {
      e.preventDefault();

      loadImageFromFile(
        item.getAsFile()
      );

      return;
    }
  }
}


document.addEventListener(
  'paste',
  (e) => {
    if (
      document.activeElement ===
      addressText
    ) {
      return;
    }

    handlePaste(e);
  }
);


pasteImageArea.addEventListener(
  'paste',
  handlePaste
);


pasteImageArea.addEventListener(
  'click',
  () => pasteImageArea.focus()
);


document
  .getElementById('btnFile')
  .addEventListener(
    'click',
    () => fileInput.click()
  );


fileInput.addEventListener(
  'change',
  () => loadImageFromFile(
    fileInput.files[0]
  )
);


/* =========================================================
   TEXTO
   ========================================================= */

function normalizeIfNeeded(text) {
  const keepExact =
    document
      .getElementById('keepExact')
      .checked;


  if (keepExact) {
    return text
      .replace(/\r\n/g, '\n')
      .trimEnd();
  }


  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}


function compactText(text) {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .trim();
}


function isPhoneOnly(text) {
  const t =
    compactText(text);

  if (!t) {
    return false;
  }


  /*
    Exemplos:
    11974929028
    (11) 97492-9028
    +55 11 97492-9028
  */
  if (
    !/^[\d\s()+\-.]+$/.test(t)
  ) {
    return false;
  }


  const digits =
    t.replace(/\D/g, '');


  return (
    digits.length >= 8 &&
    digits.length <= 15
  );
}


/* =========================================================
   QUANTIDADE DE VOLUMES
   ========================================================= */

function getVolumeCount() {
  const n =
    parseInt(
      volumeCountInput?.value || '1',
      10
    );


  return Math.max(
    1,
    Math.min(
      500,
      Number.isFinite(n)
        ? n
        : 1
    )
  );
}


function textForVolume(text) {
  return text || '';
}


/* =========================================================
   CAMPO VOLUME
   ========================================================= */

const VOLUME_FIELD = {
  centerX: 0.181,
  centerY: 0.496,
  clearWidth: 0.190,
  clearHeight: 0.038
};


function drawVolumeField(
  targetCtx,
  targetCanvas,
  current,
  total
) {
  const canvasWidth =
    targetCanvas.width;

  const canvasHeight =
    targetCanvas.height;


  const centerX =
    Math.round(
      canvasWidth *
      VOLUME_FIELD.centerX
    );

  const centerY =
    Math.round(
      canvasHeight *
      VOLUME_FIELD.centerY
    );

  const clearWidth =
    Math.round(
      canvasWidth *
      VOLUME_FIELD.clearWidth
    );

  const clearHeight =
    Math.round(
      canvasHeight *
      VOLUME_FIELD.clearHeight
    );


  const left =
    Math.round(
      centerX -
      (clearWidth / 2)
    );

  const top =
    Math.round(
      centerY -
      (clearHeight / 2)
    );


  const value =
    `${current}/${total}`;


  targetCtx.save();


  /*
    Cobre somente o valor anterior.
  */
  targetCtx.fillStyle =
    '#ffffff';

  targetCtx.fillRect(
    left,
    top,
    clearWidth,
    clearHeight
  );


  let fontSize =
    Math.max(
      9,
      Math.round(
        canvasWidth * 0.030
      )
    );


  const maxTextWidth =
    clearWidth * 0.90;


  while (fontSize > 8) {
    targetCtx.font =
      `700 ${fontSize}px Arial, Helvetica, sans-serif`;

    if (
      targetCtx
        .measureText(value)
        .width <= maxTextWidth
    ) {
      break;
    }

    fontSize -= 1;
  }


  targetCtx.fillStyle =
    '#000000';

  targetCtx.textAlign =
    'center';

  targetCtx.textBaseline =
    'middle';

  targetCtx.font =
    `700 ${fontSize}px Arial, Helvetica, sans-serif`;


  targetCtx.fillText(
    value,
    centerX,
    centerY
  );


  targetCtx.restore();
}


/* =========================================================
   TELEFONE
   ========================================================= */

function phoneDefaultBlock() {
  return {
    x:
      Math.round(
        canvas.width * 0.54
      ),

    y:
      Math.round(
        canvas.height * 0.69
      ),

    width:
      Math.round(
        canvas.width * 0.31
      ),

    minHeight:
      Math.round(
        canvas.height * 0.055
      ),

    mode: 'phone',

    fontScale: 1
  };
}


/* =========================================================
   CONTROLES
   ========================================================= */

function updateSizeLabels() {
  if (blockWidthInput) {
    document
      .getElementById(
        'blockWidthLabel'
      )
      .textContent =
        `${blockWidthInput.value}%`;
  }


  if (blockHeightInput) {
    document
      .getElementById(
        'blockHeightLabel'
      )
      .textContent =
        `${blockHeightInput.value}%`;
  }


  if (fontScaleInput) {
    document
      .getElementById(
        'fontScaleLabel'
      )
      .textContent =
        `${fontScaleInput.value}%`;
  }
}


function syncControlsFromBlock() {
  if (
    !canvas.width ||
    !block
  ) {
    return;
  }


  const w =
    Math.round(
      (block.width / canvas.width) *
      100
    );

  const h =
    Math.round(
      (block.minHeight / canvas.height) *
      100
    );


  if (blockWidthInput) {
    blockWidthInput.value =
      Math.max(
        +blockWidthInput.min,
        Math.min(
          +blockWidthInput.max,
          w
        )
      );
  }


  if (blockHeightInput) {
    blockHeightInput.value =
      Math.max(
        +blockHeightInput.min,
        Math.min(
          +blockHeightInput.max,
          h
        )
      );
  }


  if (fontScaleInput) {
    fontScaleInput.value =
      Math.round(
        (block.fontScale || 1) *
        100
      );
  }


  updateSizeLabels();
}


function applySizeControls() {
  if (
    !originalImage ||
    !block
  ) {
    return;
  }


  manualSize = true;


  const widthPct =
    Number(
      blockWidthInput.value || 31
    ) / 100;


  const heightPct =
    Number(
      blockHeightInput.value || 6
    ) / 100;


  block.width =
    Math.round(
      canvas.width * widthPct
    );


  block.minHeight =
    Math.round(
      canvas.height * heightPct
    );


  block.fontScale =
    Number(
      fontScaleInput.value || 100
    ) / 100;


  block.x =
    Math.max(
      0,
      Math.min(
        canvas.width -
        block.width,
        block.x
      )
    );


  block.y =
    Math.max(
      0,
      Math.min(
        canvas.height -
        (
          block.height ||
          block.minHeight
        ),
        block.y
      )
    );


  updateSizeLabels();
  drawLabel();
}


function setPhonePreset() {
  if (!originalImage) {
    return;
  }


  if (!block) {
    block =
      phoneDefaultBlock();
  }


  block.width =
    Math.round(
      canvas.width * 0.22
    );

  block.minHeight =
    Math.round(
      canvas.height * 0.04
    );

  block.fontScale =
    0.85;

  block.mode =
    'phone';

  block.x =
    Math.round(
      canvas.width * 0.57
    );

  block.y =
    Math.round(
      canvas.height * 0.66
    );


  manualSize = true;

  syncControlsFromBlock();
  drawLabel();
}


/* =========================================================
   QUEBRA DE LINHA
   ========================================================= */

function wrapText(
  ctx,
  text,
  maxWidth
) {
  const lines = [];


  text
    .split('\n')
    .forEach(raw => {
      if (
        raw.trim() === ''
      ) {
        lines.push('');
        return;
      }


      const words =
        raw.split(/\s+/);

      let line = '';


      words.forEach(word => {
        const test =
          line
            ? line + ' ' + word
            : word;


        if (
          ctx
            .measureText(test)
            .width >
            maxWidth &&
          line
        ) {
          lines.push(line);
          line = word;

        } else {
          line = test;
        }
      });


      lines.push(line);
    });


  return lines;
}


/* =========================================================
   PRÉ-VISUALIZAÇÃO
   ========================================================= */

function drawLabel() {
  if (!originalImage) {
    canvas.width = 620;
    canvas.height = 850;

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    emptyState.style.display =
      'block';

    return;
  }


  emptyState.style.display =
    'none';


  canvas.width =
    originalImage.width;

  canvas.height =
    originalImage.height;


  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );


  ctx.drawImage(
    originalImage,
    0,
    0
  );


  if (!block) {
    block =
      defaultBlock();
  }


  const text =
    normalizeIfNeeded(
      addressText.value ||
      lastAppliedText ||
      ''
    );


  const totalVolumes =
    getVolumeCount();


  const displayText =
    textForVolume(text);


  /*
    Correção de endereço / telefone.
  */
  if (text.trim()) {
    if (isPhoneOnly(text)) {
      if (
        !block ||
        block.mode !== 'phone'
      ) {
        block =
          phoneDefaultBlock();
      }

      drawPhoneOnlyBlock(
        displayText
      );

    } else {
      if (
        !block ||
        block.mode === 'phone'
      ) {
        block =
          defaultBlock();
      }

      drawCorrectAddressBlock(
        displayText
      );
    }
  }


  /*
    A prévia representa sempre
    a primeira etiqueta do lote.
  */
  drawVolumeField(
    ctx,
    canvas,
    1,
    totalVolumes
  );


  /*
    Se o código já foi identificado,
    substitui visualmente pelo volume 1.
  */
  const previewBarcode =
    barcodeForVolume(1);


  if (previewBarcode) {
    drawBarcodeField(
      ctx,
      canvas,
      previewBarcode
    );
  }


  setZoom(zoom);
}


/* =========================================================
   DESENHAR TELEFONE
   ========================================================= */

function drawPhoneOnlyBlock(text) {
  const pos =
    block ||
    phoneDefaultBlock();


  const pad =
    Math.max(
      5,
      Math.round(
        canvas.width * 0.008
      )
    );


  const fontSize =
    Math.max(
      9,
      Math.round(
        canvas.width *
        0.023 *
        (pos.fontScale || 1)
      )
    );


  const lineHeight =
    Math.round(
      fontSize * 1.22
    );


  ctx.save();


  ctx.font =
    `${fontSize}px Arial, Helvetica, sans-serif`;


  const contentWidth =
    pos.width -
    (pad * 2);


  const lines =
    wrapText(
      ctx,
      text,
      contentWidth
    );


  const blockHeight =
    Math.max(
      pos.minHeight,
      (pad * 2) +
      (
        lines.length *
        lineHeight
      )
    );


  block.height =
    blockHeight;

  block.mode =
    'phone';

  block.fontScale =
    pos.fontScale || 1;


  ctx.fillStyle =
    '#ffffff';


  ctx.fillRect(
    pos.x,
    pos.y,
    pos.width,
    blockHeight
  );


  ctx.lineWidth =
    Math.max(
      1,
      Math.round(
        canvas.width * 0.0025
      )
    );


  ctx.strokeStyle =
    '#d00000';


  ctx.strokeRect(
    pos.x,
    pos.y,
    pos.width,
    blockHeight
  );


  ctx.fillStyle =
    '#000000';


  ctx.font =
    `${fontSize}px Arial, Helvetica, sans-serif`;


  let y =
    pos.y +
    pad +
    fontSize;


  lines.forEach(line => {
    ctx.fillText(
      line,
      pos.x + pad,
      y
    );

    y += lineHeight;
  });


  ctx.restore();
}


/* =========================================================
   DESENHAR ENDEREÇO
   ========================================================= */

function drawCorrectAddressBlock(text) {
  const pos =
    block ||
    defaultBlock();


  block.mode =
    'address';

  block.fontScale =
    pos.fontScale || 1;


  const pad =
    Math.max(
      7,
      Math.round(
        canvas.width * 0.011
      )
    );


  const fontSize =
    Math.max(
      9,
      Math.round(
        canvas.width *
        0.024 *
        (pos.fontScale || 1)
      )
    );


  const lineHeight =
    Math.round(
      fontSize * 1.22
    );


  ctx.save();


  ctx.font =
    `${fontSize}px Arial, Helvetica, sans-serif`;


  const contentWidth =
    pos.width -
    (pad * 2);


  const lines =
    wrapText(
      ctx,
      text,
      contentWidth
    );


  const blockHeight =
    Math.max(
      pos.minHeight,
      (pad * 2) +
      (
        lines.length *
        lineHeight
      )
    );


  block.height =
    blockHeight;


  ctx.fillStyle =
    '#ffffff';


  ctx.fillRect(
    pos.x,
    pos.y,
    pos.width,
    blockHeight
  );


  ctx.lineWidth =
    Math.max(
      2,
      Math.round(
        canvas.width * 0.004
      )
    );


  ctx.strokeStyle =
    '#d00000';


  ctx.strokeRect(
    pos.x,
    pos.y,
    pos.width,
    blockHeight
  );


  ctx.fillStyle =
    '#000000';


  ctx.font =
    `${fontSize}px Arial, Helvetica, sans-serif`;


  let y =
    pos.y +
    pad +
    fontSize;


  lines.forEach(line => {
    ctx.fillText(
      line,
      pos.x + pad,
      y
    );

    y += lineHeight;
  });


  ctx.restore();
}


/* =========================================================
   APLICAR
   ========================================================= */

function applyBlock() {
  lastAppliedText =
    addressText.value;

  drawLabel();
}


/* =========================================================
   LIMPAR
   ========================================================= */

function clearAll() {
  originalImage = null;

  originalBarcode = '';
  barcodeStatus = 'idle';
  barcodeDetectionPromise = null;

  block = null;

  lastAppliedText = '';

  addressText.value = '';


  if (volumeCountInput) {
    volumeCountInput.value = '1';
  }


  pasteImageArea
    .classList
    .remove('active');


  pasteImageArea.innerHTML =
    '<div class="paste-icon">📋</div>' +
    '<strong>Clique aqui e pressione Ctrl + V</strong>' +
    '<small>Cole o recorte da etiqueta original</small>';


  drawLabel();
}


/* =========================================================
   BLOCO PARA EXPORTAÇÃO
   ========================================================= */

function drawExportBlock(
  exportCtx,
  exportCanvas,
  exportBlock,
  text
) {
  const isPhone =
    isPhoneOnly(text);


  const pad =
    Math.max(
      isPhone ? 5 : 7,
      Math.round(
        exportCanvas.width *
        (
          isPhone
            ? 0.008
            : 0.011
        )
      )
    );


  const fontSize =
    Math.max(
      9 * EXPORT_SCALE,

      Math.round(
        exportCanvas.width *
        (
          isPhone
            ? 0.023
            : 0.024
        ) *
        (
          exportBlock.fontScale ||
          1
        )
      )
    );


  const lineHeight =
    Math.round(
      fontSize * 1.22
    );


  exportCtx.save();


  exportCtx.font =
    `${fontSize}px Arial, Helvetica, sans-serif`;

  exportCtx.textBaseline =
    'alphabetic';


  const contentWidth =
    exportBlock.width -
    (pad * 2);


  const lines =
    wrapText(
      exportCtx,
      text,
      contentWidth
    );


  const blockHeight =
    Math.max(
      exportBlock.minHeight,

      (pad * 2) +
      (
        lines.length *
        lineHeight
      )
    );


  exportCtx.fillStyle =
    '#ffffff';


  exportCtx.fillRect(
    exportBlock.x,
    exportBlock.y,
    exportBlock.width,
    blockHeight
  );


  exportCtx.lineWidth =
    Math.max(
      isPhone ? 1 : 2,

      Math.round(
        exportCanvas.width *
        (
          isPhone
            ? 0.0025
            : 0.004
        )
      )
    );


  exportCtx.strokeStyle =
    '#d00000';


  exportCtx.strokeRect(
    exportBlock.x,
    exportBlock.y,
    exportBlock.width,
    blockHeight
  );


  exportCtx.fillStyle =
    '#000000';


  let y =
    exportBlock.y +
    pad +
    fontSize;


  lines.forEach(line => {
    exportCtx.fillText(
      line,
      exportBlock.x + pad,
      y
    );

    y += lineHeight;
  });


  exportCtx.restore();
}


/* =========================================================
   EXPORTAÇÃO EM ALTA RESOLUÇÃO
   ========================================================= */

const EXPORT_SCALE = 4;


function renderExportCanvas(
  scale = EXPORT_SCALE,
  volumeIndex = 1,
  totalVolumes = 1
) {
  /*
    Atualiza estado visual e posição.
  */
  drawLabel();


  const exportCanvas =
    document.createElement('canvas');


  exportCanvas.width =
    originalImage.width * scale;

  exportCanvas.height =
    originalImage.height * scale;


  const exportCtx =
    exportCanvas.getContext('2d');


  exportCtx.imageSmoothingEnabled =
    false;


  exportCtx.clearRect(
    0,
    0,
    exportCanvas.width,
    exportCanvas.height
  );


  /*
    Etiqueta original.
  */
  exportCtx.drawImage(
    originalImage,

    0,
    0,

    exportCanvas.width,
    exportCanvas.height
  );


  /*
    Endereço / telefone corrigido.
  */
  const baseText =
    normalizeIfNeeded(
      addressText.value ||
      lastAppliedText ||
      ''
    );


  const text =
    textForVolume(baseText);


  if (
    baseText.trim() &&
    block
  ) {
    const exportBlock = {
      x:
        Math.round(
          block.x * scale
        ),

      y:
        Math.round(
          block.y * scale
        ),

      width:
        Math.round(
          block.width * scale
        ),

      minHeight:
        Math.round(
          (
            block.minHeight ||
            block.height ||
            40
          ) *
          scale
        ),

      height:
        Math.round(
          (
            block.height ||
            block.minHeight ||
            40
          ) *
          scale
        ),

      mode:
        block.mode,

      fontScale:
        block.fontScale || 1
    };


    drawExportBlock(
      exportCtx,
      exportCanvas,
      exportBlock,
      text
    );
  }


  /*
    Atualiza o campo:

    1/2
    2/2
    etc.
  */
  drawVolumeField(
    exportCtx,
    exportCanvas,
    volumeIndex,
    totalVolumes
  );


  /*
    Atualiza o CODE128 correspondente
    à etiqueta que está sendo gerada.
  */
  const volumeBarcode =
    barcodeForVolume(
      volumeIndex
    );


  if (volumeBarcode) {
    drawBarcodeField(
      exportCtx,
      exportCanvas,
      volumeBarcode
    );
  }


  return exportCanvas;
}


/* =========================================================
   DOWNLOAD PNG
   ========================================================= */

async function downloadPNG() {
  if (!originalImage) {
    alert(
      'Cole a etiqueta original antes de baixar.'
    );

    return;
  }


  const totalVolumes =
    getVolumeCount();


  const ready =
    await prepareBarcodeForOutput(
      totalVolumes
    );


  if (!ready) {
    return;
  }


  /*
    UMA ETIQUETA
  */
  if (totalVolumes <= 1) {
    const exportCanvas =
      renderExportCanvas(
        EXPORT_SCALE,
        1,
        1
      );


    const a =
      document.createElement('a');


    a.download =
      'etiqueta-corrigida.png';


    a.href =
      exportCanvas.toDataURL(
        'image/png'
      );


    a.click();

    return;
  }


  /*
    VÁRIAS ETIQUETAS
  */
  const one =
    renderExportCanvas(
      EXPORT_SCALE,
      1,
      totalVolumes
    );


  const gap =
    Math.round(
      40 * EXPORT_SCALE
    );


  const combined =
    document.createElement('canvas');


  combined.width =
    one.width;


  combined.height =
    (
      one.height *
      totalVolumes
    ) +
    (
      gap *
      (
        totalVolumes - 1
      )
    );


  const cctx =
    combined.getContext('2d');


  cctx.fillStyle =
    '#ffffff';


  cctx.fillRect(
    0,
    0,
    combined.width,
    combined.height
  );


  for (
    let i = 1;
    i <= totalVolumes;
    i++
  ) {
    const page =
      renderExportCanvas(
        EXPORT_SCALE,
        i,
        totalVolumes
      );


    cctx.drawImage(
      page,
      0,
      (
        i - 1
      ) *
      (
        one.height +
        gap
      )
    );
  }


  const a =
    document.createElement('a');


  a.download =
    `etiquetas-corrigidas-${totalVolumes}-volumes.png`;


  a.href =
    combined.toDataURL(
      'image/png'
    );


  a.click();
}


/* =========================================================
   IMPRESSÃO
   ========================================================= */

async function printCanvas() {
  if (!originalImage) {
    alert(
      'Cole a etiqueta original antes de imprimir.'
    );

    return;
  }


  const totalVolumes =
    getVolumeCount();


  const ready =
    await prepareBarcodeForOutput(
      totalVolumes
    );


  if (!ready) {
    return;
  }


  if (totalVolumes > 20) {
    const confirmed =
      window.confirm(
        `Serão impressas ${totalVolumes} etiquetas numeradas de 1/${totalVolumes} até ${totalVolumes}/${totalVolumes}. Deseja continuar?`
      );


    if (!confirmed) {
      return;
    }
  }


  const printWidth =
    originalImage.width;


  const imgs = [];


  /*
    Cada etiqueta passa individualmente
    por renderExportCanvas.

    Portanto:

    i = 1
    1/N
    ...0001

    i = 2
    2/N
    ...0002
  */
  for (
    let i = 1;
    i <= totalVolumes;
    i++
  ) {
    imgs.push(
      renderExportCanvas(
        EXPORT_SCALE,
        i,
        totalVolumes
      )
      .toDataURL(
        'image/png'
      )
    );
  }


  const bodyHtml =
    imgs
      .map(
        src =>
          `<div class="page"><img src="${src}"></div>`
      )
      .join('');


  const win =
    window.open(
      '',
      '_blank'
    );


  win.document.write(`
<!doctype html>

<html>

<head>

<title>Imprimir etiqueta</title>

<style>

@page {
  margin: 0;
}

html,
body {
  margin: 0;
  padding: 0;
  background: #fff;
}

.page {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  page-break-after: always;
  break-after: page;
}

.page:last-child {
  page-break-after: auto;
  break-after: auto;
}

img {
  width: ${printWidth}px;
  max-width: 100%;
  height: auto;
  display: block;
  image-rendering: auto;
}

</style>

</head>

<body>

${bodyHtml}

<script>

window.onload = () => {
  setTimeout(
    () => window.print(),
    300
  );
};

<\/script>

</body>

</html>
  `);


  win.document.close();
}


/* =========================================================
   POSIÇÃO DO PONTEIRO
   ========================================================= */

function canvasPoint(evt) {
  const r =
    canvas.getBoundingClientRect();


  return {
    x:
      (
        evt.clientX -
        r.left
      ) /
      zoom,

    y:
      (
        evt.clientY -
        r.top
      ) /
      zoom
  };
}


/* =========================================================
   ARRASTAR BLOCO VERMELHO
   ========================================================= */

canvas.addEventListener(
  'pointerdown',
  (e) => {
    if (
      !originalImage ||
      !block ||
      !addressText.value.trim()
    ) {
      return;
    }


    const p =
      canvasPoint(e);


    if (
      p.x >= block.x &&
      p.x <=
        block.x +
        block.width &&

      p.y >= block.y &&
      p.y <=
        block.y +
        (
          block.height ||
          block.minHeight
        )
    ) {
      drag.active = true;

      drag.dx =
        p.x -
        block.x;

      drag.dy =
        p.y -
        block.y;


      canvas.setPointerCapture(
        e.pointerId
      );


      canvas.classList.add(
        'dragging'
      );
    }
  }
);


canvas.addEventListener(
  'pointermove',
  (e) => {
    if (!drag.active) {
      return;
    }


    const p =
      canvasPoint(e);


    block.x =
      Math.max(
        0,
        Math.min(
          canvas.width -
          block.width,

          Math.round(
            p.x -
            drag.dx
          )
        )
      );


    block.y =
      Math.max(
        0,
        Math.min(
          canvas.height -
          (
            block.height ||
            block.minHeight
          ),

          Math.round(
            p.y -
            drag.dy
          )
        )
      );


    drawLabel();
  }
);


canvas.addEventListener(
  'pointerup',
  (e) => {
    drag.active = false;


    canvas.classList.remove(
      'dragging'
    );


    try {
      canvas.releasePointerCapture(
        e.pointerId
      );

    } catch (error) {
      // nada
    }
  }
);


canvas.addEventListener(
  'pointercancel',
  () => {
    drag.active = false;

    canvas.classList.remove(
      'dragging'
    );
  }
);


/* =========================================================
   BOTÕES
   ========================================================= */

document
  .getElementById('btnApply')
  .addEventListener(
    'click',
    applyBlock
  );


document
  .getElementById('btnApply2')
  .addEventListener(
    'click',
    applyBlock
  );


document
  .getElementById('btnClear')
  .addEventListener(
    'click',
    clearAll
  );


document
  .getElementById('btnDownload')
  .addEventListener(
    'click',
    downloadPNG
  );


document
  .getElementById('btnPrint')
  .addEventListener(
    'click',
    printCanvas
  );


document
  .getElementById('zoomIn')
  .addEventListener(
    'click',
    () =>
      setZoom(
        zoom + 0.1
      )
  );


document
  .getElementById('zoomOut')
  .addEventListener(
    'click',
    () =>
      setZoom(
        zoom - 0.1
      )
  );


document
  .getElementById('btnResetPos')
  .addEventListener(
    'click',
    resetBlock
  );


document
  .getElementById('btnFit')
  .addEventListener(
    'click',
    fitRightBlock
  );


document
  .getElementById('btnPhonePreset')
  .addEventListener(
    'click',
    setPhonePreset
  );


[
  blockWidthInput,
  blockHeightInput,
  fontScaleInput
]
.forEach(el => {
  if (el) {
    el.addEventListener(
      'input',
      applySizeControls
    );
  }
});


addressText.addEventListener(
  'input',
  applyBlock
);


document
  .getElementById('keepExact')
  .addEventListener(
    'change',
    drawLabel
  );


/* =========================================================
   ALTERAÇÃO DA QUANTIDADE DE VOLUMES
   ========================================================= */

if (volumeCountInput) {
  volumeCountInput.addEventListener(
    'input',
    () => {
      /*
        Atualiza imediatamente
        o volume mostrado.
      */
      drawLabel();


      /*
        Se colocou mais de 1 volume
        e ainda não lemos o barcode,
        tenta novamente.
      */
      if (
        originalImage &&
        getVolumeCount() > 1 &&
        !originalBarcode &&
        barcodeStatus !== 'loading'
      ) {
        detectOriginalBarcode(
          originalImage
        ).then(() => {
          drawLabel();
        });
      }
    }
  );
}


/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

updateSizeLabels();

drawLabel();

setZoom(1);
