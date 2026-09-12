import { NewInspectionWizard } from '@/components/odbiory/NewInspectionWizard'

/** /odbiory/nowy — kreator: Projekt → Budynek → Klatka → Kondygnacja → rodzaj i wykonawca. */
export default function NowyOdbiorPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Nowy odbiór</h1>
        <p className="mt-1 text-sm text-gray-500">Wybierz zakres, a potem przejdziesz od razu do rzutu na tablecie.</p>
      </div>
      <NewInspectionWizard />
    </div>
  )
}
