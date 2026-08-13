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
let manualSize = false;

let originalBarcode = '';
let barcodeStatus = 'idle';
let barcodeDetectionPromise = null;

const drag = {
  active: false,
  dx: 0,
  dy: 0
};


/* =========================================================
   CAMPOS DA ETIQUETA
   ========================================================= */

const VOLUME_FIELD = {
  centerX: 0.181,
  centerY: 0.496,
  clearWidth: 0.190,
  clearHeight: 0.038
};


/*
  Área onde o NOVO código de barras
  será colocado.
*/
const BARCODE_FIELD = {
  x: 0.145,
  y: 0.812,
  width: 0.710,
  height: 0.088
};


/*
  Regiões onde tentaremos ler o QR grande.
*/
const QR_SCAN_FIELDS = [
  {
    x: 0.48,
    y: 0.245,
    width: 0.49,
    height: 0.34
  },
  {
    x: 0.52,
    y: 0.270,
    width: 0.43,
    height: 0.30
  },
  {
    x: 0.45,
    y: 0.220,
    width: 0.52,
    height: 0.39
  }
];


/*
  Regiões onde tentaremos ler
  o código de barras inferior.
*/
const BARCODE_SCAN_FIELDS = [
  {
    x: 0.10,
    y: 0.785,
    width: 0.80,
    height: 0.145
  },
  {
    x: 0.04,
    y: 0.755,
    width: 0.92,
    height: 0.190
  },
  {
    x: 0.00,
    y: 0.700,
    width: 1.00,
    height: 0.270
  }
];


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

    mode:
      'address',

    fontScale:
      1
  };
}


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

    mode:
      'phone',

    fontScale:
      1
  };
}


