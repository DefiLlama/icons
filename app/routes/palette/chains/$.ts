import type { LoaderArgs } from "@remix-run/node";
import { statSync } from "fs";
import { defaultColor, getColor } from "~/modules/get-color";
import { extractParams, getSrcPath } from "~/modules/image-resize";

export const loader = async ({ params, request }: LoaderArgs) => {
  // extract all the parameters from the url
  const { src } = extractParams(params, request);

  try {
    // get src path
    const srcPath = getSrcPath(src, "assets/chains");

    // check if its a file
    const fileStat = statSync(srcPath);

    if (!fileStat.isFile()) {
      throw new Error(`${srcPath} is not a file`);
    }

    return getColor(srcPath);
  } catch (error: unknown) {
    // if the image is not found, return default color
    return new Response(defaultColor, {
      headers: {
        "content-type": "text/plain;charset=UTF-8",
      },
      status: 200,
    });
  }
};
