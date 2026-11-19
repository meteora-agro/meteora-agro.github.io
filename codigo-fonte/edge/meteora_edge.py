#!/usr/bin/python3
"""Meteora Edge: envia as medicoes da estacao de campo direto para o Firestore (plano gratuito).

- Le os CSVs diarios que o coletor local ja grava (/home/pi/dados/<prefixo>_AAAA-MM-DD.csv,
  colunas: "AAAA-MM-DD HH:MM:SS", temperatura, umidade, pressao, lux[, lux]).
- Agrega por hora (media, maxima e minima) e grava em stations/{id}/dias/{data}.h.HH
  e a leitura mais recente em stations/{id}.atual, usando o login proprio da estacao.
- As regras do Firestore so deixam esse login gravar as horas da SUA estacao.
- Sem internet, nada se perde: na proxima execucao reenvia desde a ultima hora confirmada (ate 7 dias).
- So usa a biblioteca padrao do Python 3.7+. Roda a cada 5 minutos (meteora-edge.timer).

O relogio do Raspberry deve estar no fuso de Mato Grosso (timedatectl set-timezone America/Cuiaba).
"""
import glob, json, os, socket, sys, time, urllib.error, urllib.request
from datetime import datetime, timedelta

CONF = os.environ.get("METEORA_EDGE_CONF", "/etc/meteora/edge.conf")
ESTADO = os.environ.get("METEORA_EDGE_ESTADO", "/var/lib/meteora-edge/estado.json")
LUX_POR_WM2 = 120.0  # conversao aproximada luz solar -> irradiancia
DIAS_FILA = 7


# ---------------------------------------------------------------- configuracao e estado
def ler_conf(caminho=None):
    caminho = caminho or CONF
    c = {"METEORA_DADOS": "/home/pi/dados", "METEORA_PREFIXO": socket.gethostname(),
         "METEORA_AUTH_URL": "https://identitytoolkit.googleapis.com",
         "METEORA_TOKEN_URL": "https://securetoken.googleapis.com",
         "METEORA_FIRESTORE_URL": "https://firestore.googleapis.com"}
    with open(caminho) as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                c[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("METEORA_PROJETO", "METEORA_API_KEY", "METEORA_ESTACAO", "METEORA_EMAIL", "METEORA_SENHA"):
        if not c.get(k):
            sys.exit(f"faltando {k} em {caminho}")
    return c


def carregar_estado():
    try:
        with open(ESTADO) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def salvar_estado(e):
    os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
    with open(ESTADO + ".tmp", "w") as f:
        json.dump(e, f)
    os.chmod(ESTADO + ".tmp", 0o600)
    os.replace(ESTADO + ".tmp", ESTADO)


# ---------------------------------------------------------------- HTTP
class ErroHttp(Exception):
    def __init__(self, codigo, corpo):
        super().__init__(f"HTTP {codigo}: {corpo[:300]}")
        self.codigo = codigo


def post(url, dados, token=None, form=False):
    if form:
        corpo = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in dados.items()).encode()
        tipo = "application/x-www-form-urlencoded"
    else:
        corpo = json.dumps(dados).encode()
        tipo = "application/json"
    cab = {"Content-Type": tipo, "User-Agent": "MeteoraEdge/3"}
    if token:
        cab["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=corpo, method="POST", headers=cab)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raise ErroHttp(e.code, e.read().decode(errors="replace")) from None


def token(conf, est):
    """idToken valido do login da estacao (renova pelo refresh token; se falhar, entra de novo)."""
    if est.get("id_token") and est.get("expira", 0) > time.time() + 120:
        return est["id_token"]
    chave = conf["METEORA_API_KEY"]
    r = None
    if est.get("refresh"):
        try:
            r = post(f"{conf['METEORA_TOKEN_URL']}/v1/token?key={chave}", {"grant_type": "refresh_token", "refresh_token": est["refresh"]}, form=True)
            r = {"idToken": r["id_token"], "refreshToken": r["refresh_token"], "expiresIn": r["expires_in"]}
        except Exception:
            r = None
    if r is None:
        r = post(f"{conf['METEORA_AUTH_URL']}/v1/accounts:signInWithPassword?key={chave}",
                 {"email": conf["METEORA_EMAIL"], "password": conf["METEORA_SENHA"], "returnSecureToken": True})
    est.update(id_token=r["idToken"], refresh=r["refreshToken"], expira=time.time() + int(r.get("expiresIn", 3600)))
    return est["id_token"]


# ---------------------------------------------------------------- leitura dos CSVs
def num(v):
    try:
        x = float(v)
        return None if x != x else x
    except (TypeError, ValueError):
        return None


def ler_linha(linha):
    p = linha.strip().split(",")
    if len(p) < 4:
        return None
    try:
        quando = datetime.strptime(p[0].strip(), "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None
    t, ur, pr = num(p[1]), num(p[2]), num(p[3])
    lux = num(p[4]) if len(p) > 4 else None
    # defeito ja visto no BME280: tudo exatamente zero
    if t == 0 and ur in (0, None) and pr in (0, None):
        return None
    # faixas plausiveis
    if t is not None and not -10 <= t <= 55: t = None
    if ur is not None and not 0 < ur <= 100: ur = None
    if pr is not None and not 800 <= pr <= 1100: pr = None
    if lux is not None and not 0 <= lux <= 200000: lux = None
    if t is None and ur is None and pr is None:
        return None
    return quando, {"temp": t, "rh": ur, "p": pr, "rad": round(lux / LUX_POR_WM2, 1) if lux is not None else None}


def horas_desde(conf, desde_hora):
    """{'AAAA-MM-DD': {'HH': {temp, tmax, tmin, rh, p, rad, n}}} das horas >= desde_hora, e a ultima leitura."""
    limite = (datetime.now() - timedelta(days=DIAS_FILA)).strftime("%Y-%m-%dT%H")
    desde = max(desde_hora or limite, limite)
    acum = {}
    ultima = None
    for arq in sorted(glob.glob(os.path.join(conf["METEORA_DADOS"], f"{conf['METEORA_PREFIXO']}_????-??-??.csv"))):
        if arq[-14:-4] < desde[:10]:
            continue
        with open(arq, errors="replace") as f:
            for linha in f:
                r = ler_linha(linha)
                if not r:
                    continue
                quando, v = r
                hora = quando.strftime("%Y-%m-%dT%H")
                if hora < desde:
                    continue
                a = acum.setdefault(hora, {"soma": {}, "cont": {}, "tmax": None, "tmin": None, "n": 0})
                for k, x in v.items():
                    if x is not None:
                        a["soma"][k] = a["soma"].get(k, 0) + x
                        a["cont"][k] = a["cont"].get(k, 0) + 1
                if v["temp"] is not None:
                    a["tmax"] = v["temp"] if a["tmax"] is None else max(a["tmax"], v["temp"])
                    a["tmin"] = v["temp"] if a["tmin"] is None else min(a["tmin"], v["temp"])
                a["n"] += 1
                if ultima is None or quando >= ultima[0]:
                    ultima = (quando, v)
    dias = {}
    for hora, a in acum.items():
        h = {k: round(a["soma"][k] / a["cont"][k], 2) for k in a["soma"]}
        if a["tmax"] is not None:
            h["tmax"], h["tmin"] = round(a["tmax"], 2), round(a["tmin"], 2)
        h["n"] = a["n"]
        dias.setdefault(hora[:10], {})[hora[11:13]] = h
    return dias, ultima


# ---------------------------------------------------------------- Firestore REST
def valor(v):
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: valor(x) for k, x in v.items()}}}
    return {"stringValue": str(v)}


