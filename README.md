# Desabollito 2

Gestión de trabajos de granizo: peritajes, turnos, reparaciones, presupuestos en PDF, gastos y operativos con equipo compartido.

- **Web:** GitHub Pages, en `desabollito.github.io` (gratis)
- **Base de datos y usuarios:** un proyecto **nuevo** de Firebase (plan gratuito Spark, sin Storage)
- **Fotos y documentos:** una cuenta **nueva** de Cloudinary (plan gratuito)

No usa Google Drive para nada.

---

## 1. Firebase (proyecto nuevo)

1. Entrá a https://console.firebase.google.com → **Agregar proyecto**. Google Analytics no hace falta.
2. **Authentication → Comenzar → Método de acceso**: activá **Correo electrónico/contraseña** y **Google**.
3. **Authentication → Configuración → Dominios autorizados → Agregar dominio**: `desabollito.github.io`.
4. **Firestore Database → Crear base de datos**
   - Modo: producción.
   - Ubicación: `southamerica-east1` (São Paulo), la más cercana a Argentina. No se puede cambiar después.
5. **Firestore → Reglas**: pegá todo `firestore.rules` → **Publicar**.
6. **⚙ Configuración del proyecto → General → Tus apps → ícono `</>`** (app web). Poné un nombre, no marques Hosting.
7. Copiá el objeto `firebaseConfig` que aparece y pegá sus valores en `js/config.js`, dentro de `FIREBASE`.

Las claves de `firebaseConfig`, incluida `apiKey`, son públicas por diseño. Van en el navegador de cualquiera que abra la web. No dan acceso a los datos: eso lo controlan las reglas de Firestore.

## 2. Cloudinary (cuenta nueva)

1. Creá la cuenta en https://cloudinary.com (plan Free, sin tarjeta).
2. En el **Dashboard** (o **Settings → API Keys**) copiá el **Cloud name**.
   - Del **API Key** y el **API Secret** no necesitás nada.
   - El **API Secret** no se pega nunca en la web ni en GitHub.
3. **Settings (⚙) → Upload → Upload presets → Add upload preset**
   - **Upload preset name:** por ejemplo `desabollito_web`.
   - **Signing mode:** `Unsigned`. Es lo que permite subir desde el navegador sin exponer el secreto.
   - **Asset folder / Folder:** vacío. La app ordena todo en `desabollito/<operativo>/<vehículo>` y las fotos de perfil en `desabollito/perfiles/`.
   - Opcional, en **Upload control**: activá **Return delete token**. Permite borrar de verdad una foto hasta 10 minutos después de subirla.
   - Opcional, en **Upload control**: en **Allowed formats** poné `jpg,png,webp,heic,pdf,doc,docx,xls,xlsx` para que nadie suba otra cosa.
   - **Save**.
4. **Settings → Security → "Allow delivery of PDF and ZIP files"**: activalo. En cuentas gratuitas viene apagado, y sin esto los PDF adjuntos a un vehículo no abren.
5. En `js/config.js`:

```js
export const CLOUDINARY = {
  cloudName: "tu-cloud-name",
  uploadPreset: "desabollito_web",
  rootFolder: "desabollito"
};
```

**Sobre el preset sin firma:** cualquiera que lea el código de la web podría usar ese preset para subir archivos a tu cuenta, es el costo de no tener servidor. Limitar formatos (paso 3) y revisar el uso de vez en cuando en el Dashboard alcanza para este tipo de app.

**Borrar archivos:**
- Cuando quitás una foto o documento, desaparece del vehículo y del PDF.
- Si pasaron más de 10 minutos desde que se subió, el archivo sigue guardado en Cloudinary.
- Lo limpiás desde **Media Library**, donde cada vehículo tiene su carpeta.

**Créditos:**
- La app comprime cada foto a 1920 px antes de subirla, así que quedan de unos 300–600 KB.
- Las miniaturas y el PDF usan versiones reducidas.
- Con los 25 créditos mensuales alcanza para miles de fotos.

## 3. Publicar en GitHub Pages

1. En el repositorio `desabollito/desabollito.github.io` **borrá todos los archivos viejos** (lista abajo).
2. Subí el contenido de esta carpeta respetando la estructura:

```
index.html   manifest.json   sw.js   firestore.rules   README.md
css/app.css
js/  (app, carmap, config, data, domain, firebase, media, pdf, shell, ui, excel, views-gastos, views-otros, views-vehiculos)
img/ (app-192.png, app-512.png, logo-claro.png, logo-oscuro.png)
```

3. Esperá 1–2 minutos y abrí https://desabollito.github.io. Si ves "Falta configurar Firebase", revisá `js/config.js`.

**Cada vez que publiques cambios**, subí el número de versión en `sw.js` (`desabollito-v2.0.2`, etc.). Así los teléfonos con la app instalada toman la versión nueva.

### Archivos viejos del repositorio que se borran

