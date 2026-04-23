import { existsSync } from "fs";
import {
  extractParams,
  getCacheKey,
  getImage,
  getSrcPath,
  resizeImage,
  resizeImageBuffer,
} from "../../utils/image-resize";
import { getCache, getFileFromS3OrCacheBuffer, saveFileToS3AndCache, setCache } from "../../utils/cache-client";
import { Request, Response } from "express";
import {
  MAX_AGE_1_YEAR,
  MAX_AGE_10_MINUTES,
  MAX_AGE_4_HOURS,
  ttlForEveryIntervalOf,
} from "../../utils/cache-control-helper";
import { TOKEN_LIST_CACHE_KEY, TokenList, compileTokenList } from "../token-list";

const TOKEN_ASSETS_ROOT = "assets/tokens";
const GECKO_TOKEN_ASSETS_SUBDIR = "gecko";
const GECKO_TOKEN_S3_PREFIX = "token/gecko";
const geckoIdPattern = /^[a-z0-9._-]+$/;

const chainIconUrls: { [chainId: number]: string } = {
  1: "ethereum",
  56: "binance",
  42161: "ethereum",
  10: "ethereum",
  66: "okexchain",
  288: "ethereum",
  1666600000: "harmony",
  128: "heco",
  106: "velas",
  24462: "oasis",
  199: "bittorrent",
  1285: "moonriver",
  1284: "moonbeam",
  122: "fuse",
  2000: "dogechain",
  25: "cronos",
  42220: "celo",
  1313161554: "ethereum",
  43114: "avax",
  8217: "klaytn",
  250: "fantom",
  100: "gnosis",
  137: "polygon",
  534352: "scroll",
  8453: "ethereum",
  81457: "ethereum",
  146: "sonic",
  80094: "berachain",
  98866: "plume-mainnet",
  130: "unichain",
  4326: 'megaeth',
  143: 'monad',
  57073: 'ink',
  480: 'worldchain',
  9745: 'plasma',
  4217: 'tempo',
};

export const trustWalletChainsMap: { [chainId: number]: string } = {
  1: "ethereum",
  56: "smartchain",
  137: "polygon",
  10: "optimism",
  42161: "arbitrum",
  43114: "avalanchec",
  100: "xdai",
  250: "fantom",
  // 8217: "klaytn",
  1313161554: "aurora",
  42220: "celo",
  25: "cronos",
  // 2000: "dogechain",
  // 1285: "moonriver",
  // 199: "bttc",
  42262: "oasis",
  // 106: "velas",
  128: "heco",
  1666600000: "harmony",
  // 288: "boba",
  66: "okexchain",
  // 122: "fuse",
  1284: "moonbeam",
  8453: "base",
  81457: "blast",
  146: "sonic",
  98866: "plume-mainnet",
  // 130: "unichain",
  4326: 'megaeth',
  143: 'monad',
  // 57073: 'ink',
  // 480: 'worldchain',
  9745: 'plasma',
  4217: 'tempo',
} as const;

const blacklistedTokens = ["0x2338a5d62E9A766289934e8d2e83a443e8065b83"].map((token) => token.toLowerCase());

const getTokenList = async () => {
  const tokenListCache = await getCache(TOKEN_LIST_CACHE_KEY);
  if (tokenListCache) {
    const tokenList: TokenList = JSON.parse(tokenListCache.Body.toString());
    if (tokenList.gecko && Object.keys(tokenList.gecko).length > 0) {
      return tokenList;
    }
    console.error(`[warn] [tokens] ignoring ${TOKEN_LIST_CACHE_KEY} without gecko logos`);
  }

  const tokenList = await compileTokenList();
  const tokenListPayload = JSON.stringify(tokenList);
  const tokenListBuffer = Buffer.from(tokenListPayload);
  if (tokenList.gecko && Object.keys(tokenList.gecko).length > 0) {
    await setCache(
      { Key: TOKEN_LIST_CACHE_KEY, Body: tokenListBuffer, ContentType: "application/json" },
      ttlForEveryIntervalOf(3600),
    );
  } else {
    console.error(`[warn] [tokens] not caching ${TOKEN_LIST_CACHE_KEY} without gecko logos`);
  }
  return tokenList;
};

