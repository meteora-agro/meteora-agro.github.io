// Funcoes do Firebase usadas pelo app (o esbuild empacota so o que esta listado aqui)
export { initializeApp, deleteApp } from 'firebase/app';
export { getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, updateProfile, inMemoryPersistence, setPersistence } from 'firebase/auth';
export { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot, documentId, orderBy, limit, writeBatch, serverTimestamp } from 'firebase/firestore';
