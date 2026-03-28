export const logger = {
  /* eslint-disable no-console */
  error: (...args: unknown[]) => {
    // In a real application, this might send to a telemetry service like Sentry
    console.error(...args)
  },
  warn: (...args: unknown[]) => {
    console.warn(...args)
  },
  info: (...args: unknown[]) => {
    console.info(...args)
  }
  /* eslint-enable no-console */
}
