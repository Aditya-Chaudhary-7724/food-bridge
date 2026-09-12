// Shared result type for every Server Action mutation/query in lib/actions.
// Actions must never leak raw database errors, stack traces, or secrets to
// the client — log the real error server-side and return a safe message.

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export function actionOk<T>(data: T): ActionResult<T> {
  return { success: true, data }
}

export function actionError(context: string, error: unknown, message = 'Something went wrong. Please try again.'): ActionResult<never> {
  console.error(`[action:${context}]`, error)
  return { success: false, error: message }
}
