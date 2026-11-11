import { palette } from './palette.js';

const $ = (id) => document.getElementById(id);
const outside = $('outside');
const atelier = $('atelier');
const imageInput = $('imageInput');
const uploadZone = $('uploadZone');
const canvas = $('boardCanvas');
const ctx = canvas.getContext('2d');
const boardWrap = $('boardWrap');
let sourceImage = null;
let sourceName = 'my-bead-pattern';
let board = [];
let boardSize = 52;
let selectedCode = null;
const maskSize = 104;
let selectionPixels = null;
let regionLabels = new Uint8Array(maskSize * maskSize);
let manualMask = new Int8Array(maskSize * maskSize).fill(-1);
let selectionPreset = 'all';
let brushMode = null;
let drawing = false;
let boardZoom = 'detail';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lab = ([r, g, b]) => {
  const c = [r, g, b].map((v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  const x = (c[0] * .4124 + c[1] * .3576 + c[2] * .1805) / .95047;
  const y = (c[0] * .2126 + c[1] * .7152 + c[2] * .0722);
  const z = (c[0] * .0193 + c[1] * .1192 + c[2] * .9505) / 1.08883;
  const f = (v) => v > .008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
const colors = palette.map((p) => ({ ...p, rgb: rgb(p.hex), lab: lab(rgb(p.hex)) }));
if (colors.length !== 272 || colors.some((c) => !/^#[0-9A-F]{6}$/.test(c.hex))) {
  throw new Error('MARD palette data is incomplete');
}
const colorByCode = new Map(colors.map((c) => [c.code, c]));
const distance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
function nearest(target, options) {
  let best = options[0], bestDistance = Infinity;
  for (const option of options) {
    const score = distance(target, option.lab);
    if (score < bestDistance) { best = option; bestDistance = score; }
  }
  return best;
}

function enterRoom() {
  outside.hidden = true;
  atelier.hidden = false;
  document.body.style.background = '#f9f4ef';
  scrollTo({ top: 0, behavior: 'instant' });
}
function leaveRoom() {
  atelier.hidden = true;
  outside.hidden = false;
  document.body.style.background = '#eee8f4';
  scrollTo({ top: 0, behavior: 'instant' });
}
$('enterHouse').addEventListener('click', enterRoom);
$('goOutside').addEventListener('click', leaveRoom);

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (sourceImage?.src?.startsWith('blob:')) URL.revokeObjectURL(sourceImage.src);
    sourceImage = image;
    sourceName = file.name.replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fff-]/g, '-').slice(0, 40) || 'my-bead-pattern';
    $('sourceThumb').src = url;
    $('sourceThumb').hidden = false;
    uploadZone.querySelector('strong').textContent = file.name;
    $('generateBtn').disabled = false;
    analyzeRegions();
    $('selectionPanel').hidden = false;
    $('openSelectionBtn').hidden = false;
    selectionPreset = 'main';
    manualMask.fill(-1);
    updatePresetButtons();
    renderSelectionPreview();
    $('selectionSummary').textContent = '只要主体';
    if (!$('selectionDialog').open) $('selectionDialog').showModal();
  };
  image.onerror = () => URL.revokeObjectURL(url);
  image.src = url;
}
imageInput.addEventListener('change', (event) => loadFile(event.target.files[0]));
uploadZone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); imageInput.click(); } });
uploadZone.addEventListener('dragover', (event) => { event.preventDefault(); uploadZone.classList.add('dragging'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragging'));
uploadZone.addEventListener('drop', (event) => { event.preventDefault(); uploadZone.classList.remove('dragging'); loadFile(event.dataTransfer.files[0]); });
$('colorLimit').addEventListener('input', (event) => { $('colorLimitValue').textContent = event.target.value; });
document.querySelectorAll('input[name="sourceStyle"]').forEach((input) => input.addEventListener('change', () => {
  if (!sourceImage) return;
  analyzeRegions(); manualMask.fill(-1); renderSelectionPreview();
}));

function sampleImage(size) {
  const offscreen = document.createElement('canvas');
  offscreen.width = offscreen.height = size;
  const cx = offscreen.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = document.querySelector('input[name="sourceStyle"]:checked').value === 'photo';
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, size, size);
  const dimension = Math.min(sourceImage.width, sourceImage.height);
  const sx = (sourceImage.width - dimension) / 2;
  const sy = (sourceImage.height - dimension) / 2;
  cx.drawImage(sourceImage, sx, sy, dimension, dimension, 0, 0, size, size);
  return cx.getImageData(0, 0, size, size).data;
}

function analyzeRegions() {
  selectionPixels = sampleImage(maskSize);
  const labs = [];
  for (let i = 0; i < selectionPixels.length; i += 4) labs.push(lab([selectionPixels[i], selectionPixels[i + 1], selectionPixels[i + 2]]));
  const corners = [0, maskSize - 1, maskSize * (maskSize - 1), maskSize * maskSize - 1].map((i) => labs[i]);
  const background = new Uint8Array(labs.length);
  const queue = new Int32Array(labs.length);
  let head = 0, tail = 0;
  const closeToBorder = (index) => corners.some((corner) => distance(labs[index], corner) < 34 ** 2);
  const add = (index) => { if (!background[index] && closeToBorder(index)) { background[index] = 1; queue[tail++] = index; } };
  for (let x = 0; x < maskSize; x++) { add(x); add((maskSize - 1) * maskSize + x); }
  for (let y = 0; y < maskSize; y++) { add(y * maskSize); add(y * maskSize + maskSize - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % maskSize, y = Math.floor(i / maskSize);
    if (x > 0) add(i - 1);
    if (x < maskSize - 1) add(i + 1);
    if (y > 0) add(i - maskSize);
    if (y < maskSize - 1) add(i + maskSize);
  }
  regionLabels.fill(0);
  const visited = new Uint8Array(labs.length);
  const components = [];
  for (let i = 0; i < labs.length; i++) {
    if (background[i] || visited[i]) continue;
    let start = 0, end = 0;
    const indices = [];
    queue[end++] = i; visited[i] = 1;
    while (start < end) {
      const index = queue[start++]; indices.push(index);
      const x = index % maskSize, y = Math.floor(index / maskSize);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= maskSize || ny >= maskSize) continue;
        const next = ny * maskSize + nx;
        if (!background[next] && !visited[next]) { visited[next] = 1; queue[end++] = next; }
      }
    }
    components.push(indices);
  }
  components.sort((a, b) => b.length - a.length);
  components.forEach((component, index) => component.forEach((pixel) => { regionLabels[pixel] = index === 0 ? 1 : 2; }));
  // A light face or shirt can share the background color. Fill the enclosed
  // horizontal spans of the largest silhouette so those interior beads stay.
  if (components[0]) {
    const left = new Int16Array(maskSize).fill(maskSize);
    const right = new Int16Array(maskSize).fill(-1);
    for (const pixel of components[0]) {
      const x = pixel % maskSize, y = Math.floor(pixel / maskSize);
      left[y] = Math.min(left[y], x);
      right[y] = Math.max(right[y], x);
    }
    // Bridge short breaks in the outline (often caused by pale bow/face pixels
    // merging with the background). Keep long empty rows outside the subject.
    for (let y = 1; y < maskSize - 1; y++) {
      if (right[y] >= 0 || right[y - 1] < 0 || right[y + 1] < 0) continue;
      left[y] = Math.round((left[y - 1] + left[y + 1]) / 2);
      right[y] = Math.round((right[y - 1] + right[y + 1]) / 2);
    }
    for (let y = 0; y < maskSize; y++) {
      if (right[y] < 0) continue;
      let from = left[y], to = right[y];
      for (const neighbor of [y - 1, y + 1]) {
        if (neighbor < 0 || neighbor >= maskSize || right[neighbor] < 0) continue;
        if (Math.abs(left[neighbor] - from) <= 3) from = Math.min(from, left[neighbor] - 1);
        if (Math.abs(right[neighbor] - to) <= 3) to = Math.max(to, right[neighbor] + 1);
      }
      for (let x = Math.max(0, from); x <= Math.min(maskSize - 1, to); x++) regionLabels[y * maskSize + x] = 1;
    }
  }
}

function includedAt(x, y) {
  const index = y * maskSize + x;
  if (manualMask[index] !== -1) return manualMask[index] === 1;
  const region = regionLabels[index];
  return selectionPreset === 'all' ||
    (selectionPreset === 'main' && region === 1) ||
    (selectionPreset === 'main-decor' && region !== 0) ||
    (selectionPreset === 'decor' && region === 2) ||
    (selectionPreset === 'background' && region === 0);
}
function updatePresetButtons() {
  document.querySelectorAll('[data-preset]').forEach((button) => button.classList.toggle('active', button.dataset.preset === selectionPreset));
}
function renderSelectionPreview() {
  if (!selectionPixels) return;
  const preview = $('selectionCanvas');
  const cx = preview.getContext('2d');
  cx.putImageData(new ImageData(new Uint8ClampedArray(selectionPixels), maskSize, maskSize), 0, 0);
  cx.fillStyle = '#dad4d0bc';
  for (let y = 0; y < maskSize; y++) for (let x = 0; x < maskSize; x++) {
    if (!includedAt(x, y)) cx.fillRect(x, y, 1, 1);
  }
}
document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
  selectionPreset = button.dataset.preset;
  manualMask.fill(-1);
  updatePresetButtons(); renderSelectionPreview();
  $('selectionSummary').textContent = button.textContent;
}));
$('openSelectionBtn').addEventListener('click', () => $('selectionDialog').showModal());
$('closeSelectionBtn').addEventListener('click', () => $('selectionDialog').close());
$('confirmSelectionBtn').addEventListener('click', () => $('selectionDialog').close());
function setBrush(mode) {
  brushMode = mode;
  $('keepBrush').classList.toggle('active', mode === 1);
  $('eraseBrush').classList.toggle('active', mode === 0);
}
$('keepBrush').addEventListener('click', () => setBrush(1));
$('eraseBrush').addEventListener('click', () => setBrush(0));
$('resetBrush').addEventListener('click', () => { manualMask.fill(-1); setBrush(null); renderSelectionPreview(); });
function brushAt(event) {
  if (brushMode === null) return;
  const rect = $('selectionCanvas').getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / rect.width * maskSize);
  const y = Math.floor((event.clientY - rect.top) / rect.height * maskSize);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (dx * dx + dy * dy > 10) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < maskSize && ny < maskSize) manualMask[ny * maskSize + nx] = brushMode;
  }
  renderSelectionPreview();
}
$('selectionCanvas').addEventListener('pointerdown', (event) => { if (brushMode === null) return; drawing = true; event.currentTarget.setPointerCapture(event.pointerId); brushAt(event); });
$('selectionCanvas').addEventListener('pointermove', (event) => { if (drawing) brushAt(event); });
$('selectionCanvas').addEventListener('pointerup', () => { drawing = false; });
$('selectionCanvas').addEventListener('pointercancel', () => { drawing = false; });

