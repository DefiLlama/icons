import { config } from "dotenv";
import path from "path";
import koaCash from "koa-cash";
import Koa from "koa";
import Router from "koa-router";
import Redis from "ioredis";
import { loader as tokenList } from "./routes/token-list";
config();
const redis = new Redis(process.env.REDIS_URL!);

const app = new Koa();
const router = new Router();

app.use(
  koaCash({
    get: async (key) => {
      console.log("get", key);
      const data = await redis.get(key);
      if (!data) {
        console.log("no data");
      } else {
        console.log("yes data");
      }
      return data;
    },
    // @ts-ignore
    set: async (key, value: { body: string | number | Buffer }, maxAge) => {
      console.log("set", key, maxAge);
      // console.log(value.body);
      return await redis.set(key, JSON.stringify(value), "EX", maxAge / 1000);
    },
    setCachedHeader: true,
  }),
);

router.get("/", async (ctx) => {
  ctx.body = "issa llama whirl!";
});

router.get("/token-list2", async (ctx) => {
  if (await ctx.cashed(600_000)) {
    console.log("cached");
    return;
  }

  const _tokenList = await tokenList();
  ctx.type = "application/json";
  ctx.body = _tokenList;
});

app.use(router.routes());

app.listen(process.env.PORT || 3000, async () => {
  console.log("server started");
  // check redis status
  const pong = await redis.ping();
  console.log(pong === "PONG" ? "redis connected" : "redis not connected");
});
