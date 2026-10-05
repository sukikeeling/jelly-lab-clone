/* ============================================================
 * app.js — 果冻实验室：路由、首页、游戏页、交互与稳健 60FPS / 60Hz XPBD
 * ============================================================ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createStage, JellyBody, buildStudioEnvironment } from './three-jelly.js';
import { cutJelly, hitOnKeptSide } from './cut.js';
import { GAMES, GAME_ORDER } from './games.js';
import { icon } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------- 全局状态 ---------------- */
const S = {
  jellies: [],          // 当前页的 JellyBody[]
  mode: 'pinch',
  colorId: null,
  softness: 0.55,
  bounciness: 0.60,
  jiggle: 0.75,
  gloss: true,
  dust: true,
  slow: false,
  wireframe: false,
  paused: false,
  cuts: 0,
  throws: 0,
  stage: null,
  raf: 0,
  cam: { theta: 0, phi: 1.12, r: 5.6, tx: 0, ty: 0.62, tz: 0 },
  camHome: null,
  favs: new Set(JSON.parse(localStorage.getItem('jelly-favs') || '[]')),
  playCount: parseInt(localStorage.getItem('jelly-plays') || '0'),
  thumbs: {},
  gameId: null,
  disposables: [],
};
window.JellyApp = S;

const isMobile = matchMedia('(pointer: coarse)').matches;
const PERF = {
  pr: Math.min(window.devicePixelRatio || 1, isMobile ? 1.6 : 2),
  dust: isMobile ? 40 : 80,
};

/* ---------------- 工具 ---------------- */
function toast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms);
}
function saveFavs() { localStorage.setItem('jelly-favs', JSON.stringify([...S.favs])); }
function unlockAudio() { window.JellySound && JellySound.unlock(); }
document.addEventListener('pointerdown', unlockAudio, { once: false });

function showPage(id) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $('#' + id).classList.add('active');
  $('#tabbar').style.display = id === 'page-game' ? 'none' : 'flex';
  $$('#tabbar button').forEach(b => b.classList.remove('on'));
  window.scrollTo(0, 0);
}
function setTab(name) {
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.nav === name));
}

/* ---------------- 路由 ---------------- */
function route() {
  const h = location.hash || '#/home';
  disposeGame();
  if (h.startsWith('#/game/')) {
    const id = h.split('/')[2];
    if (GAMES[id]) { enterGame(id); return; }
  }
  if (h === '#/favs') { renderFavs(); showPage('page-favs'); setTab('favs'); return; }
  if (h === '#/me') { renderMe(); showPage('page-me'); setTab('me'); return; }
  renderHome(); showPage('page-home'); setTab('home');
}
window.addEventListener('hashchange', route);

$('#tabbar').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  JellySound.pop();
  const nav = b.dataset.nav;
  location.hash = nav === 'lab' ? '#/home' : '#/' + nav;
});

/* ---------------- 缩略图（3D 实时渲染） ---------------- */
let thumbRenderer = null, thumbScene = null, thumbCam = null;
async function thumbSetup() {
  if (thumbRenderer) return;
  const c = document.createElement('canvas');
  c.width = 320; c.height = 230;
  thumbRenderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
  thumbRenderer.setPixelRatio(1);
  thumbRenderer.setClearColor(0x000000, 0);
  thumbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  thumbRenderer.toneMappingExposure = 1.16;

  thumbScene = new THREE.Scene();
  thumbScene.background = null;

  thumbCam = new THREE.PerspectiveCamera(32, 320 / 230, 0.1, 50);
  thumbCam.position.set(0, 1.8, 6.4);
  thumbCam.lookAt(0, 0.6, 0);

  thumbScene.add(new THREE.HemisphereLight(0xfff6e8, 0xd8c4a8, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 3.0);
  key.position.set(3, 5, 4);
  thumbScene.add(key);

  const rim = new THREE.DirectionalLight(0xffe8dc, 1.5);
  rim.position.set(-3, 2, -3);
  thumbScene.add(rim);

  try {
    thumbScene.environment = buildStudioEnvironment(thumbRenderer);
  } catch (e) {}
}

async function makeThumb(id) {
  if (S.thumbs[id]) return S.thumbs[id];
  try {
    await thumbSetup();
    const g = GAMES[id];
    const built = g.build(g.defaultColor);
    const holder = new THREE.Group();
    holder.add(built.mesh);

    if (built.secondary) {
      built.secondary.forEach(s => holder.add(s.mesh));
    }
    if (built.organs) {
      holder.add(built.organs.group);
    }
    if (built.tentacles) {
      built.tentacles.forEach(t => holder.add(t.mesh));
    }
    if (built.followers) {
      built.followers.forEach(f => holder.add(f.mesh));
    }

    const box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3());
    holder.position.sub(c);
    holder.position.y += 0.2;

    thumbScene.add(holder);
    thumbRenderer.render(thumbScene, thumbCam);
    const url = thumbRenderer.domElement.toDataURL('image/png');
    thumbScene.remove(holder);

    built.mesh.geometry.dispose();
    if (built.secondary) built.secondary.forEach(s => s.mesh.geometry.dispose());
    S.thumbs[id] = url;
    return url;
  } catch (e) {
    return '';
  }
}

