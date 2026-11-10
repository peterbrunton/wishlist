-- Expiring offline access tokens (shopify-app-react-router future.expiringOfflineAccessTokens)
ALTER TABLE "Session" ADD COLUMN "refreshToken" TEXT;
ALTER TABLE "Session" ADD COLUMN "refreshTokenExpires" DATETIME;
