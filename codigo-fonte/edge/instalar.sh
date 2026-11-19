#!/bin/sh
# Instala o Meteora Edge num Raspberry Pi cujo coletor ja grava os CSVs em /home/pi/dados.
# Uso: sudo ./instalar.sh [caminho/do/edge.conf baixado do app]
set -e
[ "$(id -u)" = 0 ] || { echo "rode com sudo"; exit 1; }
DIR=$(cd "$(dirname "$0")" && pwd)
timedatectl set-timezone America/Cuiaba 2>/dev/null || true
install -d /opt/meteora-edge /etc/meteora
install -m 755 "$DIR/meteora_edge.py" /opt/meteora-edge/
if [ -n "$1" ]; then install -m 600 -o pi "$1" /etc/meteora/edge.conf
elif [ ! -f /etc/meteora/edge.conf ]; then install -m 600 -o pi "$DIR/edge.conf.exemplo" /etc/meteora/edge.conf; echo ">> edite /etc/meteora/edge.conf (o app gera o arquivo pronto)"; fi
install -m 644 "$DIR/units/meteora-edge.service" "$DIR/units/meteora-edge.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now meteora-edge.timer
echo "ok. Teste agora: sudo -u pi python3 /opt/meteora-edge/meteora_edge.py"
