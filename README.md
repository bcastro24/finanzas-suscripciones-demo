# Control financiero de plataformas de suscripción (DEMO)

Página estática (HTML + JS) para ver el estado financiero de una plataforma de suscripción (caso inicial: OnlyFans)
y conciliarlo con el estado de cuenta bancario. Datos del demo **ficticios**; todo se procesa en el navegador.

## Probar
```bash
python3 -m http.server 8765    # luego abrir http://localhost:8765/?demo
```
Sin `?demo` la página inicia vacía: ir a **Cargar reportes** y subir CSV/XLSX propios.

- `demo-datos/` — CSV ficticios (`node tools/generar-datos.js` los regenera)
- `informe/` — `Informe-Viabilidad.pdf` (fuente `informe.html` + capturas)

**No subir datos reales a este repo** (ver `.gitignore`).
