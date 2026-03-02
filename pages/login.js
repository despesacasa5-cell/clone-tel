import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

export default function Login() {
  const router = useRouter()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        router.push('/')
      } else {
        const data = await res.json()
        setError(data.error || 'Erro ao fazer login')
      }
    } catch {
      setError('Erro de conexão')
    }
    setLoading(false)
  }

  return (
    <>
      <Head>
        <title>Login — TG Forwarder</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        {/* Grid background */}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 0,
          backgroundImage: 'linear-gradient(#1a1a2e22 1px, transparent 1px), linear-gradient(90deg, #1a1a2e22 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        <div className="fade-in" style={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: '400px',
          background: '#13131a',
          border: '1px solid #2d2d3d',
          borderRadius: '12px',
          padding: '40px 32px',
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 56, height: 56, borderRadius: '12px',
              background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
              marginBottom: '16px',
              fontSize: '24px',
            }}>✈</div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>
              TG Forwarder
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#64748b' }}>
              Painel de Controle
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Usuário
              </label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                placeholder="admin"
                required
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Senha
              </label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: '6px',
                background: '#1f1010', border: '1px solid #7f1d1d',
                color: '#fca5a5', fontSize: '13px', marginBottom: '16px',
              }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px',
                background: loading ? '#1e3a8a' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                border: 'none', borderRadius: '8px',
                color: '#fff', fontSize: '14px', fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                transition: 'opacity 0.2s',
              }}
            >
              {loading ? '...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}