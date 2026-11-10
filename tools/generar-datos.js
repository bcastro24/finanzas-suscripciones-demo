// Genera datos FICTICIOS de demo (no son datos reales de ninguna cuenta).
const fs = require('fs');
let s = 42; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const tipos = [['Suscripción', 0.52], ['Propina', 0.18], ['Mensaje de pago', 0.17], ['Publicación de pago', 0.08], ['Referido', 0.05]];
const pick = () => { let r = rnd(), a = 0; for (const [t, p] of tipos) { a += p; if (r <= a) return t; } return tipos[0][0]; };
const rows = ['Fecha,Descripción,Monto bruto (USD),Comisión plataforma (USD),Neto (USD)'];
const meses = []; const AGENCIA = 0.30; const bank = ['Fecha,Concepto,Monto (USD)'];
for (let m = 0; m < 12; m++) {
  const y = 2025 + Math.floor((m + 0) / 12), mo = (m % 12) + 1;
  const base = 2600 + m * 190 + rnd() * 500; let tot = 0, n = 0;
  while (tot < base) { const t = pick(); const amt = Math.round((t === 'Suscripción' ? 9 + rnd() * 10 : 4 + rnd() * 60) * 100) / 100;
    const d = 1 + Math.floor(rnd() * 28); const gross = amt, fee = Math.round(gross * 0.2 * 100) / 100, net = Math.round((gross - fee) * 100) / 100;
    rows.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')},${t},${gross.toFixed(2)},${fee.toFixed(2)},${net.toFixed(2)}`); tot += gross; n++; }
  const net = tot * 0.8; let pago = net * (1 - AGENCIA);
  // Meses con retención indebida simulada (para mostrar alertas)
  if ([3, 6, 9, 10].includes(m)) pago *= 0.82 - rnd() * 0.08;
  const ny = mo === 12 ? y + 1 : y, nm = mo === 12 ? 1 : mo + 1;
  bank.push(`${ny}-${String(nm).padStart(2, '0')}-08,Transferencia agencia (pago ${y}-${String(mo).padStart(2, '0')}),${pago.toFixed(2)}`);
}
fs.writeFileSync('demo-datos/onlyfans_earnings_demo.csv', rows.join('\n') + '\n');
fs.writeFileSync('demo-datos/banco_demo.csv', bank.join('\n') + '\n');
console.log('filas ingresos:', rows.length - 1, '| depósitos:', bank.length - 1);
