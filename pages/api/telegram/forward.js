import { getSession } from '../../../lib/session'
import { getProcess, updateProcess, addLog } from '../../../lib/store'

export default async function handler(req, res) {
  const session = await getSession(req, res)
  if (!session?.user?.isLoggedIn) return res.status(401).json({ error: 'Não autenticado' })
  if (req.method !== 'POST') return res.status(405).end()

  const { processId } = req.body
  const proc = getProcess(processId)
  if (!proc) return res.status(404).json({ error: 'Processo não encontrado' })
  if (proc.status !== 'running') return res.status(400).json({ error: 'Processo não está em execução' })

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN não configurado' })

  try {
    // Busca mensagens recentes de cada grupo origem e encaminha para o destino
    const results = []
    for (const source of proc.sources) {
      try {
        // Busca updates do grupo (o bot precisa ser admin nos grupos)
        const updatesRes = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?chat_id=${source}&limit=10`
        )
        const updates = await updatesRes.json()

        if (updates.ok && updates.result.length > 0) {
          for (const update of updates.result) {
            if (update.message) {
              const msgId = update.message.message_id
              const fromChatId = update.message.chat.id

              // Encaminha a mensagem para o destino
              const fwdRes = await fetch(
                `https://api.telegram.org/bot${token}/forwardMessage`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: proc.destination,
                    from_chat_id: fromChatId,
                    message_id: msgId,
                  }),
                }
              )
              const fwd = await fwdRes.json()
              if (fwd.ok) {
                updateProcess(processId, {
                  messageCount: proc.messageCount + 1,
                  lastActivity: new Date().toISOString(),
                })
                addLog(processId, `Mensagem ${msgId} de ${source} → ${proc.destination}`, 'success')
                results.push({ source, msgId, ok: true })
              } else {
                addLog(processId, `Erro ao encaminhar msg ${msgId}: ${fwd.description}`, 'error')
                updateProcess(processId, { errorCount: proc.errorCount + 1 })
              }
            }
          }
        }
      } catch (err) {
        addLog(processId, `Erro no grupo ${source}: ${err.message}`, 'error')
      }
    }

    return res.json({ ok: true, forwarded: results.length, results })
  } catch (err) {
    addLog(processId, `Erro geral: ${err.message}`, 'error')
    return res.status(500).json({ error: err.message })
  }
}