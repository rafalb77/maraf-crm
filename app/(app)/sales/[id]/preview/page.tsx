import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download } from 'lucide-react'
import { generateContractHtml } from '@/lib/contract-generator'

export default async function ContractPreviewPage({ params }: { params: { id: string } }) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      contractClients: { include: { client: true }, orderBy: { position: 'asc' } },
      contractUnits: { include: { unit: true } },
    },
  })
  if (!contract) notFound()

  const isReservation = contract.type === 'REZERWACYJNA'
  let html: string | null = null
  let error: string | null = null
  if (isReservation) {
    try {
      html = await generateContractHtml(contract)
    } catch (e: any) {
      error = e?.message || 'Błąd renderowania umowy'
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link href={`/sales/${contract.id}`} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-3">
            <ArrowLeft className="w-4 h-4" />
            Powrót do umowy
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Podgląd umowy {contract.number}</h1>
          <p className="text-gray-500 text-sm mt-1">Tak wygląda treść wygenerowanego dokumentu. Pola bez danych pokazują się jako „…".</p>
        </div>
        {isReservation && (
          <a
            href={`/api/contracts/${contract.id}/generate`}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 flex-shrink-0"
          >
            <Download className="w-4 h-4" />
            Pobierz .docx
          </a>
        )}
      </div>

      {!isReservation ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-900">
          Podgląd dostępny tylko dla umów <strong>rezerwacyjnych</strong> (jedyny typ z szablonem). Ta umowa jest typu {contract.type}.
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-900">
          <p className="font-medium">Nie udało się wyrenderować podglądu</p>
          <p className="mt-1 text-red-800">{error}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10">
          <style>{`
            .contract-preview { color:#1f2937; font-size:14px; line-height:1.6; }
            .contract-preview p { margin:0 0 10px; text-align:justify; }
            .contract-preview h1,.contract-preview h2,.contract-preview h3 { font-weight:700; margin:18px 0 8px; }
            .contract-preview h1 { font-size:18px; text-align:center; }
            .contract-preview strong { font-weight:600; }
            .contract-preview table { width:100%; border-collapse:collapse; margin:10px 0; }
            .contract-preview td,.contract-preview th { border:1px solid #d1d5db; padding:6px 8px; vertical-align:top; }
            .contract-preview ul,.contract-preview ol { margin:0 0 10px 22px; }
          `}</style>
          <div className="contract-preview" dangerouslySetInnerHTML={{ __html: html || '' }} />
        </div>
      )}
    </div>
  )
}
