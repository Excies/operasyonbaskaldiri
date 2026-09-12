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

let currentVotes = 0;

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
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = 'u/' + v.name;
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = formatTime(v.time);
    li.appendChild(name);
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

voteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  if (!username) return;

  voteBtn.disabled = true;
  setMsg('GÖNDERİLİYOR...', 'info');
  try {
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg('❌ ' + data.error, 'err');
      message.classList.add('shake');
      setTimeout(() => message.classList.remove('shake'), 600);
      voteBtn.disabled = false;
      return;
    }
    usernameInput.value = '';
    setMsg('✓ DİRENİŞTESİN — OY BAŞARILI', 'ok');
    bigArrow.classList.remove('jump');
    void bigArrow.offsetWidth;
    bigArrow.classList.add('jump');
    spawnConfetti();
    render(data);
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
setInterval(refresh, 15000);