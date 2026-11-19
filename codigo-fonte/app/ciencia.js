// Nucleo cientifico do Meteora Agro.
// Usado pelo navegador E pelo job horario do GitHub (Node), por isso nao depende de nada externo.

export const FUSO = 'America/Cuiaba';
export const VENTO_10M_PARA_2M = 0.748; // FAO-56 eq. 47 (z = 10 m)

// ------------------------------------------------------------------ tempo (hora local de MT)
const fmtHora = new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
/** 'AAAA-MM-DDTHH' no fuso de Mato Grosso */
export const horaLocal = (d = new Date()) => fmtHora.format(d).replace(' ', 'T');
export const dataLocal = (d = new Date()) => horaLocal(d).slice(0, 10);
export const diasAtras = (n, base = new Date()) => dataLocal(new Date(base.getTime() - n * 86400e3));
/** lista de datas de ini a fim (inclusive) */
export function datasEntre(ini, fim) {
  const out = [];
  for (let t = Date.parse(ini + 'T12:00:00Z'); t <= Date.parse(fim + 'T12:00:00Z'); t += 86400e3) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

// ------------------------------------------------------------------ ETo FAO-56
const rad = (g) => (g * Math.PI) / 180;
export const es = (T) => 0.6108 * Math.exp((17.27 * T) / (T + 237.3));
const delta = (T) => (4098 * es(T)) / (T + 237.3) ** 2;

export function diaDoAno(iso) {
  const d = Date.parse(iso + 'T12:00:00Z');
  return Math.floor((d - Date.UTC(new Date(d).getUTCFullYear(), 0, 0)) / 86400e3);
}

/** Radiacao extraterrestre diaria Ra (MJ/m2/dia) - FAO-56 eq. 21 */
export function radiacaoExtraterrestre(lat, doy) {
  const phi = rad(lat);
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const dec = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(dec))));
  return Math.max(0, ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.sin(ws)));
}

/**
 * ETo diaria (mm) FAO-56 Penman-Monteith.
 * p: tmax, tmin (°C), ur (% media), u2 (m/s a 2 m), rs (MJ/m2/dia, opcional), lat, data 'AAAA-MM-DD', altitude (m), pressao (kPa, opcional)
 * Sem radiacao medida usa Hargreaves (kRs 0,16); sem vento usa 2 m/s (recomendacao FAO).
 */
