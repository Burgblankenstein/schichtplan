export const CATEGORIES = {
  theke:          { label: 'Theke',          color: '#C8960A', icon: '🍺' },
  service:        { label: 'Service',        color: '#2A9D8F', icon: '🍽️' },
  runner:         { label: 'Runner',         color: '#E07070', icon: '⚡' },
  schichtleitung: { label: 'Schichtleitung', color: '#7B68EE', icon: '⭐' },
  waffeln:        { label: 'Waffeln',        color: '#E8A87C', icon: '🧇' },
}

export const CHEF_ID = 'chef'
export const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export const SHIFT_TEMPLATES = [
  { id: 'ala_carte',    label: 'à la Carte',   icon: '🍽️', defaultTime: '17:00 – 23:00' },
  { id: 'hochzeit',     label: 'Hochzeit',      icon: '💍', defaultTime: '14:00 – 00:00' },
  { id: 'ritteressen',  label: 'Ritteressen',   icon: '⚔️', defaultTime: '18:00 – 23:00' },
  { id: 'veranstaltung',label: 'Veranstaltung', icon: '🎉', defaultTime: '16:00 – 22:00' },
  { id: 'custom',       label: 'Eigene…',       icon: '✏️', defaultTime: '' },
]

export function getMonday(d) {
  const x = new Date(d), day = x.getDay()
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day))
  x.setHours(0, 0, 0, 0)
  return x
}
export const addDays   = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const toDS      = d  => d.toISOString().slice(0, 10)
export const fmtLong   = ds => new Date(ds).toLocaleDateString('de-DE', { weekday:'long',  day:'2-digit', month:'long' })
export const fmtShort  = ds => new Date(ds).toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit' })
export const fmtTime   = iso => new Date(iso).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' })
export const mkInitials = name => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
