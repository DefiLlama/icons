FROM node:26

WORKDIR /app

# Install pnpm (corepack is no longer bundled in Node 25+ images)
RUN npm install -g pnpm@10

COPY package.json pnpm* ./
RUN pnpm install --frozen-lockfile

COPY . .

# Compile at image build time (as root). The runtime user cannot write to /app,
# so `pnpm start` (whose prestart hook runs tsc) would fail with EACCES.
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 5001

USER node
CMD ["pnpm", "run", "start"]
