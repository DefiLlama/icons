import { cache } from "@defillama/sdk";

export type CoinGeckoCatalog = {
  schemaVersion: 2;
  generatedAt: number;
  coins: Record<string, {
    name: string;
    symbol: string;
    logoURI?: string;
    platforms: Record<string, string | null>;
  }>;
};

const CATALOG_KEY = "tokenlist/coingecko-catalog.json";

export async function getCGTokenCatelog(): Promise<CoinGeckoCatalog> {
  const catalog = await cache.readCache(CATALOG_KEY, { readFromR2Cache: true });
  if (catalog.schemaVersion !== 2 || !catalog.coins) {
    throw new Error("Expected CoinGecko catalog schema 2");
  }
  return catalog;
}
