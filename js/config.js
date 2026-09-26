// ─────────────────────────────────────────────────────────────
//  Configuración de Desabollito
//  Estos valores son públicos por diseño (van al navegador).
//  La seguridad real la dan las reglas de Firestore y el
//  "upload preset" de Cloudinary.
// ─────────────────────────────────────────────────────────────

// Firebase Console → ⚙ Configuración del proyecto → General →
// "Tus apps" → app web → "Configuración del SDK" → Config.
export const FIREBASE = {
  apiKey: "AIzaSyDJL7vPKEkAMBKGM7ULWpphlDkYw1jKcSM",
  authDomain: "desabollitoorg.firebaseapp.com",
  projectId: "desabollitoorg",
  storageBucket: "desabollitoorg.firebasestorage.app",
  messagingSenderId: "944199223142",
  appId: "1:944199223142:web:24155d0a0e616a1babeaa7"
};

// Cloudinary → Settings → Upload → Upload presets → "Add upload preset"
//   Signing mode: Unsigned
//   Asset folder: dejalo vacío (la app manda la carpeta)
//   (Si tu panel no muestra "Return delete token" ni "Allowed formats",
//   no pasa nada: la app funciona igual sin esas opciones.)
export const CLOUDINARY = {
  cloudName: "dkfedvsn",
  uploadPreset: "desabollito",
  rootFolder: "desabollito"
};

// Dominio interno para cuentas con usuario + contraseña
// (Firebase pide un email; el usuario nunca lo ve).
// No lo cambies una vez que haya cuentas creadas.
export const USER_DOMAIN = "desabollito.app";

// Número del bot de WhatsApp (solo dígitos, ej: "5493511234567").
// Con esto la app muestra el botón "Abrir chat con el bot". Vacío = oculto.
export const WHATSAPP_BOT = "";

export const APP_VERSION = "2.10.1";

// Bot de WhatsApp (Cloudflare Worker): avisos al cliente y solicitudes de registro
export const BOT_API = "https://desabollito-bot.desabollito.workers.dev";
