import type { LoaderArgs } from "@remix-run/node";
import { extractParams, handleError, readFileAsStream, streamingResize } from "~/modules/image-resize";

export const loader = async ({ params, request }: LoaderArgs) => {
  // extract all the parameters from the url
  const { src, width, height, fit } = extractParams(params, request);

  try {
    // read the image as a stream of bytes
    const readStream = readFileAsStream(src, "assets/protocols");
    // read the image from the file system and stream it through the sharp pipeline
    return streamingResize(readStream, width, height, fit);
  } catch (error: unknown) {
    // if the image is not found, or we get any other errors we return different response types
    return handleError(error);
  }
};
