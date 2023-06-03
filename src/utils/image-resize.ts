import { config } from "dotenv";
config();

import { readdirSync } from "fs";
import path from "path";
import type { FitEnum } from "sharp";
import sharp from "sharp";
import { getCache, setCache, sluggify } from "./cache-client";
import { MAX_AGE_1_YEAR, MAX_AGE_10_MINUTES, MAX_AGE_4_HOURS } from "./cache-control-helper";
import { Request, Response } from "express";
import { resToImage } from "./response";

const blacklistedDomains = ["shibawallet.pro"];

interface ResizeParams {
  width: number | undefined;
  height: number | undefined;
  fit: keyof FitEnum;
}

export function extractParams(req: Request): ResizeParams {
  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const searchParams = new URL(fullUrl).searchParams;

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

export const resizeImage = async (params: ResizeParams, image: sharp.Sharp) => {
  const { width, height, fit } = params;
  // determine if the image is a gif
  const isGIF = (await image.metadata()).format === "gif";
  const sharpTransforms = isGIF
    ? sharp(await image.toBuffer(), { animated: true })
        .resize({
          width,
          height,
          fit,
        })
        .gif({ dither: 0 })
    : image
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

export const getCacheKey = (req: Request, ignoreQueryParams = false) => {
  try {
    const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const url = new URL(fullUrl);
    let fullPath: string;
    if (!ignoreQueryParams) {
      fullPath = (url.pathname + url.search).replace(/^\//, "").replace(/\/$/, "");
    } else {
      fullPath = url.pathname.replace(/^\//, "").replace(/\/$/, "");
    }
    return sluggify(fullPath);
  } catch (err) {
    console.error(`[error] [getCacheKey] ${req.originalUrl}`, err);
    return null;
  }
};

export const getCacheKeyFromUrl = (url: string, ignoreQueryParams = false) => {
  try {
    const parsedUrl = new URL(url);
    let fullPath: string;
    if (!ignoreQueryParams) {
      fullPath = (parsedUrl.pathname + parsedUrl.search).replace(/^\//, "").replace(/\/$/, "");
    } else {
      fullPath = parsedUrl.pathname.replace(/^\//, "").replace(/\/$/, "");
    }
    return sluggify(fullPath);
  } catch (err) {
    console.error(`[error] [getCacheKeyFromUrl] ${url}`, err);
    return null;
  }
};

export const ASSETS_ROOT_MAP: { [key: string]: `assets/${string}` | undefined } = {
  "agg_icons": "assets/agg_icons",
  "chains": "assets/chains",
  "directory": "assets/directory",
  "extension": "assets/extension",
  "liquidations": "assets/liquidations",
  "memes": "assets/memes",
  "misc": "assets/misc",
  // "nfts": "assets/nfts",
  "pegged": "assets/pegged",
  "protocols": "assets/protocols",
};

export const handleImageResize = async (req: Request, res: Response) => {
  try {
    const Key = getCacheKey(req);
    if (Key === null) {
      return res
        .status(400)
        .set({
          "Cache-Control": MAX_AGE_1_YEAR,
          "CDN-Cache-Control": MAX_AGE_1_YEAR,
        })
        .send("BAD REQUEST");
    }

    const resizeParams = extractParams(req);
    // take the first 2 parts of the path
    const { category, name } = req.params;

    if (!Object.hasOwn(ASSETS_ROOT_MAP, category)) {
      console.error(`[error] [handleImageResize] ${req.originalUrl}`);
      return res
        .status(404)
        .set({
          "Cache-Control": MAX_AGE_4_HOURS,
          "CDN-Cache-Control": MAX_AGE_4_HOURS,
        })
        .send("NOT FOUND");
    }

    let _contentType: string;
    let _payload: Buffer;
    const cacheObject = await getCache(Key);

    if (cacheObject) {
      _contentType = cacheObject.ContentType;
      _payload = cacheObject.Body;
    } else {
      let assetsRoot = ASSETS_ROOT_MAP[category];
      if (!assetsRoot) {
        return res.status(200).send("TOKEN ICONS NOT SUPPORTED YET");
      }

      const image = await getImage(name, assetsRoot);
      if (!image) {
        return res
          .status(404)
          .set({
            "Cache-Control": MAX_AGE_4_HOURS,
            "CDN-Cache-Control": MAX_AGE_4_HOURS,
          })
          .send("NOT FOUND");
      }

      const { payload, contentType } = await resizeImage(resizeParams, image);
      await setCache({ Key, Body: payload, ContentType: contentType });
      _contentType = contentType;
      _payload = payload;
    }

    return res
      .status(200)
      .set({
        "Content-Type": _contentType,
        "Cache-Control": MAX_AGE_1_YEAR,
        "CDN-Cache-Control": MAX_AGE_1_YEAR,
      })
      .send(_payload);
  } catch (err) {
    console.error(`[error] [handleImageResize] ${req.url}`, err);
    return res
      .status(500)
      .set({ "Cache-Control": MAX_AGE_10_MINUTES, "CDN-Cache-Control": MAX_AGE_10_MINUTES })
      .send("ERROR");
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
    return new Response(`ERROR`, {
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
      if (blacklistedDomains.some((domain) => src.toLowerCase().includes(domain.toLowerCase()))) {
        return null;
      }
      const res = await fetch(src.replace("/thumb/", "/large/"));
      return await resToImage(res);
    } else {
      return null;
    }
  } catch (error) {
    console.error(`[error] [getImage]`, error);
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
