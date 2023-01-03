import type { LoaderArgs } from "@remix-run/node";
import { extractParams, handleError, readFileAsStream, streamingResize } from "~/modules/image-resize";
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
      // if the image is not found, fetch collection's image from opensea
      const res = await fetch(`https://api.opensea.io/api/v1/asset_contract/${src.toLowerCase()}`, {
        method: "POST",
        headers: { "X-API-KEY": "" },
      }).then((res) => res.json());

      // const img = await fetch(res.collection["large_image_url"]);

      // const content = Buffer.from(await img.arrayBuffer());

      // console.log({ content });s

      return res;
    } catch (error) {
      console.log(error);
      // if the image is not found, or we get any other errors we return different response types
      return handleError(error, width, height, fit);
    }
  }
};

// await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}'", {
//   owner: "DefiLlama",
//   repo: "icons",
//   path: "assets/nfts/hello.txt",
//   message: "nfts: add icons",
//   committer: {
//     name: "mintdart",
//     email: process.env.MINTY_EMAIL,
//   },
//   content: Buffer.from("Hello World").toString("base64"),
// });
