import type { ReadStream } from "fs";
import { createReadStream, statSync, readdirSync } from "fs";
import path from "path";
import type { FitEnum } from "sharp";
import sharp from "sharp";
import { getCache, setCache } from "./cache-client";
import { MAX_AGE_1_YEAR, MAX_AGE_10_MINUTES } from "./cache-control-helper";

interface ResizeParams {
  width: number | undefined;
  height: number | undefined;
  fit: keyof FitEnum;
}

export function extractParams(request: Request): ResizeParams {
  const searchParams = new URL(request.url).searchParams;

  const width = searchParams.has("w") ? Number.parseInt(searchParams.get("w") ?? "0") : undefined;
  const height = searchParams.has("h") ? Number.parseInt(searchParams.get("h") ?? "0") : undefined;

  const fitEnum = ["contain", "cover", "fill", "inside", "outside"];
  let fit: keyof FitEnum = sharp.fit.contain;
  if (searchParams.has("fit")) {
    const fitParam = searchParams.get("fit") ?? "";
    if (fitEnum.includes(fitParam)) {
      fit = fitParam as keyof FitEnum;
    }
  }
  return { width, height, fit };
}

export const resizeImageBuffer = async (params: ResizeParams, buffer: Buffer) => {
  const { width, height, fit } = params;
  // determine if the image is a gif
  const isGIF = buffer.toString("ascii", 0, 3) === "GIF";
  const sharpTransforms = isGIF
    ? sharp(buffer, { animated: true })
        .resize({
          width,
          height,
          fit,
        })
        .gif({ dither: 0 })
    : sharp(buffer)
        .resize({
          width,
          height,
          fit,
        })
        .webp({ lossless: true });

  const payload = await sharpTransforms.toBuffer();
  return {
    contentType: isGIF ? "image/gif" : "image/webp",
    payload,
  };
};

// cacheKey includes both the path and query params
export const getResizeImageResponse = async (cacheKey: string, params: ResizeParams, buffer: Buffer) => {
  try {
    const cacheObject = await getCache(cacheKey);
    if (cacheObject) {
      return new Response(cacheObject.Body, {
        headers: {
          "Content-Type": cacheObject.ContentType,
          "Cache-Control": MAX_AGE_1_YEAR,
          "CDN-Cache-Control": MAX_AGE_1_YEAR,
        },
        status: 200,
      });
    }

    const { payload, contentType } = await resizeImageBuffer(params, buffer);
    await setCache({ Key: cacheKey, Body: payload, ContentType: contentType });
    return new Response(payload, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": MAX_AGE_1_YEAR,
        "CDN-Cache-Control": MAX_AGE_1_YEAR,
      },
      status: 200,
    });
  } catch (error) {
    console.error(`[error] [getResizeImageResponse] ${cacheKey} ${JSON.stringify(params)}`);
    console.error(error);
    return new Response(`error reeeeeee`, {
      headers: {
        "Cache-Control": MAX_AGE_10_MINUTES,
        "CDN-Cache-Control": MAX_AGE_10_MINUTES,
      },
      status: 500,
    });
  }
};

export function getSrcPath(src: string, ASSETS_ROOT: string) {
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

  return srcPath;
}

export function readFileAsStream(src: string, ASSETS_ROOT: string): ReadStream {
  // Local filesystem

  const srcPath = getSrcPath(src, ASSETS_ROOT);

  const fileStat = statSync(srcPath);

  if (!fileStat.isFile()) {
    throw new Error(`${srcPath} is not a file`);
  }

  // create a readable stream from the image file
  return createReadStream(srcPath);
}
