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
  PADRÃO REAL DA ETIQUETA

  AWB:
  577-06276034

  Código inferior:
  577062760340001

  Estrutura:
  57706276034 + 0001

  Volume 1:
  577062760340001

  Volume 2:
  577062760340002

  Volume 3:
  577062760340003
*/

let originalBarcode = '';
let barcodeStatus = 'idle';
let barcodeDetectionPromise = null;


/*
  REGIÕES DE BUSCA DO BARCODE

  O sistema tenta primeiro uma área ampla
  e depois aproxima a busca do código inferior.
*/
const BARCODE_SCAN_FIELDS = [
  {
    x: 0.03,
    y: 0.70,
    width: 0.94,
    height: 0.25
  },
  {
    x: 0.08,
    y: 0.75,
    width: 0.84,
    height: 0.20
  },
  {
    x: 0.12,
    y: 0.78,
    width: 0.76,
    height: 0.16
  },
  {
    x: 0.15,
    y: 0.80,
    width: 0.70,
    height: 0.13
  }
];


/*
  LOCAL ONDE O NOVO BARCODE
  SERÁ DESENHADO NA ETIQUETA.
*/
const BARCODE_FIELD = {
  x: 0.145,
  y: 0.805,
  width: 0.710,
  height: 0.098
};


/* =========================================================
   VERIFICAR BIBLIOTECAS
   ========================================================= */

function barcodeLibrariesAvailable() {
  return (
    window.ZXingBrowser &&
    typeof window.JsBarcode === 'function'
  );
}


/* =========================================================
   VALIDAR CÓDIGO LIDO
   ========================================================= */

function normalizeBarcodeValue(value) {
  const digits = String(value || '')
    .replace(/\D/g, '');

  /*
    Código esperado:
    11 números da AWB
    +
    4 números do volume
    =
    15 números.
  */
  if (digits.length !== 15) {
    return '';
  }

  return digits;
}


/* =========================================================
   CRIAR IMAGEM PARA LEITURA
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
    Math.round(
      sourceWidth * field.x
    )
  );


  const sy = Math.max(
    0,
    Math.round(
      sourceHeight * field.y
    )
  );


  const sw = Math.max(
    1,
    Math.min(
      sourceWidth - sx,
      Math.round(
        sourceWidth * field.width
      )
    )
  );


  const sh = Math.max(
    1,
    Math.min(
      sourceHeight - sy,
      Math.round(
        sourceHeight * field.height
      )
    )
  );


  const scanCanvas =
    document.createElement('canvas');


  scanCanvas.width =
    sw * scale;

  scanCanvas.height =
    sh * scale;


  const scanCtx =
    scanCanvas.getContext(
      '2d',
      {
        willReadFrequently: true
      }
    );


  scanCtx.fillStyle =
    '#ffffff';


  scanCtx.fillRect(
    0,
    0,
    scanCanvas.width,
    scanCanvas.height
  );


  /*
    Não suavizar.
    Código de barras depende de linhas definidas.
  */
  scanCtx.imageSmoothingEnabled =
    false;


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
    Segunda tentativa:
    converter para preto e branco.
  */
  if (useThreshold) {
    try {
      const imageData =
        scanCtx.getImageData(
          0,
          0,
          scanCanvas.width,
          scanCanvas.height
        );


      const data =
        imageData.data;


      for (
        let i = 0;
        i < data.length;
        i += 4
      ) {
        const gray =
          (
            data[i] * 0.299
          ) +
          (
            data[i + 1] * 0.587
          ) +
          (
            data[i + 2] * 0.114
          );


        const value =
          gray < 185
            ? 0
            : 255;


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
        '[TC Label Editor] Falha ao aplicar contraste.',
        error
      );
    }
  }


  return scanCanvas;
}


/* =========================================================
   TENTAR DECODIFICAR UM CANVAS
   ========================================================= */

async function tryDecodeBarcodeCanvas(
  reader,
  scanCanvas
) {
  try {
    const result =
      await reader.decodeFromCanvas(
        scanCanvas
      );


    const rawValue =
      typeof result?.getText === 'function'
        ? result.getText()
        : String(
            result?.text || ''
          );


    return normalizeBarcodeValue(
      rawValue
    );

  } catch (error) {
    return '';
  }
}