const normalizeGeckoId = (value: string) => value.trim().toLowerCase();

const getLocalTokenIcon = async (tokenId: string, assetsRoots: string[]) => {
  for (const assetsRoot of assetsRoots) {
    try {
      if (!existsSync(assetsRoot)) continue;
      if (existsSync(getSrcPath(tokenId, assetsRoot))) {
        return getImage(tokenId, assetsRoot);
      }
    } catch (error) {
      continue;
    }
  }
  return null;
};

const getGeckoTokenAssetRoots = () => [
  `${TOKEN_ASSETS_ROOT}/${GECKO_TOKEN_ASSETS_SUBDIR}`,
  TOKEN_ASSETS_ROOT,
];

const getLocalGeckoTokenIcon = async (geckoId: string) => {
  return getLocalTokenIcon(geckoId, getGeckoTokenAssetRoots());
};

const getLocalChainTokenIcon = async (chainId: string, tokenAddress: string) => {
  return getLocalTokenIcon(
    tokenAddress,
    [`${TOKEN_ASSETS_ROOT}/${chainId}`],
  );
};

const sendNotFound = (res: Response, cacheControl = MAX_AGE_4_HOURS) =>
  res
    .status(404)
    .set({
      "Cache-Control": cacheControl,
      "CDN-Cache-Control": cacheControl,
    })
    .send("NOT FOUND");

const sendBadRequest = (res: Response) =>
  res
    .status(400)
    .set({
      "Cache-Control": MAX_AGE_1_YEAR,
      "CDN-Cache-Control": MAX_AGE_1_YEAR,
    })
    .send("BAD REQUEST");

const sendImage = (res: Response, contentType: string, payload: Buffer) =>
  res
    .status(200)
    .set({
      "Content-Type": contentType,
      "Cache-Control": MAX_AGE_1_YEAR,
      "CDN-Cache-Control": MAX_AGE_1_YEAR,
    })
    .send(payload);

const serveGeckoTokenIcon = async (req: Request, res: Response, rawGeckoId: string) => {
  const geckoId = normalizeGeckoId(rawGeckoId);
  if (!geckoIdPattern.test(geckoId)) {
    return sendBadRequest(res);
  }

  const resizeParams = extractParams(req);

  const localImage = await getLocalGeckoTokenIcon(geckoId);
  if (localImage) {
    const { contentType, payload } = await resizeImage(resizeParams, localImage);
    const cacheKey = getCacheKey(req);
    if (cacheKey) {
      await setCache({ Key: cacheKey, Body: payload, ContentType: contentType });
    }
    return sendImage(res, contentType, payload);
  }

  const cacheKey = getCacheKey(req);
  if (!cacheKey) {
    return sendBadRequest(res);
  }

  const cached = await getCache(cacheKey);
  if (cached) {
    return sendImage(res, cached.ContentType, cached.Body);
  }

  const rawCacheKey = `${GECKO_TOKEN_S3_PREFIX}/${geckoId}`;
  const buffer = await getFileFromS3OrCacheBuffer(rawCacheKey);
  if (buffer) {
    const { contentType, payload } = await resizeImageBuffer(resizeParams, buffer);
    await setCache({ Key: cacheKey, Body: payload, ContentType: contentType });
    return sendImage(res, contentType, payload);
  }

  const tokenList = await getTokenList();
  const imgUrl = tokenList.gecko?.[geckoId];
  const image = imgUrl ? await getImage(imgUrl) : null;
  if (!imgUrl || !image) {
    return sendNotFound(res, MAX_AGE_10_MINUTES);
  }

  const rawBuffer = await image.toBuffer();
  const rawFormat = (await image.metadata()).format;
  const rawContentType = `image/${rawFormat}`;
  await saveFileToS3AndCache({
    Key: rawCacheKey,
    Body: rawBuffer,
    ContentType: rawContentType,
  });

  const { contentType, payload } = await resizeImageBuffer(resizeParams, rawBuffer);
  await setCache({ Key: cacheKey, Body: payload, ContentType: contentType });
  return sendImage(res, contentType, payload);
};

