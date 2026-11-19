// Substitui web/js/dados.js nos testes de interface: mesmos exports, dados de exemplo em memoria.
import { PLANOS, horaLocal, dataLocal, diasAtras, resumoDia, datasEntre } from '../../app/ciencia.js';

const papel = new URLSearchParams(location.search).get('papel') || 'admin';
const agora = new Date();
const ts = (d) => ({ toMillis: () => +d, toDate: () => d });
const prev = { em: ts(agora), chuva7: 46, eto7: 38.5, dias: Array.from({ length: 7 }, (_, i) => ({ data: diasAtras(-i), tmin: 20 + (i % 3), tmax: 33 - (i % 2) * 2, chuva: [0, 2, 35, 8, 0, 0, 1][i], prob: [5, 40, 95, 70, 10, 5, 20][i], eto: 5.5 - i * 0.2 })),
  itens: [{ nivel: 'medio', tipo: 'chuva', titulo: `Chuva forte em ${diasAtras(-2).slice(8)}/${diasAtras(-2).slice(5, 7)}`, texto: '35 mm previstos: atencao a colheita e a erosao.' }],
  janelas: [{ de: dataLocal() + 'T06', ate: dataLocal() + 'T09', horas: 4 }] };
const mk = (id, name, lat, lon, extra = {}) => ({ id, name, lat, lon, elevation: 300, active: true, type: 'publica', public: true, owner: null, inmetCode: id.slice(4).toUpperCase(),
  atual: { temp: 22 + (Math.abs(lat * 7) % 12), rh: 55 + (Math.abs(lon * 3) % 30), wind: 1.2 + (Math.abs(lat) % 3), dir: 120, p: 975, rad: 640, dew: 18, hora: horaLocal(), fonte: 'open-meteo' },
  chuva24h: +(Math.abs(lon) % 9).toFixed(1), tmin24h: 19, tmax24h: 34, ultimoDado: ts(new Date(agora - 20 * 60e3)), ontem: { data: diasAtras(1), eto: 5.3, chuva: 3.1, balanco: -2.2, gd: 17, fonteChuva: 'medida' }, previsao: prev, ...extra });
const publicas = [mk('pub_a901', 'Cuiaba', -15.61, -56.06), mk('pub_a917', 'Sinop', -11.98, -55.57), mk('pub_a904', 'Sorriso', -12.56, -55.72), mk('pub_a912', 'Campo Verde', -15.56, -55.18), mk('pub_a907', 'Rondonopolis', -16.46, -54.58)];
const contorno = { type: 'Polygon', coordinates: [[[-55.95, -13.05], [-55.90, -13.05], [-55.90, -13.09], [-55.95, -13.09], [-55.95, -13.05]]] };
const props = [{ id: 'u1_p_0', owner: 'u1', name: 'Fazenda Boa Esperanca', crop: 'Soja', city: 'Lucas do Rio Verde', state: 'MT', boundary: JSON.stringify(contorno), areaHa: 2402.7, lat: -13.07, lon: -55.925, plantio: diasAtras(50) }];
const minhas = [mk('u1_e_0', 'Sede - sensor', -13.07, -55.92, { type: 'sensor', public: false, owner: 'u1', inmetCode: null, propertyId: 'u1_p_0', deviceUid: 'd1', ultimoDado: ts(new Date(agora - 4 * 3600e3)) }),
  mk('u1_e_1', 'Talhao 3 (virtual)', -13.08, -55.94, { type: 'virtual', public: false, owner: 'u1', inmetCode: null, propertyId: 'u1_p_0' })];

export const S = { user: papel === 'anon' ? null : { uid: 'u1', email: 'ze@fazenda.test' }, perfil: papel === 'anon' ? null : { name: 'Ze da Silva', email: 'ze@fazenda.test', role: papel === 'admin' ? 'admin' : 'client', plan: 'pro', status: papel === 'pendente' ? 'pending' : 'active' },
  publicas, minhas: papel === 'admin' ? [] : minhas, todas: papel === 'admin' ? [...publicas, ...minhas] : [], props: papel === 'anon' ? [] : props, pronto: false };
export const ao = () => () => {};
export const pronto = Promise.resolve();
export const logado = () => !!S.user;
export const ativo = () => !!S.perfil && S.perfil.status === 'active';
export const admin = () => ativo() && S.perfil.role === 'admin';
export const plano = () => PLANOS[(S.perfil && S.perfil.plan) || 'basic'];
export function estacoes() { const m = new Map(); [...S.publicas, ...S.todas, ...S.minhas].forEach((e) => m.set(e.id, e)); return [...m.values()].sort((a, b) => (b.owner === 'u1') - (a.owner === 'u1') || a.name.localeCompare(b.name)); }
export const minhasEstacoes = () => (admin() ? S.todas.filter((e) => !e.public) : S.minhas);
export const estacao = (id) => estacoes().find((e) => e.id === id);
export const propriedade = (id) => S.props.find((p) => p.id === id);
export const proximaVaga = (t) => `u1_${t}_9`;
export const criarPerfil = async () => {};
function horasDia(dia, k) { const h = {}; for (let i = 0; i < 24; i++) h[String(i).padStart(2, '0')] = { temp: +(24 + 8 * Math.sin(((i - 9) / 24) * 2 * Math.PI) + (k % 3)).toFixed(1), rh: 60 - 15 * Math.sin(((i - 9) / 24) * 2 * Math.PI), wind: 1.5 + (i % 5) * 0.3, p: 975, rad: i > 6 && i < 18 ? 650 : 0, rain: i === 16 && k % 3 === 0 ? 6 : 0 }; return h; }
export async function dias(sid, ini, fim) { return datasEntre(ini, fim).map((d, k) => { const h = horasDia(d, k); return { data: d, h, resumo: d < dataLocal() ? resumoDia(h, { data: d, lat: -13, altitude: 300 }) : undefined }; }); }
export async function horas(sid, n = 48) { const ini = horaLocal(new Date(Date.now() - n * 3600e3)); const out = []; for (const d of await dias(sid, ini.slice(0, 10), dataLocal())) for (const [hh, v] of Object.entries(d.h)) { const hora = `${d.data}T${hh}`; if (hora > ini && hora <= horaLocal()) out.push({ hora, ...v }); } return out; }
export async function resumos(sid, ini, fim = diasAtras(1)) { return (await dias(sid, ini, fim)).filter((d) => d.resumo).map((d) => ({ data: d.data, ...d.resumo })); }
