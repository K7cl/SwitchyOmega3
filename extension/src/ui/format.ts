// Shared UI formatting helpers.

/** Format a timestamp as an unambiguous, locale-neutral "YYYY-MM-DD HH:mm:ss". */
export function formatDateTime(value: string | number | Date | undefined | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}
