// import type { Request, Response, NextFunction } from "express";
const { config } = require("dotenv");
// import { createClient } from "redis";
const { createClient } = require("redis");
config();

const redis = createClient({ url: process.env.REDIS_URL });

// export const setCache = async (key: string, value: string | number | Buffer) => {
const setCache = async (key, value) => {
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

// export const getCache = async (key: string) => {
const getCache = async (key) => {
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

// export const withCache = async (
//   key: string,
//   func: () => Promise<string | number | Buffer> | string | number | Buffer,
// ) => {
const withCache = async (key, func) => {
  const value = await getCache(key);
  if (value) return value;

  const newValue = await func();
  await setCache(key, newValue);
  return newValue;
};

// express middleware to cache the response and return it if it exists
// export const cacheMiddleware = async (req: Request, res: Response, next: NextFunction) => {
const cacheMiddleware = async (req, res, next) => {
  const key = req.originalUrl || req.url;
  const cachedResponse = await getCache(key);
  if (cachedResponse) {
    console.log("cache hit: " + key);
    res.send(cachedResponse);
    return;
  }

  const sendResponse = async (body) => {
    console.log("cache miss: " + key);
    await setCache(key, body);
    res.send(body);
  };

  // @ts-ignore
  res.send = sendResponse.bind(res);

  next();
};

module.exports = { redis, setCache, getCache, withCache, cacheMiddleware };
