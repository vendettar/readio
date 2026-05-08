function normalizePolicyHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    return normalized.slice(1, -1)
  }
  return normalized
}

function parseIPv4(hostname: string): number[] | null {
  const parts = hostname.split('.')
  if (parts.length !== 4) {
    return null
  }

  const octets = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      return Number.NaN
    }
    return Number(part)
  })

  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null
  }

  return octets
}

function isPrivateIPv4(hostname: string): boolean {
  const octets = parseIPv4(hostname)
  if (!octets) {
    return false
  }

  const [a, b] = octets
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

function isPrivateIPv6(hostname: string): boolean {
  const normalized = normalizePolicyHostname(hostname)
  if (!normalized.includes(':')) {
    return false
  }

  if (normalized === '::1') {
    return true
  }

  if (normalized.startsWith('fe80:')) {
    return true
  }

  const firstHextet = normalized.split(':')[0] || '0'
  const firstValue = Number.parseInt(firstHextet, 16)
  if (Number.isNaN(firstValue)) {
    return false
  }

  if ((firstValue & 0xfe00) === 0xfc00) {
    return true
  }

  if (normalized.startsWith('::ffff:')) {
    return true
  }

  const ipv4MappedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (ipv4MappedMatch?.[1]) {
    return isPrivateIPv4(ipv4MappedMatch[1])
  }

  return false
}

function isObviousLocalHostname(hostname: string): boolean {
  const normalized = normalizePolicyHostname(hostname)
  return (
    normalized === 'localhost' ||
    normalized === 'localhost.localdomain' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local')
  )
}

function isBlockedExternalHostname(hostname: string): boolean {
  const normalized = normalizePolicyHostname(hostname)
  return (
    !normalized ||
    isObviousLocalHostname(normalized) ||
    isPrivateIPv4(normalized) ||
    isPrivateIPv6(normalized)
  )
}

export function getValidExternalHttpUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') {
    return null
  }

  const trimmed = url.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    if (isBlockedExternalHostname(parsed.hostname)) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}
