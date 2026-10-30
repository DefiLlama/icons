import { config } from "dotenv";
config();

import { readdirSync, realpathSync } from "fs";
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
}

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
}

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
  "crypto-cards": "assets/crypto-cards",
  "directory": "assets/directory",
  "exchanges": "assets/exchanges",
  "extension": "assets/extension",
  "liquidations": "assets/liquidations",
  "memes": "assets/memes",
  "misc": "assets/misc",
  "pegged": "assets/pegged",
  "protocols": "assets/protocols",
  "pre-ipo": "assets/pre-ipo",
  "rwa": "assets/rwa",
  "stocks": "assets/stocks",
};

const getRawUrlCacheKey = (req: Request) => req.originalUrl.replace(/^\//, "").replace(/\/$/, "");

/**
 * Validates a single path segment to prevent path traversal.
 * Checks for: empty, ".", "..", path separators, double-encoding, encoded dots.
 * Express auto-decodes URL params, so we check the decoded value.
 */
export const isSafePathSegment = (value: string): boolean => {
  if (!value || value.length === 0) return false;
  if (value === "." || value === "..") return false;
  if (/[\\/]/.test(value)) return false;
  // Detect double-encoding: %25 = encoded '%', so %252f = encoded '/'
  if (/%25/i.test(value)) return false;
  // Detect encoded dots: %2e = encoded '.', so %2e%2e = '..'
  if (/%2e%2e/i.test(value)) return false;
  return true;
};

const EQUITY_ASSETS_ROOT = path.join("assets/equities", "US");
const EQUITY_FLAGS_ROOT = path.join("assets/equities", "flags");
const EQUITY_LOGO_ALIASES: Record<string, string> = {
  "US:CON": "CONCENTRA",
};

const getEquityLogoName = (country: string, ticker: string) => {
  return EQUITY_LOGO_ALIASES[`${country.toUpperCase()}:${ticker.toUpperCase()}`] ?? ticker;
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
    
    // Layer 1: Segment validation (fast reject)
    if (!isSafePathSegment(name)) {
      return res.status(400).send("BAD REQUEST");
    }

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
    const { payload, contentType } = await resizeImageBuffer(resizeParams, await image.toBuffer());
    _contentType = contentType;
    _payload = payload;
    await setCache({ Key: cacheKey, Body: payload, ContentType: contentType });
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

/**
 * Resolves the source path with full containment check.
 * - Resolves symlinks with realpathSync
 * - Verifies resolved path is within assetsRoot using canonical paths
 * - Falls back to direct join only if file exists in directory listing
 */
function resolveSrcPath(src: string, assetsRoot: string): string | null {
  // Canonicalize the assets root (resolve symlinks)
  const canonicalRoot = realpathSync(assetsRoot);
  
  // First, try to find the file in the directory listing (case-insensitive)
  let srcPath: string | null = null;
  try {
    readdirSync(assetsRoot).forEach((file) => {
      const fileName = file.split(".");
      fileName.pop();
      if (fileName.join(".").toLowerCase() === src.toLowerCase()) {
        srcPath = path.join(assetsRoot, file);
      }
    });
  } catch {
    // Directory doesn't exist or isn't readable
    return null;
  }

  // If not found in directory, construct path and validate containment
  if (!srcPath) {
    const candidatePath = path.join(assetsRoot, src);
    
    // Resolve the full path (resolves symlinks)
    let canonicalCandidate: string;
    try {
      canonicalCandidate = realpathSync(candidatePath);
    } catch {
      // Path doesn't exist or isn't accessible
      return null;
    }
    
    // CRITICAL: Containment check - ensure resolved path is within assetsRoot
    const canonicalRoot = realpathSync(assetsRoot);
    const rootWithSep = canonicalRoot + path.sep;
    
    if (!canonicalCandidate.startsWith(rootWithSep) && canonicalCandidate !== canonicalRoot) {
      // Path escapes the assets root - traversal attempt
      return null;
    }
    
    srcPath = candidatePath;
  }

  // Final containment verification on the resolved path
  try {
    const canonicalSrc = realpathSync(srcPath);
    const canonicalRoot = realpathSync(assetsRoot);
    const rootWithSep = canonicalRoot + path.sep;
    
    if (!canonicalSrc.startsWith(rootWithSep) && canonicalSrc !== canonicalRoot) {
      return null;
    }
  } catch {
    return null;
  }

  return srcPath;
}

export function getSrcPath(src: string, assetsRoot: string) {
  const srcPath = resolveSrcPath(src, assetsRoot);
  if (!srcPath) {
    return null;
  }
  return srcPath;
}

export const getImage = async (src: string, assetsRoot?: string) => {
  try {
    if (assetsRoot) {
      const srcPath = getSrcPath(src, assetsRoot);
      if (!srcPath) {
        return null;
      }
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
    console.error(`[error] [getImage] ${src}`, error);
    return null;
  }
};