function makePattern() {
  if (!sourceImage) return;
  const button = $('generateBtn');
  button.disabled = true;
  button.querySelector('span').textContent = '正在挑选豆子…';
  requestAnimationFrame(() => setTimeout(() => {
    try {
      boardSize = Number(document.querySelector('input[name="boardSize"]:checked').value);
      const pixels = sampleImage(boardSize);
      const labs = [];
      const forcedWhite = [];
      const counts = new Map();
      for (let i = 0; i < pixels.length; i += 4) {
        const cellIndex = i / 4;
        const x = cellIndex % boardSize, y = Math.floor(cellIndex / boardSize);
        const maskX = Math.min(maskSize - 1, Math.floor((x + .5) / boardSize * maskSize));
        const maskY = Math.min(maskSize - 1, Math.floor((y + .5) / boardSize * maskSize));
        if (!includedAt(maskX, maskY)) { labs.push(null); forcedWhite.push(false); continue; }
        const isPixelArt = document.querySelector('input[name="sourceStyle"]:checked').value !== 'photo';
        const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
        const white = isPixelArt && Math.min(...rgb) >= 225 && Math.max(...rgb) - Math.min(...rgb) <= 22;
        forcedWhite.push(white);
        const target = lab([pixels[i], pixels[i + 1], pixels[i + 2]]);
        labs.push(target);
        const match = white ? colorByCode.get('H2') : nearest(target, colors);
        counts.set(match.code, (counts.get(match.code) || 0) + 1);
      }
      if (!counts.size) { alert('选区里没有可用的豆子，请改选整张图或用「保留」画笔添加区域。'); return; }
      const limit = Number($('colorLimit').value);
      const chosen = [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([code]) => colorByCode.get(code));
      // Reassign every cell using only the dominant colors to keep the chart practical.
      board = labs.map((target, index) => target ? (forcedWhite[index] ? 'H2' : nearest(target, chosen).code) : null);
      selectedCode = null;
      renderBoard();
      renderPalette();
      $('emptyPreview').hidden = true;
      canvas.hidden = false;
      $('resultTools').hidden = false;
      $('paletteArea').hidden = false;
      $('boardBadge').textContent = `${boardSize} × ${boardSize} · ${new Set(board.filter(Boolean)).size} 色`;
      requestAnimationFrame(() => {
        setBoardZoom('detail');
        boardWrap.scrollLeft = Math.max(0, (canvas.clientWidth - boardWrap.clientWidth) / 2);
        boardWrap.scrollTop = Math.max(0, (canvas.clientHeight - boardWrap.clientHeight) / 2);
      });
      if (matchMedia('(max-width:850px)').matches) boardWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      console.error(error);
      alert('这张图片暂时无法转换，请尝试 JPG 或 PNG 图片。');
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = '重新生成图纸';
    }
  }, 50));
}
$('generateBtn').addEventListener('click', makePattern);

