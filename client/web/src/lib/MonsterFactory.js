
import * as PIXI from 'pixi.js';
import { Spine } from 'pixi-spine';
import monsterAssets from '../constants/monsterAssets.json';

export class MonsterFactory {
  static async loadMonster(monsterKey) {
    const assetPath = monsterAssets[monsterKey];
    if (!assetPath) {
      console.error(`Monster key "${monsterKey}" not found in assets map.`);
      return null;
    }

    try {
      // Check if already loaded
      if (PIXI.Assets.cache.has(assetPath)) {
        return PIXI.Assets.cache.get(assetPath);
      }
      
      // Load the asset
      const resource = await PIXI.Assets.load(assetPath);
      // console.log('Loaded resource:', resource);
      return resource;
    } catch (error) {
      console.error(`Failed to load monster asset: ${assetPath}`, error);
      return null;
    }
  }

  static createSpine(resource) {
    if (!resource) {
      console.error('Invalid resource provided to createSpine');
      return null;
    }
    
    // Handle different return types from loader
    let spineData = resource;
    if (resource.spineData) {
      spineData = resource.spineData;
    }
    
    try {
        const spine = new Spine(spineData);
        return spine;
    } catch (e) {
        console.error('Error creating Spine instance:', e);
        return null;
    }
  }

  static getMonsterKeys() {
    return Object.keys(monsterAssets);
  }
}
