// Testes das regras do Firestore. Precisam do emulador:
//   firebase emulators:exec --only firestore "node --test job/test/regras.emu.mjs"
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-meteora',
  firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
const como = (uid, email) => env.authenticatedContext(uid, { email: email || `${uid}@x.test` }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const semRegras = (f) => env.withSecurityRulesDisabled((c) => f(c.firestore()));

const prop = (owner, extra = {}) => ({ owner, name: 'Fazenda', crop: 'Soja', city: null, state: 'MT', notes: null, boundary: null, areaHa: null, lat: -15, lon: -56, plantio: null, criadoEm: new Date(), atualizadoEm: new Date(), ...extra });
const est = (owner, extra = {}) => ({ owner, name: 'Estacao', type: 'virtual', public: false, active: true, lat: -15, lon: -56, elevation: 200, propertyId: null, inmetCode: null, deviceUid: null, deviceEmail: null, criadoEm: new Date(), ...extra });

test.before(async () => {
  await env.clearFirestore();
  await semRegras(async (db) => {
    await setDoc(doc(db, 'users/ze'), { name: 'Ze', email: 'ze@x.test', role: 'client', plan: 'basic', status: 'active' });
    await setDoc(doc(db, 'users/ana'), { name: 'Ana', email: 'ana@x.test', role: 'client', plan: 'pro', status: 'active' });
    await setDoc(doc(db, 'users/pend'), { name: 'P', email: 'pend@x.test', role: 'client', plan: 'basic', status: 'pending' });
    await setDoc(doc(db, 'users/adm'), { name: 'A', email: 'adm@x.test', role: 'admin', plan: 'enterprise', status: 'active' });
    await setDoc(doc(db, 'stations/pub_a901'), { ...est(null, { type: 'publica', public: true, inmetCode: 'A901' }) });
    await setDoc(doc(db, 'stations/pub_a901/dias/2026-01-01'), { h: { '10': { temp: 30 } } });
    await setDoc(doc(db, 'stations/ze_e_0'), est('ze', { type: 'sensor', deviceUid: 'dev1', deviceEmail: 'd@x' }));
    await setDoc(doc(db, 'sistema/status'), { ok: true });
  });
});
test.after(() => env.cleanup());

test('visitante: so a rede publica', async () => {
  const db = anon();
  await assertSucceeds(getDocs(query(collection(db, 'stations'), where('public', '==', true))));
  await assertSucceeds(getDoc(doc(db, 'stations/pub_a901/dias/2026-01-01')));
  await assertFails(getDoc(doc(db, 'stations/ze_e_0')));
  await assertFails(getDocs(collection(db, 'users')));
  await assertFails(getDoc(doc(db, 'sistema/status')));
  await assertFails(setDoc(doc(db, 'stations/x'), est(null)));
});

test('cadastro: so como cliente pendente no plano gratis', async () => {
  const db = como('novo', 'novo@x.test');
  await assertFails(setDoc(doc(db, 'users/novo'), { name: 'N', email: 'novo@x.test', role: 'admin', plan: 'basic', status: 'pending', criadoEm: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'users/novo'), { name: 'N', email: 'novo@x.test', role: 'client', plan: 'pro', status: 'pending', criadoEm: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'users/novo'), { name: 'N', email: 'outro@x.test', role: 'client', plan: 'basic', status: 'pending', criadoEm: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'users/outro'), { name: 'N', email: 'novo@x.test', role: 'client', plan: 'basic', status: 'pending', criadoEm: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'users/novo'), { name: 'Novo', email: 'novo@x.test', role: 'client', plan: 'basic', status: 'pending', criadoEm: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'users/novo'), { status: 'active' }));
  await assertSucceeds(updateDoc(doc(db, 'users/novo'), { name: 'Novo Nome' }));
});

test('pendente nao cria nada', async () => {
  const db = como('pend');
  await assertFails(setDoc(doc(db, 'properties/pend_p_0'), prop('pend')));
  await assertFails(setDoc(doc(db, 'stations/pend_e_0'), est('pend')));
});

test('admin aprova e muda plano; cliente nao', async () => {
  await assertFails(updateDoc(doc(como('ze'), 'users/pend'), { status: 'active' }));
  await assertFails(updateDoc(doc(como('ze'), 'users/ze'), { plan: 'enterprise' }));
  await assertFails(updateDoc(doc(como('adm'), 'users/pend'), { status: 'active', email: 'hack@x' }));
  await assertSucceeds(updateDoc(doc(como('adm'), 'users/pend'), { status: 'active', plan: 'pro', atualizadoEm: serverTimestamp() }));
  await assertSucceeds(getDocs(collection(como('adm'), 'users')));
  await assertSucceeds(getDoc(doc(como('adm'), 'sistema/status')));
});

test('propriedades: vaga do plano e dono', async () => {
  const ze = como('ze');
  await assertSucceeds(setDoc(doc(ze, 'properties/ze_p_0'), prop('ze')));
  await assertFails(setDoc(doc(ze, 'properties/ze_p_1'), prop('ze')), 'plano gratis: 1 propriedade');
  await assertFails(setDoc(doc(ze, 'properties/ana_p_0'), prop('ze')));
  await assertFails(setDoc(doc(ze, 'properties/ze_p_0'), prop('ana')));
  await assertFails(setDoc(doc(ze, 'properties/ze_p_0'), prop('ze', { hacker: true })));
  await assertSucceeds(setDoc(doc(como('ana'), 'properties/ana_p_4'), prop('ana')), 'pro: 5 propriedades');
  await assertFails(setDoc(doc(como('ana'), 'properties/ana_p_5'), prop('ana')));
  await assertFails(getDoc(doc(como('ana'), 'properties/ze_p_0')));
  await assertSucceeds(getDocs(query(collection(ze, 'properties'), where('owner', '==', 'ze'))));
  await assertSucceeds(getDoc(doc(como('adm'), 'properties/ze_p_0')));
});

test('estacoes do produtor: tipos, vaga, campos protegidos', async () => {
  const ze = como('ze');
  await assertSucceeds(setDoc(doc(ze, 'stations/ze_e_1'), est('ze', { propertyId: 'ze_p_0' })));
  await assertFails(setDoc(doc(ze, 'stations/ze_e_2'), est('ze')), 'gratis: 2 estacoes');
  await assertFails(setDoc(doc(como('ana'), 'stations/ana_e_0'), est('ana', { public: true })));
  await assertFails(setDoc(doc(como('ana'), 'stations/ana_e_0'), est('ana', { type: 'publica' })));
  await assertFails(setDoc(doc(como('ana'), 'stations/ana_e_0'), est('ana', { propertyId: 'ze_p_0' })), 'propriedade de outro');
  await assertSucceeds(updateDoc(doc(ze, 'stations/ze_e_1'), { name: 'Sede' }));
  await assertFails(updateDoc(doc(ze, 'stations/ze_e_1'), { public: true }));
  await assertFails(updateDoc(doc(ze, 'stations/ze_e_1'), { atual: { temp: 99 } }));
  await assertFails(getDoc(doc(como('ana'), 'stations/ze_e_1')));
});

test('estacao de campo (dispositivo) so grava as horas e a leitura atual da sua estacao', async () => {
  const dev = como('dev1', 'd@x');
  await assertSucceeds(setDoc(doc(dev, 'stations/ze_e_0/dias/2026-11-10'), { h: { '10': { temp: 25, rh: 60 } } }));
  await assertSucceeds(setDoc(doc(dev, 'stations/ze_e_0/dias/2026-11-10'), { h: { '11': { temp: 26 } } }, { merge: true }));
  await assertFails(setDoc(doc(dev, 'stations/ze_e_0/dias/2026-11-10'), { resumo: { eto: 1 } }, { merge: true }));
  await assertFails(setDoc(doc(dev, 'stations/ze_e_0/dias/ontem'), { h: {} }));
  await assertSucceeds(updateDoc(doc(dev, 'stations/ze_e_0'), { atual: { temp: 25 }, ultimoDado: serverTimestamp() }));
  await assertFails(updateDoc(doc(dev, 'stations/ze_e_0'), { atual: { temp: 25 }, ultimoDado: new Date(2020, 1, 1) }));
  await assertFails(updateDoc(doc(dev, 'stations/ze_e_0'), { name: 'hack' }));
  await assertFails(setDoc(doc(dev, 'stations/pub_a901/dias/2026-11-10'), { h: {} }));
  await assertFails(setDoc(doc(como('ze'), 'stations/ze_e_0/dias/2026-11-10'), { h: {} }), 'nem o dono escreve medicoes');
});

test('rede publica: so admin cria', async () => {
  const pub = est(null, { type: 'publica', public: true, inmetCode: 'A902' });
  await assertFails(setDoc(doc(como('ze'), 'stations/pub_a902'), pub));
  await assertSucceeds(setDoc(doc(como('adm'), 'stations/pub_a902'), pub));
  await assertSucceeds(updateDoc(doc(como('adm'), 'stations/pub_a902'), { public: false }));
  await assertSucceeds(deleteDoc(doc(como('adm'), 'stations/pub_a902')));
});
