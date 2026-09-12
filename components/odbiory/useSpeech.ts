'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

// Dyktowanie przez Web Speech API (Chrome: online, serwery Google; Safari/iPad:
// webkitSpeechRecognition z pakietem języka). Gdy brak wsparcia albo brak sieci —
// hook zgłasza supported=false i UI pokazuje zwykłe pole tekstowe.

type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: any) => void) | null
  onerror: ((e: any) => void) | null
  onend: (() => void) | null
}

function getCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function useSpeech(onFinal: (text: string) => void, lang = 'pl-PL') {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<Recognition | null>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  useEffect(() => {
    setSupported(!!getCtor())
  }, [])

  const stop = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {}
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) {
      setError('Dyktowanie nie jest dostępne w tej przeglądarce')
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('Dyktowanie wymaga połączenia z internetem — wpisz tekst ręcznie')
      return
    }
    setError(null)
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = false
    rec.interimResults = true
    let finalText = ''
    rec.onresult = (e: any) => {
      let inter = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else inter += r[0].transcript
      }
      setInterim(inter)
    }
    rec.onerror = (e: any) => {
      const code = e?.error || 'unknown'
      if (code === 'not-allowed' || code === 'service-not-allowed') setError('Brak zgody na mikrofon — zezwól w ustawieniach przeglądarki')
      else if (code === 'network') setError('Dyktowanie wymaga połączenia z internetem')
      else if (code !== 'aborted' && code !== 'no-speech') setError(`Dyktowanie nie powiodło się (${code})`)
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      setInterim('')
      const text = finalText.trim()
      if (text) onFinalRef.current(text)
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setError('Nie udało się uruchomić dyktowania')
    }
  }, [lang])

  useEffect(() => () => stop(), [stop])

  return { supported, listening, interim, error, start, stop }
}
