// Testa o job horario com um Firestore em memoria e um Open-Meteo falso (sem rede, sem emulador).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { executar } from '../importar.mjs';
import { dataLocal, diasAtras, horaLocal } from '../../app/ciencia.js';

function fakeDb(inicial = {}) {
  const docs = new Map(Object.entries(inicial)); // caminho -> dados
  const mesclar = (a, b) => { const o = { ...(a || {}) }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && v.constructor === Object && o[k] && typeof o[k] === 'object' ? mesclar(o[k], v) : v; return o; };
  const ref = (path) => ({
    path, id: path.split('/').pop(),
    collection: (c) => col(`${path}/${c}`),
    get: async () => snap(path),
    update: async (d) => docs.set(path, { ...docs.get(path), ...d }),
    set: async (d, o) => docs.set(path, o && o.merge ? mesclar(docs.get(path), d) : d),
  });
  const snap = (path) => ({ id: path.split('/').pop(), ref: ref(path), exists: docs.has(path), data: () => docs.get(path) });
  const col = (path, filtros = []) => ({
    doc: (id) => ref(`${path}/${id}`),
    where: (c, op, v) => col(path, [...filtros, [c, op, v]]),
    get: async () => {
      const lista = [...docs.keys()].filter((k) => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1)
        .filter((k) => filtros.every(([c, op, v]) => (op === '==' ? docs.get(k)[c] === v : v.includes(docs.get(k)[c])))).map(snap);
      return { docs: lista, size: lista.length };
    },
  });
  return {
    docs, collection: (c) => col(c),
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    batch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => r.set(d, o)), commit: async () => { for (const op of ops) await op(); } }; },
  };
}

function omFalso(nPontos, agora) {
  const hoje = dataLocal(agora);
  const ini = Date.parse(diasAtras(3, agora) + 'T00:00:00Z');
  const time = []; for (let t = ini; time.length < 24 * 10; t += 3600e3) time.push(new Date(t).toISOString().slice(0, 16));
  const n = time.length; const arr = (f) => time.map((t, i) => f(i, +t.slice(11, 13)));
  const ponto = {
    hourly: { time, temperature_2m: arr((i, h) => 22 + 8 * Math.sin(((h - 9) / 24) * 2 * Math.PI)), relative_humidity_2m: arr(() => 65), surface_pressure: arr(() => 990),
      wind_speed_10m: arr(() => 2), wind_direction_10m: arr(() => 90), precipitation: arr((i, h) => (h === 15 ? 2 : 0)), shortwave_radiation: arr((i, h) => (h > 6 && h < 18 ? 600 : 0)), dew_point_2m: arr(() => 18) },
    daily: { time: Array.from({ length: 7 }, (_, i) => diasAtras(-i, agora)), temperature_2m_max: [33, 34, 35, 36, 30, 30, 30], temperature_2m_min: [20, 3, 20, 20, 20, 20, 20],
      precipitation_sum: [0, 0, 35, 0, 0, 0, 0], precipitation_probability_max: [10, 0, 95, 0, 0, 0, 0], et0_fao_evapotranspiration: [6, 6, 6, 6, 6, 6, 6] },
  };
  void hoje; void n;
  return nPontos === 1 ? ponto : Array.from({ length: nPontos }, () => ponto);
}

