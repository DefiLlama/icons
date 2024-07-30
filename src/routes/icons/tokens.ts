import { extractParams, getCacheKey, getImage, resizeImage, resizeImageBuffer } from "../../utils/image-resize";
import { getCache, getFileFromS3OrCacheBuffer, saveFileToS3AndCache, setCache } from "../../utils/cache-client";
import { Request, Response } from "express";
import { MAX_AGE_1_YEAR, MAX_AGE_4_HOURS, ttlForEveryIntervalOf } from "../../utils/cache-control-helper";
import { TokenList, compileTokenList } from "../token-list";

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
  8217: "kaia",
  250: "fantom",
  100: "gnosis",
  137: "polygon",
  534352: "scroll",
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
  // 8217: "kaia",
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
} as const;

const blacklistedTokens = ["0x2338a5d62E9A766289934e8d2e83a443e8065b83"].map((token) => token.toLowerCase());

// express app handler for route /tokens/:chainId/:tokenAddress
export default async (req: Request, res: Response) => {
  const { chainId, tokenAddress } = req.params;

  if (blacklistedTokens.includes(tokenAddress.toLowerCase())) {
    return res
      .status(404)
      .set({
        "Cache-Control": MAX_AGE_4_HOURS,
        "CDN-Cache-Control": MAX_AGE_4_HOURS,
      })
      .send("NOT FOUND");
  }

  const cacheKey = getCacheKey(req);
  if (!cacheKey) {
    return res
      .status(400)
      .set({
        "Cache-Control": MAX_AGE_1_YEAR,
        "CDN-Cache-Control": MAX_AGE_1_YEAR,
      })
      .send("BAD REQUEST");
  }

  const resizeParams = extractParams(req);
  const cached = await getCache(cacheKey);
  if (cached) {
    // if requested processed image is cached, just return it
    return res
      .status(200)
      .set({
        "Content-Type": cached.ContentType,
        "Cache-Control": MAX_AGE_1_YEAR,
        "CDN-Cache-Control": MAX_AGE_1_YEAR,
      })
      .send(cached.Body);
  }

  let _contentType: string;
  let _payload: Buffer;

  if (tokenAddress === "0x0000000000000000000000000000000000000000" && chainIconUrls[Number(chainId)]) {
    // if tokenAddress is 0x0, return chain icon
    const image = await getImage(chainIconUrls[Number(chainId)], "assets/agg_icons");
    if (!image) {
      return res
        .status(404)
        .set({
          "Cache-Control": MAX_AGE_4_HOURS,
          "CDN-Cache-Control": MAX_AGE_4_HOURS,
        })
        .send("NOT FOUND");
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
      let tokenList: TokenList;
      const tokenListCache = await getCache("token-list");
      if (tokenListCache) {
        tokenList = JSON.parse(tokenListCache.Body.toString());
      } else {
        // if we don't have the token list cached, compile it and cache it on redis
        tokenList = await compileTokenList();
        const tokenListPayload = JSON.stringify(tokenList);
        const tokenListBuffer = Buffer.from(tokenListPayload);
        await setCache(
          { Key: "token-list", Body: tokenListBuffer, ContentType: "application/json" },
          ttlForEveryIntervalOf(3600),
        );
      }

      // now we have the token list, fetch the actual token image
      const tokens = tokenList.tokens[Number(chainId)];
      const imgUrl = tokens ? tokens[tokenAddress] : null;
      const image = imgUrl ? await getImage(imgUrl) : null;
      if (!tokens || !imgUrl || !image) {
        return res
          .status(404)
          .set({
            "Cache-Control": MAX_AGE_4_HOURS,
            "CDN-Cache-Control": MAX_AGE_4_HOURS,
          })
          .send("NOT FOUND");
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
  return res
    .status(200)
    .set({
      "Content-Type": _contentType,
      "Cache-Control": MAX_AGE_1_YEAR,
      "CDN-Cache-Control": MAX_AGE_1_YEAR,
    })
    .send(_payload);
};
