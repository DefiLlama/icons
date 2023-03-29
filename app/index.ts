import { config } from "dotenv";
import path from "path";
import Koa from "koa";
import Router from "koa-router";
import Redis from "ioredis";
config();
const redis = new Redis(process.env.REDIS_URL!);

const app = new Koa();
const router = new Router();

router.get("/", async (ctx) => {
  ctx.body = "issa llama whirl!";
});

router.get("/test", async (ctx) => {
  console.log(ctx.query);
  ctx.body = "test";
});

app.use(router.routes());

app.listen(process.env.PORT || 3000, async () => {
  console.log("server started");
  // check redis status
  const pong = await redis.ping();
  console.log(pong === "PONG" ? "redis connected" : "redis not connected");
});