/* =========================================================
   POSICIONAMENTO
   ========================================================= */

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

      mode:
        'address',

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
        (
          zoom - 1
        )
      )
    }px`;


  document
    .getElementById(
      'zoomLabel'
    )
    .textContent =
      Math.round(
        zoom * 100
      ) + '%';
}


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
    .filter(Boolean)
    .join('\n');
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
    compactText(text);


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
    digits.length >= 8 &&
    digits.length <= 15
  );
}


function wrapText(
  context,
  text,
  maxWidth
) {

  const lines = [];


  text
    .split('\n')
    .forEach(
      raw => {


        if (
          raw.trim() === ''
        ) {

          lines.push('');

          return;
        }


        const words =
          raw.split(/\s+/);


        let line = '';


        words.forEach(
          word => {


            const test =
              line

                ? `${line} ${word}`

                : word;


            if (
              context
                .measureText(test)
                .width >
                maxWidth &&
              line
            ) {

              lines.push(line);

              line =
                word;

            } else {

              line =
                test;
            }

          }
        );


        lines.push(line);

      }
    );


  return lines;
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
      clearWidth / 2
    );


  const top =
    Math.round(
      centerY -
      clearHeight / 2
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
    fontSize > 8
  ) {

    targetCtx.font =
      `700 ${fontSize}px Arial, Helvetica, sans-serif`;


    if (
      targetCtx
        .measureText(value)
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
   BIBLIOTECAS DE CÓDIGO
   ========================================================= */

function barcodeLibrariesAvailable() {

  /*
    IMPORTANTE:

    NÃO dependemos mais de
    window.QRCode.

    Precisamos apenas:

    ZXingBrowser
    JsBarcode
  */

  return (
    !!window.ZXingBrowser &&
    typeof window.JsBarcode ===
      'function'
  );
}


/* =========================================================
   EXTRAIR O CÓDIGO DE 15 DÍGITOS
   ========================================================= */

function extractBarcodeValue(value) {

  const text =
    String(
      value || ''
    )
      .trim();


  /*
    Se o conteúdo do QR possuir:

    577062760340001|....

    utiliza o primeiro campo.
  */
  const firstField =
    text
      .split('|')[0]
      .replace(
        /\D/g,
        ''
      );


  if (
    firstField.length === 15
  ) {

    return firstField;
  }


  /*
    Se o leitor encontrou somente
    o CODE128.
  */
  const onlyDigits =
    text.replace(
      /\D/g,
      ''
    );


  if (
    onlyDigits.length === 15
  ) {

    return onlyDigits;
  }


  /*
    Procura qualquer sequência
    de exatamente 15 números
    dentro do conteúdo.
  */
  const match =
    text.match(
      /\d{15}/
    );


  return match
    ? match[0]
    : '';
}


/* =========================================================
   CRIAR RECORTE PARA LEITURA
   ========================================================= */

function createScanCanvas(
  img,
  field,
  scale = 3,
  threshold = false
) {

  const sourceWidth =
    img.naturalWidth ||
    img.width;


  const sourceHeight =
    img.naturalHeight ||
    img.height;


  const sx =
    Math.max(
      0,
      Math.round(
        sourceWidth *
        field.x
      )
    );


  const sy =
    Math.max(
      0,
      Math.round(
        sourceHeight *
        field.y
      )
    );


  const sw =
    Math.max(
      1,
      Math.min(

        sourceWidth -
        sx,

        Math.round(
          sourceWidth *
          field.width
        )

      )
    );


  const sh =
    Math.max(
      1,
      Math.min(

        sourceHeight -
        sy,

        Math.round(
          sourceHeight *
          field.height
        )

      )
    );


  const scanCanvas =
    document.createElement(
      'canvas'
    );


  scanCanvas.width =
    Math.max(
      1,
      sw * scale
    );


  scanCanvas.height =
    Math.max(
      1,
      sh * scale
    );


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
    Não suaviza linhas.
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
    preto e branco forte.
  */
  if (threshold) {

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


        const v =
          gray < 185
            ? 0
            : 255;


        data[i] =
          v;


        data[i + 1] =
          v;


        data[i + 2] =
          v;


        data[i + 3] =
          255;
      }


      scanCtx.putImageData(
        imageData,
        0,
        0
      );


    } catch (error) {

      console.warn(
        '[TC Label Editor] Não foi possível reforçar o contraste.',
        error
      );

    }
  }


  return scanCanvas;
}


/* =========================================================
   DECODIFICAR RESULTADO
   ========================================================= */

async function decodeResult(
  reader,
  source,
  mode = 'canvas'
) {

  try {

    const result =

      mode === 'image'

        ? await reader
            .decodeFromImageElement(
              source
            )

        : await reader
            .decodeFromCanvas(
              source
            );


    const raw =

      typeof result?.getText ===
      'function'

        ? result.getText()

        : String(
            result?.text ||
            ''
          );


    return {

      raw,

      code:
        extractBarcodeValue(
          raw
        )

    };


  } catch (error) {

    return {

      raw: '',

      code: ''

    };
  }
}


/* =========================================================
   IDENTIFICAR CÓDIGO ORIGINAL
   ========================================================= */

async function detectOriginalBarcode(img) {

  if (!img) {

    return '';
  }


  /*
    Se já existe leitura em andamento,
    aguarda a mesma.
  */
  if (
    barcodeStatus ===
      'loading' &&
    barcodeDetectionPromise
  ) {

    return barcodeDetectionPromise;
  }


  if (
    !window.ZXingBrowser
  ) {

    originalBarcode =
      '';


    barcodeStatus =
      'error';


    console.error(
      '[TC Label Editor] ZXing não foi carregado pelo index.html.'
    );


    return '';
  }


  const targetImage =
    img;


  originalBarcode =
    '';


  barcodeStatus =
    'loading';


  const task =
    (async () => {


      try {


        /* =================================================
           1. PRIMEIRO TENTA O QR GRANDE
           ================================================= */


        if (
          window
            .ZXingBrowser
            .BrowserQRCodeReader
        ) {


          const qrReader =
            new window
              .ZXingBrowser
              .BrowserQRCodeReader();


          /*
            TENTATIVA NA IMAGEM COMPLETA
          */
          const fullQr =
            await decodeResult(
              qrReader,
              targetImage,
              'image'
            );


          if (
            fullQr.code &&
            originalImage ===
              targetImage
          ) {


            originalBarcode =
              fullQr.code;


            barcodeStatus =
              'ready';


            console.info(
              '[TC Label Editor] Código identificado pelo QR:',
              originalBarcode
            );


            return originalBarcode;
          }



          /*
            TENTATIVAS EM RECORTES DO QR
          */
          for (
            const field
            of QR_SCAN_FIELDS
          ) {


            for (
              const scale
              of [2, 3, 4]
            ) {


              for (
                const threshold
                of [false, true]
              ) {


                const scanCanvas =
                  createScanCanvas(
                    targetImage,
                    field,
                    scale,
                    threshold
                  );


                const qr =
                  await decodeResult(
                    qrReader,
                    scanCanvas,
                    'canvas'
                  );


                if (
                  qr.code &&
                  originalImage ===
                    targetImage
                ) {


                  originalBarcode =
                    qr.code;


                  barcodeStatus =
                    'ready';


                  console.info(
                    '[TC Label Editor] Código identificado pelo QR recortado:',
                    originalBarcode
                  );


                  return originalBarcode;
                }

              }
            }
          }
        }



        /* =================================================
           2. FALLBACK:
           TENTA O CODE128 INFERIOR
           ================================================= */


        const OneDReader =

          window
            .ZXingBrowser
            .BrowserMultiFormatOneDReader

          ||

          window
            .ZXingBrowser
            .BrowserMultiFormatReader;


        if (OneDReader) {


          const oneDReader =
            new OneDReader();


          /*
            IMAGEM COMPLETA
          */
          const fullBarcode =
            await decodeResult(
              oneDReader,
              targetImage,
              'image'
            );


          if (
            fullBarcode.code &&
            originalImage ===
              targetImage
          ) {


            originalBarcode =
              fullBarcode.code;


            barcodeStatus =
              'ready';


            console.info(
              '[TC Label Editor] Código identificado pelo barcode:',
              originalBarcode
            );


            return originalBarcode;
          }



          /*
            RECORTES DO RODAPÉ
          */
          for (
            const field
            of BARCODE_SCAN_FIELDS
          ) {


            for (
              const scale
              of [2, 3, 4, 5]
            ) {


              for (
                const threshold
                of [false, true]
              ) {


                const scanCanvas =
                  createScanCanvas(
                    targetImage,
                    field,
                    scale,
                    threshold
                  );


                const barcode =
                  await decodeResult(
                    oneDReader,
                    scanCanvas,
                    'canvas'
                  );


                if (
                  barcode.code &&
                  originalImage ===
                    targetImage
                ) {


                  originalBarcode =
                    barcode.code;


                  barcodeStatus =
                    'ready';


                  console.info(
                    '[TC Label Editor] Código identificado no rodapé:',
                    originalBarcode
                  );


                  return originalBarcode;
                }

              }
            }
          }
        }



        /*
          NÃO IDENTIFICOU.
        */
        if (
          originalImage ===
          targetImage
        ) {


          originalBarcode =
            '';


          barcodeStatus =
            'error';
        }


        console.warn(
          '[TC Label Editor] Código da etiqueta não identificado.'
        );


        return '';


      } catch (error) {


        if (
          originalImage ===
          targetImage
        ) {


          originalBarcode =
            '';


          barcodeStatus =
            'error';
        }


        console.error(
          '[TC Label Editor] Erro ao identificar o código:',
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
      barcodeDetectionPromise ===
      task
    ) {


      barcodeDetectionPromise =
        null;
    }
  }
}


/* =========================================================
   CRIAR NUMERAÇÃO POR VOLUME
   ========================================================= */

function barcodeForVolume(
  volumeIndex
) {

  const clean =
    extractBarcodeValue(
      originalBarcode
    );


  if (!clean) {

    return '';
  }


  /*
    Exemplo:

    ORIGINAL:
    577062760340001

    BASE:
    57706276034
  */
  const base =
    clean.slice(
      0,
      -4
    );


  /*
    Volume 1 = 0001
    Volume 2 = 0002
    Volume 3 = 0003
  */
  const sequence =
    String(
      volumeIndex
    )
      .padStart(
        4,
        '0'
      );


  return `${base}${sequence}`;
}


/* =========================================================
   DESENHAR O NOVO CODE128
   ========================================================= */

function drawBarcodeField(
  targetCtx,
  targetCanvas,
  value
) {

  if (
    !value ||
    typeof window.JsBarcode !==
      'function'
  ) {

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
    Ajusta a geração proporcionalmente
    à resolução da etiqueta.
  */
  const moduleWidth =
    Math.max(
      1.5,
      targetCanvas.width *
      0.0036
    );


  const barHeight =
    Math.max(
      22,
      Math.round(
        fieldHeight *
        0.52
      )
    );


  const fontSize =
    Math.max(
      10,
      Math.round(
        fieldHeight *
        0.19
      )
    );


  window.JsBarcode(
    barcodeCanvas,
    value,
    {

      format:
        'CODE128',

      width:
        moduleWidth,

      height:
        barHeight,

      displayValue:
        true,

      font:
        'Arial',

      fontSize,

      textAlign:
        'center',

      textPosition:
        'bottom',

      textMargin:
        Math.max(
          1,
          Math.round(
            fieldHeight *
            0.015
          )
        ),

      margin:
        0,

      background:
        '#ffffff',

      lineColor:
        '#000000'

    }
  );


  /*
    Se necessário,
    reduz para caber no campo.
  */
  const fitScale =
    Math.min(

      1,

      (
        fieldWidth *
        0.96
      ) /
      barcodeCanvas.width,

      (
        fieldHeight *
        0.96
      ) /
      barcodeCanvas.height

    );


  const drawWidth =
    Math.max(
      1,
      Math.round(
        barcodeCanvas.width *
        fitScale
      )
    );


  const drawHeight =
    Math.max(
      1,
      Math.round(
        barcodeCanvas.height *
        fitScale
      )
    );


  const drawX =
    Math.round(
      fieldX +
      (
        fieldWidth -
        drawWidth
      ) /
      2
    );


  const drawY =
    Math.round(
      fieldY +
      (
        fieldHeight -
        drawHeight
      ) /
      2
    );


  targetCtx.save();


  /*
    COBRE O BARCODE E
    O NÚMERO ANTIGOS.
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
   VALIDAR ANTES DE IMPRIMIR / BAIXAR
   ========================================================= */

async function prepareBarcodeForOutput(
  totalVolumes
) {

  if (!originalImage) {

    return false;
  }


  if (
    !barcodeLibrariesAvailable()
  ) {

    alert(
      'As bibliotecas de leitura e código de barras não foram carregadas.\n\n' +
      'Verifique a conexão e recarregue a página com Ctrl + F5.'
    );


    return false;
  }


  /*
    Se já está lendo,
    espera terminar.
  */
  if (
    barcodeStatus ===
      'loading' &&
    barcodeDetectionPromise
  ) {


    await barcodeDetectionPromise;
  }


  /*
    Se ainda não identificou,
    tenta novamente.
  */
  if (
    !originalBarcode
  ) {


    await detectOriginalBarcode(
      originalImage
    );


    drawLabel();
  }


  /*
    Para múltiplos volumes
    é obrigatório identificar a base.
  */
  if (
    totalVolumes > 1 &&
    !originalBarcode
  ) {


    alert(
      'Não consegui identificar o código da etiqueta.\n\n' +
      'O sistema tentou ler primeiro o QR Code e depois o código de barras inferior.\n\n' +
      'Cole a etiqueta completa, com boa resolução, e tente novamente.'
    );


    return false;
  }


  return true;
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


  reader.onload =
    () => {


      const img =
        new Image();


      img.onload =
        () => {


          originalImage =
            img;


          originalBarcode =
            '';


          barcodeStatus =
            'idle';


          barcodeDetectionPromise =
            null;


          canvas.width =
            originalImage.width;


          canvas.height =
            originalImage.height;


          block =
            defaultBlock();


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
            '<small>Identificando código da etiqueta...</small>';


          /*
            Inicia automaticamente a leitura.
          */
          detectOriginalBarcode(
            originalImage
          )
          .then(
            value => {


              if (
                originalImage !==
                img
              ) {

                return;
              }


              if (value) {


                pasteImageArea.innerHTML =
                  '<div class="paste-icon">✅</div>' +
                  '<strong>Etiqueta colada</strong>' +
                  `<small>Código identificado: ${value}</small>`;


              } else {


                pasteImageArea.innerHTML =
                  '<div class="paste-icon">⚠️</div>' +
                  '<strong>Etiqueta colada</strong>' +
                  '<small>Código ainda não identificado</small>';
              }


              drawLabel();

            }
          );

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
   CONTROLES DE TAMANHO
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

function drawCorrectAddressBlock(text) {

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
    CORREÇÃO DE ENDEREÇO / TELEFONE
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
    PRÉVIA SEMPRE É O VOLUME 1.
  */
  drawVolumeField(
    ctx,
    canvas,
    1,
    totalVolumes
  );


  /*
    Se já identificou o código,
    mostra o barcode correspondente.
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

const EXPORT_SCALE =
  4;


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
   RENDERIZAR ETIQUETA PARA SAÍDA
   ========================================================= */

function renderExportCanvas(
  scale = EXPORT_SCALE,
  volumeIndex = 1,
  totalVolumes = 1
) {

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


  /*
    IMAGEM ORIGINAL
  */
  exportCtx.drawImage(
    originalImage,

    0,
    0,

    exportCanvas.width,
    exportCanvas.height
  );


  /*
    CORREÇÃO DE ENDEREÇO / TELEFONE
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
    NUMERAÇÃO DO VOLUME
  */
  drawVolumeField(
    exportCtx,
    exportCanvas,
    volumeIndex,
    totalVolumes
  );


  /*
    NOVO CODE128
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
    SOMENTE 1 VOLUME
  */
  if (
    totalVolumes <= 1
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
  const first =
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
    first.width;


  combined.height =

    (
      first.height *
      totalVolumes
    )

    +

    (
      gap *
      (
        totalVolumes -
        1
      )
    );


  const combinedCtx =
    combined.getContext(
      '2d'
    );


  combinedCtx.fillStyle =
    '#ffffff';


  combinedCtx.fillRect(
    0,
    0,
    combined.width,
    combined.height
  );


  /*
    CRIA CADA VOLUME
  */
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


    combinedCtx.drawImage(
      page,
      0,
      (
        i - 1
      ) *
      (
        first.height +
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
   IMPRESSÃO
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
    totalVolumes > 20
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


  /*
    CADA VOLUME RECEBE
    SUA PRÓPRIA NUMERAÇÃO.
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
      .join(
        ''
      );


  const win =
    window.open(
      '',
      '_blank'
    );


  if (
    !win
  ) {


    alert(
      'O navegador bloqueou a janela de impressão. Libere pop-ups e tente novamente.'
    );


    return;
  }


  win.document.write(`
