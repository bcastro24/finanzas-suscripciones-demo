'use strict';
/* ============================================================
   Capa de "servicios" del sistema (demo, corre en el navegador).
   En una versión con backend, cada módulo pasa a ser un microservicio:
     Store → base de datos · Ingesta → servicio de carga · Finanzas / Conciliacion → servicios de cálculo
   ============================================================ */

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ymLabel = (ym) => (ym ? MES[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4) : '—');
const ymShift = (ym, k) => { let y = +ym.slice(0, 4), m = +ym.slice(5) - 1 + k; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); };
const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------------- Store: persistencia local ---------------- */
const KEY = 'fsd-v2';
const DEFAULT_PLATFORMS = () => [
  { id: 'onlyfans', name: 'OnlyFans', color: '#4f8cff', fee: 20, agency: 30, lag: 1, tol: 2, active: true },
  { id: 'fansly', name: 'Fansly', color: '#b07cff', fee: 20, agency: 30, lag: 1, tol: 2, active: false },
  { id: 'patreon', name: 'Patreon', color: '#ff7ab6', fee: 8, agency: 0, lag: 1, tol: 2, active: false }
];
const Store = {
  s: null,
  load() {
    try { this.s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { this.s = null; }
    if (!this.s) this.s = { platforms: DEFAULT_PLATFORMS(), uploads: [], egresos: [], seeded: false };
    return this.s;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); return true; } catch (e) { return false; } },
  reset() { this.s = { platforms: DEFAULT_PLATFORMS(), uploads: [], egresos: [], seeded: true }; this.save(); },
  plat(id) { return this.s.platforms.find((p) => p.id === id); }
};

