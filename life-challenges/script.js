import { challenges } from './challenges.js';
import { challengesEn } from './challenges-en.js';

const $ = (id) => document.getElementById(id);
const machine = $('machineTilt');
const capsules = $('capsules');
const overlay = $('resultOverlay');
const stage = overlay.querySelector('.result-stage');
const drawButton = $('drawBtn');
const storageKey = 'little-adventures-drawn-v1';
const bookKey = 'little-adventures-book-v1';
const languageKey = 'little-adventures-language-v1';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const copy = {
  zh: {
    pageTitle: '人生的 100 个小挑战 · 雪日扭蛋机', description: '从一百件人生小挑战中，抽取今天的勇气。',
    title: '人生的<span>100</span>个<br>小挑战', switch: 'Switch to English', machine: '立体扭蛋机',
    draw: '转动旋钮，抽一个挑战', mixing: '扭蛋正在旋转', dropping: '扭蛋落下来了',
    openBook: '打开记录本', close: '关闭', closeBook: '关闭记录本', result: '你的今日挑战来了 ✦',
    save: '放进记录本', viewBook: '查看记录本', again: '再抽一个',
    bookKicker: '小小冒险记录', bookTitle: '小挑战记录本',
    bookSummary: (done, total) => `已完成 ${done} 件 · 还有 ${total - done} 件等着你`,
    bookStart: '抽到喜欢的挑战，就收进这里。', bookEmpty: '记录本还是空的，先去抽一个挑战吧 ✦',
    bookFooter: '每打一个勾，都是人生里闪亮的一页 ✦', done: '完成',
    paperFooter: '愿你在平凡的一天里，遇见一点惊喜。 ✳',
  },
  en: {
    pageTitle: '100 Little Challenges · Snow Day Gacha', description: 'Draw one of 100 little adventures and see where it takes you.',
    title: '<span>100</span> Little<br>Challenges', switch: '切换为中文', machine: '3D capsule machine',
    draw: 'Turn the knob to draw a challenge', mixing: 'Capsules are spinning', dropping: 'A capsule is falling',
    openBook: 'Open your notebook', close: 'Close', closeBook: 'Close notebook', result: 'Your little challenge is here ✦',
    save: 'Save to notebook', viewBook: 'View notebook', again: 'Draw another challenge',
    bookKicker: 'MY LITTLE ADVENTURES', bookTitle: 'My Challenge Notebook',
    bookSummary: (done, total) => `${done} done · ${total - done} still to explore`,
    bookStart: 'Save a challenge you want to try.', bookEmpty: 'Your notebook is empty. Draw a challenge first ✦',
    bookFooter: 'Every checkmark is a little story worth keeping ✦', done: 'Completed',
    paperFooter: 'May an ordinary day bring a little surprise. ✳',
  },
};
let language = localStorage.getItem(languageKey) === 'en' ? 'en' : 'zh';
const t = key => copy[language][key];
const challengeText = id => language === 'en' ? challengesEn[id] : challenges[id];
let drawn = [];
let entries = [];
let currentChoice = null;
let busy = false;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) drawn = [...new Set(saved.filter(n => Number.isInteger(n) && n >= 0 && n < challenges.length))];
} catch { /* Start fresh if storage was corrupted. */ }
try {
  const saved = JSON.parse(localStorage.getItem(bookKey) || '[]');
  if (Array.isArray(saved)) entries = saved.filter(item => item && Number.isInteger(item.id) && item.id >= 0 && item.id < challenges.length && typeof item.done === 'boolean');
  entries = [...new Map(entries.map(item => [item.id, item])).values()];
} catch { /* Start with an empty notebook. */ }
function persistBook() { localStorage.setItem(bookKey, JSON.stringify(entries)); }
function updateBookBadge() { $('bookBadge').hidden = entries.length === 0; }
updateBookBadge();

const colors = ['#eaaab3','#a7c1dd','#f7c997','#a9d5c5','#d2b8d9','#f4d78e'];
const spots = [[5,4],[36,2],[68,5],[20,26],[53,25],[79,27],[1,51],[33,50],[65,50],[17,73],[50,73],[77,73]];
spots.forEach(([x,y],i) => {
  const ball = document.createElement('i');
  ball.className = 'mini-capsule';
  ball.style.cssText = `left:${x}%;top:${y}%;--c:${colors[i % colors.length]};--z:${i % 3 * 8}px;--r:${i * 47}deg;--delay:${(i % 5) * -.12}s`;
  capsules.append(ball);
});

