import Redis from "ioredis";
import { saveFileToS3, getFileFromS3 } from "./s3-client";

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
    const buffer = await redis.getBuffer(Key);
    if (buffer === null) {
      return null;
    }
    const cacheObject: RedisCacheObject = JSON.parse(buffer.toString());
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
    return null;
  }
};

export const saveFileToS3AndCache = async (payload: { Key: string; Body: Buffer; ContentType: string }) => {
  try {
    await saveFileToS3(payload);
    await setCache(payload);
    return true;
  } catch (error) {
    console.error("Error saving file to S3 and cache: ", payload.Key);
    console.error(error);
    return null;
  }
};

export const deleteFileFromS3AndCache = async (Key: string) => {
  try {
    await deleteCache(Key);
    await getFileFromS3(Key);
    return true;
  } catch (error) {
    console.error("Error deleting file from S3 and cache: ", Key);
    console.error(error);
    return null;
  }
};

export const getFileFromS3OrCacheBuffer = async (Key: string) => {
  try {
    const cache = await getCache(Key);
    const cachedBuffer = cache?.body ? Buffer.from(cache.body, "base64") : null;
    if (cachedBuffer !== null) {
      return cachedBuffer;
    }

    const file = await getFileFromS3(Key);
    if (file === null) {
      return null;
    }
    const { Body, ContentType } = file;

    const _data = await Body?.transformToByteArray();
    if (_data) {
      await setCache(Key, Buffer.from(_data), ContentType);
      return Buffer.from(_data);
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting file from S3 or cache: ", Key);
    console.error(error);
    return null;
  }
};
