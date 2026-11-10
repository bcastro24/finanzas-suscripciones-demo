# Mi Control — finanzas de plataformas de suscripción (DEMO)

Sistema web (HTML + JS, sin servidor) para ver ingresos de plataformas de suscripción (caso inicial: OnlyFans),
filtrar reportes por plataforma y periodo, y conciliarlos con el estado de cuenta bancario.

**Demo en línea:** https://bcastro24.github.io/finanzas-suscripciones-demo/ (usuario y clave de muestra: `demo` / `demo`)

- Menús: Resumen · Reportes (6) · Cargas de archivos · Plataformas · Egresos · Ayuda
- Datos del demo **ficticios**. Lo que se cargue se guarda solo en el navegador; nada se envía a un servidor.
- `services.js` (Store / Ingesta / Finanzas+Conciliación) + `app.js` (interfaz)
- `demo-datos/` — CSV ficticios (`node tools/generar-datos.js && node tools/generar-egresos.js` los regenera)
- `informe/Informe-Viabilidad.pdf` — informe de viabilidad con capturas

## Local
```bash
python3 -m http.server 8765    # http://localhost:8765/
```

**No subir datos reales a este repo** (ver `.gitignore`).
