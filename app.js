'use strict';
/* Interfaz del sistema: login, menús, reportes con filtros, administración. Usa los módulos de services.js */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctf = (n) => (Math.abs(n) < 0.0005 ? 0 : n * 100).toFixed(1) + '%';
const ui = { plat: 'all', from: '', to: '' };
let charts = {};

function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 3200); }
function mk(id, cfg) { charts[id]?.destroy(); const el = $(id); if (el) charts[id] = new Chart(el, cfg); }
function killCharts() { Object.values(charts).forEach((c) => c.destroy()); charts = {}; }
Chart.defaults.color = '#8e9bb8'; Chart.defaults.borderColor = '#2a3550';
const PAL = ['#4f8cff', '#2ecc8f', '#ffb020', '#b07cff', '#ff7ab6', '#5ad1e6', '#ff8a5b'];

const ctx = () => ({ months: Finanzas.months(ui.plat, ui.from, ui.to), egr: Finanzas.egresos(ui.plat, ui.from, ui.to) });
const emptyHTML = '<div class="card empty">Aún no hay datos para este filtro.<br>Carga un reporte en <b>Cargas de archivos</b> o cambia la plataforma / el periodo.<br><a class="btn" href="#/cargas">Ir a Cargas</a></div>';

/* ---------------- tablas y exportación ---------------- */
function cell(c, r) {
  const v = typeof c.k === 'function' ? c.k(r) : r[c.k];
  if (v == null) return '—';
  if (c.f === '$') return money(v);
  if (c.f === '%') return pctf(v);
  if (c.f === 'diff') return `<span class="${r.status === 'bad' ? 'neg' : 'pos'}">${money(v)}</span>`;
  if (c.f === 'st') return `<span class="pill ${v}">${{ ok: 'Cuadra', bad: 'Revisar', na: 'Sin dato' }[v]}</span>`;
  return esc(v);
}
function tableHTML(cols, rows) {
  const val = (c, r) => +(typeof c.k === 'function' ? c.k(r) : r[c.k]) || 0;
  const foot = cols.some((c) => c.sum) ? '<tfoot><tr>' + cols.map((c, i) => `<td>${c.sum ? money(rows.reduce((s, r) => s + val(c, r), 0)) : i === 0 ? 'Total' : ''}</td>`).join('') + '</tr></tfoot>' : '';
  return '<table><thead><tr>' + cols.map((c) => `<th>${esc(c.h)}</th>`).join('') + '</tr></thead><tbody>' + rows.map((r) => '<tr>' + cols.map((c) => `<td>${cell(c, r)}</td>`).join('') + '</tr>').join('') + '</tbody>' + foot + '</table>';
}
function exportCSV(name, cols, rows) {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const raw = (c, r) => { const v = typeof c.k === 'function' ? c.k(r) : r[c.k]; return typeof v === 'number' ? (c.f === '%' ? (v * 100).toFixed(2) : v.toFixed(2)) : v; };
  const csv = '﻿' + [cols.map((c) => q(c.h)).join(',')].concat(rows.map((r) => cols.map((c) => q(raw(c, r))).join(','))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `${name}_${ui.from || 'inicio'}_${ui.to || 'fin'}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

/* ---------------- definición de reportes ---------------- */
const mcol = { h: 'Mes', k: (r) => ymLabel(r.ym) };
const REPORTS = [
  { id: 'ingresos', ic: '💵', title: 'Ingresos por mes', desc: 'Bruto, comisión de la plataforma y neto por mes.',
    build: ({ months }) => ({ rows: months, cols: [mcol, { h: 'Bruto', k: 'gross', f: '$', sum: 1 }, { h: 'Comisión plataforma', k: 'fee', f: '$', sum: 1 }, { h: 'Neto plataforma', k: 'net', f: '$', sum: 1 }],
      chart: (L) => ({ type: 'bar', data: { labels: L, datasets: [{ label: 'Bruto', data: months.map((m) => m.gross), backgroundColor: PAL[0] }, { label: 'Neto plataforma', data: months.map((m) => m.net), backgroundColor: PAL[1] }] } }) }) },
  { id: 'tipos', ic: '🧮', title: 'Ingresos por tipo', desc: 'Suscripciones, propinas, mensajes y más, mes a mes.', extra: 'tipo',
    build: ({ months }, f) => { const all = [...new Set(months.flatMap((m) => Object.keys(m.types)))], T = f.tipo && f.tipo !== 'todos' && all.includes(f.tipo) ? [f.tipo] : all;
      const rows = months.map((m) => ({ ...m, total: T.reduce((s, t) => s + (m.types[t] || 0), 0) }));
      return { types: all, rows, cols: [mcol, ...T.map((t) => ({ h: t, k: (r) => r.types[t] || 0, f: '$', sum: 1 })), ...(T.length > 1 ? [{ h: 'Total', k: 'total', f: '$', sum: 1 }] : [])],
        chart: (L) => ({ type: 'bar', data: { labels: L, datasets: T.map((t, i) => ({ label: t, data: months.map((m) => m.types[t] || 0), backgroundColor: PAL[i % PAL.length] })) }, options: { scales: { x: { stacked: true }, y: { stacked: true } } } }) }; } },
  { id: 'estado', ic: '🧾', title: 'Estado financiero', desc: 'Del bruto al resultado: comisión, agencia y egresos.',
    build: ({ months }) => ({ rows: months, cols: [mcol, { h: 'Bruto', k: 'gross', f: '$', sum: 1 }, { h: '(−) Comisión plataforma', k: 'fee', f: '$', sum: 1 }, { h: 'Neto plataforma', k: 'net', f: '$', sum: 1 }, { h: '(−) Agencia', k: 'agency', f: '$', sum: 1 }, { h: 'Neto esperado', k: 'expected', f: '$', sum: 1 }, { h: '(−) Egresos', k: 'egr', f: '$', sum: 1 }, { h: 'Resultado', k: 'result', f: '$', sum: 1 }],
      chart: (L) => ({ type: 'line', data: { labels: L, datasets: [{ label: 'Resultado', data: months.map((m) => m.result), borderColor: PAL[1], backgroundColor: PAL[1] + '33', fill: true, tension: .3 }, { label: 'Neto esperado', data: months.map((m) => m.expected), borderColor: PAL[0], tension: .3 }] } }) }) },
  { id: 'conciliacion', ic: '⚖️', title: 'Conciliación bancaria', desc: 'Lo esperado vs. lo depositado en tu banco.', extra: 'estado',
    build: ({ months }, f) => { const rows = months.filter((m) => !f.estado || f.estado === 'todos' || m.status === f.estado), bad = months.filter((m) => m.status === 'bad'), conc = months.filter((m) => m.received != null);
      const sd = bad.reduce((s, m) => s + m.diff, 0);
      return { rows, alert: !conc.length ? '<div class="alert">Carga el estado de cuenta bancario para conciliar.</div>' : bad.length ? `<div class="alert"><b>⚠ ${bad.length} mes(es) fuera de tolerancia</b> — retenido sin explicar: <b>${money(sd)}</b>. Meses: ${bad.map((m) => ymLabel(m.ym)).join(', ')}.</div>` : '<div class="alert good"><b>✓ Todo cuadra</b> dentro de la tolerancia.</div>',
        cols: [mcol, { h: 'Esperado para ti', k: 'expected', f: '$', sum: 1 }, { h: 'Mes de depósito', k: (r) => ymLabel(r.payYm) }, { h: 'Recibido', k: 'received', f: '$' }, { h: 'Diferencia', k: 'diff', f: 'diff' }, { h: '%', k: 'pct', f: '%' }, { h: 'Estado', k: 'status', f: 'st' }],
        chart: () => ({ type: 'bar', data: { labels: rows.map((m) => ymLabel(m.ym)), datasets: [{ label: 'Esperado', data: rows.map((m) => m.expected), backgroundColor: PAL[0] }, { label: 'Recibido', data: rows.map((m) => m.received), backgroundColor: PAL[2] }] } }) }; } },
  { id: 'alertas', ic: '🚨', title: 'Diferencias a reclamar', desc: 'Solo los meses fuera de tolerancia, con monto y texto de reclamo.', claim: true,
    build: ({ months }) => { const rows = months.filter((m) => m.status === 'bad');
      return { rows, cols: [mcol, { h: 'Neto plataforma', k: 'net', f: '$', sum: 1 }, { h: 'Esperado para ti', k: 'expected', f: '$', sum: 1 }, { h: 'Recibido', k: 'received', f: '$', sum: 1 }, { h: 'Diferencia', k: 'diff', f: 'diff', sum: 1 }, { h: '%', k: 'pct', f: '%' }],
        alert: rows.length ? '' : '<div class="alert good"><b>✓ Sin diferencias</b> en el periodo seleccionado.</div>',
        chart: () => ({ type: 'bar', data: { labels: rows.map((m) => ymLabel(m.ym)), datasets: [{ label: 'Diferencia (USD)', data: rows.map((m) => m.diff), backgroundColor: '#ff5d6c' }] }, options: { plugins: { legend: { display: false } } } }) }; } },
  { id: 'egresos', ic: '💸', title: 'Egresos', desc: 'Gastos propios del periodo por concepto.',
    build: ({ egr }) => { const by = {}; egr.forEach((e) => (by[e.concept] = (by[e.concept] || 0) + e.amount));
      return { rows: egr, cols: [{ h: 'Fecha', k: 'date' }, { h: 'Concepto', k: 'concept' }, { h: 'Plataforma', k: (r) => Store.plat(r.platId)?.name || '' }, { h: 'Monto', k: 'amount', f: '$', sum: 1 }],
        chart: () => ({ type: 'doughnut', data: { labels: Object.keys(by), datasets: [{ data: Object.values(by), backgroundColor: PAL, borderWidth: 0 }] } }), small: true }; } }
];

/* ---------------- vistas ---------------- */
function kpi(a, b, c, k = '') { return `<div class="kpi ${k}"><small>${a}</small><b>${b}</b><span>${c}</span></div>`; }

function vResumen() {
  const { months } = ctx(); if (!months.length) { $('view').innerHTML = emptyHTML; return; }
  const S = (k) => Finanzas.sum(months, k), conc = months.filter((m) => m.received != null), bad = months.filter((m) => m.status === 'bad');
  $('view').innerHTML = `<div class="kpis">${kpi('Ingresos brutos', money(S('gross')), months.length + ' meses')}${kpi('Neto de plataforma', money(S('net')), 'tras comisión ' + pctf(S('fee') / S('gross')))}${kpi('Neto esperado para ti', money(S('expected')), 'tras agencia')}${kpi('Recibido en banco', money(Finanzas.sum(conc, 'received')), conc.length + ' pagos conciliados')}${kpi('Diferencia sin explicar', money(bad.reduce((s, m) => s + m.diff, 0)), bad.length + ' mes(es) en alerta', bad.length ? 'bad' : 'ok')}</div>
  <div class="grid2"><div class="card"><h3>Ingresos mensuales: bruto · esperado · recibido</h3><canvas id="c1"></canvas></div><div class="card"><h3>Ingresos por tipo</h3><canvas id="c2"></canvas></div></div>
  <div class="card"><h3>Diferencia por mes (esperado − recibido)</h3><canvas id="c3" height="80"></canvas></div>
  <div class="card"><h3>Accesos rápidos</h3><div class="toolbar"><a class="btn sm" href="#/reporte/conciliacion">Ver conciliación</a><a class="btn sm ghost" href="#/reporte/alertas">Diferencias a reclamar</a><a class="btn sm ghost" href="#/reporte/estado">Estado financiero</a></div></div>`;
  const L = months.map((m) => ymLabel(m.ym)), T = {}; months.forEach((m) => Object.entries(m.types).forEach(([k, v]) => (T[k] = (T[k] || 0) + v)));
  mk('c1', { type: 'bar', data: { labels: L, datasets: [{ label: 'Bruto', data: months.map((m) => m.gross), backgroundColor: PAL[0] }, { label: 'Esperado para ti', data: months.map((m) => m.expected), backgroundColor: PAL[1] }, { label: 'Recibido', data: months.map((m) => m.received), backgroundColor: PAL[2] }] }, options: { plugins: { legend: { position: 'bottom' } } } });
  mk('c2', { type: 'doughnut', data: { labels: Object.keys(T), datasets: [{ data: Object.values(T), backgroundColor: PAL, borderWidth: 0 }] }, options: { plugins: { legend: { position: 'bottom' } } } });
  mk('c3', { type: 'bar', data: { labels: L, datasets: [{ label: 'Diferencia (USD)', data: months.map((m) => m.diff), backgroundColor: months.map((m) => (m.status === 'bad' ? '#ff5d6c' : '#2ecc8f')) }] }, options: { plugins: { legend: { display: false } } } });
}

function vReportes() {
  $('view').innerHTML = '<p class="hint">Elige un reporte. Los filtros de plataforma y periodo (arriba) se aplican a todos.</p><div class="cards">' +
    REPORTS.map((r) => `<a class="rcard" href="#/reporte/${r.id}"><div class="ic">${r.ic}</div><h3>${r.title}</h3><p>${r.desc}</p></a>`).join('') + '</div>';
}

const rf = { tipo: 'todos', estado: 'todos' };
function vReporte(id) {
  const def = REPORTS.find((r) => r.id === id); if (!def) { location.hash = '#/reportes'; return; }
  killCharts(); $('title').textContent = def.title; $('crumb').innerHTML = '<a href="#/reportes" style="color:var(--acc)">Reportes</a> › ' + def.title;
  const c = ctx(), built = def.build(c, rf);
  if (!c.months.length && def.id !== 'egresos') { $('view').innerHTML = emptyHTML; return; }
  let extra = '';
  if (def.extra === 'tipo') extra = `<label>Tipo de ingreso <select id="xTipo"><option value="todos">Todos</option>${built.types.map((t) => `<option ${rf.tipo === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  if (def.extra === 'estado') extra = `<label>Estado <select id="xEstado">${[['todos', 'Todos'], ['bad', 'Solo «Revisar»'], ['ok', 'Solo «Cuadra»']].map(([v, t]) => `<option value="${v}" ${rf.estado === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const hasChart = built.chart && built.rows.length;
  $('view').innerHTML = `<div class="toolbar">${extra}<span class="sp"></span>${def.claim && built.rows.length ? '<button class="btn sm red" id="bClaim">Generar texto de reclamo</button>' : ''}<button class="btn sm ghost" id="bCsv">⬇ Exportar CSV</button><button class="btn sm ghost" onclick="window.print()">🖨 Imprimir / PDF</button></div>
  ${built.alert || ''}<div class="card"><div class="tablewrap">${tableHTML(built.cols, built.rows)}</div></div>
  ${hasChart ? `<div class="card"><canvas id="rc" height="${built.small ? 70 : 90}"></canvas></div>` : ''}`;
  if (hasChart) { const cfg = built.chart(c.months.map((m) => ymLabel(m.ym))); mk('rc', { ...cfg, options: { ...(cfg.options || {}), plugins: { legend: { position: 'bottom', ...(cfg.options?.plugins?.legend || {}) } } } }); }
  $('bCsv').onclick = () => exportCSV(def.id, built.cols, built.rows);
  if ($('xTipo')) $('xTipo').onchange = (e) => { rf.tipo = e.target.value; vReporte(id); };
  if ($('xEstado')) $('xEstado').onchange = (e) => { rf.estado = e.target.value; vReporte(id); };
  if ($('bClaim')) $('bClaim').onclick = () => claim(built.rows);
}
function claim(rows) {
  const tot = rows.reduce((s, m) => s + m.diff, 0), p = ui.plat === 'all' ? 'las plataformas' : Store.plat(ui.plat).name;
  const txt = `Asunto: Solicitud de detalle de liquidaciones — ${p}\n\nEstimados:\n\nAl conciliar los reportes de ganancias de la plataforma con los depósitos recibidos en mi cuenta, encuentro diferencias respecto a lo pactado en el contrato. Solicito el detalle de cálculo y de descuentos aplicados en los siguientes periodos:\n\n` +
    rows.map((m) => `• ${ymLabel(m.ym)}: esperado ${money(m.expected)}, recibido ${money(m.received)}, diferencia ${money(m.diff)} (${pctf(m.pct)})`).join('\n') + `\n\nDiferencia total: ${money(tot)}.\n\nQuedo atento/a a su respuesta y a los comprobantes correspondientes.\n\nSaludos cordiales.`;
  $('dlg').innerHTML = `<h3>Texto de reclamo</h3><textarea id="claimTxt">${esc(txt)}</textarea><div class="toolbar" style="margin-top:10px"><button class="btn sm" id="bCopy">Copiar</button><button class="btn sm ghost" id="bClose">Cerrar</button></div>`;
  $('dlg').showModal(); $('bClose').onclick = () => $('dlg').close();
  $('bCopy').onclick = () => { $('claimTxt').select(); (navigator.clipboard ? navigator.clipboard.writeText($('claimTxt').value) : Promise.resolve(document.execCommand('copy'))).then(() => toast('Texto copiado')); };
}

function platOpts(sel) { return Store.s.platforms.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join(''); }

function vCargas() {
  const ups = Store.s.uploads.slice().reverse();
  $('view').innerHTML = `<div class="card"><h3>Cargar archivo</h3><p class="hint">CSV o Excel descargado de la plataforma (reporte de ganancias) o del banco (movimientos). La plataforma define cómo se interpreta.</p>
  <div class="form inline"><label>Plataforma<select id="uPlat">${platOpts('onlyfans')}</select></label><label>Tipo de archivo<select id="uKind"><option value="earn">Reporte de ganancias</option><option value="bank">Estado de cuenta bancario</option></select></label>
  <label>Archivo<input type="file" id="uFile" accept=".csv,.xlsx,.xls"></label><button class="btn" id="uGo">Cargar</button></div><div id="uMsg" class="stat"></div></div>
  <div class="card"><h3>Historial de cargas</h3>${ups.length ? '<div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Archivo</th><th>Plataforma</th><th>Tipo</th><th>Filas</th><th></th></tr></thead><tbody>' + ups.map((u) => `<tr><td>${u.at}</td><td>${esc(u.name)}${u.demo ? ' <span class="pill na">demo</span>' : ''}</td><td>${esc(Store.plat(u.platId)?.name || '')}</td><td>${u.kind === 'earn' ? 'Ganancias' : 'Banco'}</td><td>${u.n}</td><td><button class="btn sm red" data-del="${u.id}">Eliminar</button></td></tr>`).join('') + '</tbody></table></div>' : '<p class="hint">Sin cargas todavía.</p>'}</div>
  <div class="card"><h3>Datos de ejemplo</h3><p class="hint">Restaura el conjunto ficticio (12 meses con retenciones simuladas) o borra todo para empezar con datos reales.</p><button class="btn sm" id="bDemo">Cargar datos de demostración</button> <button class="btn sm ghost" id="bWipe">Borrar todos los datos</button></div>`;
  $('uGo').onclick = async () => { const f = $('uFile').files[0]; if (!f) return toast('Elige un archivo primero', 1);
    const pid = $('uPlat').value, kind = $('uKind').value;
    try { const rows = await Ingesta.readRows(f), data = kind === 'earn' ? Ingesta.earn(rows, Store.plat(pid).fee) : Ingesta.bank(rows);
      Store.plat(pid).active = true;
      if (!Ingesta.addUpload(pid, kind, f.name, data)) throw new Error('No cabe en el almacenamiento del navegador.');
      toast(`✓ ${f.name}: ${data.length} filas cargadas`); vCargas(); fillFilters(); }
    catch (e) { $('uMsg').innerHTML = `<span class="neg">✗ ${esc(e.message)}</span>`; toast(e.message, 1); } };
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { Store.s.uploads = Store.s.uploads.filter((u) => u.id !== b.dataset.del); Store.save(); toast('Carga eliminada'); vCargas(); fillFilters(); }));
  $('bDemo').onclick = async () => { await seedDemo(); toast('Datos de demostración cargados'); vCargas(); fillFilters(); };
  $('bWipe').onclick = () => { if (confirm('¿Borrar todas las cargas y egresos de este navegador?')) { Store.reset(); toast('Datos borrados'); vCargas(); fillFilters(); } };
}

function vPlataformas() {
  $('view').innerHTML = `<div class="card"><h3>Plataformas</h3><p class="hint">Cada plataforma tiene su contrato: comisión, % de la agencia, meses de desfase de pago y tolerancia. Una plataforma inactiva no entra en los reportes.</p>
  <div class="tablewrap"><table><thead><tr><th>Plataforma</th><th>Comisión %</th><th>Agencia %</th><th>Desfase (meses)</th><th>Tolerancia %</th><th>Activa</th><th></th></tr></thead><tbody>${Store.s.platforms.map((p) => `<tr data-p="${p.id}"><td><span class="sw" style="background:${p.color}"></span>${esc(p.name)}</td>
    ${['fee', 'agency', 'lag', 'tol'].map((k) => `<td><input type="number" style="width:80px" data-k="${k}" value="${p[k]}" step="0.5" min="0"></td>`).join('')}<td><input type="checkbox" data-k="active" ${p.active ? 'checked' : ''}></td><td><button class="btn sm" data-save="${p.id}">Guardar</button></td></tr>`).join('')}</tbody></table></div>
  <p class="hint">La comisión se toma del reporte cargado; el valor de aquí solo se usa si el archivo no trae esa columna.</p></div>
  <div class="card"><h3>Agregar plataforma</h3><div class="form inline"><label>Nombre<input id="nName" placeholder="Ej. Fansly"></label><label>Comisión %<input type="number" id="nFee" value="20"></label><label>Agencia %<input type="number" id="nAg" value="0"></label><button class="btn" id="nAdd">Agregar</button></div>
  <p class="hint">Luego sube su reporte en «Cargas de archivos»; el sistema reconoce columnas de fecha, tipo, bruto, comisión y neto.</p></div>`;
  document.querySelectorAll('[data-save]').forEach((b) => (b.onclick = () => { const tr = b.closest('tr'), p = Store.plat(b.dataset.save);
    tr.querySelectorAll('[data-k]').forEach((i) => (p[i.dataset.k] = i.type === 'checkbox' ? i.checked : +i.value)); Store.save(); toast('Plataforma actualizada'); fillFilters(); }));
  $('nAdd').onclick = () => { const n = $('nName').value.trim(); if (!n) return toast('Escribe un nombre', 1); Store.s.platforms.push({ id: uid(), name: n, color: PAL[Store.s.platforms.length % PAL.length], fee: +$('nFee').value, agency: +$('nAg').value, lag: 1, tol: 2, active: true }); Store.save(); toast('Plataforma agregada'); vPlataformas(); fillFilters(); };
}

function vEgresos() {
  const list = Finanzas.egresos(ui.plat, ui.from, ui.to), today = new Date().toISOString().slice(0, 10);
  $('view').innerHTML = `<div class="card"><h3>Registrar egreso</h3><div class="form inline"><label>Plataforma<select id="eP">${platOpts('onlyfans')}</select></label><label>Fecha<input type="date" id="eD" value="${today}"></label><label>Concepto<input id="eC" placeholder="Ej. Contador"></label><label>Monto (USD)<input type="number" id="eA" step="0.01" min="0"></label><button class="btn" id="eAdd">Agregar</button></div></div>
  <div class="card"><h3>Egresos del periodo (${list.length})</h3>${list.length ? '<div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Plataforma</th><th>Monto</th><th></th></tr></thead><tbody>' + list.map((e) => `<tr><td>${e.date}</td><td>${esc(e.concept)}</td><td>${esc(Store.plat(e.platId)?.name || '')}</td><td>${money(e.amount)}</td><td><button class="btn sm red" data-del="${e.id}">Eliminar</button></td></tr>`).join('') + `</tbody><tfoot><tr><td>Total</td><td></td><td></td><td>${money(list.reduce((s, e) => s + e.amount, 0))}</td><td></td></tr></tfoot></table></div>` : '<p class="hint">Sin egresos en el filtro actual.</p>'}</div>`;
  $('eAdd').onclick = () => { const a = +$('eA').value, c = $('eC').value.trim(), d = $('eD').value; if (!a || !c || !d) return toast('Completa fecha, concepto y monto', 1);
    Store.s.egresos.push({ id: uid(), platId: $('eP').value, date: d, ym: d.slice(0, 7), concept: c, amount: a }); Store.save(); toast('Egreso agregado'); vEgresos(); };
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { Store.s.egresos = Store.s.egresos.filter((e) => e.id !== b.dataset.del); Store.save(); toast('Egreso eliminado'); vEgresos(); }));
}

function vAyuda() {
  $('view').innerHTML = `<div class="card"><h3>Cómo funciona</h3><ol class="steps"><li><b>Plataformas</b>: define el contrato de cada una (comisión, % de la agencia, desfase de pago, tolerancia).</li><li><b>Cargas de archivos</b>: sube el reporte mensual de ganancias (lo descarga quien administra la cuenta) y el estado de cuenta del banco.</li><li><b>Egresos</b>: registra tus gastos propios para ver el resultado real.</li><li><b>Reportes</b>: filtra por plataforma y periodo, mira ingresos, estado financiero y conciliación; exporta a CSV o imprime.</li><li><b>Diferencias a reclamar</b>: si algún mes no cuadra, genera el texto de reclamo con montos y meses.</li></ol></div>
  <div class="card"><h3>Qué es y qué no es esta demo</h3><p>Los datos de ejemplo son <b>ficticios</b>. Lo que cargues se guarda solo en este navegador (no se envía a ningún servidor). No se conecta a OnlyFans ni a ningún banco: trabaja con los archivos que tú cargues. El inicio de sesión es de muestra; una versión real tendría usuarios, base de datos y servicios propios.</p></div>`;
}

/* ---------------- router y filtros ---------------- */
const ROUTES = { resumen: ['Resumen', vResumen, true], reportes: ['Reportes', vReportes, true], cargas: ['Cargas de archivos', vCargas, false], plataformas: ['Plataformas', vPlataformas, false], egresos: ['Egresos', vEgresos, true], ayuda: ['Cómo funciona', vAyuda, false] };
function route() {
  killCharts(); const [, a, b] = (location.hash || '#/resumen').split('/'), key = a === 'reporte' ? 'reportes' : ROUTES[a] ? a : 'resumen';
  document.querySelectorAll('nav a').forEach((x) => x.classList.toggle('active', x.dataset.r === key));
  $('crumb').textContent = ''; $('filters').style.display = a === 'reporte' || ROUTES[key][2] ? '' : 'none';
  if (a === 'reporte') return vReporte(b);
  $('title').textContent = ROUTES[key][0]; ROUTES[key][1]();
}
function fillFilters() {
  const act = Store.s.platforms.filter((p) => p.active); if (ui.plat !== 'all' && !act.some((p) => p.id === ui.plat)) ui.plat = 'all';
  $('fPlat').innerHTML = '<option value="all">Todas las activas</option>' + act.map((p) => `<option value="${p.id}" ${p.id === ui.plat ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const [mn, mx] = Finanzas.range(ui.plat); $('fFrom').min = $('fTo').min = mn; $('fFrom').max = $('fTo').max = mx;
}
$('fPlat').onchange = (e) => { ui.plat = e.target.value; fillFilters(); route(); };
$('fFrom').onchange = (e) => { ui.from = e.target.value; route(); };
$('fTo').onchange = (e) => { ui.to = e.target.value; route(); };
$('fClear').onclick = () => { ui.from = ui.to = ''; $('fFrom').value = $('fTo').value = ''; route(); };
window.addEventListener('hashchange', route);

function enter() { $('login').hidden = true; $('app').hidden = false; fillFilters(); route(); }
$('loginForm').onsubmit = (e) => { e.preventDefault(); try { sessionStorage.setItem('fsd-in', '1'); } catch (x) {} enter(); };
$('btnLogout').onclick = () => { try { sessionStorage.removeItem('fsd-in'); } catch (x) {} $('app').hidden = true; $('login').hidden = false; };

(async () => {
  Store.load(); if (!Store.s.seeded) { try { await seedDemo(); } catch (e) { console.warn('No se pudo cargar la demo', e); } }
  const q = new URLSearchParams(location.search); let inn = false; try { inn = sessionStorage.getItem('fsd-in') === '1'; } catch (e) {}
  if (inn || q.has('auto')) enter();
})();
