import Vibrant from "node-vibrant";
import { shade } from "polished";
import { hex } from "wcag-contrast";
import { MAX_AGE_1_YEAR, MAX_AGE_4_HOURS } from "./cache-control-helper";
import { Request, Response } from "express";
import { ASSETS_ROOT_MAP, getCacheKey } from "./image-resize";
import { readdirSync } from "fs";
import { getCache, setCache } from "./cache-client";

export const DEFAULT_COLOR = "#2172E5";

export const getColor = async (category: string, name: string) => {
  let color = DEFAULT_COLOR;
  const directory = `assets/${category}`;
  const files = readdirSync(directory);
  const path = files.find((file) => file.startsWith(name));
  if (!path) {
    return color;
  }
  const fullPath = `${directory}/${path}`;

  try {
    if (fullPath.match(/\.(jpg|jpeg|png)$/)) {
      await Vibrant.from(fullPath).getPalette((_err, palette) => {
        if (palette?.Vibrant) {
          let detectedHex = palette.Vibrant.hex;
          let AAscore = hex(detectedHex, "#FFF");

          while (AAscore < 3) {
            detectedHex = shade(0.005, detectedHex);
            AAscore = hex(detectedHex, "#FFF");
          }

          color = detectedHex;
        }
      });
    }
  } catch (error) {
    console.error(`[error] [get color] ${fullPath}`, error);
  }
  return color;
};

export const handlePalette = async (req: Request, res: Response) => {
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

  const Key = getCacheKey(req, true);
  if (Key === null) {
    return res
      .status(400)
      .set({
        "Cache-Control": MAX_AGE_1_YEAR,
        "CDN-Cache-Control": MAX_AGE_1_YEAR,
      })
      .send("BAD REQUEST");
  }

  let _contentType: string;
  let _payload: Buffer;
  let color: string;
  const cacheObject = await getCache(Key);

  if (cacheObject) {
    _contentType = cacheObject.ContentType;
    _payload = cacheObject.Body;
    color = _payload.toString("utf-8");
  } else {
    color = await getColor(category, name);
    _contentType = "text/plain;charset=UTF-8";
    _payload = Buffer.from(color);
    await setCache({ Key, Body: _payload, ContentType: _contentType });
  }

  return res
    .status(200)
    .set({
      "Content-Type": "text/plain;charset=UTF-8",
      ...(color !== DEFAULT_COLOR
        ? {
            "Cache-Control": MAX_AGE_1_YEAR,
            "CDN-Cache-Control": MAX_AGE_1_YEAR,
          }
        : {
            "Cache-Control": MAX_AGE_4_HOURS,
            "CDN-Cache-Control": MAX_AGE_4_HOURS,
          }),
    })
    .send(color);
};
