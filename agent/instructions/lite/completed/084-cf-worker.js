/**
 * Readio CORS proxy (public client, hardened controls)
 *
 * Deploy notes:
 * - Set env vars in Cloudflare Worker settings:
 *   - PROXY_TOKEN: public credential used by Lite app (not a secret)
 *   - ALLOWED_ORIGINS: comma-separated origins, e.g.
 *     https://lite.readio.app,http://localhost:5173
 *   - Legacy fallback: ALLOWED_ORIGIN (single origin)
 *   - Optional strict mode:
 *     - ENABLE_STRICT_ALLOWLIST=true
 *     - ALLOWED_UPSTREAM_HOSTS=example.com,feeds.example.com
 *   - Optional hardening:
 *     - BLOCK_PRIVATE_TARGETS=true
 *     - PODCAST_HINT_KEYWORDS=rss,podcast,feed,xml
 */

const DEFAULT_ALLOWED_UPSTREAM_HOSTS = [
  'rss.applemarketingtools.com',
  'itunes.apple.com',
  'feeds.megaphone.fm',
  'anchor.fm',
  'rss.art19.com',
  'dts.podtrac.com',
  'cdn.simplecast.com',
  'openspeech.bytedance.com',
  'api.deepgram.com',
]

const ALLOWED_METHODS = new Set(['POST', 'OPTIONS'])
const ALLOWED_REQUEST_HEADERS = ['content-type', 'x-proxy-token', 'x-request-id', 'authorization']

// Upstream hosts permitted to receive POST requests (with body + custom header forwarding).
// All other upstream targets remain restricted to GET/HEAD.
const POST_ALLOWED_UPSTREAM_HOSTS = new Set(['openspeech.bytedance.com', 'api.deepgram.com'])
const READABLE_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-encoding',
  'cache-control',
  'etag',
  'last-modified',
  'vary',
]

/**
 * @param {unknown} data
 * @param {number} [status]
 * @param {HeadersInit} [cors]
 * @param {HeadersInit} [extraHeaders]
 */
function json(
  data,
  status = 200,
  cors = /** @type {HeadersInit} */ ({}),
  extraHeaders = /** @type {HeadersInit} */ ({})
) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
  })
  const applyHeaders = (input) => {
    const normalized = new Headers(input)
    for (const [k, v] of normalized.entries()) headers.set(k, v)
  }
  applyHeaders(cors)
  applyHeaders(extraHeaders)

  return new Response(JSON.stringify(data), {
    status,
    headers,
  })
}

function isDebugProxyEnabled(env) {
  return parseBoolean(env.DEBUG_PROXY, false)
}

function deny({ env, requestId, code, status = 403, cors = {}, detail = undefined }) {
  const debug = isDebugProxyEnabled(env)
  const payload = debug
    ? { error: 'forbidden', code, detail, requestId }
    : { error: 'forbidden', requestId }

  console.warn(
    JSON.stringify({
      type: 'proxy_deny',
      requestId,
      code,
      detail,
    })
  )

  const extraHeaders = {
    'x-proxy-request-id': requestId,
    ...(debug ? { 'x-proxy-deny-reason': code } : {}),
  }

  return json(payload, status, cors, extraHeaders)
}

function parseAllowedOrigins(env) {
  const raw = env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || ''
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function parseAllowedUpstreamHosts(env) {
  const raw = (env.ALLOWED_UPSTREAM_HOSTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  return new Set(raw.length > 0 ? raw : DEFAULT_ALLOWED_UPSTREAM_HOSTS)
}

function parseStringList(value, fallback = []) {
  const parsed = String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  return parsed.length > 0 ? parsed : fallback
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return String(value).toLowerCase() === 'true'
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map((s) => Number(s))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false
  const [a, b] = parts
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  )
}

function isBlockedTargetHost(hostname) {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === '::1') return true
  return isPrivateIpv4(host)
}

function isOriginAllowed(origin, allowedOrigins) {
  return Boolean(origin) && allowedOrigins.includes(origin)
}

