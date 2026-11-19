#!/usr/bin/env node
/**
 * Traz o banco SQLite da versao 1 (FastAPI no Raspberry/pibot) para o Firebase.
 *
 *  usuarios      -> Firebase Auth (senha bcrypt importada: ninguem precisa trocar a senha) + users/{uid}
 *  propriedades  -> properties/{uid}_p_{n}  (com o contorno)
 *  estacoes      -> stations/pub_{codigo} (INMET) ou stations/{uid}_e_{n}
 *  medicoes      -> stations/{id}/dias/{data}.h  (medias horarias dos ultimos N dias)
 *  calculos      -> stations/{id}/dias/{data}.resumo
 *
 * Estacoes com sensor precisam de um login novo: no app, Fazenda > "Novo login" (gera o edge.conf).
 *
 * Uso:
 *   npm ci --prefix job
 *   FIREBASE_SERVICE_ACCOUNT="$(cat chave.json)" FIREBASE_PROJECT_ID=seu-projeto node scripts/migrar-v1.mjs --db meteora.db [--dias 60] [--seco]
 * No emulador: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/migrar-v1.mjs --db meteora.db
 */
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { resumoDia } from '../app/ciencia.js';

const require = createRequire(new URL('../job/package.json', import.meta.url));
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const arg = (n, p) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : p; };
const ARQ = arg('db'); const DIAS = Number(arg('dias', 60)); const SECO = !!arg('seco', false);
if (!ARQ) { console.error('uso: node scripts/migrar-v1.mjs --db meteora.db [--dias 60] [--seco]'); process.exit(1); }
const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-meteora';
const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
initializeApp(sa ? { credential: cert(JSON.parse(sa)), projectId } : { projectId });
const db = getFirestore();
const sq = new DatabaseSync(ARQ, { readOnly: true });
const todos = (sql, ...p) => sq.prepare(sql).all(...p);
const colunas = (t) => todos(`PRAGMA table_info(${t})`).map((c) => c.name);
const quando = (s) => { const d = s ? new Date(s.replace(' ', 'T') + (s.length <= 19 ? '-04:00' : '')) : new Date(); return Timestamp.fromDate(Number.isNaN(+d) ? new Date() : d); };
const uidDe = (id) => `v1-${id}`;
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
let gravacoes = 0;

async function gravar(lista) {
  gravacoes += lista.length;
  if (SECO) return;
  for (let i = 0; i < lista.length; i += 400) {
    const b = db.batch();
    lista.slice(i, i + 400).forEach(([ref, d, merge]) => b.set(ref, d, merge ? { merge: true } : {}));
    await b.commit();
  }
}

console.log(`Migrando ${ARQ} -> ${projectId}${SECO ? ' (SECO: nada sera gravado)' : ''}`);

// ------------------------------------------------------------------ usuarios
const us = todos('SELECT * FROM users');
await gravar(us.map((u) => [db.collection('users').doc(uidDe(u.id)), {
  name: u.name, email: u.email.toLowerCase(), role: u.role === 'admin' ? 'admin' : 'client', plan: ['basic', 'pro', 'enterprise'].includes(u.plan_id) ? u.plan_id : 'basic',
  status: ['pending', 'active', 'suspended'].includes(u.status) ? u.status : 'pending', criadoEm: quando(u.created_at),
}]));
if (!SECO && us.length) {
  const r = await getAuth().importUsers(us.map((u) => ({ uid: uidDe(u.id), email: u.email.toLowerCase(), displayName: u.name, passwordHash: Buffer.from(u.password_hash), disabled: u.status === 'suspended' })), { hash: { algorithm: 'BCRYPT' } });
  r.errors.forEach((e) => console.warn('  usuario nao importado:', us[e.index].email, e.error.message));
}
console.log(`usuarios: ${us.length} (${us.filter((u) => u.status === 'active').length} ativos)`);

// ------------------------------------------------------------------ propriedades
const temLimite = colunas('properties').includes('boundary');
const idProp = new Map();
const porDono = {};
const ps = todos('SELECT * FROM properties WHERE active=1 ORDER BY created_at');
await gravar(ps.map((p) => {
  const dono = uidDe(p.user_id); const n = (porDono[dono] = (porDono[dono] ?? -1) + 1);
  const id = `${dono}_p_${n}`; idProp.set(p.id, id);
  return [db.collection('properties').doc(id), {
    owner: dono, name: p.name, crop: p.crop_type || null, city: p.city || null, state: p.state ? p.state.slice(0, 2) : null, notes: p.description || null,
    boundary: temLimite && p.boundary ? p.boundary : null, areaHa: p.area_ha ?? null, lat: p.lat ?? null, lon: p.lon ?? null, plantio: null,
    criadoEm: quando(p.created_at), atualizadoEm: Timestamp.now(),
  }];
}));
console.log(`propriedades: ${ps.length}`);

