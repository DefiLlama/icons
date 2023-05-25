import express from "express";
import pino from "pino";
import { config } from "dotenv";
config();

import rootHandler from "./routes";
import purgeHandler from "./routes/purge";
import tokenListHandler from "./routes/token-list";
import tokensHandler from "./routes/icons/tokens";
import fetchAndStoreTokensHandler from "./routes/icons/fetch-and-store-tokens";
import { handleImageResize } from "./utils/image-resize";

const app = express();

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

app.use((req, _, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

app.get("/tokens/:chainId/:tokenAddress", tokensHandler);
app.post("/fetch-and-store-tokens", fetchAndStoreTokensHandler);
app.get("/", rootHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
