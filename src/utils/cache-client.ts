import Redis from "ioredis";
import { saveFileToS3, getFileFromS3, deleteFileFromS3 } from "./s3-client";

const REDIS_URL = process.env.REDIS_URL as string;

const redis = new Redis(REDIS_URL);

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

export const purgeCloudflareCache = async (Key: string) => {
  // TODO: purge Cloudflare cache for both API and public bucket
  return true;
};

export const saveFileToS3AndCache = async (payload: { Key: string; Body: Buffer; ContentType: string }) => {
  try {
    const [resS3, resRedis] = await Promise.all([saveFileToS3(payload), setCache(payload)]);
    return resS3 && resRedis;
  } catch (error) {
    console.error("[error] [cache] [failed to save]", payload.Key);
    console.error(error);
    return false;
  }
};

export const deleteFileFromS3AndCache = async (Key: string) => {
  try {
    const [resS3, resRedis, resCloudflare] = await Promise.all([
      deleteCache(Key),
      deleteFileFromS3(Key),
      purgeCloudflareCache(Key),
    ]);
    return resS3 && resRedis && resCloudflare;
  } catch (error) {
    console.error("[error] [cache] [failed to delete]", Key);
    console.error(error);
    return false;
  }
};

export const getFileFromS3OrCacheBuffer = async (Key: string) => {
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

    await setCache({ Key, Body, ContentType });
    return Body;
  } catch (error) {
    console.error("[error] [cache] [failed to get S3 or redis]", Key);
    console.error(error);
    return null;
  }
};
