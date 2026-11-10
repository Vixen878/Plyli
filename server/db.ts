import { PrismaClient } from '@prisma/client';

const globalDatabase = globalThis as typeof globalThis & { plyliPrisma?: PrismaClient };
// Prisma's formatted query errors can contain bound answer/credential values.
// Request handlers log only error classes and correlation IDs.
export const db = globalDatabase.plyliPrisma ?? new PrismaClient({ log: [] });
if (process.env.NODE_ENV !== 'production') globalDatabase.plyliPrisma = db;
