# Meteora Agro

Plataforma agrometeorologica gratuita para o produtor rural de Mato Grosso: rede publica de estacoes (INMET),
previsao de 7 dias, ETo FAO-56, balanco hidrico, irrigacao pela cultura (Kc), graus-dia, avisos de geada,
calor, chuva forte e deficit, janelas de pulverizacao, relatorio semanal (PDF pelo navegador) e contorno da
propriedade desenhado no satelite. Estacoes de campo (Raspberry Pi) enviam as medicoes direto para o banco.

**Usar:** https://meteora-agro.github.io (funciona no celular e pode ser instalado como aplicativo).

**Contas e dados:** Firebase, plano gratuito Spark, projeto `meteora-agro` (Auth + Firestore, regiao Sao Paulo).
Cadastro aprovado por um administrador. Plano gratis: 1 propriedade e 2 estacoes.

**Rotina horaria:** GitHub Actions (`.github/workflows/dados.yml`) importa os dados, calcula os resumos diarios
e a previsao. Precisa dos segredos `FIREBASE_SERVICE_ACCOUNT` e `ADMIN_EMAILS` no repositorio.

## Como gerar o site

O site publicado e um unico arquivo, `index.html`, montado a partir de `codigo-fonte/`:

```
cd codigo-fonte
npm install          # so na primeira vez (Firebase + esbuild)
python build.py      # gera ../index.html
```

- Telas: `codigo-fonte/app/paginas/*.js` · calculos (ETo, avisos, Kc, area): `codigo-fonte/app/ciencia.js` · visual: `codigo-fonte/estilo.css`
- Rotina horaria: `codigo-fonte/job/` (`npm test --prefix job` roda os testes)
- Agente do Raspberry: `codigo-fonte/edge/` · migracao da versao antiga: `codigo-fonte/scripts/migrar-v1.mjs`
- Documentacao: `codigo-fonte/docs/`

As regras de seguranca do banco ficam em `firestore.rules` e sao publicadas no console do Firebase
(Firestore → Regras). Elas sao o "servidor" do app: exigem cadastro aprovado, aplicam os limites do plano e
so deixam cada estacao de campo gravar os proprios dados.

Mapa: © colaboradores do OpenStreetMap, imagens Esri. Dados: INMET e Open-Meteo.

Projeto da UFMT — Fisica.
