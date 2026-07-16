// Sekcja szczegolow faktury pobranej z KSeF: pelne dane sprzedawcy i nabywcy,
// informacja o platnosci (z FA) oraz pozycje faktury (FaWiersz).
// Renderowane tylko gdy faktura ma snapshot ksefData (pole Json wypelniane
// przez parser w lib/ksef-client.ts). Server component (bez interakcji).
import { fmtMoney, fmtDate } from '@/lib/finanse-format'
import { KSEF_PAYMENT_METHOD_LABELS, type KsefInvoiceData, type KsefParty } from '@/lib/types'

export function KsefInvoiceDetails({ data }: { data: KsefInvoiceData }) {
  const lines = data.lines || []
  const payment = data.payment

  return (
    <div className="mt-8">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Dane z KSeF</h2>
        <span className="text-[11px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium">
          {data.schema && data.schema !== '?' ? data.schema : 'e-Faktura'}
        </span>
      </div>

      {/* Sprzedawca + nabywca */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PartyCard title="Sprzedawca" party={data.seller} />
        <PartyCard title="Nabywca" party={data.buyer} />
      </div>

      {/* Platnosc wg KSeF */}
      {payment && (payment.paid || payment.dueDate || payment.methodCode || (payment.partial?.length ?? 0) > 0) && (
        <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Płatność (wg KSeF)</p>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500">Status: </span>
              {payment.paid ? (
                <span className="text-green-700 font-medium">
                  Opłacona{payment.paidDate ? ` (${fmtDate(payment.paidDate)})` : ''}
                </span>
              ) : (payment.partial?.length ?? 0) > 0 ? (
                <span className="text-emerald-700 font-medium">Częściowo opłacona</span>
              ) : (
                <span className="text-gray-700">Nieoznaczona jako opłacona</span>
              )}
            </div>
            {payment.methodCode && (
              <div>
                <span className="text-gray-500">Forma: </span>
                <span className="text-gray-800">{KSEF_PAYMENT_METHOD_LABELS[payment.methodCode] || payment.methodCode}</span>
              </div>
            )}
            {payment.dueDate && (
              <div>
                <span className="text-gray-500">Termin: </span>
                <span className="text-gray-800 tabular-nums">{fmtDate(payment.dueDate)}</span>
              </div>
            )}
          </div>
          {(payment.partial?.length ?? 0) > 0 && (
            <ul className="mt-2 text-xs text-gray-600 space-y-0.5">
              {payment.partial!.map((p, i) => (
                <li key={i} className="tabular-nums">• {fmtMoney(p.amount)}{p.date ? ` — ${fmtDate(p.date)}` : ''}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Pozycje faktury */}
      <div className="mt-4">
        <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Pozycje faktury ({lines.length})</p>
        {lines.length === 0 ? (
          <p className="text-sm text-gray-400">Brak pozycji w danych z KSeF.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[860px] lg:min-w-0">
              <thead className="bg-gray-50 border-b border-gray-200 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-gray-700 w-8">Lp</th>
                  <th className="px-3 py-2 font-medium text-gray-700">Nazwa</th>
                  <th className="px-3 py-2 font-medium text-gray-700">J.m.</th>
                  <th className="px-3 py-2 font-medium text-gray-700 text-right">Ilość</th>
                  <th className="px-3 py-2 font-medium text-gray-700 text-right">Cena netto</th>
                  <th className="px-3 py-2 font-medium text-gray-700 text-right">Wartość netto</th>
                  <th className="px-3 py-2 font-medium text-gray-700 text-right">VAT</th>
                  <th className="px-3 py-2 font-medium text-gray-700 text-right">Wartość brutto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-gray-500 tabular-nums">{l.no ?? i + 1}</td>
                    <td className="px-3 py-2 text-gray-800">{l.name || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{l.unit || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{fmtQty(l.quantity)}</td>
                    <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{l.unitPriceNet != null ? fmtMoney(l.unitPriceNet) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{l.net != null ? fmtMoney(l.net) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-500 tabular-nums">{fmtVat(l.vatRate)}</td>
                    <td className="px-3 py-2 text-right text-gray-900 tabular-nums font-medium">{l.gross != null ? fmtMoney(l.gross) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function PartyCard({ title, party }: { title: string; party?: KsefParty }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase font-semibold mb-1">{title}</p>
      <p className="text-base font-semibold text-gray-900">{party?.name || '—'}</p>
      {party?.nip && <p className="text-sm text-gray-600 mt-0.5">NIP: {party.nip}</p>}
      {(party?.addressLines || []).map((line, i) => (
        <p key={i} className="text-sm text-gray-600">{line}</p>
      ))}
      {party?.countryCode && party.countryCode !== 'PL' && (
        <p className="text-sm text-gray-600">Kraj: {party.countryCode}</p>
      )}
      {(party?.email || party?.phone) && (
        <p className="text-xs text-gray-400 mt-1">
          {[party?.email, party?.phone].filter(Boolean).join(' • ')}
        </p>
      )}
    </div>
  )
}

function fmtQty(q: number | null | undefined): string {
  if (q === null || q === undefined) return '—'
  return q.toLocaleString('pl-PL', { maximumFractionDigits: 3 })
}

function fmtVat(v: string | null | undefined): string {
  if (!v) return '—'
  // Czysto liczbowa stawka → dodaj %. Slowne (zw/np/0) zostaw jak jest.
  return /^\d+([.,]\d+)?$/.test(v) ? `${v}%` : v
}
