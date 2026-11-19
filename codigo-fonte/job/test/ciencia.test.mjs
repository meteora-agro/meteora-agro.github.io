import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../app/ciencia.js';

test('ETo FAO-56 exemplo 18 (Uccle) ~3,9 mm', () => {
  const r = C.eto({ tmax: 21.5, tmin: 12.3, ur: 63, u2: 2.078, rs: 22.07, lat: 50.8, altitude: 100, data: '2026-07-06' });
  assert.ok(r.eto > 3.4 && r.eto < 4.3, `eto ${r.eto}`);
});

test('ETo Cuiaba sem radiacao medida fica plausivel', () => {
  const r = C.eto({ tmax: 34, tmin: 22, ur: 60, u2: 1.5, lat: -15.6, altitude: 165, data: '2026-10-15' });
  assert.ok(r.rsEstimada && r.eto > 3 && r.eto < 8, `eto ${r.eto}`);
});

test('resumo diario exige 18 horas e usa chuva de reserva sem pluviometro', () => {
  const h = {};
  for (let i = 0; i < 24; i++) h[String(i).padStart(2, '0')] = { temp: 22 + 8 * Math.sin(((i - 9) / 24) * 2 * Math.PI), rh: 65, p: 990 };
  const r = C.resumoDia(h, { data: '2026-11-10', lat: -15, altitude: 200, reserva: { chuva: 12.3, vento: 1.8 } });
  assert.equal(r.chuva, 12.3); assert.equal(r.fonteChuva, 'modelo'); assert.equal(r.vento, 1.8);
  assert.equal(r.balanco, +(12.3 - r.eto).toFixed(2));
  assert.equal(r.horas, 24);
  const parcial = Object.fromEntries(Object.entries(h).slice(0, 10));
  assert.equal(C.resumoDia(parcial, { data: '2026-11-10', lat: -15 }), null);
});

test('area do contorno (~1 km x 1 km = ~100 ha) e validacao', () => {
  const d = 0.008993;
  assert.ok(Math.abs(C.areaHa([[0, 0], [d, 0], [d, d], [0, d], [0, 0]]) - 100) < 1.5);
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { tipo: 'limite' }, geometry: { type: 'Polygon', coordinates: [[[-56, -15], [-55.99, -15], [-55.99, -15.01], [-56, -15.01], [-56, -15]]] } }] };
  const r = C.resumoContorno(JSON.stringify(fc));
  assert.ok(r.areaHa > 100 && r.areaHa < 130);
  assert.throws(() => C.resumoContorno({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }));
  assert.throws(() => C.resumoContorno({ type: 'Polygon', coordinates: [[[0, 95], [1, 1], [2, 2], [0, 95]]] }));
});

function previsaoFalsa(agora) {
  const time = []; const T = []; const RH = []; const P = []; const W = [];
  const ini = Date.parse(C.dataLocal(agora) + 'T00:00:00Z');
  for (let i = 0; i < 72; i++) {
    const t = new Date(ini + i * 3600e3).toISOString().slice(0, 16); const hh = +t.slice(11, 13);
    const boa = hh >= 6 && hh <= 9;
    time.push(t); T.push(boa ? 24 : 33); RH.push(boa ? 75 : 40); P.push(0); W.push(1.5);
  }
  return {
    hourly: { time, temperature_2m: T, relative_humidity_2m: RH, precipitation: P, wind_speed_10m: W },
    daily: { time: C.datasEntre(C.dataLocal(agora), C.diasAtras(-6, agora)), temperature_2m_min: [1.5, 3.5, 18, 18, 18, 18, 18], temperature_2m_max: [30, 36, 30, 30, 30, 30, 30],
      precipitation_sum: [0, 0, 40, 0, 0, 0, 0], precipitation_probability_max: [0, 0, 90, 0, 0, 0, 0], et0_fao_evapotranspiration: [6, 6, 6, 6, 6, 6, 6] },
  };
}

test('avisos: geada alta e media, calor, chuva forte', () => {
  const a = C.avisos(previsaoFalsa(new Date()).daily);
  const tipos = a.itens.map((i) => `${i.tipo}:${i.nivel}`);
  for (const t of ['geada:alto', 'geada:medio', 'calor:medio', 'chuva:medio']) assert.ok(tipos.includes(t), t);
  assert.equal(a.chuva7, 40); assert.equal(a.eto7, 42);
});

test('janelas de pulverizacao so nas horas boas (6-9h)', () => {
  const agora = new Date(); const p = previsaoFalsa(agora);
  const j = C.janelasPulverizacao(p.hourly, new Date(Date.parse(p.hourly.time[0] + ':00-04:00')));
  assert.ok(j.length >= 1);
  for (const w of j) { assert.ok(w.horas <= 4); assert.ok(+w.de.slice(11, 13) >= 6 && +w.ate.slice(11, 13) <= 9); }
});

test('Open-Meteo e INMET viram mapa de horas local', () => {
  const om = { time: ['2026-11-10T00:00', '2026-11-10T01:00', '2099-01-01T00:00'], temperature_2m: [25, 24, 1], relative_humidity_2m: [70, 72, 1], surface_pressure: [990, 991, 1],
    wind_speed_10m: [2, null, 1], wind_direction_10m: [90, 100, 1], precipitation: [0, 1.2, 1], shortwave_radiation: [0, 0, 1], dew_point_2m: [19, 18, 1] };
  const d = C.horasOpenMeteo(om);
  assert.deepEqual(Object.keys(d), ['2026-11-10']);
  assert.equal(d['2026-11-10']['00'].wind, 1.5);
  assert.equal(d['2026-11-10']['01'].wind, undefined);
  const inm = C.horasInmet([{ DT_MEDICAO: '2026-11-10', HR_MEDICAO: '1500', TEM_INS: '30.1', UMD_INS: '50', RAD_GLO: '3600', VEN_VEL: '2', CHUVA: '0' }]);
  assert.equal(inm['2026-11-10']['11'].temp, 30.1); // 15 UTC = 11 h em MT
  assert.equal(inm['2026-11-10']['11'].rad, 1000);
});

test('resumo das ultimas 24 h', () => {
  const agora = new Date('2026-11-10T16:30:00Z'); // 12:30 em MT
  const r = C.resumo24h({ '2026-11-09': { 10: { temp: 5 }, 20: { temp: 24, rain: 2 } }, '2026-11-10': { '11': { temp: 31, tmax: 32, rain: 1 }, '12': { temp: 33, rh: 40 } } }, agora);
  assert.equal(r.atual.temp, 33); assert.equal(r.chuva24h, 3); assert.equal(r.tmax24h, 33); assert.equal(r.tmin24h, 24);
});

test('irrigacao: ETc - chuva efetiva', () => {
  const r = C.necessidadeIrrigacao([{ eto: 5, chuva: 0 }, { eto: 5, chuva: 5 }], 1.15);
  assert.deepEqual(r, { etc: 11.5, chuvaEfetiva: 4, lamina: 7.5 });
});
