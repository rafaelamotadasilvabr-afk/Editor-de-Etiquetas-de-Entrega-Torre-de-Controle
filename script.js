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
const volumeCountInput = document.getElementById('volumeCount');


/* =========================================================
   CÓDIGO DE BARRAS
   ========================================================= */

const ZXING_CDN =
  'https://unpkg.com/@zxing/browser@0.2.1';

const JSBARCODE_CDN =
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.12.3/dist/JsBarcode.all.min.js';

let originalBarcode = '';
let barcodeStatus = 'idle';
// idle | loading | ready | error

let barcodeLibrariesPromise = null;


/*
  Áreas onde o sistema tenta localizar
  o código de barras inferior da etiqueta.

  São proporcionais ao tamanho da imagem.
*/
const BARCODE_SCAN_FIELDS = [
  {
    x: 0.145,
    y: 0.795,
    width: 0.710,
    height: 0.120
  },

  {
    x: 0.100,
    y: 0.765,
    width: 0.800,
    height: 0.165
  },

  {
    x: 0.060,
    y: 0.735,
    width: 0.880,
    height: 0.220
  }
];


/*
  Área exata onde o novo barcode
  será desenhado.
*/
const BARCODE_FIELD = {
  x: 0.155,
  y: 0.817,
  width: 0.690,
  height: 0.080
};


/* =========================================================
   CARREGAR BIBLIOTECAS AUTOMATICAMENTE
   ========================================================= */

function loadExternalScript(src, globalName){

  if(globalName && window[globalName]){
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {

    const existing = Array
      .from(document.scripts)
      .find(script => script.src === src);

    if(existing){

      if(globalName && window[globalName]){
        resolve();
        return;
      }

      existing.addEventListener(
        'load',
        () => resolve(),
        { once:true }
      );

      existing.addEventListener(
        'error',
        () => reject(
          new Error(`Falha ao carregar ${src}`)
        ),
        { once:true }
      );

      return;
    }

    const script =
      document.createElement('script');

    script.src = src;
    script.async = true;

    script.onload = () => resolve();

    script.onerror = () => {
      reject(
        new Error(
          `Falha ao carregar ${src}`
        )
      );
    };

    document.head.appendChild(script);
  });
}


function ensureBarcodeLibraries(){

  if(
    window.ZXingBrowser &&
    window.JsBarcode
  ){
    return Promise.resolve();
  }

  if(!barcodeLibrariesPromise){

    barcodeLibrariesPromise =
      Promise.all([

        loadExternalScript(
          ZXING_CDN,
          'ZXingBrowser'
        ),

        loadExternalScript(
          JSBARCODE_CDN,
          'JsBarcode'
        )

      ])
      .then(() => {

        if(!window.ZXingBrowser){
          throw new Error(
            'ZXingBrowser não carregou.'
          );
        }

        if(!window.JsBarcode){
          throw new Error(
            'JsBarcode não carregou.'
          );
        }

      })
      .catch(error => {

        barcodeLibrariesPromise = null;

        throw error;
      });
  }

  return barcodeLibrariesPromise;
}


/* =========================================================
   LEITURA DO BARCODE ORIGINAL
   ========================================================= */

function createBarcodeScanCanvas(
  img,
  field,
  scale = 3
){

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
    scanCanvas.getContext('2d');


  scanCtx.fillStyle = '#ffffff';

  scanCtx.fillRect(
    0,
    0,
    scanCanvas.width,
    scanCanvas.height
  );


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


  return scanCanvas;
}


/*
  Padrão confirmado na etiqueta:

  AWB sem hífen:
  57706276034

  +

  sequência de volume:
  0001

  =

  577062760340001

  Portanto:
  11 dígitos de base
  +
  4 dígitos de sequência
  =
  15 dígitos
*/
function normalizeBarcodeValue(value){

  const digits =
    String(value || '')
      .replace(/\D/g, '');


  if(digits.length !== 15){
    return '';
  }


  return digits;
}


