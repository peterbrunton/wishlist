-- CreateTable
CREATE TABLE "ProductPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cents" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "lastEventAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ProductPrice_shop_idx" ON "ProductPrice"("shop");
