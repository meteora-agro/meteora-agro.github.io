"""Testes do Meteora Edge com Auth e Firestore falsos (python3 -m unittest discover -s edge)"""
import json, os, sys, tempfile, threading, unittest
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(__file__))
import meteora_edge as me  # noqa: E402

REC = {"login": 0, "commits": []}


class Falso(BaseHTTPRequestHandler):
    def do_POST(self):
        corpo = self.rfile.read(int(self.headers["Content-Length"]))
        if "signInWithPassword" in self.path:
            d = json.loads(corpo)
            if d["password"] != "certa":
                return self.responder(400, {"error": {"message": "INVALID_PASSWORD"}})
            REC["login"] += 1
            return self.responder(200, {"idToken": "tok", "refreshToken": "ref", "expiresIn": "3600"})
        if self.path.endswith(":commit"):
            if self.headers.get("Authorization") != "Bearer tok":
                return self.responder(403, {"error": "negado"})
            REC["commits"].append(json.loads(corpo))
            return self.responder(200, {"writeResults": []})
        self.responder(404, {})

    def responder(self, cod, d):
        self.send_response(cod); self.end_headers(); self.wfile.write(json.dumps(d).encode())

    def log_message(self, *a):
        pass


class TestEdge(unittest.TestCase):
    def setUp(self):
        REC.update(login=0, commits=[])
        self.tmp = tempfile.mkdtemp()
        self.srv = HTTPServer(("127.0.0.1", 0), Falso)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{self.srv.server_port}"
        agora = datetime.now().replace(second=0, microsecond=0)
        self.agora = agora
        dia = agora.strftime("%Y-%m-%d")
        with open(os.path.join(self.tmp, f"Meteora_{dia}.csv"), "w") as f:
            for i in range(5, -1, -1):
                t = agora - timedelta(minutes=i)
                f.write(f"{t:%Y-%m-%d %H:%M:00},{25 + i},60.0,990.5,12000.00,12000.00\n")
            f.write("lixo\n")
            f.write(f"{agora:%Y-%m-%d %H:%M:00},0,0,0,0,0\n")  # defeito do sensor: ignorado
        self.conf = os.path.join(self.tmp, "edge.conf")
        with open(self.conf, "w") as f:
            f.write(f"METEORA_PROJETO=p\nMETEORA_API_KEY=k\nMETEORA_ESTACAO=uid_e_0\nMETEORA_EMAIL=e@x\nMETEORA_SENHA=certa\n"
                    f"METEORA_DADOS={self.tmp}\nMETEORA_PREFIXO=Meteora\nMETEORA_AUTH_URL={url}\nMETEORA_TOKEN_URL={url}\nMETEORA_FIRESTORE_URL={url}\n")
        me.CONF = self.conf
        me.ESTADO = os.path.join(self.tmp, "estado", "estado.json")

    def tearDown(self):
        self.srv.shutdown()

    def test_envia_hora_agregada_e_atual(self):
        self.assertEqual(me.main(), 0)
        self.assertEqual(REC["login"], 1)
        w = REC["commits"][0]["writes"]
        hh = self.agora.strftime("%H")
        dia = w[0]
        self.assertTrue(dia["update"]["name"].endswith(f"/stations/uid_e_0/dias/{self.agora:%Y-%m-%d}"))
        self.assertEqual(dia["updateMask"]["fieldPaths"], [f"h.`{hh}`"])
        hora = dia["update"]["fields"]["h"]["mapValue"]["fields"][hh]["mapValue"]["fields"]
        self.assertEqual(hora["tmax"]["doubleValue"], 30.0)
        self.assertEqual(hora["tmin"]["doubleValue"], 25.0)
        self.assertEqual(hora["temp"]["doubleValue"], 27.5)
        self.assertEqual(hora["rad"]["doubleValue"], 100.0)
        self.assertEqual(hora["n"]["integerValue"], "6")
        est = w[1]
        self.assertEqual(est["updateMask"]["fieldPaths"], ["atual"])
        self.assertEqual(est["updateTransforms"][0]["fieldPath"], "ultimoDado")
        self.assertEqual(est["update"]["fields"]["atual"]["mapValue"]["fields"]["temp"]["doubleValue"], 25.0)

    def test_reaproveita_token_e_reenvia_hora_corrente(self):
        me.main(); me.main()
        self.assertEqual(REC["login"], 1)
        self.assertEqual(len(REC["commits"]), 2)  # a hora atual ainda esta enchendo

    def test_senha_errada(self):
        with open(self.conf, "a") as f:
            f.write("METEORA_SENHA=errada\n")
        self.assertEqual(me.main(), 2)
        self.assertEqual(REC["commits"], [])


if __name__ == "__main__":
    unittest.main()