// ------------------------------------------------------------------ estacoes
const cols = colunas('stations');
const sensores = new Set(todos("SELECT DISTINCT station_id FROM measurements WHERE source='sensor'").map((r) => r.station_id));
const es = todos('SELECT * FROM stations ORDER BY created_at');
const mapa = [];
const estPorDono = {};
for (const e of es) {
  const cod = cols.includes('inmet_code') && e.inmet_code ? e.inmet_code.toUpperCase() : null;
  let id; let doc;
  const base = { name: e.name, lat: e.lat, lon: e.lon, elevation: e.elevation || 0, active: !!e.active, deviceUid: null, deviceEmail: null, criadoEm: quando(e.created_at) };
  if (cod || (cols.includes('is_public') && e.is_public)) {
    id = `pub_${(cod || e.id).toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 40)}`;
    doc = { ...base, owner: null, type: 'publica', public: true, propertyId: null, inmetCode: cod };
  } else {
    const dono = uidDe(e.user_id); const n = (estPorDono[dono] = (estPorDono[dono] ?? -1) + 1);
    id = `${dono}_e_${n}`;
    doc = { ...base, owner: dono, type: sensores.has(e.id) ? 'sensor' : 'virtual', public: false, propertyId: idProp.get(e.property_id) || null, inmetCode: null };
  }
  mapa.push([e, id, doc]);
}
await gravar(mapa.map(([, id, doc]) => [db.collection('stations').doc(id), doc]));
console.log(`estacoes: ${es.length} (${mapa.filter((x) => x[2].type === 'publica').length} publicas, ${mapa.filter((x) => x[2].type === 'sensor').length} com sensor: gere o login novo no app)`);

// ------------------------------------------------------------------ medicoes e calculos
const desde = new Date(Date.now() - DIAS * 86400e3).toISOString().slice(0, 10);
let horas = 0;
for (const [e, id, doc] of mapa) {
  const linhas = todos(`SELECT substr(replace(timestamp,' ','T'),1,13) AS hora, avg(temp_c) temp, max(temp_c) tmax, min(temp_c) tmin, avg(humidity_pct) rh,
    avg(pressure_hpa) p, avg(wind_speed_ms) wind, avg(wind_dir_deg) dir, sum(rainfall_mm) rain, avg(solar_rad_wm2) rad, avg(dew_point_c) dew, count(*) n
    FROM measurements WHERE station_id=? AND timestamp>=? GROUP BY 1 ORDER BY 1`, e.id, desde);
  const dias = {};
  for (const l of linhas) {
    if (!/^\d{4}-\d\d-\d\dT\d\d$/.test(l.hora) || l.temp == null) continue;
    const h = {};
    for (const k of ['temp', 'tmax', 'tmin', 'rh', 'p', 'wind', 'dir', 'rain', 'rad', 'dew']) if (l[k] != null) h[k] = r2(l[k]);
    h.n = l.n;
    (dias[l.hora.slice(0, 10)] ||= {})[l.hora.slice(11, 13)] = h;
  }
  const calc = Object.fromEntries(todos('SELECT * FROM daily_calcs WHERE station_id=? AND date>=?', e.id, desde).map((d) => [d.date, d]));
  const escritas = [];
  for (const dia of new Set([...Object.keys(dias), ...Object.keys(calc)])) {
    const d = { };
    if (dias[dia]) d.h = dias[dia];
    const r = dias[dia] ? resumoDia(dias[dia], { data: dia, lat: doc.lat, altitude: doc.elevation }) : null;
    const c = calc[dia];
    if (r) d.resumo = r;
    else if (c && c.tmax != null) d.resumo = { tmax: c.tmax, tmin: c.tmin, tavg: c.tavg, chuva: c.rain_mm ?? 0, eto: c.eto_mm, balanco: c.water_balance_mm, rn: c.rn_mj, vpd: c.vpd_kpa, gd: Math.max(0, +((c.tmax + c.tmin) / 2 - 10).toFixed(1)), fonteChuva: 'v1', horas: null };
    if (Object.keys(d).length) escritas.push([db.collection('stations').doc(id).collection('dias').doc(dia), d, true]);
  }
  await gravar(escritas);
  horas += linhas.length;
  console.log(`  ${doc.name}: ${linhas.length} horas em ${escritas.length} dias`);
}
console.log(`medicoes: ${horas} horas (ultimos ${DIAS} dias) · ${gravacoes} documentos ${SECO ? 'seriam gravados' : 'gravados'}.`);
console.log('Pronto. O job horario completa previsao, resumo de 24 h e os ultimos dias na proxima execucao.');
