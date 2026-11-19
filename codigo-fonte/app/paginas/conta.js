// Conta / "Mais": perfil, plano, atalhos, tema e saida
import { doc, updateDoc } from '../firebase.js';
import { db } from '../fb.js';
import { S, ao, logado, ativo, admin, plano } from '../dados.js';
import { $, esc, ic, toast, acao } from '../ui.js';
import { pedirLogin, sair, rota } from '../nav.js';

let el;
export function abrir(secao) {
  if (!el) { el = secao; ao('perfil', () => rota.atual === '/conta' && desenhar()); }
  desenhar();
}

const atalho = (r, i, t, d) => `<a class="recurso" href="#${r}" style="display:block;color:inherit;text-decoration:none"><div class="ic">${ic(i)}</div><h3>${t}</h3><p class="suave peq">${d}</p></a>`;

function desenhar() {
  const tema = document.documentElement.dataset.tema || 'auto';
  el.innerHTML = `
    <div class="cab"><div><h1>${logado() ? 'Minha conta' : 'Mais'}</h1></div></div>
    ${logado() ? `<div class="card"><div class="form">
        <label>Nome<input id="ct-nome" maxlength="80" value="${esc((S.perfil && S.perfil.name) || '')}"></label>
        <label>E-mail<input value="${esc(S.user.email)}" disabled></label>
      </div>
      <p class="mt">${ativo() ? `Plano <b>${plano().nome}</b>: ${plano().propriedades} propriedade(s), ${plano().estacoes} estacao(oes), ${plano().historicoDias} dias de historico.${admin() ? ' <span class="selo vermelho">administrador</span>' : ''}` : '<span class="selo ambar">aguardando aprovacao</span>'}</p>
      <div class="linha-acoes mt"><button class="btn prim" id="ct-salvar">Salvar nome</button><button class="btn perigo" id="ct-sair">Sair da conta</button></div></div>`
    : `<div class="card"><p>Entre para acompanhar a sua fazenda.</p><div class="linha-acoes mt"><button class="btn prim" id="ct-entrar">Entrar</button><button class="btn" id="ct-criar">Criar conta gratis</button></div></div>`}
    <div class="recursos mt">
      ${atalho('/painel', 'painel', 'Painel', 'Condicoes e previsao da sua estacao')}
      ${atalho('/historico', 'relogio', 'Historico', 'Dias anteriores, graficos e CSV')}
      ${atalho('/irrigacao', 'gota', 'Irrigacao', 'Lamina a repor pela cultura')}
      ${atalho('/relatorio', 'doc', 'Relatorio', 'Semana pronta para imprimir')}
      ${atalho('/fazenda', 'folha', 'Fazenda', 'Propriedades e estacoes')}
      ${admin() ? atalho('/admin', 'escudo', 'Administracao', 'Aprovar usuarios e rede publica') : ''}
    </div>
    <div class="card mt"><h3>Aparencia</h3><div class="grupo" id="ct-tema">
      <button data-t="auto"${tema === 'auto' ? ' class="on"' : ''}>Automatico</button><button data-t="claro"${tema === 'claro' ? ' class="on"' : ''}>Claro</button><button data-t="escuro"${tema === 'escuro' ? ' class="on"' : ''}>Escuro</button></div>
      <p class="suave peq mt">Dica: no celular, use "Adicionar a tela inicial" para instalar o Meteora como aplicativo.</p></div>`;
  el.querySelectorAll('#ct-tema button').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.t;
    if (t === 'auto') delete document.documentElement.dataset.tema; else document.documentElement.dataset.tema = t;
    try { if (t === 'auto') localStorage.removeItem('tema'); else localStorage.setItem('tema', t); } catch { /* */ }
    desenhar();
  }));
  $('#ct-entrar')?.addEventListener('click', () => pedirLogin());
  $('#ct-criar')?.addEventListener('click', () => pedirLogin('', 'criar'));
  $('#ct-sair')?.addEventListener('click', sair);
  $('#ct-salvar')?.addEventListener('click', () => acao($('#ct-salvar'), async () => {
    await updateDoc(doc(db, 'users', S.user.uid), { name: $('#ct-nome').value.trim().slice(0, 80) });
    toast('Nome atualizado.');
  }));
}
