// Conexao com o Firebase (plano gratuito Spark: Auth + Firestore). O site fica no GitHub Pages.
import {
  initializeApp, getAuth, connectAuthEmulator, initializeFirestore, persistentLocalCache,
  persistentMultipleTabManager, memoryLocalCache, connectFirestoreEmulator,
} from './firebase.js';

// Configuracao publica do app web (nao e segredo: quem protege os dados sao as regras do Firestore)
export const config = {
  apiKey: 'AIzaSyBzAm5NGg24i7Az_HLC5MGE-Vf6xk1rtrk',
  authDomain: 'meteora-agro.firebaseapp.com',
  projectId: 'meteora-agro',
  storageBucket: 'meteora-agro.firebasestorage.app',
  messagingSenderId: '87410544561',
  appId: '1:87410544561:web:0dd6c71f75d14f517e7790',
};
// ?emu na URL usa os emuladores locais (firebase emulators:start) com o projeto de teste
export const EMULADOR = new URLSearchParams(location.search).has('emu');
if (EMULADOR) Object.assign(config, { projectId: 'demo-meteora', apiKey: 'demo-key' });

export const app = initializeApp(config);
export const auth = getAuth(app);
// cache local: o app abre sem sinal com os ultimos dados e gasta menos leituras da cota gratuita
let cache;
try { cache = persistentLocalCache({ tabManager: persistentMultipleTabManager() }); } catch { cache = memoryLocalCache(); }
export const db = initializeFirestore(app, { localCache: EMULADOR ? memoryLocalCache() : cache });

if (EMULADOR) {
  connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, location.hostname, 8080);
}
