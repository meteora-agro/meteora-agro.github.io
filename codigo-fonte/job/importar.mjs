#!/usr/bin/env node
/**
 * Job horario do Meteora Agro (roda de graca no GitHub Actions, workflow "dados.yml").
 *
 * 1. Promove a administrador os e-mails de ADMIN_EMAILS (segredo do GitHub).
 * 2. Importa dados horarios de todas as estacoes (INMET com token, senao Open-Meteo no ponto).
 *    Estacoes "sensor" recebem do modelo so a chuva/vento de reserva (o resto vem do Raspberry).
 * 3. Calcula o resumo diario (ETo FAO-56, balanco, graus-dia) dos dias completos.
 * 4. Atualiza o resumo de cada estacao (ultimas 24 h, ontem, previsao de 7 dias, avisos, janelas de pulverizacao).
 * 5. Grava sistema/status (painel do admin), com sensores sem dados ha mais de 30 min.
 *
 * Variaveis: FIREBASE_SERVICE_ACCOUNT (JSON) ou GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_PROJECT_ID,
 *            ADMIN_EMAILS (opcional), INMET_TOKEN (opcional). Com FIRESTORE_EMULATOR_HOST usa o emulador.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  FUSO, dataLocal, diasAtras, horaLocal, horasOpenMeteo, horasInmet, resumoDia, resumo24h,
  avisos, previsao7, janelasPulverizacao,
} from '../app/ciencia.js';

const UA = { 'User-Agent': 'MeteoraAgro/3 (github.com; plataforma agrometeorologica)' };
const DIAS_RECENTES = 3;
const DIAS_HISTORICO = 30;

export async function getJson(url, tentativas = 3) {
  let erro;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
      if (r.status === 204) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split('?')[0]}`);
      return await r.json();
    } catch (e) { erro = e; await new Promise((s) => setTimeout(s, 2000 * (i + 1))); }
  }
  throw erro;
}

/** Uma chamada ao Open-Meteo para varios pontos (horario passado + previsao de 7 dias) */
export async function openMeteo(estacoes, diasPassados) {
  const p = new URLSearchParams({
    latitude: estacoes.map((e) => e.lat.toFixed(4)).join(','), longitude: estacoes.map((e) => e.lon.toFixed(4)).join(','),
    timezone: FUSO, past_days: diasPassados, forecast_days: 7, wind_speed_unit: 'ms',
    hourly: 'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,precipitation,shortwave_radiation,dew_point_2m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration',
  });
  const j = await getJson('https://api.open-meteo.com/v1/forecast?' + p);
  return Array.isArray(j) ? j : [j];
}

async function inmet(codigo, token, dias) {
  const url = `https://apitempo.inmet.gov.br/token/estacao/${diasAtras(dias)}/${dataLocal()}/${codigo}/${token}`;
  const j = await getJson(url, 2);
  return Array.isArray(j) ? horasInmet(j) : {};
}

function conectar() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'demo-meteora';
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  initializeApp(sa ? { credential: cert(JSON.parse(sa)), projectId } : { projectId });
  return getFirestore();
}

async function promoverAdmins(db) {
  const emails = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  let n = 0;
  for (let i = 0; i < emails.length; i += 10) {
    const s = await db.collection('users').where('email', 'in', emails.slice(i, i + 10)).get();
    for (const d of s.docs) {
      if (d.data().role !== 'admin' || d.data().status !== 'active') {
        await d.ref.update({ role: 'admin', status: 'active', plan: 'enterprise', atualizadoEm: Timestamp.now() });
        n++;
      }
    }
  }
  return n;
}

