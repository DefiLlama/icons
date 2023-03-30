import { resToBuffer } from "~/modules/response";
import { checkIfFileExists } from "~/modules/s3-client";
import { saveFileToS3AndCache } from "~/modules/cache-client";

export const loader = async () => {
  try {
    // fetch token list
    const tokenList = await fetch("https://icons.llamao.fi/token-list").then((res) => res.json());
    let processed = 0;

    for (const chain in tokenList.tokens) {
      for (const token in tokenList.tokens[chain]) {
        const imgUrl = tokenList.tokens[chain][token];
        if (imgUrl.startsWith("https://assets.coingecko.com")) {
          const exists = await checkIfFileExists(`token/${chain}/${token}`);

          if (!exists) {
            const tokenImage = await fetch(imgUrl.replace("/thumb/", "/large/"));

            if (isValidImage(tokenImage)) {
              const resBuffer = await resToBuffer(tokenImage);

              await saveFileToS3AndCache({
                pathname: `token/${chain}/${token}`,
                body: resBuffer,
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

const isValidImage = (res: Response) => {
  const imgType = res.headers.get("content-type");

  return imgType && imgType.startsWith("image") ? true : false;
};
