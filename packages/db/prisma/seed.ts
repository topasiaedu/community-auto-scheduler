/**
 * Seeds the default NMCAS project used until P4 multi-project UI.
 * Id must match `DEFAULT_PROJECT_ID` in API env (default: `nmcas-default-project`).
 */

import { PrismaClient } from "@prisma/client";

const DEFAULT_PROJECT_ID = "nmcas-default-project";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.project.upsert({
    where: { id: DEFAULT_PROJECT_ID },
    create: {
      id: DEFAULT_PROJECT_ID,
      name: "NMCAS",
      description: "Default project until P4 (project switcher).",
    },
    update: {
      name: "NMCAS",
    },
  });
}

void main()
  .then(() => {
    console.log(`Seed OK: Project "${DEFAULT_PROJECT_ID}"`);
  })
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
