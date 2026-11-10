// Egresos FICTICIOS de demo, derivados del reporte de ingresos ficticio.
const fs = require('fs');
const lines = fs.readFileSync('demo-datos/onlyfans_earnings_demo.csv', 'utf8').trim().split('\n').slice(1);
const gross = {}; lines.forEach((l) => { const c = l.split(','); const ym = c[0].slice(0, 7); gross[ym] = (gross[ym] || 0) + parseFloat(c[2]); });
let s = 7; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const out = ['Fecha,Concepto,Monto (USD)'];
Object.keys(gross).sort().forEach((ym) => {
  out.push(`${ym}-15,Contador,60.00`); out.push(`${ym}-20,Estudio y equipo,120.00`);
  out.push(`${ym}-22,Publicidad,${(60 + rnd() * 160).toFixed(2)}`); out.push(`${ym}-25,Impuestos,${(gross[ym] * 0.8 * 0.05).toFixed(2)}`);
});
fs.writeFileSync('demo-datos/egresos_demo.csv', out.join('\n') + '\n'); console.log('egresos:', out.length - 1);
