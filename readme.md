# TG Forwarder

Painel de controle para encaminhar mensagens entre grupos do Telegram.

## Pré-requisitos

- Node.js 18+
- Bot do Telegram (crie com [@BotFather](https://t.me/BotFather))
- O bot deve ser **administrador** nos grupos de origem e destino

## Instalação local

```bash
npm install
cp .env.example .env.local
# edite .env.local com suas variáveis
npm run dev
```

Acesse `http://localhost:3000` e faça login.

## Deploy na Vercel

1. Faça push para o GitHub:
```bash
git add .
git commit -m "initial commit"
git push
```

2. Importe o repositório em [vercel.com/new](https://vercel.com/new)

3. Configure as variáveis de ambiente no painel da Vercel:
   - `AUTH_USERNAME` — usuário do painel (ex: `admin`)
   - `AUTH_PASSWORD` — senha do painel
   - `TELEGRAM_BOT_TOKEN` — token do seu bot
   - `SESSION_SECRET` — string aleatória com 32+ caracteres

4. Clique em **Deploy**

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `AUTH_USERNAME` | Usuário para login no painel |
| `AUTH_PASSWORD` | Senha para login no painel |
| `TELEGRAM_BOT_TOKEN` | Token do bot (@BotFather) |
| `SESSION_SECRET` | Chave secreta da sessão (32+ chars) |

## Como usar

1. **Crie um processo**: clique em "+ Novo Processo", informe as origens (chat IDs) e o destino
2. **Inicie**: clique em "▶ Iniciar"
3. **Encaminhe**: use "⚡ Encaminhar Agora" para disparar manualmente ou configure um cron job chamando `POST /api/telegram/forward` com `{ "processId": "..." }`

## Encontrando o Chat ID

Use o bot [@userinfobot](https://t.me/userinfobot) ou adicione seu bot a um grupo e chame `getUpdates` para ver os IDs.

## Notas sobre a Vercel

A Vercel usa funções serverless stateless — o estado em memória (`lib/store.js`) é reiniciado a cada deploy ou após inatividade. Para persistência real, integre um banco como **Upstash Redis** ou **PlanetScale**.