export function eto(p) {
  const { tmax, tmin } = p;
  if (tmax == null || tmin == null) return null;
  const T = (tmax + tmin) / 2;
  const Ra = radiacaoExtraterrestre(p.lat, diaDoAno(p.data));
  const z = p.altitude || 0;
  const P = p.pressao || 101.3 * ((293 - 0.0065 * z) / 293) ** 5.26;
  const gama = 0.000665 * P;
  const esm = (es(tmax) + es(tmin)) / 2;
  const ea = (Math.max(1, Math.min(100, p.ur ?? 60)) / 100) * esm;
  const u2 = Math.max(0, p.u2 ?? 2);
  const Rs = p.rs ?? 0.16 * Math.sqrt(Math.max(0, tmax - tmin)) * Ra;
  const Rso = (0.75 + 2e-5 * z) * Ra;
  const Rnl = 4.903e-9 * (((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2) * (0.34 - 0.14 * Math.sqrt(ea)) * (1.35 * (Rso > 0 ? Math.min(Rs / Rso, 1) : 0.5) - 0.35);
  const Rn = 0.77 * Rs - Rnl;
  const d = delta(T);
  const v = (0.408 * d * Rn + gama * (900 / (T + 273)) * u2 * (esm - ea)) / (d + gama * (1 + 0.34 * u2));
  return { eto: +Math.max(0, v).toFixed(2), rn: +Rn.toFixed(2), vpd: +(esm - ea).toFixed(3), rsEstimada: p.rs == null };
}

export const grausDia = (tmax, tmin, base = 10) => (tmax == null || tmin == null ? null : +Math.max(0, (tmax + tmin) / 2 - base).toFixed(1));

/**
 * Resumo diario a partir do mapa de horas { '00': {temp,tmax,tmin,rh,p,wind,rain,rad}, ... }.
 * reserva: { chuva, vento } do modelo para estacoes sem pluviometro/anemometro.
 * Devolve null se o dia tiver menos de 18 horas.
 */
export function resumoDia(h, { data, lat, altitude = 0, reserva = {} }) {
  const horas = Object.values(h || {}).filter((x) => x && x.temp != null);
  if (horas.length < 18) return null;
  const media = (c) => { const v = horas.map((x) => x[c]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const tmax = Math.max(...horas.map((x) => x.tmax ?? x.temp));
  const tmin = Math.min(...horas.map((x) => x.tmin ?? x.temp));
  const comRad = horas.filter((x) => x.rad != null).length >= 18;
  const comChuva = horas.some((x) => x.rain != null);
  const comVento = horas.filter((x) => x.wind != null).length >= 18;
  const chuva = comChuva ? horas.reduce((s, x) => s + (x.rain || 0), 0) : (reserva.chuva ?? 0);
  const u2 = comVento ? media('wind') : (reserva.vento ?? null);
  const p = media('p');
  const r = eto({ tmax, tmin, ur: media('rh'), u2, rs: comRad ? media('rad') * 0.0864 : null, lat, data, altitude, pressao: p != null ? p / 10 : null });
  return {
    tmax: +tmax.toFixed(1), tmin: +tmin.toFixed(1), tavg: +((tmax + tmin) / 2).toFixed(1),
    ur: media('rh') != null ? Math.round(media('rh')) : null, vento: u2 != null ? +u2.toFixed(2) : null,
    chuva: +chuva.toFixed(1), fonteChuva: comChuva ? 'medida' : 'modelo',
    eto: r.eto, rn: r.rn, vpd: r.vpd, rsEstimada: r.rsEstimada,
    balanco: +(chuva - r.eto).toFixed(2), gd: grausDia(tmax, tmin), horas: horas.length,
  };
}

// ------------------------------------------------------------------ geometria do contorno
export function aneis(geo) {
  if (!geo || typeof geo !== 'object') throw new Error('GeoJSON invalido');
  switch (geo.type) {
    case 'FeatureCollection': {
      const f = geo.features || [];
      const lim = f.filter((x) => ((x.properties || {}).tipo || 'limite') === 'limite');
      return (lim.length ? lim : f).flatMap(aneis);
    }
    case 'Feature': return aneis(geo.geometry);
    case 'Polygon': return [geo.coordinates[0]];
    case 'MultiPolygon': return geo.coordinates.map((p) => p[0]);
    default: throw new Error('O contorno deve ser um Polygon ou MultiPolygon');
  }
}
/** Area geodesica (esfera WGS84) em hectares de um anel [[lon, lat], ...] */
export function areaHa(anel) {
  const R = 6378137;
  let a = 0;
  for (let i = 0; i < anel.length; i++) {
    const [lo1, la1] = anel[i]; const [lo2, la2] = anel[(i + 1) % anel.length];
    a += rad(lo2 - lo1) * (2 + Math.sin(rad(la1)) + Math.sin(rad(la2)));
  }
  return Math.abs((a * R * R) / 2) / 10000;
}
/** Valida o contorno e devolve { areaHa, lat, lon } */
export function resumoContorno(geo) {
  const lista = aneis(typeof geo === 'string' ? JSON.parse(geo) : geo);
  if (!lista.length) throw new Error('Contorno vazio');
  for (const anel of lista) {
    if (!Array.isArray(anel) || anel.length < 4) throw new Error('O contorno precisa de pelo menos 3 vertices');
    for (const [lon, lat] of anel) if (typeof lon !== 'number' || typeof lat !== 'number' || Math.abs(lon) > 180 || Math.abs(lat) > 90) throw new Error('Coordenadas invalidas (use [longitude, latitude])');
  }
  const pts = lista.flatMap((a) => a.slice(0, -1));
  return {
    areaHa: +lista.reduce((s, a) => s + areaHa(a), 0).toFixed(1),
    lat: +(pts.reduce((s, p) => s + p[1], 0) / pts.length).toFixed(6),
    lon: +(pts.reduce((s, p) => s + p[0], 0) / pts.length).toFixed(6),
  };
}

// ------------------------------------------------------------------ previsao e avisos (formato Open-Meteo)
/** Janelas boas para pulverizar nas proximas 48 h: 6h-18h, vento 3-10 km/h, T <= 30 °C, UR >= 55 %, sem chuva nas 3 h seguintes */
export function janelasPulverizacao(hourly, agora = new Date()) {
  const ini = horaLocal(agora); const fim = horaLocal(new Date(agora.getTime() + 48 * 3600e3));
  const boas = [];
  hourly.time.forEach((t, i) => {
    const hora = t.slice(0, 13); const hh = +t.slice(11, 13);
    if (hora < ini || hora > fim || hh < 6 || hh > 18) return;
    const v = hourly.wind_speed_10m[i]; const T = hourly.temperature_2m[i]; const ur = hourly.relative_humidity_2m[i];
    if (v == null || T == null || ur == null) return;
    let chuva = 0;
    for (let k = i; k < Math.min(i + 3, hourly.time.length); k++) chuva += hourly.precipitation[k] || 0;
    const kmh = v * 3.6;
    if (kmh >= 3 && kmh <= 10 && T <= 30 && ur >= 55 && chuva === 0) boas.push(hora);
  });
  const janelas = [];
  for (const h of boas) {
    const ult = janelas[janelas.length - 1];
    if (ult && Date.parse(h + ':00Z') - Date.parse(ult.ate + ':00Z') === 3600e3) { ult.ate = h; ult.horas++; } else janelas.push({ de: h, ate: h, horas: 1 });
  }
  return janelas;
}

/** Avisos agronomicos a partir da previsao diaria (7 dias) */
export function avisos(daily) {
  const it = [];
  daily.time.forEach((t, i) => {
    const d = `${t.slice(8, 10)}/${t.slice(5, 7)}`;
    const tmin = daily.temperature_2m_min[i]; const tmax = daily.temperature_2m_max[i]; const ch = daily.precipitation_sum[i] || 0;
    if (tmin != null && tmin <= 2) it.push({ nivel: 'alto', tipo: 'geada', titulo: `Risco alto de geada em ${d}`, texto: `Minima prevista de ${tmin.toFixed(1)} °C. Proteja mudas e lavouras sensiveis.` });
    else if (tmin != null && tmin <= 4) it.push({ nivel: 'medio', tipo: 'geada', titulo: `Risco de geada em ${d}`, texto: `Minima prevista de ${tmin.toFixed(1)} °C.` });
    if (tmax != null && tmax >= 35) it.push({ nivel: 'medio', tipo: 'calor', titulo: `Calor forte em ${d}`, texto: `Maxima prevista de ${tmax.toFixed(1)} °C: evite aplicacoes nas horas quentes.` });
    if (ch >= 30) it.push({ nivel: 'medio', tipo: 'chuva', titulo: `Chuva forte em ${d}`, texto: `${ch.toFixed(0)} mm previstos: atencao a colheita e a erosao.` });
  });
  const chuva7 = daily.precipitation_sum.reduce((s, x) => s + (x || 0), 0);
  const eto7 = daily.et0_fao_evapotranspiration.reduce((s, x) => s + (x || 0), 0);
  if (eto7 - chuva7 > 25) it.push({ nivel: 'medio', tipo: 'deficit', titulo: 'Deficit hidrico na semana', texto: `ETo prevista de ${eto7.toFixed(0)} mm contra ${chuva7.toFixed(0)} mm de chuva.` });
  return { itens: it, chuva7: +chuva7.toFixed(1), eto7: +eto7.toFixed(1) };
}

/** Converte a resposta diaria do Open-Meteo em lista compacta para guardar/mostrar */
export const previsao7 = (daily) => daily.time.map((t, i) => ({
  data: t, tmin: daily.temperature_2m_min[i], tmax: daily.temperature_2m_max[i], chuva: daily.precipitation_sum[i],
  prob: daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null, eto: daily.et0_fao_evapotranspiration[i],
}));

// ------------------------------------------------------------------ irrigacao: Kc por cultura (FAO-56 tabela 12, ajustado ao Cerrado)
export const CULTURAS = {
  soja: { nome: 'Soja', fases: [['Inicial (0-20 d)', 0.4], ['Vegetativo (20-45 d)', 0.8], ['Florescimento/enchimento (45-100 d)', 1.15], ['Maturacao (100-120 d)', 0.5]] },
  milho: { nome: 'Milho', fases: [['Inicial (0-25 d)', 0.3], ['Vegetativo (25-60 d)', 0.75], ['Pendoamento/enchimento (60-110 d)', 1.2], ['Maturacao (110-135 d)', 0.6]] },
  algodao: { nome: 'Algodao', fases: [['Inicial (0-30 d)', 0.35], ['Vegetativo (30-80 d)', 0.75], ['Florescimento/macas (80-140 d)', 1.18], ['Abertura (140-180 d)', 0.65]] },
  feijao: { nome: 'Feijao', fases: [['Inicial (0-15 d)', 0.4], ['Vegetativo (15-40 d)', 0.75], ['Florescimento/vagens (40-75 d)', 1.15], ['Maturacao (75-90 d)', 0.35]] },
  cana: { nome: 'Cana-de-acucar', fases: [['Brotacao', 0.4], ['Perfilhamento', 0.8], ['Crescimento', 1.25], ['Maturacao', 0.75]] },
  pastagem: { nome: 'Pastagem', fases: [['Pos-pastejo', 0.4], ['Rebrota', 0.75], ['Pasto formado', 1.0]] },
  cafe: { nome: 'Cafe', fases: [['Formacao', 0.9], ['Producao', 1.05]] },
};
/** Necessidade de irrigacao (mm) num periodo: soma(Kc*ETo) - chuva efetiva (80 % da chuva) */
export function necessidadeIrrigacao(dias, kc) {
  const etc = dias.reduce((s, d) => s + kc * (d.eto || 0), 0);
  const chuvaEf = dias.reduce((s, d) => s + 0.8 * (d.chuva || 0), 0);
  return { etc: +etc.toFixed(1), chuvaEfetiva: +chuvaEf.toFixed(1), lamina: +Math.max(0, etc - chuvaEf).toFixed(1) };
}

// ------------------------------------------------------------------ conversoes de fontes
/** Open-Meteo horario -> { 'AAAA-MM-DD': { 'HH': {temp, rh, p, wind(2 m), dir, rain, rad, dew} } } ate a hora atual */
export function horasOpenMeteo(hourly, agora = new Date()) {
  const lim = horaLocal(agora);
  const dias = {};
  hourly.time.forEach((t, i) => {
    const hora = t.slice(0, 13);
    if (hora > lim) return;
    const v = hourly.wind_speed_10m[i];
    (dias[hora.slice(0, 10)] ||= {})[hora.slice(11, 13)] = limpar({
      temp: hourly.temperature_2m[i], rh: hourly.relative_humidity_2m[i], p: hourly.surface_pressure[i],
      wind: v != null ? +(v * VENTO_10M_PARA_2M).toFixed(2) : null, dir: hourly.wind_direction_10m[i],
      rain: hourly.precipitation[i], rad: hourly.shortwave_radiation[i], dew: hourly.dew_point_2m[i],
    });
  });
  return dias;
}
/** INMET (horario em UTC) -> mesmo formato */
export function horasInmet(lista) {
  const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const dias = {};
  for (const d of lista || []) {
    const utc = new Date(`${d.DT_MEDICAO}T${String(d.HR_MEDICAO).padStart(4, '0').slice(0, 2)}:00:00Z`);
    if (Number.isNaN(+utc) || n(d.TEM_INS) == null) continue;
    const hora = horaLocal(utc);
    const v = n(d.VEN_VEL); const r = n(d.RAD_GLO);
    (dias[hora.slice(0, 10)] ||= {})[hora.slice(11, 13)] = limpar({
      temp: n(d.TEM_INS), tmax: n(d.TEM_MAX), tmin: n(d.TEM_MIN), rh: n(d.UMD_INS), p: n(d.PRE_INS),
      wind: v != null ? +(v * VENTO_10M_PARA_2M).toFixed(2) : null, dir: n(d.VEN_DIR), rain: n(d.CHUVA),
      rad: r != null ? Math.max(0, +(r / 3.6).toFixed(1)) : null, dew: n(d.PTO_INS),
    });
  }
  return dias;
}
function limpar(o) { for (const k of Object.keys(o)) if (o[k] == null || Number.isNaN(o[k])) delete o[k]; return o; }

/** Resumo das ultimas 24 h a partir dos mapas de horas de hoje e ontem */
export function resumo24h(diasMap, agora = new Date()) {
  const ini = horaLocal(new Date(agora.getTime() - 24 * 3600e3));
  const lista = [];
  for (const [dia, h] of Object.entries(diasMap)) for (const [hh, v] of Object.entries(h || {})) { const hora = `${dia}T${hh}`; if (hora > ini && v && v.temp != null) lista.push({ hora, ...v }); }
  lista.sort((a, b) => (a.hora < b.hora ? -1 : 1));
  if (!lista.length) return null;
  const u = lista[lista.length - 1];
  return {
    atual: { hora: u.hora, temp: u.temp ?? null, rh: u.rh ?? null, p: u.p ?? null, wind: u.wind ?? null, dir: u.dir ?? null, rad: u.rad ?? null, dew: u.dew ?? null },
    chuva24h: +lista.reduce((s, x) => s + (x.rain || 0), 0).toFixed(1),
    tmin24h: Math.min(...lista.map((x) => x.tmin ?? x.temp)), tmax24h: Math.max(...lista.map((x) => x.tmax ?? x.temp)),
  };
}

// ------------------------------------------------------------------ planos
export const PLANOS = {
  basic: { nome: 'Gratis', propriedades: 1, estacoes: 2, historicoDias: 30 },
  pro: { nome: 'Produtor', propriedades: 5, estacoes: 10, historicoDias: 730 },
  enterprise: { nome: 'Cooperativa', propriedades: 100, estacoes: 200, historicoDias: 3650 },
};
