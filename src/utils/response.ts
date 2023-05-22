import sharp from "sharp";

export const resToBuffer = async (response: Response) => {
  const resBlob = await response.blob();
  const resBufferArray = await resBlob.arrayBuffer();
  return Buffer.from(resBufferArray);
};

export const resToImage = async (response: Response) => {
  const url = response.url;
  try {
    const resBlob = await response.blob();
    const resBufferArray = await resBlob.arrayBuffer();
    const image = sharp(resBufferArray);
    image.metadata();
    return image;
  } catch (error) {
    console.error(`[error] [resToImage] src: ${url} `, error);
    return null;
  }
};
