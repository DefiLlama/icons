import Redis from "ioredis";
import { saveFileToS3, getFileFromS3 } from "./s3-client";

const REDIS_URL = process.env.REDIS_URL as string;

const redis = new Redis(REDIS_URL);

export type CacheObject = {
  body: string;
  ContentType: string;
};

export const setCache = async (key: string, value: Buffer, ContentType: string = "image/jpeg") => {
  try {
    const cacheObject: CacheObject = {
      body: value.toString("base64"),
      ContentType,
    };

    return await redis.set(key, JSON.stringify(cacheObject));
  } catch (error) {
    console.error("Error setting cache: ", key);
    console.error(error);
    return null;
  }
};

export const getCache = async (key: string) => {
  try {
    const value = await redis.getBuffer(key);
    if (value === null) {
      return null;
    }
    const cacheObject: CacheObject = JSON.parse(value.toString());
    return cacheObject;
  } catch (error) {
    console.error("Error getting cache: ", key);
    console.error(error);
    return null;
  }
};

export const saveFileToS3AndCache = async ({
  pathname,
  body,
  ContentType,
}: {
  pathname: string;
  body?: Buffer;
  ContentType: string;
}) => {
  if (body === undefined) {
    return null;
  }
  try {
    await saveFileToS3({ pathname, body, ContentType });
    await setCache(pathname, body, ContentType);
    return true;
  } catch (error) {
    console.error("Error saving file to S3 and cache: ", pathname);
    console.error(error);
    return null;
  }
};

export const getFileFromS3OrCacheBuffer = async (key: string) => {
  try {
    const cache = await getCache(key);
    const cachedBuffer = cache?.body ? Buffer.from(cache.body, "base64") : null;
    if (cachedBuffer !== null) {
      return cachedBuffer;
    }

    const file = await getFileFromS3(key);
    if (file === null) {
      return null;
    }
    const { Body, ContentType } = file;

    const _data = await Body?.transformToByteArray();
    if (_data) {
      await setCache(key, Buffer.from(_data), ContentType);
      return Buffer.from(_data);
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting file from S3 or cache: ", key);
    console.error(error);
    return null;
  }
};
