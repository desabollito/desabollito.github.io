#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  Desabollito · servidor para vincular tu número de WhatsApp
#  (Evolution API + HTTPS automático). Probado en Ubuntu 22.04/24.04.
#
#  Uso (en el servidor):
#    curl -fsSL https://desabollito.github.io/bot/evolution/setup.sh | sudo bash -s -- SUBDOMINIO TOKEN_DUCKDNS
#  Ej: ... | sudo bash -s -- desabollito 1234abcd-....
# ════════════════════════════════════════════════════════════════
set -euo pipefail
SUB="${1:?Falta el subdominio de DuckDNS (ej: desabollito)}"
DUCK="${2:?Falta el token de DuckDNS}"
WORKER="${3:-https://desabollito-bot.desabollito.workers.dev}"
DOMINIO="${SUB}.duckdns.org"
DIR=/opt/desabollito

echo "▶ 1/6 Actualizando DuckDNS (${DOMINIO} → IP de este servidor)"
curl -fsS "https://www.duckdns.org/update?domains=${SUB}&token=${DUCK}&ip=" ; echo
( crontab -l 2>/dev/null | grep -v duckdns ; echo "*/5 * * * * curl -fsS 'https://www.duckdns.org/update?domains=${SUB}&token=${DUCK}&ip=' >/dev/null" ) | crontab -

echo "▶ 2/6 Abriendo puertos 80 y 443"
iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
( apt-get install -y -qq iptables-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null 2>&1 ) || true

echo "▶ 3/6 Instalando Docker"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

echo "▶ 4/6 Preparando archivos en ${DIR}"
mkdir -p "$DIR" && cd "$DIR"
if [ -f .claves ]; then . ./.claves; fi
APIKEY="${APIKEY:-$(openssl rand -hex 24)}"
PGPASS="${PGPASS:-$(openssl rand -hex 16)}"
printf 'APIKEY=%s\nPGPASS=%s\n' "$APIKEY" "$PGPASS" > .claves && chmod 600 .claves

cat > Caddyfile <<CADDY
${DOMINIO} {
  reverse_proxy evolution:8080
}
CADDY

cat > docker-compose.yml <<YML
services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: ${PGPASS}
      POSTGRES_DB: evolution
    volumes: [ "pgdata:/var/lib/postgresql/data" ]
  evolution:
    image: atendai/evolution-api:v2.2.3
    restart: always
    depends_on: [ postgres ]
    environment:
      SERVER_URL: https://${DOMINIO}
      AUTHENTICATION_API_KEY: ${APIKEY}
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://evolution:${PGPASS}@postgres:5432/evolution?schema=public
      DATABASE_CONNECTION_CLIENT_NAME: evolution
      CACHE_REDIS_ENABLED: "false"
      CACHE_LOCAL_ENABLED: "true"
      DEL_INSTANCE: "false"
      CONFIG_SESSION_PHONE_CLIENT: Desabollito
      CONFIG_SESSION_PHONE_NAME: Chrome
    volumes: [ "instancias:/evolution/instances" ]
  caddy:
    image: caddy:2-alpine
    restart: always
    ports: [ "80:80", "443:443" ]
    volumes: [ "./Caddyfile:/etc/caddy/Caddyfile", "caddy_data:/data" ]
volumes: { pgdata: {}, instancias: {}, caddy_data: {} }
YML

echo "▶ 5/6 Levantando el servidor (la primera vez tarda unos minutos)"
docker compose pull -q
docker compose up -d
for i in $(seq 1 60); do
  curl -fsS "https://${DOMINIO}" >/dev/null 2>&1 && break
  sleep 5
done

echo "▶ 6/6 Creando la conexión 'desabollito' y el aviso al bot"
H=(-H "apikey: ${APIKEY}" -H "Content-Type: application/json")
curl -fsS -X POST "https://${DOMINIO}/instance/create" "${H[@]}" \
  -d '{"instanceName":"desabollito","integration":"WHATSAPP-BAILEYS","qrcode":true,"groupsIgnore":false,"alwaysOnline":false,"readMessages":false}' >/dev/null 2>&1 || true
curl -fsS -X POST "https://${DOMINIO}/webhook/set/desabollito" "${H[@]}" \
  -d "{\"webhook\":{\"enabled\":true,\"url\":\"${WORKER}/evolution?token=${APIKEY}\",\"byEvents\":false,\"base64\":true,\"events\":[\"MESSAGES_UPSERT\"]}}" >/dev/null

cat <<FIN

════════════════════════════════════════════════════════════
 ✅ Listo. Cargá estos 3 datos en Cloudflare (Worker → Settings →
    Variables and Secrets, tipo Secret) y tocá Deploy:

   EVOLUTION_URL       https://${DOMINIO}
   EVOLUTION_APIKEY    ${APIKEY}
   EVOLUTION_INSTANCE  desabollito

 📱 Después vinculá el número:
   1. Abrí  https://${DOMINIO}/manager
   2. Ingresá con la API key de arriba
   3. Instancia "desabollito" → Conectar → escaneá el QR desde
      WhatsApp (Dispositivos vinculados → Vincular un dispositivo)
════════════════════════════════════════════════════════════
FIN
