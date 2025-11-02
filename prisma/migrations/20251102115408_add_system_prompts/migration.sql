-- CreateTable
CREATE TABLE "public"."SystemPrompt" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemPrompt_isActive_idx" ON "public"."SystemPrompt"("isActive");

-- CreateIndex
CREATE INDEX "SystemPrompt_createdAt_idx" ON "public"."SystemPrompt"("createdAt");
