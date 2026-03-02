import { getIronSession } from 'iron-session'

const sessionOptions = {
  password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long!!',
  cookieName: 'tg-forwarder-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 horas
  },
}

export function getSession(req, res) {
  return getIronSession(req, res, sessionOptions)
}