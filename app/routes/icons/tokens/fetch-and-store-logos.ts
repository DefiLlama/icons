import { resToBuffer } from "~/modules/response";
import { saveFileToS3, getFileFromS3 } from "~/modules/s3-client";

export const loader = async () => {
  try {
    // fetch token list
    const tokenList = await fetch("https://icons.llamao.fi/token-list").then((res) => res.json());

    for (const chain in tokenList.tokens) {
      for (const token in tokenList.tokens[chain]) {
        const imgUrl = tokenList.tokens[chain][token];
        if (imgUrl.startsWith("https://assets.coingecko.com")) {
          const fileFromS3 = await getFileFromS3(`token/${chain}/${token}`);

          if (!fileFromS3) {
            const tokenImage = await fetch(imgUrl.replace("/thumb/", "/large/"));

            if (isvalidImage(tokenImage)) {
              const resBuffer = await resToBuffer(tokenImage);

              await saveFileToS3({
                pathname: `token/${chain}/${token}`,
                body: resBuffer,
                ContentType: tokenImage.headers.get("content-type") || "image/jpeg",
              });

              console.log(`saved ${imgUrl}`);
            }
          }
        }
      }
    }

    return "success";
  } catch (error: unknown) {
    return JSON.stringify(error);
  }
};

const isvalidImage = (res: Response) => {
  const imgType = res.headers.get("content-type");

  return imgType && imgType.startsWith("image") ? true : false;
};
