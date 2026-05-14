'use client'
import { useState, useMemo } from 'react'
import {
  AD_FORMAT_DIMENSIONS,
  PRICE_MODE_LABELS,
  HEADLINE_PRESETS,
  type AdCreativeFormat,
  type PriceMode,
} from '@/lib/ad-creative-html'
import {
  UNIT_IMAGE_KIND_LABELS,
  INVESTMENT_IMAGE_KIND_LABELS,
} from '@/lib/types'

type ImageRef = { url: string; kind: string }

type InitialSettings = {
  priceMode: string
  ctaText: string
  headline: string
  backgrounds: string
} | null

const FORMATS = Object.keys(AD_FORMAT_DIMENSIONS) as AdCreativeFormat[]
const PRICE_MODES = Object.keys(PRICE_MODE_LABELS) as PriceMode[]
const CTA_OPTIONS = ['Zobacz szczegóły', 'Umów prezentację', 'Sprawdź ofertę']

function parseBackgrounds(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

// Z zapisanego headline odtwarza stan kontrolki (preset / wlasne / brak).
function deriveHeadline(settings: InitialSettings): { choice: string; custom: string } {
  if (!settings) return { choice: HEADLINE_PRESETS[0], custom: '' }
  const h = settings.headline
  if (!h) return { choice: '', custom: '' }
  if (HEADLINE_PRESETS.includes(h)) return { choice: h, custom: '' }
  return { choice: '__custom__', custom: h }
}

export function AdCreativeStudio({
  unitId,
  unitImages,
  investmentImages,
  initialSettings,
}: {
  unitId: string
  unitImages: ImageRef[]
  investmentImages: ImageRef[]
  initialSettings: InitialSettings
}) {
  const initHeadline = deriveHeadline(initialSettings)
  const [priceMode, setPriceMode] = useState<PriceMode>(
    (initialSettings?.priceMode as PriceMode) || 'FROM',
  )
  const [cta, setCta] = useState(initialSettings?.ctaText || CTA_OPTIONS[0])
  // headline: wybor z presetow albo '__custom__' (wtedy uzywamy customHeadline)
  const [headlineChoice, setHeadlineChoice] = useState<string>(initHeadline.choice)
  const [customHeadline, setCustomHeadline] = useState(initHeadline.custom)
  const [activeFormat, setActiveFormat] = useState<AdCreativeFormat>('feed_square')
  // bg per format: '' = auto
  const [bgByFormat, setBgByFormat] = useState<Record<string, string>>(
    parseBackgrounds(initialSettings?.backgrounds),
  )
  const [loading, setLoading] = useState(true)
  // nonce wymusza reload <img> nawet gdy URL ten sam (np. po bledzie)
  const [nonce, setNonce] = useState(0)

  // Zapis zapamietanych ustawien per lokal
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [settingsError, setSettingsError] = useState('')

  // Generator tekstow reklamowych (AI) — faza 1c
  type CopyVariant = { angle: string; headline: string; primaryText: string; description: string }
  const [copyVariants, setCopyVariants] = useState<CopyVariant[] | null>(null)
  const [copyLoading, setCopyLoading] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  async function generateCopy() {
    setCopyLoading(true)
    setCopyError('')
    try {
      const res = await fetch(`/api/units/${unitId}/ad-copy`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd generowania tekstów')
      setCopyVariants(data.variants)
    } catch (e: any) {
      setCopyError(e.message || 'Błąd generowania tekstów')
    } finally {
      setCopyLoading(false)
    }
  }

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500)
    } catch {
      setCopyError('Nie udało się skopiować do schowka')
    }
  }

  function useAsCreativeHeadline(headline: string) {
    setHeadlineChoice('__custom__')
    setCustomHeadline(headline.slice(0, 80))
  }

  const bgOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [{ value: '', label: 'Auto (wg formatu)' }]
    unitImages.forEach((img, i) => {
      const k = UNIT_IMAGE_KIND_LABELS[img.kind as keyof typeof UNIT_IMAGE_KIND_LABELS] || 'Inne'
      opts.push({ value: img.url, label: `Lokal: ${k} #${i + 1}` })
    })
    investmentImages.forEach((img, i) => {
      const k = INVESTMENT_IMAGE_KIND_LABELS[img.kind as keyof typeof INVESTMENT_IMAGE_KIND_LABELS] || 'Inne'
      opts.push({ value: img.url, label: `Inwestycja: ${k} #${i + 1}` })
    })
    return opts
  }, [unitImages, investmentImages])

  const effectiveHeadline =
    headlineChoice === '__custom__' ? customHeadline.trim() : headlineChoice

  function buildUrl(format: AdCreativeFormat, download = false) {
    const p = new URLSearchParams()
    p.set('format', format)
    p.set('priceMode', priceMode)
    p.set('cta', cta)
    if (effectiveHeadline) p.set('headline', effectiveHeadline)
    const bg = bgByFormat[format] || ''
    if (bg) p.set('bg', bg)
    if (download) p.set('download', '1')
    else p.set('_n', String(nonce))
    return `/api/units/${unitId}/ad-creative?${p.toString()}`
  }

  function buildZipUrl() {
    const p = new URLSearchParams()
    p.set('priceMode', priceMode)
    p.set('cta', cta)
    if (effectiveHeadline) p.set('headline', effectiveHeadline)
    for (const f of FORMATS) {
      const bg = bgByFormat[f]
      if (bg) p.set(`bg_${f}`, bg)
    }
    return `/api/units/${unitId}/ad-creative-zip?${p.toString()}`
  }

  async function saveSettings() {
    setSavingSettings(true)
    setSettingsError('')
    setSettingsSaved(false)
    try {
      const res = await fetch(`/api/units/${unitId}/creative-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceMode,
          ctaText: cta,
          headline: effectiveHeadline,
          backgrounds: bgByFormat,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Błąd zapisu ustawień')
      }
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2000)
    } catch (e: any) {
      setSettingsError(e.message || 'Błąd zapisu ustawień')
    } finally {
      setSavingSettings(false)
    }
  }

  const dim = AD_FORMAT_DIMENSIONS[activeFormat]
  const previewUrl = buildUrl(activeFormat)

  return (
    <div className="space-y-5">
      {/* Kontrolki */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {/* Headline (haslo) */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Hasło reklamowe (najważniejszy element kreacji)</p>
          <select
            value={headlineChoice}
            onChange={(e) => setHeadlineChoice(e.target.value)}
            className="w-full sm:w-96 text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 focus:border-blue-400 focus:outline-none"
          >
            {HEADLINE_PRESETS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
            <option value="">(bez hasła)</option>
            <option value="__custom__">✏️ Własne hasło…</option>
          </select>
          {headlineChoice === '__custom__' && (
            <input
              type="text"
              value={customHeadline}
              onChange={(e) => setCustomHeadline(e.target.value)}
              maxLength={80}
              placeholder="Wpisz własne hasło (max 80 znaków)"
              className="mt-2 w-full sm:w-96 text-sm px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:border-blue-400 focus:outline-none"
            />
          )}
        </div>

        {/* Cena */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Sposób prezentacji ceny</p>
          <div className="flex flex-wrap gap-2">
            {PRICE_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPriceMode(m)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  priceMode === m
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {PRICE_MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Tekst przycisku (CTA)</p>
          <div className="flex flex-wrap gap-2">
            {CTA_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCta(c)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  cta === c
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Tlo per format */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Zdjęcie tła — osobno dla każdego formatu</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FORMATS.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-36 flex-shrink-0">{AD_FORMAT_DIMENSIONS[f].label}</span>
                <select
                  value={bgByFormat[f] || ''}
                  onChange={(e) => setBgByFormat((prev) => ({ ...prev, [f]: e.target.value }))}
                  className="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded bg-white text-gray-700 focus:border-blue-400 focus:outline-none"
                >
                  {bgOptions.map((o) => (
                    <option key={o.value || 'auto'} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {bgOptions.length === 1 && (
            <p className="text-xs text-amber-600 mt-2">
              Brak zdjęć — wgraj wizualizacje w zakładce lokalu lub w Ustawieniach. Bez zdjęcia kreacja ma jednolite granatowe tło.
            </p>
          )}
        </div>

        {/* Zapis ustawien per lokal */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={saveSettings}
            disabled={savingSettings}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {savingSettings ? 'Zapisywanie…' : 'Zapisz ustawienia dla tego lokalu'}
          </button>
          {settingsSaved && <span className="text-sm text-green-600">✓ Zapisano</span>}
          {settingsError && <span className="text-sm text-red-500">{settingsError}</span>}
          <span className="text-xs text-gray-400">
            Cena, CTA, hasło i tła zostaną zapamiętane — przy następnym wejściu wczytają się automatycznie.
          </span>
        </div>
      </div>

      {/* Podglad — zakladki formatow */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setActiveFormat(f)
                setLoading(true)
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                activeFormat === f
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {AD_FORMAT_DIMENSIONS[f].label}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center">
          <div
            className="relative bg-gray-100 rounded-lg overflow-hidden border border-gray-200"
            style={{
              width: '100%',
              maxWidth: 480,
              aspectRatio: `${dim.w} / ${dim.h}`,
            }}
          >
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 z-10">
                Generowanie podglądu…
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={previewUrl}
              src={previewUrl}
              alt={`Podgląd ${AD_FORMAT_DIMENSIONS[activeFormat].label}`}
              className="w-full h-full object-contain"
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {dim.w} × {dim.h} px — {AD_FORMAT_DIMENSIONS[activeFormat].label}
          </p>
        </div>
      </div>

      {/* Pobieranie */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between gap-4 mb-3">
          <p className="text-sm font-medium text-gray-700">Pobierz kreacje (PNG)</p>
          <a
            href={buildZipUrl()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Pobierz wszystkie (ZIP)
          </a>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FORMATS.map((f) => (
            <a
              key={f}
              href={buildUrl(f, true)}
              className="inline-flex items-center justify-between gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              <span>{AD_FORMAT_DIMENSIONS[f].label}</span>
              <span className="text-xs text-gray-400">
                {AD_FORMAT_DIMENSIONS[f].w}×{AD_FORMAT_DIMENSIONS[f].h}
              </span>
            </a>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Każdy plik generowany jest na żądanie (puppeteer + Chrome). Pojedynczy PNG — kilka sekund; ZIP ze wszystkimi 4 — kilkanaście.
        </p>
      </div>

      {/* Teksty reklamowe AI — faza 1c */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-sm font-medium text-gray-700">Teksty reklamowe (AI)</p>
            <p className="text-xs text-gray-400 mt-0.5">
              5 wariantów tekstu do Menedżera Reklam Meta — nagłówek, tekst główny, opis. Generuje Claude na podstawie danych lokalu.
            </p>
          </div>
          <button
            type="button"
            onClick={generateCopy}
            disabled={copyLoading}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {copyLoading ? 'Generowanie…' : copyVariants ? 'Generuj ponownie' : 'Generuj teksty'}
          </button>
        </div>

        {copyError && <p className="text-red-500 text-xs mb-3">{copyError}</p>}

        {copyVariants && (
          <div className="space-y-3">
            {copyVariants.map((v, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-block bg-blue-50 text-blue-700 text-[11px] font-semibold px-2 py-0.5 rounded">
                    {v.angle}
                  </span>
                  <button
                    type="button"
                    onClick={() => useAsCreativeHeadline(v.headline)}
                    className="text-xs text-amber-700 hover:text-amber-800 font-medium"
                  >
                    Użyj nagłówka na kreacji →
                  </button>
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Nagłówek</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(v.headline, `h-${i}`)}
                        className="text-[11px] text-gray-500 hover:text-blue-600"
                      >
                        {copiedKey === `h-${i}` ? '✓ skopiowano' : 'kopiuj'}
                      </button>
                    </div>
                    <p className="text-gray-900 font-medium">{v.headline}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Tekst główny</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(v.primaryText, `p-${i}`)}
                        className="text-[11px] text-gray-500 hover:text-blue-600"
                      >
                        {copiedKey === `p-${i}` ? '✓ skopiowano' : 'kopiuj'}
                      </button>
                    </div>
                    <p className="text-gray-700">{v.primaryText}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Opis</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(v.description, `d-${i}`)}
                        className="text-[11px] text-gray-500 hover:text-blue-600"
                      >
                        {copiedKey === `d-${i}` ? '✓ skopiowano' : 'kopiuj'}
                      </button>
                    </div>
                    <p className="text-gray-700">{v.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
