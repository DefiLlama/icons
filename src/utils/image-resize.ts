import type { ReadStream } from "fs";
import { createReadStream, statSync, readdirSync } from "fs";
import path from "path";
import type { FitEnum } from "sharp";
import sharp from "sharp";
import { getCache, setCache, sluggify } from "./cache-client";
import { MAX_AGE_1_YEAR, MAX_AGE_10_MINUTES } from "./cache-control-helper";
import { Request } from "express";
import { resToBuffer, resToImage } from "./response";

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

export const requestToCacheKey = (request: Request) => {
  try {
    const url = new URL(request.url);
    const fullPath = (url.pathname + url.search).replace(/^\//, "").replace(/\/$/, "");
    return sluggify(fullPath);
  } catch (err) {
    console.error(`[error] [requestToCacheKey] ${request.url}`, err);
    return null;
  }
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

export function getSrcPath(src: string, assetsRoot: string) {
  let srcPath = null;

  readdirSync(assetsRoot).forEach((file) => {
    const fileName = file.split(".");

    fileName.pop();

    if (fileName.join(".").toLowerCase() === src.toLowerCase()) {
      srcPath = path.join(assetsRoot, file);
    }
  });

  if (!srcPath) {
    srcPath = path.join(assetsRoot, src);
  }

  return srcPath;
}

export const getImage = async (src: string, assetsRoot?: string) => {
  try {
    if (assetsRoot) {
      const srcPath = getSrcPath(src, assetsRoot);
      const image = sharp(srcPath);
      await image.metadata();
      return image;
    } else if (src.startsWith("http")) {
      const res = await fetch(src);
      return await resToImage(res);
    } else {
      return null;
    }
  } catch (error) {
    console.error(`[error] [readFile]`, error);
    return null;
  }
};

export const isImage = async (buffer: Buffer) => {
  try {
    await sharp(buffer).metadata();
    return true;
  } catch (err) {
    return false;
  }
};
