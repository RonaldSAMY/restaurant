-- AlterTable (DEFAULT 0 backfills existing 2.1 rows, then is dropped)
ALTER TABLE "OrderItem" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ALTER COLUMN "position" DROP DEFAULT;

-- Hand-written CHECK constraint (Prisma schema cannot express it).
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_position_check" CHECK ("position" >= 0);
