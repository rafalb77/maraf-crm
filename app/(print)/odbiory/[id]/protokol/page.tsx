import { notFound } from 'next/navigation'
import { PROTOCOL_CSS, buildProtocolHtml } from '@/lib/odbiory/protocol-html'

/**
 * /odbiory/[id]/protokol — widok do druku (route group (print), białe tło, bez chrome).
 * Treść = lib/odbiory/protocol-html.ts (to samo, co PDF wysyłany wykonawcy).
 * ?zdjecia=1 dołącza zdjęcia; ?kolor=0 pinezki czarno-białe.
 */
export default async function ProtokolPage({ params, searchParams }: { params: { id: string }; searchParams?: Record<string, string | undefined> }) {
  const withPhotos = searchParams?.zdjecia === '1'
  const mono = searchParams?.kolor === '0'
  const built = await buildProtocolHtml(params.id, { withPhotos, mono, assets: 'url' })
  if (!built) notFound()
  const { r } = built.data
  const q = (photos: boolean, m: boolean) => [photos ? 'zdjecia=1' : '', m ? 'kolor=0' : ''].filter(Boolean).join('&')

  return (
    <div className="p-6 print:p-0">
      <style>{`${PROTOCOL_CSS} @media print { .no-print { display: none } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[190mm] flex-wrap items-center gap-2 rounded-md border border-gray-300 bg-gray-50 p-2 text-[13px]">
        <span>Widok do druku — „Drukuj → Zapisz jako PDF”. Rzut jest obrócony na całą stronę A4.</span>
        <a href={`/odbiory/${r.id}/protokol?${q(!withPhotos, mono)}`} className="rounded border border-gray-400 bg-white px-2 py-1">{withPhotos ? 'Bez zdjęć' : 'Ze zdjęciami'}</a>
        <a href={`/odbiory/${r.id}/protokol?${q(withPhotos, !mono)}`} className="rounded border border-gray-400 bg-white px-2 py-1">{mono ? 'Pinezki kolorowe' : 'Pinezki czarno-białe'}</a>
        <a href={`/api/odbiory/inspections/${r.id}/protocol/pdf?${q(withPhotos, mono)}`} className="rounded border border-gray-900 bg-white px-2 py-1 font-semibold">Pobierz PDF</a>
        <a href={`/odbiory/${r.id}`} className="ml-auto text-blue-700 underline">Wróć do karty</a>
      </div>
      <div dangerouslySetInnerHTML={{ __html: built.html }} />
    </div>
  )
}
