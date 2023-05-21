import type { ReadStream } from "fs";
import { createReadStream, statSync, readdirSync } from "fs";
import type { Readable } from "stream";
import path from "path";
import { PassThrough } from "stream";
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
      return new Response(Buffer.from(cacheObject.body, "base64"), {
        headers: {
          "Content-Type": cacheObject.ContentType,
          "Cache-Control": MAX_AGE_1_YEAR,
          "CDN-Cache-Control": MAX_AGE_1_YEAR,
        },
        status: 200,
      });
    }

    const { payload, contentType } = await resizeImageBuffer(params, buffer);
    await setCache(cacheKey, payload, contentType, 31536000);
    return new Response(payload, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": MAX_AGE_1_YEAR,
        "CDN-Cache-Control": MAX_AGE_1_YEAR,
      },
      status: 200,
    });
  } catch (error: unknown) {
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

export function streamingResize({
  imageStream,
  width,
  height,
  fit,
  headers = {
    "Cache-Control": "public, max-age=86400",
    "CDN-Cache-Control": "public, max-age=31536000",
  },
  status = 200,
}: {
  imageStream: ReadStream | Readable;
  width?: number | undefined;
  height?: number | undefined;
  fit?: keyof FitEnum;
  headers?: HeadersInit;
  status?: number;
}) {
  const isGIF = (imageStream as ReadStream)?.path?.includes(".gif") ? true : false;
  // create the sharp transform pipeline
  // https://sharp.pixelplumbing.com/api-resize
  // you can also add watermarks, sharpen, blur, etc.
  const sharpTransforms = isGIF
    ? sharp({ animated: true })
        .resize({
          width,
          height,
          fit,
          position: sharp.strategy.attention, // will try to crop the image and keep the most interesting parts
        })
        .gif({ dither: 0 })
    : sharp()
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
      "Content-Type": isGIF ? "image/gif" : "image/webp",
      ...headers,
    },
    status,
  });
}

export function streamingResizeBuffer(
  imageBuffer: Buffer,
  width: number | undefined,
  height: number | undefined,
  fit: keyof FitEnum,
  headers: HeadersInit = {
    "Cache-Control": "public, max-age=86400",
    "CDN-Cache-Control": "public, max-age=31536000",
  },
  status: number = 200,
) {
  // create the sharp transform pipeline
  // https://sharp.pixelplumbing.com/api-resize
  // you can also add watermarks, sharpen, blur, etc.
  const sharpTransforms = sharp(imageBuffer)
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

  sharpTransforms.pipe(passthroughStream);

  return new Response(passthroughStream as any, {
    headers: {
      "Content-Type": "image/webp",
      ...headers,
    },
    status,
  });
}

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

export function handleError({
  error,
  width,
  height,
  fit = "contain",
  defaultImage,
}: {
  error?: unknown;
  width?: number;
  height?: number;
  fit?: keyof sharp.FitEnum;
  defaultImage?: boolean;
}) {
  // error needs to be typed
  const errorT = error as Error & { code: string };
  // if the read stream fails, it will have the error.code ENOENT
  if (errorT?.code === "ENOENT" || defaultImage) {
    const readStream = readFileAsStream("notfound", "assets");
    // read the image from the file system and stream it through the sharp pipeline
    return streamingResize({
      imageStream: readStream,
      width,
      height,
      fit,
      headers: {
        "Cache-Control": "public, max-age=600, must-revalidate",
        "CDN-Cache-Control": "public, max-age=600, must-revalidate",
      },
      status: 404,
    });
  }

  // if there is an error processing the image, we return a 500 error
  return new Response(errorT.message, {
    status: 500,
    statusText: errorT.message,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=120, must-revalidate",
    },
  });
}
