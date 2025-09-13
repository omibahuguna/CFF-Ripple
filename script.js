// CFF Image Ripple Effect Tool
const elements = {
  input: document.getElementById('imgInput'),
  canvas: document.getElementById('rippleCanvas'),
  ctx: document.getElementById('rippleCanvas').getContext('2d'),
  uploadBtn: document.getElementById('uploadButton'),
  uploadNewBtn: document.getElementById('uploadNewBtn'),
  saveBtn: document.getElementById('saveBtn'),
  container: document.getElementById('upload-container'),
  aspectBtns: document.querySelectorAll('.radio-button[data-aspect]'),
  sideBtns: document.querySelectorAll('.radio-button[data-side]'),
  rippleBtns: document.querySelectorAll('.radio-button[data-ripple]'),
  previewCanvas: null,
  previewCtx: null
};

let state = { 
  img: null, 
  loaded: false, 
  filename: 'untitled',
  cropOffset: { x: 0, y: 0 },
  isDragging: false,
  dragStart: { x: 0, y: 0 }
};

const config = {
  maxWidth: 1200,
  rippleConfigs: {
    single: { scales: [0.8], alphas: [0.6] },
    double: { scales: [0.8, 0.6], alphas: [0.6, 0.25] }
  },
  extrusionRatio: 0.08,
  aspectRatios: { '1:1': 1, '16:9': 16/9, '4:3': 4/3 }
};

// Utility functions
const getActiveValue = (dataType) => 
  document.querySelector(`.radio-button[data-${dataType}].active`)?.dataset[dataType] || 
  ({ aspect: 'original', side: 'both', ripple: 'double' }[dataType]);

const resetState = (overrides = {}) => {
  state = { 
    img: null, 
    loaded: false, 
    filename: 'untitled',
    cropOffset: { x: 0, y: 0 },
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    ...overrides 
  };
};

const getCropData = (img, aspectRatio) => {
  if (aspectRatio === 'original') return { x: 0, y: 0, width: img.width, height: img.height };
  
  const targetRatio = config.aspectRatios[aspectRatio];
  const currentRatio = img.width / img.height;
  
  const baseCrop = currentRatio > targetRatio 
    ? { x: (img.width - img.height * targetRatio) / 2, y: 0, width: img.height * targetRatio, height: img.height }
    : { x: 0, y: (img.height - img.width / targetRatio) / 2, width: img.width, height: img.width / targetRatio };
  
  // Apply crop offset with bounds checking
  const maxOffsetX = (img.width - baseCrop.width) / 2;
  const maxOffsetY = (img.height - baseCrop.height) / 2;
  const clampedOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, state.cropOffset.x));
  const clampedOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, state.cropOffset.y));
  
  return {
    x: baseCrop.x + clampedOffsetX,
    y: baseCrop.y + clampedOffsetY,
    width: baseCrop.width,
    height: baseCrop.height
  };
};

// Interactive preview functions
const createInteractivePreview = () => {
  if (!elements.previewCanvas) {
    elements.previewCanvas = document.createElement('canvas');
    elements.previewCtx = elements.previewCanvas.getContext('2d');
    
    Object.assign(elements.previewCanvas.style, {
      cursor: 'grab',
      maxWidth: '100%',
      maxHeight: '400px',
      objectFit: 'contain'
    });
    
    // Add event listeners
    ['mousedown', 'mousemove', 'mouseup', 'mouseleave'].forEach(event => {
      elements.previewCanvas.addEventListener(event, handleMouseEvent);
    });
    
    ['touchstart', 'touchmove', 'touchend'].forEach(event => {
      elements.previewCanvas.addEventListener(event, handleTouchEvent);
    });
  }
  return elements.previewCanvas;
};

const handleMouseEvent = (e) => {
  if (getActiveValue('aspect') === 'original') return;
  
  switch (e.type) {
    case 'mousedown':
      state.isDragging = true;
      state.dragStart = { x: e.clientX, y: e.clientY };
      elements.previewCanvas.style.cursor = 'grabbing';
      break;
      
    case 'mousemove':
      if (!state.isDragging) return;
      updateCropOffset(e.clientX, e.clientY);
      break;
      
    case 'mouseup':
    case 'mouseleave':
      state.isDragging = false;
      elements.previewCanvas.style.cursor = 'grab';
      break;
  }
};

