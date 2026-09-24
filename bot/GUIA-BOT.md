# Bot de WhatsApp · Guía de puesta en marcha

El bot recibe fotos por WhatsApp y las guarda en el vehículo, en la web, al instante.

El bot es **de toda la app**: nadie tiene que vincular su cuenta. Cualquiera del equipo le escribe, manda la patente y las fotos, y el bot busca esa patente en **todos los operativos** para saber dónde guardarlas.

**Cómo se usa:** mandar la patente → el bot abre ese vehículo → cada foto que llega después se guarda ahí y el bot la marca con ✅ → "listo" para cerrar.

Hay que hacer 5 cosas, en este orden. Vas a ir juntando **10 datos** que al final se pegan en Cloudflare. Anotalos en un bloc de notas a medida que los consigas (y no los subas a GitHub).

| # | Dato | De dónde sale |
|---|---|---|
| 1 | `FIREBASE_PROJECT_ID` | Paso 1 |
| 2 | `FIREBASE_CLIENT_EMAIL` | Paso 1 |
| 3 | `FIREBASE_PRIVATE_KEY` | Paso 1 |
| 4 | `CLOUDINARY_CLOUD_NAME` | Paso 2 (es `dkfedvsn`) |
| 5 | `CLOUDINARY_API_KEY` | Paso 2 |
| 6 | `CLOUDINARY_API_SECRET` | Paso 2 |
| 7 | `WHATSAPP_VERIFY_TOKEN` | Lo inventás vos (paso 3) |
| 8 | `WHATSAPP_PHONE_ID` | Paso 4 |
| 9 | `WHATSAPP_TOKEN` | Paso 4 |
| 10 | `WHATSAPP_APP_SECRET` | Paso 4 |
| 11 | `NUMEROS_PERMITIDOS` | Opcional (ver "Candado") |

---

## Paso 1 · Clave de Firebase (5 min)

Le permite al bot escribir en la base.

1. https://console.firebase.google.com → proyecto **desabollitoorg**.
2. ⚙ (arriba a la izquierda) → **Configuración del proyecto** → pestaña **Cuentas de servicio**.
3. **Generar nueva clave privada** → **Generar clave**. Se descarga un archivo `.json`.
4. Abrilo con el Bloc de notas y copiá:
   - `project_id` → dato 1
   - `client_email` → dato 2
   - `private_key` → dato 3. Copiá todo lo que está entre las comillas, desde `-----BEGIN PRIVATE KEY-----` hasta `-----END PRIVATE KEY-----\n`. Los `\n` van tal cual.

Ese archivo da acceso total a la base: guardalo en un lugar seguro y nunca lo subas a GitHub.

## Paso 2 · Claves de Cloudinary (2 min)

1. https://console.cloudinary.com → ⚙ **Settings** → **API Keys**.
2. Copiá **API Key** → dato 5, y **API Secret** (tocá el ojito) → dato 6.

## Paso 3 · Crear el bot en Cloudflare (10 min)

1. Creá una cuenta gratis en https://dash.cloudflare.com/sign-up.
2. Menú izquierdo → **Workers & Pages** → **Create** → **Create Worker** (o "Start with Hello World").
3. Nombre: `desabollito-bot` → **Deploy**.
4. Tocá **Edit code**. Borrá todo lo que hay y pegá el contenido completo de `bot/worker.js`. → **Deploy**.
5. Volvé al Worker → **Settings** → **Variables and Secrets** → **Add**. Agregá los 10 datos, cada uno con tipo **Secret**:
   - Para `WHATSAPP_VERIFY_TOKEN` inventá una frase sin espacios, por ejemplo `granizo-2026-verif`. Anotala: la vas a usar en el paso 4.
   - Los datos 8, 9 y 10 todavía no los tenés: cargalos cuando termines el paso 4.
   - Al terminar, **Deploy**.
6. Copiá la dirección del Worker, algo como `https://desabollito-bot.TU-USUARIO.workers.dev`. Abrila en el navegador: tiene que decir **"Desabollito bot funcionando ✅"**.

## Paso 4 · WhatsApp en Meta (30–60 min, la parte más larga)

