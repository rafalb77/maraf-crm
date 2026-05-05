'use client'
import { useRef, useState } from 'react'
import { Client } from '@prisma/client'
import { CLIENT_STATUS_LABELS, type ClientStatus } from '@/lib/types'
import { RichEditor } from './RichEditor'

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function MailComposer({ clients }: { clients: Client[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<
    { type: 'success' | 'error' | 'partial'; text: string; details?: string[] } | null
  >(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = clients.filter((c) => {
    if (filterStatus && c.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return `${c.firstName} ${c.lastName} ${c.email || ''}`.toLowerCase().includes(q)
    }
    return true
  })

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  const selectAll = () => setSelectedIds(filtered.map((c) => c.id))
  const deselectAll = () => setSelectedIds([])

  function addFiles(list: FileList | null) {
    if (!list) return
    setFiles((prev) => [...prev, ...Array.from(list)])
  }
  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }
  const totalSize = files.reduce((s, f) => s + f.size, 0)
  const sizeLabel =
    totalSize < 1024 * 1024
      ? `${Math.round(totalSize / 1024)} KB`
      : `${(totalSize / (1024 * 1024)).toFixed(1)} MB`

  function insertVariable(v: string) {
    // Insert into HTML body. If empty, start with a paragraph; otherwise append before closing tag.
    setMessage((m) => {
      const token = `{${v}}`
      if (!m || m === '<p></p>') return `<p>${token}</p>`
      // Try to inject before last closing tag, fallback to append
      const lastCloseIdx = m.lastIndexOf('</')
      if (lastCloseIdx > 0) {
        return m.slice(0, lastCloseIdx) + token + m.slice(lastCloseIdx)
      }
      return m + token
    })
  }

  function isMessageEmpty(html: string) {
    const stripped = html.replace(/<[^>]+>/g, '').trim()
    return stripped.length === 0
  }

  async function handleSend() {
    if (selectedIds.length === 0 || !subject || isMessageEmpty(message)) return
    setSending(true)
    setResult(null)

    const fd = new FormData()
    fd.append('clientIds', JSON.stringify(selectedIds))
    fd.append('subject', subject)
    fd.append('message', message)
    fd.append('isHtml', '1')
    for (const f of files) fd.append('attachments', f)

    try {
      const res = await fetch('/api/mailing/send', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) {
        if (data.failed?.length > 0) {
          setResult({
            type: 'partial',
            text: `Wysłano ${data.sent}/${data.total}. Błędy: ${data.failed.length}`,
            details: data.failed.map((f: any) => `${f.email}: ${f.reason}`),
          })
        } else {
          setResult({ type: 'success', text: `Wysłano do ${data.sent} odbiorców` })
          setSubject('')
          setMessage('')
          setSelectedIds([])
          setFiles([])
        }
      } else {
        setResult({ type: 'error', text: data.error || 'Błąd wysyłki' })
      }
    } catch {
      setResult({ type: 'error', text: 'Błąd sieci' })
    }
    setSending(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Recipients */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Odbiorcy</h3>
        <input
          type="search"
          placeholder="Szukaj..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputCls + ' mb-2'}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className={inputCls + ' bg-white mb-3'}
        >
          <option value="">Wszystkie statusy</option>
          {Object.entries(CLIENT_STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <div className="flex gap-2 mb-3 text-xs">
          <button onClick={selectAll} className="text-blue-600 hover:text-blue-700">Zaznacz wszystkie</button>
          <span className="text-gray-300">|</span>
          <button onClick={deselectAll} className="text-gray-500 hover:text-gray-700">Odznacz</button>
        </div>
        <div className="max-h-96 overflow-y-auto -mx-2">
          {filtered.length === 0 ? (
            <p className="text-gray-400 text-sm px-2">Brak klientów z adresem email</p>
          ) : (
            filtered.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(c.id)}
                  onChange={() => toggle(c.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {c.firstName} {c.lastName}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{c.email}</p>
                </div>
                <span className="text-xs text-gray-400">
                  {CLIENT_STATUS_LABELS[c.status as ClientStatus]}
                </span>
              </label>
            ))
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 text-sm">
          <span className="font-medium text-gray-900">{selectedIds.length}</span>
          <span className="text-gray-500"> zaznaczonych</span>
        </div>
      </div>

      {/* Composer */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Treść wiadomości</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Temat</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputCls}
              placeholder="np. Informacja o postępach budowy"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Treść</label>
              <div className="flex gap-1.5 text-xs">
                <span className="text-gray-500">Wstaw zmienną:</span>
                {['imie', 'nazwisko', 'firma'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="px-2 py-0.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  >
                    {`{${v}}`}
                  </button>
                ))}
              </div>
            </div>
            <RichEditor
              value={message}
              onChange={setMessage}
              placeholder="Szanowny Panie {imie}, informujemy, że..."
            />
            <p className="text-xs text-gray-400 mt-1">
              Zmienne <code>{'{imie}'}</code>, <code>{'{nazwisko}'}</code>, <code>{'{firma}'}</code> są podmieniane indywidualnie dla każdego odbiorcy.
            </p>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Załączniki</label>
            <div className="border border-dashed border-gray-300 rounded-lg p-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => {
                  addFiles(e.target.files)
                  if (e.target) e.target.value = ''
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Dodaj plik
              </button>
              {files.length > 0 && (
                <div className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm bg-gray-50 px-2 py-1 rounded"
                    >
                      <span className="text-gray-700 truncate flex-1 min-w-0">📎 {f.name}</span>
                      <span className="text-xs text-gray-400 mx-2 flex-shrink-0">
                        {f.size < 1024 * 1024
                          ? `${Math.round(f.size / 1024)} KB`
                          : `${(f.size / (1024 * 1024)).toFixed(1)} MB`}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-red-500 hover:text-red-700 text-xs flex-shrink-0"
                      >
                        usuń
                      </button>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400 pt-1">Łącznie: {sizeLabel}</p>
                </div>
              )}
            </div>
          </div>

          {result && (
            <div
              className={`p-3 rounded-lg text-sm ${
                result.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : result.type === 'partial'
                    ? 'bg-yellow-50 text-yellow-800'
                    : 'bg-red-50 text-red-700'
              }`}
            >
              <p>{result.text}</p>
              {result.details && (
                <ul className="mt-2 text-xs space-y-0.5">
                  {result.details.map((d, i) => <li key={i}>• {d}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-500">
              {selectedIds.length === 0
                ? 'Wybierz odbiorców z lewej kolumny'
                : `Zostanie wysłane do ${selectedIds.length} odbiorców (każdy osobno)`}
            </p>
            <button
              onClick={handleSend}
              disabled={sending || selectedIds.length === 0 || !subject || isMessageEmpty(message)}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {sending ? 'Wysyłanie...' : 'Wyślij'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
