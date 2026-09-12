const GOAL = 1000;

const voteCount = document.getElementById('voteCount');
const voteForm = document.getElementById('voteForm');
const usernameInput = document.getElementById('username');
const voteBtn = document.getElementById('voteBtn');
const message = document.getElementById('message');
const voterList = document.getElementById('voterList');
const voterTotal = document.getElementById('voterTotal');
const barFill = document.getElementById('barFill');
const goalText = document.getElementById('goalText');
const bigArrow = document.getElementById('bigArrow');
const themeBtn = document.getElementById('themeBtn');
const captchaQ = document.getElementById('captchaQ');
const captchaA = document.getElementById('captchaA');
const hpName = document.getElementById('hpName');

let currentVotes = 0;
let captchaId = null;
let captchaSig = '';
let captchaTs = '';

/* —— Tema (açık / koyu / operasyon) —— */
const THEMES = ['light', 'dark', 'operation'];
const THEME_ICON = {
  light: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-14.5v2m0 14v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1.5 12h2m17 0h2M4.2 19.8l1.4-1.4m12.8-12.8 1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>',
  operation: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1" opacity=".5"/><path fill="none" stroke="currentColor" stroke-width="1" d="M12 5V3M12 21v-2M19 12h2M3 12h2"/></svg>'
};

let theme = localStorage.getItem('baskaldiri.theme');
if (!theme || !THEMES.includes(theme)) {
  theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(t) {
  theme = t;
  document.documentElement.dataset.theme = t;
  themeBtn.innerHTML = THEME_ICON[t];
  themeBtn.title = 'Tema: ' + t.toUpperCase() + ' (tıkla: değiştir)';
  localStorage.setItem('baskaldiri.theme', t);
}

themeBtn.addEventListener('click', () => {
  applyTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
});

applyTheme(theme);

function setMsg(text, type) {
  message.className = 'msg ' + (type || '');
  message.textContent = text;
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function updateGoal(votes) {
  const pct = Math.min(100, Math.round(votes / GOAL * 100));
  barFill.style.width = pct + '%';
  goalText.innerHTML = '<b>' + pct + '%</b> HEDEFE / ' + GOAL.toLocaleString('tr-TR') + ' DİRENİŞÇİ';
}

function animateCount(target) {
  const from = currentVotes;
  const dur = 700;
  const t0 = performance.now();
  voteCount.classList.remove('pop');
  void voteCount.offsetWidth;
  voteCount.classList.add('pop');
  function tick(now) {
    const t = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    voteCount.textContent = Math.round(from + (target - from) * eased).toLocaleString('tr-TR');
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  currentVotes = target;
}

function render(data) {
  animateCount(data.votes);
  updateGoal(data.votes);
  voterTotal.textContent = '(' + data.voters.length + ')';
  voterList.innerHTML = '';
  data.voters.forEach((v, i) => {
    const li = document.createElement('li');
    li.style.animationDelay = Math.min(i, 20) * 30 + 'ms';
    const left = document.createElement('span');
    left.className = 'left';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = 'u/' + v.name;
    left.appendChild(name);
    if (v.badge) {
      const pill = document.createElement('span');
      pill.className = 'badge-pill ' + v.badge.cls;
      pill.textContent = v.badge.text;
      left.appendChild(pill);
    }
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = formatTime(v.time);
    li.appendChild(left);
    li.appendChild(time);
    voterList.appendChild(li);
  });
}

function spawnConfetti() {
  const colors = ['#FF4500', '#FFB300', '#39d353', '#0079d3', '#ff3333', '#8a2be2'];
  for (let i = 0; i < 28; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.width = 6 + Math.random() * 8 + 'px';
    c.style.height = 8 + Math.random() * 6 + 'px';
    c.style.animationDuration = 1.5 + Math.random() * 1.8 + 's';
    c.style.animationDelay = Math.random() * 0.3 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4000);
  }
}

async function refresh() {
  try {
    const res = await fetch('/api/votes');
    render(await res.json());
  } catch (e) { /* sessiz */ }
}

/* —— Matematik captcha —— */
const captchaRefresh = document.getElementById('capRefresh');

async function loadCaptcha() {
  try {
    const res = await fetch('/api/captcha');
    const d = await res.json();
    captchaId = d.id;
    captchaSig = d.sig || '';
    captchaTs = d.ts || '';
    captchaQ.textContent = d.q;
    captchaA.value = '';
    captchaA.focus();
  } catch (e) {
    captchaQ.textContent = 'FORMU YENİLE';
  }
}

captchaRefresh.addEventListener('click', loadCaptcha);

voteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const answer = captchaA.value.trim();
  if (!username) return;
  if (!captchaId || !answer) {
    setMsg('☝ SONUCU YAZ, DOĞRULAMAYI TAMAMLA', 'info');
    captchaA.focus();
    return;
  }

  voteBtn.disabled = true;
  setMsg('GÖNDERİLİYOR...', 'info');
  try {
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        captchaId,
        captchaAnswer: answer,
        captchaSig,
        captchaTs,
        hp: hpName.value
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg('❌ ' + data.error, 'err');
      message.classList.add('shake');
      setTimeout(() => message.classList.remove('shake'), 600);
      loadCaptcha();
      voteBtn.disabled = false;
      return;
    }
    usernameInput.value = '';
    bigArrow.classList.remove('jump');
    void bigArrow.offsetWidth;
    bigArrow.classList.add('jump');
    spawnConfetti();
    render(data);
    if (data.yourBadge) {
      setMsg('🏆 ' + data.yourBadge.text + ' ÖZEL ROZETİNİ KAZANDIN!', 'ok');
    } else {
      setMsg('✓ DİRENİŞTESİN — OY BAŞARILI', 'ok');
    }
    loadCaptcha();
  } catch (err) {
    setMsg('❌ SUNUCUYA ULAŞILAMADI', 'err');
    message.classList.add('shake');
    setTimeout(() => message.classList.remove('shake'), 600);
  }
  voteBtn.disabled = false;
  usernameInput.focus();
});

const bg = document.getElementById('bg');
function spawnArrows() {
  for (let i = 0; i < 18; i++) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'float-arrow');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', 'M12 2l10 13H2l10-13z');
    s.appendChild(path);
    const size = 20 + Math.random() * 40;
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.style.left = Math.random() * 100 + 'vw';
    s.style.animationDuration = 9 + Math.random() * 12 + 's';
    s.style.animationDelay = `-${Math.random() * 20}s`;
    bg.appendChild(s);
  }
}
spawnArrows();

refresh();
loadCaptcha();
setInterval(refresh, 15000);