import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../api/client.js'

// Loads data with `fetcher` (must be stable: wrap it in useCallback) and reloads when it changes.
// Returns { data, loading, error, reload, refreshing }. `loading` is true only until the first result, so
// reloads after a save keep showing the current data instead of flashing the skeleton.
// `refreshing`: the data on screen is from a previous fetcher (filters changed, new data on its way).
export function useApi(fetcher) {
  const [state, setState] = useState({ data: null, loading: true, error: null, source: null })
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    try {
      const data = await fetcher()
      if (id === requestId.current) setState({ data, loading: false, error: null, source: fetcher })
    } catch (err) {
      if (id === requestId.current) setState((s) => ({ ...s, loading: false, error: getErrorMessage(err), source: fetcher }))
    }
  }, [fetcher])

  useEffect(() => {
    load()
  }, [load])

  const reload = useCallback(() => {
    setState((s) => (s.error ? { data: null, loading: true, error: null, source: null } : s))
    return load()
  }, [load])

  const { source, ...rest } = state
  return { ...rest, reload, refreshing: rest.data !== null && source !== fetcher }
}
