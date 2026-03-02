import { getSession } from '../../../lib/session'

export default async function handler(req, res) {
  const session = await getSession(req, res)
  
  if (session?.user?.isLoggedIn) {
    return res.json({
      ...session.user,
      isLoggedIn: true
    })
  }

  res.json({ isLoggedIn: false })
}