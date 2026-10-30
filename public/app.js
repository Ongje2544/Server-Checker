import { ICONS } from './icons.js';

const ic = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const VIEWS = {
  dashboard: { label: 'Dashboard', sub: 'ภาพรวมสถานะทุกเครื่อง', icon: 'layout-dashboard' },
  monitor: { label: 'Server Monitor', short: 'Monitor', sub: 'รายการเครื่องทั้งหมด เพิ่มและแก้ไขเครื่องได้ที่นี่', icon: 'server' },
  map: { label: 'PC Location Map', short: 'Map', sub: 'ดูตำแหน่งเครื่องในห้องและสั่งงานจากแผนผัง', icon: 'map' },
  console: { label: 'Console', sub: 'รันคำสั่งบนเครื่องผ่าน SSH หรือ Windows Remote', icon: 'terminal' },
  remote: { label: 'Remote', sub: 'ดูและควบคุมหน้าจอเครื่องปลายทาง', icon: 'screen-share' },
  schedule: { label: 'Schedule', sub: 'ตั้งเวลาเปิด ปิด หรือรีสตาร์ทอัตโนมัติ', icon: 'calendar-clock' },
  settings: { label: 'Settings', sub: 'ตั้งค่าการทำงานของโปรแกรม', icon: 'settings' },
};
const ACTION_LABEL = { start: 'เปิดเครื่อง', stop: 'ปิดเครื่อง', restart: 'รีสตาร์ท' };
const PENDING_LABEL = { start: 'กำลังเปิด', stop: 'กำลังปิด', restart: 'กำลังรีสตาร์ท' };
const STATUS_LABEL = { online: 'ONLINE', offline: 'OFFLINE', unknown: 'UNKNOWN' };
const ZONES = ['LEFT A', 'LEFT B', 'RIGHT A', 'RIGHT B', 'END'];
const DAY_LABEL = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const CONTROL_TEMPLATES = {
  none: { type: 'none' },
  ssh: { type: 'ssh', user: 'root', port: 22, keyPath: 'C:\\Users\\you\\.ssh\\id_ed25519' },
  windows: { type: 'windows' },
  proxmox: { type: 'proxmox', apiUrl: 'https://pve.example.local:8006', node: 'pve1', vmid: 101, kind: 'qemu', tokenEnv: 'VPSMON_PROXMOX_TOKEN' },
  http: {
    type: 'http',
    actions: {
      start: { method: 'POST', url: 'https://api.example.com/v1/servers/ID/start', headers: { Authorization: 'Bearer ${VPSMON_API_TOKEN}' } },
      stop: { method: 'POST', url: 'https://api.example.com/v1/servers/ID/stop', headers: { Authorization: 'Bearer ${VPSMON_API_TOKEN}' } },
      restart: { method: 'POST', url: 'https://api.example.com/v1/servers/ID/reboot', headers: { Authorization: 'Bearer ${VPSMON_API_TOKEN}' } },
    },
  },
};

