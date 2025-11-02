import { prisma } from '../src/lib/db';

async function createDemoUser() {
  console.log('Creating demo user...\n');

  try {
    // Check if demo user exists
    let demoUser = await prisma.user.findUnique({
      where: { email: 'demo@example.com' },
    });

    if (demoUser) {
      console.log('✅ Demo user already exists');
      console.log(`   ID: ${demoUser.id}`);
      console.log(`   Email: ${demoUser.email}`);
      console.log(`   Name: ${demoUser.name}`);
      console.log(`   Role: ${demoUser.role}`);
    } else {
      // Create demo user
      demoUser = await prisma.user.create({
        data: {
          id: 'demo-user',
          email: 'demo@example.com',
          name: 'Demo Administrator',
          role: 'admin',
        },
      });

      console.log('✅ Demo user created successfully!');
      console.log(`   ID: ${demoUser.id}`);
      console.log(`   Email: ${demoUser.email}`);
      console.log(`   Name: ${demoUser.name}`);
      console.log(`   Role: ${demoUser.role}`);
    }

    console.log('\n🎉 You can now use the chat interface!');
    console.log('   Go to: http://localhost:3001/chat\n');
  } catch (error) {
    console.error('❌ Error creating demo user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createDemoUser();
