import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Stable ids so re-running the seed is fully idempotent.
const TRAINER_ID = "seed-trainer-demo-coach";
const GROUP_ID = "seed-group-june-2026";
const CUSTOMER_ID = "seed-customer-jane-doe";
const ENTRY_ID = "seed-entry-placeholder";

async function main() {
  const trainerPasswordHash = await bcrypt.hash("password123", 10);
  const customerPasswordHash = await bcrypt.hash("test1234", 10);

  const trainer = await prisma.trainer.upsert({
    where: { email: "coach@demo.test" },
    update: {},
    create: {
      id: TRAINER_ID,
      email: "coach@demo.test",
      name: "Demo Coach",
      slug: "demo-coach",
      passwordHash: trainerPasswordHash,
    },
  });

  const group = await prisma.group.upsert({
    where: { id: GROUP_ID },
    update: {},
    create: {
      id: GROUP_ID,
      trainerId: trainer.id,
      name: "June 2026",
    },
  });

  const customer = await prisma.customer.upsert({
    where: {
      trainerId_nameNormalized: {
        trainerId: trainer.id,
        nameNormalized: "jane doe",
      },
    },
    update: {},
    create: {
      id: CUSTOMER_ID,
      trainerId: trainer.id,
      groupId: group.id,
      name: "Jane Doe",
      nameNormalized: "jane doe",
      passwordHash: customerPasswordHash,
    },
  });

  await prisma.inbodyEntry.upsert({
    where: { id: ENTRY_ID },
    update: {},
    create: {
      id: ENTRY_ID,
      customerId: customer.id,
      objectKey: "seed/placeholder.jpg",
      originalFilename: "placeholder.jpg",
      contentType: "image/jpeg",
      comment: "Great progress this month — keep it up!",
    },
  });

  console.log("Seed complete: trainer, group, customer, and one InBody entry.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
