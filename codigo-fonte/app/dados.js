// Estado do app e acesso ao Firestore
import {
  onAuthStateChanged, doc, getDocs, setDoc, collection, query, where, onSnapshot, documentId, serverTimestamp,
} from './firebase.js';
import { auth, db } from './fb.js';
import { PLANOS, horaLocal, dataLocal, diasAtras } from './ciencia.js';

export const S = { user: null, perfil: null, publicas: [], minhas: [], todas: [], props: [], pronto: false };

// ------------------------------------------------------------------ eventos simples
const ouvintes = {};
export const ao = (ev, fn) => { (ouvintes[ev] ||= new Set()).add(fn); return () => ouvintes[ev].delete(fn); };
const emitir = (ev) => (ouvintes[ev] || []).forEach((f) => { try { f(); } catch (e) { console.error(e); } });

// ------------------------------------------------------------------ papeis
export const logado = () => !!S.user;
export const ativo = () => !!S.perfil && S.perfil.status === 'active';
export const admin = () => ativo() && S.perfil.role === 'admin';
export const plano = () => PLANOS[(S.perfil && S.perfil.plan) || 'basic'] || PLANOS.basic;

/** estacoes que o usuario pode ver: as suas primeiro, depois a rede publica */
export function estacoes() {
  const m = new Map();
  [...S.publicas, ...S.todas, ...S.minhas].forEach((e) => m.set(e.id, e));
  const uid = S.user && S.user.uid;
  return [...m.values()].sort((a, b) => (b.owner === uid) - (a.owner === uid) || a.name.localeCompare(b.name, 'pt-BR'));
}
export const minhasEstacoes = () => (admin() ? S.todas.filter((e) => !e.public) : S.minhas);
export const estacao = (id) => estacoes().find((e) => e.id === id);
export const propriedade = (id) => S.props.find((p) => p.id === id);

/** proxima vaga livre ({uid}_p_N / {uid}_e_N) dentro do limite do plano */
export function proximaVaga(tipo) {
  const uid = S.user.uid;
  const lista = tipo === 'p' ? S.props : [...S.minhas, ...S.todas];
  const usados = new Set(lista.filter((x) => x.id.startsWith(`${uid}_${tipo}_`)).map((x) => +x.id.split('_')[2]));
  const lim = tipo === 'p' ? plano().propriedades : plano().estacoes;
  for (let i = 0; i < lim; i++) if (!usados.has(i)) return `${uid}_${tipo}_${i}`;
  return null;
}

// ------------------------------------------------------------------ assinaturas
const lista = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
onSnapshot(query(collection(db, 'stations'), where('public', '==', true)), (s) => { S.publicas = lista(s).filter((e) => e.active !== false); emitir('estacoes'); }, (e) => console.warn('publicas', e.code));

let cancelar = [];
const pararTudo = () => { cancelar.forEach((f) => f()); cancelar = []; cancelarDados.forEach((f) => f()); cancelarDados = []; };
let primeiraVez = true;
let resolverPronto;
export const pronto = new Promise((r) => { resolverPronto = r; });

onAuthStateChanged(auth, (user) => {
  pararTudo();
  S.user = user; S.perfil = null; S.minhas = []; S.todas = []; S.props = [];
  if (!user) { emitir('perfil'); emitir('estacoes'); emitir('props'); if (primeiraVez) { primeiraVez = false; resolverPronto(); } return; }
  let assinado = '';
  cancelar.push(onSnapshot(doc(db, 'users', user.uid), (s) => {
    S.perfil = s.exists() ? s.data() : null;
    const chave = `${S.perfil && S.perfil.status}|${S.perfil && S.perfil.role}`;
    if (chave !== assinado) { assinado = chave; assinarDados(); }
    emitir('perfil');
    if (primeiraVez) { primeiraVez = false; resolverPronto(); }
  }, (e) => { console.warn('perfil', e.code); if (primeiraVez) { primeiraVez = false; resolverPronto(); } }));
});

let cancelarDados = [];
function assinarDados() {
  cancelarDados.forEach((f) => f()); cancelarDados = [];
  S.minhas = []; S.todas = []; S.props = [];
  if (!ativo()) { emitir('estacoes'); emitir('props'); return; }
  const uid = S.user.uid;
  const qEst = admin() ? collection(db, 'stations') : query(collection(db, 'stations'), where('owner', '==', uid));
  const qProp = admin() ? collection(db, 'properties') : query(collection(db, 'properties'), where('owner', '==', uid));
  cancelarDados.push(onSnapshot(qEst, (s) => { if (admin()) S.todas = lista(s); else S.minhas = lista(s); emitir('estacoes'); }, (e) => console.warn('estacoes', e.code)));
  cancelarDados.push(onSnapshot(qProp, (s) => { S.props = lista(s).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')); emitir('props'); }, (e) => console.warn('props', e.code)));
}

/** cria o perfil logo apos o cadastro (as regras so aceitam cliente pendente no plano gratis) */
export async function criarPerfil(user, nome) {
  await setDoc(doc(db, 'users', user.uid), { name: nome, email: user.email, role: 'client', plan: 'basic', status: 'pending', criadoEm: serverTimestamp() });
}

// ------------------------------------------------------------------ leituras de serie
/** documentos diarios de uma estacao entre duas datas: [{data, h, resumo, ...}] */
export async function dias(sid, ini, fim) {
  const s = await getDocs(query(collection(db, 'stations', sid, 'dias'), where(documentId(), '>=', ini), where(documentId(), '<=', fim)));
  return s.docs.map((d) => ({ data: d.id, ...d.data() })).sort((a, b) => (a.data < b.data ? -1 : 1));
}
/** horas das ultimas N horas: [{hora, temp, rh, ...}] (le 2 ou 3 documentos, nao 48) */
export async function horas(sid, n = 48) {
  const ini = horaLocal(new Date(Date.now() - n * 3600e3));
  const ds = await dias(sid, ini.slice(0, 10), dataLocal());
  const out = [];
  for (const d of ds) for (const [hh, v] of Object.entries(d.h || {})) { const hora = `${d.data}T${hh}`; if (hora > ini && v && v.temp != null) out.push({ hora, ...v }); }
  return out.sort((a, b) => (a.hora < b.hora ? -1 : 1));
}
/** resumos diarios prontos entre duas datas */
export async function resumos(sid, ini, fim = diasAtras(1)) {
  return (await dias(sid, ini, fim)).filter((d) => d.resumo).map((d) => ({ data: d.data, ...d.resumo }));
}
