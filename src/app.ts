import express, { Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";
import { config } from "dotenv";
config();

import rootHandler from "./routes";
import purgeHandler from "./routes/purge";
import tokenListHandler from "./routes/token-list";
import tokensHandler from "./routes/icons/tokens";
import fetchAndStoreTokensHandler from "./routes/icons/fetch-and-store-tokens";
import { handleImageResize } from "./utils/image-resize";
import { MAX_AGE_1_YEAR, MAX_AGE_4_HOURS } from "./utils/cache-control-helper";
import { handlePalette } from "./utils/get-color";

const app = express();
app.disable("x-powered-by");

Sentry.init({ dsn: process.env.SENTRY_DSN });

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());

const logger = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const method = req.method;
  const url = req.url;
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    console.log(`[${method}][${status}][${ip}][${duration}ms] ${url}`);
  });

  next();
};
app.use(logger);

app.use(
  express.static("public", {
    setHeaders: (res) => {
      res.set({
        "Cache-Control": MAX_AGE_1_YEAR,
        "CDN-Cache-Control": MAX_AGE_1_YEAR,
      });
    },
  }),
);

app.get("/", rootHandler);
app.get("/token-list", tokenListHandler);
app.get("/purge", purgeHandler);
app.get("/icons/tokens/:chainId/:tokenAddress", tokensHandler);
app.get("/icons/:category/:name", handleImageResize);
app.get("/palette/:category/:name", handlePalette);

app.post("/fetch-and-store-tokens", fetchAndStoreTokensHandler);

app.all("*", (_: Request, res: Response) => {
  res
    .status(404)
    .set({
      "Cache-Control": MAX_AGE_4_HOURS,
      "CDN-Cache-Control": MAX_AGE_4_HOURS,
    })
    .send("NOT FOUND");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