/* ---------------- 首页 ---------------- */
async function renderHome() {
  const el = $('#page-home');
  el.innerHTML = `
    <div class="topbar">
      <button class="back-btn" id="home-back">${icon('back', 18)}</button>
      <div class="title" style="font-size:14px;color:var(--ink2)">给自己，一点柔软的时间</div>
      <div style="display:flex;gap:10px">
        <button class="icon-btn" id="home-user">${icon('user', 20)}</button>
        <button class="icon-btn" id="home-share">${icon('share', 20)}</button>
      </div>
    </div>
    <div class="home-head">
      <h1>果冻实验室</h1>
      <div class="script">Jelly Lab · 稳健 3D XPBD 版</div>
    </div>
    <div class="home-sub">
      <p>捏一捏，切一切。<br>稳健 60Hz 晶格体积守恒，把时间放慢一点。</p>
      <button class="sound-pill" id="home-sound">🎵 声音设置 ＞</button>
    </div>
    <div class="hero-card" id="hero-card">
      <div class="hero-art"><img id="hero-img" style="width:68%;height:68%;object-fit:contain" alt="西瓜果冻">
        <div class="hero-num">01<small>经典体验</small></div>
        <div class="hero-script">Juicy<br>Relax<br>Happy</div>
        <button class="fav-btn" data-fav="01">${icon('heart', 20)}</button>
      </div>
      <div class="hero-body">
        <div><h2>一块夏天</h2><p>捏住一块夏天，想怎么切都可以。带果皮果籽真软体。</p></div>
        <button class="cta-btn" data-go="01">开始解压 →</button>
      </div>
    </div>
    <div class="section-title">更多软乎乎</div>
    <div class="grid2" id="home-grid"></div>
    <div style="height:20px"></div>`;

  $('#home-back').onclick = () => toast('已经在实验室门口啦 🍉');
  $('#home-user').onclick = () => location.hash = '#/me';
  $('#home-share').onclick = shareApp;
  $('#home-sound').onclick = openSound;
  el.onclick = e => {
    const fav = e.target.closest('[data-fav]');
    if (fav) { toggleFav(fav.dataset.fav, fav); return; }
    const go = e.target.closest('[data-go]');
    if (go) { JellySound.pop(); location.hash = '#/game/' + go.dataset.go; }
  };
  syncFavHearts(el);

  makeThumb('01').then(u => { const i = $('#hero-img'); if (i && u) i.src = u; });
  const grid = $('#home-grid');
  for (const id of GAME_ORDER.slice(1)) {
    const g = GAMES[id];
    const d = document.createElement('div');
    d.className = 'mini-card';
    d.innerHTML = `
      <div class="mini-art"><img style="width:80%;height:80%;object-fit:contain" alt="${g.name}">
        <div class="mini-num">${g.num}</div>
        <button class="fav-btn" data-fav="${id}">${icon('heart', 17)}</button>
      </div>
      <div class="mini-body" data-go="${id}"><h3>${g.name}</h3><p>${g.tag}</p></div>`;
    d.querySelector('[data-go]').onclick = () => { JellySound.pop(); location.hash = '#/game/' + id; };
    grid.appendChild(d);
    makeThumb(id).then(u => { const img = d.querySelector('img'); if (img && u) img.src = u; });
  }
  syncFavHearts(grid);
}

function toggleFav(id, btn) {
  if (S.favs.has(id)) { S.favs.delete(id); toast('已取消收藏'); }
  else { S.favs.add(id); toast('已收藏 ♡'); JellySound.pop(); }
  saveFavs();
  syncFavHearts(document);
}
function syncFavHearts(root) {
  $$('[data-fav]', root).forEach(b => b.classList.toggle('on', S.favs.has(b.dataset.fav)));
}

function shareApp() {
  const url = location.href;
  if (navigator.share) navigator.share({ title: '果冻实验室', url }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('链接已复制，快分享给朋友一起解压～'));
  else toast('链接：' + url);
}

/* ---------------- 收藏页 / 我的页 ---------------- */
function renderFavs() {
  const el = $('#page-favs');
  const ids = [...S.favs];
  el.innerHTML = `<div class="simple-head"><h2>我的收藏</h2><p>软乎乎们都在这里</p></div>
    ${ids.length ? '<div class="grid2">' + ids.map(id => {
      const g = GAMES[id];
      return `<div class="mini-card" data-go="${id}">
        <div class="mini-art"><img src="${S.thumbs[id] || ''}" style="width:80%;height:80%;object-fit:contain">
          <div class="mini-num">${g.num}</div></div>
        <div class="mini-body"><h3>${g.name}</h3><p>${g.tag}</p></div></div>`;
    }).join('') + '</div>' : '<div class="empty-tip">还没有收藏<br>去首页点 ♡ 把喜欢的果冻收进来吧</div>'}`;
  el.onclick = e => {
    const go = e.target.closest('[data-go]');
    if (go) { JellySound.pop(); location.hash = '#/game/' + go.dataset.go; }
  };
}

function renderMe() {
  const el = $('#page-me');
  el.innerHTML = `<div class="simple-head"><h2>我的</h2><p>果冻实验员</p></div>
    <div class="profile-card">
      <div class="avatar">🍮</div>
      <h3>软乎乎实验员</h3>
      <p style="color:var(--ink2);font-size:13px;margin-top:6px">把时间放慢一点 · 稳健 60FPS / 60Hz XPBD</p>
      <div class="stat-row">
        <div><b>${S.playCount}</b><span>解压次数</span></div>
        <div><b>${S.favs.size}</b><span>收藏</span></div>
        <div><b>8</b><span>实验室</span></div>
      </div>
    </div>
    <div class="profile-card" style="text-align:left">
      <div class="switch-row" style="border:none;padding:4px 0"><span>♫ 声音设置</span><button class="cta-btn" id="me-sound">去设置 →</button></div>
      <div class="switch-row" style="border:none;padding:12px 0 0"><span>📤 分享实验室</span><button class="cta-btn" id="me-share">分享 →</button></div>
    </div>`;
  $('#me-sound').onclick = openSound;
  $('#me-share').onclick = shareApp;
}

/* ---------------- 弹窗 ---------------- */
const HELP_COPY = {
  '01': `<p>🍉 <b>捏一捏</b>：按住西瓜果冻拖动，它会顺着你的手指饱满变形；松手，384 四面体体积守恒自然回弹。双指扭转体验丰富。</p><p>🔪 <b>切一切</b>：划过果冻松手落刀——咔嚓分成两块，带独立晶格软体物理！</p><p>🥄 <b>晃一下</b>：整个果冻波浪式抖动，果冻丝飞溅拉出。</p><p>🎨 换个颜色，给今天换个心情。数据条实时记录真实能量与体积保持率。</p>`,
  '02': `<p>🍍 <b>拉一拉</b>：按住菠萝圈向外扯，松手看它"嘣"地弹回去。</p><p>👆 <b>轻轻弹一下</b>：戳它一下，看它抖三抖。</p><p>🔄 <b>翻个面</b>：让菠萝圈翻个身，换个角度解压。</p>`,
  '03': `<p>🧸 <b>捏一捏</b>：捏捏小熊的脸颊和肚皮，软糖会 Q 弹变形，保体积不塌陷。</p><p>🔄 <b>翻个面</b>：看看小熊的后脑勺。</p>`,
  '04': `<p>🎲 <b>摇一摇</b>：点击骰子或按钮，把它抛起来。看它弹跳、翻滚，最后定格——今天的运气是几点？</p>`,
  '05': `<p>🍊 <b>揉捏</b>：按住果冻拉伸，双指扭转，拖空白处旋转视角。</p><p>🔪 <b>切一刀</b>：划线、落刀，橘子分成小块。</p><p>⭐ <b>形状模具</b>：星星、圆形、爱心，一秒换形。</p>`,
  '06': `<p>🦑 <b>戳一戳</b>：点触小鱿鱼，深色发光内核与大眼睛随波荡漾，8 根柔韧触手连续动态摆动！</p>`,
  '07': `<p>🍉 <b>加一根橡皮筋</b>：每点一下，多一根皮筋勒住西瓜。看看它能撑住几根？</p>`,
  '08': `<p>🥮 <b>月柔 · 冰皮月饼捏捏</b>：这手感，比刚出炉的软面包还上头！顶面八瓣宝相莲花立体浮雕，侧面 20 齿圆润波浪裙边。</p><p>✨ <b>绝美渐变与欧泊玉光</b>：顶层鲜荔枝玫瑰粉，中层奶黄落日橙，底层与边缘泛出如梦如幻的冰白微蓝欧泊玉光！</p><p>🎨 <b>风味随心换</b>：玫瑰芭乐、落日橙、冰川海盐、开心果抹茶、芋泥啵啵，五味曼妙。</p>`,
};
function openHelp(gameId) {
  $('#help-body').innerHTML = HELP_COPY[gameId] || '<p>捏一捏，切一切，把时间放慢一点。</p>';
  $('#modal-help').classList.add('show');
  JellySound.pop();
}
function openSound() {
  $('#modal-sound').classList.add('show');
  $('#sw-sound').classList.toggle('on', JellySound.enabled);
  JellySound.pop();
}
$('#help-close').onclick = () => $('#modal-help').classList.remove('show');
$('#sound-close').onclick = () => $('#modal-sound').classList.remove('show');
$('#modal-help').addEventListener('click', e => { if (e.target.id === 'modal-help') e.target.classList.remove('show'); });
$('#modal-sound').addEventListener('click', e => { if (e.target.id === 'modal-sound') e.target.classList.remove('show'); });
$('#sw-sound').onclick = e => {
  const on = !JellySound.enabled;
  JellySound.setEnabled(on);
  e.target.classList.toggle('on', on);
  toast(on ? '音效已开启 ♫' : '音效已关闭');
};
$('#vol-range').oninput = e => {
  $('#vol-val').textContent = e.target.value + '%';
  JellySound.setVolume(e.target.value / 100);
};

