/**
 * lib/telegram-worker.js
 *
 * Gerencia um TelegramClient (gramjs/MTProto) por processo.
 * Adaptado diretamente do telegram.js que já funciona em produção.
 *
 * ATENÇÃO: Este módulo roda no servidor Next.js (Node.js).
 * Cada processo tem seu próprio TelegramClient independente.
 */

import { TelegramClient } from 'telegram'
import { StringSession }  from 'telegram/sessions/index.js'
import { NewMessage }     from 'telegram/events/index.js'
import {
  getProcess, updateProcess, addLog,
  setWorker, getWorker, removeWorker,
} from './store.js'

const API_ID   = Number(process.env.TG_API_ID)
const API_HASH = process.env.TG_API_HASH || ''

// ─── Helpers (do telegram.js original) ───────────────────

function extractChatId(message) {
  if (!message.peerId) return null
  const p = message.peerId
  if (p.channelId) {
    const id = p.channelId.value ?? p.channelId
    return -1000000000000 - Number(id)
  }
  if (p.chatId) {
    const id = p.chatId.value ?? p.chatId
    return -Number(id)
  }
  if (p.userId) {
    const id = p.userId.value ?? p.userId
    return Number(id)
  }
  return null
}

function getTipo(message) {
  if (!message.media) return 'Texto'
  const cls = message.media.className || ''
  if (cls === 'MessageMediaPhoto') return 'Foto'
  if (cls === 'MessageMediaDocument') {
    const doc  = message.media.document
    const mime = doc?.mimeType || ''
    if (mime.startsWith('video/')) return 'Vídeo'
    if (mime.startsWith('image/')) return 'Imagem'
    if (mime === 'application/x-tgsticker') return 'Sticker'
    const attrs = doc?.attributes || []
    if (attrs.some(a => a.className === 'DocumentAttributeAnimated')) return 'GIF'
    if (attrs.some(a => a.className === 'DocumentAttributeAudio'))    return 'Áudio'
    if (attrs.some(a => a.className === 'DocumentAttributeVideo'))    return 'Vídeo'
    return 'Documento'
  }
  if (cls === 'MessageMediaGeo')     return 'Localização'
  if (cls === 'MessageMediaPoll')    return 'Enquete'
  if (cls === 'MessageMediaContact') return 'Contato'
  return cls || 'Mídia'
}

async function enviarParaB(client, destinoEntity, origemEntity, message) {
  const texto = message.message || ''

  if (!message.media) {
    await client.sendMessage(destinoEntity, { message: texto })
    return 'texto'
  }

  // Tenta forward direto (sem download)
  try {
    await client.forwardMessages(destinoEntity, {
      messages: [message.id],
      fromPeer: origemEntity,
    })
    return 'forward'
  } catch (err) {
    addLog('_', `Forward bloqueado (${err.message}), baixando mídia...`, 'warning')
  }

  // Fallback: download + reenvio
  const buffer = await client.downloadMedia(message.media, {})
  if (!buffer || buffer.length === 0) throw new Error('Mídia vazia após download')

  await client.sendFile(destinoEntity, {
    file: buffer,
    caption: texto,
    forceDocument: false,
  })
  return 'upload'
}

// ─── Criar e conectar client ──────────────────────────────

export async function createClient(sessionStr) {
  if (!API_ID || !API_HASH) {
    throw new Error('TG_API_ID ou TG_API_HASH não configurados no ambiente')
  }

  const session = new StringSession(sessionStr || '')
  const client  = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  })

  await client.connect()
  return client
}

// ─── Iniciar monitoramento de um processo ─────────────────

