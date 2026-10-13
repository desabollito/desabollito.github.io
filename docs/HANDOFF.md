# Desabollito: traspaso para otra sesión

App de gestión de granizo/PDR del usuario (@gzmatte, el "creador"). Respuestas cortas en español, modo ponytail (ver `CLAUDE.md`).

## Piezas y cómo se conectan

- **Web-app** (este repo, GitHub Pages en `desabollito.com`). HTML/JS/CSS sin build. `js/app.js` (rutas, transiciones, actualizaciones), `js/data.js` (estado `S`, Firestore, permisos), `views-*.js` (pantallas), `sw.js` (service worker/caché).
- **Firebase**: Auth (usuario = `usuario@dominio` interno) + Firestore. Reglas en `firestore.rules` (se publican solas con el workflow `deploy-reglas.yml`).
- **Cloudinary**: fotos/documentos (carpeta `desabollito/<cid>/<vid>`). Se borran desde el bot.
- **Bot de WhatsApp** (`bot/worker.js`): Cloudflare Worker `desabollito-bot.desabollito.workers.dev`, se despliega solo al pushear `bot/` (`deploy-bot.yml`). Recibe mensajes por Evolution API (VM en Oracle, `desabollito.duckdns.org`). El bot Meta está en desuso.
- El Worker también es la API "privilegiada" de la app: links de perito (`/compartir`, `/compartido`), panel del creador (`/admin/*`), borrar operativo con confirmación por WhatsApp, recuperar contraseña, aviso de versión (`/aviso-version`).

## Datos (Firestore)

- `companies/{cid}` = operativo (members, roles owner/admin/tecnico/desmontaje). Sub: `vehicles`, `gastos`, `planTec` (`_config` técnicos/sueldos/movs, `_fijos` viandas/alquiler), `solicitudes`.
- `users/{uid}` (perfil, `notifVisto`), `usernames/{u}`, `config/app` (switches del creador, `accesos`, `sonidoAuto`).
- Bot: `bot_sesiones/{numero}`, `bot_operativo`, `bot_grupos`, `bot_grupo_op` (grupo→operativo), `bot_resumen`, `bot_borrados`, `bot_meta/deploy`.
- `compartidos/{token}` = links de perito (también se generan páginas `/<token>/` por el workflow `links-cortos.yml`).

## Cómo trabajar

- Cambio en la app: bump de versión en `js/config.js` (APP_VERSION) y `sw.js`, entrada en `js/novedades.js`, commit y push a `main`. Al terminar el deploy, el bot avisa "✅ versión" al WhatsApp del creador.
- Tareas admin puntuales sobre Firestore: workflow temporal en `.github/workflows/` + script en `.github/scripts/` con el secret `FIREBASE_SERVICE_ACCOUNT`; resultados como `::notice::` (máx. 10) leídos por la API de check-runs; después se borra.
- Desde la sesión en la nube no se llega por curl al Worker ni a la web (proxy); `gh api` sí funciona.
- Probar la app: Playwright con un mock de `js/firebase.js` (se armaba en un scratchpad, no está en el repo).

## Pendiente del lado del usuario

- Migración de la VM de Evolution a Oracle A1 (si no terminó) y "Enforce HTTPS" en GitHub Pages.