for (let i = 0; i < 58; i++) {
  const flake = document.createElement('i');
  flake.className = 'flake';
  const size = 2 + Math.random() * 7;
  flake.style.cssText = `left:${Math.random()*100}%;--s:${size}px;--o:${.3+Math.random()*.7};--blur:${size>6?1:0}px;--d:${8+Math.random()*11}s;--delay:${-Math.random()*19}s;--drift:${-80+Math.random()*160}px`;
  $('snowfall').append(flake);
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function applyLanguage(next) {
  language = next === 'en' ? 'en' : 'zh';
  localStorage.setItem(languageKey, language);
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.body.dataset.language = language;
  document.title = t('pageTitle');
  document.querySelector('meta[name="description"]').content = t('description');
  $('mainTitle').innerHTML = t('title');
  const toggle = $('languageToggle');
  toggle.textContent = language === 'zh' ? 'EN' : '中';
  toggle.setAttribute('aria-label', t('switch'));
  toggle.title = t('switch');
  machine.setAttribute('aria-label', t('machine'));
  drawButton.setAttribute('aria-label', t('draw'));
  drawButton.title = t('draw');
  $('openBookBtn').setAttribute('aria-label', t('openBook'));
  $('openBookBtn').title = t('openBook');
  $('closeResult').setAttribute('aria-label', t('close'));
  $('closeBookBtn').setAttribute('aria-label', t('closeBook'));
  $('resultTitle').textContent = t('result');
  $('bookKicker').textContent = t('bookKicker');
  $('bookTitle').textContent = t('bookTitle');
  $('bookFooter').textContent = t('bookFooter');
  document.querySelector('.paper-bottom').textContent = t('paperFooter');
  $('againBtn').setAttribute('aria-label', t('again'));
  $('againBtn').title = t('again');
  if (currentChoice !== null) {
    $('paperText').textContent = challengeText(currentChoice);
    const label = entries.some(item => item.id === currentChoice) ? t('viewBook') : t('save');
    $('saveBtn').setAttribute('aria-label', label);
    $('saveBtn').title = label;
  } else {
    $('saveBtn').setAttribute('aria-label', t('save'));
    $('saveBtn').title = t('save');
  }
  renderBook();
}
async function draw() {
  if (busy) return;
  if (drawn.length === challenges.length) drawn = [];
  const remaining = challenges.map((_, i) => i).filter(i => !drawn.includes(i));
  const choice = remaining[Math.floor(Math.random() * remaining.length)];
  busy = true;
  drawButton.disabled = true;
  drawButton.setAttribute('aria-label', t('mixing'));
  machine.classList.add('mixing');
  await pause(reducedMotion ? 100 : 1600);
  machine.classList.remove('mixing');
  drawButton.setAttribute('aria-label', t('dropping'));
  const ball = document.createElement('div');
  ball.className = 'dispensed';
  document.querySelector('.machine-area').append(ball);
  await pause(reducedMotion ? 100 : 1100);
  drawn.push(choice);
  localStorage.setItem(storageKey, JSON.stringify(drawn));
  currentChoice = choice;
  $('paperNumber').textContent = `NO. ${String(choice + 1).padStart(3,'0')} / 100`;
  $('paperText').textContent = challengeText(choice);
  const alreadySaved = entries.some(item => item.id === choice);
  $('saveBtn').setAttribute('aria-label', alreadySaved ? t('viewBook') : t('save'));
  $('saveBtn').title = alreadySaved ? t('viewBook') : t('save');
  stage.classList.remove('open');
  overlay.hidden = false;
  ball.remove();
  await pause(reducedMotion ? 30 : 650);
  stage.classList.add('open');
  await pause(reducedMotion ? 30 : 450);
  $('closeResult').focus();
  drawButton.disabled = false;
  drawButton.setAttribute('aria-label', t('draw'));
  busy = false;
}
function close() { overlay.hidden = true; stage.classList.remove('open'); drawButton.focus(); }
function renderBook() {
  const list = $('bookList');
  list.replaceChildren();
  const completed = entries.filter(item => item.done).length;
  $('bookSummary').textContent = entries.length ? t('bookSummary')(completed, entries.length) : t('bookStart');
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'book-empty';
    empty.textContent = t('bookEmpty');
    list.append(empty);
    return;
  }
  entries.forEach((item, index) => {
    const row = document.createElement('label');
    row.className = 'book-item';
    if (item.done) row.classList.add('done');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = item.done;
    check.setAttribute('aria-label', `${t('done')}: ${challengeText(item.id)}`);
    check.addEventListener('change', () => { item.done = check.checked; persistBook(); renderBook(); });
    const mark = document.createElement('span');
    mark.className = 'book-check';
    const label = document.createElement('span');
    label.className = 'book-item-text';
    label.textContent = challengeText(item.id);
    const number = document.createElement('small');
    number.textContent = `NO. ${String(item.id + 1).padStart(3, '0')}`;
    row.style.setProperty('--row', index);
    row.append(check, mark, label, number);
    list.append(row);
  });
}
function openBook() { renderBook(); $('bookOverlay').hidden = false; $('closeBookBtn').focus(); }
function closeBook() { $('bookOverlay').hidden = true; $('openBookBtn').focus(); }
drawButton.addEventListener('click', draw);
$('languageToggle').addEventListener('click', () => applyLanguage(language === 'zh' ? 'en' : 'zh'));
$('againBtn').addEventListener('click', () => { close(); draw(); });
$('saveBtn').addEventListener('click', () => {
  if (currentChoice === null) return;
  if (!entries.some(item => item.id === currentChoice)) { entries.unshift({ id: currentChoice, done: false }); persistBook(); updateBookBadge(); }
  close();
  openBook();
});
$('openBookBtn').addEventListener('click', openBook);
$('closeBookBtn').addEventListener('click', closeBook);
document.querySelector('.book-backdrop').addEventListener('click', closeBook);
$('closeResult').addEventListener('click', close);
overlay.querySelector('.result-backdrop').addEventListener('click', close);
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!$('bookOverlay').hidden) closeBook(); else if (!overlay.hidden) close(); });

applyLanguage(language);
if (challenges.length !== 100 || challengesEn.length !== challenges.length) console.error('Challenge translation count mismatch');
