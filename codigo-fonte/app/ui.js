// Utilidades de interface
/* global Chart */
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ic = (nome, cls = 'i') => `<svg class="${cls}"><use href="#i-${nome}"/></svg>`;

export const n = (v, d = 1) => (v == null || Number.isNaN(Number(v)) ? '–' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const kmh = (ms, d = 0) => (ms == null ? '–' : n(ms * 3.6, d));
export const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '–');
export const dma = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '–');
export const dmh = (h) => (h ? `${h.slice(8, 10)}/${h.slice(5, 7)} ${h.slice(11, 13)}h` : '–');
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
export const semana = (iso) => SEMANA[new Date(iso + 'T12:00:00').getDay()];

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'L', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
export const rumo = (g) => (g == null ? '' : DIRS[Math.round(g / 22.5) % 16]);

export function quando(ts) {
  if (!ts) return 'sem dados';
  const ms = typeof ts.toMillis === 'function' ? ts.toMillis() : +new Date(ts);
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 2) return 'agora';
  if (min < 60) return `ha ${min} min`;
  if (min < 48 * 60) return `ha ${Math.round(min / 60)} h`;
  return `ha ${Math.round(min / 1440)} dias`;
}

/** cor da temperatura (pinos, numeros) */
export function corTemp(t) {
  if (t == null) return '#8a968d';
  return [[10, '#3b82c4'], [18, '#2aa5b5'], [24, '#3fa34d'], [29, '#d39a1a'], [33, '#e8711c'], [99, '#d63b2f']].find(([l]) => t < l)[1];
}
export const LEGENDA_TEMP = [[8, '< 10'], [15, '10–18'], [20, '18–24'], [26, '24–29'], [31, '29–33'], [36, '> 33']];

/** emoji do dia pela chuva e temperatura (previsao) */
export function iconeDia(chuva, prob, tmax) {
  if ((chuva ?? 0) >= 10) return '⛈️';
  if ((chuva ?? 0) >= 2 || (prob ?? 0) >= 60) return '🌧️';
  if ((prob ?? 0) >= 30) return '🌦️';
  if ((tmax ?? 0) >= 33) return '☀️';
  return '⛅';
}

let timerToast;
export function toast(msg, erro = false) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.className = `toast${erro ? ' erro' : ''}`; el.textContent = msg; el.hidden = false;
  clearTimeout(timerToast); timerToast = setTimeout(() => { el.hidden = true; }, erro ? 6000 : 3500);
}

/** executa uma acao de botao: trava, mostra erro amigavel */
export async function acao(btn, fn) {
  const txt = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Aguarde...'; }
  try { return await fn(); } catch (e) { console.error(e); toast(mensagemErro(e), true); return undefined; } finally { if (btn) { btn.disabled = false; btn.innerHTML = txt; } }
}
export function mensagemErro(e) {
  const c = e && e.code;
  return ({
    'permission-denied': 'Sem permissao para isso (limite do plano ou cadastro ainda nao aprovado).',
    unavailable: 'Sem conexao. Tente de novo quando tiver sinal.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.', 'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Este e-mail ja tem cadastro. Use "Entrar".', 'auth/weak-password': 'Senha fraca: use pelo menos 8 caracteres.',
    'auth/invalid-email': 'E-mail invalido.', 'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.', 'auth/network-request-failed': 'Sem conexao com a internet.',
  })[c] || (e && e.message) || String(e);
}

// ------------------------------------------------------------------ dialogo generico
export function dialogo(html, aoAbrir) {
  const d = $('#dlg');
  $('#dlg-corpo').innerHTML = html;
  $$('[data-fechar]', d).forEach((b) => b.addEventListener('click', () => d.close()));
  d.showModal();
  if (aoAbrir) aoAbrir(d);
  return d;
}

// ------------------------------------------------------------------ graficos (Chart.js)
const graficos = new Map();
export function grafico(canvas, cfg) {
  if (!canvas) return null;
  if (graficos.has(canvas.id)) graficos.get(canvas.id).destroy();
  const css = getComputedStyle(document.documentElement);
  Chart.defaults.color = css.getPropertyValue('--suave').trim();
  Chart.defaults.borderColor = css.getPropertyValue('--borda').trim();
  Chart.defaults.font.family = css.getPropertyValue('--fonte').trim();
  Chart.defaults.scales.category.ticks.maxRotation = 0;
  Chart.defaults.scales.category.ticks.autoSkipPadding = 12;
  cfg.options = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } } },
    ...cfg.options,
  };
  const g = new Chart(canvas, cfg);
  graficos.set(canvas.id, g);
  return g;
}
export const COR = { temp: '#e8711c', ur: '#1f6fb5', chuva: '#3b82c4', eto: '#d39a1a', vento: '#2e7d32', min: '#2aa5b5', max: '#d63b2f', saldo: '#2e7d32' };

/** baixa um CSV */
export function baixarCsv(nome, cab, linhas) {
  const csv = [cab.join(';'), ...linhas.map((l) => l.map((v) => (v == null ? '' : String(v).replace('.', ','))).join(';'))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
