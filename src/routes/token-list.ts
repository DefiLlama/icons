import { getCGTokenCatelog, CoinGeckoCatalog } from "../utils/token-catalog";
import { Response } from "express";
import { setCache, getCache } from "../utils/cache-client";
import { forEveryIntervalOf, ttlForEveryIntervalOf } from "../utils/cache-control-helper";
import { fetchJsonWithTimeout } from "../utils/async-timeout";

export type TokenList = {
  tokens: {
    [chain: number]: {
      [token: string]: string;
    };
  };
  gecko?: {
    [geckoId: string]: string;
  };
  geckoPlatforms?: {
    [geckoId: string]: Array<{
      chainId: number;
      tokenAddress: string;
    }>;
  };
};

const oneInchChains = {
	ethereum: 1,
	bsc: 56,
	polygon: 137,
	optimism: 10,
	arbitrum: 42161,
	gnosis: 100,
	avax: 43114,
	fantom: 250,
	klaytn: 8217,
	aurora: 1313161554,
	zksync: 324,
	base: 8453
};

export const geckoChainsMap: { [chain: string]: number } = {
  ethereum: 1,
  "binance-smart-chain": 56,
  "polygon-pos": 137,
  "optimistic-ethereum": 10,
  "arbitrum-one": 42161,
  avalanche: 43114,
  xdai: 100,
  fantom: 250,
  "klay-token": 8217,
  aurora: 1313161554,
  celo: 42220,
  cronos: 25,
  dogechain: 2000,
  moonriver: 1285,
  bittorrent: 199,
  oasis: 42262,
  velas: 106,
  heco: 128,
  "harmony-shard-0": 1666600000,
  boba: 288,
  "okex-chain": 66,
  fuse: 122,
  moonbeam: 1284,
  base: 8453,
  blast: 81457,
  sonic: 146,
  berachain: 80094,
  zksync: 324,
  "plume-mainnet": 98866,
  unichain: 130,
  scroll: 534352,
  hyperliquid: 999,
  monad: 143,
  plasma: 9745,
  ink: 57073,
  "world-chain": 480,
  megaeth: 4326,
  katana: 747474,
  stable: 988,
  tempo: 4217,
  robinhood: 4663,
};

export const TOKEN_LIST_CACHE_KEY = "token-list-v6";
export const GECKO_LOGO_LIST_CACHE_KEY = "token-gecko-logos-v2";
const TOKEN_LIST_FETCH_TIMEOUT_MS = 8000;

const normalizeLogoUrl = (url: string) => url.replace("coin-images.coingecko.com", "assets.coingecko.com");
const normalizeGeckoKey = (value: string) => value.trim().toLowerCase();

const getCatalogLogos = (catalog: CoinGeckoCatalog) => {
  const logos: Record<string, string> = {};
  for (const id in catalog.coins) {
    const logoURI = catalog.coins[id].logoURI;
    if (logoURI) logos[id] = normalizeLogoUrl(logoURI);
  }
  return logos;
};

export const compileGeckoLogoList = async (): Promise<Record<string, string>> => {
  return getCatalogLogos(await getCGTokenCatelog());
};

