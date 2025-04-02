import { getColourFromPath } from "./get-color";
import fs from 'fs';
import path from 'path';
import { cache } from '@defillama/sdk'

const protocolsDir = path.resolve(__dirname, '../../assets/protocols');
const files = fs.readdirSync(protocolsDir)
  .filter(file => fs.statSync(path.join(protocolsDir, file)).isFile() && path.extname(file) !== '.svg')
const fileNames = files.map(file => path.parse(file).name)

const colorPromises: any = [];
const batchSize = 100;
const finalRes: any = {};

async function processBatches() {
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize).map(file => getColourFromPath(path.join(protocolsDir, file)));
    const batchColors = await Promise.all(batch);
    colorPromises.push(...batchColors);
    console.log(`Processed batch ${i / batchSize + 1} of ${Math.ceil(files.length / batchSize)}`);
  }
}

processBatches().then(async () => {
  fileNames.forEach((fileName, index) => {
    finalRes[fileName] = colorPromises[index];
  });
  await cache.writeCache('icons/protocols-colors.json', finalRes);
}).then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });