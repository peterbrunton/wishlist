-- CreateTable
CREATE TABLE "WishlistSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productIds" TEXT NOT NULL,
    "lastEventAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "WishlistSnapshot_shop_idx" ON "WishlistSnapshot"("shop");
