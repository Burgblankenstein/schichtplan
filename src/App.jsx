import { useState, useCallback, useMemo } from 'react'
import LoginScreen from './LoginScreen'
import useData from './useData'
import { supabase } from './supabase'
import { S } from './styles'
import { CATEGORIES, CHEF_ID, WD, SHIFT_TEMPLATES, getMonday, addDays, toDS, fmtLong, fmtShort, fmtTime, mkInitials } from './constants'

const notifIcon  = t => ({ application:'📬', assigned:'🎉', new_shift:'📋', declined:'❌' }[t] || '🔔')
const notifColor = t => ({ application:'#C8960A', assigned:'#2A9D6E', new_shift:'#6B8FB5', declined:'#E07070' }[t] || '#888')

/* ── Category pills — supports multi-select ── */
const CatPills = ({ value, onChange, multi = false }) => (
  <div style={S.catSelect}>
    {Object.entries(CATEGORIES).map(([k, v]) => {
      const active = multi ? (Array.isArray(value) && value.includes(k)) : value === k
      return (
        <button key={k}
          style={active ? { ...S.catBtn, background: v.color+'33', border:`1px solid ${v.color}`, color: v.color } : S.catBtn}
          onClick={() => {
            if (!multi) { onChange(k); return }
            const arr = Array.isArray(value) ? value : []
            onChange(active ? arr.filter(x => x !== k) : [...arr, k])
          }}>
          {v.icon} {v.label}
        </button>
      )
    })}
  </div>
)

/* ── Controlled input that doesn't lose focus ── */
const Input = ({ value, onChange, type = 'text', placeholder, style }) => (
  <input
    style={{ ...S.input, ...style }}
    type={type}
    placeholder={placeholder}
    value={value}
    onChange={e => onChange(e.target.value)}
  />
)

