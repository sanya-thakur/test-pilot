export class ProfilerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfilerUnavailableError';
  }
}

export class ProfilerTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfilerTimeoutError';
  }
}

export class ProfilerHttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfilerHttpError';
  }
}

export class ProfilerInvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfilerInvalidResponseError';
  }
}
