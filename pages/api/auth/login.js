import { getSession } from '../../../lib/session'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { username, password } = req.body

  const validUser = process.env.AUTH_USERNAME || 'admin'
  const validPass = process.env.AUTH_PASSWORD || 'admin123'

  if (username === validUser && password === validPass) {
    const session = await getSession(req, res)
    session.user = { username, isLoggedIn: true }
    await session.save()
    return res.json({ ok: true })
  }

  return res.status(401).json({ error: 'Credenciais inválidas' })
}