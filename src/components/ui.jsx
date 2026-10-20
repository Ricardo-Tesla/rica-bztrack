// Small shared building blocks so every page looks the same.

export const inputClass =
  'w-full bg-gray-800 border border-gray-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none text-white transition disabled:opacity-50'

export const labelClass = 'text-xs text-gray-400 mb-1.5 block uppercase tracking-wide'

export function Field({ label, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label && <label className={labelClass}>{label}</label>}
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1.5">{hint}</p>}
    </div>
  )
}

export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-yellow-400 hover:bg-yellow-300 text-black font-bold',
    secondary: 'border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white',
    danger: 'border border-red-800 hover:border-red-500 text-red-400 hover:text-red-300 font-bold',
    ghost: 'text-gray-400 hover:text-white',
  }
  return (
    <button
      {...props}
      className={`px-4 py-2.5 rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    />
  )
}

export function Alert({ type = 'error', children, onClose }) {
  if (!children) return null
  const styles = {
    error: 'bg-red-950 border-red-700 text-red-300',
    success: 'bg-green-950 border-green-800 text-green-300',
    info: 'bg-blue-950 border-blue-800 text-blue-300',
    warning: 'bg-yellow-950 border-yellow-800 text-yellow-300',
  }
  return (
    <div className={`border px-4 py-3 rounded-lg mb-4 text-sm flex justify-between items-start gap-4 ${styles[type]}`}>
      <span className="whitespace-pre-line">{children}</span>
      {onClose && <button onClick={onClose} className="opacity-70 hover:opacity-100">✕</button>}
    </div>
  )
}

export function Modal({ title, subtitle, onClose, children, width = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className={`bg-gray-900 border border-gray-700 rounded-2xl p-7 w-full ${width} shadow-2xl max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-yellow-400">{title}</h2>
            {subtitle && <p className="text-gray-400 text-xs mt-0.5">{subtitle}</p>}
          </div>
          {onClose && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none transition">✕</button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
      <div>
        <h1 className="text-3xl font-bold text-yellow-400">{title}</h1>
        {subtitle && <p className="text-gray-400 mt-1 text-sm">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-3 flex-wrap">{children}</div>}
    </div>
  )
}

export function StatCard({ label, value, hint, tone = 'yellow' }) {
  const tones = { yellow: 'text-yellow-400', green: 'text-green-400', red: 'text-red-400', white: 'text-white' }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${tones[tone] || tones.yellow}`}>{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  )
}