| Archivo | Motivo |
|---|---|
| `app.js`, `auth.js`, `vehicles.js`, `budget.js`, `pdf-export.js`, `share.js`, `corporation.js`, `firebase-config.js`, `style.css`, `index.html` viejo | Reemplazados por la versión nueva |
| `drive.js`, `drive-public.js` | Todo lo de Google Drive queda descartado |
| `REGLAS_FIRESTORE.txt` | Reemplazado por `firestore.rules` |
| `icon-192.png`, `icon-192dark.png`, `icon-192white.png`, `icon-512.png` | No se usaban |
| `icon-512dark.png`, `icon-512white.png`, `newlogo192.png`, `newlogo512.png` | Ahora están en `img/` con otro nombre |

## 4. Cerrar el proyecto viejo

El Firebase viejo sigue vivo aunque la web ya no lo use. Tiene dos problemas:

- **Credenciales de Drive expuestas.** El documento `config/drive` guarda el clientId, el clientSecret y el refreshToken. Lo puede leer cualquier cuenta registrada, y cualquiera puede registrarse. Con eso se accede al Google Drive donde se subían las fotos.
- **Datos de clientes abiertos.** Las reglas viejas dejan que cualquier cuenta lea los vehículos de todos: nombres y teléfonos.

Qué hacer, en este orden:

1. Si querés conservar algo, exportalo primero. Ni fotos ni datos pasan solos al proyecto nuevo.
2. **Google Cloud Console** (proyecto viejo) → **APIs y servicios → Credenciales**: borrá el cliente OAuth de Drive, o tocá **Restablecer secreto**.
3. **https://myaccount.google.com/permissions** con la cuenta dueña de ese Drive: quitá el acceso de la app. Eso anula el refreshToken.
4. **Firebase Console** (proyecto viejo) → **⚙ Configuración del proyecto → General → Borrar proyecto**. Si preferís no borrarlo todavía, poné en sus reglas `allow read, write: if false;` para todo.
5. Si las fotos viejas de Drive ya no te sirven, borrá la carpeta `Desabollito` de ese Drive.

## 5. Cómo funciona

- **Cuentas.**
  - Se entra con usuario + contraseña o con Google.
  - Internamente el usuario se guarda como `usuario@desabollito.app`, porque Firebase pide un email. La persona nunca lo ve.
  - Cada uno tiene un `@usuario` único, que es el que se usa para sumarlo a un equipo.
- **Operativos.**
  - Al entrar por primera vez se crea automáticamente "Operativo de …".
  - Una persona puede estar en varios operativos. Se cambia y se gestiona tocando el operativo actual, arriba a la izquierda.
  - Roles: dueño, administrador y técnico.
  - Los administradores le ponen etiquetas a cada miembro (Sacabollos, Desmontador, Gestión, o las que quieran).
- **Gastos.**
  - En escritorio están en el menú lateral, debajo de Calendario.
  - En el celular se llega tocando dos veces la pestaña Planilla; un toque más vuelve a Planilla.
  - Cada gasto tiene monto, categoría, fecha, método de pago y, si querés, el vehículo al que corresponde.
  - Se exportan por mes a Excel y PDF. Los pagos en dólares se suman aparte del total en pesos.
  - El campo "Técnico" acepta nombre o @usuario; si coincide con alguien del operativo, el gasto queda vinculado a su cuenta.
- **Excel.** Planilla y gastos se descargan como .xlsx: letra Nunito, todo alineado a la izquierda, fechas y montos con formato. Si la computadora no tiene Nunito instalada, Excel usa su letra por defecto (Nunito se descarga gratis de Google Fonts).
- **Sin señal.**
  - Lo que cargues sin conexión se guarda en el teléfono y se sincroniza solo cuando vuelve la señal.
  - Un punto amarillo en la tarjeta indica que ese vehículo todavía está pendiente.
  - Las fotos sí necesitan conexión para subirse.
- **Instalar como app:** en el celular, menú del navegador → "Agregar a la pantalla de inicio".

## Estructura del código

| Archivo | Qué hace |
|---|---|
| `js/config.js` | Claves de Firebase y Cloudinary |
| `js/firebase.js` | Inicializa Firebase con caché offline |
| `js/data.js` | Sesión, perfil, operativos, miembros, vehículos y gastos |
| `js/domain.js` | Estados, piezas y geometría del mapa del auto |
| `js/carmap.js` | Mapa de carrocería interactivo |
| `js/media.js` | Compresión y subida a Cloudinary |
| `js/pdf.js` | PDF de presupuesto y de planilla |
| `js/views-vehiculos.js` | Lista, detalle y formulario |
| `js/views-otros.js` | Planilla, calendario, operativo, ajustes y papelera |
| `js/views-gastos.js` | Gastos: resumen por categoría, carga y exportación |
| `js/excel.js` | Exportación a Excel (.xlsx) |
| `js/app.js` | Login y navegación |
| `js/shell.js`, `js/ui.js` | Barra superior, diálogos, avisos y utilidades |