/* ============================================================
 * 游戏页 HTML 与控制器
 * ============================================================ */
function gameHTML(g) {
  const tabs = g.tabs.map((t, i) => `<button data-tab="${t}" class="${i === 0 ? 'on' : ''}">${t}</button>`).join('');
  const modes = (g.modes || []).map((m, i) =>
    `<button class="mode-btn ${i === 0 ? 'on' : ''}" data-mode="${m.id}"><span class="mi">${icon(m.icon, 24)}</span>${m.name}</button>`).join('');
  const molds = (g.molds || []).map(m =>
    `<button class="mode-btn" data-mold="${m.id}"><span class="mi">${m.icon}</span>${m.name}</button>`).join('');
  const colors = (g.colors || []).map((c, i) =>
    `<button class="color-btn ${i === 0 ? 'on' : ''}" data-color="${c.id}"><span class="dot" style="background:${c.dot}"></span>${c.name}</button>`).join('');
  const actions = g.actions.map(a =>
    `<button class="action-btn ${a.primary ? 'primary' : ''}" data-act="${a.id}">${a.icon ? icon(a.icon, 20) : ''}${a.name}</button>`).join('');

  return `
  <div class="topbar">
    <button class="back-btn" id="g-back">${icon('back', 18)} 返回</button>
    <div class="title"><h1>${g.name}</h1><div class="en">Jelly Lab · XPBD</div></div>
    <div style="display:flex;gap:10px">
      <button class="icon-btn" id="g-user">${icon('user', 20)}</button>
      <button class="icon-btn" id="g-share">${icon('share', 20)}</button>
    </div>
  </div>
  <div class="game-script">${g.script}</div>
  <div class="game-actions">
    <button class="icon-btn" id="g-sound">${icon('speaker', 20)}</button>
    <button class="icon-btn" id="g-fav">${icon('heart', 20)}</button>
  </div>
  <div class="stage-wrap">
    <canvas id="stage"></canvas>
    <canvas id="overlay" class="cut-hint"></canvas>
  </div>
  <div class="status-row">
    <span class="live">● 60Hz 稳健物理在线</span>
    ${g.cutCount ? '<span id="cut-count">已切成 1 块</span>' : (g.rubber ? '<span id="band-top"><b style="font-size:18px">0</b> 根橡皮皮筋</span>' : '<span></span>')}
  </div>
  <div class="data-bar" id="data-bar">
    ${g.dataLabels.map((k, i) => `<div class="data-cell"><div class="k">${k}</div><div class="v" id="dv${i}">–</div></div>`).join('')}
  </div>
  <div class="tip-bar"><span id="tip-text">${g.tips.main || g.tips.pinch}</span><span class="how" id="g-how">怎么玩？ ${icon('help', 16)}</span></div>
  <div class="tabs" id="g-tabs">${tabs}</div>

  <div class="panel on" data-panel="操作">
    ${(g.modes && g.modes.length) ? `<div class="mode-row">${modes}</div>` : '<div class="empty-tip" style="padding:14px">直接上手玩吧，不需要选模式</div>'}
    ${molds ? `<div class="mode-row" id="mold-row" style="margin-top:10px;display:none">${molds}</div>` : ''}
    ${g.rubber ? `<div class="band-counter">还能撑住。换个位置加，或拖动看看。<br><b id="band-num">0</b> 根橡皮皮筋</div>` : ''}
  </div>
  <div class="panel" data-panel="手感">
    <div class="slider-row"><label>果冻软硬度 <b id="soft-val">适中</b></label>
      <input type="range" id="soft-range" min="0" max="100" value="55"></div>
    <div class="slider-row"><label>阻尼回弹 <b id="bounce-val">Q弹</b></label>
      <input type="range" id="bounce-range" min="0" max="100" value="60"></div>
    <div class="slider-row"><label>抖动频率 <b id="jiggle-val">高频震颤</b></label>
      <input type="range" id="jiggle-range" min="0" max="100" value="75"></div>
  </div>
  <div class="panel" data-panel="颜色">${(g.colors && g.colors.length) ? `<div class="color-row">${colors}</div>` : '<div class="empty-tip" style="padding:20px">本款只有一种心情色</div>'}</div>
  <div class="panel" data-panel="特效">
    <div class="switch-row"><span>✨ 果冻光泽</span><button class="switch on" id="sw-gloss"></button></div>
    <div class="switch-row"><span>💫 氛围粒子</span><button class="switch on" id="sw-dust"></button></div>
    <div class="switch-row"><span>⏳ 慢动作回弹 (0.25x)</span><button class="switch" id="sw-slow"></button></div>
    <div class="switch-row"><span>🕸️ 物理晶格 (XPBD 384体)</span><button class="switch" id="sw-wire"></button></div>
  </div>
  <div class="dice-result" id="dice-result"></div>
  <div class="action-row">${actions}</div>
  <div style="height:16px"></div>`;
}

