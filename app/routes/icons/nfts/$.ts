import type { LoaderArgs } from "@remix-run/node";
import {
  extractParams,
  handleError,
  readFileAsStream,
  streamingResize,
  streamingResizeBuffer,
} from "~/modules/image-resize";
import { Octokit } from "@octokit/core";

const octokit = new Octokit({
  auth: process.env.MINTY_ACCESS_TOKEN,
});

export const loader = async ({ params, request }: LoaderArgs) => {
  // extract all the parameters from the url
  const { src, width, height, fit } = extractParams(params, request);

  try {
    // read the image as a stream of bytes
    const readStream = readFileAsStream(src, "assets/nfts");
    // read the image from the file system and stream it through the sharp pipeline
    return streamingResize(readStream, width, height, fit);
  } catch (error: unknown) {
    try {
      // if the image is not found, fetch collection's data from alchemy
      const options = { method: "GET", headers: { accept: "application/json" } };

      const res = await fetch(
        `https://eth-mainnet.g.alchemy.com/nft/v2/${
          process.env.ALCHEMY_NFT_API_KEY
        }/getContractMetadata?contractAddress=${src.toLowerCase()}`,
        options,
      ).then((response) => response.json());

      // fetch collection's image from opensea cdn
      const response = await fetch(res.contractMetadata.openSea.imageUrl);

      const resBlob = await response.blob();
      const resBufferArray = await resBlob.arrayBuffer();
      const resBuffer = Buffer.from(resBufferArray);

      // commit image to our repo
      octokit
        .request("PUT /repos/{owner}/{repo}/contents/{path}", {
          owner: "DefiLlama",
          repo: "icons",
          path: `assets/nfts/${src.toLowerCase()}.png`,
          message: `nfts: add ${src.toLowerCase()}`,
          committer: {
            name: "mintdart",
            email: process.env.MINTY_EMAIL as string,
          },
          content: resBuffer.toString("base64"),
        })
        .catch(() => {
          return streamingResizeBuffer(resBuffer, width, height, fit);
        });

      // return transformed image
      return streamingResizeBuffer(resBuffer, width, height, fit);
    } catch (error) {
      console.log(error);
      // if the image is not found, or we get any other errors we return different response types
      return handleError(error, width, height, fit);
    }
  }
};
