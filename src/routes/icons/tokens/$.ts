import { getAddress } from "ethers";
import { extractParams, getCacheKey, getImage, resizeImage, resizeImageBuffer } from "../../../utils/image-resize";
import { resToBuffer } from "../../../utils/response";
import { getCache, getFileFromS3OrCacheBuffer, saveFileToS3AndCache, setCache } from "../../../utils/cache-client";
import { Request, Response } from "express";
import { MAX_AGE_1_YEAR, MAX_AGE_4_HOURS, forEveryIntervalOf } from "../../../utils/cache-control-helper";
import { TokenList, compileTokenList } from "../../token-list";

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
} as const;

const blacklistedTokens = [
  "0x2e3487f967df2ebc2f236e16f8fcaeac7091324d",
  "0x971aabcf9e922e1003969a7662a43765d4527b82",
  "0x1605bbdab3b38d10fa23a7ed0d0e8f4fea5bff59",
  "0xd85e038593d7a098614721eae955ec2022b9b91b",
  "0x1b3a3eb66749421a8d36e9ef39186b77fb7e9ef0",
  "0xb46584e0efde3092e04010a13f2eae62adb3b9f0",
  "0x4e86b21ad7eef415c08fde58066272897495ab41",
  "0x3b987a36a7f44dc4657daf9ce032ba315473067e",
  "0x9b69b837aa66d1ca3365df0efe95908b84140f6a",
  "0x368c5290b13caa10284db58b4ad4f3e9ee8bf4c9",
  "0xc4cb613947890ea300fedc509ac19f8efa0cdd14",
  "0x857d4d47a707cb4e409e14ac63b2e79114acd102",
  "0xf92364c2369a2633ffcd7db1b18d1fafff6bcbab",
  "0xfc0b60e0df5dc9d4b72d957ca2d251cee308019a",
  "0x2c7f442aab99d5e18cfae2291c507c0b5f3c1eb5",
  "0x11f9e9b3c539368bea16dde2108b748a9672d714",
  "0xb806fa32ebdc04e5dbdd2ad83e75c8f7d8e8ef8b",
  "0x3007083eaa95497cd6b2b809fb97b6a30bdf53d3",
  "0xfddacc9cec6a1a41630e2ad5adc863a070f0b614",
  "0x6622bc22e34153456dd1109414fa275d80678680",
  "0xc085c97ec81d44ed6e0f999f871e51629dd6c261",
  "0x42d403ab9b0603442ac991c0cfe124105dde0811",
  "0xccb97ae0c1bc4ce196b6460395af7df5ee1212bc",
  "0x94f27f7c941ade2cae367a526d49a77bf7b8e134",
  "0x6643ed3bd5ffe7a3f9d3dd36f71a843abfa9df87",
  "0x3801c3b3b5c98f88a9c9005966aa96aa440b9afc",
  "0xb2970709add8ce1e308c3a4bd1c2c49ea44bf648",
  "0x95c91eef65f50570cfc3f269961a00108cf7bf59",
  "0xd41aeaad6385095856049a83576cac4f22003b3e",
  "0xf3bb9f16677f2b86efd1dfca1c141a99783fde58",
  "0x86a1012d437bbff84fbdf62569d12d4fd3396f8c",
  "0xf0b5ceefc89684889e5f7e0a7775bd100fcd3709",
  "0x2338a5d62e9a766289934e8d2e83a443e8065b83",
  "0x876ec6be52486eeec06bc06434f3e629d695c6ba",
  "0x16eccfdbb4ee1a85a33f3a9b21175cd7ae753db4",
  "0x921f99719eb6c01b4b8f0ba7973a7c24891e740a",
  "0x1e917e764bc34d3bc313fe8159a6bd9d9ffd450d",
  "0x99d7faaf17f35d04d324c3bf05625a2f68229f66",
  "0xb36faf341c7817d681f23bcedbd3d85467e5ad9f",
  "0xfb033fa09706fa92ace768736ec94ad68688888b",
  "0x7dff46370e9ea5f0bad3c4e29711ad50062ea7a4",
  "0x1bfc26ce035c368503fae319cc2596716428ca44",
  "0x4406509b532b111bd39b5b579561001cbf0d7acf",
];

// express app handler for route /tokens/:chainId/:tokenAddress
export default async (req: Request, res: Response) => {
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

  const { chainId, tokenAddress } = req.params;
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
          forEveryIntervalOf(3600),
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

    await setCache({ Key: cacheKey, Body: _payload, ContentType: _contentType });

    return res
      .status(200)
      .set({
        "Content-Type": _contentType,
        "Cache-Control": MAX_AGE_1_YEAR,
        "CDN-Cache-Control": MAX_AGE_1_YEAR,
      })
      .send(_payload);
  }
};
