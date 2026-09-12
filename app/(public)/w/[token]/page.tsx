import { ContractorPortal } from '@/components/odbiory/ContractorPortal'

/** /w/[token] — pakiet usterek wykonawcy (bez logowania, bez aplikacji). */
export default function ContractorPage({ params }: { params: { token: string } }) {
  return <ContractorPortal token={params.token} />
}