function buildCors(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': ALLOWED_REQUEST_HEADERS.join(', '),
    'access-control-max-age': '86400',
    'access-control-expose-headers': READABLE_RESPONSE_HEADERS.join(', '),
    vary: 'origin',
  }
}

function getClientIp(request) {
  return request.headers.get('cf-connecting-ip') || '0.0.0.0'
}

function normalizeTarget(input, options) {
  const { strictAllowlist, allowedUpstreamHosts, blockPrivateTargets, podcastHintKeywords } =
    options
  let url
  try {
    url = new URL(input)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'only_https_allowed' }
  }

  const hostname = url.hostname.toLowerCase()

  if (blockPrivateTargets && isBlockedTargetHost(hostname)) {
    return { ok: false, reason: 'private_target_blocked' }
  }

  if (strictAllowlist && !allowedUpstreamHosts.has(hostname)) {
    return { ok: false, reason: 'upstream_not_allowed' }
  }

  const targetText = `${hostname}${url.pathname}${url.search}`.toLowerCase()
  const keywordHit = podcastHintKeywords.some((keyword) => targetText.includes(keyword))
  return { ok: true, url, keywordHit }
}

function sanitizeForwardHeaders(reqHeaders, targetUrl) {
  const h = new Headers()
  const clientAccept = reqHeaders.get('accept')
  const clientAcceptLanguage = reqHeaders.get('accept-language')
  const clientAuthorization = reqHeaders.get('authorization')
  const clientRange = reqHeaders.get('range')
  const clientIfNoneMatch = reqHeaders.get('if-none-match')
  const clientIfModifiedSince = reqHeaders.get('if-modified-since')
  const clientUserAgent = reqHeaders.get('user-agent')

  if (clientAccept) h.set('accept', clientAccept)
  if (clientAcceptLanguage) h.set('accept-language', clientAcceptLanguage)
  // Forward auth headers only when they match common API token formats.
  if (clientAuthorization && /^(Bearer|Token)\s+\S+/i.test(clientAuthorization.trim())) {
    h.set('authorization', clientAuthorization.trim())
  }
  if (clientRange) h.set('range', clientRange)
  if (clientIfNoneMatch) h.set('if-none-match', clientIfNoneMatch)
  if (clientIfModifiedSince) h.set('if-modified-since', clientIfModifiedSince)

  // Prefer client UA to reduce upstream anti-bot false positives.
  // Fallback to a common browser UA when missing.
  h.set(
    'user-agent',
    clientUserAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  )

  // Do not force Origin/Referer by default. Some upstream WAF rules reject
  // synthetic cross-origin metadata and return opaque 52x errors.
  void targetUrl
  return h
}

