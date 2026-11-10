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

function sampleImage(size) {
  const offscreen = document.createElement('canvas');
  offscreen.width = offscreen.height = size;
  const cx = offscreen.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, size, size);
  const dimension = Math.min(sourceImage.width, sourceImage.height);
  const sx = (sourceImage.width - dimension) / 2;
  const sy = (sourceImage.height - dimension) / 2;
  cx.drawImage(sourceImage, sx, sy, dimension, dimension, 0, 0, size, size);
  return cx.getImageData(0, 0, size, size).data;
}

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
      const firstPass = [];
      const counts = new Map();
      for (let i = 0; i < pixels.length; i += 4) {
        const target = lab([pixels[i], pixels[i + 1], pixels[i + 2]]);
        labs.push(target);
        const match = nearest(target, colors);
        firstPass.push(match.code);
        counts.set(match.code, (counts.get(match.code) || 0) + 1);
      }
      const limit = Number($('colorLimit').value);
      const chosen = [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([code]) => colorByCode.get(code));
      // Reassign every cell using only the dominant colors to keep the chart practical.
      board = labs.map((target) => nearest(target, chosen).code);
      selectedCode = null;
      renderBoard();
      renderPalette();
      $('emptyPreview').hidden = true;
      canvas.hidden = false;
      $('resultTools').hidden = false;
      $('paletteArea').hidden = false;
      $('boardBadge').textContent = `${boardSize} × ${boardSize} · ${new Set(board).size} 色`;
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

function renderBoard() {
  const cell = boardSize === 52 ? 12 : 7;
  canvas.width = canvas.height = boardSize * cell;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < boardSize; y++) for (let x = 0; x < boardSize; x++) {
    const color = colorByCode.get(board[y * boardSize + x]);
    const px = x * cell, py = y * cell;
    ctx.fillStyle = '#eae0d9';
    ctx.fillRect(px, py, cell, cell);
    ctx.fillStyle = color.hex;
    ctx.beginPath();
    ctx.arc(px + cell / 2, py + cell / 2, cell * .43, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#715c5060';
  ctx.lineWidth = 1;
  for (let i = 0; i <= boardSize; i += 13) {
    const at = i * cell + .5;
    ctx.beginPath(); ctx.moveTo(at, 0); ctx.lineTo(at, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, at); ctx.lineTo(canvas.width, at); ctx.stroke();
  }
  if (boardSize === 104) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#8b514e';
    ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
  }
}

function renderPalette() {
  const counts = new Map();
  for (const code of board) counts.set(code, (counts.get(code) || 0) + 1);
  const list = $('paletteList');
  list.replaceChildren();
  for (const [code, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    const color = colorByCode.get(code);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `swatch${selectedCode === code ? ' active' : ''}`;
    button.setAttribute('aria-label', `选择 ${code}，${count} 颗`);
    const square = document.createElement('span');
    square.className = 'swatch-color';
    square.style.background = color.hex;
    const details = document.createElement('span');
    details.innerHTML = `<b>${code}</b><small>${count} 颗</small>`;
    button.append(square, details);
    button.addEventListener('click', () => { selectedCode = code; renderPalette(); });
    list.append(button);
  }
  $('beadTotal').textContent = `共 ${board.length.toLocaleString()} 颗`;
}
canvas.addEventListener('click', (event) => {
  if (!selectedCode || !board.length) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.min(boardSize - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * boardSize)));
  const y = Math.min(boardSize - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * boardSize)));
  board[y * boardSize + x] = selectedCode;
  renderBoard(); renderPalette();
});

