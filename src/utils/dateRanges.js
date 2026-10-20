import { todayLocal } from './format'

// Ready-made periods for reports. All dates are LOCAL "YYYY-MM-DD", inclusive.
export const PRESETS = ['today', 'yesterday', 'this_week', 'this_month', 'last_month', 'this_year', 'all', 'custom']

export const PRESET_LABELS = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  this_month: 'This month',
  last_month: 'Last month',
  this_year: 'This year',
  all: 'All time',
  custom: 'Custom',
}

export function rangeFor(preset, now = new Date()) {
  const d = (y, m, day) => todayLocal(new Date(y, m, day))
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (preset) {
    case 'today': return { from: todayLocal(now), to: todayLocal(now) }
    case 'yesterday': { const t = d(y, m, now.getDate() - 1); return { from: t, to: t } }
    case 'this_week': {
      // Weeks start on Monday
      const offset = (now.getDay() + 6) % 7
      return { from: d(y, m, now.getDate() - offset), to: todayLocal(now) }
    }
    case 'this_month': return { from: d(y, m, 1), to: todayLocal(now) }
    case 'last_month': return { from: d(y, m - 1, 1), to: d(y, m, 0) }
    case 'this_year': return { from: d(y, 0, 1), to: todayLocal(now) }
    default: return { from: null, to: null } // all time
  }
}

// Starting value for a DateRangePicker
export function initialRange(preset = 'this_month') {
  return { preset, ...rangeFor(preset) }
}