def montar_escritas(conf, dias, ultima):
    base = f"projects/{conf['METEORA_PROJETO']}/databases/(default)/documents/stations/{conf['METEORA_ESTACAO']}"
    escritas = []
    for dia, horas in sorted(dias.items()):
        escritas.append({
            "update": {"name": f"{base}/dias/{dia}", "fields": {"h": valor(horas)}},
            "updateMask": {"fieldPaths": [f"h.`{hh}`" for hh in sorted(horas)]},
        })
    if ultima:
        quando, v = ultima
        atual = {k: (round(x, 2) if isinstance(x, float) else x) for k, x in v.items() if x is not None}
        atual.update(hora=quando.strftime("%Y-%m-%dT%H"), lido=quando.strftime("%Y-%m-%d %H:%M"), fonte="sensor")
        escritas.append({
            "update": {"name": base, "fields": {"atual": valor(atual)}},
            "updateMask": {"fieldPaths": ["atual"]},
            "updateTransforms": [{"fieldPath": "ultimoDado", "setToServerValue": "REQUEST_TIME"}],
            "currentDocument": {"exists": True},
        })
    return escritas


def main():
    conf = ler_conf()
    est = carregar_estado()
    dias, ultima = horas_desde(conf, est.get("ultima_hora"))
    if not dias:
        print("nada novo para enviar", flush=True)
        return 0
    escritas = montar_escritas(conf, dias, ultima)
    url = f"{conf['METEORA_FIRESTORE_URL']}/v1/projects/{conf['METEORA_PROJETO']}/databases/(default)/documents:commit"
    try:
        post(url, {"writes": escritas}, token=token(conf, est))
    except ErroHttp as e:
        print("recusado pelo Firebase:", e, flush=True)
        if e.codigo in (400, 401, 403, 404):
            est.pop("id_token", None)
            salvar_estado(est)
            return 2  # login ou configuracao errados: confira o edge.conf
        return 1
    except Exception as e:
        print("sem conexao, tento de novo depois:", e, flush=True)
        salvar_estado(est)
        return 1
    horas = sorted(f"{d}T{h}" for d, hs in dias.items() for h in hs)
    # a hora corrente ainda esta enchendo: a proxima execucao recomeca nela
    est.update(ultima_hora=horas[-1], ultimo_envio=time.time())
    salvar_estado(est)
    print(f"enviadas {len(horas)} horas ({horas[0]} a {horas[-1]})", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
