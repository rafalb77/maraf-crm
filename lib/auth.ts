import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Hasło', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user) return null

        const passwordValid = await bcrypt.compare(credentials.password, user.password)
        if (!passwordValid) return null

        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  session: { strategy: 'jwt' },
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
          }
        }
      }
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