export default function App() {
  const [currentAccount, setCurrentAccount] = useState(null)
  const db = useData()

  const [chefTab,    setChefTab]    = useState('liste')
  const [chefSubTab, setChefSubTab] = useState('schichten')
  const [mitTab,     setMitTab]     = useState('liste')
  const [showNotifs, setShowNotifs] = useState(false)
  const [calDayDetail, setCalDayDetail] = useState(null)
  const [editingRoomSid, setEditingRoomSid] = useState(null)
  const [calChef, setCalChef] = useState(getMonday(new Date()))
  const [calMit,  setCalMit]  = useState(getMonday(new Date()))
  const [filterCat,  setFilterCat]  = useState('all')
  const [filterRoom, setFilterRoom] = useState('all')
  const [showOnlyFuture, setShowOnlyFuture] = useState(true)

  const [showBulkShift,   setShowBulkShift]   = useState(false)
  const [showManageRooms, setShowManageRooms] = useState(false)
  const [showAddAccount,  setShowAddAccount]  = useState(false)
  const [editAccount,     setEditAccount]     = useState(null)
  const [editShift,       setEditShift]       = useState(null)
  const [assignShift,     setAssignShift]     = useState(null) // shift being assigned by chef

  const [bulkForm, setBulkForm] = useState({
    date:'', template:'ala_carte', customLabel:'', time:'17:00 – 23:00', room:'',
    counts: Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, 0])),
  })
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomIcon, setNewRoomIcon] = useState('🏠')
  const [newAccForm,  setNewAccForm]  = useState({ name:'', password:'', email:'', role:'employee', categories:['service'] })
  const [accError,    setAccError]    = useState('')
  const [toast, setToast] = useState(null)

  const showToast = useCallback(msg => { setToast(msg); setTimeout(() => setToast(null), 2500) }, [])

  const isChef         = currentAccount?.role === 'chef'
  const activeEmployee = db.employees.find(e => e.id === currentAccount?.employeeId)
  const currentRecipient = isChef ? CHEF_ID : currentAccount?.employeeId
  const myNotifs    = db.notifications.filter(n => n.recipientId === currentRecipient)
  const unreadCount = myNotifs.filter(n => !n.read).length
  const getRoom = id => db.rooms.find(r => r.id === id)
  const getEmp  = id => db.employees.find(e => e.id === id)

  const today = toDS(new Date())

  // Filtered + grouped shifts for chef list view
  const groupedShifts = useMemo(() => {
    let list = db.shifts.filter(s =>
      (filterCat  === 'all' || s.category === filterCat) &&
      (filterRoom === 'all' || s.room     === filterRoom) &&
      (!showOnlyFuture || s.date >= today)
    )
    const groups = {}
    list.forEach(s => {
      if (!groups[s.date]) groups[s.date] = []
      groups[s.date].push(s)
    })
    // Sort shifts within each day by room name then by time
    Object.values(groups).forEach(shifts => {
      shifts.sort((a, b) => {
        const roomA = db.rooms.find(r => r.id === a.room)?.name || '~' // no room goes last
        const roomB = db.rooms.find(r => r.id === b.room)?.name || '~'
        if (roomA !== roomB) return roomA.localeCompare(roomB)
        return a.time.localeCompare(b.time)
      })
    })
    return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b))
  }, [db.shifts, db.rooms, filterCat, filterRoom, showOnlyFuture, today])

  // Employee's categories
  const empCategories = activeEmployee?.categories || []

  /* ── PDF Export ── */
  const exportPDF = () => {
    const week = Array.from({ length:7 }, (_,i) => addDays(calChef,i))
    const rows = week.map(day => {
      const ds = toDS(day)
      const dayShifts = db.shifts.filter(s => s.date === ds)
      return `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">${day.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'})}</td>
        <td style="padding:8px;border:1px solid #ddd">${dayShifts.map(s => {
          const cat = CATEGORIES[s.category]
          const emp = s.assigned ? getEmp(s.assigned)?.name : '—'
          return `${cat.icon} ${s.label} (${s.time}) · ${cat.label}${emp !== '—' ? ` · ${emp}` : ''}`
        }).join('<br>') || '—'}</td></tr>`
    }).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Schichtplan</title><style>body{font-family:Georgia,serif;padding:20px}h1{color:#C8960A}table{width:100%;border-collapse:collapse}td{vertical-align:top}</style></head><body><h1>🍴 SchichtPlan</h1><table>${rows}</table></body></html>`
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([html],{type:'text/html'})), download:'schichtplan.html' })
    a.click()
    showToast('Wochenplan exportiert ✓')
  }

  /* ═══════════ MEIN KONTO TAB (Mitarbeiter) ═══════════ */
  const MeinKontoTab = () => {
    const myAccount = db.accounts.find(a => a.id === currentAccount.id)
    const [email,   setEmail]   = useState(myAccount?.email || '')
    const [oldPw,   setOldPw]   = useState('')
    const [newPw,   setNewPw]   = useState('')
    const [newPw2,  setNewPw2]  = useState('')
    const [saving,  setSaving]  = useState(false)
    const [msg,     setMsg]     = useState(null) // { type: 'ok'|'err', text }

    const sha256 = async (text) => {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
    }

    const handleSave = async () => {
      setMsg(null)
      setSaving(true)
      try {
        // Passwort ändern?
        if (newPw || oldPw) {
          if (!oldPw) { setMsg({ type:'err', text:'Bitte aktuelles Passwort eingeben.' }); return }
          if (!newPw)  { setMsg({ type:'err', text:'Bitte neues Passwort eingeben.' }); return }
          if (newPw !== newPw2) { setMsg({ type:'err', text:'Neue Passwörter stimmen nicht überein.' }); return }
          if (newPw.length < 4) { setMsg({ type:'err', text:'Passwort muss mindestens 4 Zeichen haben.' }); return }

          // Altes Passwort prüfen
          const { data: rows } = await supabase
            .from('accounts').select('password').eq('id', currentAccount.id)
          const stored = rows?.[0]?.password || ''
          const oldHashed = 'sha256:' + await sha256(oldPw)
          const oldValid  = stored.startsWith('sha256:') ? stored === oldHashed : stored === oldPw
          if (!oldValid) { setMsg({ type:'err', text:'Aktuelles Passwort ist falsch.' }); return }

          await db.updateAccount(currentAccount, { name: currentAccount.name, email, newPassword: newPw }, db.accounts)
        } else {
          // Nur E-Mail ändern
          await db.updateAccount(currentAccount, { name: currentAccount.name, email, newPassword: '' }, db.accounts)
        }

        // Lokalen Account-State aktualisieren
        setCurrentAccount(acc => ({ ...acc, email }))
        setOldPw(''); setNewPw(''); setNewPw2('')
        setMsg({ type:'ok', text:'Gespeichert ✓' })
        if (newPw) showToast('Passwort erfolgreich geändert ✓')
      } catch(e) {
        setMsg({ type:'err', text: e.message })
      } finally {
        setSaving(false)
      }
    }

    const primCat = CATEGORIES[activeEmployee?.categories?.[0]] || CATEGORIES.service

    return (
      <div style={{ maxWidth: 480 }}>
        {/* Profil-Kopf */}
        <div style={{ ...S.profileBanner, marginBottom: 24 }}>
          <div style={{ ...S.empAvatarLg, background: primCat.color+'44', color: primCat.color, fontSize:20 }}>
            {activeEmployee?.avatar}
          </div>
          <div>
            <div style={S.profileName}>{activeEmployee?.name}</div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:4 }}>
              {(activeEmployee?.categories||[]).map(c => {
                const cat = CATEGORIES[c]
                return cat ? <span key={c} style={{ ...S.catBadge, background:cat.color+'22', color:cat.color }}>{cat.icon} {cat.label}</span> : null
              })}
            </div>
          </div>
        </div>

        {/* E-Mail */}
        <div style={{ background:'#FFFDF8', border:'1px solid #E0DBD0', borderRadius:12, padding:'18px 16px', marginBottom:14, boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1a1a', marginBottom:14 }}>📧 E-Mail-Adresse</div>
          <label style={S.label}>E-Mail (für Benachrichtigungen)</label>
          <Input value={email} onChange={setEmail} type="email" placeholder="deine@email.de" />
          <div style={{ fontSize:11, color:'#aaa', marginTop:6 }}>
            Wird für Schicht-Benachrichtigungen genutzt.
          </div>
        </div>

        {/* Passwort */}
        <div style={{ background:'#FFFDF8', border:'1px solid #E0DBD0', borderRadius:12, padding:'18px 16px', marginBottom:20, boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1a1a', marginBottom:14 }}>🔐 Passwort ändern</div>
          <label style={S.label}>Aktuelles Passwort</label>
          <Input value={oldPw} onChange={setOldPw} type="password" placeholder="Aktuelles Passwort" />
          <label style={S.label}>Neues Passwort</label>
          <Input value={newPw} onChange={setNewPw} type="password" placeholder="Mindestens 4 Zeichen" />
          <label style={S.label}>Neues Passwort wiederholen</label>
          <Input value={newPw2} onChange={setNewPw2} type="password" placeholder="Passwort bestätigen" />
          <div style={{ fontSize:11, color:'#aaa', marginTop:6 }}>
            Leer lassen wenn du das Passwort nicht ändern möchtest.
          </div>
        </div>

        {/* Feedback */}
        {msg && (
          <div style={{
            padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13, fontWeight:600,
            background: msg.type==='ok' ? '#EDF7F0' : '#FFF0F0',
            color:      msg.type==='ok' ? '#2A9D6E' : '#E07070',
            border:     `1px solid ${msg.type==='ok' ? '#2A9D6E44' : '#F5C6C6'}`,
          }}>
            {msg.type==='ok' ? '✓ ' : '⚠️ '}{msg.text}
          </div>
        )}

        <button style={{ ...S.confirmBtn, width:'100%', opacity: saving ? 0.7 : 1 }}
          onClick={handleSave} disabled={saving}>
          {saving ? 'Wird gespeichert…' : 'Speichern'}
        </button>
      </div>
    )
  }

  /* ═══════════ ASSIGN SHIFT MODAL (Chef weist Mitarbeiter zu) ═══════════ */
  const AssignShiftModal = () => {
    if (!assignShift) return null
    const live = db.shifts.find(s => s.id === assignShift.id) || assignShift
    const cat  = CATEGORIES[live.category]
    // eligible: employees who have this category
    const eligible = db.employees.filter(e => (e.categories || []).includes(live.category))

    return (
      <div style={S.overlay} onClick={() => setAssignShift(null)}>
        <div style={S.modal} onClick={e => e.stopPropagation()}>
          <div style={S.modalHandle}/>
          <h3 style={S.modalTitle}>👤 Mitarbeiter zuweisen</h3>
          <div style={{ ...S.catBadge, background: cat.color+'22', color: cat.color, marginBottom:8, display:'inline-block' }}>
            {cat.icon} {live.label} · {fmtShort(live.date)} · {live.time}
          </div>

          {eligible.length === 0 && (
            <div style={S.noApplicants}>Keine Mitarbeiter mit dieser Position verfügbar.</div>
          )}

          {eligible.map(emp => {
            const isAssigned   = live.assigned === emp.id
            const hasApplied   = live.applicants.includes(emp.id)
            const isUnavail    = db.unavailable.some(u => u.employeeId === emp.id && u.date === live.date)
            const primCat      = CATEGORIES[emp.categories?.[0]] || CATEGORIES.service
            const shiftsThisDay = db.shifts.filter(s => s.date === live.date && s.assigned === emp.id).length

            return (
              <div key={emp.id} style={{ ...S.applicantRow, padding:'10px 12px', background: isAssigned ? '#EDF7F0' : '#FFFDF8', borderRadius:10, border:'1px solid #E0DBD0', marginBottom:8 }}>
                <div style={{ ...S.empAvatar, background: primCat.color+'33', color: primCat.color, width:38, height:38 }}>{emp.avatar}</div>
                <div style={S.applicantInfo}>
                  <div style={S.applicantName}>{emp.name}</div>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:2 }}>
                    {hasApplied && <span style={{ fontSize:10, color:'#2A9D6E', background:'#2A9D6E22', padding:'1px 6px', borderRadius:8 }}>✓ Beworben</span>}
                    {isUnavail  && <span style={{ fontSize:10, color:'#E07070', background:'#FFE8E8', padding:'1px 6px', borderRadius:8 }}>⚠️ Abwesend</span>}
                    {shiftsThisDay > 0 && <span style={{ fontSize:10, color:'#888', background:'#EDE8DF', padding:'1px 6px', borderRadius:8 }}>{shiftsThisDay}x eingeteilt</span>}
                  </div>
                </div>
                {isAssigned ? (
                  <button style={S.unassignBtn} onClick={async () => { await db.unassignEmployee(live.id); showToast('Einteilung rückgängig'); setAssignShift(null) }}>↩ Entfernen</button>
                ) : (
                  <button style={{ ...S.assignBtn, borderColor: cat.color, color: cat.color, padding:'6px 12px', fontSize:12 }}
                    onClick={async () => { await db.assignEmployee(live.id, emp.id, live); showToast(`${emp.name} eingeteilt ✓`); setAssignShift(null) }}>
                    Einteilen
                  </button>
                )}
              </div>
            )
          })}

          <div style={S.modalActions}>
            <button style={{ ...S.cancelBtn, flex:'unset', width:'100%' }} onClick={() => setAssignShift(null)}>Schließen</button>
          </div>
        </div>
      </div>
    )
  }

  if (db.loading) return <div style={S.spinner}><div style={S.spinnerIcon}>🍴</div><div style={S.spinnerText}>Wird geladen…</div></div>
  if (db.error)   return <div style={S.spinner}><div style={{fontSize:36}}>⚠️</div><div style={{fontSize:16,fontWeight:700}}>Verbindungsfehler</div><div style={{fontSize:13,color:'#aaa',maxWidth:320,textAlign:'center'}}>{db.error}</div><div style={{fontSize:12,color:'#bbb'}}>Supabase-URL und API-Key prüfen.</div></div>
  if (!currentAccount) return <LoginScreen onLogin={async (name, pw) => setCurrentAccount(await db.login(name, pw))} />

  /* ═══════════ SHIFT CARD ═══════════ */
  const ShiftCard = ({ shift, cardIsChef=false, isEmployee=false }) => {
    const live       = db.shifts.find(s => s.id === shift.id) || shift
    const cat        = CATEGORIES[live.category]
    const assignedEm = live.assigned ? getEmp(live.assigned) : null
    const room       = getRoom(live.room)
    const hasApplied = live.applicants.includes(activeEmployee?.id)
    const editing    = editingRoomSid === live.id

    // Check if any applicant is unavailable on this date
    const unavailApplicants = live.applicants.filter(eid =>
      db.unavailable.some(u => u.employeeId === eid && u.date === live.date)
    )

    return (
      <div style={{ ...S.shiftCard, borderTop:`3px solid ${cat.color}` }}>
        <div style={S.shiftCardTop}>
          <div style={S.shiftMeta}>
            <span style={{ ...S.catBadge, background:cat.color+'22', color:cat.color }}>{cat.icon} {cat.label}</span>
            <span style={S.shiftDateSm}>{fmtShort(live.date)}</span>
          </div>
          {cardIsChef && (
            <div style={{ display:'flex', gap:4 }}>
              <button style={{ ...S.editRoomBtn, fontSize:13 }} onClick={() => setEditShift({...live})}>✏️</button>
              <button style={S.deleteBtn} onClick={async () => { await db.deleteShift(live.id); showToast('Schicht gelöscht') }}>✕</button>
            </div>
          )}
        </div>

        <div style={S.shiftName}>{live.label}</div>
        <div style={S.shiftTime}>🕐 {live.time}</div>

        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, flexWrap:'wrap' }}>
          {room ? <span style={S.roomBadge}>{room.icon} {room.name}</span>
                : <span style={{ ...S.roomBadge, color:'#ccc', borderColor:'#e0e0e0', background:'#fafafa' }}>— kein Raum</span>}
          {cardIsChef && !editing && <button style={S.editRoomBtn} onClick={() => setEditingRoomSid(live.id)}>🏢</button>}
        </div>

        {cardIsChef && editing && (
          <div style={S.roomPicker}>
            <div style={S.roomPickerLabel}>Raum wählen</div>
            <button style={S.rpOpt} onClick={async () => { await db.changeRoom(live.id,''); setEditingRoomSid(null); showToast('Raum geändert ✓') }}>— Kein</button>
            {db.rooms.map(r => (
              <button key={r.id} style={{ ...S.rpOpt, ...(live.room===r.id?S.rpOptActive:{}) }}
                onClick={async () => { await db.changeRoom(live.id,r.id); setEditingRoomSid(null); showToast('Raum geändert ✓') }}>
                {r.icon} {r.name}
              </button>
            ))}
            <button style={S.rpCancel} onClick={() => setEditingRoomSid(null)}>Abbrechen</button>
          </div>
        )}

        {cardIsChef && !editing && (
          assignedEm ? (
            <div style={S.assignedBox}>
              <div style={S.empAvatar}>{assignedEm.avatar}</div>
              <span style={S.assignedName}>{assignedEm.name}</span>
              <span style={S.assignedBadge}>✓</span>
              <button style={S.unassignBtn} onClick={async () => { await db.unassignEmployee(live.id); showToast('Einteilung rückgängig') }}>↩</button>
            </div>
          ) : (
            <div style={S.applicantsBox}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <div style={S.applicantsLabel}>Bewerber ({live.applicants.length})</div>
                <button style={{ ...S.assignBtn, borderColor: cat.color, color: cat.color, padding:'4px 10px' }}
                  onClick={() => setAssignShift(live)}>
                  👤 Zuweisen
                </button>
              </div>
              {live.applicants.length===0 && <div style={S.noApplicants}>Noch keine Bewerbungen</div>}
              {live.applicants.slice(0,2).map(eid => {
                const emp=getEmp(eid); if(!emp) return null
                const ec=CATEGORIES[emp.categories?.[0] || 'service']
                const isUnavail = db.unavailable.some(u => u.employeeId === eid && u.date === live.date)
                return (
                  <div key={eid} style={S.applicantRow}>
                    <div style={{ ...S.empAvatar, background:ec.color+'33', color:ec.color }}>{emp.avatar}</div>
                    <div style={S.applicantInfo}>
                      <div style={S.applicantName}>{emp.name}</div>
                      {isUnavail && <span style={S.unavailWarn}>⚠️ Abwesend</span>}
                    </div>
                  </div>
                )
              })}
              {live.applicants.length > 2 && (
                <div style={{ fontSize:11, color:'#aaa', textAlign:'center', marginTop:4 }}>
                  +{live.applicants.length - 2} weitere → Zuweisen
                </div>
              )}
            </div>
          )
        )}

        {isEmployee && !editing && (
          <>
            <div style={S.applicantsCount}>👥 {live.applicants.length} Bewerber</div>
            {live.assigned === activeEmployee?.id ? (
              // Employee is assigned — can confirm or decline
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <div style={{ ...S.assignedBadge, padding:'8px', textAlign:'center', borderRadius:8 }}>✓ Du bist eingeteilt</div>
                <button style={{ ...S.withdrawBtn, color:'#E07070', borderColor:'#E07070' }}
                  onClick={async () => {
                    await db.declineShift(live.id, live, activeEmployee)
                    showToast('Schicht abgelehnt')
                  }}>
                  ✕ Ablehnen
                </button>
              </div>
            ) : live.assigned ? (
              <div style={{ ...S.assignedBadge, padding:'8px', textAlign:'center', borderRadius:8 }}>✓ Besetzt</div>
            ) : hasApplied ? (
              <button style={S.withdrawBtn} onClick={async () => { await db.withdrawApplication(live.id,live,activeEmployee.id); showToast('Bewerbung zurückgezogen') }}>Bewerbung zurückziehen</button>
            ) : (
              <button style={{ ...S.applyBtn, background:cat.color }} onClick={async () => { await db.applyForShift(live.id,live,activeEmployee); showToast('Bewerbung eingereicht ✓') }}>Bewerben</button>
            )}
          </>
        )}
      </div>
    )
  }

  /* ═══════════ CALENDAR ═══════════ */
  const Calendar = ({ monday, setMonday, calIsChef }) => {
    const days  = Array.from({ length:7 }, (_,i) => addDays(monday,i))
    const todayDs = toDS(new Date())

    const toggleUnavail = async (ds) => {
      if (!activeEmployee) return
      const isUnavail = db.unavailable.some(u => u.employeeId === activeEmployee.id && u.date === ds)
      if (isUnavail) {
        await db.removeUnavailableDay(activeEmployee.id, ds)
        showToast('Verfügbarkeit wiederhergestellt')
      } else {
        await db.addUnavailableDay(activeEmployee.id, ds)
        showToast('Tag als nicht verfügbar markiert')
      }
    }

    return (
      <div>
        <div style={S.calNav}>
          <button style={S.calNavBtn} onClick={() => setMonday(addDays(monday,-7))}>‹</button>
          <span style={S.calNavTitle}>
            {days[0].toLocaleDateString('de-DE',{day:'2-digit',month:'short'})} – {days[6].toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}
          </span>
          <button style={S.calNavBtn} onClick={() => setMonday(addDays(monday,7))}>›</button>
        </div>
        {calIsChef && (
          <div style={{ textAlign:'right', marginBottom:10 }}>
            <button style={{ ...S.addBtn, background:'#888', fontSize:12, padding:'6px 14px' }} onClick={exportPDF}>📄 Exportieren</button>
          </div>
        )}
        {!calIsChef && (
          <div style={{ fontSize:12, color:'#aaa', marginBottom:10, padding:'8px 12px', background:'#FFF8EC', borderRadius:8, border:'1px solid #E8C54744' }}>
            💡 Tippe auf einen Tag um ihn als <strong>nicht verfügbar</strong> zu markieren. Rot = abwesend.
          </div>
        )}
        <div style={S.calGrid}>
          {days.map((day,i) => {
            const ds = toDS(day)
            const isToday   = ds === todayDs
            const isUnavail = !calIsChef && db.unavailable.some(u => u.employeeId === activeEmployee?.id && u.date === ds)
            const dayShifts = calIsChef
              ? db.shifts.filter(s => s.date === ds)
              : db.shifts.filter(s => s.date === ds && empCategories.includes(s.category))

            // Chef: show which employees are unavailable on this day
            const unavailEmps = calIsChef
              ? db.unavailable.filter(u => u.date === ds).map(u => getEmp(u.employeeId)).filter(Boolean)
              : []

            return (
              <div key={ds}
                style={{ ...S.calDay, ...(isToday?S.calDayToday:{}), ...(isUnavail?S.calDayUnavail:{}) }}
                onClick={() => !calIsChef && toggleUnavail(ds)}>
                <div style={{ ...S.calDayHdr, ...(isToday?{color:'#C8960A'}:{}) }}>
                  <span style={S.calDayName}>{WD[i]}</span>
                  <span style={S.calDayNum}>{day.getDate()}</span>
                  {isUnavail && <span style={S.calDayX}>✕</span>}
                </div>

                {unavailEmps.length > 0 && (
                  <div style={{ fontSize:9, color:'#E07070', marginBottom:2, textAlign:'center' }}>
                    ⚠️ {unavailEmps.map(e=>e.avatar).join(' ')}
                  </div>
                )}

                {dayShifts.length===0
                  ? <div style={S.calEmpty}>–</div>
                  : dayShifts.map(shift => {
                    const cat  = CATEGORIES[shift.category]
                    const room = getRoom(shift.room)
                    const isAssigned = !!shift.assigned
                    const hasApp = shift.applicants.includes(activeEmployee?.id)
                    return (
                      <div key={shift.id}
                        style={{ ...S.calShift, borderLeft:`3px solid ${cat.color}`, background:isAssigned?'#EDF7F0':'#FFFDF8' }}
                        onClick={e => { e.stopPropagation(); setCalDayDetail({shift}) }}>
                        <div style={{ fontSize:10, fontWeight:700, color:cat.color, marginBottom:1 }}>{cat.icon} {shift.label}</div>
                        <div style={{ fontSize:10, color:'#888' }}>{shift.time}</div>
                        {room && <div style={{ fontSize:9, color:'#6B8FB5', marginTop:1 }}>{room.icon} {room.name}</div>}
                        {isAssigned && <div style={{ fontSize:9, color:'#2A9D6E', fontWeight:700, marginTop:1 }}>✓</div>}
                        {!isAssigned && calIsChef && shift.applicants.length>0 && <div style={{ fontSize:9, color:'#C8960A', marginTop:1 }}>👤{shift.applicants.length}</div>}
                        {!calIsChef && hasApp && !isAssigned && <div style={{ fontSize:9, color:'#2A9D6E', fontWeight:700, marginTop:1 }}>✓</div>}
                      </div>
                    )
                  })
                }
              </div>
            )
          })}
        </div>

        {calDayDetail && (
          <div style={S.overlay} onClick={() => { setCalDayDetail(null); setEditingRoomSid(null) }}>
            <div style={S.modal} onClick={e=>e.stopPropagation()}>
              <div style={S.modalHandle} />
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <h3 style={{ ...S.modalTitle, marginBottom:0 }}>{fmtLong(calDayDetail.shift.date)}</h3>
                <button style={S.deleteBtn} onClick={() => { setCalDayDetail(null); setEditingRoomSid(null) }}>✕</button>
              </div>
              <ShiftCard shift={calDayDetail.shift} cardIsChef={calIsChef} isEmployee={!calIsChef} />
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ═══════════ NOTIFICATION PANEL ═══════════ */
  const NotifPanel = () => (
    <div style={S.notifPanel} onClick={e=>e.stopPropagation()}>
      <div style={S.notifPanelHdr}>
        <span style={S.notifPanelTitle}>🔔 Benachrichtigungen</span>
        <div style={{ display:'flex', gap:8 }}>
          {unreadCount>0 && <button style={S.notifMarkAll} onClick={()=>db.markAllRead(currentRecipient)}>Alle gelesen</button>}
          <button style={{ ...S.notifMarkAll, color:'#bbb' }} onClick={()=>setShowNotifs(false)}>✕</button>
        </div>
      </div>
      {myNotifs.length===0 && <div style={S.notifEmpty}>Keine Benachrichtigungen</div>}
      <div style={S.notifList}>
        {myNotifs.map(n => (
          <div key={n.id} style={{ ...S.notifItem, background:n.read?'#FFFDF8':'#FFF8EC' }}>
            <div style={{ ...S.notifDot, background:n.read?'#ddd':notifColor(n.type) }} />
            <div style={S.notifBody}>
              <div style={S.notifIcon}>{notifIcon(n.type)}</div>
              <div style={S.notifText}>{n.text}</div>
              <div style={S.notifTime}>{fmtTime(n.ts)}</div>
            </div>
            <button style={S.notifDismiss} onClick={()=>db.clearNotif(n.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )

  /* ═══════════ ACCOUNTS TAB ═══════════ */
  const AccountsTab = () => {
    const chefAccs = db.accounts.filter(a=>a.role==='chef')
    const empAccs  = db.accounts.filter(a=>a.role==='employee')
    const AccRow = ({ acc }) => {
      const emp  = db.employees.find(e=>e.id===acc.employeeId)
      const cats = emp?.categories || []
      return (
        <div style={S.accRow}>
          <div style={{ ...S.accAvatar, background:'#C8960A33', color:'#C8960A' }}>{mkInitials(acc.name)}</div>
          <div style={S.accInfo}>
            <div style={S.accName}>{acc.name}</div>
            <div style={S.accRole}>
              {cats.map(c => { const cat=CATEGORIES[c]; return cat ? <span key={c} style={{ ...S.catBadge, background:cat.color+'22', color:cat.color }}>{cat.icon}</span> : null })}
              {!cats.length && <span>{acc.role==='chef'?'Chef':'—'}</span>}
              {acc.email && <span style={{ color:'#6B8FB5', fontSize:11 }}>· {acc.email}</span>}
            </div>
          </div>
          <button style={S.accEditBtn} onClick={()=>{ setEditAccount({...acc, _empCats: emp?.categories || []}); setAccError('') }}>✏️</button>
          <button style={S.accDeleteBtn} onClick={async()=>{
            try { await db.deleteAccount(acc, db.accounts); showToast('Account gelöscht') }
            catch(e) { showToast(e.message) }
          }}>✕</button>
        </div>
      )
    }
    return (
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h2 style={S.sectionTitle}>Account-Verwaltung</h2>
          <button style={S.addBtn} onClick={()=>{ setNewAccForm({name:'',password:'',email:'',role:'employee',categories:['service']}); setAccError(''); setShowAddAccount(true) }}>+ Account</button>
        </div>
        <div style={S.accSection}>
          <div style={S.accSectionTitle}>👨‍🍳 Chef-Accounts</div>
          {chefAccs.map(a=><AccRow key={a.id} acc={a} />)}
        </div>
        <div style={{ ...S.accSection, marginTop:16 }}>
          <div style={S.accSectionTitle}>👤 Mitarbeiter-Accounts</div>
          {empAccs.length===0 && <div style={S.noApplicants}>Noch keine Mitarbeiter-Accounts.</div>}
          {empAccs.map(a=><AccRow key={a.id} acc={a} />)}
        </div>
      </div>
    )
  }

  /* ═══════════ BULK SHIFT MODAL (neue Version mit individuellen Zeiten) ═══════════ */
  const BulkShiftModal = () => {
    const [date,      setDate]      = useState('')
    const [template,  setTemplate]  = useState('ala_carte')
    const [customLabel,setCustomLabel] = useState('')
    const [room,      setRoom]      = useState('')
    // slots: array of { cat, time }
    const [slots, setSlots] = useState([])

    const selectedTmpl = SHIFT_TEMPLATES.find(t => t.id === template) || SHIFT_TEMPLATES[0]
    const defaultTime  = selectedTmpl.defaultTime || '17:00 – 23:00'

    const addSlot = (cat) => {
      setSlots(s => [...s, { id: Date.now() + Math.random(), cat, time: defaultTime }])
    }
    const removeSlot = (id) => setSlots(s => s.filter(x => x.id !== id))
    const updateTime = (id, time) => setSlots(s => s.map(x => x.id === id ? { ...x, time } : x))

    // counts per category for display
    const counts = Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, slots.filter(s => s.cat === k).length]))

    const handleSubmit = async () => {
      if (!date)          { showToast('Bitte Datum auswählen'); return }
      if (slots.length===0) { showToast('Mindestens 1 Person auswählen'); return }
      const label = template === 'custom' ? (customLabel || 'Schicht') : selectedTmpl.label
      const shifts = slots.map(s => ({ date, label, time: s.time, category: s.cat, room }))
      await db.addShiftsBulk(shifts, db.employees)
      setShowBulkShift(false)
      showToast(`${shifts.length} Schicht${shifts.length > 1 ? 'en' : ''} erstellt ✓`)
    }

    return (
      <div style={S.overlay} onClick={() => setShowBulkShift(false)}>
        <div style={{ ...S.modal, maxHeight:'92vh' }} onClick={e => e.stopPropagation()}>
          <div style={S.modalHandle}/>
          <h3 style={S.modalTitle}>+ Schichten anlegen</h3>

          {/* Basis-Felder */}
          <label style={S.label}>Datum</label>
          <input style={S.input} type="date" value={date} onChange={e => setDate(e.target.value)} />

          <label style={S.label}>Vorlage</label>
          <select style={S.select} value={template}
            onChange={e => { setTemplate(e.target.value) }}>
            {SHIFT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          </select>

          {template === 'custom' && (
            <>
              <label style={S.label}>Bezeichnung</label>
              <input style={S.input} placeholder="z.B. Firmenfeier" value={customLabel} onChange={e => setCustomLabel(e.target.value)} />
            </>
          )}

          <label style={S.label}>Raum (optional)</label>
          <select style={S.select} value={room} onChange={e => setRoom(e.target.value)}>
            <option value="">— Kein Raum</option>
            {db.rooms.map(r => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
          </select>

          {/* Personenauswahl */}
          <label style={S.label}>Benötigte Personen</label>
          {Object.entries(CATEGORIES).map(([cat, val]) => (
            <div key={cat} style={S.counterRow}>
              <span style={{ ...S.counterLabel, color: val.color }}>{val.icon} {val.label}</span>
              <div style={S.counterBtns}>
                <button style={S.counterBtn} onClick={() => {
                  // remove last slot of this cat
                  const idx = [...slots].reverse().findIndex(s => s.cat === cat)
                  if (idx >= 0) removeSlot([...slots].reverse()[idx].id)
                }}>−</button>
                <span style={S.counterVal}>{counts[cat]}</span>
                <button style={S.counterBtn} onClick={() => addSlot(cat)}>+</button>
              </div>
            </div>
          ))}

          {/* Individuelle Uhrzeiten */}
          {slots.length > 0 && (
            <>
              <label style={{ ...S.label, marginTop: 16 }}>Individuelle Uhrzeiten</label>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {slots.map((slot, i) => {
                  const cat = CATEGORIES[slot.cat]
                  return (
                    <div key={slot.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'#F5F3EE', borderRadius:8 }}>
                      <span style={{ ...S.catBadge, background: cat.color+'22', color: cat.color, flexShrink:0 }}>{cat.icon} {cat.label}</span>
                      <span style={{ fontSize:12, color:'#aaa', flexShrink:0 }}>#{slots.filter(s => s.cat === slot.cat && slots.indexOf(s) <= i).length}</span>
                      <input
                        style={{ ...S.input, flex:1, padding:'7px 10px', fontSize:13 }}
                        placeholder="z.B. 17:00 – 23:00"
                        value={slot.time}
                        onChange={e => updateTime(slot.id, e.target.value)}
                      />
                      <button style={{ ...S.deleteBtn, color:'#CC7B7B', fontSize:16 }} onClick={() => removeSlot(slot.id)}>✕</button>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          <div style={{ fontSize:12, color:'#aaa', textAlign:'center', marginTop:8 }}>
            {slots.length > 0 ? `${slots.length} Schicht${slots.length > 1 ? 'en' : ''} werden erstellt` : 'Noch keine Personen ausgewählt'}
          </div>

          <div style={S.modalActions}>
            <button style={S.cancelBtn} onClick={() => setShowBulkShift(false)}>Abbrechen</button>
            <button style={{ ...S.confirmBtn, opacity: slots.length === 0 ? 0.5 : 1 }} onClick={handleSubmit}>Erstellen</button>
          </div>
        </div>
      </div>
    )
  }

  /* ═══════════ EDIT SHIFT MODAL ═══════════ */
  const EditShiftModal = () => {
    if (!editShift) return null
    const [form, setForm] = useState(editShift)
    return (
      <div style={S.overlay} onClick={()=>setEditShift(null)}>
        <div style={S.modal} onClick={e=>e.stopPropagation()}>
          <div style={S.modalHandle}/>
          <h3 style={S.modalTitle}>✏️ Schicht bearbeiten</h3>
          <label style={S.label}>Datum</label>
          <input style={S.input} type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} />
          <label style={S.label}>Bezeichnung</label>
          <input style={S.input} value={form.label} onChange={e=>setForm({...form,label:e.target.value})} />
          <label style={S.label}>Uhrzeit</label>
          <input style={S.input} value={form.time} onChange={e=>setForm({...form,time:e.target.value})} />
          <label style={S.label}>Kategorie</label>
          <CatPills value={form.category} onChange={v=>setForm({...form,category:v})} />
          <label style={S.label}>Raum</label>
          <select style={S.select} value={form.room||''} onChange={e=>setForm({...form,room:e.target.value})}>
            <option value="">— Kein Raum</option>
            {db.rooms.map(r=><option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
          </select>
          <label style={S.label}>Eingeteilt</label>
          <select style={S.select} value={form.assigned||''} onChange={e=>setForm({...form,assigned:e.target.value?Number(e.target.value):null})}>
            <option value="">— Niemand</option>
            {db.employees.filter(e=>(e.categories||[]).includes(form.category)).map(e=>(
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <div style={S.modalActions}>
            <button style={S.cancelBtn} onClick={()=>setEditShift(null)}>Abbrechen</button>
            <button style={S.confirmBtn} onClick={async()=>{ await db.updateShift(form.id,form); setEditShift(null); showToast('Schicht gespeichert ✓') }}>Speichern</button>
          </div>
        </div>
      </div>
    )
  }

  /* ═══════════ EDIT ACCOUNT MODAL ═══════════ */
  const EditAccountModal = () => {
    if (!editAccount) return null
    const [name,     setName]     = useState(editAccount.name)
    const [email,    setEmail]    = useState(editAccount.email || '')
    const [newPw,    setNewPw]    = useState('')
    const [cats,     setCats]     = useState(editAccount._empCats || ['service'])

    return (
      <div style={S.overlay} onClick={()=>setEditAccount(null)}>
        <div style={S.modal} onClick={e=>e.stopPropagation()}>
          <div style={S.modalHandle}/>
          <h3 style={S.modalTitle}>✏️ Account bearbeiten</h3>
          <label style={S.label}>Name</label>
          <Input value={name} onChange={setName} placeholder="Name" />
          <label style={S.label}>E-Mail</label>
          <Input value={email} onChange={setEmail} type="email" placeholder="email@restaurant.de" />
          <label style={S.label}>Neues Passwort (leer lassen = unverändert)</label>
          <Input value={newPw} onChange={setNewPw} type="password" placeholder="Nur ausfüllen wenn ändern" />
          {editAccount.role==='employee' && (
            <>
              <label style={S.label}>Positionen (mehrere möglich)</label>
              <CatPills value={cats} onChange={setCats} multi />
            </>
          )}
          {accError && <div style={S.accErrorBox}>{accError}</div>}
          <div style={S.modalActions}>
            <button style={S.cancelBtn} onClick={()=>setEditAccount(null)}>Abbrechen</button>
            <button style={S.confirmBtn} onClick={async()=>{
              try {
                await db.updateAccount(editAccount, { name, email, newPassword:newPw, categories:cats }, db.accounts)
                setEditAccount(null); showToast('Account aktualisiert ✓')
              } catch(e) { setAccError(e.message) }
            }}>Speichern</button>
          </div>
        </div>
      </div>
    )
  }

  /* ═══════════ MAIN RENDER ═══════════ */
  return (
    <div style={S.root} onClick={()=>{ if(showNotifs) setShowNotifs(false) }}>
      <div style={S.bgPattern}/>
      {toast && <div style={S.toast}>{toast}</div>}

      {/* HEADER */}
      <header style={S.header}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:24 }}>🍴</span>
          <div>
            <div style={S.logoTitle}>SCHICHT<span style={{ color:'#C8960A' }}>PLAN</span></div>
            <div style={S.logoSub}>Restaurant Manager</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={S.userBadge}>
            <div style={{ ...S.userAvatar, background:isChef?'#C8960A33':'#2A9D8F33', color:isChef?'#C8960A':'#2A9D8F' }}>
              {mkInitials(currentAccount.name)}
            </div>
            <div>
              <div style={S.userName}>{currentAccount.name}</div>
              <div style={S.userRole}>{isChef?'👨‍🍳 Chef':'👤 Mitarbeiter'}</div>
            </div>
          </div>
          <div style={{ position:'relative' }}>
            <button style={S.bellBtn} onClick={e=>{ e.stopPropagation(); setShowNotifs(v=>!v); if(!showNotifs) db.markAllRead(currentRecipient) }}>
              🔔{unreadCount>0&&<span style={S.bellBadge}>{unreadCount>9?'9+':unreadCount}</span>}
            </button>
            {showNotifs && <NotifPanel/>}
          </div>
          <button style={S.logoutBtn} onClick={()=>{ setCurrentAccount(null); setShowNotifs(false) }}>↩</button>
        </div>
      </header>

      {/* STATS */}
      {isChef && <div style={S.statsBar}>
        {Object.entries(CATEGORIES).map(([key,val])=>(
          <div key={key} style={S.statCard}>
            <span style={{ fontSize:16 }}>{val.icon}</span>
            <div>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:1, textTransform:'uppercase', color:val.color }}>{val.label}</div>
              <div style={S.statNum}>{db.employees.filter(e=>(e.categories||[]).includes(key)).length}</div>
            </div>
            <div style={S.statChip}>{db.shifts.filter(s=>s.category===key&&!s.assigned&&s.date>=today).length}</div>
          </div>
        ))}
      </div>}

      <div style={S.main}>

        {/* ════ CHEF ════ */}
        {isChef && (
          <div style={S.content}>
            <div style={S.tabBar}>
              <button style={chefSubTab==='schichten'?S.tabActive:S.tab} onClick={()=>setChefSubTab('schichten')}>📋 Schichten</button>
              <button style={chefSubTab==='accounts' ?S.tabActive:S.tab} onClick={()=>setChefSubTab('accounts')}>🔑 Accounts</button>
            </div>

            {chefSubTab==='schichten' && (
              <>
                <div style={{ ...S.tabBar, borderBottom:'1px dashed #E0DBD0', marginBottom:14 }}>
                  <button style={chefTab==='liste'    ?S.tabActive2:S.tab2} onClick={()=>setChefTab('liste')}>📋 Liste</button>
                  <button style={chefTab==='kalender' ?S.tabActive2:S.tab2} onClick={()=>setChefTab('kalender')}>📅 Kalender</button>
                </div>

                {chefTab==='liste' && (
                  <>
                    <div style={S.sectionHeader}>
                      <div>
                        <h2 style={S.sectionTitle}>Schichten</h2>
                        <div style={S.filterRow}>
                          <button style={filterCat==='all'?S.filterActive:S.filterBtn} onClick={()=>setFilterCat('all')}>Alle</button>
                          {Object.entries(CATEGORIES).map(([k,v])=>(
                            <button key={k} style={filterCat===k?S.filterActive:S.filterBtn} onClick={()=>setFilterCat(k)}>{v.icon} {v.label}</button>
                          ))}
                        </div>
                        <div style={{ ...S.filterRow, marginTop:6 }}>
                          <button style={filterRoom==='all'?S.filterActive:S.filterBtn} onClick={()=>setFilterRoom('all')}>🏢 Alle</button>
                          {db.rooms.map(r=><button key={r.id} style={filterRoom===r.id?S.filterActive:S.filterBtn} onClick={()=>setFilterRoom(r.id)}>{r.icon} {r.name}</button>)}
                          <button style={showOnlyFuture?S.filterActive:S.filterBtn} onClick={()=>setShowOnlyFuture(v=>!v)}>
                            {showOnlyFuture?'📅 Nur zukünftige':'📅 Alle Daten'}
                          </button>
                        </div>
                      </div>
                      <div style={S.actionBtns}>
                        <button style={S.addBtn} onClick={()=>setShowBulkShift(true)}>+ Schichten</button>
                        <button style={{ ...S.addBtn, background:'#6B8FB5' }} onClick={()=>setShowManageRooms(true)}>🏢 Räume</button>
                      </div>
                    </div>

                    {/* Grouped by date */}
                    {groupedShifts.length===0 && <div style={S.empty}>Keine Schichten gefunden.</div>}
                    {groupedShifts.map(([date, shifts]) => {
                      const unavailOnDay = db.unavailable.filter(u => u.date === date)
                      return (
                        <div key={date} style={S.dayGroup}>
                          <div style={S.dayGroupHeader}>
                            <span style={S.dayGroupDate}>{fmtLong(date)}</span>
                            <span style={S.dayGroupCount}>{shifts.length} Schicht{shifts.length>1?'en':''}</span>
                            {unavailOnDay.length>0 && (
                              <span style={S.dayGroupUnavail}>
                                ⚠️ {unavailOnDay.map(u => getEmp(u.employeeId)?.name).filter(Boolean).join(', ')} abwesend
                              </span>
                            )}
                          </div>
                          <div style={S.shiftGrid}>
                            {shifts.map(s=><ShiftCard key={s.id} shift={s} cardIsChef />)}
                          </div>
                        </div>
                      )
                    })}

                    <h2 style={{ ...S.sectionTitle, marginTop:24 }}>Team ({db.employees.length})</h2>
                    <div style={S.empGrid}>
                      {db.employees.map(emp=>{
                        const primCat = CATEGORIES[emp.categories?.[0]] || CATEGORIES.service
                        const nots = db.notifications.filter(n=>n.recipientId===emp.id&&!n.read).length
                        return (
                          <div key={emp.id} style={S.empCard}>
                            <div style={{ position:'relative' }}>
                              <div style={{ ...S.empAvatarLg, background:primCat.color+'33', color:primCat.color }}>{emp.avatar}</div>
                              {nots>0&&<span style={S.empNotifDot}>{nots}</span>}
                            </div>
                            <div style={S.empName}>{emp.name}</div>
                            <div style={S.empCatBadges}>
                              {(emp.categories||[]).map(c=>{ const cat=CATEGORIES[c]; return cat?<span key={c} style={{ ...S.catBadge, fontSize:10, background:cat.color+'22', color:cat.color }}>{cat.icon}</span>:null })}
                            </div>
                            <div style={{ fontSize:10, color:'#aaa' }}>{db.shifts.filter(s=>s.assigned===emp.id&&s.date>=today).length} Schicht(en)</div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                {chefTab==='kalender'&&<Calendar monday={calChef} setMonday={setCalChef} calIsChef />}
              </>
            )}
            {chefSubTab==='accounts'&&<AccountsTab/>}
          </div>
        )}

        {/* ════ MITARBEITER ════ */}
        {!isChef && activeEmployee && (
          <div style={S.content}>
            <div style={S.tabBar}>
              <button style={mitTab==='liste'    ?S.tabActive:S.tab} onClick={()=>setMitTab('liste')}>📋 Liste</button>
              <button style={mitTab==='kalender' ?S.tabActive:S.tab} onClick={()=>setMitTab('kalender')}>📅 Kalender</button>
              <button style={mitTab==='konto'    ?S.tabActive:S.tab} onClick={()=>setMitTab('konto')}>👤 Mein Konto</button>
            </div>

            {(() => {
              const available = db.shifts.filter(s => empCategories.includes(s.category) && s.date >= today)
              const applied   = available.filter(s => s.applicants.includes(activeEmployee.id))
              const assigned  = db.shifts.filter(s => s.assigned === activeEmployee.id)
              const primCat   = CATEGORIES[empCategories[0]] || CATEGORIES.service

              return (
                <>
                  <div style={S.profileBanner}>
                    <div style={{ ...S.empAvatarLg, background:primCat.color+'44', color:primCat.color, fontSize:20 }}>{activeEmployee.avatar}</div>
                    <div>
                      <div style={S.profileName}>{activeEmployee.name}</div>
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:4 }}>
                        {empCategories.map(c=>{ const cat=CATEGORIES[c]; return cat?<span key={c} style={{ ...S.catBadge, background:cat.color+'22', color:cat.color }}>{cat.icon} {cat.label}</span>:null })}
                      </div>
                    </div>
                    <div style={{ marginLeft:'auto', display:'flex', gap:16 }}>
                      {[{n:applied.length,l:'Beworben'},{n:assigned.length,l:'Eingeteilt'}].map(({n,l})=>(
                        <div key={l} style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                          <span style={{ fontSize:22, fontWeight:700, color:'#C8960A' }}>{n}</span>
                          <span style={{ fontSize:10, color:'#aaa' }}>{l}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {mitTab==='liste' && (
                    <>
                      {assigned.length>0&&(
                        <>
                          <h3 style={S.subTitle}>✅ Meine Schichten</h3>
                          <div style={S.shiftGrid}>{assigned.map(s=><ShiftCard key={s.id} shift={s} isEmployee />)}</div>
                        </>
                      )}
                      <h3 style={S.subTitle}>📋 Offene Schichten</h3>
                      <div style={S.shiftGrid}>
                        {available.filter(s=>!s.assigned).length===0 && <div style={S.empty}>Keine offenen Schichten.</div>}
                        {available.filter(s=>!s.assigned).map(s=><ShiftCard key={s.id} shift={s} isEmployee />)}
                      </div>
                    </>
                  )}
                  {mitTab==='kalender'&&<Calendar monday={calMit} setMonday={setCalMit} calIsChef={false} />}

                  {mitTab==='konto' && <MeinKontoTab />}
                </>
              )
            })()}
          </div>
        )}
      </div>

      {/* MODALS */}
      {showBulkShift  && <BulkShiftModal/>}
      {editShift      && <EditShiftModal/>}
      {editAccount    && <EditAccountModal/>}
      {assignShift    && <AssignShiftModal/>}

      {/* Räume Modal */}
      {showManageRooms && (
        <div style={S.overlay} onClick={()=>setShowManageRooms(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHandle}/>
            <h3 style={S.modalTitle}>🏢 Räume verwalten</h3>

            {/* Feste Standard-Räume */}
            <label style={S.label}>Standard-Räume hinzufügen</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
              {[
                { name:'Außentheke', icon:'🍺' },
                { name:'Garderobe',  icon:'🧥' },
                { name:'Wertmarken', icon:'🎟️' },
              ].map(preset => {
                const exists = db.rooms.some(r => r.name === preset.name)
                return (
                  <button key={preset.name}
                    style={{ ...S.catBtn, ...(exists ? { opacity:0.4, cursor:'default' } : { borderColor:'#C8960A', color:'#C8960A', background:'#FFF8EC' }) }}
                    disabled={exists}
                    onClick={async () => {
                      if (exists) return
                      await db.addRoom(preset.name, preset.icon)
                      showToast(`${preset.name} hinzugefügt ✓`)
                    }}>
                    {preset.icon} {preset.name} {exists ? '✓' : '+'}
                  </button>
                )
              })}
            </div>

            {/* Bestehende Räume */}
            <label style={S.label}>Aktive Räume</label>
            <div style={{ marginBottom:14 }}>
              {db.rooms.length===0 && <div style={{ fontSize:13,color:'#bbb',fontStyle:'italic' }}>Noch keine Räume.</div>}
              {db.rooms.map((room,i)=>(
                <div key={room.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:i%2===0?'#F5F3EE':'#FFFDF8',borderRadius:8,marginBottom:4 }}>
                  <span style={{ fontSize:18 }}>{room.icon}</span>
                  <span style={{ flex:1,fontSize:14,fontWeight:600 }}>{room.name}</span>
                  <span style={{ fontSize:11,color:'#aaa' }}>{db.shifts.filter(s=>s.room===room.id).length}x</span>
                  <button style={{ ...S.deleteBtn,color:'#CC7B7B',fontSize:15 }} onClick={async()=>{ await db.deleteRoom(room.id); showToast('Raum gelöscht') }}>✕</button>
                </div>
              ))}
            </div>

            {/* Individueller Raum */}
            <div style={{ borderTop:'1px solid #E0DBD0',paddingTop:12 }}>
              <label style={S.label}>Individueller Raum</label>
              <div style={{ display:'flex',gap:8,marginBottom:8 }}>
                <Input value={newRoomIcon} onChange={setNewRoomIcon} style={{ width:60,textAlign:'center',fontSize:20,padding:'8px 4px' }} />
                <Input value={newRoomName} onChange={setNewRoomName} placeholder="z.B. Wintergarten" style={{ flex:1 }} />
              </div>
              <button style={{ ...S.confirmBtn,width:'100%' }} onClick={async()=>{
                if(!newRoomName.trim()) return
                await db.addRoom(newRoomName,newRoomIcon); setNewRoomName(''); setNewRoomIcon('🏠'); showToast('Raum hinzugefügt ✓')
              }}>Raum hinzufügen</button>
            </div>
            <div style={S.modalActions}>
              <button style={{ ...S.cancelBtn,flex:'unset',width:'100%' }} onClick={()=>setShowManageRooms(false)}>Schließen</button>
            </div>
          </div>
        </div>
      )}

      {/* Account erstellen Modal */}
      {showAddAccount && (
        <div style={S.overlay} onClick={()=>setShowAddAccount(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHandle}/>
            <h3 style={S.modalTitle}>🔑 Account erstellen</h3>
            <label style={S.label}>Name</label>
            <Input value={newAccForm.name} onChange={v=>setNewAccForm(f=>({...f,name:v}))} placeholder="Vor- und Nachname" />
            <label style={S.label}>E-Mail</label>
            <Input value={newAccForm.email} onChange={v=>setNewAccForm(f=>({...f,email:v}))} type="email" placeholder="mitarbeiter@restaurant.de" />
            <label style={S.label}>Passwort</label>
            <Input value={newAccForm.password} onChange={v=>setNewAccForm(f=>({...f,password:v}))} type="password" placeholder="Mindestens 4 Zeichen" />
            <label style={S.label}>Rolle</label>
            <div style={S.catSelect}>
              {[{v:'employee',l:'👤 Mitarbeiter'},{v:'chef',l:'👨‍🍳 Chef'}].map(({v,l})=>(
                <button key={v} style={newAccForm.role===v?{...S.catBtn,background:'#C8960A33',border:'1px solid #C8960A',color:'#C8960A'}:S.catBtn}
                  onClick={()=>setNewAccForm(f=>({...f,role:v}))}>
                  {l}
                </button>
              ))}
            </div>
            {newAccForm.role==='employee'&&(
              <>
                <label style={S.label}>Positionen (mehrere möglich)</label>
                <CatPills value={newAccForm.categories} onChange={v=>setNewAccForm(f=>({...f,categories:v}))} multi />
              </>
            )}
            {accError&&<div style={S.accErrorBox}>{accError}</div>}
            <div style={S.modalActions}>
              <button style={S.cancelBtn} onClick={()=>setShowAddAccount(false)}>Abbrechen</button>
              <button style={S.confirmBtn} onClick={async()=>{
                try { await db.addAccount(newAccForm); setShowAddAccount(false); showToast('Account erstellt ✓') }
                catch(e) { setAccError(e.message) }
              }}>Erstellen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