export const geckoTokensHandler = async (req: Request, res: Response) => {
  return serveGeckoTokenIcon(req, res, req.params.geckoId);
};

// express app handler for route /tokens/:chainId/:tokenAddress
export default async (req: Request, res: Response) => {
  const { chainId, tokenAddress } = req.params;
  const normalizedTokenAddress = tokenAddress.toLowerCase();

  if (blacklistedTokens.includes(normalizedTokenAddress)) {
    return sendNotFound(res);
  }

  const cacheKey = getCacheKey(req);
  if (!cacheKey) {
    return sendBadRequest(res);
  }

  const resizeParams = extractParams(req);
  const localTokenImage = await getLocalChainTokenIcon(chainId, normalizedTokenAddress);
  if (localTokenImage) {
    const { contentType, payload } = await resizeImage(resizeParams, localTokenImage);
    await setCache({ Key: cacheKey, Body: payload, ContentType: contentType });
    return sendImage(res, contentType, payload);
  }

  const geckoId = chainId === "0" ? normalizeGeckoId(tokenAddress) : null;
  if (geckoId && geckoIdPattern.test(geckoId)) {
    const localGeckoImage = await getLocalGeckoTokenIcon(geckoId);
    if (localGeckoImage) {
      const { contentType, payload } = await resizeImage(resizeParams, localGeckoImage);
      await setCache({ Key: cacheKey, Body: payload, ContentType: contentType });
      return sendImage(res, contentType, payload);
    }
  }

  const cached = await getCache(cacheKey);
  if (cached) {
    // if requested processed image is cached, just return it
    return sendImage(res, cached.ContentType, cached.Body);
  }

  let _contentType: string;
  let _payload: Buffer;

  if (tokenAddress === "0x0000000000000000000000000000000000000000" && chainIconUrls[Number(chainId)]) {
    // if tokenAddress is 0x0, return chain icon
    const image = await getImage(chainIconUrls[Number(chainId)], "assets/agg_icons");
    if (!image) {
      return sendNotFound(res);
    }
    const { contentType, payload } = await resizeImage(resizeParams, image);
    _contentType = contentType;
    _payload = payload;
  } else {
    // check if we cached the HD token image on S3 or redis
    const buffer = await getFileFromS3OrCacheBuffer(`token/${chainId}/${tokenAddress}`);
    if (buffer) {
      // if we have the HD token image, resize it and return
      const { contentType, payload } = await resizeImageBuffer(resizeParams, buffer);
      _contentType = contentType;
      _payload = payload;
    } else {
      // if we don't have the HD token image, will need to fetch it using the url from token-list
      // first we need to get the token list
      const tokenList = await getTokenList();

      // now we have the token list, fetch the actual token image
      const tokens = tokenList.tokens[Number(chainId)];
      const geckoImgUrl = chainId === "0" ? tokenList.gecko?.[normalizedTokenAddress] : null;
      if (geckoImgUrl) {
        return serveGeckoTokenIcon(req, res, normalizedTokenAddress);
      }
      const imgUrl = tokens ? tokens[tokenAddress] ?? tokens[normalizedTokenAddress] : null;
      const image = imgUrl ? await getImage(imgUrl) : null;
      if (!imgUrl || !image) {
        return sendNotFound(res);
      }
      const rawBuffer = await image.toBuffer();
      const rawFormat = (await image.metadata()).format;
      const rawContentType = `image/${rawFormat}`;
      // save the HD token image to S3 and cache it on redis
      await saveFileToS3AndCache({
        Key: `token/${chainId}/${tokenAddress}`,
        Body: rawBuffer,
        ContentType: rawContentType,
      });

      // generate the resized token image to return
      const { contentType, payload } = await resizeImageBuffer(resizeParams, rawBuffer);
      _contentType = contentType;
      _payload = payload;
    }
  }

  await setCache({ Key: cacheKey, Body: _payload, ContentType: _contentType });
  return sendImage(res, _contentType, _payload);
};
