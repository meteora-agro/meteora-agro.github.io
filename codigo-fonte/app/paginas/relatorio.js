// Relatorio semanal: pronto para imprimir ou salvar em PDF pelo navegador (sem servidor)
import { ao, estacoes, estacao, propriedade, resumos, S } from '../dados.js';
import { $, esc, ic, n, dm, dma, semana, grafico, COR, acao } from '../ui.js';
import { diasAtras, CULTURAS, necessidadeIrrigacao } from '../ciencia.js';
import { rota } from '../nav.js';

let el;
export function abrir(secao) {
  if (!el) {
    el = secao;
    el.innerHTML = `
      <div class="cab nao-imprimir"><div><h1>Relatorio semanal</h1><p>Escolha a estacao e a semana; depois imprima ou salve em PDF.</p></div>
        <button class="btn prim" id="rl-pdf">${ic('doc')}Imprimir / salvar PDF</button></div>
      <div class="card nao-imprimir"><div class="form">
        <label>Estacao<select id="rl-est"></select></label>
        <label>Semana terminando em<input type="date" id="rl-fim"></label>
      </div></div>
      <div id="rl-doc" class="mt"></div>`;
    $('#rl-fim').value = diasAtras(1);
    $('#rl-pdf').addEventListener('click', () => window.print());
    $('#rl-est').addEventListener('change', gerar);
    $('#rl-fim').addEventListener('change', gerar);
    ao('estacoes', () => rota.atual === '/relatorio' && opcoes());
  }
  opcoes();
  return gerar();
}

function opcoes() {
  const v = $('#rl-est').value;
  const lista = estacoes();
  $('#rl-est').innerHTML = lista.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  if (v && estacao(v)) $('#rl-est').value = v;
  else { const m = lista.find((e) => S.user && e.owner === S.user.uid); if (m) $('#rl-est').value = m.id; }
}

