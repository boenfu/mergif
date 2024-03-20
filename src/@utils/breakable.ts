export function breakable<T>(fn: (
  idle: () => Promise<void>
) => Promise<T>): Promise<T> {
  return fn(() => new Promise<any>(resolve => requestIdleCallback(resolve)))
}
