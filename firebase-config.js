// Firebase Configuration — sin Storage (imágenes en Firestore Base64)
const firebaseConfig = {
  apiKey: "AIzaSyDVNpA0uw3Hy-OWD9BCzUWM7b3dvLnuGGw",
  authDomain: "desabollito.firebaseapp.com",
  projectId: "desabollito",
  messagingSenderId: "58621481139",
  appId: "1:58621481139:web:2ffb569bb624e69b2620c6"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
