const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()

const isYesterday = (date: Date, now: Date) => {
  const previousDay = new Date(now)
  previousDay.setHours(0, 0, 0, 0)
  previousDay.setDate(previousDay.getDate() - 1)

  return isSameDay(date, previousDay)
}

const formatTimeLabel = (date: Date) =>
  date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })

const formatExactDateLabel = (date: Date, now: Date) =>
  date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })

const formatExactDateTimeLabel = (date: Date, now: Date) =>
  `${formatExactDateLabel(date, now)} - ${formatTimeLabel(date)}`

export const formatRelativeDayLabel = (timestamp?: string | null, now = Date.now()) => {
  if (!timestamp) return ''

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  const current = new Date(now)

  if (isSameDay(date, current)) {
    return 'Today'
  }

  if (isYesterday(date, current)) {
    return 'Yesterday'
  }

  return formatExactDateLabel(date, current)
}

export const formatLiveTimestamp = (timestamp?: string | null, now = Date.now()) => {
  if (!timestamp) return ''

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  const current = new Date(now)
  const diffMs = current.getTime() - date.getTime()
  const absoluteDiffMs = Math.abs(diffMs)

  if (absoluteDiffMs < MINUTE_MS) {
    return 'Just now'
  }

  if (isSameDay(date, current)) {
    if (diffMs > 0 && diffMs < HOUR_MS) {
      return `${Math.max(1, Math.floor(diffMs / MINUTE_MS))}m ago`
    }

    if (diffMs > 0) {
      return `${Math.floor(diffMs / HOUR_MS)}h ago`
    }

    return formatTimeLabel(date)
  }

  if (isYesterday(date, current)) {
    return `Yesterday - ${formatTimeLabel(date)}`
  }

  return formatExactDateTimeLabel(date, current)
}
