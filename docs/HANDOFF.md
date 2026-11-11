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
- `companies/{cid}/planHist/{tecnicos|fijos|facturacion}/cambios/{id}` = historial de las planillas, solo se agrega (`js/versiones.js`): autor, hora del servidor, detalle y cómo estaban antes los documentos. Toda escritura de esas planillas pasa por `V.escribir`; el bot avisa al creador con `/aviso-planilla`.
- `users/{uid}` (perfil, `notifVisto`), `usernames/{u}`, `config/app` (switches del creador, `accesos`, `sonidoAuto`).
- Bot: `bot_sesiones/{numero}`, `bot_operativo`, `bot_grupos`, `bot_grupo_op` (grupo→operativo), `bot_resumen`, `bot_borrados`, `bot_meta/deploy`.
- `compartidos/{token}` = links de perito (también se generan páginas `/<token>/` por el workflow `links-cortos.yml`).

## Reglas del usuario (importante)

- **Todo cambio va directo a producción** sin preguntar: commit y push a `main` en cuanto está listo. No esperar a que GitHub Pages publique ni verificar con curl.
- **`/tester` no se usa más**: los cambios van solo a la raíz (`js/`, `css/`, `index.html`, `sw.js`). No copiar a `tester/`.
- **Respuestas cortas**, en español, al grano (1-3 líneas de resumen).
- **Identidad visual fija**: letra Inter, oscuro neutro `#0e0e10`, la paleta actual y los radios `--r-sm 6 / --r 9 / --r-lg 13 / --r-xl 18`. Si algo cambia la identidad (letra, colores, fondo), mostrarle una captura o maqueta antes de publicar.
- Gustos de diseño ya decididos: Ajustes en grupos (perfil con WhatsApp adentro, Papelera y Cerrar sesión como filas al final); la hoja "Filtrar y ordenar" con el diseño original de filas de botones (no en pastillas); compañías en los filtros a todo el ancho, con barra y sin flechas; Planillas se abren tocando dos veces Calendario (nada de "mantener apretado" para eso); nada de 5 botones en la barra de abajo.
- Al mantener apretado no debe salir el menú del navegador (ya resuelto en `app.js` + CSS `-webkit-touch-callout`).
- Commits: identidad `git -c user.name=Claude -c user.email=noreply@anthropic.com commit ...`.
- No usar PowerShell `Get-Content`/`Set-Content` para editar (rompe acentos) ni `python` (no está instalado en la PC). Usar Edit, sed o node.

## Cómo trabajar

- Cambio en la app: bump de versión en `js/config.js` (APP_VERSION) y `sw.js` (`VERSION`, "desabollito-vX.Y.Z"), entrada nueva arriba de todo en `js/novedades.js`, commit y push a `main`. Al terminar el deploy, el bot avisa "✅ versión" al WhatsApp del creador.
- Si cambia `firestore.rules`, se publica sola con `deploy-reglas.yml` al pushear (desde la PC también: `npx -y firebase-tools deploy --only firestore:rules` en esta carpeta).
- Chequeos antes de publicar: `node --input-type=module --check < archivo.js` en cada JS tocado y `node tests/versiones.test.mjs`.
- Panel del creador: se abre manteniendo apretado Ajustes (solo @gzmatte). Mantener apretado el botón del operativo abre Ajustes.
- Tareas admin puntuales sobre Firestore: workflow temporal en `.github/workflows/` + script en `.github/scripts/` con el secret `FIREBASE_SERVICE_ACCOUNT`; resultados como `::notice::` (máx. 10) leídos por la API de check-runs; después se borra.
- Desde la sesión en la nube no se llega por curl al Worker ni a la web (proxy); `gh api` sí funciona.
- Probar la app: Playwright con un mock de `js/firebase.js` (se armaba en un scratchpad, no está en el repo).

## Pendiente del lado del usuario

- Migración de la VM de Evolution a Oracle A1 (si no terminó) y "Enforce HTTPS" en GitHub Pages.