/* ---------------- 进入游戏 ---------------- */
function enterGame(id) {
  const g = GAMES[id];
  S.gameId = id;
  S.mode = (g.modes && g.modes[0] && g.modes[0].id) || 'pinch';
  S.colorId = g.defaultColor || null;
  S.cuts = 0; S.throws = 0; S.paused = false;
  S.softness = 0.55; S.bounciness = 0.6; S.jiggle = 0.75;
  S.slow = false; S.wireframe = false;
  S.playCount++; localStorage.setItem('jelly-plays', S.playCount);

  const el = $('#page-game');
  el.innerHTML = gameHTML(g);
  showPage('page-game');
  setTab('lab');

  // 顶栏
  $('#g-back').onclick = () => { JellySound.pop(); location.hash = '#/home'; };
  $('#g-user').onclick = () => location.hash = '#/me';
  $('#g-share').onclick = shareApp;
  $('#g-sound').onclick = e => {
    const on = !JellySound.enabled;
    JellySound.setEnabled(on);
    e.currentTarget.innerHTML = icon(on ? 'speaker' : 'speakerOff', 20);
    toast(on ? '音效已开启 ♫' : '音效已关闭');
  };
  $('#g-fav').onclick = e => {
    toggleFav(id, e.currentTarget);
    e.currentTarget.classList.toggle('on', S.favs.has(id));
  };
  $('#g-fav').classList.toggle('on', S.favs.has(id));
  $('#g-fav').style.color = S.favs.has(id) ? '#e2546e' : '';
  $('#g-how').onclick = () => openHelp(id);

  // tabs
  $('#g-tabs').onclick = e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    JellySound.pop();
    $$('#g-tabs button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    $$('#page-game .panel').forEach(p => p.classList.toggle('on', p.dataset.panel === b.dataset.tab));
  };

  el.onclick = e => {
    const mb = e.target.closest('[data-mode]');
    if (mb) {
      JellySound.pop();
      const mid = mb.dataset.mode;
      if (mid === 'reset') { doAction('reset'); return; }
      $$('#page-game [data-mode]').forEach(x => x.classList.remove('on'));
      mb.classList.add('on');
      S.mode = mid;
      const mr = $('#mold-row');
      if (mr) mr.style.display = S.mode === 'mold' ? 'flex' : 'none';
      const tips = GAMES[S.gameId].tips;
      $('#tip-text').innerHTML = tips[S.mode] || tips.main || tips.pinch;
      return;
    }
    const mold = e.target.closest('[data-mold]');
    if (mold) { applyMold(mold.dataset.mold); return; }
    const cb = e.target.closest('[data-color]');
    if (cb) {
      JellySound.pop();
      $$('#page-game [data-color]').forEach(x => x.classList.remove('on'));
      cb.classList.add('on');
      S.colorId = cb.dataset.color;
      rebuildJelly();
      return;
    }
    const ab = e.target.closest('[data-act]');
    if (ab) { doAction(ab.dataset.act); return; }
  };

  // sliders & switches
  $('#soft-range').oninput = e => {
    const v = e.target.value / 100;
    S.softness = v;
    $('#soft-val').textContent = v < 0.33 ? '偏硬' : v < 0.7 ? '适中' : '超软';
    S.jellies.forEach(j => j.setFirmness(100 - v * 75));
  };
  $('#bounce-range').oninput = e => {
    const v = e.target.value / 100;
    S.bounciness = v;
    $('#bounce-val').textContent = v < 0.33 ? '沉稳' : v < 0.7 ? 'Q弹' : '暴弹';
    S.jellies.forEach(j => j.setDamping((1 - v) * 50));
  };
  $('#jiggle-range').oninput = e => {
    const v = e.target.value / 100;
    S.jiggle = v;
    $('#jiggle-val').textContent = v < 0.33 ? '低频沉稳' : v < 0.7 ? '灵动微颤' : '高频震颤';
    S.jellies.forEach(j => j.setJiggle(v * 100));
  };
  $('#sw-gloss').onclick = e => {
    S.gloss = !S.gloss;
    e.target.classList.toggle('on', S.gloss);
    S.jellies.forEach(j => {
      const m = j.mesh.material;
      (Array.isArray(m) ? m : [m]).forEach(mm => {
        if (mm.clearcoat !== undefined) { mm.clearcoat = S.gloss ? 1.0 : 0.05; mm.needsUpdate = true; }
      });
    });
    JellySound.pop();
  };
  $('#sw-dust').onclick = e => {
    S.dust = !S.dust;
    e.target.classList.toggle('on', S.dust);
    if (S.dustSystem) S.dustSystem.visible = S.dust;
    JellySound.pop();
  };
  $('#sw-slow').onclick = e => {
    S.slow = !S.slow;
    e.target.classList.toggle('on', S.slow);
    S.jellies.forEach(j => j.setSlow(S.slow));
    toast(S.slow ? '已开启 0.25x 慢动作回弹' : '已恢复正常速度');
    JellySound.pop();
  };
  $('#sw-wire').onclick = e => {
    S.wireframe = !S.wireframe;
    e.target.classList.toggle('on', S.wireframe);
    S.jellies.forEach(j => j.setWireframe(S.wireframe));
    toast(S.wireframe ? '已显示 384 四面体物理晶格' : '已隐藏物理晶格');
    JellySound.pop();
  };

  setupStage(id);
}