/* =========================================================
   LER BARCODE ORIGINAL
   ========================================================= */

async function detectOriginalBarcode(img) {
  if (!img) {
    return '';
  }


  /*
    Já existe uma leitura acontecendo.
  */
  if (
    barcodeStatus === 'loading' &&
    barcodeDetectionPromise
  ) {
    return barcodeDetectionPromise;
  }


  if (!barcodeLibrariesAvailable()) {
    originalBarcode = '';
    barcodeStatus = 'error';

    console.error(
      '[TC Label Editor] ZXing ou JsBarcode não carregados.'
    );

    return '';
  }


  const targetImage = img;

  originalBarcode = '';
  barcodeStatus = 'loading';


  const task = (async () => {
    try {
      const ReaderClass =
        window.ZXingBrowser
          .BrowserMultiFormatOneDReader ||
        window.ZXingBrowser
          .BrowserMultiFormatReader;


      if (!ReaderClass) {
        throw new Error(
          'Leitor ZXing indisponível.'
        );
      }


      const reader =
        new ReaderClass();


      /*
        =====================================================
        TENTATIVA 1
        IMAGEM COMPLETA
        =====================================================
      */

      try {
        const result =
          await reader.decodeFromImageElement(
            targetImage
          );


        const rawValue =
          typeof result?.getText === 'function'
            ? result.getText()
            : String(
                result?.text || ''
              );


        const value =
          normalizeBarcodeValue(
            rawValue
          );


        if (
          value &&
          originalImage === targetImage
        ) {
          originalBarcode = value;
          barcodeStatus = 'ready';


          console.log(
            '[TC Label Editor] Barcode identificado na imagem:',
            originalBarcode
          );


          return originalBarcode;
        }

      } catch (error) {
        console.log(
          '[TC Label Editor] Leitura completa não encontrou o CODE128.'
        );
      }


      /*
        =====================================================
        TENTATIVA 2
        REGIÕES DO RODAPÉ
        =====================================================
      */

      for (
        const field
        of BARCODE_SCAN_FIELDS
      ) {
        /*
          Testa diversas ampliações.
        */
        for (
          const scale
          of [2, 3, 4, 5]
        ) {
          /*
            Primeiro imagem original.
            Depois imagem preto/branco.
          */
          for (
            const threshold
            of [false, true]
          ) {
            const scanCanvas =
              createBarcodeScanCanvas(
                targetImage,
                field,
                scale,
                threshold
              );


            const value =
              await tryDecodeBarcodeCanvas(
                reader,
                scanCanvas
              );


            if (
              value &&
              originalImage === targetImage
            ) {
              originalBarcode = value;
              barcodeStatus = 'ready';


              console.log(
                '[TC Label Editor] Barcode identificado:',
                originalBarcode
              );


              return originalBarcode;
            }
          }
        }
      }


      /*
        =====================================================
        TENTATIVA 3
        FAIXA INFERIOR COMPLETA
        =====================================================
      */

      const fullBottomField = {
        x: 0,
        y: 0.65,
        width: 1,
        height: 0.35
      };


      for (
        const scale
        of [2, 3, 4]
      ) {
        for (
          const threshold
          of [false, true]
        ) {
          const scanCanvas =
            createBarcodeScanCanvas(
              targetImage,
              fullBottomField,
              scale,
              threshold
            );


          const value =
            await tryDecodeBarcodeCanvas(
              reader,
              scanCanvas
            );


          if (
            value &&
            originalImage === targetImage
          ) {
            originalBarcode = value;
            barcodeStatus = 'ready';


            console.log(
              '[TC Label Editor] Barcode identificado no rodapé:',
              originalBarcode
            );


            return originalBarcode;
          }
        }
      }


      /*
        NÃO ENCONTROU.
      */
      if (
        originalImage === targetImage
      ) {
        originalBarcode = '';
        barcodeStatus = 'error';
      }


      console.warn(
        '[TC Label Editor] Código de barras inferior não identificado.'
      );


      return '';

    } catch (error) {
      if (
        originalImage === targetImage
      ) {
        originalBarcode = '';
        barcodeStatus = 'error';
      }


      console.error(
        '[TC Label Editor] Erro ao identificar código:',
        error
      );


      return '';
    }
  })();


  barcodeDetectionPromise =
    task;


  try {
    return await task;

  } finally {
    if (
      barcodeDetectionPromise === task
    ) {
      barcodeDetectionPromise = null;
    }
  }
}


