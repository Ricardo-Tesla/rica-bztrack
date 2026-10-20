import { useApp } from '../context/AppContext'
import { PRESETS, PRESET_LABELS, rangeFor } from '../utils/dateRanges'

// value: { preset, from, to }   onChange receives the same shape
export default function DateRangePicker({ value, onChange, presets = PRESETS }) {
  const { t } = useApp()
  const choose = preset => onChange(preset === 'custom'
    ? { preset, from: value.from || rangeFor('this_month').from, to: value.to || rangeFor('today').to }
    : { preset, ...rangeFor(preset) })

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={value.preset}
        onChange={e => choose(e.target.value)}
        className="bg-gray-900 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2 text-sm outline-none text-white"
      >
        {presets.map(p => <option key={p} value={p}>{t(PRESET_LABELS[p])}</option>)}
      </select>
      {value.preset === 'custom' && (
        <>
          <input type="date" value={value.from || ''} max={value.to || undefined}
            onChange={e => onChange({ ...value, from: e.target.value })}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
          <span className="text-gray-500 text-sm">→</span>
          <input type="date" value={value.to || ''} min={value.from || undefined}
            onChange={e => onChange({ ...value, to: e.target.value })}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
        </>
      )}
    </div>
  )
}