/* ---------------- 3D 舞台 ---------------- */
function setupStage(id) {
  const canvas = $('#stage');
  const overlay = $('#overlay');
  let stage;
  try {
    stage = createStage(canvas);
  } catch (e) {
    console.error('CRITICAL createStage ERROR:', e);
    window.__STAGE_ERR__ = e.stack || e.message;
    $('#webgl-fail').style.display = 'block';
    return;
  }
  stage.renderer.setPixelRatio(PERF.pr);
  stage.resize();
  S.stage = stage;
  S.camHome = { ...S.cam };

  // 氛围粒子
  S.dustSystem = makeDust(stage.scene);
  S.dustSystem.visible = S.dust;

  buildJellies(id);
  bindPointer(canvas, overlay, id);
  applyCam();

  // 全系统严格锁定稳健的 60FPS / 60Hz 物理步进与渲染主循环
  const clock = new THREE.Clock();
  let statT = 0;
  let lastFrameTime = performance.now();
  const TARGET_FPS = 60;
  const FRAME_INTERVAL = 1000 / TARGET_FPS; // 16.6667ms
  let frameAccumulator = 0;

  const loop = (now) => {
    S.raf = requestAnimationFrame(loop);
    const deltaMs = Math.min(now - lastFrameTime, 100);
    lastFrameTime = now;
    frameAccumulator += deltaMs;

    // 高刷屏节流锁帧：未达 60FPS 帧间隔时直接跳过渲染，稳稳锁定 60Hz
    if (frameAccumulator < FRAME_INTERVAL * 0.90) {
      return;
    }

    // 严格锁定 60Hz 物理定长步长 (dt = 1 / 60 ≈ 0.01667s)
    const dt = 1 / TARGET_FPS;
    frameAccumulator -= FRAME_INTERVAL;
    if (frameAccumulator > FRAME_INTERVAL * 2) frameAccumulator = 0;

    const t = clock.getElapsedTime();
    if (!S.paused) {
      for (const j of S.jellies) j.update(dt, t);
      updateSpecials(id, dt, t);
    }
    updateStrands(dt);
    if (S.dustSystem) updateDust(dt, t);

    // 动态接触阴影与抓取标记跟随物理中心
    if (S.stage && S.stage.shadowMesh && S.jellies.length > 0) {
      const primary = S.jellies[0];
      const p = primary.physics.position;
      let totalX = 0, totalY = 0, totalZ = 0;
      for (let i = 0; i < p.length; i += 3) {
        totalX += p[i]; totalY += p[i + 1]; totalZ += p[i + 2];
      }
      const count = primary.physics.count;
      const avgX = totalX / count;
      const avgY = totalY / count;
      const avgZ = totalZ / count;

      S.stage.shadowMesh.position.x = avgX;
      S.stage.shadowMesh.position.z = avgZ;

      const alt = Math.max(0, avgY - 1.0);
      S.stage.shadowMesh.scale.setScalar(1.0 + alt * 0.22);
      S.stage.shadowMesh.material.opacity = Math.max(0.12, 0.85 - alt * 0.28);

      if (primary.physics.grab && S.stage.grabMarker) {
        S.stage.grabMarker.position.fromArray(primary.physics.grab.target);
        S.stage.grabMarker.visible = true;
      } else if (S.stage.grabMarker) {
        S.stage.grabMarker.visible = false;
      }
    }

    stage.renderer.render(stage.scene, stage.camera);
    statT += dt;
    if (statT > 0.15) { statT = 0; updateDataBar(id); }
  };
  S.raf = requestAnimationFrame(loop);
  updateDataBar(id);
}

function buildJellies(id) {
  const g = GAMES[id];
  const stage = S.stage;
  for (const j of S.jellies) {
    stage.scene.remove(j.group);
    j.dispose();
  }
  S.jellies = [];
  S.special = null;

  const built = g.build(S.colorId);
  const jelly = new JellyBody(built.mesh, {
    firmness: 100 - S.softness * 75,
    damping: (1 - S.bounciness) * 50,
    jiggle: S.jiggle * 100
  });
  jelly.group.position.y = built.restY || 0;
  stage.scene.add(jelly.group);

  // 装配副网格（果皮等）
  if (built.secondary) {
    for (const sec of built.secondary) {
      jelly.addSecondaryMesh(sec.mesh, sec.scale, sec.offset);
    }
  }

  // 装配鱿鱼内脏器官
  if (built.organs) {
    jelly.setSquidOrgans(built.organs);
  }

  // 装配柔韧触手连续动态管道
  if (built.tentacles) {
    jelly.setTentacleMeshes(built.tentacles);
  }

  // 装配嵌入跟随物（果籽、骰子点等）
  if (built.followers) {
    built.followers.forEach(f => {
      jelly.group.add(f.mesh);
      jelly.follow(f.mesh, f.vert || f.restPos || f.embedding, f.off);
    });
  }

  jelly.setWireframe(S.wireframe);
  jelly.setSlow(S.slow);
  jelly.setPaused(S.paused);

  S.jellies.push(jelly);
  window.__J = S.jellies;
  S.fleshColor = built.fleshColor;

  if (g.dice) initDice(jelly);
  if (g.squid) {
    S.special = {
      type: 'squid',
      excite(v) { jelly.shake(v); }
    };
  }
  if (g.rubber) initRubber(jelly);
}

function rebuildJelly() {
  if (!S.gameId) return;
  buildJellies(S.gameId);
  S.cuts = 0;
  updateDataBar(S.gameId);
  const cc = $('#cut-count'); if (cc) cc.textContent = '已切成 1 块';
}

function disposeGame() {
  if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
  if (S.stage) {
    for (const j of S.jellies) { try { j.dispose(); } catch (e) {} }
    S.jellies = [];
    try { S.stage.renderer.dispose(); } catch (e) {}
    S.stage = null;
  }
  S.special = null;
  S.strands = [];
}

/* ---------------- 相机 ---------------- */
function applyCam() {
  const st = S.stage; if (!st) return;
  const { theta, phi, r, tx, ty, tz } = S.cam;
  st.camera.position.set(
    tx + r * Math.sin(phi) * Math.sin(theta),
    ty + r * Math.cos(phi),
    tz + r * Math.sin(phi) * Math.cos(theta)
  );
  st.camera.lookAt(tx, ty, tz);
}

