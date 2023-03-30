import type { LoaderArgs } from "@remix-run/node";
import { extractParams, handleError, streamingResize, streamingResizeBuffer } from "~/modules/image-resize";
import { resToBuffer } from "~/modules/response";
import { getFileFromS3OrCacheStream, saveFileToS3AndCache } from "~/modules/cache-client";

const headers = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "CDN-Cache-Control": "public, max-age=31536000, immutable",
};

const getImageFromAlchemy = async (src: string) => {
  try {
    // if the image is not found, fetch collection's data from alchemy
    const options = { method: "GET", headers: { accept: "application/json" } };
    const res = await fetch(
      `https://eth-mainnet.g.alchemy.com/nft/v2/${
        process.env.ALCHEMY_NFT_API_KEY
      }/getContractMetadata?contractAddress=${src.toLowerCase()}`,
      options,
    ).then((response) => response.json());

    const imageUrl = res.contractMetadata?.openSea?.imageUrl;

    if (!imageUrl) {
      throw new Error(`Couldn't fetch ${src} metadata`);
    }
    // fetch collection's image from opensea cdn
    const response = await fetch(imageUrl);

    const contentType = response.headers.get("content-type");

    const resBuffer = await resToBuffer(response);

    return { resBuffer, contentType };
  } catch (error) {
    console.log(`Error: ${src} ${error}`);
    // if the image is not found, or we get any other errors we return different response types
    throw error;
  }
};

const getImageFromLlamaCollections = async (src: string) => {
  try {
    const res = await fetch(`https://ezy8r863f5.execute-api.eu-central-1.amazonaws.com/collections`).then((response) =>
      response.json(),
    );

    const collection = res.find((collection: any) => collection.collectionId == src);

    if (!collection) {
      return null;
    }
    // fetch collection's image from opensea cdn
    const response = await fetch(collection.image);

    const contentType = response.headers.get("content-type");

    const resBuffer = await resToBuffer(response);

    return { resBuffer, contentType };
  } catch (error) {
    console.log(`Error: ${src} ${error}`);
    // if the image is not found, or we get any other errors we return different response types
    throw error;
  }
};

export const loader = async ({ params, request }: LoaderArgs) => {
  // extract all the parameters from the url
  const { src, width, height, fit } = extractParams(params, request);

  try {
    const fileFromS3 = await getFileFromS3OrCacheStream(`collection/${src}`);

    if (fileFromS3) {
      return streamingResize({ imageStream: fileFromS3, width, height, fit, headers });
    } else {
      const imageFromLlamaCollection = await getImageFromLlamaCollections(src);

      if (imageFromLlamaCollection) {
        const { resBuffer, contentType } = imageFromLlamaCollection;

        await saveFileToS3AndCache({
          pathname: `collection/${src}`,
          body: resBuffer,
          ContentType: contentType || "image/jpeg",
        });

        // return transformed image
        return streamingResizeBuffer(resBuffer, width, height, fit, headers);
      }
      const { resBuffer, contentType } = await getImageFromAlchemy(src);

      await saveFileToS3AndCache({
        pathname: `collection/${src}`,
        body: resBuffer,
        ContentType: contentType || "image/jpeg",
      });

      // return transformed image
      return streamingResizeBuffer(resBuffer, width, height, fit, headers);
    }
  } catch (error: unknown) {
    console.log(error);

    return handleError({ error, width, height, fit, defaultImage: true });
  }
};