test('job: importa estacao publica e virtual, mantem sensor com dados proprios, promove admin', async () => {
  const agora = new Date();
  const ontem = diasAtras(1, agora);
  const hSensor = {}; for (let i = 0; i < 24; i++) hSensor[String(i).padStart(2, '0')] = { temp: 25, tmax: 26, tmin: 24, rh: 70, p: 995 };
  const db = fakeDb({
    'users/u1': { email: 'chefe@x.test', role: 'client', status: 'pending', plan: 'basic' },
    'users/u2': { email: 'outro@x.test', role: 'client', status: 'pending', plan: 'basic' },
    'stations/pub_a901': { name: 'Cuiaba', type: 'publica', public: true, active: true, lat: -15.6, lon: -56.1, elevation: 150, owner: null, historico: true },
    'stations/u2_e_0': { name: 'Virtual', type: 'virtual', public: false, active: true, lat: -13, lon: -56, owner: 'u2' },
    'stations/u2_e_1': { name: 'Sensor', type: 'sensor', public: false, active: true, lat: -13, lon: -56, owner: 'u2', ultimoDado: Timestamp.fromDate(new Date(agora - 3600e3)), historico: true },
    [`stations/u2_e_1/dias/${ontem}`]: { h: hSensor },
    'stations/off': { name: 'Desligada', type: 'virtual', active: false, lat: 0, lon: 0 },
  });
  const chamadas = [];
  globalThis.fetch = async (url) => {
    chamadas.push(url);
    const n = new URL(url).searchParams.get('latitude').split(',').length;
    return { ok: true, status: 200, json: async () => omFalso(n, agora) };
  };
  process.env.ADMIN_EMAILS = 'Chefe@x.test';
  const s = await executar(db, { agora });

  assert.equal(s.estacoes, 3); assert.deepEqual(s.falhas, []); assert.equal(s.admins, 1);
  assert.equal(db.docs.get('users/u1').role, 'admin'); assert.equal(db.docs.get('users/u1').status, 'active');
  assert.equal(db.docs.get('users/u2').role, 'client');
  assert.equal(chamadas.length, 2, 'um lote com historico e um lote de estacoes novas');
  assert.match(chamadas.find((u) => u.includes('past_days=30')), /latitude=-13.0000&/, 'so a estacao nova pede 30 dias');

  const pub = db.docs.get('stations/pub_a901');
  assert.ok(pub.atual.temp != null && pub.atual.fonte === 'open-meteo');
  assert.equal(pub.previsao.dias.length, 7);
  assert.ok(pub.previsao.itens.some((a) => a.tipo === 'geada'));
  assert.ok(pub.previsao.itens.some((a) => a.tipo === 'chuva'));
  assert.equal(pub.ontem.data, ontem); assert.ok(pub.ontem.eto > 2 && pub.ontem.eto < 9);
  const diaPub = db.docs.get(`stations/pub_a901/dias/${ontem}`);
  assert.equal(Object.keys(diaPub.h).length, 24); assert.equal(diaPub.resumo.chuva, 2);
  assert.equal(db.docs.get(`stations/pub_a901/dias/${dataLocal(agora)}`).resumo, undefined, 'hoje ainda nao tem resumo');

  const sen = db.docs.get('stations/u2_e_1');
  assert.equal(sen.atual, undefined, 'o job nao sobrescreve a leitura do sensor');
  const diaSen = db.docs.get(`stations/u2_e_1/dias/${ontem}`);
  assert.equal(diaSen.h['05'].temp, 25, 'horas medidas preservadas');
  assert.equal(diaSen.reserva.chuva, 2);
  assert.equal(diaSen.resumo.fonteChuva, 'modelo'); assert.equal(diaSen.resumo.chuva, 2); assert.equal(diaSen.resumo.tmax, 26);
  assert.equal(s.sensoresParados.length, 1);

  assert.equal(db.docs.get('stations/u2_e_0').historico, true);
  assert.equal(db.docs.get('stations/off').atual, undefined);
  assert.ok(db.docs.get('sistema/status').horaLocal.startsWith(horaLocal(agora).slice(0, 10)));
});

test('job: falha no Open-Meteo vira registro em sistema/status, nao derruba', async () => {
  const db = fakeDb({ 'stations/pub_x': { name: 'X', type: 'publica', public: true, active: true, lat: -15, lon: -56, historico: true } });
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const orig = globalThis.setTimeout; globalThis.setTimeout = (f) => orig(f, 0);
  const s = await executar(db, {});
  globalThis.setTimeout = orig;
  assert.equal(s.falhas.length, 1); assert.match(s.falhas[0], /503/);
});