/* ---------------- 指针交互 ---------------- */
function bindPointer(canvas, overlay, id) {
  const g = GAMES[id];
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const stage = S.stage;
  const octx = overlay.getContext('2d');
  let pdown = null;
  let pointers = new Map();
  let swipe = null;
  let lastPinchAngle = null;

  const sizeOverlay = () => {
    const r = canvas.getBoundingClientRect();
    overlay.width = r.width * PERF.pr; overlay.height = r.height * PERF.pr;
  };
  sizeOverlay();

  function castAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((cx - r.left) / r.width) * 2 - 1;
    ndc.y = -((cy - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, stage.camera);
    const meshes = S.jellies.map(j => j.mesh);
    const hits = ray.intersectObjects(meshes, false);
    for (const h of hits) {
      const j = S.jellies.find(jj => jj.mesh === h.object);
      if (j && hitOnKeptSide(j, h.point)) return { jelly: j, point: h.point };
    }
    return null;
  }

  function screenToWorldOnJellyPlane(cx, cy, depthRef) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((cx - r.left) / r.width) * 2 - 1;
    ndc.y = -((cy - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, stage.camera);
    const n = new THREE.Vector3();
    stage.camera.getWorldDirection(n);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, depthRef);
    const out = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, out)) {
      // 视锥安全包围盒裁剪锁，绝对禁止拖拽目标飞出屏幕
      out.x = clamp(out.x, -2.3, 2.3);
      out.y = clamp(out.y, 0.12, 3.2);
      out.z = clamp(out.z, -1.9, 1.9);
      return out;
    }
    return null;
  }

  canvas.addEventListener('pointerdown', e => {
    unlockAudio();
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const hit = castAt(e.clientX, e.clientY);
    pdown = { x: e.clientX, y: e.clientY, hit, moved: false };

    if (pointers.size === 2) {
      const p = [...pointers.values()];
      lastPinchAngle = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
      return;
    }

    if (S.mode === 'cut' && g.cuttable) {
      swipe = { pts: [{ x: e.clientX, y: e.clientY }], jelly: hit && hit.jelly };
      return;
    }
    if (hit) {
      if (S.mode === 'poke' || S.mode === 'flick' || g.dice) {
        const dir = new THREE.Vector3();
        stage.camera.getWorldDirection(dir);
        hit.jelly.poke(hit.point, dir.multiplyScalar(-2.2), 1.2);
        JellySound.boing(0.8);
        if (g.squid && S.special) S.special.excite(1.2);
        if (g.dice) rollDice();
      } else {
        const n = hit.jelly.grabPoint(hit.point, 0.95);
        if (n > 0) {
          hit.jelly._grabPt = hit.point.clone();
          JellySound.squeeze(0.7);
        }
      }
    }
  });

  canvas.addEventListener('pointermove', e => {
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pdown || e.pointerId !== [...pointers.keys()][0]) {
      if (pointers.size === 2 && lastPinchAngle !== null) {
        const p = [...pointers.values()];
        const a = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
        const d = a - lastPinchAngle;
        S.jellies.forEach(j => { j.group.rotation.y += d * 1.4; });
        lastPinchAngle = a;
      }
      return;
    }
    const dx = e.clientX - pdown.x, dy = e.clientY - pdown.y;
    if (Math.hypot(dx, dy) > 6) pdown.moved = true;

    if (swipe) {
      swipe.pts.push({ x: e.clientX, y: e.clientY });
      drawSwipe();
      return;
    }
    if (pdown.hit && pdown.hit.jelly._grabPt) {
      const j = pdown.hit.jelly;
      const w = screenToWorldOnJellyPlane(e.clientX, e.clientY, pdown.hit.jelly._grabPt);
      if (w) {
        j.dragTo(w);
        pdown.hit.jelly._grabPt.copy(w);
      }
    } else if (!pdown.hit) {
      S.cam.theta -= (e.clientX - prev.x) * 0.006;
      S.cam.phi = clamp(S.cam.phi - (e.clientY - prev.y) * 0.004, 0.55, 1.45);
      applyCam();
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchAngle = null;
    if (swipe && swipe.pts.length > 4) doCutSwipe(swipe, id);
    swipe = null;
    clearSwipe();
    if (pdown && pdown.hit) {
      const j = pdown.hit.jelly;
      if (j._grabPt) {
        j.release();
        j._grabPt = null;
        JellySound.boing(0.5);
      }
    }
    pdown = null;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  function drawSwipe() {
    const r = canvas.getBoundingClientRect();
    octx.setTransform(PERF.pr, 0, 0, PERF.pr, 0, 0);
    octx.clearRect(0, 0, r.width, r.height);
    octx.strokeStyle = 'rgba(255,255,255,0.95)';
    octx.lineWidth = 3;
    octx.setLineDash([10, 8]);
    octx.beginPath();
    swipe.pts.forEach((p, i) => {
      const x = p.x - r.left, y = p.y - r.top;
      i ? octx.lineTo(x, y) : octx.moveTo(x, y);
    });
    octx.stroke();
    octx.setLineDash([]);
  }
  function clearSwipe() {
    const r = canvas.getBoundingClientRect();
    octx.setTransform(PERF.pr, 0, 0, PERF.pr, 0, 0);
    octx.clearRect(0, 0, r.width, r.height);
  }

  function doCutSwipe(sw, id) {
    const pts = sw.pts;
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 40) return;
    const j = sw.jelly || S.jellies[0];
    if (!j) return;
    const c = new THREE.Vector3();
    j.group.getWorldPosition(c);
    const w1 = screenToWorldOnJellyPlane(a.x, a.y, c);
    const w2 = screenToWorldOnJellyPlane(b.x, b.y, c);
    if (!w1 || !w2) return;
    flashCut(a, b, canvas);
    const res = cutJelly(j, w1, w2, S.fleshColor || '#e0445a');
    if (res) {
      const idx = S.jellies.indexOf(j);
      if (idx >= 0) S.jellies.splice(idx, 1);
      S.jellies.push(res[0], res[1]);
      S.cuts++;
      JellySound.slice();
      toast('咔嚓！切开两半，体积守恒～');
      const cc = $('#cut-count');
      if (cc) cc.textContent = `已切成 ${S.jellies.length} 块`;
    } else {
      toast('这一刀没切开，换个角度试试');
    }
  }

  function flashCut(a, b, canvas) {
    const r = canvas.getBoundingClientRect();
    octx.setTransform(PERF.pr, 0, 0, PERF.pr, 0, 0);
    octx.strokeStyle = 'rgba(255,255,255,1)';
    octx.lineWidth = 7;
    octx.beginPath();
    octx.moveTo(a.x - r.left, a.y - r.top);
    octx.lineTo(b.x - r.left, b.y - r.top);
    octx.stroke();
    setTimeout(clearSwipe, 180);
  }
}

/* ---------------- 拉丝（晃一晃的果冻丝） ---------------- */
function spawnStrands(jelly, n = 10) {
  if (!S.stage) return;
  S.strands = S.strands || [];
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xfff2df, transmission: 0.6, roughness: 0.3, transparent: true, opacity: 0.85,
  });
  const arr = jelly.pos.array;
  for (let i = 0; i < n; i++) {
    const vi = Math.floor(Math.random() * (jelly.pos.count || 100));
    const i3 = vi * 3;
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.3, 3, 8), mat);
    const wp = new THREE.Vector3(arr[i3] || 0, (arr[i3+1] || 0) + 0.5, arr[i3+2] || 0).applyMatrix4(jelly.mesh.matrixWorld);
    const lp = jelly.group.worldToLocal(wp.clone());
    m.position.copy(lp);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    jelly.group.add(m);
    S.strands.push({ mesh: m, life: 1, vy: 0.9 + Math.random() * 0.7, jelly });
  }
}
function updateStrands(dt) {
  if (!S.strands) return;
  for (let i = S.strands.length - 1; i >= 0; i--) {
    const s = S.strands[i];
    s.life -= dt * 1.1;
    s.mesh.position.y -= s.vy * dt;
    s.mesh.scale.y = 1 + (1 - s.life) * 2.2;
    s.mesh.material.opacity = Math.max(0, s.life) * 0.85;
    if (s.life <= 0) {
      s.mesh.parent && s.mesh.parent.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
      S.strands.splice(i, 1);
    }
  }
}

