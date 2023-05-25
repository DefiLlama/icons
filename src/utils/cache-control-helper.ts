export const ttlForEveryIntervalOf = (seconds: number) => {
  const now = Math.floor(Date.now() / 1000);
  const modulus = now % seconds;
  const nextInterval = now + seconds - modulus;
  const ttl = nextInterval - now;
  return ttl;
};

// returns cache control header entry for every interval of seconds. based on modulus of current time
export const forEveryIntervalOf = (seconds: number) => {
  return `public, max-age=${ttlForEveryIntervalOf(seconds)}`;
};

export const MAX_AGE_1_YEAR = `public, max-age=31536000`;
export const MAX_AGE_10_MINUTES = `public, max-age=600`;
export const MAX_AGE_4_HOURS = `public, max-age=14400`;
