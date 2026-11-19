// Cadastro aguardando aprovacao (a tela muda sozinha quando o admin aprova)
import { S } from '../dados.js';
import { esc, ic } from '../ui.js';
import { sair } from '../nav.js';

export function abrir(el) {
  const susp = S.perfil && S.perfil.status === 'suspended';
  el.innerHTML = `<div class="card vazio" style="max-width:560px;margin:40px auto">
    <div class="recurso" style="border:0;cursor:default;padding:0"><div class="ic" style="margin:0 auto 12px">${ic(susp ? 'cadeado' : 'relogio')}</div></div>
    <h2>${susp ? 'Conta suspensa' : 'Cadastro recebido!'}</h2>
    <p class="mt">${susp ? 'Fale com o administrador do Meteora para reativar o acesso.' : `Ola, ${esc((S.perfil && S.perfil.name) || '')}. Um administrador vai aprovar sua conta. Esta tela atualiza sozinha quando isso acontecer.`}</p>
    <p class="suave peq mt">Enquanto isso, a rede publica, o mapa e a previsao continuam liberados.</p>
    <div class="linha-acoes mt" style="justify-content:center"><a class="btn prim" href="#/">Ver a rede publica</a><button class="btn" id="ag-sair">Sair</button></div></div>`;
  el.querySelector('#ag-sair').addEventListener('click', sair);
}
