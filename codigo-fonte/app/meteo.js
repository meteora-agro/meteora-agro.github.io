// Chamadas diretas do navegador ao Open-Meteo (gratuito, sem chave, com CORS)
import { FUSO } from './ciencia.js';

const cache = new Map();
async function json(url, ttlMin = 30) {
  const c = cache.get(url);
  if (c && Date.now() - c.t < ttlMin * 60e3) return c.v;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Servico de previsao indisponivel agora. Tente em instantes.');
  const v = await r.json();
  cache.set(url, { t: Date.now(), v });
  return v;
}

/** Previsao de 7 dias + horaria (para avisos e janelas) num ponto */
export function previsaoPonto(lat, lon) {
  const p = new URLSearchParams({
    latitude: (+lat).toFixed(4), longitude: (+lon).toFixed(4), timezone: FUSO, forecast_days: 7, wind_speed_unit: 'ms',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration,wind_speed_10m_max,relative_humidity_2m_min,sunshine_duration',
    hourly: 'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m',
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation',
  });
  return json('https://api.open-meteo.com/v1/forecast?' + p);
}

/** Grade de vento n x n no formato do leaflet-velocity (componentes U e V) */
export async function gradeVento(lat, lon, { span = 10, n = 13, hora = 0 } = {}) {
  const passo = span / (n - 1);
  const la1 = +(lat + span / 2).toFixed(3); const lo1 = +(lon - span / 2).toFixed(3);
  const lats = []; const lons = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { lats.push((la1 - j * passo).toFixed(3)); lons.push((lo1 + i * passo).toFixed(3)); }
  const p = new URLSearchParams({ latitude: lats.join(','), longitude: lons.join(','), hourly: 'wind_speed_10m,wind_direction_10m', wind_speed_unit: 'ms', forecast_days: 3, timezone: 'UTC' });
  let pts = await json('https://api.open-meteo.com/v1/forecast?' + p, 60);
  if (!Array.isArray(pts)) pts = [pts];
  const tempos = pts[0].hourly.time;
  const agora = new Date().toISOString().slice(0, 13) + ':00';
  const idx = Math.min(Math.max(0, tempos.indexOf(agora)) + hora, tempos.length - 1);
  const u = []; const v = [];
  for (const pt of pts) {
    const vel = pt.hourly.wind_speed_10m[idx] || 0; const dir = ((pt.hourly.wind_direction_10m[idx] || 0) * Math.PI) / 180;
    u.push(+(-vel * Math.sin(dir)).toFixed(2)); v.push(+(-vel * Math.cos(dir)).toFixed(2));
  }
  const cab = { parameterCategory: 2, nx: n, ny: n, lo1, la1, lo2: +(lo1 + span).toFixed(3), la2: +(la1 - span).toFixed(3), dx: passo, dy: passo, refTime: tempos[idx] + ':00Z' };
  return { quando: tempos[idx], max: Math.max(...u.map((x, i) => Math.hypot(x, v[i]))), campo: [{ header: { ...cab, parameterNumber: 2 }, data: u }, { header: { ...cab, parameterNumber: 3 }, data: v }] };
}

/** Altitude (m) do ponto, pelo modelo digital de elevacao do Open-Meteo */
export async function altitude(lat, lon) {
  try {
    const j = await json(`https://api.open-meteo.com/v1/elevation?latitude=${(+lat).toFixed(4)}&longitude=${(+lon).toFixed(4)}`, 1440);
    return Math.round(j.elevation[0]);
  } catch { return null; }
}
