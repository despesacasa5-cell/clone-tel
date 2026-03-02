import { getIronSession } from 'iron-session'

const sessionOptions = {
  // Removido o fallback inseguro para obrigar o uso do .env
  password: process.env.SESSION_SECRET, 
  cookieName: 'tg-forwarder-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 horas
  },
}

export function getSession(req, res) {
  if (!sessionOptions.password) {
    throw new Error("SESSION_SECRET não configurada nas variáveis de ambiente.")
  }
  return getIronSession(req, res, sessionOptions)
}