// Irrigacao: ETc = Kc x ETo (FAO-56), chuva efetiva, lamina a repor e volume na area da propriedade
import { ao, estacoes, estacao, propriedade, resumos } from '../dados.js';
import { $, esc, ic, n, dm, grafico, COR, acao } from '../ui.js';
import { CULTURAS, necessidadeIrrigacao, diasAtras } from '../ciencia.js';
import { rota } from '../nav.js';

let el; let serie = [];
const culturaDe = (txt) => {
  const t = (txt || '').toLowerCase();
  return Object.keys(CULTURAS).find((k) => t.includes(k.slice(0, 4)) || t.includes(CULTURAS[k].nome.toLowerCase().slice(0, 4))) || 'soja';
};

export function abrir(secao) {
  if (!el) {
    el = secao;
    el.innerHTML = `
      <div class="cab"><div><h1>Irrigacao</h1><p>Quanto a cultura consumiu (ETc = Kc × ETo) e quanto a chuva repos. Base: FAO-56.</p></div></div>
      <div class="card"><div class="form">
        <label>Estacao<select id="ir-est"></select></label>
        <label>Cultura<select id="ir-cult">${Object.entries(CULTURAS).map(([k, c]) => `<option value="${k}">${c.nome}</option>`).join('')}</select></label>
        <label>Fase<select id="ir-fase"></select></label>
        <label>Periodo<select id="ir-dias"><option value="3">ultimos 3 dias</option><option value="7" selected>ultimos 7 dias</option><option value="14">ultimos 14 dias</option><option value="30">ultimos 30 dias</option></select></label>
        <label>Eficiencia do sistema (%)<input type="number" id="ir-ef" value="85" min="30" max="100"></label>
        <label>Area irrigada (ha)<input type="number" id="ir-area" min="0" step="0.1" placeholder="da propriedade"></label>
      </div></div>
      <div class="grade g3 mt" id="ir-res"></div>
      <div class="card mt"><h3>${ic('gota')}Consumo x chuva · 30 dias</h3><div class="graf alto"><canvas id="ir-graf"></canvas></div></div>
      <p class="suave peq mt">Chuva efetiva estimada em 80% da chuva registrada. Kc medio por fase (FAO-56, tabela 12). Use como referencia: solo, sistema e manejo mudam a necessidade real.</p>`;
    $('#ir-est').addEventListener('change', () => { padraoCultura(); carregar(); });
    $('#ir-cult').addEventListener('change', () => { fases(); calcular(); });
    for (const s of ['#ir-fase', '#ir-dias', '#ir-ef', '#ir-area']) $(s).addEventListener('input', calcular);
    ao('estacoes', () => rota.atual === '/irrigacao' && opcoes());
    opcoes(); padraoCultura();
  }
  return carregar();
}

function opcoes() {
  const v = $('#ir-est').value;
  $('#ir-est').innerHTML = estacoes().map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  if (v && estacao(v)) $('#ir-est').value = v;
}
function padraoCultura() {
  const e = estacao($('#ir-est').value); const p = e && e.propertyId && propriedade(e.propertyId);
  if (p && p.crop) $('#ir-cult').value = culturaDe(p.crop);
  if (p && p.areaHa) $('#ir-area').value = p.areaHa;
  fases();
}
function fases() {
  const c = CULTURAS[$('#ir-cult').value];
  $('#ir-fase').innerHTML = c.fases.map(([f, kc], i) => `<option value="${kc}"${i === Math.min(2, c.fases.length - 1) ? ' selected' : ''}>${f} · Kc ${kc}</option>`).join('');
}

async function carregar() {
  const e = estacao($('#ir-est').value);
  if (!e) return;
  await acao(null, async () => { serie = await resumos(e.id, diasAtras(30)); calcular(); });
}

function calcular() {
  const e = estacao($('#ir-est').value);
  if (!e) return;
  const kc = +$('#ir-fase').value; const nd = +$('#ir-dias').value; const ef = Math.max(30, Math.min(100, +$('#ir-ef').value || 85)) / 100;
  const area = +$('#ir-area').value || 0;
  const periodo = serie.filter((d) => d.data >= diasAtras(nd));
  const r = necessidadeIrrigacao(periodo, kc);
  const bruta = r.lamina / ef;
  const prev = ((e.previsao && e.previsao.dias) || []).map((d) => ({ eto: d.eto, chuva: d.chuva }));
  const f = necessidadeIrrigacao(prev, kc);
  $('#ir-res').innerHTML = `
    <div class="card"><h3>Ultimos ${nd} dias</h3><div class="grande-num num">${n(r.lamina)}<small> mm a repor</small></div>
      <p class="suave">ETc ${n(r.etc)} mm · chuva efetiva ${n(r.chuvaEfetiva)} mm · ${periodo.length} dias com dados</p></div>
    <div class="card"><h3>Lamina bruta</h3><div class="grande-num num">${n(bruta)}<small> mm</small></div>
      <p class="suave">com eficiencia de ${Math.round(ef * 100)}%${area ? ` · <b>${n(bruta * area * 10, 0)} m³</b> em ${n(area)} ha` : ''}</p></div>
    <div class="card"><h3>Proximos 7 dias (previsao)</h3><div class="grande-num num">${n(f.lamina)}<small> mm</small></div>
      <p class="suave">ETc prevista ${n(f.etc)} mm · chuva efetiva ${n(f.chuvaEfetiva)} mm</p></div>`;
  let acc = 0;
  grafico($('#ir-graf'), { type: 'bar', data: { labels: serie.map((d) => dm(d.data)), datasets: [
    { label: 'Chuva (mm)', data: serie.map((d) => d.chuva), backgroundColor: COR.chuva },
    { label: `ETc (Kc ${kc})`, data: serie.map((d) => -(+(kc * (d.eto || 0)).toFixed(2))), backgroundColor: COR.eto },
    { type: 'line', label: 'Saldo acumulado (mm)', data: serie.map((d) => (acc = +(acc + 0.8 * (d.chuva || 0) - kc * (d.eto || 0)).toFixed(1))), borderColor: COR.saldo, backgroundColor: COR.saldo, pointRadius: 0, tension: 0.3 },
  ] }, options: { scales: { x: { stacked: false } } } });
}
