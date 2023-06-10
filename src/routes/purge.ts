import { deleteFileFromS3AndCache, purgeCloudflareCache } from "../utils/cache-client";
import { Request, Response } from "express";
import { getCacheKeyFromUrl } from "../utils/image-resize";

// POST endpoint to purge a given URL from both CDN and redis cache
export default async (req: Request, res: Response) => {
  const authorization = req?.headers?.authorization;
  if (authorization !== "Llama " + process.env.ADMIN_AUTH) {
    console.error(`[error] [purge] UNAUTHORIZED ${authorization}`);
    return res.status(403).send("UNAUTHORIZED");
  }

  const body = req.body as { urls: string[] } | undefined;
  const urls = body?.urls;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).send("MISSING URL");
  }

  const Keys = urls.map((url) => getCacheKeyFromUrl(url)).filter((key) => key !== null) as string[];

  try {
    const [resNonCf, resCf] = await Promise.all([
      Promise.all(Keys.map((Key) => deleteFileFromS3AndCache(Key))),
      purgeCloudflareCache(urls),
    ]);
    const nonCfFails = resNonCf.some((res) => res !== true);
    const cfFails = resCf !== true;
    if (nonCfFails || cfFails) {
      return res.status(500).send("ERROR");
    } else {
      return res.status(200).send("DONE");
    }
  } catch (e) {
    console.error(`[error] [purge] ${urls}`, e);
    return res.status(500).send("ERROR");
  }
};
