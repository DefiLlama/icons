import { config } from "dotenv";
import path from "path";
import Koa from "koa";
import Router from "koa-router";
import Redis from "ioredis";
import { loader as tokenList } from "./routes/token-list";
config();
const redis = new Redis(process.env.REDIS_URL!);

const app = new Koa();
const router = new Router();

router.get("/", async (ctx) => {
  ctx.body = "issa llama whirl!";
});

router.get("/token-list", async (ctx) => {
  const cached = await redis.get("/token-list");
  ctx.headers["content-type"] = "application/json";
  ctx.headers["cache-control"] = "public, max-age=600";
  if (cached) {
    ctx.body = cached;
    return;
  }
  const _tokenList = await tokenList();
  const body = JSON.stringify(_tokenList);
  await redis.set("/token-list", body);
  await redis.expire("/token-list", 600);
  ctx.body = body;
});

const paletteRouter = new Router({ prefix: "/palette" });
paletteRouter.get("/directory/:src", async (ctx) => {
  const cached = await redis.get(ctx.path);
  ctx.headers["content-type"] = "text/plain;charset=UTF-8";
  ctx.headers["cache-control"] = "public, max-age=31536000";
  if (cached) {
    ctx.body = cached;
    return;
  }
  const _tokenList = await tokenList();
  const body = JSON.stringify(_tokenList);
  await redis.set(ctx.path, body);
  await redis.expire(ctx.path, 31536000);
  ctx.body = body;
});

app.use(router.routes());
app.use(paletteRouter.routes());

app.listen(process.env.PORT || 3000, async () => {
  console.log("server started");
  // check redis status
  const pong = await redis.ping();
  console.log(pong === "PONG" ? "redis connected" : "redis not connected");
});