function makeExportCanvas() {
  const cell = 30, margin = 54, header = 125, legendRows = Math.ceil(new Set(board).size / 6), legendHeight = 70 + legendRows * 42;
  const out = document.createElement('canvas');
  out.width = margin * 2 + boardSize * cell;
  out.height = header + margin + boardSize * cell + legendHeight;
  const cx = out.getContext('2d');
  cx.fillStyle = '#fffdfa'; cx.fillRect(0, 0, out.width, out.height);
  cx.fillStyle = '#493c38'; cx.font = 'bold 40px sans-serif'; cx.fillText('拼豆小屋 · BEAD ATELIER', margin, 62);
  cx.font = '22px sans-serif'; cx.fillStyle = '#9a8179'; cx.fillText(`${boardSize} × ${boardSize} · MARD · ${new Set(board).size} colors · ${board.length} beads`, margin, 100);
  for (let y = 0; y < boardSize; y++) for (let x = 0; x < boardSize; x++) {
    const color = colorByCode.get(board[y * boardSize + x]);
    const px = margin + x * cell, py = header + y * cell;
    cx.fillStyle = color.hex; cx.fillRect(px, py, cell, cell);
    cx.strokeStyle = '#5d504d40'; cx.lineWidth = .6; cx.strokeRect(px, py, cell, cell);
    const brightness = color.rgb[0] * .299 + color.rgb[1] * .587 + color.rgb[2] * .114;
    cx.fillStyle = brightness < 145 ? '#fff' : '#302726';
    cx.font = 'bold 9px Arial,sans-serif'; cx.textAlign = 'center';
    cx.fillText(color.code, px + cell / 2, py + 18);
  }
  cx.lineWidth = 2; cx.strokeStyle = '#ad7364';
  for (let i = 0; i <= boardSize; i += 13) {
    cx.beginPath(); cx.moveTo(margin + i * cell, header); cx.lineTo(margin + i * cell, header + boardSize * cell); cx.stroke();
    cx.beginPath(); cx.moveTo(margin, header + i * cell); cx.lineTo(margin + boardSize * cell, header + i * cell); cx.stroke();
  }
  if (boardSize === 104) {
    cx.lineWidth = 5; cx.strokeStyle = '#7b4a42';
    cx.beginPath(); cx.moveTo(margin + 52 * cell, header); cx.lineTo(margin + 52 * cell, header + boardSize * cell); cx.stroke();
    cx.beginPath(); cx.moveTo(margin, header + 52 * cell); cx.lineTo(margin + boardSize * cell, header + 52 * cell); cx.stroke();
  }
  cx.textAlign = 'center'; cx.fillStyle = '#6d5b54'; cx.font = 'bold 15px sans-serif';
  for (let i = 0; i < boardSize; i += 13) {
    cx.fillText(String(i + 1), margin + (i + 6.5) * cell, header - 10);
    cx.fillText(String(i + 1), margin - 23, header + (i + 7) * cell);
  }
  const counts = new Map(); for (const code of board) counts.set(code, (counts.get(code) || 0) + 1);
  const base = header + boardSize * cell + 48;
  cx.textAlign = 'left'; cx.fillStyle = '#493c38'; cx.font = 'bold 22px sans-serif'; cx.fillText('配色 / COLOR KEY', margin, base);
  [...counts].sort((a, b) => b[1] - a[1]).forEach(([code, count], i) => {
    const x = margin + (i % 6) * Math.floor((out.width - 2 * margin) / 6), y = base + 25 + Math.floor(i / 6) * 42;
    cx.fillStyle = colorByCode.get(code).hex; cx.fillRect(x, y, 28, 28);
    cx.strokeStyle = '#6d5b5440'; cx.strokeRect(x, y, 28, 28);
    cx.fillStyle = '#493c38'; cx.font = '17px sans-serif'; cx.fillText(`${code}  × ${count}`, x + 36, y + 20);
  });
  return out;
}
$('downloadBtn').addEventListener('click', () => {
  if (!board.length) return;
  const out = makeExportCanvas();
  out.toBlob((blob) => { if (!blob) return; const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${sourceName}-${boardSize}x${boardSize}-MARD.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }, 'image/png');
});
$('printBtn').addEventListener('click', () => { if (board.length) print(); });