### 4.1 Cuenta y app
1. Entrá a https://business.facebook.com y creá una **cuenta comercial** (Meta Business) si no tenés.
2. Entrá a https://developers.facebook.com → **Mis apps** → **Crear app**.
   - Caso de uso: **"Conectarte con clientes a través de WhatsApp"** (si no aparece: "Otro" → tipo **Negocios**).
   - Vinculala a tu cuenta comercial.
3. En el panel de la app, andá a **WhatsApp → Configuración de la API** (API Setup).

### 4.2 Probar primero con el número de prueba (recomendado)
Meta te da un **número de prueba** gratis, listo para usar.
1. En **Configuración de la API**, en "Para" (To), agregá tu número personal y verificalo con el código que te llega. Se pueden agregar hasta 5 números.
2. Copiá el **Identificador del número de teléfono** (Phone number ID) → dato 8. Ojo: es un número largo de identificación, **no** el teléfono.

### 4.3 Token permanente (dato 9)
El token que aparece en "Configuración de la API" vence en 24 h; hace falta uno permanente:
1. https://business.facebook.com → ⚙ **Configuración** → **Usuarios** → **Usuarios del sistema** → **Agregar**.
   - Nombre: `desabollito-bot`, rol **Administrador**.
2. Con ese usuario elegido: **Asignar activos** → asignale la **app** (control total) y tu **cuenta de WhatsApp** (control total).
3. **Generar token** → elegí la app → caducidad **Nunca** → permisos `whatsapp_business_messaging` y `whatsapp_business_management` → **Generar**.
4. Copialo → dato 9. Solo se muestra una vez.

### 4.4 App secret (dato 10)
developers.facebook.com → tu app → **Configuración de la app** → **Básica** → **Clave secreta de la app** → **Mostrar** → dato 10.

Ahora volvé a Cloudflare y cargá los datos 8, 9 y 10 (paso 3.5) → **Deploy**.

### 4.5 Conectar el webhook
1. developers.facebook.com → tu app → **WhatsApp** → **Configuración** → **Webhook** → **Editar**.
   - **URL de devolución de llamada:** la dirección del Worker + `/webhook`
     (ej: `https://desabollito-bot.TU-USUARIO.workers.dev/webhook`)
   - **Token de verificación:** el mismo `WHATSAPP_VERIFY_TOKEN` del paso 3.
   - **Verificar y guardar**. Si da error, revisá que el token sea idéntico.
2. En **Campos del webhook** → **Administrar** → suscribite a **messages**.

## Paso 5 · Probar

1. Desde tu WhatsApp, escribile **"hola"** al número de prueba de Meta. Tiene que contestarte con las instrucciones.
2. Mandale una patente que exista en la app, después una foto. La foto tiene que aparecer en el vehículo en la web y el bot la marca con ✅.

### Acelerar la búsqueda (recomendado, 2 min)
El bot busca la patente en todos los operativos con una sola consulta. Para eso Firebase necesita un índice:
1. Firebase → **Firestore Database** → **Índices** → pestaña **Campo único** (Single field) → **Agregar exención**.
2. ID de colección: `vehicles` · Ruta del campo: `patente` → Siguiente.
3. En **Grupo de colecciones** activá **Ascendente** → **Guardar**. Tarda unos minutos en crearse.

Sin el índice el bot funciona igual: recorre los operativos uno por uno. Con muchos operativos, eso es más lento.

### Candado (opcional)
Como no hay vinculación de cuentas, cualquiera que conozca el número del bot podría mandarle fotos a una patente. El bot no devuelve datos del cliente (solo modelo, patente y nombre del operativo), pero si querés restringirlo:
- En Cloudflare agregá el secreto `NUMEROS_PERMITIDOS` con los números del equipo separados por coma, en formato internacional sin `+`.
  Ej: `5493515551234,5491123456789`.
- Vacío o sin cargar: el bot acepta a cualquiera.
- Se puede cambiar cuando quieras sin tocar la app.

### Si no contesta: diagnóstico
Abrí en el navegador (cambiando por tus datos):

`https://desabollito-bot.TU-USUARIO.workers.dev/diagnostico?token=TU_WHATSAPP_VERIFY_TOKEN`

