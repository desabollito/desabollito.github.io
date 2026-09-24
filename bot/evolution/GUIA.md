# Número propio en WhatsApp (grupos incluidos)

Tu chip queda vinculado a un servidor gratis que le pasa los mensajes al bot, como si fuera WhatsApp Web. Funciona igual que el bot oficial y además en grupos.

> No oficial: usar con volumen normal (sin spam) y con el chip dedicado, no con tu número personal.

## 1. Servidor gratis (Oracle Cloud)
1. Creá la cuenta en **cloud.oracle.com** (Free Tier). Pide tarjeta solo para verificar y no cobra. Región: **Brazil East (São Paulo)**.
2. **Compute → Instances → Create instance**:
   - Image: **Ubuntu 22.04**.
   - Shape: **Ampere → VM.Standard.A1.Flex**, 1 OCPU y 6 GB (Always Free).
   - SSH keys: **Generate a key pair** → **Save private key** (guardá el archivo).
   - **Create**. Anotá la **Public IP**.
3. En la instancia → **Subnet** → **Security List** → **Add Ingress Rules**:
   - Source `0.0.0.0/0`, TCP, puerto **80**.
   - Otra igual con el puerto **443**.

## 2. Dirección web gratis (DuckDNS)
1. Entrá a **duckdns.org** con Google.
2. Creá el subdominio `desabollito` (o el que esté libre) y en **current ip** poné la Public IP de Oracle → **update ip**.
3. Copiá tu **token**, que aparece arriba.

## 3. Instalar (un solo comando)
En tu PC abrí **PowerShell** y conectate al servidor:
```
ssh -i RUTA\DE\LA\CLAVE.key ubuntu@PUBLIC_IP
```
Ya adentro, pegá (con tu subdominio y token):
```
curl -fsSL https://desabollito.github.io/bot/evolution/setup.sh | sudo bash -s -- desabollito TU_TOKEN_DUCKDNS
```
Al terminar te muestra 3 datos.

## 4. Conectar
1. **Cloudflare** → Worker → Settings → Variables and Secrets → cargá `EVOLUTION_URL`, `EVOLUTION_APIKEY` y `EVOLUTION_INSTANCE` → **Deploy**.
2. Abrí `https://desabollito.duckdns.org/manager`, entrá con la API key → instancia **desabollito** → **Conectar** → escaneá el QR desde el celular del chip (WhatsApp → Dispositivos vinculados).
3. Revisá el diagnóstico: la línea **"Número propio (Evolution)"** tiene que quedar en ✅.

## Uso en grupos
- Agregá el número a los grupos del equipo.
- El bot **solo reacciona** a mensajes con patente, a fotos (si hay un vehículo abierto por esa persona), a **OK** y a los comandos (hola, ayuda, operativo, ubicame…). La charla normal la ignora.
- Cada persona tiene su propio vehículo abierto, así que pueden cargar en paralelo en el mismo grupo.