const chartCell = 30;
const chartMargin = 40;
function drawChart(cx, originY = chartMargin) {
  const start = chartMargin, end = start + boardSize * chartCell;
  cx.fillStyle = '#fff';
  cx.fillRect(0, originY - chartMargin, end + chartMargin, boardSize * chartCell + chartMargin * 2);
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  for (let y = 0; y < boardSize; y++) for (let x = 0; x < boardSize; x++) {
    const code = board[y * boardSize + x];
    const px = start + x * chartCell, py = originY + y * chartCell;
    if (code) {
      const color = colorByCode.get(code);
      cx.fillStyle = color.hex; cx.fillRect(px, py, chartCell, chartCell);
      const brightness = color.rgb[0] * .299 + color.rgb[1] * .587 + color.rgb[2] * .114;
      cx.fillStyle = brightness < 145 ? '#fff' : '#231e1b';
      cx.font = 'bold 11px Arial,sans-serif';
      cx.fillText(code, px + chartCell / 2, py + chartCell / 2 + 1);
    }
  }
  cx.strokeStyle = '#bab6b3'; cx.lineWidth = .7;
  for (let i = 0; i <= boardSize; i++) {
    const atX = start + i * chartCell + .5, atY = originY + i * chartCell + .5;
    cx.beginPath(); cx.moveTo(atX, originY); cx.lineTo(atX, originY + boardSize * chartCell); cx.stroke();
    cx.beginPath(); cx.moveTo(start, atY); cx.lineTo(end, atY); cx.stroke();
  }
  cx.strokeStyle = '#35302d';
  for (let i = 0; i <= boardSize; i += 5) {
    cx.lineWidth = i % 10 === 0 || i === 52 ? 2.3 : 1.3;
    const atX = start + i * chartCell + .5, atY = originY + i * chartCell + .5;
    cx.beginPath(); cx.moveTo(atX, originY); cx.lineTo(atX, originY + boardSize * chartCell); cx.stroke();
    cx.beginPath(); cx.moveTo(start, atY); cx.lineTo(end, atY); cx.stroke();
  }
  cx.fillStyle = '#504946'; cx.font = '12px Arial,sans-serif';
  for (let i = 0; i < boardSize; i++) {
    const x = start + (i + .5) * chartCell, y = originY + (i + .5) * chartCell;
    cx.fillText(String(i + 1), x, originY - chartMargin / 2);
    cx.fillText(String(i + 1), x, originY + boardSize * chartCell + chartMargin / 2);
    cx.fillText(String(i + 1), chartMargin / 2, y);
    cx.fillText(String(i + 1), end + chartMargin / 2, y);
  }
}
function setBoardZoom(mode) {
  boardZoom = mode;
  const natural = canvas.width;
  canvas.style.width = mode === 'detail' ? `${natural}px` : `${Math.min(700, boardWrap.clientWidth - 28)}px`;
  $('fitBtn').classList.toggle('active', mode === 'fit');
  $('detailBtn').classList.toggle('active', mode === 'detail');
  boardWrap.scrollTo({ top: 0, left: 0 });
}
function renderBoard() {
  canvas.width = canvas.height = boardSize * chartCell + chartMargin * 2;
  drawChart(ctx);
  setBoardZoom(boardZoom);
}
$('fitBtn').addEventListener('click', () => setBoardZoom('fit'));
$('detailBtn').addEventListener('click', () => setBoardZoom('detail'));

