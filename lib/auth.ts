import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import { rateLimit, resetRateLimit } from './rate-limit'
import { audit } from './audit-log'

/**
 * Wyciąga IP klienta z nagłówków (NextAuth daje `req.headers` w authorize).
 * Coolify/Traefik dodaje x-forwarded-for; req.url ma 0.0.0.0:3000 (wewnętrzne).
 */
function extractIp(req: { headers?: Record<string, string | string[] | undefined> } | undefined): string {
  const h = req?.headers || {}
  const xff = h['x-forwarded-for']
  if (typeof xff === 'string') return xff.split(',')[0].trim()
  if (Array.isArray(xff) && xff[0]) return String(xff[0]).split(',')[0].trim()
  const xri = h['x-real-ip']
  if (typeof xri === 'string') return xri
  return 'unknown'
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Hasło', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null
        const email = credentials.email.trim().toLowerCase()
        const ip = extractIp(req as any)

        // Rate limit per email — chroni konkretne konto przed credential stuffing
        // (atakujący zna mail, próbuje hasła). 5 prób / 15 min.
        const emailLimit = rateLimit(`signin:email:${email}`, 5, 15 * 60 * 1000)
        if (!emailLimit.allowed) {
          const mins = Math.ceil(emailLimit.retryAfterMs / 60000)
          console.warn(`[auth.signin] rate limit email=${email} ip=${ip} retry=${mins}min`)
          throw new Error(`Za dużo prób logowania na to konto. Spróbuj ponownie za ${mins} min.`)
        }
        // Rate limit per IP — chroni przed brute force z jednego źródła (atakujący
        // próbuje wielu mailów). 20 prób / 15 min — wyższy niż email bo legalni
        // userzy w jednym biurze mają wspólne IP.
        const ipLimit = rateLimit(`signin:ip:${ip}`, 20, 15 * 60 * 1000)
        if (!ipLimit.allowed) {
          const mins = Math.ceil(ipLimit.retryAfterMs / 60000)
          console.warn(`[auth.signin] rate limit ip=${ip} retry=${mins}min`)
          throw new Error(`Za dużo prób logowania z tego adresu. Spróbuj ponownie za ${mins} min.`)
        }

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) {
          // Audytujemy próby na nieistniejące maile — sygnalizują enumerację
          // kont (atakujący próbuje zgadywać kto ma konto). Fire-and-forget.
          void audit({ action: 'LOGIN_FAIL', userEmail: email, ip, metadata: { reason: 'no_user' } })
          return null
        }

        const passwordValid = await bcrypt.compare(credentials.password, user.password)
        if (!passwordValid) {
          void audit({
            action: 'LOGIN_FAIL',
            userId: user.id,
            userEmail: email,
            ip,
            metadata: { reason: 'bad_password' },
          })
          return null
        }

        // Sukces — wyczyść licznik prób dla tego emaila (atakującym zostaje IP)
        resetRateLimit(`signin:email:${email}`)
        void audit({ action: 'LOGIN_SUCCESS', userId: user.id, userEmail: email, ip })
        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    // GÓRNA granica ważności cookie/JWT = 30 dni. Realny limit egzekwuje middleware
    // per-konto na bazie token.authAt (moment logowania):
    //  - konto kierownika budowy (permissions == ['checkin']) → 30 dni (telefon na
    //    budowie; konto nie widzi kwot, CRM ani finansów — patrz docs/budowa-rozpoczecie.md)
    //  - wszyscy pozostali → 8h jak dotychczas (wrażliwe dane: PESEL, umowy)
    // Uwaga: ścieżki z kropką (pliki /uploads/*) omijają middleware (matcher) — tam
    // obowiązuje pełne 30 dni, akceptowalne (same pliki, bez danych osobowych w listach).
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: { signIn: '/auth/signin' },
  callbacks: {
    async jwt({ token, user, trigger }) {
      // Przy login (user object jest dostępne) ORAZ przy "update" session — pobierz fresh
      // permissions z DB. Bez update trigger token zachowuje permissions z login.
      // Admin (NEXT_PUBLIC_ADMIN_EMAIL) override jest w hasPermission/middleware,
      // tutaj zapisujemy tylko surowe permissions z DB.
      if (user || trigger === 'update') {
        const email = user?.email || token.email
        if (email) {
          const dbUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true, permissions: true },
          })
          if (dbUser) {
            token.id = dbUser.id
            token.permissions = dbUser.permissions
            // Konto check-in-only (kierownik budowy) → dłuższa sesja (patrz session.maxAge).
            token.checkinOnly =
              dbUser.permissions.length === 1 && dbUser.permissions[0] === 'checkin'
          }
        }
      }
      // Moment logowania — middleware liczy od niego realny limit sesji (8h / 30 dni).
      // Tylko przy świeżym loginie (user obecny); refresh tokena NIE przedłuża sesji.
      if (user) token.authAt = Date.now()
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.id as string) || ''
        session.user.permissions = (token.permissions as string[]) || []
      }
      return session
    },
  },
}
