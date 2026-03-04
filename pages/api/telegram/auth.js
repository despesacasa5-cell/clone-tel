/**
 * POST /api/telegram/auth
 *
 * Fluxo de autenticação MTProto em 3 etapas:
 *   step: "send_code"    → envia SMS/código ao número
 *   step: "confirm_code" → valida o código (+ 2FA opcional)
 *   step: "save_session" → salva sessionStr em um processo existente
 */

import { getSession } from '../../../lib/session'
import { updateProcess, addLog } from '../../../lib/store'

// Guarda o client temporário entre as chamadas (mesmo processo Node)
// Chave: phoneNumber, valor: { client, phoneCodeHash }
const pendingLogins = new Map()

export default async function handler(req, res) {
  const session = await getSession(req, res)
  if (!session?.user?.isLoggedIn) return res.status(401).json({ error: 'Não autenticado' })
  if (req.method !== 'POST') return res.status(405).end()

  const { step, phoneNumber, code, password, processId, sessionStr } = req.body

  // ── Etapa 1: Enviar código ─────────────────────────────
  if (step === 'send_code') {
    if (!phoneNumber) return res.status(400).json({ error: 'Informe o número de telefone' })

    try {
      const { startLogin } = await import('../../../lib/telegram-worker.js')
      const { client, phoneCodeHash } = await startLogin(phoneNumber)
      pendingLogins.set(phoneNumber, { client, phoneCodeHash })
      return res.json({ ok: true, message: 'Código enviado para o Telegram' })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // ── Etapa 2: Confirmar código ──────────────────────────
  if (step === 'confirm_code') {
    if (!phoneNumber || !code) return res.status(400).json({ error: 'Número e código obrigatórios' })

    const pending = pendingLogins.get(phoneNumber)
    if (!pending) return res.status(400).json({ error: 'Inicie o login primeiro (send_code)' })

    try {
      const { confirmCode } = await import('../../../lib/telegram-worker.js')
      const savedSession = await confirmCode(pending.client, phoneNumber, pending.phoneCodeHash, code, password)
      pendingLogins.delete(phoneNumber)
      return res.json({ ok: true, sessionStr: savedSession })
    } catch (err) {
      if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        return res.status(400).json({ error: '2FA_NEEDED', message: 'Conta tem verificação em 2 etapas. Envie a senha.' })
      }
      return res.status(400).json({ error: err.message })
    }
  }

  // ── Etapa 3: Salvar sessão num processo ────────────────
  if (step === 'save_session') {
    if (!processId || !sessionStr) return res.status(400).json({ error: 'processId e sessionStr obrigatórios' })

    updateProcess(processId, { sessionStr, status: 'paused' })
    addLog(processId, 'Sessão MTProto salva com sucesso', 'success')
    return res.json({ ok: true })
  }

  return res.status(400).json({ error: 'step inválido' })
}