export const compileTokenList = async (): Promise<TokenList> => {
  const catalog = await getCGTokenCatelog();
  const [uniList, sushiList, ownList] = await Promise.allSettled([
    fetchJsonWithTimeout<any>("https://tokens.uniswap.org/", TOKEN_LIST_FETCH_TIMEOUT_MS),
    fetchJsonWithTimeout<any>("https://token-list.sushi.com/", TOKEN_LIST_FETCH_TIMEOUT_MS),
    fetchJsonWithTimeout<any>(
      "https://raw.githubusercontent.com/0xngmi/tokenlists/master/canto.json",
      TOKEN_LIST_FETCH_TIMEOUT_MS,
    ),
  ]);

  const oneInch = await Promise.allSettled(
    Object.values(oneInchChains).map(async (chainId) =>
      fetchJsonWithTimeout<Record<string, any>>(`https://tokens.1inch.io/v1.2/${chainId}`, TOKEN_LIST_FETCH_TIMEOUT_MS),
    ),
  );

  const oneInchList = Object.values(oneInchChains)
    .map((chainId, i) => {
      const result = oneInch[i];
      if (result.status !== "fulfilled" || !result.value || Array.isArray(result.value)) {
        return [];
      }
      return Object.values(result.value).map((token: any) => ({
        ...token,
        chainId,
      }));
    })
    .flat();

  const logoDirectory: { [chain: number]: { [token: string]: string } } = {};
  const geckoPlatformDirectory: NonNullable<TokenList["geckoPlatforms"]> = {};
  const geckoLogoDirectory = getCatalogLogos(catalog);

  if (uniList.status === "fulfilled" && uniList.value.tokens) {
    uniList.value.tokens.forEach((token: { address: string; logoURI: string; chainId: number }) => {
      const address = token.address.toLowerCase();

      if (!logoDirectory[token.chainId]) {
        logoDirectory[token.chainId] = {};
      }

      if (!logoDirectory[token.chainId][address] && token.logoURI && !token.logoURI.startsWith("ipfs://")) {
        logoDirectory[token.chainId][address] = token.logoURI;
      }
    });
  }

  if (sushiList.status === "fulfilled" && sushiList.value.tokens) {
    sushiList.value.tokens.forEach((token: { address: string; logoURI: string; chainId: number }) => {
      const address = token.address.toLowerCase();

      if (!logoDirectory[token.chainId]) {
        logoDirectory[token.chainId] = {};
      }

      if (token.logoURI && !token.logoURI.startsWith("ipfs://") && !logoDirectory[token.chainId][address]) {
        logoDirectory[token.chainId][address] = token.logoURI.startsWith("https://")
          ? token.logoURI
          : `https://raw.githubusercontent.com/sushiswap/list/master/logos/token-logos/token/${token.logoURI}`;
      }
    });
  }

  if (ownList.status === "fulfilled" && Array.isArray(ownList.value)) {
    ownList.value.forEach((token: { address: string; logoURI: string; chainId: number }) => {
      const address = token.address.toLowerCase();

      if (!logoDirectory[token.chainId]) {
        logoDirectory[token.chainId] = {};
      }

      if (!logoDirectory[token.chainId][address] && token.logoURI && !token.logoURI.startsWith("ipfs://")) {
        logoDirectory[token.chainId][address] = token.logoURI;
      }
    });
  }

  if (oneInchList) {
    oneInchList.forEach((token: { address: string; logoURI: string; chainId: number }) => {
      const address = token.address.toLowerCase();

      if (!logoDirectory[token.chainId]) {
        logoDirectory[token.chainId] = {};
      }

      if (!logoDirectory[token.chainId][address] && token.logoURI && !token.logoURI.startsWith("ipfs://")) {
        logoDirectory[token.chainId][address] = token.logoURI;
      }
    });
  }

  for (const id in catalog.coins) {
    const token = catalog.coins[id];
    const platformTokens: NonNullable<TokenList["geckoPlatforms"]>[string] = [];
    const seenPlatforms = new Set<string>();
    for (const chain in token.platforms) {
      const contract = token.platforms[chain];
      const chainId = geckoChainsMap[chain];
      if (!contract || !chainId) continue;
      const address = contract.toLowerCase();
      if (!logoDirectory[chainId]) logoDirectory[chainId] = {};
      if (!logoDirectory[chainId][address] && token.logoURI && !token.logoURI.startsWith("ipfs://")) {
        logoDirectory[chainId][address] = token.logoURI;
      }
      const platformKey = `${chainId}:${address}`;
      if (!seenPlatforms.has(platformKey)) {
        seenPlatforms.add(platformKey);
        platformTokens.push({ chainId, tokenAddress: address });
      }
    }
    if (platformTokens.length) geckoPlatformDirectory[id] = platformTokens;

    const name = normalizeGeckoKey(token.name);
    if (!logoDirectory[0]) logoDirectory[0] = {};
    if (!logoDirectory[0][name] && token.logoURI && !token.logoURI.startsWith("ipfs://")) {
      logoDirectory[0][name] = token.logoURI;
    }
  }

  // normalize coingecko CDN domain — coin-images.coingecko.com is undocumented
  // and serves stale images, assets.coingecko.com is the official domain per docs
  // https://docs.coingecko.com/reference/coins-id
  for (const chain in logoDirectory) {
    for (const token in logoDirectory[chain]) {
      logoDirectory[chain][token] = normalizeLogoUrl(logoDirectory[chain][token]);
    }
  }

  return { tokens: logoDirectory, gecko: geckoLogoDirectory, geckoPlatforms: geckoPlatformDirectory };
};

export default async (res: Response) => {
  try {
    const cached = await getCache(TOKEN_LIST_CACHE_KEY);
    if (cached) {
      const { Body, ContentType } = cached;
      res
        .status(200)
        .set({
          "content-type": ContentType,
          "Cache-Control": forEveryIntervalOf(3600),
          "CDN-Cache-Control": forEveryIntervalOf(3600),
        })
        .send(Body);
      return;
    }

    const tokenList = await compileTokenList();
    const payload = JSON.stringify(tokenList);

    // convert the payload to a node.js buffer then put into cache using the setCache function
    const buffer = Buffer.from(payload);
    await setCache(
      {
        Key: TOKEN_LIST_CACHE_KEY,
        Body: buffer,
        ContentType: "application/json",
      },
      ttlForEveryIntervalOf(3600),
    );

    res
      .status(200)
      .set({
        "content-type": "application/json",
        "Cache-Control": forEveryIntervalOf(3600),
        "CDN-Cache-Control": forEveryIntervalOf(3600),
      })
      .send(payload);
    return;
  } catch (error: unknown) {
    console.error(`[error] [token-list]`);
    console.error(error);
    res
      .status(500)
      .set({
        "content-type": "application/json",
        "Cache-Control": "max-age=60, must-revalidate",
        "CDN-Cache-Control": "max-age=60, must-revalidate",
      })
      .send(JSON.stringify({ tokens: {} }));
    return;
  }
};
