# TG Cloner — Telegram Group Member Cloner

Interface web para clonar membros de grupos Telegram usando GramJS (MTProto).

## 🚀 Deploy na Vercel

### 1. Instale a Vercel CLI
```bash
npm i -g vercel
```

### 2. Clone / baixe este projeto e entre na pasta
```bash
cd telegram-cloner
npm install
```

### 3. Deploy
```bash
vercel
```

Siga as instruções no terminal. O projeto será publicado automaticamente.

---

## 💻 Desenvolvimento local

```bash
npm install
npm run dev
# Acesse http://localhost:3000
```

---

## 📋 Como usar

1. **Credenciais** — Acesse [my.telegram.org](https://my.telegram.org/auth), faça login, vá em *API development tools* e crie um app para obter o `API ID` e `API Hash`.

2. **Autenticação** — Informe seu número de telefone. O Telegram enviará um código de verificação. Se tiver 2FA ativado, a senha será solicitada em seguida.

3. **Session String** — Após autenticar, uma session string será gerada. Salve-a para evitar autenticar novamente na próxima vez.

4. **Selecione os grupos** — Escolha o grupo de **origem** (de onde copiar membros) e o grupo de **destino** (para onde adicionar). Você precisa ser admin do grupo destino.

5. **Configure e clone** — Defina o limite de membros e o delay entre adições (mínimo recomendado: 3000ms).

---

## ⚙️ Configuração de variáveis de ambiente (Vercel)

Não é necessário configurar variáveis de ambiente — as credenciais são passadas diretamente pela interface web.

Para uso avançado / automatizado, crie um `.env`:
```
API_ID=seu_api_id
API_HASH=seu_api_hash
```

---

## ⚠️ Avisos importantes

- **Flood ban**: O Telegram limita a frequência de convites. Use delays adequados (3s+).
- **Limite por sessão**: Recomenda-se no máximo 50 membros por operação.
- **Privacidade**: Usuários com configurações de privacidade restritivas não podem ser adicionados por terceiros (serão pulados automaticamente).
- **Termos de uso**: Use com responsabilidade e em conformidade com os Termos de Serviço do Telegram.

---

## 🗂 Estrutura do projeto

```
telegram-cloner/
├── api/
│   ├── auth.js       # Autenticação MTProto (envio de código, verificação, 2FA)
│   ├── groups.js     # Lista grupos/canais do usuário
│   ├── clone.js      # Lógica de clonagem de membros
│   └── server.js     # Servidor Express (desenvolvimento local)
├── public/
│   └── index.html    # Interface web completa
├── vercel.json       # Configuração Vercel
├── package.json
└── .env.example
```

---

## 🛠 Tecnologias

- **GramJS** (`telegram`) — Cliente MTProto para Node.js
- **Express** — Servidor HTTP (local)
- **Vercel** — Hospedagem serverless
- Frontend puro HTML/CSS/JS (sem frameworks)