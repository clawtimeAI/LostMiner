
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const monstersDir = path.resolve(__dirname, '../public/assets/monsters/Source_Animations');
const outputFile = path.resolve(__dirname, '../src/constants/monsterAssets.json');

async function generateAssets() {
  try {
    const entries = await fs.readdir(monstersDir, { withFileTypes: true });
    const monsterMap = {};

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const folderPath = path.join(monstersDir, entry.name);
        const files = await fs.readdir(folderPath);
        const jsonFile = files.find(f => f.endsWith('.json'));

        if (jsonFile) {
          // Store relative path from public/
          monsterMap[entry.name] = `/assets/monsters/Source_Animations/${entry.name}/${jsonFile}`;
        }
      }
    }

    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, JSON.stringify(monsterMap, null, 2));
    console.log(`Generated monster assets map at ${outputFile}`);
  } catch (error) {
    console.error('Error generating assets:', error);
  }
}

generateAssets();
