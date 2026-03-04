# TG Forwarder

Painel de controle para clonar mensagens entre grupos do Telegram em tempo real.  
Usa **gramjs (MTProto)** — funciona com conta pessoal, grupos privados e qualquer tipo de mídia.

## Como funciona

O clonador funciona exatamente como o `telegram.js` original:
1. Conecta com sua conta pessoal via MTProto (gramjs)
2. Escuta novas mensagens nos grupos de **origem**
3. Tenta `forwardMessages` (sem download, mais rápido)
4. Se bloqueado, baixa a mídia e reenvia via `sendFile`

Suporta: textos, fotos, vídeos, GIFs, documentos, áudios, stickers, enquetes, localizações.

## Pré-requisitos

- Node.js 18+
- Conta no Telegram
- API credentials em [my.telegram.org](https://my.telegram.org)

## Instalação local

```bash
npm install
cp .env.example .env.local
# Edite .env.local com TG_API_ID, TG_API_HASH, AUTH_PASSWORD, SESSION_SECRET
npm run dev
```

Acesse `http://localhost:3000`.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `AUTH_USERNAME` | Usuário do painel (padrão: admin) |
| `AUTH_PASSWORD` | Senha do painel |
| `SESSION_SECRET` | Chave secreta da sessão web (32+ chars) |
| `TG_API_ID` | App api_id do my.telegram.org |
| `TG_API_HASH` | App api_hash do my.telegram.org |

## Deploy na Vercel

```bash
git add .
git commit -m "feat: telegram mtproto forwarder"
git push
```

1. Importe em [vercel.com/new](https://vercel.com/new)
2. Configure as 5 variáveis acima
3. Deploy

> ⚠️ **Importante**: A Vercel usa funções serverless stateless. O client MTProto (worker) e os logs em memória se perdem quando a função "esfria". Para uso contínuo, hospede em um VPS (Railway, Fly.io, DigitalOcean) ou use **Upstash Redis** para persistir o estado.

## Fluxo de uso no painel

1. Crie um processo informando os IDs de origem e destino
2. Clique em **🔑 Fazer Login** e autentique com seu número do Telegram
3. Confirme o código recebido (+ senha 2FA se necessário)
4. Clique em **▶ Iniciar** — o clonador começa a monitorar em tempo real
5. Acompanhe os logs em tempo real clicando em **▼ Logs**

## Obtendo IDs de grupos

- Encaminhe uma mensagem do grupo para [@userinfobot](https://t.me/userinfobot)
- Ou use [@getidsbot](https://t.me/getidsbot)
- IDs de canais/supergrupos começam com `-100`