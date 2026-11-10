'use strict';
// Control financiero de plataformas de suscripción — DEMO. Todo corre en el navegador.
const S = { earn: [], bank: [] };
const $ = (id) => document.getElementById(id);
const money = (n) => (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const P = () => ({ plat: +$('pPlat').value / 100, ag: +$('pAg').value / 100, egr: +$('pEgr').value, lag: +$('pLag').value, tol: +$('pTol').value / 100 });
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const label = (ym) => MES[+ym.slice(5) - 1] + ' ' + ym.slice(2, 4);
const shift = (ym, k) => { let y = +ym.slice(0, 4), m = +ym.slice(5) - 1 + k; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); };

/* ---------- lectura de archivos ---------- */
function splitCSV(text) {
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',' || c === ';') { r.push(f); f = ''; }
    else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; } else if (c !== '\r') f += c; }
  if (f || r.length) { r.push(f); rows.push(r); } return rows.filter((x) => x.some((v) => v.trim() !== ''));
}
async function readRows(file) {
  if (/\.csv$/i.test(file.name)) return splitCSV(await file.text());
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
}
const num = (v) => { if (typeof v === 'number') return v; const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
function ymOf(v) {
  if (v instanceof Date) { const d = new Date(v.getTime() + 12 * 3600e3); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
  const s = String(v).trim(); let m = s.match(/^(\d{4})[-\/](\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0');
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/); return m ? m[3] + '-' + m[2].padStart(2, '0') : null;
}
const find = (hdr, re, not) => hdr.findIndex((h) => re.test(String(h)) && !(not && not.test(String(h))));
function parseEarn(rows) {
  const h = rows[0], c = { d: find(h, /fecha|date/i), t: find(h, /descrip|tipo|type/i), g: find(h, /bruto|gross|amount|monto/i, /comisi|fee|neto|net/i), f: find(h, /comisi|fee/i), n: find(h, /neto|net/i) };
  if (c.d < 0 || (c.g < 0 && c.n < 0)) throw new Error('No encuentro columnas de fecha y monto. Revisa el encabezado.');
  return rows.slice(1).map((r) => { const ym = ymOf(r[c.d]); if (!ym) return null;
    let g = c.g >= 0 ? num(r[c.g]) : 0, f = c.f >= 0 ? num(r[c.f]) : null, n = c.n >= 0 ? num(r[c.n]) : null;
    if (!g && n != null) g = n / (1 - P().plat); if (f == null) f = g * P().plat; if (n == null) n = g - f;
    return { ym, type: c.t >= 0 ? String(r[c.t]) : 'Otro', gross: g, fee: f, net: n }; }).filter(Boolean);
}
function parseBank(rows) {
  const h = rows[0], c = { d: find(h, /fecha|date/i), t: find(h, /concepto|descrip|detalle/i), a: find(h, /monto|amount|valor|cr[eé]dito/i) };
  if (c.d < 0 || c.a < 0) throw new Error('No encuentro columnas de fecha y monto en el estado de cuenta.');
  return rows.slice(1).map((r) => { const ym = ymOf(r[c.d]), a = num(r[c.a]); return ym && a > 0 ? { ym, concept: c.t >= 0 ? String(r[c.t]) : '', amt: a } : null; }).filter(Boolean);
}
async function load(file, kind) {
  try { const rows = await readRows(file);
    if (kind === 'earn') { S.earn = parseEarn(rows); $('statEarn').textContent = `✓ ${file.name}: ${S.earn.length} movimientos leídos`; }
    else { S.bank = parseBank(rows); $('statBank').textContent = `✓ ${file.name}: ${S.bank.length} depósitos leídos`; }
    render();
  } catch (e) { $(kind === 'earn' ? 'statEarn' : 'statBank').innerHTML = `<span class="neg">✗ ${e.message}</span>`; }
}
async function loadDemo() {
  const get = async (u) => splitCSV(await (await fetch(u)).text());
  S.earn = parseEarn(await get('demo-datos/onlyfans_earnings_demo.csv')); S.bank = parseBank(await get('demo-datos/banco_demo.csv'));
  $('statEarn').textContent = `✓ Datos de demostración: ${S.earn.length} movimientos`; $('statBank').textContent = `✓ Datos de demostración: ${S.bank.length} depósitos`; render();
}

/* ---------- cálculo ---------- */
function compute() {
  const p = P(), by = {};
  S.earn.forEach((e) => { const m = (by[e.ym] ||= { ym: e.ym, gross: 0, fee: 0, net: 0, types: {} }); m.gross += e.gross; m.fee += e.fee; m.net += e.net; m.types[e.type] = (m.types[e.type] || 0) + e.gross; });
  const bankBy = {}; S.bank.forEach((b) => (bankBy[b.ym] = (bankBy[b.ym] || 0) + b.amt));
  const rows = Object.values(by).sort((a, b) => a.ym.localeCompare(b.ym)).map((m) => {
    m.agency = m.net * p.ag; m.expected = m.net - m.agency; m.after = m.expected - p.egr;
    const payYm = shift(m.ym, p.lag); m.payYm = payYm; m.received = payYm in bankBy ? bankBy[payYm] : null;
    m.diff = m.received == null ? null : m.expected - m.received; m.pct = m.diff == null ? null : m.diff / m.expected;
    m.status = m.received == null ? 'na' : m.pct > p.tol ? 'bad' : 'ok'; return m; });
  return { rows, p };
}
const sum = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0);

/* ---------- render ---------- */
let charts = {};
const mk = (id, cfg) => { charts[id]?.destroy(); charts[id] = new Chart($(id), cfg); };
function render() {
  const { rows, p } = compute(); const has = rows.length > 0;
  $('periodo').textContent = has ? `${label(rows[0].ym)} – ${label(rows[rows.length - 1].ym)}` : '—';
  if (!has) { $('kpis').innerHTML = '<div class="card">Aún no hay datos. Ve a <b>Cargar reportes</b> y sube un archivo o usa los datos de demostración.</div>'; ['tblEstado', 'tblConc'].forEach((i) => ($(i).innerHTML = '')); $('alertBox').innerHTML = ''; Object.values(charts).forEach((c) => c.destroy()); charts = {}; return; }
  const conc = rows.filter((r) => r.received != null), alerts = rows.filter((r) => r.status === 'bad');
  const dif = sum(conc, 'diff'), difAl = sum(alerts, 'diff');
  $('kpis').innerHTML = [
    ['Ingresos brutos', money(sum(rows, 'gross')), `${rows.length} meses`, ''],
    ['Neto de plataforma', money(sum(rows, 'net')), `tras comisión ${(sum(rows, 'fee') / sum(rows, 'gross') * 100).toFixed(0)}%`, ''],
    ['Neto esperado para ti', money(sum(rows, 'expected')), `tras agencia ${(p.ag * 100).toFixed(0)}%`, ''],
    ['Recibido en banco', money(sum(conc, 'received')), `${conc.length} pagos conciliados`, ''],
    ['Diferencia sin explicar', money(difAl), `${alerts.length} mes(es) en alerta`, alerts.length ? 'bad' : 'ok']
  ].map(([a, b, c, k]) => `<div class="kpi ${k}"><small>${a}</small><b>${b}</b><span>${c}</span></div>`).join('');
  Chart.defaults.color = '#8e9bb8'; Chart.defaults.borderColor = '#2a3550';
  const L = rows.map((r) => label(r.ym));
  mk('chMes', { type: 'bar', data: { labels: L, datasets: [
    { label: 'Bruto', data: rows.map((r) => r.gross), backgroundColor: '#4f8cff' },
    { label: 'Esperado para ti', data: rows.map((r) => r.expected), backgroundColor: '#2ecc8f' },
    { label: 'Recibido', data: rows.map((r) => r.received), backgroundColor: '#ffb020' }] }, options: { plugins: { legend: { position: 'bottom' } } } });
  const T = {}; rows.forEach((r) => Object.entries(r.types).forEach(([k, v]) => (T[k] = (T[k] || 0) + v)));
  mk('chTipo', { type: 'doughnut', data: { labels: Object.keys(T), datasets: [{ data: Object.values(T), backgroundColor: ['#4f8cff', '#2ecc8f', '#ffb020', '#b07cff', '#ff7ab6', '#5ad1e6'], borderWidth: 0 }] }, options: { plugins: { legend: { position: 'bottom' } } } });
  mk('chDif', { type: 'bar', data: { labels: L, datasets: [{ label: 'Esperado − recibido (USD)', data: rows.map((r) => r.diff), backgroundColor: rows.map((r) => (r.status === 'bad' ? '#ff5d6c' : '#2ecc8f')) }] }, options: { plugins: { legend: { display: false } } } });
  const tr = (cells, cls = '') => `<tr class="${cls}">${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  $('tblEstado').innerHTML = '<thead><tr><th>Mes</th><th>Bruto</th><th>Comisión plataforma</th><th>Neto plataforma</th><th>Agencia</th><th>Neto esperado</th><th>Egresos propios</th><th>Resultado</th></tr></thead><tbody>' +
    rows.map((r) => tr([label(r.ym), money(r.gross), money(-r.fee), money(r.net), money(-r.agency), money(r.expected), money(-p.egr), `<b>${money(r.after)}</b>`])).join('') +
    `</tbody><tfoot>${tr(['Total', money(sum(rows, 'gross')), money(-sum(rows, 'fee')), money(sum(rows, 'net')), money(-sum(rows, 'agency')), money(sum(rows, 'expected')), money(-p.egr * rows.length), money(sum(rows, 'after'))])}</tfoot>`;
  $('concHint').textContent = `Cada mes de ingresos se compara con el depósito del mes ${p.lag === 0 ? 'mismo' : '+' + p.lag}. Tolerancia: ${(p.tol * 100).toFixed(1)}%.`;
  $('alertBox').innerHTML = !conc.length ? '<div class="alert">Carga el estado de cuenta bancario para conciliar.</div>' : alerts.length
    ? `<div class="alert"><b>⚠ ${alerts.length} mes(es) con diferencia sobre la tolerancia</b> — total retenido sin explicar: <b>${money(difAl)}</b>. Solicita a la agencia el detalle de descuentos de: ${alerts.map((a) => label(a.ym)).join(', ')}.</div>`
    : '<div class="alert good"><b>✓ Todo cuadra</b> dentro de la tolerancia.</div>';
  $('tblConc').innerHTML = '<thead><tr><th>Mes ingresos</th><th>Esperado para ti</th><th>Mes depósito</th><th>Recibido</th><th>Diferencia</th><th>%</th><th>Estado</th></tr></thead><tbody>' +
    rows.map((r) => tr([label(r.ym), money(r.expected), label(r.payYm), r.received == null ? '—' : money(r.received), r.diff == null ? '—' : `<span class="${r.status === 'bad' ? 'neg' : 'pos'}">${money(r.diff)}</span>`,
      r.pct == null ? '—' : (Math.abs(r.pct) < 0.0005 ? 0 : r.pct * 100).toFixed(1) + '%', `<span class="pill ${r.status}">${{ ok: 'Cuadra', bad: 'Revisar', na: 'Sin dato' }[r.status]}</span>`])).join('') + '</tbody>';
}

/* ---------- eventos ---------- */
const TITLES = { dash: 'Dashboard', estado: 'Estado financiero', conc: 'Conciliación', cargar: 'Cargar reportes', config: 'Parámetros' };
function go(t) { document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.id === 'tab-' + t)); document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === t)); $('title').textContent = TITLES[t]; if (t === 'dash') render(); }
document.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.tab); }));
[['dropEarn', 'fileEarn', 'earn'], ['dropBank', 'fileBank', 'bank']].forEach(([d, f, k]) => {
  $(f).addEventListener('change', (e) => e.target.files[0] && load(e.target.files[0], k));
  $(d).addEventListener('dragover', (e) => { e.preventDefault(); $(d).classList.add('over'); }); $(d).addEventListener('dragleave', () => $(d).classList.remove('over'));
  $(d).addEventListener('drop', (e) => { e.preventDefault(); $(d).classList.remove('over'); e.dataTransfer.files[0] && load(e.dataTransfer.files[0], k); });
});
$('btnDemo').onclick = loadDemo; $('btnClear').onclick = () => { S.earn = []; S.bank = []; $('statEarn').textContent = $('statBank').textContent = ''; render(); };
$('btnAdd').onclick = () => $('dlgAdd').showModal();
['pPlat', 'pAg', 'pEgr', 'pLag', 'pTol'].forEach((i) => $(i).addEventListener('input', render));
const q = new URLSearchParams(location.search); (async () => { if (q.get('demo') !== null) await loadDemo(); else render(); if (q.get('tab')) go(q.get('tab')); })();
