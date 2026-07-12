// errors — network/HTTP error hierarchy. Ported from omega-target/src/errors.coffee.

export class NetworkError extends Error {
  constructor(err?: unknown) {
    super()
    this.cause = err
    this.name = 'NetworkError'
  }
}

export class HttpError extends NetworkError {
  statusCode?: number
  constructor(err?: unknown) {
    super(err)
    this.statusCode = (this.cause as { statusCode?: number } | undefined)?.statusCode
    this.name = 'HttpError'
  }
}

export class HttpNotFoundError extends HttpError {
  constructor(err?: unknown) {
    super(err)
    this.name = 'HttpNotFoundError'
  }
}

export class HttpServerError extends HttpError {
  constructor(err?: unknown) {
    super(err)
    this.name = 'HttpServerError'
  }
}

export class ContentTypeRejectedError extends Error {
  constructor() {
    super()
    this.name = 'ContentTypeRejectedError'
  }
}