<!doctype html>

<html>

<head>

<title>Imprimir etiqueta</title>

<style>

@page{
  margin:0
}

html,
body{
  margin:0;
  padding:0;
  background:#fff
}

.page{
  display:flex;
  align-items:flex-start;
  justify-content:center;
  page-break-after:always;
  break-after:page
}

.page:last-child{
  page-break-after:auto;
  break-after:auto
}

img{
  width:${printWidth}px;
  max-width:100%;
  height:auto;
  display:block;
  image-rendering:auto
}

</style>

</head>

<body>

${bodyHtml}

<script>

window.onload =
  () =>
    setTimeout(
      () =>
        window.print(),
      300
    );

<\/script>

</body>

</html>
  `);


  win.document.close();
}


/* =========================================================
   PONTO DO MOUSE NO CANVAS
   ========================================================= */

function canvasPoint(evt) {

  const rect =
    canvas.getBoundingClientRect();


  return {

    x:
      (
        evt.clientX -
        rect.left
      ) /
      zoom,

    y:
      (
        evt.clientY -
        rect.top
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
      canvasPoint(e);


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


      // Ignora.

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
   EVENTOS DOS BOTÕES
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
        zoom + 0.1
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
        zoom - 0.1
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


    if (el) {


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
   QUANTIDADE DE VOLUMES
   ========================================================= */

if (
  volumeCountInput
) {


  volumeCountInput.addEventListener(
    'input',
    () => {


      /*
        Atualiza imediatamente
        1/2, 1/3 etc.
      */
      drawLabel();


      /*
        Se aumentou quantidade
        e o código ainda não foi lido,
        tenta novamente.
      */
      if (

        originalImage &&

        getVolumeCount() > 1 &&

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
