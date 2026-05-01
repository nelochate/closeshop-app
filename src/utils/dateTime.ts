const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

const normalizeTimestampString = (value: string) => {
  const trimmed = value.trim()

  if (!trimmed) {
    return ''
  }

  const isoLike = trimmed.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1')
  const hasTimezone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(isoLike)

  return hasTimezone ? isoLike : `${isoLike}Z`
}

export const parseAppTimestamp = (timestamp?: string | number | Date | null) => {
  if (timestamp instanceof Date) {
    return Number.isNaN(timestamp.getTime()) ? null : new Date(timestamp.getTime())
  }

  if (typeof timestamp === 'number') {
    const date = new Date(timestamp)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (typeof timestamp !== 'string') {
    return null
  }

  const normalized = normalizeTimestampString(timestamp)
  if (!normalized) {
    return null
  }

  const parsed = new Date(normalized)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed
  }

  const fallback = new Date(timestamp)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

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

type FormatAppDateTimeOptions = {
  now?: number
  fallback?: string
  relativeDay?: boolean
  month?: 'numeric' | '2-digit' | 'short' | 'long'
  day?: 'numeric' | '2-digit'
  year?: 'auto' | 'numeric' | '2-digit' | false
}

export const getAppTimestampValue = (timestamp?: string | number | Date | null) =>
  parseAppTimestamp(timestamp)?.getTime() ?? 0

export const formatAppDateTime = (
  timestamp?: string | number | Date | null,
  {
    now = Date.now(),
    fallback = '',
    relativeDay = false,
    month = 'short',
    day = 'numeric',
    year = 'auto',
  }: FormatAppDateTimeOptions = {},
) => {
  const date = parseAppTimestamp(timestamp)
  if (!date) return fallback

  const current = new Date(now)
  const exactLabel = date.toLocaleString([], {
    month,
    day,
    ...(year === false
      ? {}
      : year === 'auto'
        ? date.getFullYear() !== current.getFullYear()
          ? { year: 'numeric' as const }
          : {}
        : { year }),
    hour: 'numeric',
    minute: '2-digit',
  })

  if (!relativeDay) {
    return exactLabel
  }

  if (isSameDay(date, current)) {
    return `Today, ${formatTimeLabel(date)}`
  }

  if (isYesterday(date, current)) {
    return `Yesterday, ${formatTimeLabel(date)}`
  }

  return exactLabel
}

export const formatRelativeDayLabel = (timestamp?: string | null, now = Date.now()) => {
  if (!timestamp) return ''

  const date = parseAppTimestamp(timestamp)
  if (!date) return ''

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

  const date = parseAppTimestamp(timestamp)
  if (!date) return ''

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