/* ---------------- 氛围粒子 ---------------- */
function makeDust(scene) {
  const n = PERF.dust;
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    p[i*3] = (Math.random() - 0.5) * 9;
    p[i*3+1] = Math.random() * 5 - 0.5;
    p[i*3+2] = (Math.random() - 0.5) * 6;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffe9c4, size: 0.055, transparent: true, opacity: 0.65, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.userData.base = p.slice();
  scene.add(pts);
  return pts;
}
function updateDust(dt, t) {
  const d = S.dustSystem; if (!d || !d.visible) return;
  const p = d.geometry.attributes.position.array, b = d.userData.base;
  for (let i = 0; i < p.length / 3; i++) {
    p[i*3] = b[i*3] + Math.sin(t * 0.4 + i) * 0.35;
    p[i*3+1] = b[i*3+1] + Math.sin(t * 0.25 + i * 1.7) * 0.45;
  }
  d.geometry.attributes.position.needsUpdate = true;
}

/* ---------------- 骰子刚体 ---------------- */
function initDice(jelly) {
  S.special = {
    type: 'dice',
    vel: new THREE.Vector3(),
    angVel: new THREE.Vector3(),
    sleeping: true,
    face: 5,
    floorY: 0.0,
  };
  jelly.group.position.y = 0.35;
}
function rollDice() {
  const sp = S.special;
  if (!sp || sp.type !== 'dice') return;
  const j = S.jellies[0]; if (!j) return;
  sp.sleeping = false;
  sp.face = null;
  sp.vel.set((Math.random() - 0.5) * 5, 5.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3.5);
  sp.angVel.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
  S.throws++;
  JellySound.rattle(6);
  $('#dice-result').innerHTML = '摇起来…';
}
const _dq = new THREE.Quaternion(), _e = new THREE.Euler();
function updateDice(dt) {
  const sp = S.special, j = S.jellies[0];
  if (!sp || !j || sp.sleeping) return;
  const g = j.group;
  sp.vel.y -= 13 * dt;
  sp.angVel.multiplyScalar(Math.pow(0.25, dt));
  sp.vel.x *= Math.pow(0.5, dt); sp.vel.z *= Math.pow(0.5, dt);

  // 骰子防弹飞速度与高度截断锁
  const spd = sp.vel.length();
  if (spd > 9.5) sp.vel.multiplyScalar(9.5 / spd);

  g.position.addScaledVector(sp.vel, dt);
  _e.set(sp.angVel.x * dt, sp.angVel.y * dt, sp.angVel.z * dt);
  _dq.setFromEuler(_e);
  g.quaternion.multiply(_dq);

  if (g.position.y < sp.floorY) {
    g.position.y = sp.floorY;
    if (Math.abs(sp.vel.y) > 1.2) { JellySound.thock(); j.shake(0.7); }
    sp.vel.y *= -0.48;
    sp.vel.x *= 0.72; sp.vel.z *= 0.72;
    sp.angVel.multiplyScalar(0.62);
  }
  if (g.position.y > 2.8) {
    g.position.y = 2.8;
    sp.vel.y = -Math.abs(sp.vel.y) * 0.45;
  }
  if (Math.abs(g.position.x) > 2.1) {
    g.position.x = Math.sign(g.position.x) * 2.1;
    sp.vel.x = -Math.sign(g.position.x) * Math.abs(sp.vel.x) * 0.55;
  }
  if (Math.abs(g.position.z) > 1.5) {
    g.position.z = Math.sign(g.position.z) * 1.5;
    sp.vel.z = -Math.sign(g.position.z) * Math.abs(sp.vel.z) * 0.55;
  }

  const sp2 = sp.vel.length(), sa = sp.angVel.length();
  const onFloor = g.position.y <= sp.floorY + 0.05;
  if (sp2 < 0.7 && sa < 1.6 && onFloor) {
    sp.sleeping = true;
    const euler = new THREE.Euler().setFromQuaternion(g.quaternion);
    euler.x = Math.round(euler.x / (Math.PI / 2)) * (Math.PI / 2);
    euler.y = Math.round(euler.y / (Math.PI / 2)) * (Math.PI / 2);
    euler.z = Math.round(euler.z / (Math.PI / 2)) * (Math.PI / 2);
    g.quaternion.setFromEuler(euler);

    const ups = [
      { n: new THREE.Vector3(0,0,1), v: 1 }, { n: new THREE.Vector3(0,0,-1), v: 6 },
      { n: new THREE.Vector3(1,0,0), v: 2 }, { n: new THREE.Vector3(-1,0,0), v: 5 },
      { n: new THREE.Vector3(0,1,0), v: 3 }, { n: new THREE.Vector3(0,-1,0), v: 4 },
    ];
    let best = null, by = -2;
    for (const f of ups) {
      const w = f.n.clone().applyQuaternion(g.quaternion);
      if (w.y > by) { by = w.y; best = f.v; }
    }
    sp.face = best;
    JellySound.thock();
    j.shake(0.5);
    $('#dice-result').innerHTML = `🎲 <b>${best} 点！</b>${best >= 5 ? '今天运气爆棚' : best >= 3 ? '还不错' : '再摇一次转转运'}`;
  }
}

/* ---------------- 西瓜橡皮筋 ---------------- */
function initRubber(jelly) {
  S.special = { type: 'rubber', bands: [] };
}
function addBand() {
  const sp = S.special;
  if (!sp || sp.type !== 'rubber') return;
  const j = S.jellies[0]; if (!j) return;
  const n = sp.bands.length;
  if (n >= 24) {
    // 达到承受极限，触发橡皮筋崩断与西瓜爆裂 ASMR 顶级解压！
    JellySound.explode();
    j.shake(3.0);
    spawnStrands(j, 20);
    sp.bands.forEach(b => { b.mesh.parent && b.mesh.parent.remove(b.mesh); });
    sp.bands = [];
    j.group.scale.y = 1.0;
    const bt = $('#band-top'); if (bt) bt.innerHTML = '<b style="font-size:18px">0</b> 根橡皮皮筋';
    const bn = $('#band-num'); if (bn) bn.textContent = '0';
    toast('💥 砰！西瓜爆开啦！汁水四溅，超级解压～');
    updateDataBar(S.gameId);
    return;
  }
  const mat = new THREE.MeshStandardMaterial({ color: n % 2 ? 0xc9a06a : 0xd94f3d, roughness: 0.55 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.92, 0.06, 10, 48), mat);
  band.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.55;
  band.rotation.y = (Math.random() - 0.5) * 0.4;
  band.position.y = (Math.random() - 0.5) * 0.5;
  const target = 0.88 - n * 0.008;
  band.scale.setScalar(1.45);
  j.group.add(band);
  sp.bands.push({ mesh: band, t: 0, target });
  JellySound.twang();
  j.poke(new THREE.Vector3(0, 0.4, 1.2), new THREE.Vector3(0, -1.4, -0.6), 2.2);

  const squash = Math.max(0.78, 1 - sp.bands.length * 0.012);
  j.group.scale.y += (squash - j.group.scale.y) * 0.9;
  const bt = $('#band-top'); if (bt) bt.innerHTML = `<b style="font-size:18px">${sp.bands.length}</b> 根橡皮皮筋`;
  const bn = $('#band-num'); if (bn) bn.textContent = sp.bands.length;
  if (sp.bands.length === 10) toast('10 根了！还能撑住…');
  if (sp.bands.length === 20) toast('20 根！西瓜瑟瑟发抖 🍉');
  updateDataBar(S.gameId);
}
function updateRubber(dt) {
  const sp = S.special;
  if (!sp || sp.type !== 'rubber') return;
  for (const b of sp.bands) {
    if (b.t < 1) {
      b.t = Math.min(1, b.t + dt * 2.2);
      const e = 1 + (b.target - 1) * (1 - Math.pow(1 - b.t, 3)) + Math.sin(b.t * 12) * 0.04 * (1 - b.t);
      b.mesh.scale.setScalar(Math.max(b.target, e * 1.45 - 0.45 * b.t));
    }
  }
}

