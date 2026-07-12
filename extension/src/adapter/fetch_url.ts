// fetch_url — fetch-based URL retrieval with content-type hint filtering.
// Ported from omega-target-chromium-extension/src/module/fetch_url.coffee
// (the `xhr` dependency and Node `url` are replaced by fetch + URL).

import { Errors } from '@switchyomega/omega-core'

interface HintContext {
  contentType?: string
  hint: string
}
type HintHandler = (body: string, ctx: HintContext) => string | undefined

const defaultHintHandler: HintHandler = (body, { contentType, hint }) => {
  if ('!' + contentType === hint) {
    throw new Errors.ContentTypeRejectedError()
  }
  if (contentType === hint) return body
  return undefined
}

const notHtml: HintHandler = (body, { contentType, hint }) => {
  if (contentType === hint) {
    // text/html Content-Type is sometimes used for other content; sniff the body.
    const looksLikeHtml =
      body.indexOf('<!DOCTYPE') >= 0 ||
      body.indexOf('<!doctype') >= 0 ||
      body.indexOf('</html>') >= 0 ||
      body.indexOf('</body>') >= 0
    if (looksLikeHtml) throw new Errors.ContentTypeRejectedError()
  }
  return undefined
}

const hintHandlers: Record<string, HintHandler> = {
  '*': (body) => body,
  '!text/html': notHtml,
  '!application/xhtml+xml': notHtml,
  'application/x-ns-proxy-autoconfig': (body, { contentType, hint }) => {
    if (contentType === hint) return body
    // PAC scripts are sometimes served with the wrong Content-Type.
    return body.indexOf('FindProxyForURL') >= 0 ? body : undefined
  },
}

function getResBody(contentType: string | undefined, body: string, typeHints?: string[]): string {
  if (!typeHints) return body
  const ct = contentType?.toLowerCase()
  for (const hint of typeHints) {
    const handler = hintHandlers[hint] ?? defaultHintHandler
    const result = handler(body, { contentType: ct, hint })
    if (result != null) return result
  }
  throw new Errors.ContentTypeRejectedError()
}

async function doFetch(url: string, bypassCache?: boolean): Promise<{ contentType?: string; body: string }> {
  let res: Response
  try {
    res = await fetch(url, bypassCache ? { cache: 'no-cache' } : {})
  } catch (e) {
    throw new Errors.NetworkError(e)
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & { statusCode: number }
    err.statusCode = res.status
    if (res.status === 404) throw new Errors.HttpNotFoundError(err)
    if (res.status >= 500 && res.status < 600) throw new Errors.HttpServerError(err)
    throw new Errors.HttpError(err)
  }
  const body = await res.text()
  return { contentType: res.headers.get('content-type') ?? undefined, body }
}

export function fetchUrl(destUrl: string, bypassCache?: boolean, typeHints?: string[]): Promise<string> {
  if (bypassCache && destUrl.indexOf('?') < 0) {
    const parsed = new URL(destUrl)
    parsed.searchParams.set('_', String(Date.now()))
    // Try the cache-busted URL first; fall back to the original on failure.
    return doFetch(parsed.href, bypassCache)
      .then(({ contentType, body }) => getResBody(contentType, body, typeHints))
      .catch(() => doFetch(destUrl).then(({ contentType, body }) => getResBody(contentType, body, typeHints)))
  }
  return doFetch(destUrl, bypassCache).then(({ contentType, body }) =>
    getResBody(contentType, body, typeHints),
  )
}
