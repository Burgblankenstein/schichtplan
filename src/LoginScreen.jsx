import { useState } from 'react'

const LS = {
  root:      { minHeight: '100vh', background: '#F5F3EE', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', fontFamily: "'Georgia', serif" },
  bgLeft:    { position: 'absolute', top: '-20%', left: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, #FFF3CC 0%, transparent 70%)', pointerEvents: 'none' },
  bgRight:   { position: 'absolute', bottom: '-20%', right: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, #D4EDE9 0%, transparent 70%)', pointerEvents: 'none' },
  card:      { position: 'relative', zIndex: 1, background: '#FFFDF8', border: '1px solid #E0DBD0', borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 400, boxShadow: '0 12px 48px rgba(0,0,0,0.10)' },
  logoWrap:  { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28, gap: 4 },
  logoTitle: { fontSize: 26, fontWeight: 700, letterSpacing: 4, color: '#1a1a1a', marginTop: 8 },
  logoSub:   { fontSize: 11, color: '#aaa', letterSpacing: 3, textTransform: 'uppercase' },
  formTitle: { fontSize: 16, fontWeight: 700, color: '#555', marginBottom: 18, textAlign: 'center', letterSpacing: 1 },
  label:     { display: 'block', fontSize: 11, color: '#aaa', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  input:     { width: '100%', padding: '11px 14px', background: '#F5F3EE', border: '1px solid #D5CFC4', borderRadius: 10, color: '#1a1a1a', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' },
  eyeBtn:    { position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1 },
  error:     { color: '#E07070', fontSize: 12, marginTop: 10, textAlign: 'center', background: '#FFF0F0', borderRadius: 8, padding: '8px 12px', border: '1px solid #F5C6C6' },
  loginBtn:  { width: '100%', marginTop: 22, padding: '13px', background: '#C8960A', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1 },
  hint:      { marginTop: 24, padding: '14px 16px', background: '#F5F3EE', borderRadius: 10, border: '1px solid #E0DBD0' },
  hintTitle: { fontSize: 11, color: '#aaa', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  hintRow:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  hintRole:  { fontSize: 12, color: '#555' },
  hintCred:  { fontSize: 11, color: '#aaa', background: '#FFFDF8', border: '1px solid #E0DBD0', borderRadius: 6, padding: '2px 8px', fontFamily: 'monospace' },
}

export default function LoginScreen({ onLogin }) {
  const [name,     setName]     = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)

  const handleLogin = async () => {
    if (!name.trim() || !password.trim()) { setError('Bitte Name und Passwort eingeben.'); return }
    setLoading(true)
    setError('')
    try {
      await onLogin(name.trim(), password)
    } catch (e) {
      setError(e.message || 'Name oder Passwort falsch.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={LS.root}>
      <div style={LS.bgLeft} />
      <div style={LS.bgRight} />
      <div style={LS.card}>
        <div style={LS.logoWrap}>
          <span style={{ fontSize: 40 }}>🍴</span>
          <div style={LS.logoTitle}>SCHICHT<span style={{ color: '#C8960A' }}>PLAN</span></div>
          <div style={LS.logoSub}>Restaurant Manager</div>
        </div>

        <div style={LS.formTitle}>Anmelden</div>

        <label style={LS.label}>Name</label>
        <input style={LS.input} placeholder="Dein Name"
          value={name} onChange={e => { setName(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleLogin()} />

        <label style={{ ...LS.label, marginTop: 14 }}>Passwort</label>
        <div style={{ position: 'relative' }}>
          <input style={{ ...LS.input, paddingRight: 44 }}
            type={showPw ? 'text' : 'password'}
            placeholder="Passwort"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          <button style={LS.eyeBtn} onClick={() => setShowPw(v => !v)}>{showPw ? '🙈' : '👁️'}</button>
        </div>

        {error && <div style={LS.error}>{error}</div>}

        <button style={{ ...LS.loginBtn, opacity: loading ? 0.7 : 1 }} onClick={handleLogin} disabled={loading}>
          {loading ? 'Wird angemeldet…' : 'Anmelden →'}
        </button>
      </div>
    </div>
  )
}