async function gerar() {
  const e = estacao($('#rl-est').value);
  if (!e) { $('#rl-doc').innerHTML = '<div class="card vazio">Cadastre uma estacao em Fazenda.</div>'; return; }
  const fim = $('#rl-fim').value || diasAtras(1);
  const ini = new Date(Date.parse(fim + 'T12:00:00Z') - 6 * 86400e3).toISOString().slice(0, 10);
  await acao(null, async () => {
    const dias = await resumos(e.id, ini, fim);
    const prop = e.propertyId ? propriedade(e.propertyId) : null;
    const p = e.previsao || {};
    const s = (c) => dias.reduce((a, d) => a + (d[c] || 0), 0);
    const cult = prop && prop.crop ? Object.entries(CULTURAS).find(([k, c]) => prop.crop.toLowerCase().includes(c.nome.toLowerCase().slice(0, 4)) || prop.crop.toLowerCase().includes(k.slice(0, 4))) : null;
    const kc = cult ? cult[1].fases[Math.min(2, cult[1].fases.length - 1)][1] : 1;
    const irr = necessidadeIrrigacao(dias, kc);
    const tmax = dias.length ? Math.max(...dias.map((d) => d.tmax)) : null; const tmin = dias.length ? Math.min(...dias.map((d) => d.tmin)) : null;
    $('#rl-doc').innerHTML = `
      <div class="card">
        <div class="cab" style="margin-bottom:8px"><div><div class="marca"><svg><use href="#i-logo"/></svg>Meteora <b>Agro</b></div>
          <h2 class="mt">Relatorio semanal · ${dma(ini)} a ${dma(fim)}</h2>
          <p class="suave">${esc(e.name)}${prop ? ` · ${esc(prop.name)}` : ''}${prop && prop.crop ? ` · ${esc(prop.crop)}` : ''}${prop && prop.areaHa ? ` · ${n(prop.areaHa)} ha` : ''} · ${e.lat.toFixed(4)}, ${e.lon.toFixed(4)}</p></div>
          <p class="suave peq">Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' })}</p></div>
        <div class="metricas">
          ${[['Chuva na semana', `${n(s('chuva'))}<small> mm</small>`], ['ETo na semana', `${n(s('eto'))}<small> mm</small>`], ['Balanco', `${n(s('chuva') - s('eto'))}<small> mm</small>`],
    ['Min / max', `${n(tmin, 0)} / ${n(tmax, 0)}<small> °C</small>`], ['Graus-dia', `${n(s('gd'), 0)}<small> °C·d</small>`],
    ['Irrigacao estimada', `${n(irr.lamina)}<small> mm</small>`], ['Dias com dados', `${dias.length}<small> de 7</small>`], ['Kc usado', `${n(kc, 2)}<small> ${cult ? cult[1].nome : '(sem cultura)'}</small>`]]
    .map(([r, v]) => `<div class="metrica"><div class="r">${r}</div><div class="v num">${v}</div></div>`).join('')}
        </div>
        <div class="graf mt"><canvas id="rl-graf"></canvas></div>
        <div class="rolagem mt"><table><tr><th>Dia</th><th class="n">Min °C</th><th class="n">Max °C</th><th class="n">UR %</th><th class="n">Chuva mm</th><th class="n">ETo mm</th><th class="n">Balanco mm</th><th class="n">GD</th></tr>
          ${dias.map((d) => `<tr><td>${semana(d.data)} ${dm(d.data)}</td><td class="n">${n(d.tmin)}</td><td class="n">${n(d.tmax)}</td><td class="n">${n(d.ur, 0)}</td><td class="n">${n(d.chuva)}</td><td class="n">${n(d.eto)}</td><td class="n">${n(d.balanco)}</td><td class="n">${n(d.gd)}</td></tr>`).join('')}
          <tr><th>Total</th><th></th><th></th><th></th><th class="n">${n(s('chuva'))}</th><th class="n">${n(s('eto'))}</th><th class="n">${n(s('chuva') - s('eto'))}</th><th class="n">${n(s('gd'), 0)}</th></tr></table></div>
      </div>
      <div class="grade g2 mt">
        <div class="card"><h3>Proximos 7 dias</h3>${(p.dias || []).length ? `<table><tr><th>Dia</th><th class="n">Min</th><th class="n">Max</th><th class="n">Chuva</th><th class="n">Prob.</th><th class="n">ETo</th></tr>${p.dias.map((d) => `<tr><td>${semana(d.data)} ${dm(d.data)}</td><td class="n">${n(d.tmin, 0)}</td><td class="n">${n(d.tmax, 0)}</td><td class="n">${n(d.chuva)}</td><td class="n">${d.prob ?? '–'}%</td><td class="n">${n(d.eto)}</td></tr>`).join('')}</table>` : '<p class="suave">Sem previsao.</p>'}</div>
        <div class="card"><h3>Avisos e pulverizacao</h3>
          ${(p.itens || []).map((x) => `<div class="aviso ${x.nivel === 'alto' ? 'alto' : ''}"><div><b>${esc(x.titulo)}</b>${esc(x.texto)}</div></div>`).join('') || '<p class="suave">Nenhum aviso para os proximos dias.</p>'}
          ${(p.janelas || []).map((j) => `<div class="aviso ok"><div><b>Janela: ${semana(j.de.slice(0, 10))} ${j.de.slice(11, 13)}h–${String(+j.ate.slice(11, 13) + 1).padStart(2, '0')}h</b>${j.horas} h favoraveis para aplicacao</div></div>`).join('')}
        </div>
      </div>
      <p class="suave peq mt">Dados: ${e.type === 'sensor' ? 'estacao de campo' : e.inmetCode ? 'INMET/Open-Meteo' : 'modelo Open-Meteo no ponto'}. ETo FAO-56 Penman-Monteith. Avisos sao indicativos e nao substituem a avaliacao agronomica.</p>`;
    grafico($('#rl-graf'), { type: 'bar', data: { labels: dias.map((d) => `${semana(d.data)} ${dm(d.data)}`), datasets: [
      { label: 'Chuva (mm)', data: dias.map((d) => d.chuva), backgroundColor: COR.chuva },
      { label: 'ETo (mm)', data: dias.map((d) => d.eto), backgroundColor: COR.eto },
      { type: 'line', label: 'Maxima (°C)', data: dias.map((d) => d.tmax), borderColor: COR.max, backgroundColor: COR.max, yAxisID: 'y1' },
      { type: 'line', label: 'Minima (°C)', data: dias.map((d) => d.tmin), borderColor: COR.min, backgroundColor: COR.min, yAxisID: 'y1' },
    ] }, options: { animation: false, scales: { y: { min: 0 }, y1: { position: 'right', grid: { display: false } } } } });
  });
}
