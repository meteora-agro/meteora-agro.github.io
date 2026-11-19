# Implantacao (tudo gratuito)

Ja configurado: organizacao **meteora-agro** no GitHub, repositorio publico **meteora-agro.github.io**
(GitHub Pages) e projeto Firebase **Meteora** (`meteora-agro`, plano Spark): login por e-mail/senha,
Firestore em southamerica-east1 e regras publicadas.

## Publicar uma versao nova do site
1. Edite os fontes em `codigo-fonte/` (telas em `app/paginas`, calculos em `app/ciencia.js`, visual em `estilo.css`).
2. `cd codigo-fonte` → `npm install` (so na primeira vez) → `python build.py` (gera `../index.html`).
3. GitHub Desktop: commit e push. O GitHub Pages publica em https://meteora-agro.github.io em 1-2 minutos.
4. Se mudar `firestore.rules`: Firebase → Firestore → Regras → cole o arquivo e clique em Publicar.

## Ligar a rotina horaria (uma vez)
1. Firebase → Configuracoes do projeto → **Contas de servico** → *Gerar nova chave privada* (baixa um JSON).
2. GitHub → meteora-agro.github.io → Settings → Secrets and variables → **Actions** → New repository secret:
   - `FIREBASE_SERVICE_ACCOUNT` = conteudo inteiro do JSON (depois apague o arquivo do computador)
   - `ADMIN_EMAILS` = e-mail do administrador do app
   - `INMET_TOKEN` = opcional (token da API do INMET)
3. Abra o site e **crie sua conta** com o e-mail de `ADMIN_EMAILS`.
4. GitHub → Actions → *Dados* → Run workflow. Voce vira administrador e a rotina passa a rodar toda hora.
5. No app: **Admin** → *Adicionar 10 estacoes INMET de MT* → rode *Dados* de novo (ou espere a proxima hora).

Limites gratuitos: Firestore 50 mil leituras e 20 mil gravacoes por dia; GitHub Actions ilimitado em
repositorio publico. No plano Spark o Firebase nunca cobra: se a cota acabar, pausa ate o dia seguinte.

## Estacao de campo (Raspberry Pi)
1. No app: **Fazenda** → *+ Estacao* → tipo **Sensor** → Salvar → baixe o `edge.conf` (aparece uma unica vez).
2. No Pi (o coletor continua igual, gravando os CSVs em `/home/pi/dados`):
   ```
   scp -r codigo-fonte/edge edge.conf pi@IP-DO-PI:~/ && ssh pi@IP-DO-PI
   cd ~/edge && sudo ./instalar.sh ~/edge.conf
   sudo -u pi python3 /opt/meteora-edge/meteora_edge.py     # deve mostrar "enviadas N horas"
   ```

## Trazer os dados da versao antiga (opcional)
```
cd codigo-fonte && npm ci --prefix job
set FIREBASE_SERVICE_ACCOUNT=<conteudo do JSON>   (Windows)  |  export FIREBASE_SERVICE_ACCOUNT="$(cat chave.json)"  (Linux)
set FIREBASE_PROJECT_ID=meteora-agro
node scripts/migrar-v1.mjs --db meteora.db --seco     # confere
node scripts/migrar-v1.mjs --db meteora.db --dias 60
```
Os usuarios entram com a mesma senha. Estacoes com sensor precisam de *Novo login* em Fazenda.

## Testes
```
cd codigo-fonte
npm test --prefix job                                   # ciencia + rotina horaria
python -m unittest discover -s edge -p "test_*.py"      # agente do Raspberry
npx firebase-tools emulators:exec --project demo-meteora --only firestore "node --test job/test/regras.emu.mjs"   # regras (precisa de Java)
```
Os mesmos testes rodam no GitHub a cada push (workflow *Testes*).
