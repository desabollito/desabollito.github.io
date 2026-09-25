# Evolution API 2.3.7 + arreglo de vinculación (WhatsApp cambió el registro de dispositivos en jul-2026).
# Reemplaza Baileys por el fork con el fix de companion_reg_refresh (PR WhiskeySockets/Baileys#2765, aún sin publicar).
FROM evoapicloud/evolution-api:v2.3.7
WORKDIR /evolution
RUN apk add --no-cache git \
 && npm install --no-audit --no-fund baileys@github:doryani-ai/Baileys#4f263f0e365c2e74dd1b824031d1c5910f518c26 \
 && apk del git \
 && node -e "console.log('baileys', require('baileys/package.json').version)"
RUN f=/evolution/node_modules/baileys/lib/Socket/messages-recv.js; \
    grep -q "const linkCodeCompanionReg = getBinaryNodeChild(node, 'link_code_companion_reg');" "$f" && \
    sed -i "s|const linkCodeCompanionReg = getBinaryNodeChild(node, 'link_code_companion_reg');|&\n                if (!getBinaryNodeChildBuffer(linkCodeCompanionReg, 'primary_identity_pub')) { break; }|" "$f" || true
