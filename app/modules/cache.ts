import { config } from "dotenv";
import { createClient } from "redis";
config();

export const redis = createClient({ url: process.env.REDIS_URL });

export const setCache = async (key: string, value: string | number | Buffer) => {
  try {
    const normalized =
      typeof value === "string"
        ? "STR::" + value
        : typeof value === "number"
        ? "NUM::" + value
        : "BIN::" + value.toString("binary");
    await redis.set(key, normalized);
    return true;
  } catch (err) {
    console.error("error in setCache: " + key);
    console.error(err);
    return false;
  }
};

export const getCache = async (key: string) => {
  try {
    const data = await redis.get(key);
    if (!data) return null;
    const type = data.slice(0, 5);
    const value = data.slice(5);
    if (type === "STR::") return value;
    if (type === "NUM::") return Number(value);
    if (type === "BIN::") return Buffer.from(value, "binary");
    return null;
  } catch (err) {
    console.error("error in getCache: " + key);
    console.error(err);
    return null;
  }
};

export const withCache = async (
  key: string,
  func: () => Promise<string | number | Buffer> | string | number | Buffer,
) => {
  const value = await getCache(key);
  if (value) return value;

  const newValue = await func();
  await setCache(key, newValue);
  return newValue;
};
