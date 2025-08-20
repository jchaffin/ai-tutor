import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const baseClient = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  })

  if (process.env.PRISMA_ACCELERATE_URL) {
    return baseClient.$extends(withAccelerate()) as unknown as PrismaClient
  }

  return baseClient
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