async function detectOriginalBarcode(img){

  if(!img){
    return '';
  }


  barcodeStatus = 'loading';

  originalBarcode = '';


  try{

    await ensureBarcodeLibraries();


    const reader =
      new window
        .ZXingBrowser
        .BrowserMultiFormatOneDReader();


    for(
      const field
      of BARCODE_SCAN_FIELDS
    ){

      try{

        const scanCanvas =
          createBarcodeScanCanvas(
            img,
            field,
            3
          );


        const result =
          reader.decodeFromCanvas(
            scanCanvas
          );


        const rawValue =
          typeof result?.getText ===
          'function'

            ? result.getText()

            : (
              result?.text || ''
            );


        const value =
          normalizeBarcodeValue(
            rawValue
          );


        if(value){

          originalBarcode = value;

          barcodeStatus = 'ready';


          console.info(
            '[TC Label Editor] Código de barras identificado:',
            originalBarcode
          );


          return originalBarcode;
        }


      }catch(error){

        /*
          Se não conseguiu nessa área,
          tenta a próxima.
        */

      }
    }


    barcodeStatus = 'error';


    console.warn(
      '[TC Label Editor] Não foi possível identificar o código de barras inferior.'
    );


    return '';


  }catch(error){

    barcodeStatus = 'error';


    console.error(
      '[TC Label Editor] Falha ao preparar leitura do código de barras:',
      error
    );


    return '';
  }
}


/* =========================================================
   GERAR SEQUÊNCIA DO VOLUME
   ========================================================= */

function barcodeForVolume(volumeIndex){

  const clean =
    normalizeBarcodeValue(
      originalBarcode
    );


  if(!clean){
    return '';
  }


  /*
    Remove os últimos 4 números.

    Exemplo:

    577062760340001

    vira:

    57706276034
  */
  const base =
    clean.slice(0, -4);


  /*
    Cria:

    1 -> 0001
    2 -> 0002
    3 -> 0003
  */
  const sequence =
    String(volumeIndex)
      .padStart(4, '0');


  return `${base}${sequence}`;
}


/* =========================================================
   DESENHAR NOVO BARCODE
   ========================================================= */

