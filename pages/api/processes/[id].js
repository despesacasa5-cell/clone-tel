import { getSession } from '../../../lib/session'
import { getProcess, updateProcess, deleteProcess } from '../../../lib/store'

export default async function handler(req, res) {
  const session = await getSession(req, res)
  if (!session?.user?.isLoggedIn) return res.status(401).json({ error: 'Não autenticado' })

  const { id } = req.query

  if (req.method === 'GET') {
    const proc = getProcess(id)
    return proc ? res.json(proc) : res.status(404).end()
  }

  if (req.method === 'PATCH') {
    const { action } = req.body
    let status = 'paused'
    
    if (action === 'start') status = 'running'
    if (action === 'stop') status = 'stopped'
    if (action === 'pause') status = 'paused'

    const updated = updateProcess(id, { status })
    return res.json(updated)
  }

  if (req.method === 'DELETE') {
    deleteProcess(id)
    return res.json({ ok: true })
  }

  res.status(405).end()
}