function renderPalette() {
  const counts = new Map();
  for (const code of board) if (code) counts.set(code, (counts.get(code) || 0) + 1);
  const list = $('paletteList');
  list.replaceChildren();
  for (const [index, [code, count]] of [...counts].sort((a, b) => b[1] - a[1]).entries()) {
    const color = colorByCode.get(code);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `swatch${selectedCode === code ? ' active' : ''}`;
    button.setAttribute('aria-label', `第 ${index + 1} 种颜色，${code}，${count} 颗`);
    const number = document.createElement('span');
    number.className = 'swatch-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const square = document.createElement('span');
    square.className = 'swatch-color';
    square.style.background = color.hex;
    const details = document.createElement('span');
    details.innerHTML = `<b>${code}</b><small>${count} 颗</small>`;
    button.append(number, square, details);
    button.addEventListener('click', () => { selectedCode = code; renderPalette(); });
    list.append(button);
  }
  $('beadTotal').textContent = `共 ${[...counts.values()].reduce((sum, count) => sum + count, 0).toLocaleString()} 颗 · ${counts.size} 色`;
}
canvas.addEventListener('click', (event) => {
  if (!selectedCode || !board.length) return;
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / canvas.width;
  const x = Math.floor(((event.clientX - rect.left) / scale - chartMargin) / chartCell);
  const y = Math.floor(((event.clientY - rect.top) / scale - chartMargin) / chartCell);
  if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) return;
  board[y * boardSize + x] = selectedCode;
  renderBoard(); renderPalette();
});

