import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, setDoc as _setDoc, addDoc as _addDoc, updateDoc as _updateDoc, deleteDoc as _deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove,
  writeBatch as _writeBatch, deleteField, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { FIREBASE } from "./config.js";

export const app = initializeApp(FIREBASE);
export const auth = getAuth(app);

// Caché local persistente: la app sigue funcionando sin señal
// (en el taller o en la calle) y sincroniza al volver la conexión.
let _db;
try {
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  console.warn("Caché offline no disponible:", e);
  _db = initializeFirestore(app, {});
}
export const db = _db;

export const google = new GoogleAuthProvider();
google.setCustomParameters({ prompt: "select_account" });

// "Ver como" (panel del creador): mientras se mira la app con los permisos de otra persona, ninguna escritura llega a la base
export const MSJ_VER_COMO = "Estás en «Ver como»: es solo para mirar, no se guarda nada";
const guardia = f => (...a) => globalThis.__verComo ? Promise.reject(new Error(MSJ_VER_COMO)) : f(...a);
export const setDoc = guardia(_setDoc), addDoc = guardia(_addDoc), updateDoc = guardia(_updateDoc), deleteDoc = guardia(_deleteDoc);
export const writeBatch = (...a) => {
  const b = _writeBatch(...a), commit = b.commit.bind(b);
  b.commit = () => globalThis.__verComo ? Promise.reject(new Error(MSJ_VER_COMO)) : commit();
  return b;
};

export {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signInWithRedirect, signOut, updateProfile,
  collection, doc, getDoc, getDocs,
  onSnapshot, query, where, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove,
  deleteField, Timestamp
};
