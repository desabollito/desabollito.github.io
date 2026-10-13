import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove,
  writeBatch, deleteField, Timestamp
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

export {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signInWithRedirect, signOut, updateProfile,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove,
  writeBatch, deleteField, Timestamp
};
