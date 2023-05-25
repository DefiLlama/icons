import { Request, Response } from "express";
import { getCache, saveFileToS3AndCache } from "../../../utils/cache-client";
import { resToBuffer } from "../../../utils/response";
import { doesFileExistInS3 } from "../../../utils/s3-client";
import { compileTokenList } from "../../token-list";

const CACHE_KEY = "token-list";

export default async (req: Request, res: Response) => {
  const { authorization } = req.headers;
  if (authorization !== "Llama " + process.env.ADMIN_AUTH) {
    return res.status(403).send("UNAUTHORIZED");
  }

  try {
    let tokenList: { tokens: { [chain: number]: { [token: string]: string } } };
    const cached = await getCache(CACHE_KEY);
    if (cached) {
      const { Body } = cached;
      tokenList = JSON.parse(Body.toString("utf-8"));
    } else {
      tokenList = await compileTokenList();
    }

    let processed = 0;

    for (const chain in tokenList.tokens) {
      for (const token in tokenList.tokens[chain]) {
        const imgUrl = tokenList.tokens[chain][token];
        if (imgUrl.startsWith("https://assets.coingecko.com")) {
          const exists = await doesFileExistInS3(`token/${chain}/${token}`);

          if (!exists) {
            const tokenImage = await fetch(imgUrl.replace("/thumb/", "/large/"));

            if (isValidImage(tokenImage)) {
              const resBuffer = await resToBuffer(tokenImage);

              await saveFileToS3AndCache({
                Key: `token/${chain}/${token}`,
                Body: resBuffer,
                ContentType: tokenImage.headers.get("content-type") || "image/jpeg",
              });

              console.log(`saved ${imgUrl}`);
            }
          }
        }

        processed++;
        if (processed % 25 === 0) {
          console.log(`processed ${processed}`);
        }
      }
    }

    return "success";
  } catch (error: unknown) {
    return JSON.stringify(error);
  }
};

const isValidImage = (res: globalThis.Response) => {
  const imgType = res.headers.get("content-type");

  return imgType && imgType.startsWith("image") ? true : false;
};
