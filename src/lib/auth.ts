import NextAuth from 'next-auth'
import type { Session, User } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

const authConfig = {
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email : undefined
        const password = typeof credentials?.password === 'string' ? credentials.password : undefined
        if (!email || !password) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user || !user.password) return null

        const isValid = await bcrypt.compare(password, user.password)
        if (!isValid) return null

        return { id: user.id, email: user.email, name: user.name }
      }
    })
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/auth/signin' },
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: User | null }) {
      if (user) (token as any).id = (user as any).id
      return token
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (token) (session.user as any).id = (token as any).id as string
      return session
    }
  }
}

const nextAuthInit = (NextAuth as unknown as (cfg: unknown) => any)
export const { auth, handlers, signIn, signOut } = nextAuthInit(authConfig)
