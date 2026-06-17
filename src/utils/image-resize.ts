import { config } from "dotenv";
config();

import { readdirSync } from "fs";
import path from "path";
import type { FitEnum } from "sharp";
import sharp from "sharp";
import { getCache, setCache, sluggify } from "./cache-client";
import { MAX_AGE_1_YEAR, MAX_AGE_10_MINUTES, MAX_AGE_4_HOURS } from "./cache-control-helper";
import type { Request, Response } from "express";
import { fetchBufferWithTimeout } from "./async-timeout";

const blacklistedDomains = ["shibawallet.pro"];
const IMAGE_FETCH_TIMEOUT_MS = 8000;

interface ResizeParams {
  width: number | undefined;
  height: number | undefined;
  fit: keyof FitEnum;
  format: "webp" | "png";
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
  const formatEnum = ["webp", "png"];
  let format: "webp" | "png" = searchParams.has("format")
    ? ((searchParams.get("format") ?? "webp") as "webp" | "png")
    : ("webp" as "webp" | "png");
  if (!formatEnum.includes(format)) {
    format = "webp";
  }

  return { width, height, fit, format };
}

export const resizeImageBuffer = async (params: ResizeParams, buffer: Buffer) => {
  const { width, height, fit, format } = params;
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
    : format === "png"
    ? sharp(buffer)
        .resize({
          width,
          height,
          fit,
        })
        .png({ quality: 100 })
    : sharp(buffer)
        .resize({
          width,
          height,
          fit,
        })
        .webp({ lossless: true });

  const payload = await sharpTransforms.toBuffer();
  return {
    contentType: isGIF ? "image/gif" : format === "png" ? "image/png" : "image/webp",
    payload,
  };
};

export const resizeImage = async (params: ResizeParams, image: sharp.Sharp) => {
  const { width, height, fit, format } = params;
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
    : format === "png"
    ? image
        .resize({
          width,
          height,
          fit,
        })
        .png({ quality: 100 })
    : image
        .resize({
          width,
          height,
          fit,
        })
        .webp({ lossless: true });

  const payload = await sharpTransforms.toBuffer();
  return {
    contentType: isGIF ? "image/gif" : format === "png" ? "image/png" : "image/webp",
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
  "pegged": "assets/pegged",
  "protocols": "assets/protocols",
  "rwa": "assets/rwa",
  "stocks": "assets/stocks",
};

const getRawUrlCacheKey = (req: Request) => req.originalUrl.replace(/^\//, "").replace(/\/$/, "");

const isSafePathSegment = (value: string) => value.length > 0 && value !== "." && value !== ".." && !/[\\/]/.test(value);
const EQUITY_ASSETS_ROOT = path.join("assets/equities", "US");
const EQUITY_FLAGS_ROOT = path.join("assets/equities", "flags");
const EQUITY_LOGO_ALIASES: Record<string, string> = {
  "US:CON": "CONCENTRA",
};

const getEquityLogoName = (country: string, ticker: string) => {
  return EQUITY_LOGO_ALIASES[`${country.toUpperCase()}:${ticker.toUpperCase()}`] ?? ticker;
};

const handleAssetImageResize = async (
  req: Request,
  res: Response,
  {
    cacheKey,
    assetsRoot,
    name,
  }: {
    cacheKey: string | null;
    assetsRoot: string;
    name: string;
  },
) => {
  if (!cacheKey) {
    return res
      .status(400)
      .set({
        "Cache-Control": MAX_AGE_1_YEAR,
        "CDN-Cache-Control": MAX_AGE_1_YEAR,
      })
      .send("BAD REQUEST");
  }

  const resizeParams = extractParams(req);
  let _contentType: string;
  let _payload: Buffer;
  const cacheObject = await getCache(cacheKey);

  if (cacheObject) {
    _contentType = cacheObject.ContentType;
    _payload = cacheObject.Body;
  } else {
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
    await setCache({ Key: cacheKey, Body: payload, ContentType: contentType });
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
};

export const handleEquityImageResize = async (req: Request, res: Response) => {
  try {
    const { country, ticker } = req.params;
    if (!isSafePathSegment(country) || !isSafePathSegment(ticker)) {
      return res
        .status(400)
        .set({
          "Cache-Control": MAX_AGE_1_YEAR,
          "CDN-Cache-Control": MAX_AGE_1_YEAR,
        })
        .send("BAD REQUEST");
    }

    if (country !== "US") {
      return res
        .status(404)
        .set({
          "Cache-Control": MAX_AGE_4_HOURS,
          "CDN-Cache-Control": MAX_AGE_4_HOURS,
        })
        .send("NOT FOUND");
    }

    return await handleAssetImageResize(req, res, {
      cacheKey: getRawUrlCacheKey(req),
      assetsRoot: EQUITY_ASSETS_ROOT,
      name: getEquityLogoName(country, ticker),
    });
  } catch (err) {
    console.error(`[error] [handleEquityImageResize] ${req.url}`, err);
    return res
      .status(500)
      .set({ "Cache-Control": MAX_AGE_10_MINUTES, "CDN-Cache-Control": MAX_AGE_10_MINUTES })
      .send("ERROR");
  }
};

export const handleEquityCountryFlagResize = async (req: Request, res: Response) => {
  try {
    const { country } = req.params;
    if (!isSafePathSegment(country)) {
      return res
        .status(400)
        .set({
          "Cache-Control": MAX_AGE_1_YEAR,
          "CDN-Cache-Control": MAX_AGE_1_YEAR,
        })
        .send("BAD REQUEST");
    }

    return await handleAssetImageResize(req, res, {
      cacheKey: getRawUrlCacheKey(req),
      assetsRoot: EQUITY_FLAGS_ROOT,
      name: country,
    });
  } catch (err) {
    console.error(`[error] [handleEquityCountryFlagResize] ${req.url}`, err);
    return res
      .status(500)
      .set({ "Cache-Control": MAX_AGE_10_MINUTES, "CDN-Cache-Control": MAX_AGE_10_MINUTES })
      .send("ERROR");
  }
};

export const handleImageResize = async (req: Request, res: Response) => {
  try {
    const { category, name } = req.params;
    const Key = getCacheKey(req);

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

    const assetsRoot = ASSETS_ROOT_MAP[category];
    if (!assetsRoot) {
      return res.status(200).send("TOKEN ICONS NOT SUPPORTED YET");
    }

    return await handleAssetImageResize(req, res, {
      cacheKey: Key,
      assetsRoot,
      name,
    });
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
      const url = src.replace("/thumb/", "/large/");
      const { buffer, contentType, ok, status, responseUrl } = await fetchBufferWithTimeout(url, IMAGE_FETCH_TIMEOUT_MS);
      if (!ok || !contentType?.startsWith("image")) {
        console.error(`[error] [getImage] invalid response ${status} ${contentType ?? "unknown"} ${responseUrl}`);
        return null;
      }
      const image = sharp(buffer);
      await image.metadata();
      return image;
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