export async function startProcess(processId) {
  const proc = getProcess(processId)
  if (!proc) throw new Error('Processo não encontrado')
  if (!proc.sessionStr) throw new Error('Sessão MTProto não configurada. Faça login primeiro.')

  // Se já tem worker ativo, apenas atualiza status
  if (getWorker(processId)) {
    updateProcess(processId, { status: 'running', startedAt: new Date().toISOString() })
    addLog(processId, 'Processo retomado', 'info')
    return
  }

  addLog(processId, 'Conectando ao Telegram (MTProto)...', 'info')

  const client = await createClient(proc.sessionStr)

  // Valida autorização
  const authorized = await client.isUserAuthorized()
  if (!authorized) {
    await client.disconnect()
    updateProcess(processId, { status: 'auth_needed' })
    addLog(processId, 'Sessão expirada — faça login novamente', 'error')
    throw new Error('Sessão expirada')
  }

  // Resolve entidades
  let origemEntities = []
  for (const srcId of proc.sources) {
    try {
      const entity = await client.getEntity(Number(srcId))
      origemEntities.push({ id: Number(srcId), entity })
      addLog(processId, `Origem resolvida: "${entity.title || srcId}"`, 'success')
    } catch (err) {
      addLog(processId, `Não foi possível acessar origem ${srcId}: ${err.message}`, 'error')
    }
  }

  let destinoEntity
  try {
    destinoEntity = await client.getEntity(Number(proc.destination))
    addLog(processId, `Destino resolvido: "${destinoEntity.title || proc.destination}"`, 'success')
  } catch (err) {
    await client.disconnect()
    addLog(processId, `Não foi possível acessar destino ${proc.destination}: ${err.message}`, 'error')
    throw new Error(`Destino inválido: ${err.message}`)
  }

  if (origemEntities.length === 0) {
    await client.disconnect()
    addLog(processId, 'Nenhuma origem válida — abortando', 'error')
    throw new Error('Nenhuma origem acessível')
  }

  const sourceIds = new Set(origemEntities.map(o => o.id))

  // Stats locais
  const stats = { texto: 0, forward: 0, upload: 0, erro: 0 }

  // Handler de mensagens (igual ao telegram.js original)
  client.addEventHandler(async (event) => {
    const proc2 = getProcess(processId)
    if (!proc2 || proc2.status !== 'running') return

    const message = event.message
    if (!message) return

    const chatId = extractChatId(message)
    if (!sourceIds.has(chatId)) return

    const tipo    = getTipo(message)
    const preview = (message.message || '').slice(0, 60).replace(/\n/g, ' ')

    addLog(processId, `[RECEBIDO] ${tipo}${preview ? ` → "${preview}"` : ''}`, 'info')

    const origemEntry = origemEntities.find(o => o.id === chatId)

    try {
      const metodo = await enviarParaB(client, destinoEntity, origemEntry.entity, message)
      stats[metodo] = (stats[metodo] || 0) + 1
      updateProcess(processId, {
        messageCount: (getProcess(processId)?.messageCount || 0) + 1,
        lastActivity: new Date().toISOString(),
      })
      addLog(processId, `[COPIADO] ${metodo} | textos:${stats.texto} forwards:${stats.forward} uploads:${stats.upload}`, 'success')
    } catch (err) {
      stats.erro++
      updateProcess(processId, {
        errorCount: (getProcess(processId)?.errorCount || 0) + 1,
      })
      addLog(processId, `[ERRO] ${err.message}`, 'error')
    }
  }, new NewMessage({}))

  setWorker(processId, client)
  updateProcess(processId, { status: 'running', startedAt: new Date().toISOString() })
  addLog(processId, `Clonador ativo! Monitorando ${origemEntities.length} origem(ns)`, 'success')
}

// ─── Pausar (mantém client conectado, ignora mensagens) ──

export function pauseProcess(processId) {
  updateProcess(processId, { status: 'paused' })
  addLog(processId, 'Processo pausado (client conectado, mensagens ignoradas)', 'warning')
}

// ─── Parar (desconecta client) ────────────────────────────

export async function stopProcess(processId) {
  const client = getWorker(processId)
  if (client) {
    try { await client.disconnect() } catch (_) {}
    removeWorker(processId)
  }
  updateProcess(processId, { status: 'stopped' })
  addLog(processId, 'Processo encerrado e cliente desconectado', 'warning')
}

// ─── Login MTProto (fluxo interativo via API) ─────────────
// Usado pelo endpoint /api/telegram/auth

export async function startLogin(phoneNumber) {
  if (!API_ID || !API_HASH) {
    throw new Error('TG_API_ID ou TG_API_HASH não configurados')
  }

  const session = new StringSession('')
  const client  = new TelegramClient(session, API_ID, API_HASH, { connectionRetries: 3 })
  await client.connect()

  const result = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phoneNumber)

  return {
    client,
    phoneCodeHash: result.phoneCodeHash,
    sessionRef: session,
  }
}

export async function confirmCode(client, phoneNumber, phoneCodeHash, code, password) {
  try {
    await client.invoke(
      new (await import('telegram/tl/functions/auth/index.js')).SignIn({
        phoneNumber,
        phoneCodeHash,
        phoneCode: code,
      })
    )
  } catch (err) {
    // Se pediu 2FA
    if (err.errorMessage === 'SESSION_PASSWORD_NEEDED' && password) {
      const { computeCheck } = await import('telegram/Password.js')
      const passwordResult   = await client.invoke(
        new (await import('telegram/tl/functions/account/index.js')).GetPassword()
      )
      const checkResult = await computeCheck(passwordResult, password)
      await client.invoke(
        new (await import('telegram/tl/functions/auth/index.js')).CheckPassword({ password: checkResult })
      )
    } else {
      throw err
    }
  }

  return client.session.save()
}