/* ---------------- Ingesta: lectura y normalización ---------------- */
const Ingesta = {
  splitCSV(text) {
    const rows = []; let r = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === ',' || c === ';') { r.push(f); f = ''; }
      else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; } else if (c !== '\r') f += c; }
    if (f || r.length) { r.push(f); rows.push(r); }
    return rows.filter((x) => x.some((v) => String(v).trim() !== ''));
  },
  async readRows(file) {
    if (/\.csv$/i.test(file.name)) return this.splitCSV(await file.text());
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  },
  num(v) { if (typeof v === 'number') return v; const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; },
  ym(v) {
    if (v instanceof Date) { const d = new Date(v.getTime() + 12 * 3600e3); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
    const s = String(v).trim(); let m = s.match(/^(\d{4})[-\/](\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0');
    m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/); return m ? m[3] + '-' + m[2].padStart(2, '0') : null;
  },
  col(h, re, not) { return h.findIndex((x) => re.test(String(x)) && !(not && not.test(String(x)))); },
  earn(rows, feePct) {
    const h = rows[0], c = { d: this.col(h, /fecha|date/i), t: this.col(h, /descrip|tipo|type/i), g: this.col(h, /bruto|gross|amount|monto/i, /comisi|fee|neto|net/i), f: this.col(h, /comisi|fee/i), n: this.col(h, /neto|net/i) };
    if (c.d < 0 || (c.g < 0 && c.n < 0)) throw new Error('No encuentro las columnas de fecha y monto en el reporte. Revisa el encabezado del archivo.');
    const out = rows.slice(1).map((r) => { const ym = this.ym(r[c.d]); if (!ym) return null;
      let g = c.g >= 0 ? this.num(r[c.g]) : 0, f = c.f >= 0 ? this.num(r[c.f]) : null, n = c.n >= 0 ? this.num(r[c.n]) : null;
      if (!g && n != null) g = n / (1 - feePct / 100); if (f == null) f = g * feePct / 100; if (n == null) n = g - f;
      return { ym, type: c.t >= 0 ? String(r[c.t]) : 'Otro', gross: g, fee: f, net: n }; }).filter(Boolean);
    if (!out.length) throw new Error('El archivo no tiene movimientos con fecha válida.'); return out;
  },
  bank(rows) {
    const h = rows[0], c = { d: this.col(h, /fecha|date/i), t: this.col(h, /concepto|descrip|detalle/i), a: this.col(h, /monto|amount|valor|cr[eé]dito/i) };
    if (c.d < 0 || c.a < 0) throw new Error('No encuentro las columnas de fecha y monto en el estado de cuenta.');
    const out = rows.slice(1).map((r) => { const ym = this.ym(r[c.d]), a = this.num(r[c.a]); return ym && a > 0 ? { ym, concept: c.t >= 0 ? String(r[c.t]) : '', amt: a } : null; }).filter(Boolean);
    if (!out.length) throw new Error('No se encontraron depósitos con fecha y monto válidos.'); return out;
  },
  egresos(rows) {
    const h = rows[0], c = { d: this.col(h, /fecha|date/i), t: this.col(h, /concepto|descrip|detalle/i), a: this.col(h, /monto|amount|valor/i) };
    if (c.d < 0 || c.a < 0) throw new Error('No encuentro fecha y monto en el archivo de egresos.');
    return rows.slice(1).map((r) => { const ym = this.ym(r[c.d]), a = this.num(r[c.a]); return ym && a > 0 ? { id: uid(), date: String(r[c.d]).slice(0, 10), ym, concept: c.t >= 0 ? String(r[c.t]) : 'Egreso', amount: a } : null; }).filter(Boolean);
  },
  /** Registra un archivo cargado asociado a una plataforma. */
  addUpload(platId, kind, name, data) {
    Store.s.uploads.push({ id: uid(), platId, kind, name, at: new Date().toISOString().slice(0, 16).replace('T', ' '), n: data.length, data });
    return Store.save();
  }
};

/* ---------------- Finanzas + Conciliación ---------------- */
const Finanzas = {
  /** Meses con datos para una plataforma ('all' = todas las activas). */
  platIds(plat) { return plat === 'all' ? Store.s.platforms.filter((p) => p.active).map((p) => p.id) : [plat]; },
  range(plat) {
    const ids = this.platIds(plat), yms = [];
    Store.s.uploads.filter((u) => u.kind === 'earn' && ids.includes(u.platId)).forEach((u) => u.data.forEach((r) => yms.push(r.ym)));
    yms.sort(); return yms.length ? [yms[0], yms[yms.length - 1]] : ['', ''];
  },
  /** Cálculo mensual de una plataforma. */
  one(platId, from, to) {
    const p = Store.plat(platId), by = {};
    Store.s.uploads.filter((u) => u.kind === 'earn' && u.platId === platId).forEach((u) => u.data.forEach((e) => {
      if ((from && e.ym < from) || (to && e.ym > to)) return;
      const m = (by[e.ym] ||= { ym: e.ym, plat: platId, gross: 0, fee: 0, net: 0, types: {} });
      m.gross += e.gross; m.fee += e.fee; m.net += e.net; m.types[e.type] = (m.types[e.type] || 0) + e.gross; }));
    const bank = {}; Store.s.uploads.filter((u) => u.kind === 'bank' && u.platId === platId).forEach((u) => u.data.forEach((b) => (bank[b.ym] = (bank[b.ym] || 0) + b.amt)));
    const egr = {}; Store.s.egresos.filter((e) => (e.platId || 'onlyfans') === platId).forEach((e) => (egr[e.ym] = (egr[e.ym] || 0) + e.amount));
    return Object.values(by).map((m) => {
      m.agency = m.net * p.agency / 100; m.expected = m.net - m.agency; m.egr = egr[m.ym] || 0; m.result = m.expected - m.egr;
      m.payYm = ymShift(m.ym, p.lag); m.received = m.payYm in bank ? bank[m.payYm] : null;
      m.diff = m.received == null ? null : m.expected - m.received; m.pct = m.diff == null ? null : m.diff / m.expected;
      m.status = m.received == null ? 'na' : m.pct > p.tol / 100 ? 'bad' : 'ok'; return m; });
  },
  /** Meses consolidados (todas las plataformas activas si plat='all'). */
  months(plat, from, to) {
    const all = this.platIds(plat).flatMap((id) => this.one(id, from, to)), by = {};
    all.forEach((m) => { const a = by[m.ym];
      if (!a) { by[m.ym] = { ...m, types: { ...m.types } }; return; }
      ['gross', 'fee', 'net', 'agency', 'expected', 'egr', 'result'].forEach((k) => (a[k] += m[k]));
      Object.entries(m.types).forEach(([k, v]) => (a.types[k] = (a.types[k] || 0) + v));
      if (m.received != null) { a.received = (a.received || 0) + m.received; a.diff = (a.diff || 0) + m.diff; }
      a.status = a.status === 'bad' || m.status === 'bad' ? 'bad' : a.received == null ? 'na' : 'ok'; a.pct = a.diff == null ? null : a.diff / a.expected; });
    return Object.values(by).sort((a, b) => a.ym.localeCompare(b.ym));
  },
  sum(rows, k) { return rows.reduce((s, x) => s + (x[k] || 0), 0); },
  egresos(plat, from, to) {
    const ids = this.platIds(plat);
    return Store.s.egresos.filter((e) => ids.includes(e.platId || 'onlyfans') && !((from && e.ym < from) || (to && e.ym > to))).sort((a, b) => b.date.localeCompare(a.date));
  }
};

/* ---------------- Datos de demostración ---------------- */
async function seedDemo() {
  const get = async (u) => Ingesta.splitCSV(await (await fetch(u)).text());
  const fee = Store.plat('onlyfans').fee;
  Store.s.uploads = Store.s.uploads.filter((u) => !u.demo);
  Store.s.egresos = Store.s.egresos.filter((e) => !e.demo);
  const e = Ingesta.earn(await get('demo-datos/onlyfans_earnings_demo.csv'), fee), b = Ingesta.bank(await get('demo-datos/banco_demo.csv'));
  Ingesta.addUpload('onlyfans', 'earn', 'onlyfans_earnings_demo.csv', e); Ingesta.addUpload('onlyfans', 'bank', 'banco_demo.csv', b);
  Store.s.uploads.slice(-2).forEach((u) => (u.demo = true));
  Ingesta.egresos(await get('demo-datos/egresos_demo.csv')).forEach((x) => Store.s.egresos.push({ ...x, platId: 'onlyfans', demo: true }));
  Store.s.seeded = true; Store.save();
}
