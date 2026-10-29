/**
 * Seeds reference data (the game catalog) into the database.
 * Usage: npm run db:seed   (requires DATABASE_URL)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { GAME_LIST } from '@playtogether/shared';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to server/.env and configure it first.');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  for (const g of GAME_LIST) {
    await prisma.gameDefinition.upsert({
      where: { id: g.id },
      update: { name: g.name, minPlayers: g.minPlayers, maxPlayers: g.maxPlayers, status: g.status },
      create: { id: g.id, name: g.name, minPlayers: g.minPlayers, maxPlayers: g.maxPlayers, status: g.status },
    });
  }
  console.log(`Seeded ${GAME_LIST.length} game definitions.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
