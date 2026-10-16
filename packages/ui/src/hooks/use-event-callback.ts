"use client"

import { useInsertionEffect, useRef, useState } from "react"

// Event and effect callbacks only; never call during render.
export function useEventCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
) {
  const callbackRef = useRef<typeof callback | null>(null)

  const [eventCallback] = useState(() => (...args: Args) => {
    const currentCallback = callbackRef.current

    if (!currentCallback) {
      throw new Error("useEventCallback cannot be called before commit")
    }

    return currentCallback(...args)
  })

  useInsertionEffect(() => {
    callbackRef.current = callback
  })

  return eventCallback
}