function makeExportCanvas() {
  const usedCodes = [...new Set(board.filter(Boolean))];
  const header = 150, legendRows = Math.ceil(usedCodes.length / 6), legendHeight = 95 + legendRows * 44;
  const out = document.createElement('canvas');
  out.width = chartMargin * 2 + boardSize * chartCell;
  out.height = header + boardSize * chartCell + chartMargin + legendHeight;
  const cx = out.getContext('2d');
  cx.fillStyle = '#fffdfa'; cx.fillRect(0, 0, out.width, out.height);
  cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
  cx.fillStyle = '#493c38'; cx.font = 'bold 38px sans-serif'; cx.fillText('拼豆小屋 · BEAD ATELIER', chartMargin, 59);
  const activeCount = board.filter(Boolean).length;
  cx.font = '20px sans-serif'; cx.fillStyle = '#9a8179'; cx.fillText(`${boardSize} × ${boardSize} · MARD · ${usedCodes.length} 色 · ${activeCount} 颗`, chartMargin, 98);
  drawChart(cx, header);
  const counts = new Map(); for (const code of board) if (code) counts.set(code, (counts.get(code) || 0) + 1);
  const base = header + boardSize * chartCell + 74;
  cx.textAlign = 'left'; cx.textBaseline = 'alphabetic'; cx.fillStyle = '#493c38'; cx.font = 'bold 22px sans-serif'; cx.fillText('配色与用量 / COLOR KEY', chartMargin, base);
  [...counts].sort((a, b) => b[1] - a[1]).forEach(([code, count], i) => {
    const x = chartMargin + (i % 6) * Math.floor((out.width - 2 * chartMargin) / 6), y = base + 25 + Math.floor(i / 6) * 44;
    cx.fillStyle = colorByCode.get(code).hex; cx.fillRect(x, y, 28, 28);
    cx.strokeStyle = '#6d5b5440'; cx.strokeRect(x, y, 28, 28);
    cx.fillStyle = '#493c38'; cx.font = '16px sans-serif'; cx.fillText(`${String(i + 1).padStart(2, '0')}  ${code}  × ${count}`, x + 36, y + 20);
  });
  return out;
}
$('downloadBtn').addEventListener('click', () => {
  if (!board.length) return;
  const out = makeExportCanvas();
  out.toBlob((blob) => { if (!blob) return; const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${sourceName}-${boardSize}x${boardSize}-MARD.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }, 'image/png');
});
$('printBtn').addEventListener('click', () => { if (board.length) print(); });
