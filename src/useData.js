import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { mkInitials, fmtShort, CHEF_ID, CATEGORIES } from './constants'

/* ─────────────────────────────────────────
   Row mappers: snake_case DB → camelCase JS
───────────────────────────────────────── */
const mapShift = r => ({
  id: r.id, date: r.date, label: r.label, time: r.time,
  category: r.category, room: r.room || '',
  applicants: r.applicants || [], assigned: r.assigned,
})
const mapEmployee  = r => ({ id: r.id, name: r.name, category: r.category, avatar: r.avatar })
const mapRoom      = r => ({ id: r.id, name: r.name, icon: r.icon })
const mapAccount   = r => ({ id: r.id, name: r.name, password: r.password, role: r.role, employeeId: r.employee_id })
const mapNotif     = r => ({ id: r.id, recipientId: r.recipient_id, type: r.type, text: r.text, shiftId: r.shift_id, read: r.read, ts: r.ts })

export default function useData() {
  const [shifts,        setShifts]        = useState([])
  const [employees,     setEmployees]     = useState([])
  const [rooms,         setRooms]         = useState([])
  const [accounts,      setAccounts]      = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)

  /* ── initial load ── */
  useEffect(() => {
    async function load() {
      try {
        const [sh, em, rm, ac, no] = await Promise.all([
          supabase.from('shifts').select('*').order('date'),
          supabase.from('employees').select('*').order('name'),
          supabase.from('rooms').select('*'),
          supabase.from('accounts').select('*').order('role'),
          supabase.from('notifications').select('*').order('ts', { ascending: false }),
        ])
        if (sh.error) throw sh.error
        setShifts(sh.data.map(mapShift))
        setEmployees(em.data.map(mapEmployee))
        setRooms(rm.data.map(mapRoom))
        setAccounts(ac.data.map(mapAccount))
        setNotifications(no.data.map(mapNotif))
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  /* ── realtime subscriptions ── */
  useEffect(() => {
    const channels = [
      supabase.channel('shifts-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
          supabase.from('shifts').select('*').order('date').then(({ data }) => data && setShifts(data.map(mapShift)))
        }).subscribe(),
      supabase.channel('notif-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
          supabase.from('notifications').select('*').order('ts', { ascending: false }).then(({ data }) => data && setNotifications(data.map(mapNotif)))
        }).subscribe(),
      supabase.channel('employee-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
          supabase.from('employees').select('*').order('name').then(({ data }) => data && setEmployees(data.map(mapEmployee)))
        }).subscribe(),
      supabase.channel('account-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, () => {
          supabase.from('accounts').select('*').order('role').then(({ data }) => data && setAccounts(data.map(mapAccount)))
        }).subscribe(),
      supabase.channel('room-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
          supabase.from('rooms').select('*').then(({ data }) => data && setRooms(data.map(mapRoom)))
        }).subscribe(),
    ]
    return () => channels.forEach(c => supabase.removeChannel(c))
  }, [])

  /* ─────────────────────────────────────────
     AUTH
  ───────────────────────────────────────── */
  const login = useCallback(async (name, password) => {
    const acc = accounts.find(a => a.name.toLowerCase() === name.toLowerCase() && a.password === password)
    if (!acc) throw new Error('Name oder Passwort falsch.')
    return acc
  }, [accounts])

  /* ─────────────────────────────────────────
     NOTIFICATIONS (helper)
  ───────────────────────────────────────── */
  const pushNotif = async (recipientId, type, text, shiftId = null) => {
    await supabase.from('notifications').insert({
      id: Date.now() + Math.random(),
      recipient_id: recipientId,
      type, text,
      shift_id: shiftId,
      read: false,
      ts: new Date().toISOString(),
    })
  }

  const markAllRead = async (recipientId) => {
    await supabase.from('notifications').update({ read: true }).eq('recipient_id', recipientId).eq('read', false)
    setNotifications(prev => prev.map(n => n.recipientId === recipientId ? { ...n, read: true } : n))
  }

  const clearNotif = async (nid) => {
    await supabase.from('notifications').delete().eq('id', nid)
    setNotifications(prev => prev.filter(n => n.id !== nid))
  }

  /* ─────────────────────────────────────────
     SHIFTS
  ───────────────────────────────────────── */
  const addShift = async (newShift, employees) => {
    const id = Date.now()
    const { error } = await supabase.from('shifts').insert({
      id, date: newShift.date, label: newShift.label, time: newShift.time,
      category: newShift.category, room: newShift.room || null,
      applicants: [], assigned: null,
    })
    if (error) throw error
    // notify employees in category
    for (const e of employees.filter(e => e.category === newShift.category)) {
      await pushNotif(e.id, 'new_shift', `Neue Schicht: ${newShift.label} (${CATEGORIES[newShift.category].label}) am ${fmtShort(newShift.date)}`, id)
    }
  }

  const deleteShift = async (id) => {
    await supabase.from('notifications').delete().eq('shift_id', id)
    await supabase.from('shifts').delete().eq('id', id)
  }

  const assignEmployee = async (shiftId, empId, shift) => {
    await supabase.from('shifts').update({ assigned: empId }).eq('id', shiftId)
    await pushNotif(empId, 'assigned', `Du wurdest für „${shift.label}" am ${fmtShort(shift.date)} eingeteilt!`, shiftId)
  }

  const unassignEmployee = async (shiftId) => {
    await supabase.from('shifts').update({ assigned: null }).eq('id', shiftId)
  }

  const changeRoom = async (shiftId, roomId) => {
    await supabase.from('shifts').update({ room: roomId || null }).eq('id', shiftId)
  }

  const applyForShift = async (shiftId, shift, employee) => {
    if (shift.applicants.includes(employee.id)) return
    const newApplicants = [...shift.applicants, employee.id]
    await supabase.from('shifts').update({ applicants: newApplicants }).eq('id', shiftId)
    await pushNotif(CHEF_ID, 'application', `${employee.name} hat sich auf „${shift.label}" am ${fmtShort(shift.date)} beworben`, shiftId)
  }

  const withdrawApplication = async (shiftId, shift, employeeId) => {
    const newApplicants = shift.applicants.filter(id => id !== employeeId)
    await supabase.from('shifts').update({ applicants: newApplicants }).eq('id', shiftId)
  }

  /* ─────────────────────────────────────────
     ROOMS
  ───────────────────────────────────────── */
  const addRoom = async (name, icon) => {
    const id = 'r' + Date.now()
    await supabase.from('rooms').insert({ id, name: name.trim(), icon })
  }

  const deleteRoom = async (id) => {
    await supabase.from('shifts').update({ room: null }).eq('room', id)
    await supabase.from('rooms').delete().eq('id', id)
  }

  /* ─────────────────────────────────────────
     ACCOUNTS & EMPLOYEES
  ───────────────────────────────────────── */
  const addAccount = async (form) => {
    if (accounts.find(a => a.name.toLowerCase() === form.name.trim().toLowerCase()))
      throw new Error('Dieser Name ist bereits vergeben.')

    let employeeId = null
    if (form.role === 'employee') {
      const empId = Date.now()
      const { error } = await supabase.from('employees').insert({
        id: empId, name: form.name.trim(),
        category: form.category,
        avatar: mkInitials(form.name),
      })
      if (error) throw error
      employeeId = empId
    }
    const { error } = await supabase.from('accounts').insert({
      id: 'a' + Date.now(),
      name: form.name.trim(),
      password: form.password,
      role: form.role,
      employee_id: employeeId,
    })
    if (error) throw error
  }

  const updateAccount = async (acc, editedName, editedPassword, allAccounts) => {
    const conflict = allAccounts.find(a => a.id !== acc.id && a.name.toLowerCase() === editedName.trim().toLowerCase())
    if (conflict) throw new Error('Dieser Name ist bereits vergeben.')
    await supabase.from('accounts').update({ name: editedName.trim(), password: editedPassword }).eq('id', acc.id)
    if (acc.employeeId) {
      await supabase.from('employees').update({ name: editedName.trim(), avatar: mkInitials(editedName) }).eq('id', acc.employeeId)
    }
  }

  const deleteAccount = async (acc, allAccounts) => {
    const chefCount = allAccounts.filter(a => a.role === 'chef').length
    if (acc.role === 'chef' && chefCount <= 1) throw new Error('Mindestens ein Chef-Account erforderlich.')
    if (acc.employeeId) await supabase.from('employees').delete().eq('id', acc.employeeId)
    await supabase.from('accounts').delete().eq('id', acc.id)
  }

  return {
    shifts, employees, rooms, accounts, notifications,
    loading, error,
    login,
    markAllRead, clearNotif,
    addShift, deleteShift, assignEmployee, unassignEmployee, changeRoom,
    applyForShift, withdrawApplication,
    addRoom, deleteRoom,
    addAccount, updateAccount, deleteAccount,
  }
}