Revisa cada pieza (variables, Firebase, WhatsApp, Cloudinary, si Meta está mandando los mensajes) y marca con ❌ la que falla, con el motivo. No muestra ningún secreto.
- Si dice que la cuenta de WhatsApp **no está suscripta**, abrí la misma dirección agregando `&arreglar=1` al final.
- Después de cada cambio, mandale "hola" al bot y recargá el diagnóstico.

---

## Pasar a producción (cuando la prueba funcione)

1. **Número propio del bot:** WhatsApp → Configuración de la API → **Agregar número de teléfono**.
   - Tiene que ser un número que **no esté usando WhatsApp** (ni común ni Business). Sirve un chip nuevo o una línea fija que pueda recibir SMS o llamada.
   - Cuando esté verificado, cambiá `WHATSAPP_PHONE_ID` en Cloudflare por el ID del número nuevo → **Deploy**.
2. **Publicar la app de Meta:** Configuración de la app → Básica:
   - **URL de la política de privacidad:** `https://desabollito.github.io/privacidad.html`
   - Categoría, ícono (podés usar `img/app-512.png`) → Guardar.
   - Arriba, cambiá el modo de la app de **Desarrollo** a **Activo** (Live).
3. Meta puede pedirte **verificar el negocio** y cargar un **medio de pago** en WhatsApp Manager. Las respuestas del bot a mensajes que le mandan ustedes suelen entrar en lo gratuito, pero revisá la tarifa vigente de Meta.
4. Pasame el número del bot y lo cargo en la app (`WHATSAPP_BOT` en `js/config.js`) para que aparezca el botón **"Abrir chat con el bot"** en Ajustes.

## Cómo lo usa el equipo

- **hola:** saludo con las instrucciones básicas.
- **ayuda:** explicación completa, operativo actual y vehículo abierto.
- **Datos del vehículo** en un mensaje, en cualquier orden. Solo la patente es obligatoria:
  - `Corolla AB099BA Riv 1137709755 Monte`
  - `FFF000 FEDERACION`
  - `ab 123 cd toyota hilux sancor entre rios 3515551234 g2`

  El bot reconoce:
  - la patente (AA000AA o AAA000, con o sin espacios o guiones),
  - el teléfono (con o sin +54, 9 o 0),
  - la compañía, aunque esté abreviada: Riv → Rivadavia, Fed → Federación Patronal, Merc → Mercantil Andina,
  - la localidad,
  - la marca o el modelo,
  - el grado (G1, G2, G3 o "grado 2").
- **Al recibir los datos**, el bot no escribe: marca el mensaje con ✅ para indicar que lo tomó.
- **Si la patente existe:** abre ese vehículo. Si el mensaje trae datos nuevos (por ejemplo la compañía), los completa en la web.
- **Si la patente no existe:** la crea en la web sin preguntar:
  1. En el operativo que se **nombre en el mensaje** (ej: `AB099BA Corolla Rosario` → operativo "Rosario"). Sirve el nombre completo o sin palabras como "Operativo" o "Granizo".
  2. Si no se nombra ninguno, en el **último operativo usado** (el último nombrado, elegido o el del último vehículo abierto).
  3. Solo si no hay ninguno de los dos, pregunta en cuál.
- **operativo:** cambia el operativo actual sin cargar ningún vehículo.
- **Fotos:** se mandan todas juntas. El bot no responde nada.
- **Otro vehículo:** mandar sus datos. El anterior se cierra en silencio.
- **OK** (o cualquier texto después de las fotos): el bot manda un solo resumen con todos los vehículos cargados desde el último OK: "✅ Guardé X fotos en …", y 🆕 en los que creó.
- El bot solo escribe cuando tiene que preguntar algo (por ejemplo, en qué operativo cargar si todavía no hay ninguno).
- Las fotos que llegan desordenadas van igual al vehículo correcto: el bot usa la hora en que se mandó cada una.
- Si alguien manda fotos sin haber mandado una patente, el bot avisa una sola vez por tanda.

En la web, al abrir una foto se ve "por WhatsApp (nombre)" para saber quién la mandó.