/** Processa uma estacao com a resposta do Open-Meteo do seu ponto */
export async function processarEstacao(db, e, om, { token = '', agora = new Date() } = {}) {
  const ref = db.collection('stations').doc(e.id);
  const hoje = dataLocal(agora);
  const modelo = horasOpenMeteo(om.hourly, agora);
  let fonte = 'open-meteo';
  let medidos = modelo;

  if (e.type === 'publica' && e.inmetCode && token) {
    try {
      const of = await inmet(e.inmetCode, token, Object.keys(modelo).length);
      if (Object.keys(of).length) {
        fonte = 'inmet';
        medidos = {};
        for (const dia of Object.keys(modelo)) medidos[dia] = { ...modelo[dia], ...(of[dia] || {}) };
      }
    } catch (x) { console.warn(`  INMET ${e.inmetCode}: ${x.message}`); }
  }

  const dias = Object.keys(modelo).sort();
  // estacao com sensor: as horas medidas estao no Firestore (gravadas pelo Raspberry)
  const doBanco = {};
  if (e.type === 'sensor') {
    const snaps = await db.getAll(...dias.map((d) => ref.collection('dias').doc(d)));
    snaps.forEach((s, i) => { doBanco[dias[i]] = (s.exists && s.data().h) || {}; });
  }

  const lote = db.batch();
  let ontem = null;
  const mapas = {};
  for (const dia of dias) {
    const hm = modelo[dia];
    const reserva = {
      chuva: +Object.values(hm).reduce((s, x) => s + (x.rain || 0), 0).toFixed(1),
      vento: (() => { const v = Object.values(hm).map((x) => x.wind).filter((x) => x != null); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null; })(),
    };
    const h = e.type === 'sensor' ? doBanco[dia] : medidos[dia];
    mapas[dia] = h;
    const doc = e.type === 'sensor' ? { reserva } : { h, fonte };
    if (dia < hoje) {
      const r = resumoDia(h, { data: dia, lat: e.lat, altitude: e.elevation || 0, reserva });
      if (r) { doc.resumo = r; if (dia === diasAtras(1, agora)) ontem = { data: dia, ...r }; }
    }
    lote.set(ref.collection('dias').doc(dia), doc, { merge: true });
  }

  const r24 = resumo24h(mapas, agora);
  const prev = {
    dias: previsao7(om.daily), ...avisos(om.daily), janelas: janelasPulverizacao(om.hourly, agora),
    em: Timestamp.fromDate(agora),
  };
  const est = { previsao: prev, atualizadoEm: FieldValue.serverTimestamp() };
  if (ontem) est.ontem = ontem;
  if (r24) {
    est.chuva24h = r24.chuva24h; est.tmin24h = r24.tmin24h; est.tmax24h = r24.tmax24h;
    if (e.type !== 'sensor') { est.atual = { ...r24.atual, fonte }; est.ultimoDado = Timestamp.fromDate(agora); }
  }
  if (!e.historico) est.historico = true;
  lote.set(ref, est, { merge: true });
  await lote.commit();
  return { dias: dias.length, fonte };
}

export async function executar(db, { agora = new Date() } = {}) {
  const t0 = Date.now();
  const status = { em: Timestamp.now(), falhas: [], sensoresParados: [], estacoes: 0, admins: 0 };
  status.admins = await promoverAdmins(db);
  const snap = await db.collection('stations').where('active', '==', true).get();
  const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => typeof e.lat === 'number' && typeof e.lon === 'number');
  status.estacoes = lista.length;
  const token = process.env.INMET_TOKEN || '';

  // estacoes novas recebem 30 dias de historico; as demais, so os ultimos dias
  const grupos = [[lista.filter((e) => e.historico), DIAS_RECENTES], [lista.filter((e) => !e.historico), DIAS_HISTORICO]];
  for (const [grupo, passados] of grupos) {
    for (let i = 0; i < grupo.length; i += 40) {
      const parte = grupo.slice(i, i + 40);
      let respostas;
      try { respostas = await openMeteo(parte, passados); } catch (x) { parte.forEach((e) => status.falhas.push(`${e.name}: Open-Meteo ${x.message}`)); continue; }
      for (let k = 0; k < parte.length; k++) {
        const e = parte[k];
        try {
          const r = await processarEstacao(db, e, respostas[k], { token, agora });
          console.log(`  ${e.name}: ${r.dias} dias (${r.fonte})`);
        } catch (x) { status.falhas.push(`${e.name}: ${x.message}`); console.error(`  ${e.name}:`, x); }
      }
    }
  }

  for (const e of lista.filter((x) => x.type === 'sensor')) {
    const ult = e.ultimoDado ? e.ultimoDado.toMillis() : 0;
    if (agora.getTime() - ult > 30 * 60e3) status.sensoresParados.push({ id: e.id, nome: e.name, owner: e.owner || null, ultimo: e.ultimoDado || null });
  }
  status.duracaoS = +((Date.now() - t0) / 1000).toFixed(1);
  status.horaLocal = horaLocal(agora);
  await db.collection('sistema').doc('status').set(status);
  return status;
}

// execucao direta: node job/importar.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = conectar();
  executar(db).then((s) => {
    console.log(`ok: ${s.estacoes} estacoes, ${s.falhas.length} falhas, ${s.sensoresParados.length} sensores parados, ${s.duracaoS} s`);
    if (s.falhas.length) { console.log(s.falhas.join('\n')); if (s.falhas.length === s.estacoes && s.estacoes) process.exit(1); }
  }).catch((e) => { console.error(e); process.exit(1); });
}