const QUICK_COMMANDS = ['hostname', 'uptime', 'df -h', 'free -m', 'whoami', 'date'];
const RISKY_COMMAND = /\b(rm\s+-\w*r|mkfs|dd\s+if=|shutdown|reboot|poweroff|halt|format\s+\w:|del\s+\/|rd\s+\/s)/i;
const MENU_ICON = { start: 'power', stop: 'square', restart: 'rotate-cw', radmin: 'screen-share', info: 'info' };
const px = (x, y, w, h, fill, cls = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${cls ? ` class="${cls}"` : ''}/>`;
// Every trader is the same body; the robe and headwear tell the trades apart.
const PROFESSIONS = [
  { name: 'ชาวนา', robe: '#8a6a3f', sleeve: '#755832', extra: px(8, 11, 4, 8, '#d9c79a'), hat: px(2, 2, 12, 1, '#d9b44a') + px(4, 0, 8, 2, '#e6c766') },
  { name: 'บรรณารักษ์', robe: '#e9e4d6', sleeve: '#cfc8b5', extra: px(11, 13, 3, 3, '#b3362e'), hat: px(4, 0, 8, 2, '#b3362e') + px(8, 4, 5, 1, '#2d2d33') },
  { name: 'ช่างตีเหล็ก', robe: '#4a4f58', sleeve: '#3a3e46', extra: px(8, 11, 4, 8, '#23252b'), hat: px(4, 1, 8, 1, '#23252b') },
  { name: 'คนขายเนื้อ', robe: '#c9574f', sleeve: '#a9443d', extra: px(7, 11, 5, 8, '#f4f1ea'), hat: px(4, 2, 8, 1, '#f4f1ea') },
  { name: 'ชาวประมง', robe: '#3f7f8f', sleeve: '#316876', extra: px(8, 12, 4, 7, '#c2a56b'), hat: px(3, 2, 10, 1, '#2d6371') + px(4, 0, 8, 2, '#3f7f8f') },
  { name: 'นักบวช', robe: '#7a4fa3', sleeve: '#623d87', extra: px(9, 11, 2, 8, '#e3c95c'), hat: px(3, 1, 10, 2, '#623d87') + px(3, 3, 1, 5, '#623d87') },
];

function hash(text) {
  return [...String(text)].reduce((sum, ch) => (Math.imul(sum, 31) + ch.codePointAt(0)) | 0, 7) >>> 0;
}

const professionOf = (m) => PROFESSIONS[hash(m.id) % PROFESSIONS.length];

function npcSvg(p) {
  return `<svg class="npc" viewBox="0 0 16 24" shape-rendering="crispEdges" aria-hidden="true">
    ${px(5, 19, 3, 4, '#3b2a20', 'leg-a')}${px(8, 19, 3, 4, '#2f2119', 'leg-b')}
    ${px(4, 10, 8, 10, p.robe)}${p.extra}
    ${px(5, 14, 8, 3, p.sleeve)}${px(12, 14, 2, 3, '#bd8b72')}
    <g class="head">${px(4, 2, 8, 8, '#bd8b72')}${px(4, 2, 2, 8, '#a97a63')}
      ${px(12, 5, 2, 4, '#a0735c')}${px(8, 4, 4, 1, '#4a2f23')}
      ${px(9, 5, 2, 2, '#fff')}${px(10, 5, 1, 2, '#2f7a3b', 'eye')}${p.hat}</g>
  </svg>`;
}

function bedSvg() {
  return `<svg class="bed" viewBox="0 0 30 20" shape-rendering="crispEdges" aria-hidden="true">
    ${px(0, 13, 30, 4, '#8a6238')}${px(0, 17, 2, 3, '#6f4e2c')}${px(28, 17, 2, 3, '#6f4e2c')}${px(0, 8, 2, 9, '#6f4e2c')}
    ${px(2, 8, 8, 5, '#f4f1ea')}
    <g class="sleeper">${px(3, 3, 7, 7, '#bd8b72')}${px(5, 1, 3, 2, '#a0735c')}${px(4, 6, 2, 1, '#4a2f23')}${px(7, 6, 2, 1, '#4a2f23')}</g>
    ${px(10, 7, 20, 6, '#c8372f')}${px(10, 7, 6, 6, '#e8e3d6')}${px(10, 12, 20, 1, '#9e2822')}
  </svg>`;
}

// Stable per machine, so a redraw matches the DOM and the walk is not restarted.
function actor(m) {
  const seed = hash(m.id);
  const style = `--delay:-${(seed % 90) / 10}s;--walk:${9 + seed % 6}s`;
  if (m.status === 'offline' && displayStatus(m) !== 'pending') {
    return `<i class="stage asleep">${bedSvg()}<b class="zzz">z</b><b class="zzz">z</b><b class="zzz">z</b></i>`;
  }
  const bubble = displayStatus(m) === 'unknown' ? '<b class="bubble">?</b>' : '';
  return `<i class="stage" style="${style}">${npcSvg(professionOf(m))}${bubble}</i>`;
}

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateFmt = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const timeFmt = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '-');
const fmtTime = (iso) => (iso ? timeFmt.format(new Date(iso)) : '-');

const ui = { view: 'map', selected: null, search: '', filter: 'all', state: null };
const term = { lines: [], history: [], cursor: 0, abort: null };
const vnc = { rfb: null, status: 'ยังไม่ได้เชื่อมต่อ' };

const displayStatus = (m) => (m.busy || m.transition ? 'pending' : m.status);
const statusText = (m) => {
  const pending = m.busy ?? m.transition?.action;
  return pending ? PENDING_LABEL[pending] : STATUS_LABEL[m.status];
};
const locationText = (m) => (m.zone === 'END' ? `END / ช่อง ${m.slot}` : `${m.zone} / ชั้น ${m.floor} / ช่อง ${m.slot}`);

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-VPS-Monitor': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `ผิดพลาด (${res.status})`);
  return data;
}

let toastTimer;
function toast(message, bad = false) {
  const el = $('#toast');
  el.innerHTML = `<b>${bad ? 'เกิดข้อผิดพลาด!' : 'สำเร็จ!'}</b>${esc(message)}`;
  el.className = `toast show${bad ? ' bad' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
}

function renderNav() {
  $('#nav').innerHTML = Object.entries(VIEWS).map(([key, v]) => `
    <button class="nav-item${ui.view === key ? ' active' : ''}" data-view="${key}" ${ui.view === key ? 'aria-current="page"' : ''}>
      ${ic(v.icon)}${esc(v.short ?? v.label)}
    </button>`).join('');
  const v = VIEWS[ui.view];
  $('#page-title').textContent = v.label;
  $('#page-sub').textContent = v.sub;
  $('#page-icon').innerHTML = ic(v.icon);
}

function renderHeader() {
  const { machines, serverTime } = ui.state;
  const count = (status) => machines.filter((m) => m.status === status).length;
  $('#k-online').textContent = count('online');
  $('#k-offline').textContent = count('offline');
  $('#k-total').textContent = machines.length;
  $('#updated').textContent = fmtDate(serverTime);
  const demo = machines.filter((m) => m.demo).length;
  const note = $('#demo-note');
  note.hidden = demo === 0;
  note.textContent = `${demo} จาก ${machines.length} เครื่องเป็นข้อมูลจำลอง ผลและคำสั่งยังไม่เกี่ยวกับเครื่องจริง เพิ่มเครื่องจริงได้ที่หน้า Monitor และลบเครื่องจำลองได้ที่หน้า Settings`;
  document.title = count('offline') ? `(${count('offline')} ออฟไลน์) Server Monitor` : 'Server Monitor';
  updateXp();
}

function replay(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

// Restarts only on a new ping round: the fast checks during a power command
// also touch lastCheck, and must not reset the bar every few seconds.
function updateXp() {
  const { machines, settings } = ui.state;
  const newest = Math.max(0, ...machines.map((m) => Date.parse(m.lastCheck ?? 0) || 0));
  if (newest - (ui.xpRound ?? 0) < settings.intervalSec * 800) return;
  ui.xpRound = newest;
  const bar = $('#xp-fill');
  bar.style.animationDuration = `${settings.intervalSec}s`;
  replay(bar, 'run');
}

function tile(m) {
  const status = displayStatus(m);
  const selected = ui.selected === m.id && (ui.drawer || ui.menuOpen) ? ' selected' : '';
  return `<button class="tile ${status}${selected}" data-machine="${esc(m.id)}" data-status="${status}" data-slot="${m.zone}|${m.floor}|${m.slot}" title="${esc(m.name)}" aria-label="${esc(m.name)} ${esc(statusText(m))}">
    ${actor(m)}<span>${esc(m.name)}</span>
  </button>`;
}

function slotTile(zone, floor, slot) {
  const m = ui.state.machines.find((x) => x.zone === zone && x.floor === floor && x.slot === slot);
  if (m) return tile(m);
  const place = zone === 'END' ? `END ช่อง ${slot}` : `${zone} ชั้น ${floor} ช่อง ${slot}`;
  return `<button class="tile add" data-slot="${zone}|${floor}|${slot}" data-add-zone="${zone}" data-add-floor="${floor}" data-add-slot="${slot}" aria-label="เพิ่มเครื่องที่ ${place}" title="เพิ่มเครื่องที่ ${place}">
    ${ic('plus')}
  </button>`;
}

function renderMap() {
  const rack = (zone) => {
    const shelves = [4, 3, 2, 1].map((floor) => (
      `<div class="shelf">${slotTile(zone, floor, 1)}${slotTile(zone, floor, 2)}</div>`));
    return `<div class="rack" style="grid-column:${{ 'LEFT A': 2, 'LEFT B': 3, 'RIGHT A': 5, 'RIGHT B': 6 }[zone]}">${shelves.join('')}</div>`;
  };
  const head = (zone, col) => `<div class="zone-head" style="grid-column:${col}"><span class="zone-label">${zone}</span></div>`;
  const floors = (col) => `<div class="floors" style="grid-column:${col}">${[4, 3, 2, 1].map((f) => `<span>ชั้น ${f}</span>`).join('')}</div>`;
  const end = [1, 2, 3, 4].map((slot) => slotTile('END', 0, slot));
  return `<div class="room-scroll"><div class="room">
    ${head('LEFT A', 2)}${head('LEFT B', 3)}
    <div class="bay zone"><span class="zone-label">END (ชั้นท้ายห้อง)</span><div class="bay-rack">${end.join('')}</div></div>
    ${head('RIGHT A', 5)}${head('RIGHT B', 6)}
    ${floors(1)}${rack('LEFT A')}${rack('LEFT B')}
    <div class="aisle"><i>↑</i>ทางเดิน<i>↓</i></div>
    ${rack('RIGHT A')}${rack('RIGHT B')}${floors(7)}
    <div class="compass">N ↑</div>
    <div class="door"><span>ประตูทางเข้า</span></div>
  </div></div>`;
}

// Swaps only the blocks that changed. Rebuilding the room on every update
// would restart all block animations a few times a second.
function patchMap() {
  const holder = document.createElement('div');
  for (const el of document.querySelectorAll('.room .tile')) {
    const [zone, floor, slot] = el.dataset.slot.split('|');
    holder.innerHTML = slotTile(zone, Number(floor), Number(slot));
    const next = holder.firstElementChild;
    if (next.className === el.className.replace(/ (pop|hit)\b/g, '') && next.innerHTML === el.innerHTML) continue;
    const focused = document.activeElement === el;
    const changed = next.dataset.status !== el.dataset.status;
    el.replaceWith(next);
    if (changed) next.classList.add(next.dataset.status === 'offline' ? 'hit' : 'pop');
    if (focused) next.focus();
  }
}

function renderTableRows() {
  const q = ui.search.trim().toLowerCase();
  const rows = ui.state.machines.filter((m) => {
    const matches = !q || [m.name, m.host, m.owner, m.zone].some((v) => String(v).toLowerCase().includes(q));
    return matches && (ui.filter === 'all' || m.status === ui.filter);
  });
  if (!rows.length) return '<tr><td colspan="9" class="empty">ไม่พบเครื่องที่ตรงเงื่อนไข</td></tr>';
  return rows.map((m) => `<tr class="row-link${ui.selected === m.id && (ui.drawer || ui.menuOpen) ? ' selected' : ''}" data-machine="${esc(m.id)}">
    <td><i class="dot ${displayStatus(m)}"></i> ${esc(statusText(m))}</td>
    <td><strong>${esc(m.name)}</strong></td>
    <td class="num">${esc(m.host || '-')}</td>
    <td>${esc(locationText(m))}</td>
    <td class="num">${m.latencyMs == null ? '-' : `${esc(m.latencyMs)} ms`}</td>
    <td class="num">${esc(fmtTime(m.lastSeen))}</td>
    <td>${esc(m.owner || '-')}</td>
    <td>${esc(m.demo ? 'จำลอง' : m.control.type)}${m.wake ? ' + WoL' : ''}</td>
    <td class="row-actions"><button class="icon-btn" data-edit="${esc(m.id)}" aria-label="แก้ไข ${esc(m.name)}" title="แก้ไขเครื่อง">${ic('pencil')}</button></td>
  </tr>`).join('');
}

function tableShell() {
  return `<div class="toolbar">
    <label class="search">${ic('search')}<input id="search" type="search" placeholder="ค้นหาชื่อ, IP, ผู้ใช้งาน" aria-label="ค้นหา" value="${esc(ui.search)}"></label>
    <select id="filter" aria-label="กรองสถานะ">
      ${[['all', 'ทุกสถานะ'], ['online', 'ออนไลน์'], ['offline', 'ออฟไลน์'], ['unknown', 'ไม่ทราบสถานะ']]
    .map(([v, l]) => `<option value="${v}"${ui.filter === v ? ' selected' : ''}>${l}</option>`).join('')}
    </select>
    <button class="btn primary spacer" id="add-machine">${ic('plus')}เพิ่มเครื่อง</button>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>สถานะ</th><th>เครื่อง</th><th>IP</th><th>ตำแหน่ง</th><th>Latency</th><th>ออนไลน์ล่าสุด</th><th>ผู้ใช้งาน</th><th>วิธีควบคุม</th><th></th></tr></thead>
    <tbody id="rows">${renderTableRows()}</tbody>
  </table></div>`;
}

function eventLine(e) {
  const action = e.action ? `${ACTION_LABEL[e.action]}: ` : '';
  const actor = e.actor === 'schedule' ? ' (ตั้งเวลา)' : '';
  return `<li><time>${esc(fmtTime(e.ts))}</time><span class="${e.ok ? '' : 'bad'}"><strong>${esc(e.machine)}</strong> ${esc(action)}${esc(e.message)}${actor}</span></li>`;
}

function renderDashboard() {
  const { machines, events } = ui.state;
  const bars = ZONES.map((zone) => {
    const items = machines.filter((m) => m.zone === zone);
    const n = items.length || 1;
    const pct = (s) => (items.filter((m) => m.status === s).length / n) * 100;
    const online = items.filter((m) => m.status === 'online').length;
    return `<div class="zone-bar"><span>${zone}</span>
      <div class="track" role="img" aria-label="${zone} ออนไลน์ ${online} จาก ${items.length}">
        <i style="width:${pct('online')}%;background:var(--online)"></i>
        <i style="width:${pct('offline')}%;background:var(--offline)"></i>
        <i style="width:${pct('unknown')}%;background:var(--unknown)"></i>
      </div><span>${online}/${items.length}</span></div>`;
  }).join('');
  const problems = machines.filter((m) => m.status !== 'online');
  return `<div class="grid-2">
    <div class="card"><h2>${ic('gauge')}ความพร้อมแต่ละโซน</h2>${bars}</div>
    <div class="card"><h2>${ic('triangle-alert')}เครื่องที่ต้องตรวจสอบ (${problems.length})</h2>
      ${problems.length ? `<div class="table-wrap"><table><tbody>${problems.map((m) => `
        <tr class="row-link" data-machine="${esc(m.id)}"><td><i class="dot ${m.status}"></i> ${esc(m.name)}</td><td class="num">${esc(m.host || 'ยังไม่ตั้ง IP')}</td><td>${esc(locationText(m))}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="empty">ทุกเครื่องออนไลน์</p>'}
    </div>
    <div class="card full" style="grid-column:1/-1"><h2>${ic('list-tree')}เหตุการณ์ล่าสุด</h2>
      ${events.length ? `<ul class="mini-log">${events.slice(0, 15).map(eventLine).join('')}</ul>` : '<p class="empty">ยังไม่มีเหตุการณ์</p>'}
    </div>
  </div>`;
}

function renderSchedule() {
  const { machines, schedules } = ui.state;
  const rows = schedules.map((s) => `<tr>
    <td>${esc(machines.find((m) => m.id === s.machineId)?.name ?? '-')}</td><td>${esc(ACTION_LABEL[s.action])}</td><td class="num">${esc(s.time)}</td>
    <td>${s.days.map((d) => DAY_LABEL[d]).join(' ')}</td>
    <td><button class="btn" data-sch-toggle="${esc(s.id)}" data-enabled="${s.enabled}">${s.enabled ? 'เปิดใช้อยู่' : 'ปิดอยู่'}</button></td>
    <td><button class="btn" data-sch-del="${esc(s.id)}">${ic('trash-2')}ลบ</button></td>
  </tr>`).join('');
  return `<div class="card"><h2>${ic('plus')}เพิ่มตารางเวลา</h2>
    <form id="sch-form" class="form">
      <label>เครื่อง<select name="machineId">${machines.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></label>
      <label>คำสั่ง<select name="action">${Object.entries(ACTION_LABEL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>เวลา<input name="time" type="time" value="03:00" required></label>
      <div class="full"><span class="hint">วันที่ทำงาน</span><div class="days">
        ${DAY_LABEL.map((d, i) => `<label><input type="checkbox" name="day" value="${i}" ${i > 0 && i < 6 ? 'checked' : ''}>${d}</label>`).join('')}
      </div></div>
      <div class="full"><button class="btn primary">${ic('plus')}เพิ่มตารางเวลา</button></div>
    </form>
  </div>
  <div class="card"><h2>${ic('calendar-clock')}ตารางเวลาทั้งหมด</h2>
    ${rows ? `<div class="table-wrap"><table><thead><tr><th>เครื่อง</th><th>คำสั่ง</th><th>เวลา</th><th>วัน</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="empty">ยังไม่มีตารางเวลา</p>'}
    <p class="hint">ตารางเวลาทำงานเมื่อโปรแกรมเปิดอยู่เท่านั้น และจะข้ามถ้าเครื่องอยู่ในสถานะนั้นแล้ว</p>
  </div>`;
}

function renderSettings() {
  const { settings, machines } = ui.state;
  const demo = machines.filter((m) => m.demo).length;
  const theme = document.documentElement.dataset.theme;
  const pick = (value, name, label) => `<button class="theme-pick${theme === value ? ' active' : ''}" data-set-theme="${value}">${ic(name)}${label}</button>`;
  return `<div class="settings-grid">
    <section class="card"><h2>${ic('activity')}การตรวจสอบ</h2>
      <p class="hint">ใช้กับทุกเครื่อง ถ้าจะเพิ่มหรือแก้ไขเครื่องให้ไปที่หน้า Monitor หรือกด + บนแผนผัง</p>
      <form id="settings-form" class="form">
        <label>ตรวจสอบทุก (วินาที)<input name="intervalSec" type="number" min="5" max="3600" value="${settings.intervalSec}" required></label>
        <label>Ping timeout (มิลลิวินาที)<input name="pingTimeoutMs" type="number" min="200" max="10000" value="${settings.pingTimeoutMs}" required></label>
        <label>นับว่าออฟไลน์เมื่อไม่ตอบติดกัน (ครั้ง)<input name="failThreshold" type="number" min="1" max="20" value="${settings.failThreshold}" required></label>
        <label>รอผลคำสั่งได้นานสุด (วินาที)<input name="transitionTimeoutSec" type="number" min="30" max="1800" value="${settings.transitionTimeoutSec}" required></label>
        <div class="full"><button class="btn primary">${ic('save')}บันทึก</button></div>
      </form>
    </section>
    <section class="card"><h2>${ic('palette')}การแสดงผล</h2>
      <p class="hint">เลือกธีมของโปรแกรม ระบบจำค่านี้ไว้ในเบราว์เซอร์เครื่องนี้</p>
      <div class="theme-picks">${pick('light', 'sun', 'สว่าง')}${pick('dark', 'moon', 'มืด')}</div>
    </section>
    <section class="card"><h2>${ic('database')}ข้อมูลตัวอย่าง</h2>
      ${demo ? `<p class="hint">มีเครื่องจำลอง ${demo} เครื่อง ลบออกแล้วช่องบนแผนผังจะว่างเป็นรูป + พร้อมเพิ่มเครื่องจริง เครื่องจริงที่เพิ่มไว้จะไม่ถูกลบ</p>
      <button class="btn danger" id="clear-demo">${ic('trash-2')}ลบเครื่องจำลองทั้งหมด</button>` : '<p class="hint">ไม่มีเครื่องจำลองแล้ว ทุกเครื่องในระบบเป็นเครื่องจริง</p>'}
    </section>
  </div>`;
}

function machineOptions(items) {
  return items.map((m) => `<option value="${esc(m.id)}"${ui.selected === m.id ? ' selected' : ''}>${esc(m.name)}${m.demo ? ' (จำลอง)' : ''} ${m.host ? `· ${esc(m.host)}` : ''}</option>`).join('');
}

function renderConsole() {
  const items = ui.state.machines.filter((m) => m.access.exec);
  if (!items.length) {
    return '<div class="card empty">ยังไม่มีเครื่องที่รันคำสั่งได้ ตั้งวิธีควบคุมเป็น ssh หรือ windows ได้ที่ปุ่มแก้ไขในหน้า Monitor</div>';
  }
  if (!items.some((m) => m.id === ui.selected)) ui.selected = items[0].id;
  return `<div class="toolbar">
    <select id="target" aria-label="เลือกเครื่อง">${machineOptions(items)}</select>
    <div class="chips">${QUICK_COMMANDS.map((c) => `<button class="chip" data-cmd="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <button class="btn spacer" id="console-clear">${ic('eraser')}ล้างหน้าจอ</button>
  </div>
  <div class="term-window">
    <div class="term-bar"><span>console.sh</span></div>
    <div class="term" id="term" role="log" aria-live="polite">${term.lines.map(termLine).join('')}</div>
    <form class="term-input" id="console-form">
      <span>$</span>
      <input id="console-input" autocomplete="off" spellcheck="false" maxlength="4000" aria-label="คำสั่ง" placeholder="พิมพ์คำสั่งแล้วกด Enter">
      <button class="btn primary" id="console-run" ${term.abort ? 'hidden' : ''}>${ic('play')}รัน</button>
      <button type="button" class="btn danger" id="console-stop" ${term.abort ? '' : 'hidden'}>${ic('square')}หยุด</button>
    </form>
  </div>
  <p class="hint">คำสั่งหมดเวลาใน 120 วินาที ใช้ได้กับคำสั่งที่ไม่ต้องตอบโต้ และทุกคำสั่งถูกบันทึกใน audit log อย่าใส่รหัสผ่านในคำสั่ง</p>`;
}

const TOKEN = new RegExp([
  /(?<str>"[^"\n]*"|'[^'\n]*')/,
  /(?<tag><\/?[A-Za-z][\w-]*|\/?>)/,
  /(?<attr>\b[\w-]+(?==))/,
  /(?<url>https?:\/\/[^\s"'<>]+)/,
  /(?<ip>\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b)/,
  /(?<path>(?:\b[A-Za-z]:\\|~\/|\.{0,2}\/)[^\s"'<>:]*)/,
  /(?<bad>\b(?:error|errors|failed|failure|fatal|denied|refused|timeout)\b)/,
  /(?<good>\b(?:ok|success|active|running|enabled)\b)/,
  /(?<flag>(?<=\s)--?[A-Za-z][\w-]*)/,
  /(?<key>^\s*[\w.-]+(?=:))/,
  /(?<num>\b\d+(?:\.\d+)?(?:%|ms|[KMGT]i?B?|[KMGT])?(?![\w.]))/,
  /(?<punct>[{}()[\]=,;:])/,
].map((part) => part.source).join('|'), 'gi');

function tokenClass(groups, text) {
  const [name] = Object.entries(groups).find(([, value]) => value !== undefined);
  if (name === 'str') return /[/\\]|\.\w+["']$/.test(text) ? 'tk-str tk-link' : 'tk-str';
  if (name === 'url') return 'tk-fn tk-link';
  return `tk-${name}`;
}

function highlight(text) {
  let html = '';
  let cursor = 0;
  for (const match of text.matchAll(TOKEN)) {
    html += esc(text.slice(cursor, match.index));
    html += `<span class="${tokenClass(match.groups, match[0])}">${esc(match[0])}</span>`;
    cursor = match.index + match[0].length;
  }
  return html + esc(text.slice(cursor));
}

function lineHtml(kind, text) {
  if (kind === 'cmd') {
    const at = text.indexOf(' $ ');
    const [word, ...rest] = text.slice(at + 3).split(' ');
    return `<span class="tk-prompt">${esc(text.slice(0, at))}</span> <span class="tk-punct">$</span> <span class="tk-fn">${esc(word)}</span>${rest.length ? ` ${highlight(rest.join(' '))}` : ''}`;
  }
  if (kind === 'ok') return `<span class="tk-comment">${esc(text)}</span>`;
  const indent = text.match(/^ {2,}/)?.[0] ?? '';
  const body = highlight(text.slice(indent.length));
  return (indent ? `<span class="indent">${indent}</span>` : '') + (body || '&#8203;');
}

function termLine({ kind, text }) {
  return `<div class="ln t-${kind}">${lineHtml(kind, text)}</div>`;
}

// Output arrives in chunks that can end mid-line, so the last line stays open
// until a newline closes it.
function termWrite(kind, text) {
  const el = $('#term');
  const parts = text.split('\n');
  const closed = parts.pop() === '';
  if (!closed) parts.push(text.slice(text.lastIndexOf('\n') + 1));
  parts.forEach((part, index) => {
    const last = term.lines.at(-1);
    if (index === 0 && term.open && last?.kind === kind) {
      last.text += part;
      if (el?.lastElementChild) el.lastElementChild.innerHTML = lineHtml(kind, last.text);
    } else {
      term.lines.push({ kind, text: part });
      el?.insertAdjacentHTML('beforeend', termLine({ kind, text: part }));
    }
    term.open = false;
  });
  term.open = !closed;
  if (term.lines.length > 2000) term.lines.shift();
  if (el) el.scrollTop = el.scrollHeight;
}

function setRunning(running) {
  const run = $('#console-run');
  const stop = $('#console-stop');
  if (run) run.hidden = running;
  if (stop) stop.hidden = !running;
}

async function runConsole(command) {
  const m = ui.state.machines.find((x) => x.id === ui.selected);
  if (!m || term.abort) return;
  if (RISKY_COMMAND.test(command) && !window.confirm(`คำสั่งนี้อาจทำให้เครื่อง ${m.name} หยุดทำงานหรือข้อมูลหาย ต้องการรันต่อหรือไม่?\n\n${command}`)) return;
  term.history.push(command);
  term.cursor = term.history.length;
  termWrite('cmd', `${m.name} $ ${command}\n`);
  const abort = new AbortController();
  term.abort = abort;
  setRunning(true);
  try {
    const res = await fetch(`/api/machines/${encodeURIComponent(m.id)}/exec`, {
      method: 'POST', signal: abort.signal,
      headers: { 'Content-Type': 'application/json', 'X-VPS-Monitor': '1' },
      body: JSON.stringify({ command }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `ผิดพลาด (${res.status})`);
    let pending = '';
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        const msg = JSON.parse(line);
        if (msg.stream) termWrite(msg.stream, msg.data);
        else termWrite(msg.exit === 0 && !msg.note ? 'ok' : 'err', `[จบการทำงาน: exit ${msg.exit}${msg.note ? `, ${msg.note}` : ''}]\n\n`);
      }
    }
  } catch (err) {
    termWrite('err', `${err.name === 'AbortError' ? 'ยกเลิกแล้ว' : err.message}\n\n`);
  } finally {
    term.abort = null;
    setRunning(false);
    $('#console-input')?.focus();
  }
}

function renderRemote() {
  const items = ui.state.machines.filter((m) => m.access.vnc || m.access.rdp || m.access.radmin);
  if (!items.length) {
    return `<div class="card empty">ยังไม่มีเครื่องที่เปิดการควบคุมหน้าจอ<br>ไปที่หน้า Monitor กดแก้ไขเครื่อง แล้วใส่ VNC port หรือ RDP port</div>`;
  }
  if (!items.some((m) => m.id === ui.selected)) ui.selected = items[0].id;
  const m = items.find((x) => x.id === ui.selected);
  const connected = Boolean(vnc.rfb);
  return `<div class="toolbar">
    <select id="target" aria-label="เลือกเครื่อง" ${connected ? 'disabled' : ''}>${machineOptions(items)}</select>
    <button class="btn primary" id="vnc-connect" ${connected || !m.access.vnc ? 'disabled' : ''}>${ic('plug')}เชื่อมต่อหน้าจอ</button>
    <button class="btn danger" id="vnc-disconnect" ${connected ? '' : 'disabled'}>${ic('unplug')}ตัดการเชื่อมต่อ</button>
    <button class="btn" id="vnc-cad" ${connected ? '' : 'disabled'}>${ic('keyboard')}Ctrl+Alt+Del</button>
    <button class="btn" id="vnc-full" ${connected ? '' : 'disabled'}>${ic('maximize')}เต็มจอ</button>
    <label class="check"><input type="checkbox" id="vnc-view-only">ดูอย่างเดียว</label>
    <span class="spacer"></span>
    ${m.access.radmin ? `<button class="btn" id="radmin-open">${ic('screen-share')}เปิดด้วย Radmin</button>` : ''}
    ${m.access.rdp ? `<button class="btn" id="rdp-open">${ic('monitor-up')}เปิด Remote Desktop</button>
    <a class="btn" href="/api/machines/${encodeURIComponent(m.id)}/rdp-file">${ic('download')}ไฟล์ .rdp</a>` : ''}
  </div>
  <div class="vnc-frame"><div id="vnc-stage" class="vnc-stage"></div><p id="vnc-status" class="vnc-status">${esc(m.access.vnc ? vnc.status : 'เครื่องนี้ยังไม่ได้ใส่ VNC port จึงแสดงภาพในหน้านี้ไม่ได้ ใช้ปุ่มเปิดด้วย Radmin หรือใส่ VNC port ที่หน้า Monitor')}</p></div>
  <p class="hint">VNC ไม่เข้ารหัสระหว่างโปรแกรมนี้กับเครื่องปลายทาง ถ้าเครื่องอยู่นอกวง LAN ให้ใช้ผ่าน VPN หรือ SSH tunnel</p>`;
}

function setVncStatus(text) {
  vnc.status = text;
  const el = $('#vnc-status');
  if (el) {
    el.textContent = text;
    el.hidden = Boolean(vnc.rfb) && text === 'เชื่อมต่อแล้ว';
  }
}

function askVncPassword(types) {
  const dialog = $('#modal');
  dialog.innerHTML = `<form id="vnc-cred"><h2>รหัสผ่านหน้าจอ</h2>
    <div class="form">
      ${types.includes('username') ? '<label class="full">ชื่อผู้ใช้<input name="username" autocomplete="off"></label>' : ''}
      <label class="full">รหัสผ่าน<input name="password" type="password" autocomplete="off"></label>
    </div>
    <div class="modal-actions"><button class="btn primary">เชื่อมต่อ</button></div>
  </form>`;
  dialog.showModal();
  $('#vnc-cred').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    vnc.rfb?.sendCredentials({ username: f.username?.value, password: f.password.value });
    dialog.close();
  };
}

function vncDisconnect() {
  const { rfb } = vnc;
  vnc.rfb = null;
  rfb?.disconnect();
}

async function vncConnect() {
  const m = ui.state.machines.find((x) => x.id === ui.selected);
  if (!m?.access.vnc) return;
  setVncStatus('กำลังเชื่อมต่อ...');
  try {
    const { default: RFB } = await import('./vendor/novnc/core/rfb.js');
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const rfb = new RFB($('#vnc-stage'), `${scheme}://${location.host}/api/vnc/${encodeURIComponent(m.id)}`);
    rfb.scaleViewport = true;
    // Tuned for a wired LAN: bandwidth is plentiful, encoding time is what hurts.
    rfb.qualityLevel = 8;
    rfb.compressionLevel = 1;
    rfb.viewOnly = $('#vnc-view-only').checked;
    rfb.addEventListener('connect', () => {
      setVncStatus('เชื่อมต่อแล้ว');
      rfb.focus();
    });
    rfb.addEventListener('credentialsrequired', (e) => askVncPassword(e.detail.types));
    rfb.addEventListener('disconnect', (e) => {
      vnc.rfb = null;
      vnc.status = e.detail.clean ? 'ตัดการเชื่อมต่อแล้ว' : 'เชื่อมต่อไม่สำเร็จ ตรวจสอบว่าเปิด VNC และ port ถูกต้อง';
      if (ui.view === 'remote') renderView(true);
    });
    vnc.rfb = rfb;
    $('#vnc-connect').disabled = true;
    $('#target').disabled = true;
    for (const id of ['#vnc-disconnect', '#vnc-cad', '#vnc-full']) $(id).disabled = false;
  } catch (err) {
    setVncStatus(err.message);
  }
}

function sparkline(history) {
  if (history.length < 2) return '';
  const w = 300;
  const h = 44;
  const peak = Math.max(10, ...history.filter((v) => v != null));
  const x = (i) => (i / 29) * w;
  const y = (v) => h - 4 - (v / peak) * (h - 10);
  const line = history.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
  const losses = history.map((v, i) => (v == null ? `<rect x="${x(i).toFixed(1)}" y="0" width="6" height="${h}" fill="#ef4444" opacity=".45"/>` : '')).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Latency สูงสุด ${peak} ms">${losses}<polyline fill="none" stroke="#5aa2ff" stroke-width="2" vector-effect="non-scaling-stroke" points="${line}"/></svg>`;
}

function missingCapHint(m) {
  const missing = Object.keys(ACTION_LABEL).filter((a) => !m.capabilities[a]);
  if (!missing.length) return '';
  if (missing.includes('start') && m.capabilities.stop) {
    return 'เปิดเครื่องไม่ได้: เครื่องที่ดับอยู่รับคำสั่ง SSH/Windows ไม่ได้ ต้องเพิ่ม MAC สำหรับ Wake-on-LAN หรือควบคุมผ่าน Proxmox/API';
  }
  return 'ยังไม่ได้ตั้งวิธีควบคุม กด "แก้ไขชื่อ / ตั้งค่าเครื่อง" ด้านบน';
}

function powerDisabled(m, action) {
  if (displayStatus(m) === 'pending' || !m.capabilities[action]) return true;
  return action === 'start' ? m.status === 'online' : m.status === 'offline';
}

function openMenu(m, event, source) {
  ui.selected = m.id;
  ui.menuOpen = true;
  ui.menuSource = source;
  const item = (key, label, cls, disabled) => `<button role="menuitem" class="menu-item ${cls}" data-menu="${key}" ${disabled ? 'disabled' : ''}>
    ${ic(MENU_ICON[key])}${esc(label)}</button>`;
  const menu = $('#tile-menu');
  menu.innerHTML = `<div class="menu-head"><strong>${esc(m.name)}</strong><span class="badge ${displayStatus(m)}">${esc(statusText(m))}</span></div>
    ${item('start', 'เปิดเครื่อง', 'go', powerDisabled(m, 'start'))}
    ${item('stop', 'ปิดเครื่อง', 'danger', powerDisabled(m, 'stop'))}
    ${item('restart', 'รีสตาร์ท', 'warn', powerDisabled(m, 'restart'))}
    <hr>
    ${item('radmin', 'เปิดด้วย Radmin', '', !m.access.radmin)}
    ${item('info', 'คุณสมบัติ', '', false)}`;
  menu.hidden = false;
  // A keyboard click reports no pointer position, so anchor to the element.
  const box = source.getBoundingClientRect();
  const x = event.detail ? event.clientX : box.right;
  const y = event.detail ? event.clientY : box.top;
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
  replay(menu, 'enter');
  menu.querySelector('button:not(:disabled)').focus();
  renderView();
}

function closeMenu(restoreFocus = false) {
  if (!ui.menuOpen) return;
  ui.menuOpen = false;
  $('#tile-menu').hidden = true;
  renderView();
  if (restoreFocus && ui.selected) $(`[data-machine="${CSS.escape(ui.selected)}"]`)?.focus();
}

function openRadminFor(m) {
  api('POST', `/api/machines/${encodeURIComponent(m.id)}/radmin`)
    .then(() => toast(`เปิด Radmin ไปที่ ${m.name} แล้ว`), (err) => toast(err.message, true));
}

function closeDrawer() {
  ui.drawer = false;
  renderView();
}

function renderDetail() {
  const el = $('#detail');
  const m = ui.state.machines.find((x) => x.id === ui.selected);
  const showing = ui.drawer && m;
  el.hidden = !showing;
  if (!showing) return;
  const status = displayStatus(m);
  const disabled = (action) => powerDisabled(m, action);
  const log = ui.state.events.filter((e) => (e.machineId ?? e.machine) === m.id).slice(0, 5);
  el.innerHTML = `<div class="card">
    <div class="detail-head"><h2>รายละเอียดเครื่อง</h2><button class="icon-btn" id="close-detail" aria-label="ปิด">${ic('x')}</button></div>
    <div class="machine-head">
      <div class="machine-icon ${status}">${actor(m)}</div>
      <div><h3>${esc(m.name)}</h3><span class="badge ${status}">${esc(statusText(m))}</span></div>
    </div>
    <dl class="facts">
      <dt>${ic('network')}IP Address</dt><dd>${esc(m.host || 'ยังไม่ได้ตั้งค่า')}</dd>
      <dt>${ic('map-pin')}ตำแหน่ง</dt><dd>${esc(locationText(m))}</dd>
      <dt>${ic('briefcase')}อาชีพ NPC</dt><dd>${esc(professionOf(m).name)}</dd>
      <dt>${ic('user')}ผู้ใช้งาน / แผนก</dt><dd>${esc(m.owner || '-')}</dd>
      <dt>${ic('activity')}Latency</dt><dd>${m.latencyMs == null ? '-' : `${esc(m.latencyMs)} ms (${esc(m.via)})`}</dd>
      <dt>${ic('wifi')}ออนไลน์ล่าสุด</dt><dd>${esc(fmtDate(m.lastSeen))}</dd>
      <dt>${ic('clock')}ตรวจสอบล่าสุด</dt><dd>${esc(fmtDate(m.lastCheck))}</dd>
    </dl>
    ${sparkline(m.history)}
    <button class="btn wide" id="check-now">${ic('refresh-cw')}ตรวจสอบตอนนี้</button>
    <button class="btn wide" data-edit="${esc(m.id)}">${ic('pencil')}แก้ไขชื่อ / ตั้งค่าเครื่อง</button>
    <div class="actions two">
      <button class="btn" data-goto="console" ${m.access.exec ? '' : 'disabled'}>${ic('terminal')}Console</button>
      <button class="btn" data-goto="remote" ${m.access.vnc || m.access.rdp ? '' : 'disabled'}>${ic('screen-share')}Remote</button>
    </div>
    <div class="actions">
      <button class="btn go" data-power="start" ${disabled('start') ? 'disabled' : ''}>${ic('power')}เปิด</button>
      <button class="btn danger" data-power="stop" ${disabled('stop') ? 'disabled' : ''}>${ic('square')}ปิด</button>
      <button class="btn warn" data-power="restart" ${disabled('restart') ? 'disabled' : ''}>${ic('rotate-cw')}รีสตาร์ท</button>
    </div>
    ${missingCapHint(m) ? `<p class="hint">${esc(missingCapHint(m))}</p>` : ''}
  </div>
  <div class="card"><h3>ประวัติเครื่องนี้</h3>
    ${log.length ? `<ul class="mini-log">${log.map(eventLine).join('')}</ul>` : '<p class="hint">ยังไม่มีเหตุการณ์</p>'}
  </div>
  <div class="card"><h3>คำอธิบายสถานะ</h3><div class="legend">
    <div><i class="dot online"></i>ออนไลน์ (Online)</div>
    <div><i class="dot offline"></i>ออฟไลน์ (Offline)</div>
    <div><i class="dot unknown"></i>ไม่ทราบสถานะ (Unknown)</div>
    <div><i class="dot pending"></i>กำลังทำคำสั่ง</div>
  </div></div>`;
}

// Live updates must not rebuild views that contain a form the user is filling in.
function renderView(force = false) {
  const view = $('#view');
  if (ui.view === 'map') {
    if (force || !$('.room')) view.innerHTML = `${mapBar()}${renderMap()}`;
    else patchMap();
  } else if (ui.view === 'monitor') {
    if (force || !$('#rows')) view.innerHTML = tableShell();
    else $('#rows').innerHTML = renderTableRows();
  } else if (ui.view === 'dashboard') {
    view.innerHTML = renderDashboard();
  } else if (force) {
    const page = { schedule: renderSchedule, settings: renderSettings, console: renderConsole, remote: renderRemote };
    view.innerHTML = page[ui.view]();
    const el = $('#term');
    if (el) el.scrollTop = el.scrollHeight;
  }
  renderDetail();
}

function mapBar() {
  const item = (cls, label) => `<span><i class="dot ${cls}"></i>${label}</span>`;
  return `<div class="map-bar">
    <div class="map-legend">${item('online', 'ออนไลน์')}${item('offline', 'ออฟไลน์ (นอนบนเตียง)')}${item('unknown', 'ไม่ทราบสถานะ')}${item('pending', 'กำลังทำคำสั่ง')}</div>
    <span class="hint">กดที่เครื่องเพื่อสั่งงาน กด + เพื่อเพิ่มเครื่องตรงตำแหน่งนั้น</span>
  </div>`;
}

function setView(view) {
  if (ui.view === 'remote' && view !== 'remote') {
    vncDisconnect();
    vnc.status = 'ยังไม่ได้เชื่อมต่อ';
  }
  ui.view = view;
  ui.drawer = false;
  renderNav();
  renderView(true);
  replay($('#view'), 'enter');
}

function confirmPower(m, action) {
  const dialog = $('#modal');
  const typed = action !== 'start';
  dialog.innerHTML = `<form method="dialog" id="confirm-form">
    <h2>${esc(ACTION_LABEL[action])} ${esc(m.name)}?</h2>
    <p class="modal-text">${m.demo ? 'เครื่องนี้เป็นข้อมูลจำลอง จะไม่มีเครื่องจริงถูกสั่ง' : `คำสั่งจะถูกส่งไปที่เครื่องจริง ${esc(m.host)}`}</p>
    ${typed ? `<label class="form"><span class="full">พิมพ์ <strong>${esc(m.name)}</strong> เพื่อยืนยัน</span><input class="full" id="confirm-name" autocomplete="off"></label>` : ''}
    <p class="error" id="confirm-error"></p>
    <div class="modal-actions">
      <button type="button" class="btn" id="confirm-cancel">ยกเลิก</button>
      <button type="submit" class="btn ${action === 'start' ? 'go' : 'danger'}" id="confirm-ok" ${typed ? 'disabled' : ''}>${esc(ACTION_LABEL[action])}</button>
    </div>
  </form>`;
  dialog.showModal();
  $('#confirm-cancel').onclick = () => dialog.close();
  if (typed) {
    $('#confirm-name').oninput = (e) => { $('#confirm-ok').disabled = e.target.value !== m.name; };
  }
  $('#confirm-form').onsubmit = async (e) => {
    e.preventDefault();
    $('#confirm-ok').disabled = true;
    try {
      const { message } = await api('POST', `/api/machines/${encodeURIComponent(m.id)}/power`, { action });
      dialog.close();
      toast(message);
    } catch (err) {
      $('#confirm-error').textContent = err.message;
    }
  };
}

function machineForm(m, place = {}) {
  const isNew = !m;
  const v = m ?? { name: '', host: '', tcpPort: null, zone: 'LEFT A', floor: 1, slot: 1, owner: '', demo: false, control: { type: 'none' }, wake: null, ...place };
  const dialog = $('#modal');
  dialog.innerHTML = `<form id="machine-form">
    <h2>${isNew ? 'เพิ่มเครื่อง' : `แก้ไข ${esc(v.name)}`}</h2>
    <div class="form">
      <label>ชื่อเครื่อง<input name="name" value="${esc(v.name)}" maxlength="32" placeholder="เช่น เครื่องบัญชี 1" required></label>
      <label>IP / Hostname<input name="host" value="${esc(v.host)}"></label>
      <label>TCP port สำรอง (ถ้า VPS ปิด ping)<input name="tcpPort" type="number" min="1" max="65535" value="${esc(v.tcpPort ?? '')}"></label>
      <label>ผู้ใช้งาน / แผนก<input name="owner" value="${esc(v.owner)}"></label>
      <label>VNC port (คุมจอในเว็บ เช่น 5900)<input name="vncPort" type="number" min="1" max="65535" value="${esc(v.remote?.vncPort ?? '')}"></label>
      <label>RDP port (Windows เช่น 3389)<input name="rdpPort" type="number" min="1" max="65535" value="${esc(v.remote?.rdpPort ?? '')}"></label>
      <label>Radmin port (เว้นว่าง = 4899)<input name="radminPort" type="number" min="1" max="65535" value="${esc(v.remote?.radminPort ?? '')}"></label>
      <label>โซน<select name="zone">${ZONES.map((z) => `<option${z === v.zone ? ' selected' : ''}>${z}</option>`).join('')}</select></label>
      <label>ชั้น 1-4 (END ใช้ 0)<input name="floor" type="number" min="0" max="4" value="${esc(v.floor)}" required></label>
      <label>ช่อง 1-2 (END ใช้ 1-4)<input name="slot" type="number" min="1" max="4" value="${esc(v.slot)}" required></label>
      <label>MAC สำหรับ Wake-on-LAN<input name="mac" placeholder="AA:BB:CC:DD:EE:FF" value="${esc(v.wake?.mac ?? '')}"></label>
      <label>Broadcast<input name="broadcast" placeholder="255.255.255.255" value="${esc(v.wake?.broadcast ?? '')}"></label>
      <label>วิธีควบคุม<select name="controlType">${Object.keys(CONTROL_TEMPLATES).map((t) => `<option${t === v.control.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="full">รายละเอียดการควบคุม (JSON)<textarea name="control">${esc(JSON.stringify(v.control, null, 2))}</textarea></label>
      <label class="full days"><label><input type="checkbox" name="demo" ${v.demo ? 'checked' : ''}>ใช้ข้อมูลจำลอง (ไม่ ping และไม่สั่งเครื่องจริง)</label></label>
    </div>
    <p class="hint">ห้ามใส่รหัสผ่านหรือ token ในช่องนี้ ให้เก็บใน environment variable ที่ขึ้นต้นด้วย VPSMON_ แล้วอ้างชื่อตัวแปรแทน</p>
    <p class="error" id="machine-error"></p>
    <div class="modal-actions">
      ${isNew ? '' : `<button type="button" class="btn danger" id="machine-delete" style="margin-right:auto">${ic('trash-2')}ลบเครื่อง</button>`}
      <button type="button" class="btn" id="machine-cancel">ยกเลิก</button>
      <button class="btn primary">${ic('save')}บันทึก</button>
    </div>
  </form>`;
  dialog.showModal();
  const form = $('#machine-form');
  $('#machine-cancel').onclick = () => dialog.close();
  form.controlType.onchange = () => {
    form.control.value = JSON.stringify(CONTROL_TEMPLATES[form.controlType.value], null, 2);
  };
  if (!isNew) {
    $('#machine-delete').onclick = async () => {
      if (!window.confirm(`ลบ ${v.name} และตารางเวลาของเครื่องนี้?`)) return;
      try {
        await api('DELETE', `/api/machines/${encodeURIComponent(v.id)}`);
        dialog.close();
        if (ui.selected === v.id) ui.selected = null;
        await refresh();
        renderView(true);
      } catch (err) {
        $('#machine-error').textContent = err.message;
      }
    };
  }
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      let control;
      try {
        control = JSON.parse(form.control.value);
      } catch {
        throw new Error('JSON ของการควบคุมไม่ถูกต้อง');
      }
      const body = {
        name: form.name.value.trim(), host: form.host.value.trim(),
        tcpPort: form.tcpPort.value ? Number(form.tcpPort.value) : null,
        owner: form.owner.value, zone: form.zone.value,
        floor: Number(form.floor.value), slot: Number(form.slot.value),
        demo: form.demo.checked, demoOff: Boolean(v.demoOff), control,
        wake: form.mac.value.trim() ? { mac: form.mac.value.trim(), broadcast: form.broadcast.value.trim() } : null,
        remote: {
          ...(form.vncPort.value ? { vncPort: Number(form.vncPort.value) } : {}),
          ...(form.rdpPort.value ? { rdpPort: Number(form.rdpPort.value) } : {}),
          ...(form.radminPort.value ? { radminPort: Number(form.radminPort.value) } : {}),
        },
      };
      const saved = await (isNew ? api('POST', '/api/machines', body)
        : api('PUT', `/api/machines/${encodeURIComponent(v.id)}`, body));
      dialog.close();
      toast('บันทึกแล้ว');
      if (ui.view === 'map') ui.selected = saved.id;
      await refresh();
      renderView(true);
    } catch (err) {
      $('#machine-error').textContent = err.message;
    }
  };
}

async function refresh() {
  ui.state = await api('GET', '/api/state');
  renderHeader();
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
  $('#theme-toggle').setAttribute('aria-pressed', String(dark));
  $('#theme-label').textContent = dark ? 'โหมดสว่าง' : 'โหมดมืด';
  $('#theme-icon').innerHTML = ic(dark ? 'sun' : 'moon');
  for (const el of document.querySelectorAll('[data-set-theme]')) el.classList.toggle('active', el.dataset.setTheme === theme);
}

function setTheme(next) {
  applyTheme(next);
  try {
    localStorage.setItem('theme', next);
  } catch {
    // Private windows can block storage; the theme still applies for this visit.
  }
}

function handleClick(e) {
  if (e.target.closest('#theme-toggle')) return setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  const themePick = e.target.closest('[data-set-theme]');
  if (themePick) return setTheme(themePick.dataset.setTheme);
  const menuItem = e.target.closest('[data-menu]');
  if (menuItem) {
    const m = ui.state.machines.find((x) => x.id === ui.selected);
    const action = menuItem.dataset.menu;
    closeMenu();
    if (!m) return;
    if (action === 'info') {
      ui.drawer = true;
      renderView();
      replay($('#detail'), 'enter');
    } else if (action === 'radmin') {
      openRadminFor(m);
    } else {
      confirmPower(m, action);
    }
    return;
  }
  if (e.target.closest('#tile-menu')) return;
  closeMenu();
  const nav = e.target.closest('[data-view]');
  if (nav) return setView(nav.dataset.view);
  const edit = e.target.closest('[data-edit]');
  if (edit) return machineForm(ui.state.machines.find((m) => m.id === edit.dataset.edit));
  if (e.target.closest('#add-machine')) return machineForm(null);
  const goto = e.target.closest('[data-goto]');
  if (goto) return setView(goto.dataset.goto);
  const chip = e.target.closest('[data-cmd]');
  if (chip) return runConsole(chip.dataset.cmd);
  if (e.target.closest('#console-stop')) return term.abort?.abort();
  if (e.target.closest('#console-clear')) {
    term.lines = [];
    return renderView(true);
  }
  if (e.target.closest('#vnc-connect')) return vncConnect();
  if (e.target.closest('#vnc-disconnect')) return vncDisconnect();
  if (e.target.closest('#vnc-cad')) return vnc.rfb?.sendCtrlAltDel();
  if (e.target.closest('#vnc-full')) return $('#vnc-stage').requestFullscreen();
  if (e.target.closest('#radmin-open')) return openRadminFor(ui.state.machines.find((m) => m.id === ui.selected));
  if (e.target.closest('#rdp-open')) {
    api('POST', `/api/machines/${encodeURIComponent(ui.selected)}/rdp`)
      .then(() => toast('เปิด Remote Desktop แล้ว'), (err) => toast(err.message, true));
    return;
  }
  const add = e.target.closest('[data-add-zone]');
  if (add) {
    return machineForm(null, {
      zone: add.dataset.addZone, floor: Number(add.dataset.addFloor), slot: Number(add.dataset.addSlot),
    });
  }
  if (e.target.closest('#clear-demo')) {
    if (!window.confirm('ลบเครื่องจำลองทั้งหมดออกจากแผนผัง? เครื่องจริงที่เพิ่มไว้จะไม่ถูกลบ')) return;
    api('POST', '/api/machines/clear-demo').then(refresh).then(() => {
      if (!ui.state.machines.some((m) => m.id === ui.selected)) ui.selected = null;
      renderView(true);
    }).catch((err) => toast(err.message, true));
    return;
  }
  const machine = e.target.closest('[data-machine]');
  if (machine) return openMenu(ui.state.machines.find((m) => m.id === machine.dataset.machine), e, machine);
  if (e.target.closest('#close-detail')) return closeDrawer();
  const m = ui.state.machines.find((x) => x.id === ui.selected);
  if (e.target.closest('#check-now') && m) {
    api('POST', `/api/machines/${encodeURIComponent(m.id)}/check`)
      .then(() => toast(`ตรวจสอบ ${m.name} แล้ว`), (err) => toast(err.message, true));
  }
  const power = e.target.closest('[data-power]');
  if (power && m) confirmPower(m, power.dataset.power);

  const toggle = e.target.closest('[data-sch-toggle]');
  const del = e.target.closest('[data-sch-del]');
  if (toggle || del) {
    const call = toggle
      ? api('PATCH', `/api/schedules/${toggle.dataset.schToggle}`, { enabled: toggle.dataset.enabled !== 'true' })
      : api('DELETE', `/api/schedules/${del.dataset.schDel}`);
    call.then(refresh).then(() => renderView(true)).catch((err) => toast(err.message, true));
  }
}

async function handleSubmit(e) {
  if (e.target.id === 'console-form') {
    e.preventDefault();
    const input = $('#console-input');
    const command = input.value.trim();
    if (command) {
      input.value = '';
      runConsole(command);
    }
    return;
  }
  if (e.target.id === 'sch-form') {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('POST', '/api/schedules', {
        machineId: f.get('machineId'), action: f.get('action'), time: f.get('time'),
        days: f.getAll('day').map(Number),
      });
      toast('เพิ่มตารางเวลาแล้ว');
      await refresh();
      renderView(true);
    } catch (err) {
      toast(err.message, true);
    }
  }
  if (e.target.id === 'settings-form') {
    e.preventDefault();
    const body = Object.fromEntries([...new FormData(e.target)].map(([k, v]) => [k, Number(v)]));
    api('PUT', '/api/settings', body).then(() => toast('บันทึกแล้ว'), (err) => toast(err.message, true));
  }
}

function handleInput(e) {
  if (e.target.id === 'target') {
    ui.selected = e.target.value;
    if (ui.view === 'remote') renderView(true);
    return;
  }
  if (e.target.id === 'vnc-view-only' && vnc.rfb) vnc.rfb.viewOnly = e.target.checked;
  if (e.target.id === 'search') ui.search = e.target.value;
  else if (e.target.id === 'filter') ui.filter = e.target.value;
  else return;
  $('#rows').innerHTML = renderTableRows();
}

function handleKeydown(e) {
  if (ui.menuOpen && ['Escape', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
    e.preventDefault();
    if (e.key === 'Escape') return closeMenu(true);
    const items = [...document.querySelectorAll('#tile-menu button:not(:disabled)')];
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
    return;
  }
  if (e.key === 'Escape' && ui.drawer && !$('#modal').open) return closeDrawer();
  if (e.target.id !== 'console-input' || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  term.cursor = Math.min(term.history.length, Math.max(0, term.cursor + (e.key === 'ArrowUp' ? -1 : 1)));
  e.target.value = term.history[term.cursor] ?? '';
}

function connect() {
  const stream = new EventSource('/api/stream');
  stream.onopen = () => { $('#connection').hidden = true; };
  stream.onerror = () => { $('#connection').hidden = false; };
  stream.onmessage = (e) => {
    $('#connection').hidden = true;
    ui.state = JSON.parse(e.data);
    renderHeader();
    if (!ui.rendered) {
      ui.rendered = true;
      setView(ui.view);
    } else {
      renderView();
    }
  };
}

document.addEventListener('click', handleClick);
document.addEventListener('submit', handleSubmit);
document.addEventListener('input', handleInput);
document.addEventListener('keydown', handleKeydown);
document.addEventListener('scroll', (e) => {
  if (!$('#tile-menu').contains(e.target)) closeMenu();
}, true);
for (const el of document.querySelectorAll('[data-ic]')) el.innerHTML = ic(el.dataset.ic);
applyTheme(document.documentElement.dataset.theme);
connect();
