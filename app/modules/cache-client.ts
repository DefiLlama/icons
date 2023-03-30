import Redis from "ioredis";
import { Readable } from "stream";
import { saveFileToS3, getFileFromS3 } from "./s3-client";

const REDIS_URL = process.env.REDIS_URL as string;

const redis = new Redis(REDIS_URL);

export const setCache = async (key: string, value: Buffer) => {
  try {
    return await redis.set(key, value);
  } catch (error) {
    console.error("Error setting cache: ", key);
    console.error(error);
    return null;
  }
};

export const getCache = async (key: string) => {
  try {
    return await redis.getBuffer(key);
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
    await setCache(pathname, body);
    return true;
  } catch (error) {
    console.error("Error saving file to S3 and cache: ", pathname);
    console.error(error);
    return null;
  }
};

export const getFileFromS3OrCacheStream = async (key: string) => {
  try {
    const cache = await getCache(key);
    if (cache !== null) {
      return Readable.from(cache);
    }
    const data = await getFileFromS3(key);
    const _data = await data?.transformToByteArray();
    if (_data) {
      await setCache(key, Buffer.from(_data));
      return Readable.from(_data);
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting file from S3 or cache: ", key);
    console.error(error);
    return null;
  }
};
