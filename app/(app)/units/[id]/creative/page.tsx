import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { AdCreativeStudio } from '@/components/units/AdCreativeStudio'
import { canGenerateCreative } from '@/lib/types'

export default async function UnitCreativePage({ params }: { params: { id: string } }) {
  const unit = await prisma.unit.findUnique({
    where: { id: params.id },
    include: { images: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
  })
  if (!unit) notFound()

  // Generator niedostepny dla komorek/parkingow/garazy oraz lokali sprzedanych
  if (!canGenerateCreative(unit)) redirect(`/units/${unit.id}`)

  const investmentImages = await prisma.investmentImage.findMany({
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  })
  const investRow = await prisma.settings.findUnique({ where: { key: 'investmentName' } })
  const investmentName = investRow?.value || 'Inwestycja'

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link href="/units" className="hover:text-blue-600">Lokale</Link>
        <span>/</span>
        <Link href={`/units/${unit.id}`} className="hover:text-blue-600">{unit.number}</Link>
        <span>/</span>
        <span>Generator kreacji</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Generator kreacji reklamowych</h1>
      <p className="text-gray-500 text-sm mb-6">
        Kreacje Meta Ads (Facebook / Instagram) dla lokalu {unit.number} — inwestycja {investmentName}
      </p>

      <AdCreativeStudio
        unitId={unit.id}
        unitImages={unit.images.map((i) => ({ url: i.url, kind: i.kind }))}
        investmentImages={investmentImages.map((i) => ({ url: i.url, kind: i.kind }))}
      />
    </div>
  )
}
