import { getSession } from '../../../lib/session'
import { getAllProcesses, createProcess } from '../../../lib/store'
import { v4 as uuidv4 } from 'uuid'

export default async function handler(req, res) {
  const session = await getSession(req, res)
  if (!session?.user?.isLoggedIn) return res.status(401).json({ error: 'Não autenticado' })

  if (req.method === 'GET') {
    return res.json(getAllProcesses())
  }

  if (req.method === 'POST') {
    const { sources, destination } = req.body
    if (!sources?.length || !destination) {
      return res.status(400).json({ error: 'Informe as origens e o destino' })
    }
    const id = uuidv4()
    const proc = createProcess(id, { sources, destination })
    return res.status(201).json(proc)
  }

  res.status(405).end()
}