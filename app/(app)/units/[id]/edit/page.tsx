import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { UnitForm } from '@/components/units/UnitForm'
import Link from 'next/link'

export default async function EditUnitPage({ params }: { params: { id: string } }) {
  const unit = await prisma.unit.findUnique({ where: { id: params.id } })
  if (!unit) notFound()

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/units" className="hover:text-blue-600">Lokale</Link>
          <span>/</span>
          <Link href={`/units/${unit.id}`} className="hover:text-blue-600">{unit.number}</Link>
          <span>/</span>
          <span>Edycja</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Edytuj lokal {unit.number}</h1>
      </div>
      <UnitForm unit={unit} />
    </div>
  )
}
