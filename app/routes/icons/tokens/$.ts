import type { LoaderArgs } from "@remix-run/node";
import { getAddress } from "ethers";
import {
  extractParams,
  handleError,
  readFileAsStream,
  streamingResize,
  streamingResizeBuffer,
} from "~/modules/image-resize";
import { resToBuffer } from "~/modules/response";
import { getFileFromS3, saveFileToS3 } from "~/modules/s3-client";

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

export const loader = async ({ params, request }: LoaderArgs) => {
  // extract all the parameters from the url
  const { src, width, height, fit } = extractParams(params, request);

  try {
    const [chainId, ...tokenAddresses] = src.split("/");
    const tokenAddress = tokenAddresses.join("/").toLowerCase();

    if (tokenAddress === "0x0000000000000000000000000000000000000000" && chainIconUrls[Number(chainId)]) {
      // read the image as a stream of bytes
      const readStream = readFileAsStream(chainIconUrls[Number(chainId)], "assets/agg_icons");
      // read the image from the file system and stream it through the sharp pipeline
      return streamingResize({ imageStream: readStream, width, height, fit });
    }

    const fileFromS3 = await getFileFromS3(`token/${chainId}/${tokenAddress}`);

    if (fileFromS3) {
      return streamingResize({ imageStream: fileFromS3 as any, width, height, fit });
    }

    // fetch token list
    const tokenList = await fetch("https://icons.llamao.fi/token-list").then((res) => res.json());

    if (!tokenList.tokens) {
      throw new Error(`${src}: Couldn't fetch tokens list`);
    }

    if (!tokenList.tokens[chainId]) {
      throw new Error(`${src}: Couldn't find chain`);
    }

    if (!tokenList.tokens[chainId][tokenAddress]) {
      throw new Error(`${src}: Couldn't find token`);
    }

    // fetch token image
    let tokenImage = await fetch(tokenList.tokens[chainId][tokenAddress]);

    if (!isvalidImage(tokenImage)) {
      const fallbackImage = await fallbacksByChain(Number(chainId), tokenAddress);

      if (fallbackImage) {
        tokenImage = fallbackImage;
      } else {
        if (trustWalletChainsMap[Number(chainId)]) {
          const trustWalletImage = await fetch(
            `https://raw.githubusercontent.com/rainbow-me/assets/master/blockchains/${
              trustWalletChainsMap[Number(chainId)]
            }/assets/${getAddress(tokenAddress)}/logo.png`,
          );

          if (isvalidImage(trustWalletImage)) {
            tokenImage = trustWalletImage;
          } else {
            const pancakeswapImage = await fetch(
              `https://tokens.pancakeswap.finance/images/${getAddress(tokenAddress)}.png`,
            );

            if (isvalidImage(pancakeswapImage)) {
              tokenImage = pancakeswapImage;
            } else {
              throw new Error(`${src}: Failed to fetch token image`);
            }
          }
        } else {
          throw new Error(`${src}: Failed to fetch token image`);
        }
      }
    }

    const resBuffer = await resToBuffer(tokenImage);

    await saveFileToS3({
      pathname: `token/${chainId}/${tokenAddress}`,
      body: resBuffer,
      ContentType: tokenImage.headers.get("content-type") || "image/jpeg",
    });

    // return transformed image
    return streamingResizeBuffer(resBuffer, width, height, fit);
  } catch (error: unknown) {
    console.log(`${src}: Error: ${error}`);
    // if the image is not found, or we get any other errors we return different response types
    return handleError({ error, width, height, fit, defaultImage: true });
  }
};

const fallbacksByChain = async (chainId: number, tokenAddress: string) => {
  try {
    // avax
    if (chainId === 43114) {
      const joeImage = await fetch(
        `https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/${getAddress(
          tokenAddress,
        )}/logo.png`,
      );

      return isvalidImage(joeImage) ? joeImage : null;
    }
  } catch (error) {
    return null;
  }
};

const isvalidImage = (res: Response) => {
  const imgType = res.headers.get("content-type");

  return imgType && imgType.startsWith("image") ? true : false;
};