function pickResponseHeaders(upstreamHeaders) {
  const out = new Headers()
  for (const key of READABLE_RESPONSE_HEADERS) {
    const v = upstreamHeaders.get(key)
    if (v) out.set(key, v)
  }
  return out
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default {
  async fetch(request, env, ctx) {
    const requestId = crypto.randomUUID()
    let phase = 'init'
    /** @type {HeadersInit} */
    let cors = {}
    try {
      phase = 'parse_request'
      const origin = request.headers.get('origin') || ''
      const allowedOrigins = parseAllowedOrigins(env)
      const allowedUpstreamHosts = parseAllowedUpstreamHosts(env)
      const strictAllowlist = parseBoolean(env.ENABLE_STRICT_ALLOWLIST, false)
      const blockPrivateTargets = parseBoolean(env.BLOCK_PRIVATE_TARGETS, true)
      const podcastHintKeywords = parseStringList(env.PODCAST_HINT_KEYWORDS, [
        'rss',
        'podcast',
        'feed',
        'xml',
      ])
      const originAllowed = isOriginAllowed(origin, allowedOrigins)
      cors = originAllowed ? buildCors(origin) : {}

      if (request.method === 'OPTIONS') {
        if (!originAllowed) {
          return deny({
            env,
            requestId,
            code: 'origin_not_allowed',
            detail: { origin },
          })
        }
        return new Response(null, { status: 204, headers: cors })
      }

      if (!originAllowed) {
        return deny({
          env,
          requestId,
          code: 'origin_not_allowed',
          detail: { origin },
        })
      }

      if (!ALLOWED_METHODS.has(request.method)) {
        return json({ error: 'method_not_allowed', requestId }, 405, cors, {
          'x-proxy-request-id': requestId,
        })
      }

      // Require explicit token in header. In frontend-only mode this is a public credential,
      // used for abuse control and routing policy, not secrecy.
      const token = (request.headers.get('x-proxy-token') || '').trim()
      if (!token) {
        return deny({
          env,
          requestId,
          code: 'missing_token',
          cors,
        })
      }
      if (token !== (env.PROXY_TOKEN || '')) {
        return deny({
          env,
          requestId,
          code: 'bad_token',
          cors,
        })
      }

      const ctype = request.headers.get('content-type') || ''
      if (!ctype.includes('application/json')) {
        return json({ error: 'invalid_content_type', requestId }, 400, cors, {
          'x-proxy-request-id': requestId,
        })
      }
      const body = await request.json().catch(() => null)
      const targetInput = body?.url || ''
      const method = String(body?.method || 'GET').toUpperCase()
      // Method validation is deferred until after target normalization so we
      // can check the upstream host against POST_ALLOWED_UPSTREAM_HOSTS.

      phase = 'normalize_target'
      const normalized = normalizeTarget(targetInput, {
        strictAllowlist,
        allowedUpstreamHosts,
        blockPrivateTargets,
        podcastHintKeywords,
      })
      if (!normalized.ok) {
        const policyErrors = new Set([
          'upstream_not_allowed',
          'private_target_blocked',
          'origin_not_allowed',
        ])
        const status = policyErrors.has(normalized.reason) ? 403 : 400
        if (status === 403) {
          return deny({
            env,
            requestId,
            code: normalized.reason,
            cors,
            detail: { target: targetInput },
          })
        }
        return json({ error: normalized.reason, requestId }, status, cors, {
          'x-proxy-request-id': requestId,
        })
      }

      const upstreamUrl = normalized.url
      const isPostUpstream = method === 'POST'

      // Deferred method check: allow POST only for whitelisted upstream hosts.
      if (!['GET', 'HEAD'].includes(method)) {
        if (
          !isPostUpstream ||
          !POST_ALLOWED_UPSTREAM_HOSTS.has(upstreamUrl.hostname.toLowerCase())
        ) {
          return json({ error: 'method_not_allowed', requestId }, 405, cors, {
            'x-proxy-request-id': requestId,
          })
        }
      }

      const upstreamHeaders = sanitizeForwardHeaders(request.headers, upstreamUrl)

      // Merge custom headers from the JSON payload so the upstream API receives
      // the correct authentication and metadata headers (applies to all methods).
      if (body?.headers && typeof body.headers === 'object') {
        for (const [key, value] of Object.entries(body.headers)) {
          if (typeof value === 'string') {
            upstreamHeaders.set(key, value)
          }
        }
      }

      // Cache is only used for GET/HEAD; POST requests always go to upstream.
      let cached
      if (!isPostUpstream) {
        phase = 'cache_lookup'
        const cache = caches.default
        const cacheKeyUrl = new URL(request.url)
        cacheKeyUrl.search = ''
        const cacheHash = await sha256Hex(`${method}:${upstreamUrl.toString()}`)
        cacheKeyUrl.pathname = `/__cache/${cacheHash}`
        const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' })

        try {
          cached = await cache.match(cacheKey)
        } catch (cacheErr) {
          console.error(
            JSON.stringify({
              type: 'proxy_cache_match_error',
              requestId,
              phase,
              error: String(cacheErr?.message || cacheErr),
            })
          )
        }

        if (cached) {
          const hitHeaders = new Headers(cached.headers)
          for (const [k, v] of Object.entries(cors)) hitHeaders.set(k, v)
          hitHeaders.set('x-proxy-cache', 'HIT')
          return new Response(cached.body, { status: cached.status, headers: hitHeaders })
        }
      }

      phase = 'upstream_fetch'
      let upstreamResp
      try {
        /** @type {RequestInit} */
        const fetchInit = {
          method,
          headers: upstreamHeaders,
          redirect: 'follow',
          cf: { cacheEverything: false, cacheTtl: 0 },
        }
        // Forward request body for POST requests.
        if (isPostUpstream && body?.body != null) {
          fetchInit.body = body.body
        }
        upstreamResp = await fetch(upstreamUrl.toString(), fetchInit)
      } catch (err) {
        return json(
          { error: 'upstream_fetch_failed', requestId, detail: String(err?.message || err) },
          502,
          cors,
          { 'x-proxy-request-id': requestId }
        )
      }

      phase = 'response_build'
      // For POST responses, forward all upstream headers (the caller may need
      // API-specific headers like X-Api-Status-Code). For GET, keep the
      // existing conservative whitelist.
      let outHeaders
      if (isPostUpstream) {
        outHeaders = new Headers()
        const exposeNames = []
        for (const [key, value] of upstreamResp.headers.entries()) {
          const lc = key.toLowerCase()
          if (lc === 'set-cookie') continue
          outHeaders.set(key, value)
          exposeNames.push(key)
        }
        // Expose all forwarded headers to the browser.
        if (exposeNames.length > 0) {
          outHeaders.set('access-control-expose-headers', exposeNames.join(', '))
        }
      } else {
        outHeaders = pickResponseHeaders(upstreamResp.headers)
      }
      for (const [k, v] of Object.entries(cors)) outHeaders.set(k, v)
      outHeaders.set('x-proxy-request-id', requestId)
      outHeaders.set('x-proxy-cache', isPostUpstream ? 'BYPASS' : 'MISS')
      outHeaders.delete('set-cookie')

      // Cache is only used for GET/HEAD responses.
      if (!isPostUpstream && upstreamResp.ok) {
        phase = 'cache_put'
        const cache = caches.default
        const cacheKeyUrl = new URL(request.url)
        cacheKeyUrl.search = ''
        const cacheHash = await sha256Hex(`${method}:${upstreamUrl.toString()}`)
        cacheKeyUrl.pathname = `/__cache/${cacheHash}`
        const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' })
        const upstreamForCache = upstreamResp.clone()
        const cacheHeaders = pickResponseHeaders(upstreamForCache.headers)
        cacheHeaders.set('cache-control', 'public, max-age=1800')
        const cacheable = new Response(upstreamForCache.body, {
          status: upstreamForCache.status,
          headers: cacheHeaders,
        })
        ctx.waitUntil(
          cache.put(cacheKey, cacheable).catch((cacheErr) => {
            console.error(
              JSON.stringify({
                type: 'proxy_cache_put_error',
                requestId,
                phase,
                error: String(cacheErr?.message || cacheErr),
              })
            )
          })
        )
      }

      // Auditable log (no secrets)
      console.log(
        JSON.stringify({
          type: 'proxy_access',
          requestId,
          method: request.method,
          upstreamHost: upstreamUrl.hostname,
          upstreamPath: upstreamUrl.pathname,
          status: upstreamResp.status,
          strictAllowlist,
          podcastHint: normalized.keywordHit,
          ip: getClientIp(request),
          ua: request.headers.get('user-agent') || '',
        })
      )

      return new Response(upstreamResp.body, {
        status: upstreamResp.status,
        headers: outHeaders,
      })
    } catch (err) {
      console.error(
        JSON.stringify({
          type: 'proxy_unhandled_error',
          requestId,
          phase,
          error: String(err?.message || err),
        })
      )
      return json({ error: 'internal_error', requestId, phase }, 500, cors, {
        'x-proxy-request-id': requestId,
      })
    }
  },
}
