import './style.css';
import { createTempleScene } from './scene.js';
import { TempleAudio } from './audio.js';
import { readState, writeState, offerIncense, addWish, mergeStateChanges, dateKey, formatDuration, MAX_WISH_LENGTH, STORAGE_KEY } from './state.js';

const icons = {
  mountain: '<path d="m2 18 6-11 5 8 4-12 5 15Z"/><path d="m6 11 2 3 2-3m5-3 2 3 2-3"/>',
  incense: '<path d="M7 19h10M5 22h14M8 19l-1-9m5 9V8m4 11 1-9M11 5c-3-3 3-3 0-6M6 7c-2-2 2-3 0-5m12 5c-2-2 2-3 0-5"/>',
  bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm4 3h6M12 2v2"/><path d="m3 8-1 3m19-3 1 3"/>',
  wish: '<path d="M5 3h14v18l-7-3-7 3ZM9 8h6m-6 4h4"/>',
  lotus: '<path d="M12 20C5 20 2 16 2 10c4 0 7 2 10 6m0 4c7 0 10-4 10-10-4 0-7 2-10 6"/><path d="M12 20C6 15 6 9 12 3c6 6 6 12 0 17Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  dusk: '<path d="M2 17h20M4 21h16M6 17a6 6 0 0 1 12 0M12 3v3M3 8l2 2m14 0 2-2"/>',
  moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/><path d="m18 2 .5 2.5L21 5l-2.5.5L18 8l-.5-2.5L15 5l2.5-.5Z"/>',
  rain: '<path d="M6 14a4 4 0 1 1 1-8 6 6 0 0 1 11-1 4.5 4.5 0 0 1 0 9M8 17l-1 3m6-3-1 3m6-3-1 3"/>',
  sound: '<path d="m11 4-5 4H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-5 4H3v8h3l5 4Zm5 5 6 6m0-6-6 6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  book: '<path d="M12 5v16M3 3c4-1 7 0 9 2 2-2 5-3 9-2v16c-4-1-7 0-9 2-2-2-5-3-9-2Z"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  reset: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 8 15 8 15S25 10 20 5Z"/>',
  expand: '<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/>',
  leaf: '<path d="M20 3C7 1 1 11 6 17s15 0 14-14ZM4 21 15 9"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
};
const icon = (name, className = '') => `<svg class="icon ${className}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.leaf}</svg>`;
const $ = (selector) => document.querySelector(selector);
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let state = readState(storage);
const audio = new TempleAudio();
audio.setVolume(state.volume);
audio.setRain(state.rain);
// Saved preference must not override browsers' gesture-only audio policy.
state.sound = false;
let savedBaseline = structuredClone(state);
let scene;
let saveWarningShown = false;
let toastTimer;
let dialogReturnFocus;
let lastIncense = -Infinity;
let lastBell = -Infinity;
let meditation = null;
let meditationInterval;
let selectedMinutes = 3;
let disposed = false;

