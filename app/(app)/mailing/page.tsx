import { prisma } from '@/lib/prisma'
import { MailComposer } from '@/components/mailing/MailComposer'

export default async function MailingPage() {
  const clients = await prisma.client.findMany({
    where: { email: { not: null } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mailing</h1>
        <p className="text-gray-500 text-sm mt-1">Wyślij wiadomość do klientów bezpośrednio z systemu</p>
      </div>
      <MailComposer clients={clients} />
    </div>
  )
}
