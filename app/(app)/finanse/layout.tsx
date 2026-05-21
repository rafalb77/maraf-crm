import { getActiveCompany } from '@/lib/finanse-company'
import { COMPANY_LABELS } from '@/lib/types'
import { CompanySwitcher } from '@/components/finanse/CompanySwitcher'

// Layout modulu Finanse — pasek z przelacznikiem aktywnej firmy na gorze.
// Maraf i Maraf Development sa osobnymi podmiotami; wszystkie podstrony
// pokazuja dane aktywnej firmy (czytaja getActiveCompany() z cookie).
export default function FinanseLayout({ children }: { children: React.ReactNode }) {
  const company = getActiveCompany()
  const isMD = company === 'MARAF_DEVELOPMENT'

  return (
    <div>
      <div
        className="sticky top-0 z-20 border-b px-8 py-3 flex items-center justify-between"
        style={{
          backgroundColor: isMD ? '#faf5ff' : '#ffffff',
          borderColor: isMD ? '#e9d5ff' : '#e5e7eb',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold" style={{ color: isMD ? '#7c3aed' : '#111827' }}>
            {COMPANY_LABELS[company]}
          </span>
          <span className="text-xs text-gray-400">— moduł Finanse</span>
        </div>
        <CompanySwitcher active={company} />
      </div>
      {children}
    </div>
  )
}