$('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="/" aria-label="山寺首页"><span class="brand-mark">${icon('mountain')}</span><span class="brand-name">山寺<span>SANSA</span></span><span class="brand-divider"></span><span class="brand-note">一隅清静，片刻自在</span></a>
    <nav aria-label="主要导航"><button class="nav-link" data-action="journal">${icon('book')}<span>我的修行</span></button><button class="nav-link about-link" data-action="about">关于山寺<span class="tiny-dot"></span></button><button class="icon-button" data-action="settings" aria-label="偏好设置">${icon('settings')}</button></nav>
  </header>
  <main>
    <section class="temple-experience" aria-label="山寺互动体验">
      <div class="intro"><div class="eyebrow"><span></span>A LITTLE TEMPLE, A LITTLE PEACE</div><h1>万事，<br />慢慢来<span class="title-dot">。</span></h1><p>点一炷香，把纷扰留在山下。<br />在这里，什么也不做，也很好。</p><a href="#rituals" class="intro-link">此刻，让心歇一歇 ${icon('arrow')}</a></div>
      <div class="verse"><span>山中无别事</span><span>一念自清凉</span><i>— 山寺手记</i></div>
      <div class="scene-wrap" id="scene"><div class="scene-loading" id="scene-loading"><span class="loading-ring"></span>正在寻一处山寺…</div><div class="scene-fallback" id="scene-fallback" hidden>${icon('mountain')}<h2>山寺依然在这里</h2><p>三维场景暂时无法显示，请尝试开启浏览器硬件加速或刷新。<br />你仍然可以用下方按钮上香、敲钟和许愿。</p><button class="small-button" data-action="reload">重新入山</button></div></div>
      <aside class="daily-card"><div class="daily-heading"><span class="status-dot"></span>今日山寺<span id="local-time"></span></div><div class="daily-main"><span class="daily-symbol">${icon('incense')}</span><div><strong id="today-count">00</strong><span>炷香 · 一念善意</span></div></div><div class="daily-divider"></div><p id="daily-message">不必有所求，只愿心安。</p><span class="daily-bottom">YOUR OWN MOMENT OF PEACE</span></aside>
      <div class="scene-meta"><span class="coordinate">37° N &nbsp; 128° E <i>想象中的山寺</i></span><span class="view-hint"><span class="drag-icon">↔</span> 拖动旋转 · 滚轮缩放 <button data-action="reset" aria-label="重置场景视角">${icon('reset')}</button></span></div>
    </section>
    <section class="rituals-section" id="rituals" aria-label="山寺仪式">
      <div class="section-label"><span>给自己，一点留白</span><span>SMALL RITUALS, QUIET MOMENTS</span></div>
      <div class="ritual-grid">
        <button class="ritual-card incense-card" data-action="incense"><span class="ritual-icon">${icon('incense')}</span><span class="ritual-copy"><strong>点一炷香 <span class="shortcut">I</span></strong><span>一缕轻烟，一念心安</span></span><span class="ritual-arrow">${icon('arrow')}</span></button>
        <button class="ritual-card" data-action="bell"><span class="ritual-icon">${icon('bell')}</span><span class="ritual-copy"><strong>听一声钟 <span class="shortcut">B</span></strong><span>让余音，带走心事</span></span><span class="ritual-arrow">${icon('arrow')}</span></button>
        <button class="ritual-card" data-action="wish"><span class="ritual-icon">${icon('wish')}</span><span class="ritual-copy"><strong>留一个愿 <span class="shortcut">W</span></strong><span>把小小的愿望，交给风</span></span><span class="ritual-arrow">${icon('arrow')}</span></button>
        <button class="ritual-card" data-action="meditate"><span class="ritual-icon">${icon('lotus')}</span><span class="ritual-copy"><strong>静坐片刻 <span class="shortcut">M</span></strong><span>不赶路，只和自己待一会</span></span><span class="ritual-arrow">${icon('arrow')}</span></button>
      </div>
    </section>
    <section class="ambient-bar" aria-label="环境控制"><div class="ambient-options"><span class="ambient-label">此间光景</span><div class="segmented" aria-label="选择时段"><button data-mode="day" aria-label="白昼">${icon('sun')}<span>白昼</span></button><button data-mode="dusk" aria-label="黄昏">${icon('dusk')}<span>黄昏</span></button><button data-mode="night" aria-label="月夜">${icon('moon')}<span>月夜</span></button></div><span class="control-divider"></span><button class="ambient-toggle" id="rain-toggle" data-action="rain" aria-pressed="false">${icon('rain')}<span>山间细雨</span></button></div><div class="sound-options"><span class="sound-caption" id="sound-caption">听见山寺的声音</span><button class="sound-button" id="sound-toggle" data-action="sound" aria-pressed="false">${icon('mute')}<span>开启声音</span></button><button class="icon-button focus-button" data-action="meditate" aria-label="进入静坐模式">${icon('expand')}</button></div></section>
  </main>
  <footer><span>不问结果，只享此刻。</span><span class="footer-center">${icon('leaf')} MADE FOR YOUR PEACE</span><span>原创山寺 · 慢生活实验</span></footer>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <dialog id="panel-dialog" class="panel-dialog" aria-labelledby="dialog-title"><div id="dialog-content"></div></dialog>
  <dialog id="meditation-dialog" class="meditation-dialog" aria-labelledby="meditation-title"><button class="meditation-close icon-button" data-action="end-meditation" aria-label="结束静坐">${icon('close')}</button><span class="eyebrow">A MOMENT JUST FOR YOU</span><h2 id="meditation-title">此刻，只需呼吸。</h2><p class="meditation-subtitle">没有需要完成的事，也没有需要抵达的地方。</p><div class="breathing-circle">${icon('lotus')}<span id="breath-label">准备好，慢下来</span></div><div class="meditation-timer" id="meditation-timer">03:00</div><div class="duration-options" aria-label="静坐时长"><button data-duration="3" class="active" aria-pressed="true">3 分钟</button><button data-duration="5" aria-pressed="false">5 分钟</button><button data-duration="10" aria-pressed="false">10 分钟</button></div><button class="primary-button meditation-start" data-action="toggle-meditation" id="meditation-start">开始静坐 ${icon('arrow')}</button><p class="meditation-note" id="meditation-note">跟随圆的舒展，缓缓吸气、呼气。按 Esc 可退出。</p></dialog>
`;

function toast(message) {
  clearTimeout(toastTimer);
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('visible');
  toastTimer = setTimeout(() => element.classList.remove('visible'), 3600);
}

function persist() {
  const enabledSound = state.sound;
  if (storage) state = mergeStateChanges(savedBaseline, state, readState(storage));
  state.sound = enabledSound;
  if (writeState(storage, state)) {
    savedBaseline = structuredClone(state);
  } else if (!saveWarningShown) {
    saveWarningShown = true;
    toast('浏览器无法保存记录，本次体验依然可以继续。');
  }
}

function updateUI() {
  document.documentElement.dataset.time = state.mode;
  document.documentElement.dataset.rain = String(state.rain);
  const today = state.daily[dateKey()] || 0;
  $('#today-count').textContent = String(today).padStart(2, '0');
  $('#daily-message').textContent = today ? '烟起，心静。愿你今日平安。' : '不必有所求，只愿心安。';
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === state.mode);
    button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
  });
  $('#rain-toggle').setAttribute('aria-pressed', String(state.rain));
  $('#sound-toggle').setAttribute('aria-pressed', String(state.sound));
  $('#sound-toggle').innerHTML = `${icon(state.sound ? 'sound' : 'mute')}<span>${state.sound ? '声音已开启' : '开启声音'}</span>`;
  $('#sound-caption').textContent = state.sound ? (state.rain ? '雨落檐下，万籁渐轻' : '风过山林，偶有鸟鸣') : '听见山寺的声音';
}
function updateTime() {
  $('#local-time').textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const today = state.daily[dateKey()] || 0;
  $('#today-count').textContent = String(today).padStart(2, '0');
}
updateUI();
updateTime();
const timeInterval = setInterval(updateTime, 15000);

function incense() {
  const now = performance.now();
  if (now - lastIncense < 1400) return;
  lastIncense = now;
  state = offerIncense(state);
  scene?.lightIncense();
  audio.incense();
  persist();
  updateUI();
  const messages = ['一炷清香，愿你心安。', '心有所念，山寺听见了。', '慢慢来，好事正在路上。', '愿这一刻的宁静，陪你走远一些。'];
  toast(messages[(state.incense - 1) % messages.length]);
  $('.incense-card').classList.add('offering');
  setTimeout(() => $('.incense-card')?.classList.remove('offering'), 1200);
}
function bell() {
  const now = performance.now();
  if (now - lastBell < 2000) return;
  lastBell = now;
  state.bells++;
  scene?.ringBell();
  audio.bell();
  persist();
  toast(state.sound ? '钟声悠远，心事渐轻。' : '钟已敲响 · 开启声音，听见余音。');
}

function showPanel(title, subtitle, content, className = '') {
  dialogReturnFocus = document.activeElement;
  $('#dialog-content').innerHTML = `<div class="panel-header"><span class="eyebrow">A LITTLE PEACE</span><button class="icon-button" data-action="close-panel" aria-label="关闭">${icon('close')}</button></div><h2 id="dialog-title">${title}</h2><p class="panel-subtitle">${subtitle}</p>${content}`;
  $('#panel-dialog').className = `panel-dialog ${className}`;
  $('#panel-dialog').showModal();
}
function showWish() {
  showPanel('把心愿，交给山风。', '不必宏大，也不必说给谁听。写下你此刻的小小愿望。', `<form id="wish-form"><label class="field-label" for="wish-text">我的心愿</label><textarea id="wish-text" name="wish" maxlength="${MAX_WISH_LENGTH}" rows="4" placeholder="愿家人健康，愿自己从容…" required></textarea><div class="field-bottom"><span>仅保存在你的浏览器，不会公开</span><span id="wish-length">0 / ${MAX_WISH_LENGTH}</span></div><button type="submit" class="primary-button">挂上心愿 ${icon('wish')}</button></form><div class="panel-footnote">山风知我意，吹梦到明天。</div>`);
  $('#wish-text').focus();
  $('#wish-text').addEventListener('input', (event) => { $('#wish-length').textContent = `${event.target.value.length} / ${MAX_WISH_LENGTH}`; });
  $('#wish-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = $('#wish-text').value.trim();
    if (!text) { $('#wish-text').setCustomValidity('请写下一点心愿，再交给山风。'); $('#wish-text').reportValidity(); return; }
    state = addWish(state, text);
    persist();
    scene?.addWish();
    audio.wish();
    $('#panel-dialog').close();
    toast('心愿已经挂好。愿所念，皆有回响。');
  });
  $('#wish-text').addEventListener('input', () => $('#wish-text').setCustomValidity(''));
}

function showJournal() {
  showPanel('每一念，都算数。', '不是为了积攒什么，只是记录那些认真善待自己的时刻。', `<div class="journal-stats"><div><strong>${state.incense}</strong><span>炷清香</span></div><div><strong>${state.bells}</strong><span>声钟鸣</span></div><div><strong>${Math.floor(state.meditationSeconds / 60)}</strong><span>分钟静坐</span></div></div><div class="wishes-heading"><h3>留在山寺的心愿</h3><span>${state.wishes.length} / 50</span></div><div id="wish-list" class="wish-list"></div><p class="storage-note">记录仅存于当前浏览器，清除浏览器数据会失去记录。</p>`, 'journal-dialog');
  const list = $('#wish-list');
  if (!state.wishes.length) {
    list.innerHTML = `<div class="empty-wishes">${icon('wish')}<p>心愿架上，还有属于你的空位。</p><button class="small-button" data-action="new-wish">写下第一个心愿 ${icon('arrow')}</button></div>`;
  }
  state.wishes.forEach((wish) => {
    const row = document.createElement('article');
    row.className = 'saved-wish';
    const text = document.createElement('p');
    text.textContent = wish.text;
    const date = document.createElement('time');
    date.textContent = new Date(wish.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    const remove = document.createElement('button');
    remove.className = 'icon-button delete-wish';
    remove.setAttribute('aria-label', '删除这条心愿');
    remove.innerHTML = icon('close');
    remove.addEventListener('click', () => {
      if (!window.confirm('确定取下这个心愿吗？此操作无法撤销。')) return;
      state.wishes = state.wishes.filter((item) => item.id !== wish.id);
      persist();
      row.remove();
      $('.wishes-heading > span').textContent = `${state.wishes.length} / 50`;
      if (!state.wishes.length) list.innerHTML = '<p class="empty-text">心愿已随风而去。你随时可以再写一个。</p>';
    });
    row.append(text, date, remove);
    list.append(row);
  });
}

function showSettings() {
  showPanel('让山寺，合你的心意。', '寻一个舒服的声音，留一点自在的空间。', `<div class="settings-row"><label for="volume">环境音量</label><span id="volume-value">${Math.round(state.volume * 100)}%</span></div><input type="range" id="volume" min="0" max="100" value="${Math.round(state.volume * 100)}" aria-label="环境音量" /><button class="settings-sound small-button" data-action="sound">${icon('sound')} 开启 / 关闭声音</button><div class="settings-help"><h3>山寺小指南</h3><p>拖动场景旋转视角，滚动鼠标缩放。<br />也可以直接点击场景里的香炉、铜钟和心愿架。</p><div class="keyboard-guide"><span><kbd>I</kbd> 上香</span><span><kbd>B</kbd> 敲钟</span><span><kbd>W</kbd> 许愿</span><span><kbd>M</kbd> 静坐</span></div></div><p class="storage-note">声音需手动开启。我们不会上传你的心愿或修行记录。</p>`);
  $('#volume').addEventListener('input', (event) => {
    state.volume = Number(event.target.value) / 100;
    audio.setVolume(state.volume);
    $('#volume-value').textContent = `${event.target.value}%`;
    persist();
  });
}
function showAbout() {
  showPanel('一处不必赶路的地方。', '山寺 SANSA · 原创赛博上香体验', `<div class="about-body">${icon('mountain')}<p>灵感来自山寺的安静与电子上香的轻仪式。<br />这里没有排行榜，没有任务，也没有需要购买的功德。</p><p>点香，是给心一个开始。<br />敲钟，是让纷扰暂时散去。<br />静坐，是把一点时间还给自己。</p><p class="about-disclaimer">这是受 Sansatemple 氛围启发的独立创作，非原版、非官方产品，不使用原作美术与音频资源。所有场景与声音均在本地生成。</p></div>`);
}

function openMeditation() {
  if ($('#panel-dialog').open) $('#panel-dialog').close();
  dialogReturnFocus = document.activeElement;
  meditation = null;
  $('#meditation-dialog').classList.remove('running', 'paused', 'finished');
  $('#meditation-timer').textContent = formatDuration(selectedMinutes * 60);
  $('#meditation-start').innerHTML = `开始静坐 ${icon('arrow')}`;
  $('#breath-label').textContent = '准备好，慢下来';
  $('#meditation-title').textContent = '此刻，只需呼吸。';
  $('#meditation-note').textContent = '跟随圆的舒展，缓缓吸气、呼气。按 Esc 可退出。';
  $('.duration-options').hidden = false;
  $('#meditation-dialog').showModal();
}
function activeSeconds() {
  if (!meditation) return 0;
  const extra = meditation.running ? (performance.now() - meditation.startedAt) / 1000 : 0;
  return Math.min(meditation.duration, meditation.elapsed + extra);
}
function updateMeditation() {
  if (!meditation) return;
  const elapsed = activeSeconds();
  $('#meditation-timer').textContent = formatDuration(Math.ceil(meditation.duration - elapsed));
  $('#breath-label').textContent = meditation.running ? (elapsed % 8 < 4 ? '缓缓吸气' : '轻轻呼气') : '停一停，也很好';
  if (elapsed >= meditation.duration) finishMeditation(true);
}
function toggleMeditation() {
  if (!meditation) {
    meditation = { duration: selectedMinutes * 60, elapsed: 0, startedAt: performance.now(), running: true, saved: false };
    $('.duration-options').hidden = true;
    $('#meditation-dialog').classList.remove('finished');
    $('#meditation-title').textContent = '此刻，只需呼吸。';
    $('#meditation-note').textContent = '跟随圆的舒展，缓缓吸气、呼气。按 Esc 可退出。';
    meditationInterval = setInterval(updateMeditation, 250);
  } else if (meditation.running) {
    meditation.elapsed = activeSeconds();
    meditation.running = false;
  } else {
    meditation.startedAt = performance.now();
    meditation.running = true;
  }
  $('#meditation-dialog').classList.toggle('running', meditation.running);
  $('#meditation-dialog').classList.toggle('paused', !meditation.running);
  $('#meditation-start').innerHTML = meditation.running ? `暂停片刻 ${icon('pause')}` : `继续静坐 ${icon('play')}`;
  updateMeditation();
}
function finishMeditation(completed = false) {
  clearInterval(meditationInterval);
  if (meditation && !meditation.saved) {
    state.meditationSeconds += Math.floor(activeSeconds());
    meditation.saved = true;
    persist();
  }
  if (completed) {
    meditation = null;
    $('#meditation-dialog').classList.remove('running', 'paused');
    $('#meditation-dialog').classList.add('finished');
    $('#meditation-title').textContent = '这一刻，已是礼物。';
    $('#breath-label').textContent = '愿你自在';
    $('#meditation-timer').textContent = '00:00';
    $('#meditation-note').textContent = '静坐时间已记入修行记录。带着这份宁静，继续你的日常。';
    $('#meditation-start').innerHTML = `再坐一会 ${icon('lotus')}`;
    audio.bell();
  }
}

let soundBusy = false;
async function toggleSound() {
  if (soundBusy) return;
  soundBusy = true;
  try {
    state.sound = await audio.enable(!state.sound);
    persist();
    updateUI();
    if (state.sound) toast('声音已开启，听一听山间的风。');
  } catch {
    state.sound = false;
    updateUI();
    toast('声音暂时无法开启，请检查浏览器的音频权限后再试。');
  } finally { soundBusy = false; }
}
const actions = {
  incense, bell, wish: showWish, journal: showJournal, settings: showSettings, about: showAbout,
  meditate: openMeditation,
  'toggle-meditation': toggleMeditation,
  'end-meditation': () => $('#meditation-dialog').close(),
  'close-panel': () => $('#panel-dialog').close(),
  'new-wish': () => { $('#panel-dialog').close(); showWish(); },
  rain: () => {
    state.rain = !state.rain;
    scene?.setAtmosphere(state.mode, state.rain);
    audio.setRain(state.rain);
    persist(); updateUI();
    toast(state.rain ? '一场细雨，落在檐下。' : '雨停了，山色又清新了一些。');
  },
  sound: toggleSound,
  reset: () => { scene?.resetView(); toast('回到初见山寺的角度。'); },
  reload: () => window.location.reload(),
};
document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action) actions[action]?.();
  const mode = event.target.closest('[data-mode]')?.dataset.mode;
  if (mode) {
    state.mode = mode;
    scene?.setAtmosphere(mode, state.rain);
    persist(); updateUI();
  }
  const duration = event.target.closest('[data-duration]')?.dataset.duration;
  if (duration && !meditation) {
    selectedMinutes = Number(duration);
    document.querySelectorAll('[data-duration]').forEach((button) => {
      const active = Number(button.dataset.duration) === selectedMinutes;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('#meditation-timer').textContent = formatDuration(selectedMinutes * 60);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]') || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const action = { i: incense, b: bell, w: showWish, m: openMeditation }[event.key.toLowerCase()];
  if (action) { event.preventDefault(); action(); }
});
$('#panel-dialog').addEventListener('click', (event) => {
  if (event.target !== $('#panel-dialog')) return;
  const rect = event.target.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
});
$('#panel-dialog').addEventListener('close', () => dialogReturnFocus?.focus());
$('#meditation-dialog').addEventListener('close', () => {
  finishMeditation();
  meditation = null;
  dialogReturnFocus?.focus();
});

function syncStoredState(event) {
  if (event?.type === 'storage' && event.key !== STORAGE_KEY && event.key !== null) return;
  if (!storage) return;
  const enabledSound = state.sound;
  state = mergeStateChanges(savedBaseline, state, readState(storage));
  state.sound = enabledSound;
  savedBaseline = structuredClone(state);
  audio.setVolume(state.volume);
  audio.setRain(state.rain);
  scene?.setAtmosphere(state.mode, state.rain);
  updateUI();
}
window.addEventListener('storage', syncStoredState);
window.addEventListener('focus', syncStoredState);

function handleSceneError(error) {
  console.warn('3D scene unavailable:', error.message);
  $('#scene-loading').hidden = true;
  $('#scene-fallback').hidden = false;
  $('#scene').classList.add('unavailable');
}
try {
  scene = createTempleScene($('#scene'), {
    onInteract: (action) => actions[action]?.(),
    onReady: () => { $('#scene-loading').hidden = true; },
    onError: handleSceneError,
  });
  scene?.setAtmosphere(state.mode, state.rain);
} catch (error) { handleSceneError(error); }

function dispose() {
  if (disposed) return;
  disposed = true;
  finishMeditation();
  clearInterval(timeInterval);
  clearTimeout(toastTimer);
  window.removeEventListener('storage', syncStoredState);
  window.removeEventListener('focus', syncStoredState);
  scene?.dispose();
  audio.dispose();
}
window.addEventListener('pagehide', (event) => {
  // Do not tear down pages held in the browser's back/forward cache.
  if (!event.persisted) dispose();
});
if (import.meta.hot) import.meta.hot.dispose(dispose);
