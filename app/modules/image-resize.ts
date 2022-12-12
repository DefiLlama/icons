/**
 * adapted from https://github.com/remix-run/examples/blob/main/image-resize/app/routes/assets/resize/%24.ts
 */

import type { ReadStream } from "fs";
import { createReadStream, statSync, readdirSync } from "fs";
import path from "path";
import { PassThrough } from "stream";
import type { FitEnum } from "sharp";
import sharp from "sharp";
import type { Params } from "@remix-run/react";

interface ResizeParams {
  src: string;
  width: number | undefined;
  height: number | undefined;
  fit: keyof FitEnum;
}

export function extractParams(
  params: Params<string>,
  request: Request
): ResizeParams {
  const src = params["*"] as string;
  const searchParams = new URL(request.url).searchParams;

  const width = searchParams.has("w")
    ? Number.parseInt(searchParams.get("w") ?? "0")
    : undefined;
  const height = searchParams.has("h")
    ? Number.parseInt(searchParams.get("h") ?? "0")
    : undefined;

  const fitEnum = ["contain", "cover", "fill", "inside", "outside"];
  let fit: keyof FitEnum = sharp.fit.contain;
  if (searchParams.has("fit")) {
    const fitParam = searchParams.get("fit") ?? "";
    if (fitEnum.includes(fitParam)) {
      fit = fitParam as keyof FitEnum;
    }
  }
  return { src, width, height, fit };
}

export function streamingResize(
  imageStream: ReadStream,
  width: number | undefined,
  height: number | undefined,
  fit: keyof FitEnum
) {
  // create the sharp transform pipeline
  // https://sharp.pixelplumbing.com/api-resize
  // you can also add watermarks, sharpen, blur, etc.
  const sharpTransforms = sharp()
    .resize({
      width,
      height,
      fit,
      position: sharp.strategy.attention, // will try to crop the image and keep the most interesting parts
    })
    .webp({ lossless: true });

  // create a pass through stream that will take the input image
  // stream it through the sharp pipeline and then output it to the response
  // without buffering the entire image in memory
  const passthroughStream = new PassThrough();

  imageStream.pipe(sharpTransforms).pipe(passthroughStream);

  return new Response(passthroughStream as any, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export function readFileAsStream(src: string, ASSETS_ROOT: string): ReadStream {
  // Local filesystem

  let srcPath = null;

  readdirSync(ASSETS_ROOT).forEach((file) => {
    const fileName = file.split(".");

    fileName.pop();

    if (fileName.join(".").toLowerCase() === src.toLowerCase()) {
      srcPath = path.join(ASSETS_ROOT, file);
    }
  });

  if (!srcPath) {
    srcPath = path.join(ASSETS_ROOT, src);
  }

  const fileStat = statSync(srcPath);

  if (!fileStat.isFile()) {
    throw new Error(`${srcPath} is not a file`);
  }

  // create a readable stream from the image file
  return createReadStream(srcPath);
}

export function handleError(error: unknown) {
  // error needs to be typed
  const errorT = error as Error & { code: string };
  // if the read stream fails, it will have the error.code ENOENT
  if (errorT.code === "ENOENT") {
    return new Response("image not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }

  // if there is an error processing the image, we return a 500 error
  return new Response(errorT.message, {
    status: 500,
    statusText: errorT.message,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
