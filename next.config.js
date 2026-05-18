/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    domains: ['localhost'],
  },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma', 'dxf-parser'],
  },
  // dxf-parser i inne biblioteki Node-only — nie bundluj po stronie klienta
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false }
    }
    return config
  },
  /**
   * Security headers — chronią przed clickjacking, MITM downgrade, MIME sniffing,
   * leak'iem referer'a do zewnętrznych domen. Zastosowane do wszystkich ścieżek.
   *
   * UWAGA o CSP: świadomie NIE dodaję `Content-Security-Policy` na tym etapie —
   * Next.js + Google Calendar + Open-Meteo + RSS feeds + Meta Ads + iframe PDF
   * generują dużo cross-origin requestów, źle skonfigurowany CSP może łatwo
   * zablokować legalny ruch. Dodać CSP osobno po testach (raport-only mode najpierw).
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // HSTS — wymusza HTTPS przez przeglądarki (6 miesięcy, z subdomenami).
          // Wartość 15768000 s = 6 miesięcy. Standardowo 1 rok (31536000), ale
          // zaczynamy zachowawczo żeby rollback był łatwy gdyby coś.
          { key: 'Strict-Transport-Security', value: 'max-age=15768000; includeSubDomains' },
          // Brak osadzania w iframe = brak clickjacking
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Przeglądarka nie zgaduje MIME — blokuje "drive-by" wykonanie złego pliku jako JS
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Nie wysyłaj URL-i CRM do zewnętrznych domen w nagłówku Referer
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Wyłączenie API które aplikacji nie używa (mniejszy attack surface)
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
