// import redis and create an api to set and get binary from it
import { config } from "dotenv";
import { createClient } from "redis";
config();

export const redis = createClient({ url: process.env.REDIS_URL });

export const setCache = async (key: string, value: Buffer) => {
  try {
    await redis.set(key, value);
    return true;
  } catch (err) {
    console.log(err);
    return false;
  }
};

export const getCache = async (key: string) => {
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return Buffer.from(data);
  } catch (err) {
    console.log(err);
    return null;
  }
};