const handleTouchEvent = (e) => {
  e.preventDefault();
  if (!e.touches[0]) return;
  
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent(e.type.replace('touch', 'mouse').replace('start', 'down').replace('end', 'up'), {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  elements.previewCanvas.dispatchEvent(mouseEvent);
};

const updateCropOffset = (clientX, clientY) => {
  const deltaX = clientX - state.dragStart.x;
  const deltaY = clientY - state.dragStart.y;
  
  const canvasRect = elements.previewCanvas.getBoundingClientRect();
  const scaleX = elements.previewCanvas.width / canvasRect.width;
  const scaleY = elements.previewCanvas.height / canvasRect.height;
  
  state.cropOffset.x -= deltaX * scaleX;
  state.cropOffset.y -= deltaY * scaleY;
  state.dragStart = { x: clientX, y: clientY };
  
  drawRipple();
};

// Main drawing function
const drawRipple = () => {
  // Update UI state
  elements.uploadBtn.style.display = state.loaded ? 'none' : 'block';
  elements.uploadNewBtn.style.display = state.loaded ? 'block' : 'none';
  elements.container.querySelector('.processed-image, canvas')?.remove();
  
  if (!state.loaded) return;

  const crop = getCropData(state.img, getActiveValue('aspect'));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const w = Math.min(crop.width, config.maxWidth);
  const h = w * (crop.height / crop.width);
  const side = getActiveValue('side');
  const rippleType = getActiveValue('ripple');
  const peek = w * config.extrusionRatio;
  
  const { scales, alphas } = config.rippleConfigs[rippleType];
  const rippleSpace = side !== 'original' ? scales.length * peek : 0;
  const leftSpace = (side === 'left' || side === 'both') ? rippleSpace : 0;
  const rightSpace = (side === 'right' || side === 'both') ? rippleSpace : 0;
  
  canvas.width = w + leftSpace + rightSpace;
  canvas.height = h;
  
  const originX = leftSpace;
  const draw = (x, y, width, height, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.drawImage(state.img, crop.x, crop.y, crop.width, crop.height, x, y, width, height);
  };
  
  // Draw ripples
  scales.forEach((scale, i) => {
    const [rw, rh] = [w * scale, h * scale];
    const ry = (h - rh) / 2;
    const offset = (i + 1) * peek;
    
    if (side === 'left' || side === 'both') {
      draw(originX - offset, ry, rw, rh, alphas[i]);
    }
    if (side === 'right' || side === 'both') {
      draw(originX + w - rw + offset, ry, rw, rh, alphas[i]);
    }
  });
  
  // Draw main image
  draw(originX, 0, w, h);
  
  // Update preview and save canvas
  updatePreview(canvas);
  updateSaveCanvas(canvas);
};

const updatePreview = (canvas) => {
  if (getActiveValue('aspect') !== 'original') {
    // Interactive canvas for crop dragging
    const previewCanvas = createInteractivePreview();
    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;
    elements.previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    elements.previewCtx.drawImage(canvas, 0, 0);
    elements.container.appendChild(previewCanvas);
  } else {
    // Static image for original aspect
    const img = document.createElement('img');
    img.className = 'processed-image';
    img.src = canvas.toDataURL();
    elements.container.appendChild(img);
  }
};

const updateSaveCanvas = (canvas) => {
  elements.canvas.width = canvas.width;
  elements.canvas.height = canvas.height;
  elements.ctx.drawImage(canvas, 0, 0);
};

// Event handlers
const handleRadioClick = (buttons, callback) => {
  buttons.forEach(btn => btn.addEventListener('click', () => {
    buttons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (btn.dataset.aspect) state.cropOffset = { x: 0, y: 0 };
    if (state.loaded) callback();
  }));
};

const handleFileInput = (e) => {
  const file = e.target.files[0];
  if (!file) {
    resetState();
    drawRipple();
    return;
  }
  
  const filename = file.name.split('.').slice(0, -1).join('.') || 'untitled';
  const reader = new FileReader();
  
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      resetState({ img, loaded: true, filename });
      drawRipple();
    };
    img.src = ev.target.result;
  };
  
  reader.readAsDataURL(file);
};

const handleSave = () => {
  if (!state.loaded) return alert('Please upload an image first.');
  
  const aspectRatio = getActiveValue('aspect');
  const aspectSuffix = aspectRatio === 'original' ? '' : `_${aspectRatio.replace(':', '_')}`;
  
  const link = Object.assign(document.createElement('a'), {
    download: `${state.filename}${aspectSuffix}_rippled.png`,
    href: elements.canvas.toDataURL('image/png')
  });
  link.click();
};

// Initialize event listeners
elements.input.addEventListener('change', handleFileInput);
elements.saveBtn.addEventListener('click', handleSave);

[elements.uploadBtn, elements.uploadNewBtn].forEach(btn => 
  btn.addEventListener('click', () => elements.input.click())
);

[elements.aspectBtns, elements.sideBtns, elements.rippleBtns].forEach(btns => 
  handleRadioClick(btns, drawRipple)
);

window.addEventListener('resize', () => state.loaded && drawRipple());

// Initialize
drawRipple();