/* ---------------- 特殊更新分发 ---------------- */
function updateSpecials(id, dt, t) {
  const g = GAMES[id];
  if (g.dice) updateDice(dt);
  if (g.rubber) updateRubber(dt);
}

/* ---------------- 数据条 ---------------- */
let _smE = 0;
function updateDataBar(id) {
  const g = GAMES[id];
  if (!g) return;
  let pieces = S.jellies.length, mass = g.baseMass, energy = 0;
  for (const j of S.jellies) energy += j.energy;
  _smE += (energy - _smE) * 0.25;
  mass = Math.max(1, g.baseMass * (1 - S.cuts * 0.02));

  let totalStretch = 0;
  for (const j of S.jellies) totalStretch += j.stretch || 0;
  const avgStretch = S.jellies.length ? (totalStretch / S.jellies.length) : 0;
  const vol = Math.max(95.0, Math.min(100.0, 100.0 - avgStretch * 0.03 - S.cuts * 0.4));

  const vals = g.dataLabels.map((k, i) => {
    const u = g.dataUnits[i] || '';
    if (k.includes('块数')) return `${pieces}<small>块</small>`;
    if (k.includes('投掷')) return `${S.throws}<small>次</small>`;
    if (k.includes('橡皮筋')) return `${(S.special && S.special.bands || []).length}<small>根</small>`;
    if (k.includes('质量')) return `${Math.round(mass)}<small>${u}</small>`;
    if (k.includes('体积')) return `${vol.toFixed(1)}<small>%</small>`;
    if (k.includes('能量')) {
      const ev = _smE * 2.4;
      return `${(ev < 0.1 ? 0 : ev).toFixed(ev > 10 ? 1 : 2)}<small>${u || '微焦'}</small>`;
    }
    return '–';
  });
  vals.forEach((v, i) => { const el = $('#dv' + i); if (el) el.innerHTML = v; });
}

/* ---------------- 动作分发 ---------------- */
function doAction(act) {
  const id = S.gameId, g = GAMES[id];
  const j = S.jellies[0];
  switch (act) {
    case 'shake':
      if (!j) break;
      JellySound.wobble();
      j.shake(1.5);
      spawnStrands(j, 9);
      toast('晃一晃，松弛一下～');
      break;
    case 'reset':
      JellySound.pop();
      rebuildJelly();
      if (g.rubber && S.special) {
        S.special.bands.forEach(b => { b.mesh.parent && b.mesh.parent.remove(b.mesh); });
        S.special.bands = [];
        const bt = $('#band-top'); if (bt) bt.innerHTML = '<b style="font-size:18px">0</b> 根橡皮皮筋';
        const bn = $('#band-num'); if (bn) bn.textContent = '0';
      }
      if (g.dice) { S.throws = 0; $('#dice-result').innerHTML = ''; }
      toast('回到最初的软乎乎');
      break;
    case 'pause': {
      S.paused = !S.paused;
      S.jellies.forEach(jj => jj.setPaused(S.paused));
      const btn = document.querySelector('[data-act="pause"]');
      if (btn) btn.innerHTML = `${icon(S.paused ? 'play' : 'pause', 20)}${S.paused ? '继续' : '暂停'}`;
      toast(S.paused ? '已暂停，果冻定住了' : '继续开玩');
      JellySound.pop();
      break;
    }
    case 'recenter':
      S.cam = { ...S.camHome };
      applyCam();
      S.jellies.forEach(jj => { jj.group.rotation.set(0, 0, 0); });
      JellySound.pop();
      toast('视角回正');
      break;
    case 'roll':
      rollDice();
      break;
    case 'addband':
      addBand();
      break;
    case 'flick':
      if (j) {
        const c = new THREE.Vector3();
        j.group.getWorldPosition(c);
        j.poke(c, new THREE.Vector3((Math.random() - 0.5) * 3, 2.5, (Math.random() - 0.5) * 2), 2.4);
        JellySound.boing(1);
        if (g.squid && S.special) S.special.excite(1.5);
      }
      break;
    case 'flip': {
      if (!j) break;
      JellySound.flip();
      const grp = j.group;
      const from = grp.rotation.x, to = from + Math.PI;
      const t0 = performance.now();
      const anim = () => {
        const t = Math.min(1, (performance.now() - t0) / 650);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        grp.rotation.x = from + (to - from) * e;
        if (t < 1) requestAnimationFrame(anim);
      };
      anim();
      toast('翻了个面～');
      break;
    }
    default:
      break;
  }
}

/* 模具 */
function applyMold(kind) {
  const g = GAMES[S.gameId];
  if (!g.buildMold) return;
  JellySound.mold();
  for (const j of S.jellies) {
    S.stage.scene.remove(j.group);
    try { j.dispose(); } catch (e) {}
  }
  S.jellies = [];
  const built = g.buildMold(kind, S.colorId);
  const jelly = new JellyBody(built.mesh, {
    firmness: 100 - S.softness * 75,
    damping: (1 - S.bounciness) * 50,
    jiggle: S.jiggle * 100
  });
  S.stage.scene.add(jelly.group);
  S.jellies.push(jelly);
  S.cuts = 0;
  const names = { star: '星星', circle: '圆形', heart: '爱心' };
  toast(`变成${names[kind]}形啦 ⭐`);
  const cc = $('#cut-count'); if (cc) cc.textContent = '已切成 1 块';
  updateDataBar(S.gameId);
}

/* ---------------- 启动 ---------------- */
route();
