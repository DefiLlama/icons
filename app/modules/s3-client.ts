import { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

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

export const doesFileExistInS3 = async (key: string): Promise<boolean> => {
  try {
    const commad = new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key });

    await S3_CLIENT.send(commad);

    return true;
  } catch (error) {
    return false;
  }
};

export const saveFileToS3 = async ({
  pathname,
  body,
  ContentType,
}: {
  pathname: string;
  body?: Buffer;
  ContentType: string;
}) => {
  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: pathname,
      Body: body,
      ContentType,
    });

    await S3_CLIENT.send(command);

    return true;
  } catch (error) {
    console.log(error);

    return false;
  }
};

export const getFileFromS3 = async (key: string) => {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const data = await S3_CLIENT.send(command);

    return data;
  } catch (error) {
    console.log("key attempted: " + key);
    console.log(error);

    return null;
  }
};

export const checkIfFileExists = async (key: string) => {
  try {
    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    await S3_CLIENT.send(command);

    return true;
  } catch (error) {
    return false;
  }
};
