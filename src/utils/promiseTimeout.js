export function promiseTimeout(promise, milliseconds, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds)
    }),
  ]).finally(() => clearTimeout(timer))
}
