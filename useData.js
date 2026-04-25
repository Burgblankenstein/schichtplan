import { useState, useEffect, useCallback } from 'react'
import { supabase, callFunction } from './supabase'
import { mkInitials, fmtShort, CHEF_ID, CATEGORIES } from './constants'

const mapShift    = r => ({ id: r.id, date: r.date, label: r.label, time: r.time, category: r.category, room: r.room || '', applicants: r.applicants || [], assigned: r.assigned })
const mapEmployee = r => ({ id: r.id, name: r.name, category: r.category, avatar: r.avatar })
const mapRoom     = r => ({ id: r.id, name: r.name, icon: r.icon })
const mapAccount  = r => ({ id: r.id, name: r.name, role: r.role, employeeId: r.employee_id, email: r.email || '' })
const mapNotif    = r => ({ id: r.id, recipientId: r.recipient_id, type: r.type, text: r.text, shiftId: r.shift_id, read: r.read, ts: r.ts })

export default function useData() {
  const [shifts,        setShifts]        = useState([])
  const [employees,     setEmployees]     = useState([])
  const [rooms,         setRooms]         = useState([])
  const [accounts,      setAccounts]      = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [sh, em, rm, ac, no] = await Promise.all([
          supabase.from('shifts').select('*').order('date'),
          supabase.from('employees').select('*').order('name'),
          supabase.from('rooms').select('*'),
          supabase.from('accounts').select('id,name,role,employee_id,email').order('role'),
          supabase.from('notifications').select('*').order('ts', { ascending: false }),
        ])
        if (sh.error) throw sh.error
        setShifts(sh.data.map(mapShift))
        setEmployees(em.data.map(mapEmployee))
        setRooms(rm.data.map(mapRoom))
        setAccounts(ac.data.map(mapAccount))
        setNotifications(no.data.map(mapNotif))
      } catch (e) { setError(e.message) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  useEffect(() => {
    const reload = (table, setter, mapper, selectCols = '*', col = null, asc = true) => {
      let q = supabase.from(table).select(selectCols)
      if (col) q = q.order(col, { ascending: asc })
      q.then(({ data }) => data && setter(data.map(mapper)))
    }
    const channels = [
      supabase.channel('shifts-ch').on('postgres_changes', { event:'*', schema:'public', table:'shifts' }, () =>
        reload('shifts', setShifts, mapShift, '*', 'date')).subscribe(),
      supabase.channel('notif-ch').on('postgres_changes', { event:'*', schema:'public', table:'notifications' }, () =>
        reload('notifications', setNotifications, mapNotif, '*', 'ts', false)).subscribe(),
      supabase.channel('emp-ch').on('postgres_changes', { event:'*', schema:'public', table:'employees' }, () =>
        reload('employees', setEmployees, mapEmployee, '*', 'name')).subscribe(),
      supabase.channel('acc-ch').on('postgres_changes', { event:'*', schema:'public', table:'accounts' }, () =>
        reload('accounts', setAccounts, mapAccount, 'id,name,role,employee_id,email', 'role')).subscribe(),
      supabase.channel('room-ch').on('postgres_changes', { event:'*', schema:'public', table:'rooms' }, () =>
        reload('rooms', setRooms, mapRoom)).subscribe(),
    ]
    return () => channels.forEach(c => supabase.removeChannel(c))
  }, [])

  /* ── AUTH via Edge Function ── */
  // Login: Passwortprüfung passiert sicher auf dem Server (bcrypt)
  const login = useCallback(async (name, password) => {
    const data = await callFunction('auth-login', { name, password })
    return mapAccount(data.account)
  }, [])

  /* ── EMAIL via Edge Function ── */
  const sendEmail = async (to, type, emailData) => {
    if (!to) return // kein Absturz wenn keine E-Mail hinterlegt
    try {
      await callFunction('send-email', { to, type, data: emailData })
    } catch (e) {
      console.warn('E-Mail konnte nicht gesendet werden:', e.message)
      // E-Mail-Fehler blockieren nicht die App
    }
  }

  // Hilfsfunktion: E-Mail-Adresse eines Empfängers suchen
  const getEmail = (recipientId) => {
    if (recipientId === CHEF_ID) {
      return accounts.find(a => a.role === 'chef')?.email || null
    }
    return accounts.find(a => a.employeeId === recipientId || a.id === String(recipientId))?.email || null
  }

  /* ── NOTIFICATIONS (in-app + e-mail) ── */
  const pushNotif = async (recipientId, type, text, shiftId = null, emailData = null) => {
    // In-App Benachrichtigung
    await supabase.from('notifications').insert({
      id: Date.now() + (Math.random() * 10000 | 0),
      recipient_id: recipientId, type, text,
      shift_id: shiftId, read: false, ts: new Date().toISOString(),
    })
    // E-Mail (parallel, blockiert nicht)
    if (emailData) {
      const email = getEmail(recipientId)
      if (email) sendEmail(email, type, emailData)
    }
  }

  const markAllRead = async (rId) => {
    await supabase.from('notifications').update({ read: true }).eq('recipient_id', rId).eq('read', false)
    setNotifications(prev => prev.map(n => n.recipientId === rId ? { ...n, read: true } : n))
  }
  const clearNotif = async (nid) => {
    await supabase.from('notifications').delete().eq('id', nid)
    setNotifications(prev => prev.filter(n => n.id !== nid))
  }

  /* ── SHIFTS ── */
  const _insertShift = async (s) => {
    const id = Date.now() + (Math.random() * 10000 | 0)
    const { error } = await supabase.from('shifts').insert({
      id, date: s.date, label: s.label, time: s.time,
      category: s.category, room: s.room || null, applicants: [], assigned: null,
    })
    if (error) throw error
    return id
  }

  const addShift = async (s, allEmployees) => {
    const id = await _insertShift(s)
    const room = rooms.find(r => r.id === s.room)
    const cat  = CATEGORIES[s.category]
    for (const e of allEmployees.filter(e => e.category === s.category)) {
      await pushNotif(
        e.id, 'new_shift',
        `Neue Schicht: ${s.label} (${cat.label}) am ${fmtShort(s.date)}`,
        id,
        {
          employeeName: e.name,
          shiftLabel:   s.label,
          shiftDate:    fmtShort(s.date),
          shiftTime:    s.time,
          shiftIcon:    cat.icon,
          category:     cat.label,
          room:         room?.name || '',
        }
      )
    }
  }

  const addShiftsBulk = async (shiftsArr, allEmployees) => {
    for (const s of shiftsArr) await addShift(s, allEmployees)
  }

  const updateShift = async (shiftId, u) => {
    const { error } = await supabase.from('shifts').update({
      date: u.date, label: u.label, time: u.time,
      category: u.category, room: u.room || null,
      assigned: u.assigned ?? null,
    }).eq('id', shiftId)
    if (error) throw error
  }

  const deleteShift = async (id) => {
    await supabase.from('notifications').delete().eq('shift_id', id)
    await supabase.from('shifts').delete().eq('id', id)
  }

  const assignEmployee = async (shiftId, empId, shift) => {
    await supabase.from('shifts').update({ assigned: empId }).eq('id', shiftId)
    const emp  = employees.find(e => e.id === empId)
    const cat  = CATEGORIES[shift.category]
    const room = rooms.find(r => r.id === shift.room)
    await pushNotif(
      empId, 'assigned',
      `Du wurdest für „${shift.label}" am ${fmtShort(shift.date)} eingeteilt!`,
      shiftId,
      {
        employeeName: emp?.name || '',
        shiftLabel:   shift.label,
        shiftDate:    fmtShort(shift.date),
        shiftTime:    shift.time,
        shiftIcon:    cat.icon,
        category:     cat.label,
        room:         room?.name || '',
      }
    )
  }

  const unassignEmployee = async (shiftId) => supabase.from('shifts').update({ assigned: null }).eq('id', shiftId)
  const changeRoom       = async (shiftId, roomId) => supabase.from('shifts').update({ room: roomId || null }).eq('id', shiftId)

  const applyForShift = async (shiftId, shift, employee) => {
    if (shift.applicants.includes(employee.id)) return
    await supabase.from('shifts').update({ applicants: [...shift.applicants, employee.id] }).eq('id', shiftId)
    const cat  = CATEGORIES[shift.category]
    const room = rooms.find(r => r.id === shift.room)
    // Alle Chef-Accounts benachrichtigen
    for (const chefAcc of accounts.filter(a => a.role === 'chef')) {
      await pushNotif(
        CHEF_ID, 'application',
        `${employee.name} hat sich auf „${shift.label}" am ${fmtShort(shift.date)} beworben`,
        shiftId,
        {
          employeeName: employee.name,
          shiftLabel:   shift.label,
          shiftDate:    fmtShort(shift.date),
          shiftTime:    shift.time,
          shiftIcon:    cat.icon,
          category:     cat.label,
          room:         room?.name || '',
        }
      )
    }
  }

  const withdrawApplication = async (shiftId, shift, empId) => {
    await supabase.from('shifts').update({ applicants: shift.applicants.filter(i => i !== empId) }).eq('id', shiftId)
  }

  /* ── ROOMS ── */
  const addRoom    = async (name, icon) => supabase.from('rooms').insert({ id: 'r'+Date.now(), name: name.trim(), icon })
  const deleteRoom = async (id) => {
    await supabase.from('shifts').update({ room: null }).eq('room', id)
    await supabase.from('rooms').delete().eq('id', id)
  }

  /* ── ACCOUNTS / EMPLOYEES ── */
  const addAccount = async (form) => {
    if (accounts.find(a => a.name.toLowerCase() === form.name.trim().toLowerCase()))
      throw new Error('Dieser Name ist bereits vergeben.')

    let employeeId = null
    if (form.role === 'employee') {
      const empId = Date.now()
      const { error } = await supabase.from('employees').insert({
        id: empId, name: form.name.trim(), category: form.category, avatar: mkInitials(form.name)
      })
      if (error) throw error
      employeeId = empId
    }

    // Passwort über Edge Function hashen
    const tmpId = 'a' + Date.now()
    const { error } = await supabase.from('accounts').insert({
      id: tmpId, name: form.name.trim(),
      password: 'PENDING', // wird gleich überschrieben
      role: form.role, employee_id: employeeId,
      email: form.email?.trim() || null,
    })
    if (error) throw error

    // Passwort sicher hashen
    await callFunction('auth-set-password', { accountId: tmpId, newPassword: form.password })
  }

  const updateAccount = async (acc, updates, allAccounts) => {
    if (allAccounts.find(a => a.id !== acc.id && a.name.toLowerCase() === updates.name.trim().toLowerCase()))
      throw new Error('Dieser Name ist bereits vergeben.')

    const patch = { name: updates.name.trim(), email: updates.email?.trim() || null }
    await supabase.from('accounts').update(patch).eq('id', acc.id)

    if (acc.employeeId)
      await supabase.from('employees').update({ name: updates.name.trim(), avatar: mkInitials(updates.name) }).eq('id', acc.employeeId)

    // Neues Passwort nur wenn angegeben
    if (updates.newPassword?.trim()) {
      await callFunction('auth-set-password', { accountId: acc.id, newPassword: updates.newPassword.trim() })
    }
  }

  const updateEmployeeCategory = async (empId, category) => {
    await supabase.from('employees').update({ category }).eq('id', empId)
  }

  const deleteAccount = async (acc, allAccounts) => {
    if (acc.role === 'chef' && allAccounts.filter(a => a.role === 'chef').length <= 1)
      throw new Error('Mindestens ein Chef-Account erforderlich.')
    if (acc.employeeId) await supabase.from('employees').delete().eq('id', acc.employeeId)
    await supabase.from('accounts').delete().eq('id', acc.id)
  }

  return {
    shifts, employees, rooms, accounts, notifications, loading, error,
    login, markAllRead, clearNotif,
    addShift, addShiftsBulk, updateShift,
    deleteShift, assignEmployee, unassignEmployee, changeRoom,
    applyForShift, withdrawApplication,
    addRoom, deleteRoom,
    addAccount, updateAccount, updateEmployeeCategory, deleteAccount,
  }
}
