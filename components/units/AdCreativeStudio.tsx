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

const FORMATS = Object.keys(AD_FORMAT_DIMENSIONS) as AdCreativeFormat[]
const PRICE_MODES = Object.keys(PRICE_MODE_LABELS) as PriceMode[]
const CTA_OPTIONS = ['Zobacz szczegóły', 'Umów prezentację', 'Sprawdź ofertę']

export function AdCreativeStudio({
  unitId,
  unitImages,
  investmentImages,
}: {
  unitId: string
  unitImages: ImageRef[]
  investmentImages: ImageRef[]
}) {
  const [priceMode, setPriceMode] = useState<PriceMode>('FROM')
  const [cta, setCta] = useState(CTA_OPTIONS[0])
  // headline: wybor z presetow albo '__custom__' (wtedy uzywamy customHeadline)
  const [headlineChoice, setHeadlineChoice] = useState<string>(HEADLINE_PRESETS[0])
  const [customHeadline, setCustomHeadline] = useState('')
  const [activeFormat, setActiveFormat] = useState<AdCreativeFormat>('feed_square')
  // bg per format: '' = auto
  const [bgByFormat, setBgByFormat] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  // nonce wymusza reload <img> nawet gdy URL ten sam (np. po bledzie)
  const [nonce, setNonce] = useState(0)

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
        <p className="text-sm font-medium text-gray-700 mb-3">Pobierz kreacje (PNG)</p>
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
          Każdy plik generowany jest na żądanie (puppeteer + Chrome). Generowanie jednego PNG trwa kilka sekund.
        </p>
      </div>
    </div>
  )
}
