import { resToBuffer } from "~/modules/response";
import { saveFileToS3, checkIfFileExists } from "~/modules/s3-client";

export const loader = async () => {
  try {
    // fetch token list
    const tokenList = await fetch("https://icons.llamao.fi/token-list").then((res) => res.json());

    for (const chain in tokenList.tokens) {
      for (const token in tokenList.tokens[chain]) {
        const imgUrl = tokenList.tokens[chain][token];
        // log imgUrl but remove the starting part of the url "https://assets.coingecko.com/coins/images/"
        console.log(chain, token, imgUrl.replace("https://assets.coingecko.com/coins/images/", ""));
        if (imgUrl.startsWith("https://assets.coingecko.com")) {
          const exists = await checkIfFileExists(`token/${chain}/${token}`);

          if (!exists) {
            const tokenImage = await fetch(imgUrl.replace("/thumb/", "/large/"));

            if (isValidImage(tokenImage)) {
              const resBuffer = await resToBuffer(tokenImage);
              console.log("valid image");

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

const isValidImage = (res: Response) => {
  const imgType = res.headers.get("content-type");

  return imgType && imgType.startsWith("image") ? true : false;
};
