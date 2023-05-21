import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const S3_ENDPOINT = process.env.S3_ENDPOINT as string;
const S3_BUCKET = process.env.S3_BUCKET as string;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID as string;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY as string;

const S3_CLIENT = new S3Client({
  region: "auto",
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
});

// principals -
// to optimize for speed, we don't do retries, so failures to get from S3 due to whatever reason are treated as misses.
// writes are attempted without guarantees, so failures just mean its not in S3 and next time we try to rewrite it.
// no local state or directory is maintained, so we don't have to worry about consistency between local and S3.
// no errors are ever thrown, just simple returns of null or true/false.

export const doesFileExistInS3 = async (key: string) => {
  try {
    const command = new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key });
    await S3_CLIENT.send(command);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const saveFileToS3 = async ({ Key, Body, ContentType }: { Key: string; Body?: Buffer; ContentType: string }) => {
  try {
    const command = new PutObjectCommand({ Bucket: S3_BUCKET, Key, Body, ContentType });
    await S3_CLIENT.send(command);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const getFileFromS3 = async (key: string) => {
  try {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    const res = await S3_CLIENT.send(command);
    const data = await res.Body?.transformToByteArray();
    const ContentType = res.ContentType;

    if (!data || !ContentType || data.length === 0) {
      return null;
    }

    return { Body: Buffer.from(data), ContentType };
  } catch (error) {
    console.error("[error] [S3] [failed to get]", key);
    console.error(error);
    return null;
  }
};

export const deleteFileFromS3 = async (key: string) => {
  try {
    const command = new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key });
    await S3_CLIENT.send(command);
    return true;
  } catch (error) {
    console.error("[error] [S3] [failed to delete]", key);
    console.error(error);
    return false;
  }
};
