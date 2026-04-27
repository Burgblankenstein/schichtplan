import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { mkInitials, fmtShort, CHEF_ID, CATEGORIES } from './constants'

// employees.categories is now an array e.g. ['service','runner']
const mapShift    = r => ({ id: r.id, date: r.date, label: r.label, time: r.time, category: r.category, room: r.room || '', applicants: r.applicants || [], assigned: r.assigned })
const mapEmployee = r => ({ id: r.id, name: r.name, categories: r.categories || [r.category].filter(Boolean), avatar: r.avatar })
const mapRoom     = r => ({ id: r.id, name: r.name, icon: r.icon })
const mapAccount  = r => ({ id: r.id, name: r.name, role: r.role, employeeId: r.employee_id, email: r.email || '' })
const mapNotif    = r => ({ id: r.id, recipientId: r.recipient_id, type: r.type, text: r.text, shiftId: r.shift_id, read: r.read, ts: r.ts })
const mapUnavail  = r => ({ id: r.id, employeeId: r.employee_id, date: r.date, note: r.note || '' })

export default function useData() {
  const [shifts,        setShifts]        = useState([])
  const [employees,     setEmployees]     = useState([])
  const [rooms,         setRooms]         = useState([])
  const [accounts,      setAccounts]      = useState([])
  const [notifications, setNotifications] = useState([])
  const [unavailable,   setUnavailable]   = useState([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [sh, em, rm, ac, no, un] = await Promise.all([
          supabase.from('shifts').select('*').order('date'),
          supabase.from('employees').select('*').order('name'),
          supabase.from('rooms').select('*'),
          supabase.from('accounts').select('id,name,role,employee_id,email').order('role'),
          supabase.from('notifications').select('*').order('ts', { ascending: false }),
          supabase.from('unavailable_days').select('*'),
        ])
        if (sh.error) throw sh.error
        setShifts(sh.data.map(mapShift))
        setEmployees(em.data.map(mapEmployee))
        setRooms(rm.data.map(mapRoom))
        setAccounts(ac.data.map(mapAccount))
        setNotifications(no.data.map(mapNotif))
        setUnavailable((un.data || []).map(mapUnavail))
      } catch (e) { setError(e.message) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  useEffect(() => {
    const reload = (table, setter, mapper, sel = '*', col = null, asc = true) => {
      let q = supabase.from(table).select(sel)
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
      supabase.channel('unavail-ch').on('postgres_changes', { event:'*', schema:'public', table:'unavailable_days' }, () =>
        reload('unavailable_days', setUnavailable, mapUnavail)).subscribe(),
    ]
    return () => channels.forEach(c => supabase.removeChannel(c))
  }, [])

  /* ── AUTH ── */
  const sha256 = async (text) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
  }

  const login = useCallback(async (name, password) => {
    const hashedInput = 'sha256:' + await sha256(password)
    const { data: rows } = await supabase
      .from('accounts')
      .select('id,name,role,employee_id,email,password')
      .ilike('name', name.trim())
    const acc = rows?.[0]
    if (!acc) throw new Error('Name oder Passwort falsch.')
    let isValid = false
    if (acc.password?.startsWith('sha256:')) {
      isValid = acc.password === hashedInput
    } else {
      isValid = acc.password === password
      if (isValid) await supabase.from('accounts').update({ password: hashedInput }).eq('id', acc.id)
    }
    if (!isValid) throw new Error('Name oder Passwort falsch.')
    const { password: _, ...safe } = acc
    return mapAccount(safe)
  }, [])

  /* ── NOTIFICATIONS ── */
  const sendEmail = async (to, type, emailData) => {
    if (!to) return
    try {
      await supabase.functions.invoke('send-email', { body: { to, type, data: emailData } })
    } catch (e) { console.warn('E-Mail Fehler:', e.message) }
  }

  const getEmail = (recipientId) => {
    if (recipientId === CHEF_ID) return accounts.find(a => a.role === 'chef')?.email || null
    return accounts.find(a => a.employeeId === recipientId || a.id === String(recipientId))?.email || null
  }

  const pushNotif = async (recipientId, type, text, shiftId = null, emailData = null) => {
    await supabase.from('notifications').insert({
      id: Date.now() + (Math.random() * 10000 | 0),
      recipient_id: recipientId, type, text,
      shift_id: shiftId, read: false, ts: new Date().toISOString(),
    })
    if (emailData) { const email = getEmail(recipientId); if (email) sendEmail(email, type, emailData) }
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
    // notify employees who have this category in their categories array
    for (const e of allEmployees.filter(e => (e.categories || []).includes(s.category))) {
      await pushNotif(e.id, 'new_shift',
        `Neue Schicht: ${s.label} (${cat.label}) am ${fmtShort(s.date)}`, id,
        { employeeName: e.name, shiftLabel: s.label, shiftDate: fmtShort(s.date), shiftTime: s.time, shiftIcon: cat.icon, category: cat.label, room: room?.name || '' }
      )
    }
  }

  const addShiftsBulk = async (shiftsArr, allEmployees) => {
    for (const s of shiftsArr) await addShift(s, allEmployees)
  }

  const updateShift = async (shiftId, u) => {
    const { error } = await supabase.from('shifts').update({
      date: u.date, label: u.label, time: u.time,
      category: u.category, room: u.room || null, assigned: u.assigned ?? null,
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
    await pushNotif(empId, 'assigned',
      `Du wurdest für „${shift.label}" am ${fmtShort(shift.date)} eingeteilt!`, shiftId,
      { employeeName: emp?.name || '', shiftLabel: shift.label, shiftDate: fmtShort(shift.date), shiftTime: shift.time, shiftIcon: cat.icon, category: cat.label, room: room?.name || '' }
    )
  }

  const unassignEmployee = async (sid) => supabase.from('shifts').update({ assigned: null }).eq('id', sid)
  const changeRoom       = async (sid, roomId) => supabase.from('shifts').update({ room: roomId || null }).eq('id', sid)

  const declineShift = async (shiftId, shift, employee) => {
    // Remove assignment and remove from applicants
    await supabase.from('shifts').update({
      assigned: null,
      applicants: shift.applicants.filter(id => id !== employee.id)
    }).eq('id', shiftId)
    // Notify chef
    const cat = CATEGORIES[shift.category]
    await pushNotif(
      CHEF_ID, 'declined',
      `${employee.name} hat die Schicht „${shift.label}" am ${fmtShort(shift.date)} abgelehnt!`,
      shiftId,
      { employeeName: employee.name, shiftLabel: shift.label, shiftDate: fmtShort(shift.date), shiftTime: shift.time, shiftIcon: cat.icon, category: cat.label, room: rooms.find(r => r.id === shift.room)?.name || '' }
    )
  }

  const applyForShift = async (shiftId, shift, employee) => {
    if (shift.applicants.includes(employee.id)) return
    await supabase.from('shifts').update({ applicants: [...shift.applicants, employee.id] }).eq('id', shiftId)
    const cat  = CATEGORIES[shift.category]
    const room = rooms.find(r => r.id === shift.room)
    await pushNotif(CHEF_ID, 'application',
      `${employee.name} hat sich auf „${shift.label}" am ${fmtShort(shift.date)} beworben`, shiftId,
      { employeeName: employee.name, shiftLabel: shift.label, shiftDate: fmtShort(shift.date), shiftTime: shift.time, shiftIcon: cat.icon, category: cat.label, room: room?.name || '' }
    )
  }

  const withdrawApplication = async (shiftId, shift, empId) => {
    await supabase.from('shifts').update({ applicants: shift.applicants.filter(i => i !== empId) }).eq('id', shiftId)
  }

  /* ── UNAVAILABLE DAYS ── */
  const addUnavailableDay = async (employeeId, date, note = '') => {
    const existing = unavailable.find(u => u.employeeId === employeeId && u.date === date)
    if (existing) return
    await supabase.from('unavailable_days').insert({
      id: Date.now() + (Math.random() * 1000 | 0),
      employee_id: employeeId, date, note,
    })
  }

  const removeUnavailableDay = async (employeeId, date) => {
    const entry = unavailable.find(u => u.employeeId === employeeId && u.date === date)
    if (!entry) return
    await supabase.from('unavailable_days').delete().eq('id', entry.id)
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
      const cats = form.categories?.length ? form.categories : [form.category || 'service']
      const { error } = await supabase.from('employees').insert({
        id: empId, name: form.name.trim(),
        categories: cats,
        category: cats[0], // legacy fallback
        avatar: mkInitials(form.name)
      })
      if (error) throw error
      employeeId = empId
    }
    const tmpId  = 'a' + Date.now()
    const hashed = 'sha256:' + await sha256(form.password)
    const { error } = await supabase.from('accounts').insert({
      id: tmpId, name: form.name.trim(), password: hashed,
      role: form.role, employee_id: employeeId, email: form.email?.trim() || null,
    })
    if (error) throw error
  }

  const updateAccount = async (acc, updates, allAccounts) => {
    if (allAccounts.find(a => a.id !== acc.id && a.name.toLowerCase() === updates.name.trim().toLowerCase()))
      throw new Error('Dieser Name ist bereits vergeben.')
    await supabase.from('accounts').update({ name: updates.name.trim(), email: updates.email?.trim() || null }).eq('id', acc.id)
    if (acc.employeeId) {
      const patch = { name: updates.name.trim(), avatar: mkInitials(updates.name) }
      if (updates.categories?.length) {
        patch.categories = updates.categories
        patch.category = updates.categories[0]
      }
      await supabase.from('employees').update(patch).eq('id', acc.employeeId)
    }
    if (updates.newPassword?.trim()) {
      const hashed = 'sha256:' + await sha256(updates.newPassword.trim())
      await supabase.from('accounts').update({ password: hashed }).eq('id', acc.id)
    }
  }

  const deleteAccount = async (acc, allAccounts) => {
    if (acc.role === 'chef' && allAccounts.filter(a => a.role === 'chef').length <= 1)
      throw new Error('Mindestens ein Chef-Account erforderlich.')
    if (acc.employeeId) await supabase.from('employees').delete().eq('id', acc.employeeId)
    await supabase.from('accounts').delete().eq('id', acc.id)
  }

  return {
    shifts, employees, rooms, accounts, notifications, unavailable, loading, error,
    login, markAllRead, clearNotif,
    addShift, addShiftsBulk, updateShift,
    deleteShift, assignEmployee, unassignEmployee, declineShift, changeRoom,
    applyForShift, withdrawApplication,
    addUnavailableDay, removeUnavailableDay,
    addRoom, deleteRoom,
    addAccount, updateAccount, deleteAccount,
  }
}
