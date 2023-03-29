// import redis and create an api to set and get binary from it
import { config } from "dotenv";
import { createClient } from "redis";
config();

export const redis = createClient({ url: process.env.REDIS_URL });

export const setCache = async (key: string, value: string | Buffer) => {
  try {
    await redis.set(key, value);
    return true;
  } catch (err) {
    console.log("error in setCache: " + key);
    console.log(err);
    return false;
  }
};

export const getCacheBin = async (key: string) => {
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return Buffer.from(data);
  } catch (err) {
    console.log("error in getCacheBin: " + key);
    console.log(err);
    return null;
  }
};

export const getCacheString = async (key: string) => {
  try {
    const data = await redis.get(key);
    return data;
  } catch (err) {
    console.log("error in getCacheString: " + key);
    console.log(err);
    return null;
  }
};

export const withCache = async (key: string, func: Function) => {
  const data = await getCacheBin(key);
  if (data) return data;
  const newData = await func();
  await setCache(key, newData);
  return newData;
};
