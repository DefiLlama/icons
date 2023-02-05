import type { LoaderArgs } from "@remix-run/node";
import { extractParams, handleError, streamingResizeBuffer } from "~/modules/image-resize";
import { resToBuffer } from "~/modules/response";

export const loader = async ({ params, request }: LoaderArgs) => {
  // extract all the parameters from the url
  const { src, width, height, fit } = extractParams(params, request);

  try {
    const [chainId, ...tokenAddresses] = src.split("/");
    const tokenAddress = tokenAddresses.join("/").toLowerCase();

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
    console.log(tokenList.tokens[chainId][tokenAddress]);
    // fetch token image
    const tokenImage = await fetch(tokenList.tokens[chainId][tokenAddress]);

    console.log(tokenImage);

    const contentType = tokenImage.headers.get("content-type");

    if (!contentType || contentType.startsWith("/image")) {
      throw new Error(`${src}: Failed to fetch token image`);
    }

    const resBuffer = await resToBuffer(tokenImage);

    // return transformed image
    return streamingResizeBuffer(resBuffer, width, height, fit);
  } catch (error: unknown) {
    console.log(error);
    // if the image is not found, or we get any other errors we return different response types
    return handleError({ error, width, height, fit, defaultImage: true });
  }
};
