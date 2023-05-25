import { purgeCloudflareCache } from "../utils/cache-client";
import { Request, Response } from "express";

// POST endpoint to purge a given URL from both CDN and redis cache
export default async (req: Request, res: Response) => {
  const { url } = req.body as { url: string };
  const { authorization } = req.headers;
  if (authorization !== process.env.CACHE_PURGE_AUTH) {
    return res.status(403).send("UNAUTHORIZED");
  }
  if (!url) {
    return res.status(400).send("MISSING URL");
  }

  try {
    await purgeCloudflareCache(url);
    return res.status(200).send("DONE");
  } catch (e) {
    console.error(`[error] [purge] ${url}`, e);
    return res.status(500).send("ERROR");
  }
};
