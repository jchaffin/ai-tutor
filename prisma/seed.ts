import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  const hashedPassword = await bcrypt.hash('demo123', 10)
  const hashedTestPassword = await bcrypt.hash('test', 10)

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@aitutordemo.com' },
    update: {},
    create: {
      email: 'demo@aitutordemo.com',
      name: 'Demo User',
      password: hashedPassword,
    },
  })

  const testUser = await prisma.user.upsert({
    where: { email: 'test@test.com' },
    update: {},
    create: {
      email: 'test@test.com',
      name: 'Test User',
      password: hashedTestPassword,
    },
  })

  console.log('✅ Demo user created:', {
    id: demoUser.id,
    email: demoUser.email,
    name: demoUser.name,
  })

  console.log('✅ Test user created:', {
    id: testUser.id,
    email: testUser.email,
    name: testUser.name,
  })

  console.log('🎉 Seeding finished!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
