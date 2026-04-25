import { useState, useRef } from 'react'
import LoginScreen from './LoginScreen'
import useData from './useData'
import { S } from './styles'
import { CATEGORIES, CHEF_ID, WD, SHIFT_TEMPLATES, getMonday, addDays, toDS, fmtLong, fmtShort, fmtTime, mkInitials } from './constants'

const notifIcon  = t => ({ application:'📬', assigned:'🎉', new_shift:'📋' }[t] || '🔔')
const notifColor = t => ({ application:'#C8960A', assigned:'#2A9D6E', new_shift:'#6B8FB5' }[t] || '#888')

/* ─── tiny helpers ─── */
const CatPills = ({ value, onChange }) => (
  <div style={S.catSelect}>
    {Object.entries(CATEGORIES).map(([k, v]) => (
      <button key={k} style={value === k ? { ...S.catBtn, background: v.color+'33', border:`1px solid ${v.color}`, color: v.color } : S.catBtn}
        onClick={() => onChange(k)}>{v.icon} {v.label}</button>
    ))}
  </div>
)

export default function App() {
  const [currentAccount, setCurrentAccount] = useState(null)
  const db = useData()

  /* ui */
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

  /* modals */
  const [showBulkShift,   setShowBulkShift]   = useState(false)
  const [showManageRooms, setShowManageRooms] = useState(false)
  const [showAddAccount,  setShowAddAccount]  = useState(false)
  const [editAccount,     setEditAccount]     = useState(null)
  const [editShift,       setEditShift]       = useState(null)  // shift being edited

  /* forms */
  const [bulkForm, setBulkForm] = useState({
    date: '', template: 'ala_carte', customLabel: '', time: '17:00 – 23:00', room: '',
    counts: { theke: 0, service: 0, runner: 0 },
  })
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomIcon, setNewRoomIcon] = useState('🏠')
  const [newAccForm,  setNewAccForm]  = useState({ name:'', password:'', role:'employee', category:'service' })
  const [accError,    setAccError]    = useState('')
  const [toast, setToast] = useState(null)

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  /* derived */
  const isChef         = currentAccount?.role === 'chef'
  const activeEmployee = db.employees.find(e => e.id === currentAccount?.employeeId)
  const currentRecipient = isChef ? CHEF_ID : currentAccount?.employeeId
  const myNotifs    = db.notifications.filter(n => n.recipientId === currentRecipient)
  const unreadCount = myNotifs.filter(n => !n.read).length
  const getRoom = id => db.rooms.find(r => r.id === id)
  const getEmp  = id => db.employees.find(e => e.id === id)

  const filtered = db.shifts.filter(s =>
    (filterCat  === 'all' || s.category === filterCat) &&
    (filterRoom === 'all' || s.room     === filterRoom)
  )

  /* ── PDF EXPORT ── */
  const exportPDF = () => {
    const week = Array.from({ length:7 }, (_,i) => addDays(calChef, i))
    const rows = week.map(day => {
      const ds = toDS(day)
      const dayShifts = db.shifts.filter(s => s.date === ds)
      return `<tr>
        <td style="padding:8px;border:1px solid #ddd;font-weight:bold">${day.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'})}</td>
        <td style="padding:8px;border:1px solid #ddd">${dayShifts.map(s => {
          const cat = CATEGORIES[s.category]
          const emp = s.assigned ? getEmp(s.assigned)?.name : '—'
          return `${cat.icon} ${s.label} (${s.time}) · ${cat.label}${emp !== '—' ? ` · ${emp}` : ''}`
        }).join('<br>') || '—'}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Schichtplan</title>
    <style>body{font-family:Georgia,serif;padding:20px}h1{color:#C8960A}table{width:100%;border-collapse:collapse}td{vertical-align:top}</style>
    </head><body>
    <h1>🍴 SchichtPlan</h1>
    <p>Woche: ${week[0].toLocaleDateString('de-DE',{day:'2-digit',month:'long'})} – ${week[6].toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})}</p>
    <table>${rows}</table></body></html>`

    const blob = new Blob([html], { type:'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'schichtplan.html'; a.click()
    URL.revokeObjectURL(url)
    showToast('Wochenplan exportiert ✓')
  }

  /* loading / error */
  if (db.loading) return <div style={S.spinner}><div style={S.spinnerIcon}>🍴</div><div style={S.spinnerText}>Wird geladen…</div></div>
  if (db.error)   return <div style={S.spinner}><div style={{fontSize:36}}>⚠️</div><div style={{fontSize:16,fontWeight:700}}>Verbindungsfehler</div><div style={{fontSize:13,color:'#aaa',maxWidth:320,textAlign:'center'}}>{db.error}</div></div>
  if (!currentAccount) return <LoginScreen onLogin={async (name, pw) => setCurrentAccount(await db.login(name, pw))} />

  /* ═════════════════════════════════════════
     SHIFT CARD
  ═════════════════════════════════════════ */
  const ShiftCard = ({ shift, cardIsChef=false, isEmployee=false }) => {
    const live       = db.shifts.find(s => s.id === shift.id) || shift
    const cat        = CATEGORIES[live.category]
    const assignedEm = live.assigned ? getEmp(live.assigned) : null
    const room       = getRoom(live.room)
    const hasApplied = live.applicants.includes(activeEmployee?.id)
    const editing    = editingRoomSid === live.id
    const tmpl       = SHIFT_TEMPLATES.find(t => t.label === live.label)

    return (
      <div style={{ ...S.shiftCard, borderTop:`3px solid ${cat.color}` }}>
        <div style={S.shiftCardTop}>
          <div style={S.shiftMeta}>
            <span style={{ ...S.catBadge, background:cat.color+'22', color:cat.color }}>{cat.icon} {cat.label}</span>
            <span style={S.shiftDateSm}>{fmtShort(live.date)}</span>
          </div>
          {cardIsChef && (
            <div style={{ display:'flex', gap:4 }}>
              <button style={{ ...S.editRoomBtn, fontSize:13 }} title="Bearbeiten" onClick={() => setEditShift({ ...live })}>✏️</button>
              <button style={S.deleteBtn} onClick={async () => { await db.deleteShift(live.id); showToast('Schicht gelöscht') }}>✕</button>
            </div>
          )}
        </div>

        {tmpl && tmpl.id !== 'custom' && <div style={S.templateBadge}>{tmpl.icon} {tmpl.label}</div>}
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
              <div style={S.applicantsLabel}>Bewerber ({live.applicants.length})</div>
              {live.applicants.length===0 && <div style={S.noApplicants}>Noch keine Bewerbungen</div>}
              {live.applicants.map(eid => {
                const emp=getEmp(eid); if(!emp) return null
                const ec=CATEGORIES[emp.category]
                return (
                  <div key={eid} style={S.applicantRow}>
                    <div style={{ ...S.empAvatar, background:ec.color+'33', color:ec.color }}>{emp.avatar}</div>
                    <div style={S.applicantInfo}>
                      <div style={S.applicantName}>{emp.name}</div>
                      <span style={{ ...S.catBadge, fontSize:10, background:ec.color+'22', color:ec.color }}>{ec.icon} {ec.label}</span>
                    </div>
                    <button style={{ ...S.assignBtn, borderColor:cat.color, color:cat.color }}
                      onClick={async () => { await db.assignEmployee(live.id,eid,live); showToast('Mitarbeiter eingeteilt ✓') }}>
                      Einteilen
                    </button>
                  </div>
                )
              })}
            </div>
          )
        )}

        {isEmployee && !editing && (
          <>
            <div style={S.applicantsCount}>👥 {live.applicants.length} Bewerber</div>
            {live.assigned
              ? <div style={{ ...S.assignedBadge, padding:'8px', textAlign:'center', borderRadius:8 }}>✓ Besetzt</div>
              : hasApplied
                ? <button style={S.withdrawBtn} onClick={async () => { await db.withdrawApplication(live.id,live,activeEmployee.id); showToast('Bewerbung zurückgezogen') }}>Bewerbung zurückziehen</button>
                : <button style={{ ...S.applyBtn, background:cat.color }} onClick={async () => { await db.applyForShift(live.id,live,activeEmployee); showToast('Bewerbung eingereicht ✓') }}>Bewerben</button>
            }
          </>
        )}
      </div>
    )
  }

  /* ═════════════════════════════════════════
     CALENDAR
  ═════════════════════════════════════════ */
  const Calendar = ({ monday, setMonday, calIsChef }) => {
    const days  = Array.from({ length:7 }, (_,i) => addDays(monday,i))
    const today = toDS(new Date())
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
            <button style={{ ...S.addBtn, background:'#888', fontSize:12, padding:'6px 14px' }} onClick={exportPDF}>📄 Wochenplan exportieren</button>
          </div>
        )}
        <div style={S.calGrid}>
          {days.map((day,i) => {
            const ds=toDS(day)
            const dayShifts = calIsChef ? db.shifts.filter(s=>s.date===ds) : db.shifts.filter(s=>s.date===ds&&s.category===activeEmployee?.category)
            const isToday=ds===today
            return (
              <div key={ds} style={{ ...S.calDay, ...(isToday?S.calDayToday:{}) }}>
                <div style={{ ...S.calDayHdr, ...(isToday?{color:'#C8960A'}:{}) }}>
                  <span style={S.calDayName}>{WD[i]}</span>
                  <span style={S.calDayNum}>{day.getDate()}</span>
                </div>
                {dayShifts.length===0
                  ? <div style={S.calEmpty}>–</div>
                  : dayShifts.map(shift => {
                    const cat=CATEGORIES[shift.category], room=getRoom(shift.room)
                    const isAssigned=!!shift.assigned, hasApp=shift.applicants.includes(activeEmployee?.id)
                    return (
                      <div key={shift.id} style={{ ...S.calShift, borderLeft:`3px solid ${cat.color}`, background:isAssigned?'#EDF7F0':'#FFFDF8' }}
                        onClick={() => setCalDayDetail({shift})}>
                        <div style={{ fontSize:10, fontWeight:700, color:cat.color, marginBottom:1 }}>{cat.icon} {shift.label}</div>
                        <div style={{ fontSize:10, color:'#888' }}>{shift.time}</div>
                        {room&&<div style={{ fontSize:9, color:'#6B8FB5', marginTop:1 }}>{room.icon} {room.name}</div>}
                        {isAssigned&&<div style={{ fontSize:9, color:'#2A9D6E', fontWeight:700, marginTop:1 }}>✓</div>}
                        {!isAssigned&&calIsChef&&shift.applicants.length>0&&<div style={{ fontSize:9, color:'#C8960A', marginTop:1 }}>👤{shift.applicants.length}</div>}
                        {!calIsChef&&hasApp&&!isAssigned&&<div style={{ fontSize:9, color:'#2A9D6E', fontWeight:700, marginTop:1 }}>✓ Beworben</div>}
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

  /* ═════════════════════════════════════════
     NOTIFICATION PANEL
  ═════════════════════════════════════════ */
  const NotifPanel = () => (
    <div style={S.notifPanel} onClick={e=>e.stopPropagation()}>
      <div style={S.notifPanelHdr}>
        <span style={S.notifPanelTitle}>🔔 Benachrichtigungen</span>
        <div style={{ display:'flex', gap:8 }}>
          {unreadCount>0&&<button style={S.notifMarkAll} onClick={()=>db.markAllRead(currentRecipient)}>Alle gelesen</button>}
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

  /* ═════════════════════════════════════════
     ACCOUNTS TAB
  ═════════════════════════════════════════ */
  const AccountsTab = () => {
    const chefAccs = db.accounts.filter(a=>a.role==='chef')
    const empAccs  = db.accounts.filter(a=>a.role==='employee')

    const AccRow = ({ acc }) => {
      const emp = db.employees.find(e=>e.id===acc.employeeId)
      const cat = emp ? CATEGORIES[emp.category] : null
      return (
        <div style={S.accRow}>
          <div style={{ ...S.accAvatar, background:cat?cat.color+'33':'#C8960A33', color:cat?cat.color:'#C8960A' }}>{mkInitials(acc.name)}</div>
          <div style={S.accInfo}>
            <div style={S.accName}>{acc.name}</div>
            <div style={S.accRole}>
              {cat && <span style={{ ...S.catBadge, background:cat.color+'22', color:cat.color }}>{cat.icon} {cat.label}</span>}
              {!cat && <span>Chef</span>}
              &nbsp;{'•'.repeat(Math.min(acc.password.length, 8))}
            </div>
          </div>
          <button style={S.accEditBtn} onClick={()=>{ setEditAccount({...acc}); setAccError('') }}>✏️</button>
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
          <button style={S.addBtn} onClick={()=>{ setNewAccForm({name:'',password:'',role:'employee',category:'service'}); setAccError(''); setShowAddAccount(true) }}>+ Account</button>
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

  /* ═════════════════════════════════════════
     BULK SHIFT MODAL  (new template-based dialog)
  ═════════════════════════════════════════ */
  const BulkShiftModal = () => {
    const selectedTmpl = SHIFT_TEMPLATES.find(t=>t.id===bulkForm.template) || SHIFT_TEMPLATES[0]
    const totalPersons = Object.values(bulkForm.counts).reduce((a,b)=>a+b,0)

    const handleSubmit = async () => {
      if (!bulkForm.date) { showToast('Bitte Datum auswählen'); return }
      if (totalPersons === 0) { showToast('Mindestens 1 Person auswählen'); return }
      const label = bulkForm.template === 'custom' ? (bulkForm.customLabel || 'Schicht') : selectedTmpl.label
      const shifts = []
      for (const [cat, count] of Object.entries(bulkForm.counts)) {
        for (let i = 0; i < count; i++) {
          shifts.push({ date: bulkForm.date, label, time: bulkForm.time, category: cat, room: bulkForm.room })
        }
      }
      await db.addShiftsBulk(shifts, db.employees)
      setShowBulkShift(false)
      setBulkForm({ date:'', template:'ala_carte', customLabel:'', time:'17:00 – 23:00', room:'', counts:{ theke:0, service:0, runner:0 } })
      showToast(`${shifts.length} Schicht${shifts.length>1?'en':''} erstellt ✓`)
    }

    return (
      <div style={S.overlay} onClick={()=>setShowBulkShift(false)}>
        <div style={S.modal} onClick={e=>e.stopPropagation()}>
          <div style={S.modalHandle} />
          <h3 style={S.modalTitle}>+ Schichten anlegen</h3>

          <label style={S.label}>Datum</label>
          <input style={S.input} type="date" value={bulkForm.date} onChange={e=>setBulkForm({...bulkForm,date:e.target.value})} />

          <label style={S.label}>Vorlage</label>
          <select style={S.select} value={bulkForm.template}
            onChange={e=>{
              const t=SHIFT_TEMPLATES.find(x=>x.id===e.target.value)
              setBulkForm({...bulkForm, template:e.target.value, time: t?.defaultTime||bulkForm.time})
            }}>
            {SHIFT_TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          </select>

          {bulkForm.template==='custom' && (
            <>
              <label style={S.label}>Bezeichnung</label>
              <input style={S.input} placeholder="z.B. Firmenfeier" value={bulkForm.customLabel} onChange={e=>setBulkForm({...bulkForm,customLabel:e.target.value})} />
            </>
          )}

          <label style={S.label}>Uhrzeit</label>
          <input style={S.input} placeholder="z.B. 17:00 – 23:00" value={bulkForm.time} onChange={e=>setBulkForm({...bulkForm,time:e.target.value})} />

          <label style={S.label}>Raum (optional)</label>
          <select style={S.select} value={bulkForm.room} onChange={e=>setBulkForm({...bulkForm,room:e.target.value})}>
            <option value="">— Kein Raum</option>
            {db.rooms.map(r=><option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
          </select>

          <label style={S.label}>Benötigte Personen</label>
          {Object.entries(CATEGORIES).map(([cat, val]) => (
            <div key={cat} style={S.counterRow}>
              <span style={{ ...S.counterLabel, color: val.color }}>{val.icon} {val.label}</span>
              <div style={S.counterBtns}>
                <button style={S.counterBtn}
                  onClick={()=>setBulkForm(f=>({...f, counts:{...f.counts,[cat]:Math.max(0,f.counts[cat]-1)}}))}>−</button>
                <span style={S.counterVal}>{bulkForm.counts[cat]}</span>
                <button style={S.counterBtn}
                  onClick={()=>setBulkForm(f=>({...f, counts:{...f.counts,[cat]:f.counts[cat]+1}}))}>+</button>
              </div>
            </div>
          ))}

          <div style={{ fontSize:12, color:'#aaa', textAlign:'center', marginTop:4 }}>
            {totalPersons > 0 ? `${totalPersons} Schicht${totalPersons>1?'en':''} werden erstellt` : 'Noch keine Personen ausgewählt'}
          </div>

          <div style={S.modalActions}>
            <button style={S.cancelBtn} onClick={()=>setShowBulkShift(false)}>Abbrechen</button>
            <button style={{ ...S.confirmBtn, opacity: totalPersons===0?0.5:1 }} onClick={handleSubmit}>Erstellen</button>
          </div>
        </div>
      </div>
    )
  }

  /* ═════════════════════════════════════════
     EDIT SHIFT MODAL
  ═════════════════════════════════════════ */
  const EditShiftModal = () => {
    if (!editShift) return null
    return (
      <div style={S.overlay} onClick={()=>setEditShift(null)}>
        <div style={S.modal} onClick={e=>e.stopPropagation()}>
          <div style={S.modalHandle} />
          <h3 style={S.modalTitle}>✏️ Schicht bearbeiten</h3>

          <label style={S.label}>Datum</label>
          <input style={S.input} type="date" value={editShift.date} onChange={e=>setEditShift({...editShift,date:e.target.value})} />

          <label style={S.label}>Bezeichnung</label>
          <input style={S.input} value={editShift.label} onChange={e=>setEditShift({...editShift,label:e.target.value})} />

          <label style={S.label}>Uhrzeit</label>
          <input style={S.input} value={editShift.time} onChange={e=>setEditShift({...editShift,time:e.target.value})} />

          <label style={S.label}>Kategorie</label>
          <CatPills value={editShift.category} onChange={v=>setEditShift({...editShift,category:v})} />

          <label style={S.label}>Raum</label>
          <select style={S.select} value={editShift.room||''} onChange={e=>setEditShift({...editShift,room:e.target.value})}>
            <option value="">— Kein Raum</option>
            {db.rooms.map(r=><option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
          </select>

          <label style={S.label}>Eingeteilt</label>
          <select style={S.select} value={editShift.assigned||''} onChange={e=>setEditShift({...editShift,assigned:e.target.value?Number(e.target.value):null})}>
            <option value="">— Niemand</option>
            {db.employees.filter(e=>e.category===editShift.category).map(e=>(
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>

          <div style={S.modalActions}>
            <button style={S.cancelBtn} onClick={()=>setEditShift(null)}>Abbrechen</button>
            <button style={S.confirmBtn} onClick={async()=>{
              await db.updateShift(editShift.id, editShift)
              setEditShift(null); showToast('Schicht gespeichert ✓')
            }}>Speichern</button>
          </div>
        </div>
      </div>
    )
  }

  /* ═════════════════════════════════════════
     EDIT ACCOUNT MODAL (incl. category change)
  ═════════════════════════════════════════ */
  const EditAccountModal = () => {
    if (!editAccount) return null
    const emp = db.employees.find(e=>e.id===editAccount.employeeId)
    const [localCat, setLocalCat] = useState(emp?.category || 'service')

    return (
      <div style={S.overlay} onClick={()=>setEditAccount(null)}>
        <div style={S.modal} onClick={e=>e.stopPropagation()}>
          <div style={S.modalHandle} />
          <h3 style={S.modalTitle}>✏️ Account bearbeiten</h3>
          <label style={S.label}>Name</label>
          <input style={S.input} value={editAccount.name} onChange={e=>setEditAccount({...editAccount,name:e.target.value})} />
          <label style={S.label}>Passwort</label>
          <input style={S.input} type="text" value={editAccount.password} onChange={e=>setEditAccount({...editAccount,password:e.target.value})} />
          {editAccount.role==='employee' && emp && (
            <>
              <label style={S.label}>Kategorie</label>
              <CatPills value={localCat} onChange={setLocalCat} />
            </>
          )}
          {accError && <div style={S.accErrorBox}>{accError}</div>}
          <div style={S.modalActions}>
            <button style={S.cancelBtn} onClick={()=>setEditAccount(null)}>Abbrechen</button>
            <button style={S.confirmBtn} onClick={async()=>{
              try {
                await db.updateAccount(editAccount, editAccount.name, editAccount.password, db.accounts)
                if (editAccount.role==='employee' && emp && localCat!==emp.category)
                  await db.updateEmployeeCategory(emp.id, localCat)
                setEditAccount(null); showToast('Account aktualisiert ✓')
              } catch(e) { setAccError(e.message) }
            }}>Speichern</button>
          </div>
        </div>
      </div>
    )
  }

  /* ═════════════════════════════════════════
     MAIN RENDER
  ═════════════════════════════════════════ */
  return (
    <div style={S.root} onClick={()=>{ if(showNotifs) setShowNotifs(false) }}>
      <div style={S.bgPattern} />
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
            {showNotifs && <NotifPanel />}
          </div>
          <button style={S.logoutBtn} onClick={()=>{ setCurrentAccount(null); setShowNotifs(false) }}>↩</button>
        </div>
      </header>

      {/* STATS */}
      <div style={S.statsBar}>
        {Object.entries(CATEGORIES).map(([key,val])=>(
          <div key={key} style={S.statCard}>
            <span style={{ fontSize:18 }}>{val.icon}</span>
            <div>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:1, textTransform:'uppercase', color:val.color }}>{val.label}</div>
              <div style={S.statNum}>{db.employees.filter(e=>e.category===key).length}</div>
            </div>
            <div style={S.statChip}>{db.shifts.filter(s=>s.category===key&&!s.assigned).length} offen</div>
          </div>
        ))}
        <div style={S.statCard}>
          <span style={{ fontSize:18 }}>📋</span>
          <div>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:1, textTransform:'uppercase', color:'#aaa' }}>Gesamt</div>
            <div style={S.statNum}>{db.shifts.length}</div>
          </div>
          <div style={S.statChip}>{db.shifts.filter(s=>s.assigned).length} besetzt</div>
        </div>
      </div>

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
                          {['all','theke','service','runner'].map(c=>(
                            <button key={c} style={filterCat===c?S.filterActive:S.filterBtn} onClick={()=>setFilterCat(c)}>
                              {c==='all'?'Alle':CATEGORIES[c]?.label}
                            </button>
                          ))}
                        </div>
                        <div style={{ ...S.filterRow, marginTop:6 }}>
                          <button style={filterRoom==='all'?S.filterActive:S.filterBtn} onClick={()=>setFilterRoom('all')}>🏢 Alle</button>
                          {db.rooms.map(r=><button key={r.id} style={filterRoom===r.id?S.filterActive:S.filterBtn} onClick={()=>setFilterRoom(r.id)}>{r.icon} {r.name}</button>)}
                        </div>
                      </div>
                      <div style={S.actionBtns}>
                        <button style={S.addBtn} onClick={()=>setShowBulkShift(true)}>+ Schichten</button>
                        <button style={{ ...S.addBtn, background:'#6B8FB5' }} onClick={()=>setShowManageRooms(true)}>🏢 Räume</button>
                      </div>
                    </div>
                    <div style={S.shiftGrid}>
                      {filtered.length===0&&<div style={S.empty}>Keine Schichten gefunden.</div>}
                      {filtered.map(s=><ShiftCard key={s.id} shift={s} cardIsChef />)}
                    </div>
                    <h2 style={{ ...S.sectionTitle, marginTop:24 }}>Team ({db.employees.length})</h2>
                    <div style={S.empGrid}>
                      {db.employees.map(emp=>{
                        const cat=CATEGORIES[emp.category]
                        const nots=db.notifications.filter(n=>n.recipientId===emp.id&&!n.read).length
                        return (
                          <div key={emp.id} style={S.empCard}>
                            <div style={{ position:'relative' }}>
                              <div style={{ ...S.empAvatarLg, background:cat.color+'33', color:cat.color }}>{emp.avatar}</div>
                              {nots>0&&<span style={S.empNotifDot}>{nots}</span>}
                            </div>
                            <div style={S.empName}>{emp.name}</div>
                            <span style={{ ...S.catBadge, background:cat.color+'22', color:cat.color }}>{cat.icon} {cat.label}</span>
                            <div style={{ fontSize:10, color:'#aaa' }}>{db.shifts.filter(s=>s.assigned===emp.id).length} Schicht(en)</div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                {chefTab==='kalender'&&<Calendar monday={calChef} setMonday={setCalChef} calIsChef />}
              </>
            )}
            {chefSubTab==='accounts'&&<AccountsTab />}
          </div>
        )}

        {/* ════ MITARBEITER ════ */}
        {!isChef && activeEmployee && (
          <div style={S.content}>
            <div style={S.tabBar}>
              <button style={mitTab==='liste'    ?S.tabActive:S.tab} onClick={()=>setMitTab('liste')}>📋 Liste</button>
              <button style={mitTab==='kalender' ?S.tabActive:S.tab} onClick={()=>setMitTab('kalender')}>📅 Kalender</button>
            </div>
            {(() => {
              const empCat=CATEGORIES[activeEmployee.category]
              const available=db.shifts.filter(s=>s.category===activeEmployee.category)
              const applied=available.filter(s=>s.applicants.includes(activeEmployee.id))
              const assigned=db.shifts.filter(s=>s.assigned===activeEmployee.id)
              return (
                <>
                  <div style={S.profileBanner}>
                    <div style={{ ...S.empAvatarLg, background:empCat.color+'44', color:empCat.color, fontSize:20 }}>{activeEmployee.avatar}</div>
                    <div>
                      <div style={S.profileName}>{activeEmployee.name}</div>
                      <span style={{ ...S.catBadge, background:empCat.color+'22', color:empCat.color }}>{empCat.icon} {empCat.label}</span>
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
                        <><h3 style={S.subTitle}>✅ Meine Schichten</h3>
                          <div style={S.shiftGrid}>{assigned.map(s=><ShiftCard key={s.id} shift={s} isEmployee />)}</div>
                        </>
                      )}
                      <h3 style={S.subTitle}>📋 Offene Schichten ({empCat.label})</h3>
                      <div style={S.shiftGrid}>
                        {available.filter(s=>!s.assigned).length===0&&<div style={S.empty}>Keine offenen Schichten.</div>}
                        {available.filter(s=>!s.assigned).map(s=><ShiftCard key={s.id} shift={s} isEmployee />)}
                      </div>
                    </>
                  )}
                  {mitTab==='kalender'&&<Calendar monday={calMit} setMonday={setCalMit} calIsChef={false} />}
                </>
              )
            })()}
          </div>
        )}
      </div>

      {/* MODALS */}
      {showBulkShift   && <BulkShiftModal />}
      {editShift       && <EditShiftModal />}
      {editAccount     && <EditAccountModal />}

      {/* Räume Modal */}
      {showManageRooms && (
        <div style={S.overlay} onClick={()=>setShowManageRooms(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHandle} />
            <h3 style={S.modalTitle}>🏢 Räume verwalten</h3>
            <div style={{ marginBottom:14 }}>
              {db.rooms.length===0&&<div style={{ fontSize:13,color:'#bbb',fontStyle:'italic' }}>Noch keine Räume.</div>}
              {db.rooms.map((room,i)=>(
                <div key={room.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:i%2===0?'#F5F3EE':'#FFFDF8',borderRadius:8,marginBottom:4 }}>
                  <span style={{ fontSize:18 }}>{room.icon}</span>
                  <span style={{ flex:1,fontSize:14,fontWeight:600 }}>{room.name}</span>
                  <span style={{ fontSize:11,color:'#aaa' }}>{db.shifts.filter(s=>s.room===room.id).length}x</span>
                  <button style={{ ...S.deleteBtn,color:'#CC7B7B',fontSize:15 }} onClick={async()=>{ await db.deleteRoom(room.id); showToast('Raum gelöscht') }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ borderTop:'1px solid #E0DBD0',paddingTop:12 }}>
              <label style={S.label}>Neuer Raum</label>
              <div style={{ display:'flex',gap:8,marginBottom:8 }}>
                <input style={{ ...S.input,width:60,textAlign:'center',fontSize:20,padding:'8px 4px' }} placeholder="🏠" value={newRoomIcon} onChange={e=>setNewRoomIcon(e.target.value)} maxLength={2} />
                <input style={{ ...S.input,flex:1 }} placeholder="z.B. Wintergarten" value={newRoomName} onChange={e=>setNewRoomName(e.target.value)}
                  onKeyDown={async e=>{ if(e.key==='Enter'&&newRoomName.trim()){ await db.addRoom(newRoomName,newRoomIcon); setNewRoomName(''); setNewRoomIcon('🏠'); showToast('Raum hinzugefügt ✓') }}} />
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
            <div style={S.modalHandle} />
            <h3 style={S.modalTitle}>🔑 Account erstellen</h3>
            <label style={S.label}>Name</label>
            <input style={S.input} placeholder="Vor- und Nachname" value={newAccForm.name} onChange={e=>setNewAccForm({...newAccForm,name:e.target.value})} />
            <label style={S.label}>Passwort</label>
            <input style={S.input} type="text" placeholder="Passwort festlegen" value={newAccForm.password} onChange={e=>setNewAccForm({...newAccForm,password:e.target.value})} />
            <label style={S.label}>Rolle</label>
            <div style={S.catSelect}>
              {[{v:'employee',l:'👤 Mitarbeiter'},{v:'chef',l:'👨‍🍳 Chef'}].map(({v,l})=>(
                <button key={v} style={newAccForm.role===v?{...S.catBtn,background:'#C8960A33',border:'1px solid #C8960A',color:'#C8960A'}:S.catBtn}
                  onClick={()=>setNewAccForm({...newAccForm,role:v})}>{l}</button>
              ))}
            </div>
            {newAccForm.role==='employee'&&(
              <>
                <label style={S.label}>Kategorie</label>
                <CatPills value={newAccForm.category} onChange={v=>setNewAccForm({...newAccForm,category:v})} />
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
