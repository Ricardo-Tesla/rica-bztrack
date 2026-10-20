// Turn any error (Error object, string from Rust, ...) into translated text.
// Services can attach `vars` for placeholders: Object.assign(new Error('... {n} ...'), { vars: { n } })
export function errorText(t, err) {
  if (!err) return ''
  const message = typeof err === 'string' ? err : err.message || String(err)
  return t(message, err.vars)
}

export function errorWithVars(message, vars) {
  return Object.assign(new Error(message), { vars })
}
