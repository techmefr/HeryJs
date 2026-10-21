-- AlterTable
ALTER TABLE "SsoConnection" ADD COLUMN     "protocol" TEXT NOT NULL DEFAULT 'oidc',
ADD COLUMN     "samlCertificate" TEXT,
ADD COLUMN     "samlEntryPoint" TEXT,
ALTER COLUMN "clientSecret" DROP NOT NULL;
