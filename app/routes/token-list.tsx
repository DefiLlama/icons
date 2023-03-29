const oneInchChains = {
  ethereum: 1,
  bsc: 56,
  polygon: 137,
  optimism: 10,
  arbitrum: 42161,
  avax: 43114,
  gnosis: 100,
  fantom: 250,
  klaytn: 8217,
};

export const geckoChainsMap: { [chain: string]: number } = {
  ethereum: 1,
  "binance-smart-chain": 56,
  "polygon-pos": 137,
  "optimistic-ethereum": 10,
  "arbitrum-one": 42161,
  avalanche: 43114,
  xdai: 100,
  fantom: 250,
  "klay-token": 8217,
  aurora: 1313161554,
  celo: 42220,
  cronos: 25,
  dogechain: 2000,
  moonriver: 1285,
  bittorrent: 199,
  oasis: 42262,
  velas: 106,
  heco: 128,
  "harmony-shard-0": 1666600000,
  boba: 288,
  "okex-chain": 66,
  fuse: 122,
  moonbeam: 1284,
};

export const loader = async () => {
  try {
    const [uniList, sushiList, geckoList, ownList] = await Promise.allSettled([
      fetch("https://tokens.uniswap.org/").then((r) => r.json()),
      fetch("https://token-list.sushi.com/").then((r) => r.json()),
      fetch("https://defillama-datasets.llama.fi/tokenlist/all.json").then((res) => res.json()),
      fetch("https://raw.githubusercontent.com/0xngmi/tokenlists/master/canto.json").then((res) => res.json()),
    ]);

    const oneInch = await Promise.all(
      Object.values(oneInchChains).map(async (chainId) =>
        fetch(`https://tokens.1inch.io/v1.1/${chainId}`).then((r) => r.json()),
      ),
    );

    const oneInchList = Object.values(oneInchChains)
      .map((chainId, i) =>
        Object.values(oneInch[i] as {}).map((token: any) => ({
          ...token,
          chainId,
        })),
      )
      .flat();

    const logoDirectory: { [chain: number]: { [token: string]: string } } = {};

    if (uniList.status === "fulfilled" && uniList.value.tokens) {
      uniList.value.tokens.forEach((token: { address: string; logoURI: string; chainId: number }) => {
        const address = token.address.toLowerCase();

        if (!logoDirectory[token.chainId]) {
          logoDirectory[token.chainId] = {};
        }

        if (!logoDirectory[token.chainId][address] && token.logoURI && !token.logoURI.startsWith("ipfs://")) {
          logoDirectory[token.chainId][address] = token.logoURI;
        }
      });
    }

    if (sushiList.status === "fulfilled" && sushiList.value.tokens) {
      sushiList.value.tokens.forEach((token: { address: string; logoURI: string; chainId: number }) => {
        const address = token.address.toLowerCase();

        if (!logoDirectory[token.chainId]) {
          logoDirectory[token.chainId] = {};
        }

        if (token.logoURI && !token.logoURI.startsWith("ipfs://") && !logoDirectory[token.chainId][address]) {
          logoDirectory[token.chainId][address] = token.logoURI.startsWith("https://")
            ? token.logoURI
            : `https://raw.githubusercontent.com/sushiswap/list/master/logos/token-logos/token/${token.logoURI}`;
        }
      });
    }

    if (ownList.status === "fulfilled" && ownList.value) {
      ownList.value.forEach((token: { address: string; logoURI: string; chainId: number }) => {
        const address = token.address.toLowerCase();

        if (!logoDirectory[token.chainId]) {
          logoDirectory[token.chainId] = {};
        }

        if (!logoDirectory[token.chainId][address] && token.logoURI && !token.logoURI.startsWith("ipfs://")) {
          logoDirectory[token.chainId][address] = token.logoURI;
        }
      });
    }

    if (oneInchList) {
      oneInchList.forEach((token: { address: string; logoURI: string; chainId: number }) => {
        const address = token.address.toLowerCase();

        if (!logoDirectory[token.chainId]) {
          logoDirectory[token.chainId] = {};
        }

        if (!logoDirectory[token.chainId][address] && token.logoURI && !token.logoURI.startsWith("ipfs://")) {
          logoDirectory[token.chainId][address] = token.logoURI;
        }
      });
    }

    if (geckoList.status === "fulfilled") {
      geckoList.value.forEach((token: { name: string; logoURI: string; platforms: { [chain: string]: string } }) => {
        if (token.platforms) {
          for (const chain in token.platforms) {
            if (token.platforms[chain] && geckoChainsMap[chain]) {
              const chainId = geckoChainsMap[chain];
              const address = token.platforms[chain].toLowerCase();

              if (!logoDirectory[chainId]) {
                logoDirectory[chainId] = {};
              }

              if (!logoDirectory[chainId][address] && token.logoURI && !token.logoURI.startsWith("ipfs://")) {
                logoDirectory[chainId][address] = token.logoURI;
              }
            }
          }
        }

        const name = token.name.toLowerCase();

        if (!logoDirectory[0]) {
          logoDirectory[0] = {};
        }

        if (!logoDirectory[0][name] && token.logoURI && !token.logoURI.startsWith("ipfs://")) {
          logoDirectory[0][name] = token.logoURI;
        }
      });
    }

    // return new Response(JSON.stringify({ tokens: logoDirectory }), {
    //   headers: {
    //     "content-type": "application/json",
    //     "Cache-Control": "max-age=600, must-revalidate",
    //     "CDN-Cache-Control": "max-age=600, must-revalidate",
    //   },
    //   status: 200,
    // });
    return { tokens: logoDirectory };
  } catch (error: unknown) {
    console.log(error);
    return { tokens: {} };
  }
};