/* =========================================================
   GERAR CÓDIGO POR VOLUME
   ========================================================= */

function barcodeForVolume(
  volumeIndex
) {
  const clean =
    normalizeBarcodeValue(
      originalBarcode
    );


  if (!clean) {
    return '';
  }


  /*
    Exemplo:

    577062760340001

    remove 0001

    57706276034
  */
  const base =
    clean.slice(
      0,
      -4
    );


  /*
    1 -> 0001
    2 -> 0002
    3 -> 0003
  */
  const sequence =
    String(volumeIndex)
      .padStart(
        4,
        '0'
      );


  return (
    base +
    sequence
  );
}


/* =========================================================
   DESENHAR NOVO BARCODE
   ========================================================= */

function drawBarcodeField(
  targetCtx,
  targetCanvas,
  value
) {
  if (!value) {
    return;
  }


  if (
    typeof window.JsBarcode !==
    'function'
  ) {
    console.error(
      '[TC Label Editor] JsBarcode indisponível.'
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
    document.createElement(
      'canvas'
    );


  /*
    GERAÇÃO CODE128
  */
  window.JsBarcode(
    barcodeCanvas,
    value,
    {
      format: 'CODE128',

      width: 2,
      height: 34,

      displayValue: true,

      font: 'Arial',
      fontSize: 15,

      textAlign: 'center',
      textPosition: 'bottom',
      textMargin: 1,

      margin: 0,

      background: '#ffffff',
      lineColor: '#000000'
    }
  );


  const maxWidth =
    fieldWidth * 0.96;


  const maxHeight =
    fieldHeight * 0.96;


  const scale =
    Math.min(
      maxWidth /
        barcodeCanvas.width,

      maxHeight /
        barcodeCanvas.height
    );


  const drawWidth =
    Math.max(
      1,
      Math.round(
        barcodeCanvas.width *
        scale
      )
    );


  const drawHeight =
    Math.max(
      1,
      Math.round(
        barcodeCanvas.height *
        scale
      )
    );


  const drawX =
    Math.round(
      fieldX +
      (
        (
          fieldWidth -
          drawWidth
        ) /
        2
      )
    );


  const drawY =
    Math.round(
      fieldY +
      (
        (
          fieldHeight -
          drawHeight
        ) /
        2
      )
    );


  targetCtx.save();


  /*
    APAGA O BARCODE ANTIGO
  */
  targetCtx.fillStyle =
    '#ffffff';


  targetCtx.fillRect(
    fieldX,
    fieldY,
    fieldWidth,
    fieldHeight
  );


  targetCtx.imageSmoothingEnabled =
    false;


  /*
    DESENHA O NOVO.
  */
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
   PREPARAR BARCODE PARA SAÍDA
   ========================================================= */

async function prepareBarcodeForOutput(
  totalVolumes
) {
  if (!originalImage) {
    return false;
  }


  if (!barcodeLibrariesAvailable()) {
    alert(
      'As bibliotecas do código de barras não foram carregadas.\n\n' +
      'Verifique o index.html.'
    );

    return false;
  }


  /*
    Aguarda leitura que já esteja ocorrendo.
  */
  if (
    barcodeStatus === 'loading' &&
    barcodeDetectionPromise
  ) {
    await barcodeDetectionPromise;
  }


  /*
    Ainda não leu?
    Faz nova tentativa.
  */
  if (!originalBarcode) {
    await detectOriginalBarcode(
      originalImage
    );


    drawLabel();
  }


  /*
    Vários volumes:
    obrigatoriamente precisa saber
    o código original.
  */
  if (
    totalVolumes > 1 &&
    !originalBarcode
  ) {
    alert(
      'Não consegui identificar o código de barras inferior da etiqueta.\n\n' +
      'Código esperado no modelo: 15 dígitos, como 577062760340001.\n\n' +
      'Cole a etiqueta completa e tente novamente.'
    );


    return false;
  }


  return true;
}


/* =========================================================
   BLOCO PADRÃO
   ========================================================= */

function defaultBlock() {
  return {
    x:
      Math.round(
        canvas.width *
        0.54
      ),

    y:
      Math.round(
        canvas.height *
        0.57
      ),

    width:
      Math.round(
        canvas.width *
        0.39
      ),

    minHeight:
      Math.round(
        canvas.height *
        0.19
      ),

    mode:
      'address',

    fontScale:
      1
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


  if (
    isPhoneOnly(text)
  ) {
    block =
      phoneDefaultBlock();

  } else {
    block = {
      x:
        Math.round(
          canvas.width *
          0.53
        ),

      y:
        Math.round(
          canvas.height *
          0.58
        ),

      width:
        Math.round(
          canvas.width *
          0.40
        ),

      minHeight:
        Math.round(
          canvas.height *
          0.18
        ),

      mode:
        'address',

      fontScale:
        block?.fontScale ||
        1
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


  manualSize =
    false;


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
    `${
      Math.max(
        0,
        canvas.height *
        (zoom - 1)
      )
    }px`;


  document
    .getElementById(
      'zoomLabel'
    )
    .textContent =
      Math.round(
        zoom *
        100
      ) +
      '%';
}


/* =========================================================
   CARREGAR IMAGEM
   ========================================================= */

function loadImageFromFile(file) {
  if (
    !file ||
    !file.type.startsWith(
      'image/'
    )
  ) {
    return;
  }


  const reader =
    new FileReader();


  reader.onload = () => {
    const img =
      new Image();


    img.onload = () => {
      originalImage =
        img;


      canvas.width =
        originalImage.width;


      canvas.height =
        originalImage.height;


      block =
        defaultBlock();


      /*
        NOVA ETIQUETA =
        NOVO BARCODE.
      */
      originalBarcode =
        '';


      barcodeStatus =
        'idle';


      barcodeDetectionPromise =
        null;


      syncControlsFromBlock();

      drawLabel();


      pasteImageArea
        .classList
        .add(
          'active'
        );


      pasteImageArea.innerHTML =
        '<div class="paste-icon">✅</div>' +
        '<strong>Etiqueta colada</strong>' +
        '<small>Identificando código de barras...</small>';


      /*
        LEITURA AUTOMÁTICA.
      */
      detectOriginalBarcode(
        originalImage
      )
      .then(value => {
        if (value) {
          pasteImageArea.innerHTML =
            '<div class="paste-icon">✅</div>' +
            '<strong>Etiqueta colada</strong>' +
            `<small>Código identificado: ${value}</small>`;

        } else {
          pasteImageArea.innerHTML =
            '<div class="paste-icon">✅</div>' +
            '<strong>Etiqueta colada</strong>' +
            '<small>Código não identificado automaticamente</small>';
        }


        drawLabel();
      });
    };


    img.src =
      reader.result;
  };


  reader.readAsDataURL(
    file
  );
}


/* =========================================================
   COLAR IMAGEM
   ========================================================= */

function handlePaste(e) {
  const items =
    e.clipboardData?.items ||
    [];


  for (
    const item
    of items
  ) {
    if (
      item.type.startsWith(
        'image/'
      )
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
  e => {
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
  () =>
    pasteImageArea.focus()
);


document
  .getElementById(
    'btnFile'
  )
  .addEventListener(
    'click',
    () =>
      fileInput.click()
  );


fileInput.addEventListener(
  'change',
  () =>
    loadImageFromFile(
      fileInput.files[0]
    )
);


/* =========================================================
   TEXTO
   ========================================================= */

function normalizeIfNeeded(text) {
  const keepExact =
    document
      .getElementById(
        'keepExact'
      )
      .checked;


  if (keepExact) {
    return text
      .replace(
        /\r\n/g,
        '\n'
      )
      .trimEnd();
  }


  return text
    .replace(
      /\r\n/g,
      '\n'
    )
    .split('\n')
    .map(
      line =>
        line.trim()
    )
    .filter(
      Boolean
    )
    .join(
      '\n'
    );
}


function compactText(text) {
  return (
    text || ''
  )
    .replace(
      /\r\n/g,
      '\n'
    )
    .trim();
}


function isPhoneOnly(text) {
  const t =
    compactText(
      text
    );


  if (!t) {
    return false;
  }


  if (
    !/^[\d\s()+\-.]+$/
      .test(t)
  ) {
    return false;
  }


  const digits =
    t.replace(
      /\D/g,
      ''
    );


  return (
    digits.length >=
      8 &&
    digits.length <=
      15
  );
}


/* =========================================================
   QUANTIDADE DE VOLUMES
   ========================================================= */

function getVolumeCount() {
  const n =
    parseInt(
      volumeCountInput?.value ||
      '1',
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
      clearWidth /
      2
    );


  const top =
    Math.round(
      centerY -
      clearHeight /
      2
    );


  const value =
    `${current}/${total}`;


  targetCtx.save();


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
        canvasWidth *
        0.030
      )
    );


  const maxTextWidth =
    clearWidth *
    0.90;


  while (
    fontSize >
    8
  ) {
    targetCtx.font =
      `700 ${fontSize}px Arial, Helvetica, sans-serif`;


    if (
      targetCtx
        .measureText(
          value
        )
        .width <=
      maxTextWidth
    ) {
      break;
    }


    fontSize -=
      1;
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
        canvas.width *
        0.54
      ),

    y:
      Math.round(
        canvas.height *
        0.69
      ),

    width:
      Math.round(
        canvas.width *
        0.31
      ),

    minHeight:
      Math.round(
        canvas.height *
        0.055
      ),

    mode:
      'phone',

    fontScale:
      1
  };
}


/* =========================================================
   CONTROLES
   ========================================================= */

function updateSizeLabels() {
  if (
    blockWidthInput
  ) {
    document
      .getElementById(
        'blockWidthLabel'
      )
      .textContent =
        `${blockWidthInput.value}%`;
  }


  if (
    blockHeightInput
  ) {
    document
      .getElementById(
        'blockHeightLabel'
      )
      .textContent =
        `${blockHeightInput.value}%`;
  }


  if (
    fontScaleInput
  ) {
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
      (
        block.width /
        canvas.width
      ) *
      100
    );


  const h =
    Math.round(
      (
        block.minHeight /
        canvas.height
      ) *
      100
    );


  if (
    blockWidthInput
  ) {
    blockWidthInput.value =
      Math.max(
        +blockWidthInput.min,
        Math.min(
          +blockWidthInput.max,
          w
        )
      );
  }


  if (
    blockHeightInput
  ) {
    blockHeightInput.value =
      Math.max(
        +blockHeightInput.min,
        Math.min(
          +blockHeightInput.max,
          h
        )
      );
  }


  if (
    fontScaleInput
  ) {
    fontScaleInput.value =
      Math.round(
        (
          block.fontScale ||
          1
        ) *
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


  manualSize =
    true;


  const widthPct =
    Number(
      blockWidthInput.value ||
      31
    ) /
    100;


  const heightPct =
    Number(
      blockHeightInput.value ||
      6
    ) /
    100;


  block.width =
    Math.round(
      canvas.width *
      widthPct
    );


  block.minHeight =
    Math.round(
      canvas.height *
      heightPct
    );


  block.fontScale =
    Number(
      fontScaleInput.value ||
      100
    ) /
    100;


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
  if (
    !originalImage
  ) {
    return;
  }


  if (
    !block
  ) {
    block =
      phoneDefaultBlock();
  }


  block.width =
    Math.round(
      canvas.width *
      0.22
    );


  block.minHeight =
    Math.round(
      canvas.height *
      0.04
    );


  block.fontScale =
    0.85;


  block.mode =
    'phone';


  block.x =
    Math.round(
      canvas.width *
      0.57
    );


  block.y =
    Math.round(
      canvas.height *
      0.66
    );


  manualSize =
    true;


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
  const lines =
    [];


  text
    .split('\n')
    .forEach(
      raw => {
        if (
          raw.trim() ===
          ''
        ) {
          lines.push(
            ''
          );

          return;
        }


        const words =
          raw.split(
            /\s+/
          );


        let line =
          '';


        words.forEach(
          word => {
            const test =
              line
                ? line +
                  ' ' +
                  word
                : word;


            if (
              ctx
                .measureText(
                  test
                )
                .width >
                maxWidth &&
              line
            ) {
              lines.push(
                line
              );

              line =
                word;

            } else {
              line =
                test;
            }
          }
        );


        lines.push(
          line
        );
      }
    );


  return lines;
}


/* =========================================================
   PRÉ-VISUALIZAÇÃO
   ========================================================= */

function drawLabel() {
  if (
    !originalImage
  ) {
    canvas.width =
      620;


    canvas.height =
      850;


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


  if (
    !block
  ) {
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
    textForVolume(
      text
    );


  /*
    ENDEREÇO / TELEFONE
  */
  if (
    text.trim()
  ) {
    if (
      isPhoneOnly(
        text
      )
    ) {
      if (
        !block ||
        block.mode !==
          'phone'
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
        block.mode ===
          'phone'
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
    PRÉVIA = PRIMEIRO VOLUME
  */
  drawVolumeField(
    ctx,
    canvas,
    1,
    totalVolumes
  );


  /*
    NOVO BARCODE DO VOLUME 1
  */
  const previewBarcode =
    barcodeForVolume(
      1
    );


  if (
    previewBarcode
  ) {
    drawBarcodeField(
      ctx,
      canvas,
      previewBarcode
    );
  }


  setZoom(
    zoom
  );
}


/* =========================================================
   DESENHAR TELEFONE
   ========================================================= */

function drawPhoneOnlyBlock(
  text
) {
  const pos =
    block ||
    phoneDefaultBlock();


  const pad =
    Math.max(
      5,
      Math.round(
        canvas.width *
        0.008
      )
    );


  const fontSize =
    Math.max(
      9,
      Math.round(
        canvas.width *
        0.023 *
        (
          pos.fontScale ||
          1
        )
      )
    );


  const lineHeight =
    Math.round(
      fontSize *
      1.22
    );


  ctx.save();


  ctx.font =
    `${fontSize}px Arial, Helvetica, sans-serif`;


  const contentWidth =
    pos.width -
    pad *
    2;


  const lines =
    wrapText(
      ctx,
      text,
      contentWidth
    );


  const blockHeight =
    Math.max(
      pos.minHeight,
      pad *
      2 +
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
    pos.fontScale ||
    1;


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
        canvas.width *
        0.0025
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


  lines.forEach(
    line => {
      ctx.fillText(
        line,
        pos.x +
        pad,
        y
      );


      y +=
        lineHeight;
    }
  );


  ctx.restore();
}


/* =========================================================
   DESENHAR ENDEREÇO
   ========================================================= */

function drawCorrectAddressBlock(
  text
) {
  const pos =
    block ||
    defaultBlock();


  block.mode =
    'address';


  block.fontScale =
    pos.fontScale ||
    1;


  const pad =
    Math.max(
      7,
      Math.round(
        canvas.width *
        0.011
      )
    );


  const fontSize =
    Math.max(
      9,
      Math.round(
        canvas.width *
        0.024 *
        (
          pos.fontScale ||
          1
        )
      )
    );


  const lineHeight =
    Math.round(
      fontSize *
      1.22
    );


  ctx.save();


  ctx.font =
    `${fontSize}px Arial, Helvetica, sans-serif`;


  const contentWidth =
    pos.width -
    pad *
    2;


  const lines =
    wrapText(
      ctx,
      text,
      contentWidth
    );


  const blockHeight =
    Math.max(
      pos.minHeight,
      pad *
      2 +
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
        canvas.width *
        0.004
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


  lines.forEach(
    line => {
      ctx.fillText(
        line,
        pos.x +
        pad,
        y
      );


      y +=
        lineHeight;
    }
  );


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
  originalImage =
    null;


  originalBarcode =
    '';


  barcodeStatus =
    'idle';


  barcodeDetectionPromise =
    null;


  block =
    null;


  lastAppliedText =
    '';


  addressText.value =
    '';


  if (
    volumeCountInput
  ) {
    volumeCountInput.value =
      '1';
  }


  pasteImageArea
    .classList
    .remove(
      'active'
    );


  pasteImageArea.innerHTML =
    '<div class="paste-icon">📋</div>' +
    '<strong>Clique aqui e pressione Ctrl + V</strong>' +
    '<small>Cole o recorte da etiqueta original</small>';


  drawLabel();
}


/* =========================================================
   EXPORTAR BLOCO DE TEXTO
   ========================================================= */

function drawExportBlock(
  exportCtx,
  exportCanvas,
  exportBlock,
  text
) {
  const isPhone =
    isPhoneOnly(
      text
    );


  const pad =
    Math.max(
      isPhone
        ? 5
        : 7,
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
      9 *
      EXPORT_SCALE,
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
      fontSize *
      1.22
    );


  exportCtx.save();


  exportCtx.font =
    `${fontSize}px Arial, Helvetica, sans-serif`;


  exportCtx.textBaseline =
    'alphabetic';


  const contentWidth =
    exportBlock.width -
    pad *
    2;


  const lines =
    wrapText(
      exportCtx,
      text,
      contentWidth
    );


  const blockHeight =
    Math.max(
      exportBlock.minHeight,
      pad *
      2 +
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
      isPhone
        ? 1
        : 2,
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


  lines.forEach(
    line => {
      exportCtx.fillText(
        line,
        exportBlock.x +
        pad,
        y
      );


      y +=
        lineHeight;
    }
  );


  exportCtx.restore();
}


/* =========================================================
   EXPORTAÇÃO
   ========================================================= */

const EXPORT_SCALE =
  4;


function renderExportCanvas(
  scale = EXPORT_SCALE,
  volumeIndex = 1,
  totalVolumes = 1
) {
  drawLabel();


  const exportCanvas =
    document.createElement(
      'canvas'
    );


  exportCanvas.width =
    originalImage.width *
    scale;


  exportCanvas.height =
    originalImage.height *
    scale;


  const exportCtx =
    exportCanvas.getContext(
      '2d'
    );


  exportCtx.imageSmoothingEnabled =
    false;


  exportCtx.clearRect(
    0,
    0,
    exportCanvas.width,
    exportCanvas.height
  );


  exportCtx.drawImage(
    originalImage,
    0,
    0,
    exportCanvas.width,
    exportCanvas.height
  );


  /*
    ENDEREÇO / TELEFONE
  */
  const baseText =
    normalizeIfNeeded(
      addressText.value ||
      lastAppliedText ||
      ''
    );


  const text =
    textForVolume(
      baseText
    );


  if (
    baseText.trim() &&
    block
  ) {
    const exportBlock = {
      x:
        Math.round(
          block.x *
          scale
        ),

      y:
        Math.round(
          block.y *
          scale
        ),

      width:
        Math.round(
          block.width *
          scale
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
        block.fontScale ||
        1
    };


    drawExportBlock(
      exportCtx,
      exportCanvas,
      exportBlock,
      text
    );
  }


  /*
    VOLUME

    1/2
    2/2
  */
  drawVolumeField(
    exportCtx,
    exportCanvas,
    volumeIndex,
    totalVolumes
  );


  /*
    BARCODE

    ...0001
    ...0002
  */
  const volumeBarcode =
    barcodeForVolume(
      volumeIndex
    );


  if (
    volumeBarcode
  ) {
    drawBarcodeField(
      exportCtx,
      exportCanvas,
      volumeBarcode
    );
  }


  return exportCanvas;
}


/* =========================================================
   BAIXAR PNG
   ========================================================= */

async function downloadPNG() {
  if (
    !originalImage
  ) {
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


  if (
    !ready
  ) {
    return;
  }


  /*
    APENAS 1 VOLUME
  */
  if (
    totalVolumes <=
    1
  ) {
    const exportCanvas =
      renderExportCanvas(
        EXPORT_SCALE,
        1,
        1
      );


    const a =
      document.createElement(
        'a'
      );


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
    VÁRIOS VOLUMES
  */
  const one =
    renderExportCanvas(
      EXPORT_SCALE,
      1,
      totalVolumes
    );


  const gap =
    Math.round(
      40 *
      EXPORT_SCALE
    );


  const combined =
    document.createElement(
      'canvas'
    );


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
        totalVolumes -
        1
      )
    );


  const cctx =
    combined.getContext(
      '2d'
    );


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
        i -
        1
      ) *
      (
        one.height +
        gap
      )
    );
  }


  const a =
    document.createElement(
      'a'
    );


  a.download =
    `etiquetas-corrigidas-${totalVolumes}-volumes.png`;


  a.href =
    combined.toDataURL(
      'image/png'
    );


  a.click();
}


/* =========================================================
   IMPRIMIR
   ========================================================= */

async function printCanvas() {
  if (
    !originalImage
  ) {
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


  if (
    !ready
  ) {
    return;
  }


  if (
    totalVolumes >
    20
  ) {
    const confirmed =
      window.confirm(
        `Serão impressas ${totalVolumes} etiquetas numeradas de 1/${totalVolumes} até ${totalVolumes}/${totalVolumes}. Deseja continuar?`
      );


    if (
      !confirmed
    ) {
      return;
    }
  }


  const printWidth =
    originalImage.width;


  const imgs =
    [];


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
      .join(
        ''
      );


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
   POSIÇÃO NO CANVAS
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
   ARRASTAR BLOCO
   ========================================================= */

canvas.addEventListener(
  'pointerdown',
  e => {
    if (
      !originalImage ||
      !block ||
      !addressText.value.trim()
    ) {
      return;
    }


    const p =
      canvasPoint(
        e
      );


    if (
      p.x >=
        block.x &&
      p.x <=
        block.x +
        block.width &&
      p.y >=
        block.y &&
      p.y <=
        block.y +
        (
          block.height ||
          block.minHeight
        )
    ) {
      drag.active =
        true;


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
  e => {
    if (
      !drag.active
    ) {
      return;
    }


    const p =
      canvasPoint(
        e
      );


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
  e => {
    drag.active =
      false;


    canvas.classList.remove(
      'dragging'
    );


    try {
      canvas.releasePointerCapture(
        e.pointerId
      );

    } catch (error) {
      // ignora
    }
  }
);


canvas.addEventListener(
  'pointercancel',
  () => {
    drag.active =
      false;


    canvas.classList.remove(
      'dragging'
    );
  }
);


/* =========================================================
   BOTÕES
   ========================================================= */

document
  .getElementById(
    'btnApply'
  )
  .addEventListener(
    'click',
    applyBlock
  );


document
  .getElementById(
    'btnApply2'
  )
  .addEventListener(
    'click',
    applyBlock
  );


document
  .getElementById(
    'btnClear'
  )
  .addEventListener(
    'click',
    clearAll
  );


document
  .getElementById(
    'btnDownload'
  )
  .addEventListener(
    'click',
    downloadPNG
  );


document
  .getElementById(
    'btnPrint'
  )
  .addEventListener(
    'click',
    printCanvas
  );


document
  .getElementById(
    'zoomIn'
  )
  .addEventListener(
    'click',
    () =>
      setZoom(
        zoom +
        0.1
      )
  );


document
  .getElementById(
    'zoomOut'
  )
  .addEventListener(
    'click',
    () =>
      setZoom(
        zoom -
        0.1
      )
  );


document
  .getElementById(
    'btnResetPos'
  )
  .addEventListener(
    'click',
    resetBlock
  );


document
  .getElementById(
    'btnFit'
  )
  .addEventListener(
    'click',
    fitRightBlock
  );


document
  .getElementById(
    'btnPhonePreset'
  )
  .addEventListener(
    'click',
    setPhonePreset
  );


[
  blockWidthInput,
  blockHeightInput,
  fontScaleInput
]
  .forEach(
    el => {
      if (
        el
      ) {
        el.addEventListener(
          'input',
          applySizeControls
        );
      }
    }
  );


addressText.addEventListener(
  'input',
  applyBlock
);


document
  .getElementById(
    'keepExact'
  )
  .addEventListener(
    'change',
    drawLabel
  );


/* =========================================================
   ALTERAR QUANTIDADE DE VOLUMES
   ========================================================= */

if (
  volumeCountInput
) {
  volumeCountInput.addEventListener(
    'input',
    () => {
      drawLabel();


      /*
        Se aumentou quantidade,
        mas ainda não temos barcode,
        tenta ler novamente.
      */
      if (
        originalImage &&
        getVolumeCount() >
          1 &&
        !originalBarcode &&
        barcodeStatus !==
          'loading'
      ) {
        detectOriginalBarcode(
          originalImage
        )
          .then(
            () => {
              drawLabel();
            }
          );
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
