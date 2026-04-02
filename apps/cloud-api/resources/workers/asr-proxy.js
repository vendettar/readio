/**
 * Readio Cloud ASR Proxy Worker (Cloudflare Workers)
 *
 * Provider-oriented egress hop for apps/cloud-api → provider upstream.
 * Current rollout: Groq transcription submit ONLY.
 *
 * NOT a browser-facing proxy. NOT a generic outbound tunnel.
 * Callers must be apps/cloud-api with X-Readio-Cloud-Secret.
 */

// --- Provider Route Registry (explicit, not inferred) ---

const PROVIDER_ROUTES = Object.freeze({
  '/relay/groq/transcriptions': {
    upstream: 'https://api.groq.com/openai/v1/audio/transcriptions',
    provider: 'groq',
    methods: ['POST'],
  },
  // Future providers require explicit entries here with their own
  // route, upstream, and enablement. Do NOT add a catch-all.
});

// --- Request Handler ---

export default {
  async fetch(request, env) {
    const startTime = Date.now();
    const url = new URL(request.url);
    const route = url.pathname;

    // 1. Only allow configured routes
    const routeConfig = PROVIDER_ROUTES[route];
    if (!routeConfig) {
      return jsonResponse(404, {
        error: 'not_found',
        message: 'unknown route',
      }, startTime, route);
    }

    // 2. Method check
    if (!routeConfig.methods.includes(request.method)) {
      return jsonResponse(405, {
        error: 'method_not_allowed',
        message: `only ${routeConfig.methods.join(', ')} allowed`,
      }, startTime, route);
    }

    // 3. Auth: X-Readio-Cloud-Secret
    const expectedSecret = env.READIO_ASR_WORKER_SHARED_SECRET;
    if (!expectedSecret) {
      // Secret not configured in Worker env — fail closed
      console.error('READIO_ASR_WORKER_SHARED_SECRET not configured');
      return jsonResponse(500, {
        error: 'misconfigured',
        message: 'worker secret not configured',
      }, startTime, route);
    }

    const providedSecret = request.headers.get('X-Readio-Cloud-Secret') || '';
    if (!constantTimeEqual(providedSecret, expectedSecret)) {
      return jsonResponse(401, {
        error: 'unauthorized',
        message: 'invalid or missing shared secret',
      }, startTime, route);
    }

    // 4. Build upstream request — streaming body passthrough
    const upstreamHeaders = new Headers();

    // Forward content-type (multipart boundary is embedded)
    const contentType = request.headers.get('Content-Type');
    if (contentType) {
      upstreamHeaders.set('Content-Type', contentType);
    }

    // Forward Authorization (provider API key from cloud-api)
    const authorization = request.headers.get('Authorization');
    if (authorization) {
      upstreamHeaders.set('Authorization', authorization);
    }

    // SECURITY: Strip X-Readio-Cloud-Secret — must not reach provider
    // (already not forwarded since we build headers explicitly)

    // Ensure HTTPS upstream only
    const upstreamURL = routeConfig.upstream;
    if (!upstreamURL.startsWith('https://')) {
      return jsonResponse(500, {
        error: 'misconfigured',
        message: 'upstream must be HTTPS',
      }, startTime, route);
    }

    try {
      const upstreamResponse = await fetch(upstreamURL, {
        method: request.method,
        headers: upstreamHeaders,
        body: request.body, // streaming passthrough, no buffering
      });

      const duration = Date.now() - startTime;

      // Log route, status, duration (no secrets, no body)
      console.log(JSON.stringify({
        route,
        provider: routeConfig.provider,
        upstream_status: upstreamResponse.status,
        duration_ms: duration,
      }));

      // 5. Transparent upstream response passthrough
      const responseHeaders = new Headers();

      // Preserve content-type from upstream
      const upstreamContentType = upstreamResponse.headers.get('Content-Type');
      if (upstreamContentType) {
        responseHeaders.set('Content-Type', upstreamContentType);
      }

      // Forward Retry-After if present (for 429s)
      const retryAfter = upstreamResponse.headers.get('Retry-After');
      if (retryAfter) {
        responseHeaders.set('Retry-After', retryAfter);
      }

      // Observability: worker timing
      responseHeaders.set('X-Readio-Worker-Duration-Ms', String(duration));

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error(JSON.stringify({
        route,
        provider: routeConfig.provider,
        error: err.message,
        duration_ms: duration,
      }));

      return jsonResponse(502, {
        error: 'upstream_error',
        message: 'upstream request failed',
      }, startTime, route);
    }
  },
};

// --- Helpers ---

function jsonResponse(status, body, startTime, route) {
  const duration = Date.now() - startTime;

  // Log error responses (no secrets)
  if (status >= 400) {
    console.log(JSON.stringify({
      route: route || 'unknown',
      status,
      error: body.error,
      duration_ms: duration,
    }));
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Readio-Worker-Duration-Ms': String(duration),
    },
  });
}

/**
 * Constant-time string comparison to prevent timing attacks on secret.
 * Falls back to byte-by-byte XOR comparison.
 */
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }

  return diff === 0;
}
