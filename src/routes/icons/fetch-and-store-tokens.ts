import { Request, Response } from "express";
import { getCache, saveFileToS3AndCache } from "../../utils/cache-client";
import { resToBuffer } from "../../utils/response";
import { doesFileExistInS3 } from "../../utils/s3-client";
import { TOKEN_LIST_CACHE_KEY, TokenList, compileTokenList } from "../token-list";

export default async (req: Request, res: Response) => {
  const { authorization } = req.headers;
  if (authorization !== "Llama " + process.env.ADMIN_AUTH) {
    return res.status(403).send("UNAUTHORIZED");
  }

  try {
    let tokenList: TokenList;
    const cached = await getCache(TOKEN_LIST_CACHE_KEY);
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
        await fetchAndSaveTokenImage(`token/${chain}/${token}`, imgUrl);

        processed++;
        if (processed % 25 === 0) {
          console.log(`processed ${processed}`);
        }
      }
    }

    for (const geckoId in tokenList.gecko ?? {}) {
      await fetchAndSaveTokenImage(`token/gecko/${geckoId}`, tokenList.gecko[geckoId]);

      processed++;
      if (processed % 25 === 0) {
        console.log(`processed ${processed}`);
      }
    }

    return "success";
  } catch (error: unknown) {
    return JSON.stringify(error);
  }
};

const fetchAndSaveTokenImage = async (key: string, imgUrl: string) => {
  if (!imgUrl.startsWith("https://assets.coingecko.com")) return;

  const exists = await doesFileExistInS3(key);
  if (exists) return;

  const tokenImage = await fetch(imgUrl.replace("/thumb/", "/large/"));

  if (isValidImage(tokenImage)) {
    const resBuffer = await resToBuffer(tokenImage);

    await saveFileToS3AndCache({
      Key: key,
      Body: resBuffer,
      ContentType: tokenImage.headers.get("content-type") || "image/jpeg",
    });

    console.log(`saved ${imgUrl}`);
  }
};

const isValidImage = (res: globalThis.Response) => {
  const imgType = res.headers.get("content-type");

  return imgType && imgType.startsWith("image") ? true : false;
};
