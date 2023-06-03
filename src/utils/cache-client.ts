import { config } from "dotenv";
config();

import Redis from "ioredis";
import { saveFileToS3, getFileFromS3, deleteFileFromS3 } from "./s3-client";

const REDIS_URL = process.env.REDIS_URL as string;
const redis = new Redis(REDIS_URL);

const CF_PURGE_CACHE_AUTH = process.env.CF_PURGE_CACHE_AUTH as string;
const CF_ZONE = process.env.CF_ZONE as string;

export const sluggify = (input: string) => {
  const slug = decodeURIComponent(input)
    .toLowerCase()
    .replace(/[^\w\/]+/g, "-");
  return slug.replace(/^-+/, "").replace(/-+$/, "");
};

/**
 * RedisCacheObject is the object stored in Redis
 *
 * @property {string} Body - base64 encoded string of the content, e.g. image, html, etc.
 * @property {string} ContentType - the content type of the content, e.g. image/jpeg, text/html, etc.
 */
export type RedisCacheObject = {
  Body: string;
  ContentType: string;
};

export const setCache = async (payload: { Key: string; Body: Buffer; ContentType: string }, ttl?: string | number) => {
  try {
    const cacheObject: RedisCacheObject = {
      Body: payload.Body.toString("base64"),
      ContentType: payload.ContentType,
    };
    if (ttl) {
      await redis.set(payload.Key, JSON.stringify(cacheObject), "EX", ttl);
    } else {
      await redis.set(payload.Key, JSON.stringify(cacheObject));
    }
    return true;
  } catch (error) {
    console.error("[error] [cache] [failed to set]", payload.Key);
    console.error(error);
    return false;
  }
};

export const getCache = async (Key: string) => {
  try {
    const res = await redis.get(Key);
    if (res === null) {
      return null;
    }
    const cacheObject: RedisCacheObject = JSON.parse(res);
    const payload = {
      Key,
      Body: Buffer.from(cacheObject.Body, "base64"),
      ContentType: cacheObject.ContentType,
    };
    return payload;
  } catch (error) {
    console.error("[error] [cache] [failed to get]", Key);
    console.error(error);
    return null;
  }
};

export const deleteCache = async (Key: string) => {
  try {
    await redis.del(Key);
    return true;
  } catch (error) {
    console.error("[error] [cache] [failed to delete]", Key);
    console.error(error);
    return false;
  }
};

export const purgeCloudflareCache = async (urls: string[]) => {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/purge_cache`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_PURGE_CACHE_AUTH}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: urls,
      }),
    });
    const json = await res.json();
    if (json.success) {
      return true;
    }
    console.error("[error] [cache] [failed to purge]", urls);
    console.error(json);
    return false;
  } catch (error) {
    console.error("[error] [cache] [failed to purge]", urls);
    console.error(error);
    return false;
  }
};

export const saveFileToS3AndCache = async (
  payload: { Key: string; Body: Buffer; ContentType: string },
  ttl?: string | number,
) => {
  try {
    const [resS3, resRedis] = await Promise.all([saveFileToS3(payload), setCache(payload, ttl)]);
    return resS3 && resRedis;
  } catch (error) {
    console.error("[error] [cache] [failed to save]", payload.Key);
    console.error(error);
    return false;
  }
};

export const deleteFileFromS3AndCache = async (Key: string) => {
  try {
    const [resS3, resRedis] = await Promise.all([deleteCache(Key), deleteFileFromS3(Key)]);
    return resS3 && resRedis;
  } catch (error) {
    console.error("[error] [cache] [failed to delete]", Key);
    console.error(error);
    return false;
  }
};

export const getFileFromS3OrCacheBuffer = async (Key: string, ttl?: string | number) => {
  try {
    const cache = await getCache(Key);
    const cachedBuffer = cache?.Body ?? null;
    if (cachedBuffer !== null) {
      return cachedBuffer;
    }

    const file = await getFileFromS3(Key);
    if (file === null) {
      return null;
    }
    const { Body, ContentType } = file;

    await setCache({ Key, Body, ContentType }, ttl);
    return Body;
  } catch (error) {
    console.error("[error] [cache] [failed to get S3 or redis]", Key);
    console.error(error);
    return null;
  }
};