function drawBarcodeField(
  targetCtx,
  targetCanvas,
  value
){

  if(
    !value ||
    typeof window.JsBarcode !==
      'function'
  ){
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
    Gera CODE128
  */
  window.JsBarcode(
    barcodeCanvas,
    value,
    {

      format: 'CODE128',

      width: 2,

      height: 30,

      displayValue: true,

      font: 'Arial',

      fontSize: 16,

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
        fieldWidth -
        drawWidth
      ) / 2

    );


  const drawY =
    Math.round(

      fieldY +

      (
        fieldHeight -
        drawHeight
      ) / 2

    );


  targetCtx.save();


  /*
    Cobre o barcode antigo.
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
   VALIDAR BARCODE ANTES DE BAIXAR / IMPRIMIR
   ========================================================= */

async function prepareBarcodeForOutput(
  totalVolumes
){

  if(!originalImage){
    return false;
  }


  try{

    await ensureBarcodeLibraries();


  }catch(error){

    if(totalVolumes > 1){

      alert(
        'Não foi possível carregar o leitor/gerador de código de barras. Verifique a conexão com a internet e tente novamente.'
      );

      return false;
    }


    return true;
  }


  /*
    Se ainda não leu,
    tenta novamente.
  */
  if(!originalBarcode){

    await detectOriginalBarcode(
      originalImage
    );

    drawLabel();
  }


  /*
    Para vários volumes,
    não permitimos gerar etiquetas
    sem saber qual é a base correta.
  */
  if(
    totalVolumes > 1 &&
    !originalBarcode
  ){

    alert(
      'Não consegui identificar o código de barras inferior da etiqueta.\n\n' +
      'Para gerar mais de um volume com segurança, cole a etiqueta completa e com o código de barras legível.'
    );


    return false;
  }


  return true;
}


/*
  Pré-carrega as bibliotecas
  sem bloquear o editor.
*/
ensureBarcodeLibraries()
  .catch(() => {});


/* =========================================================
   BLOCO DE CORREÇÃO
   ========================================================= */

function defaultBlock(){

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


function fitRightBlock(){

  if(!originalImage){
    return;
  }


  const text =
    normalizeIfNeeded(
      addressText.value ||
      lastAppliedText ||
      ''
    );


  if(isPhoneOnly(text)){

    block =
      phoneDefaultBlock();

  }else{

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


function resetBlock(){

  if(!originalImage){
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

function setZoom(value){

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
        zoom * 100
      ) + '%';
}


/* =========================================================
   CARREGAR ETIQUETA
   ========================================================= */

function loadImageFromFile(file){

  if(
    !file ||
    !file.type.startsWith(
      'image/'
    )
  ){
    return;
  }


  const reader =
    new FileReader();


  reader.onload = () => {

    const img =
      new Image();


    img.onload = () => {

      originalImage = img;


      canvas.width =
        originalImage.width;

      canvas.height =
        originalImage.height;


      block =
        defaultBlock();


      /*
        Toda nova etiqueta
        precisa ser lida novamente.
      */
      originalBarcode = '';

      barcodeStatus =
        'loading';


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
        Detecta automaticamente
        o código de barras inferior.
      */
      detectOriginalBarcode(
        originalImage
      )
      .then(() => {

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
   COLAR / SELECIONAR IMAGEM
   ========================================================= */

function handlePaste(e){

  const items =
    e.clipboardData?.items ||
    [];


  for(
    const item
    of items
  ){

    if(
      item.type.startsWith(
        'image/'
      )
    ){

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

    if(
      document.activeElement ===
      addressText
    ){
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

function normalizeIfNeeded(text){

  const keepExact =
    document
      .getElementById(
        'keepExact'
      )
      .checked;


  if(keepExact){

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


function compactText(text){

  return (
    text || ''
  )
  .replace(
    /\r\n/g,
    '\n'
  )
  .trim();
}


function isPhoneOnly(text){

  const t =
    compactText(text);


  if(!t){
    return false;
  }


  /*
    Exemplos aceitos:

    11974929028
    (11) 97492-9028
    +55 11 97492-9028
  */
  if(
    !/^[\d\s()+\-.]+$/
      .test(t)
  ){
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


/* =========================================================
   QUANTIDADE DE VOLUMES
   ========================================================= */

function getVolumeCount(){

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


function textForVolume(text){

  return text || '';
}


/* =========================================================
   CAMPO VOLUME
   ========================================================= */

/*
  Campo original "Volume"
  da etiqueta.

  A quantidade informada
  no campo da tela será
  a fonte de verdade.
*/
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
){

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


  /*
    Apaga somente o valor
    que já estava no campo Volume.
  */
  targetCtx.fillStyle =
    '#ffffff';


  targetCtx.fillRect(
    left,
    top,
    clearWidth,
    clearHeight
  );


  /*
    Ajuste automático
    de tamanho.
  */
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


  while(
    fontSize > 8
  ){

    targetCtx.font =
      `700 ${fontSize}px Arial, Helvetica, sans-serif`;


    if(
      targetCtx
        .measureText(value)
        .width <=
      maxTextWidth
    ){
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
   BLOCO TELEFONE
   ========================================================= */

function phoneDefaultBlock(){

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
   CONTROLES DE TAMANHO
   ========================================================= */

function updateSizeLabels(){

  if(blockWidthInput){

    document
      .getElementById(
        'blockWidthLabel'
      )
      .textContent =
        `${blockWidthInput.value}%`;
  }


  if(blockHeightInput){

    document
      .getElementById(
        'blockHeightLabel'
      )
      .textContent =
        `${blockHeightInput.value}%`;
  }


  if(fontScaleInput){

    document
      .getElementById(
        'fontScaleLabel'
      )
      .textContent =
        `${fontScaleInput.value}%`;
  }
}


function syncControlsFromBlock(){

  if(
    !canvas.width ||
    !block
  ){
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


  if(blockWidthInput){

    blockWidthInput.value =
      Math.max(
        +blockWidthInput.min,

        Math.min(
          +blockWidthInput.max,
          w
        )
      );
  }


  if(blockHeightInput){

    blockHeightInput.value =
      Math.max(
        +blockHeightInput.min,

        Math.min(
          +blockHeightInput.max,
          h
        )
      );
  }


  if(fontScaleInput){

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


function applySizeControls(){

  if(
    !originalImage ||
    !block
  ){
    return;
  }


  manualSize = true;


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


function setPhonePreset(){

  if(!originalImage){
    return;
  }


  if(!block){
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
){

  const lines = [];


  text
    .split('\n')
    .forEach(
      raw => {

        if(
          raw.trim() === ''
        ){

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
                ? line +
                  ' ' +
                  word
                : word;


            if(
              ctx
                .measureText(test)
                .width >
                maxWidth &&
              line
            ){

              lines.push(
                line
              );

              line =
                word;

            }else{

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
   PRÉ-VISUALIZAÇÃO PRINCIPAL
   ========================================================= */

function drawLabel(){

  if(!originalImage){

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


  if(!block){

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
    Correção de endereço
    ou telefone.
  */
  if(text.trim()){

    if(isPhoneOnly(text)){

      if(
        !block ||
        block.mode !==
          'phone'
      ){

        block =
          phoneDefaultBlock();
      }


      drawPhoneOnlyBlock(
        displayText
      );


    }else{

      if(
        !block ||
        block.mode ===
          'phone'
      ){

        block =
          defaultBlock();
      }


      drawCorrectAddressBlock(
        displayText
      );
    }
  }


  /*
    A prévia sempre mostra
    o PRIMEIRO volume.
  */
  drawVolumeField(
    ctx,
    canvas,
    1,
    totalVolumes
  );


  /*
    Se o barcode já foi lido,
    mostra o código correspondente
    ao volume 1.
  */
  const previewBarcode =
    barcodeForVolume(1);


  if(previewBarcode){

    drawBarcodeField(
      ctx,
      canvas,
      previewBarcode
    );
  }


  setZoom(zoom);
}


/* =========================================================
   DESENHAR BLOCO DE TELEFONE
   ========================================================= */

function drawPhoneOnlyBlock(text){

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
    pad * 2;


  const lines =
    wrapText(
      ctx,
      text,
      contentWidth
    );


  const blockHeight =
    Math.max(

      pos.minHeight,

      pad * 2 +

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
        pos.x + pad,
        y
      );


      y +=
        lineHeight;
    }
  );


  ctx.restore();
}


/* =========================================================
   DESENHAR BLOCO DE ENDEREÇO
   ========================================================= */

function drawCorrectAddressBlock(
  text
){

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
    pad * 2;


  const lines =
    wrapText(
      ctx,
      text,
      contentWidth
    );


  const blockHeight =
    Math.max(

      pos.minHeight,

      pad * 2 +

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
   APLICAR CORREÇÃO
   ========================================================= */

function applyBlock(){

  lastAppliedText =
    addressText.value;

  drawLabel();
}


/* =========================================================
   LIMPAR
   ========================================================= */

function clearAll(){

  originalImage =
    null;


  originalBarcode =
    '';


  barcodeStatus =
    'idle';


  block =
    null;


  lastAppliedText =
    '';


  addressText.value =
    '';


  if(volumeCountInput){

    volumeCountInput.value =
      '1';
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
){

  const isPhone =
    isPhoneOnly(text);


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
    pad * 2;


  const lines =
    wrapText(
      exportCtx,
      text,
      contentWidth
    );


  const blockHeight =
    Math.max(

      exportBlock.minHeight,

      pad * 2 +

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
   EXPORTAÇÃO EM ALTA RESOLUÇÃO
   ========================================================= */

const EXPORT_SCALE = 4;


function renderExportCanvas(
  scale = EXPORT_SCALE,
  volumeIndex = 1,
  totalVolumes = 1
){

  /*
    Garante que posição e
    tamanho atuais estejam atualizados.
  */
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


  /*
    Imagem original
  */
  exportCtx.drawImage(

    originalImage,

    0,
    0,

    exportCanvas.width,

    exportCanvas.height

  );


  /*
    Texto corrigido
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


  if(
    baseText.trim() &&
    block
  ){

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
    CAMPO VOLUME

    Exemplo:

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
    CÓDIGO DE BARRAS

    volume 1:
    ...0001

    volume 2:
    ...0002
  */
  const volumeBarcode =
    barcodeForVolume(
      volumeIndex
    );


  if(volumeBarcode){

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

async function downloadPNG(){

  if(!originalImage){

    alert(
      'Cole a etiqueta original antes de baixar.'
    );

    return;
  }


  const totalVolumes =
    getVolumeCount();


  const barcodeReady =
    await prepareBarcodeForOutput(
      totalVolumes
    );


  if(!barcodeReady){
    return;
  }


  /*
    Apenas 1 volume
  */
  if(totalVolumes <= 1){

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
    Vários volumes
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
    )

    +

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


  /*
    Gera cada etiqueta
    individualmente.
  */
  for(
    let i = 1;
    i <= totalVolumes;
    i++
  ){

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

async function printCanvas(){

  if(!originalImage){

    alert(
      'Cole a etiqueta original antes de imprimir.'
    );

    return;
  }


  const totalVolumes =
    getVolumeCount();


  const barcodeReady =
    await prepareBarcodeForOutput(
      totalVolumes
    );


  if(!barcodeReady){
    return;
  }


  /*
    Confirmação para
    grandes quantidades.
  */
  if(totalVolumes > 20){

    const confirmed =
      window.confirm(

        `Serão impressas ${totalVolumes} etiquetas numeradas de 1/${totalVolumes} até ${totalVolumes}/${totalVolumes}. Deseja continuar?`

      );


    if(!confirmed){
      return;
    }
  }


  const printWidth =
    originalImage.width;


  const imgs = [];


  /*
    Aqui cada volume recebe:

    Volume correto
    +
    Barcode correto
  */
  for(
    let i = 1;
    i <= totalVolumes;
    i++
  ){

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


  win.document.write(
    `<!doctype html>
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

window.onload = () =>
  setTimeout(
    () => window.print(),
    300
  );

<\/script>

</body>

</html>`
  );


  win.document.close();
}


/* =========================================================
   POSIÇÃO DO MOUSE NO CANVAS
   ========================================================= */

function canvasPoint(evt){

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
  (e) => {

    if(
      !originalImage ||
      !block ||
      !addressText.value.trim()
    ){
      return;
    }


    const p =
      canvasPoint(e);


    if(

      p.x >= block.x &&

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

    ){

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
  (e) => {

    if(!drag.active){
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

    drag.active =
      false;


    canvas.classList.remove(
      'dragging'
    );


    try{

      canvas.releasePointerCapture(
        e.pointerId
      );

    }catch(error){

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

    if(el){

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

if(volumeCountInput){

  volumeCountInput.addEventListener(
    'input',
    () => {

      /*
        Atualiza imediatamente:

        1/2
        2/2
        etc.
      */
      drawLabel();


      /*
        Se a etiqueta estiver carregada,
        mas o barcode ainda não tiver
        sido identificado, tenta novamente.
      */
      if(

        originalImage &&

        getVolumeCount() > 1 &&

        !originalBarcode &&

        barcodeStatus !==
          'loading'

      ){

        detectOriginalBarcode(
          originalImage
        )
        .then(() => {

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
