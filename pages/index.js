import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

const STATUS_COLORS = {
  running: '#22c55e',
  paused: '#f59e0b',
  stopped: '#ef4444',
}

const STATUS_LABELS = {
  running: '● Executando',
  paused: '⏸ Pausado',
  stopped: '■ Parado',
}

function Badge({ status }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
      background: STATUS_COLORS[status] + '22',
      color: STATUS_COLORS[status],
      border: `1px solid ${STATUS_COLORS[status]}44`,
    }} className={status === 'running' ? 'running-dot' : ''}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: '#13131a', border: '1px solid #2d2d3d',
      borderRadius: '10px', padding: '16px 20px',
    }}>
      <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 700, color: color || '#f1f5f9' }}>
        {value}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [processes, setProcesses] = useState([])
  const [showNewForm, setShowNewForm] = useState(false)
  const [selectedProc, setSelectedProc] = useState(null)
  const [botInfo, setBotInfo] = useState(null)
  const [newForm, setNewForm] = useState({ sources: [''], destination: '' })
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState({})

  // Auth check
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.isLoggedIn) router.push('/login')
      else { setUser(d); setLoading(false) }
    })
  }, [])

  // Load processes
  const loadProcesses = useCallback(async () => {
    const res = await fetch('/api/processes')
    if (res.ok) setProcesses(await res.json())
  }, [])

  useEffect(() => { if (user) loadProcesses() }, [user])

  // Auto-refresh
  useEffect(() => {
    if (!user) return
    const t = setInterval(loadProcesses, 5000)
    return () => clearInterval(t)
  }, [user, loadProcesses])

  // Test bot
  useEffect(() => {
    if (!user) return
    fetch('/api/telegram/test').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.ok) setBotInfo(d.result)
    })
  }, [user])

  async function logout() {
    await fetch('/api/auth/logout')
    router.push('/login')
  }

  async function createProcess() {
    const sources = newForm.sources.filter(s => s.trim())
    if (!sources.length || !newForm.destination.trim()) return
    const res = await fetch('/api/processes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources, destination: newForm.destination }),
    })
    if (res.ok) {
      setNewForm({ sources: [''], destination: '' })
      setShowNewForm(false)
      loadProcesses()
    }
  }

  async function processAction(id, action) {
    setActionLoading(p => ({ ...p, [id]: action }));
    try {
      const res = await fetch(`/api/processes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        await loadProcesses(); // Recarrega a lista completa para garantir sincronia
        
        // Se este processo for o que está aberto no painel lateral, atualiza os detalhes
        if (selectedProc?.id === id) {
          const updated = await fetch(`/api/processes/${id}`).then(r => r.json());
          setSelectedProc(updated);
        }
      } else {
        const data = await res.json();
        alert(`Erro: ${data.error || 'Falha ao atualizar processo'}`);
      }
    } catch (err) {
      console.error("Erro na ação:", err);
    } finally {
      setActionLoading(p => ({ ...p, [id]: null }));
    }
  }

  async function deleteProcess(id) {
    if (!confirm('Deletar este processo?')) return
    await fetch(`/api/processes/${id}`, { method: 'DELETE' })
    if (selectedProc?.id === id) setSelectedProc(null)
    loadProcesses()
  }

  async function manualForward(id) {
    setActionLoading(p => ({ ...p, [id + '_fwd']: true }))
    const res = await fetch('/api/telegram/forward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processId: id }),
    })
    const data = await res.json()
    alert(res.ok ? `✅ ${data.forwarded} mensagem(s) encaminhada(s)` : `❌ ${data.error}`)
    loadProcesses()
    setActionLoading(p => ({ ...p, [id + '_fwd']: false }))
  }

  function addSourceField() {
    setNewForm(p => ({ ...p, sources: [...p.sources, ''] }))
  }

  function removeSourceField(i) {
    setNewForm(p => ({ ...p, sources: p.sources.filter((_, idx) => idx !== i) }))
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#3b82f6', fontSize: '13px' }}>Carregando...</div>
      </div>
    )
  }

  const running = processes.filter(p => p.status === 'running').length
  const paused = processes.filter(p => p.status === 'paused').length
  const stopped = processes.filter(p => p.status === 'stopped').length
  const totalMsgs = processes.reduce((s, p) => s + p.messageCount, 0)

  return (
    <>
      <Head>
        <title>TG Forwarder — Dashboard</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(#1a1a2e18 1px, transparent 1px), linear-gradient(90deg, #1a1a2e18 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
        <header style={{
          background: '#0d0d14',
          borderBottom: '1px solid #1e1e2e',
          padding: '0 24px',
          height: '56px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px' }}>✈</span>
            <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '15px' }}>TG Forwarder</span>
            {botInfo && (
              <span style={{
                padding: '2px 10px', borderRadius: '20px', fontSize: '11px',
                background: '#14532d', color: '#86efac', border: '1px solid #166534',
              }}>
                🤖 @{botInfo.username}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>👤 {user?.username}</span>
            <button onClick={logout} style={{
              padding: '6px 14px', background: 'transparent',
              border: '1px solid #2d2d3d', borderRadius: '6px',
              color: '#94a3b8', fontSize: '12px', cursor: 'pointer',
              fontFamily: 'inherit',
            }}>Sair</button>
          </div>
        </header>

        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px', marginBottom: '24px',
          }}>
            <StatCard label="Executando" value={running} color="#22c55e" />
            <StatCard label="Pausados" value={paused} color="#f59e0b" />
            <StatCard label="Parados" value={stopped} color="#ef4444" />
            <StatCard label="Total Processos" value={processes.length} />
            <StatCard label="Msgs Encaminhadas" value={totalMsgs} color="#3b82f6" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Processos
            </h2>
            <button onClick={() => setShowNewForm(!showNewForm)} style={{
              padding: '8px 18px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              border: 'none', borderRadius: '8px',
              color: '#fff', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              + Novo Processo
            </button>
          </div>

          {showNewForm && (
            <div className="fade-in" style={{
              background: '#13131a', border: '1px solid #2563eb44',
              borderRadius: '10px', padding: '24px', marginBottom: '20px',
            }}>
              <h3 style={{ margin: '0 0 20px', fontSize: '14px', fontWeight: 600, color: '#93c5fd' }}>
                Novo Processo de Encaminhamento
              </h3>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Grupos de Origem (ID ou @username)
                </label>
                {newForm.sources.map((src, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      value={src}
                      onChange={e => {
                        const s = [...newForm.sources]
                        s[i] = e.target.value
                        setNewForm(p => ({ ...p, sources: s }))
                      }}
                      placeholder={`Origem ${i + 1}: ex: -100123456789 ou @grupo`}
                    />
                    {newForm.sources.length > 1 && (
                      <button onClick={() => removeSourceField(i)} style={{
                        padding: '8px 12px', background: '#1f1010',
                        border: '1px solid #7f1d1d', borderRadius: '6px',
                        color: '#fca5a5', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                      }}>✕</button>
                    )}
                  </div>
                ))}
                <button onClick={addSourceField} style={{
                  padding: '6px 14px', background: 'transparent',
                  border: '1px dashed #2d2d3d', borderRadius: '6px',
                  color: '#64748b', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  + Adicionar Origem
                </button>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Grupo Destino
                </label>
                <input
                  value={newForm.destination}
                  onChange={e => setNewForm(p => ({ ...p, destination: e.target.value }))}
                  placeholder="ex: -100987654321 ou @destino"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={createProcess} style={{
                  padding: '10px 24px',
                  background: 'linear-gradient(135deg, #16a34a, #15803d)',
                  border: 'none', borderRadius: '8px',
                  color: '#fff', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  ✓ Criar Processo
                </button>
                <button onClick={() => setShowNewForm(false)} style={{
                  padding: '10px 20px', background: 'transparent',
                  border: '1px solid #2d2d3d', borderRadius: '8px',
                  color: '#94a3b8', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: selectedProc ? '1fr 380px' : '1fr', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {processes.length === 0 && (
                <div style={{
                  textAlign: 'center', padding: '48px 24px',
                  background: '#13131a', border: '1px dashed #2d2d3d',
                  borderRadius: '10px', color: '#475569', fontSize: '13px',
                }}>
                  Nenhum processo criado. Clique em "Novo Processo" para começar.
                </div>
              )}
              {processes.map(proc => (
                <div key={proc.id} className="fade-in" style={{
                  background: '#13131a',
                  border: `1px solid ${selectedProc?.id === proc.id ? '#2563eb' : '#2d2d3d'}`,
                  borderRadius: '10px', padding: '16px 20px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }} onClick={() => setSelectedProc(selectedProc?.id === proc.id ? null : proc)}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div>
                      <Badge status={proc.status} />
                      <div style={{ fontSize: '11px', color: '#475569', marginTop: '6px' }}>
                        ID: {proc.id.slice(0, 8)}...
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {proc.status !== 'running' && (
                        <Btn color="green" onClick={e => { e.stopPropagation(); processAction(proc.id, 'start') }} loading={actionLoading[proc.id] === 'start'}>
                          ▶ Start
                        </Btn>
                      )}
                      {proc.status === 'running' && (
                        <Btn color="yellow" onClick={e => { e.stopPropagation(); processAction(proc.id, 'pause') }} loading={actionLoading[proc.id] === 'pause'}>
                          ⏸ Pause
                        </Btn>
                      )}
                      {proc.status !== 'stopped' && (
                        <Btn color="red" onClick={e => { e.stopPropagation(); processAction(proc.id, 'stop') }} loading={actionLoading[proc.id] === 'stop'}>
                          ■ Stop
                        </Btn>
                      )}
                      {proc.status === 'running' && (
                        <Btn color="blue" onClick={e => { e.stopPropagation(); manualForward(proc.id) }} loading={actionLoading[proc.id + '_fwd']}>
                          ✈ Executar
                        </Btn>
                      )}
                      <Btn color="gray" onClick={e => { e.stopPropagation(); deleteProcess(proc.id) }}>
                        🗑
                      </Btn>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>Origens: </span>
                      <span style={{ color: '#93c5fd' }}>{proc.sources.length}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Destino: </span>
                      <span style={{ color: '#86efac' }}>{proc.destination}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Msgs: </span>
                      <span style={{ color: '#f1f5f9' }}>{proc.messageCount}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Erros: </span>
                      <span style={{ color: proc.errorCount > 0 ? '#fca5a5' : '#f1f5f9' }}>{proc.errorCount}</span>
                    </div>
                  </div>

                  {proc.sources.length > 0 && (
                    <div style={{ marginTop: '10px', fontSize: '11px', color: '#475569' }}>
                      {proc.sources.map(s => (
                        <span key={s} style={{
                          display: 'inline-block', marginRight: '6px', marginTop: '4px',
                          padding: '2px 8px', background: '#1e1e2e',
                          border: '1px solid #2d2d3d', borderRadius: '4px',
                        }}>{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {selectedProc && (
              <div className="fade-in" style={{
                background: '#13131a', border: '1px solid #2d2d3d',
                borderRadius: '10px', padding: '20px',
                height: 'fit-content', position: 'sticky', top: '24px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Detalhes
                  </h3>
                  <button onClick={() => setSelectedProc(null)} style={{
                    background: 'none', border: 'none', color: '#64748b',
                    cursor: 'pointer', fontSize: '16px', lineHeight: 1,
                  }}>✕</button>
                </div>

                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Status</div>
                <div style={{ marginBottom: '16px' }}><Badge status={selectedProc.status} /></div>

                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Criado em</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>
                  {new Date(selectedProc.createdAt).toLocaleString('pt-BR')}
                </div>

                {selectedProc.lastActivity && (
                  <>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Última atividade</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>
                      {new Date(selectedProc.lastActivity).toLocaleString('pt-BR')}
                    </div>
                  </>
                )}

                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Origens</div>
                <div style={{ marginBottom: '16px' }}>
                  {selectedProc.sources.map(s => (
                    <div key={s} style={{
                      padding: '4px 10px', background: '#0d0d14',
                      border: '1px solid #1e1e2e', borderRadius: '4px',
                      marginBottom: '4px', fontSize: '12px', color: '#93c5fd',
                    }}>{s}</div>
                  ))}
                </div>

                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Destino</div>
                <div style={{
                  padding: '4px 10px', background: '#0d0d14',
                  border: '1px solid #1e1e2e', borderRadius: '4px',
                  marginBottom: '16px', fontSize: '12px', color: '#86efac',
                }}>{selectedProc.destination}</div>

                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Logs</span>
                  <span style={{ color: '#475569' }}>últimos {Math.min(selectedProc.logs?.length || 0, 100)}</span>
                </div>
                <div style={{
                  background: '#0a0a0f', border: '1px solid #1e1e2e',
                  borderRadius: '6px', padding: '8px',
                  height: '200px', overflowY: 'auto', fontSize: '11px',
                }}>
                  {!selectedProc.logs?.length && (
                    <div style={{ color: '#475569' }}>Nenhum log ainda.</div>
                  )}
                  {[...(selectedProc.logs || [])].reverse().map((log, i) => (
                    <div key={i} style={{
                      color: log.type === 'error' ? '#fca5a5' : log.type === 'success' ? '#86efac' : '#94a3b8',
                      marginBottom: '4px', lineHeight: '1.4',
                    }}>
                      <span style={{ color: '#475569' }}>
                        {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                      {' '}{log.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  )
}

function Btn({ children, color, onClick, loading }) {
  const colors = {
    green: { bg: '#14532d', border: '#166534', text: '#86efac' },
    yellow: { bg: '#451a03', border: '#78350f', text: '#fde68a' },
    red: { bg: '#1f1010', border: '#7f1d1d', text: '#fca5a5' },
    blue: { bg: '#172554', border: '#1e3a8a', text: '#93c5fd' },
    gray: { bg: '#1e1e2e', border: '#2d2d3d', text: '#94a3b8' },
  }
  const c = colors[color] || colors.gray
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: '5px 12px', fontSize: '11px', fontWeight: 600,
        background: c.bg, border: `1px solid ${c.border}`,
        borderRadius: '6px', color: c.text, cursor: loading ? 'wait' : 'pointer',
        fontFamily: 'inherit', opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? '...' : children}
    </button>
  )
}