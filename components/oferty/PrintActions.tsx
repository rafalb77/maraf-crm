'use client'

export function PrintActions() {
  return (
    <div className="print:hidden bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 max-w-4xl mx-auto flex items-center justify-between">
      <p className="text-sm text-blue-800">
        Aby zapisać jako PDF: kliknij <strong>Drukuj</strong> → wybierz „Zapisz jako PDF" jako drukarkę.
      </p>
      <button
        onClick={() => window.print()}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
      >
        🖨 Drukuj / Zapisz PDF
      </button>
    </div>
  )
}
