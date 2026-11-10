-- CreateTable
CREATE TABLE "PendingPriceDrop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fromCents" INTEGER NOT NULL,
    "toCents" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "error" TEXT
);

-- CreateIndex
CREATE INDEX "PendingPriceDrop_sentAt_idx" ON "PendingPriceDrop"("sentAt");

-- CreateIndex
CREATE INDEX "PendingPriceDrop_shop_customerId_idx" ON "PendingPriceDrop"("shop", "customerId");
