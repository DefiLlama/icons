export const resToBuffer = async (response: Response) => {
  const resBlob = await response.blob();
  const resBufferArray = await resBlob.arrayBuffer();
  return Buffer.from(resBufferArray);
};
