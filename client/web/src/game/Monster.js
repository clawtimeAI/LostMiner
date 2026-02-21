
import * as PIXI from 'pixi.js';
import { MonsterFactory } from '../lib/MonsterFactory.js';

export class Monster extends PIXI.Container {
  constructor(id, type, tileSize = 30) {
    super();
    this.id = id;
    this.type = type;
    this.tileSize = tileSize;
    this.spine = null;
    this.direction = 1; // 1 = right, -1 = left
    
    // Movement
    this.targetPos = null;
    this.isMoving = false;
    this.speed = 2; // Pixels per frame
  }

  async init() {
    if (this.spine) return; // Already initialized

    try {
      const resource = await MonsterFactory.loadMonster(this.type);
      if (resource) {
        this.spine = MonsterFactory.createSpine(resource);
        if (this.spine) {
          // Add spine to container
          this.addChild(this.spine);
          
          // Log available skins and animations
          console.log(`Monster ${this.type} loaded. Skins:`, this.spine.spineData.skins.map(s => s.name), 'Animations:', this.spine.spineData.animations.map(a => a.name));
          
          // Set skin if needed
          if (this.spine.spineData.skins.length > 0) {
            const skin = this.spine.spineData.skins.find(s => s.name !== 'default') || this.spine.spineData.skins[0];
            if (skin) {
              this.spine.skeleton.setSkin(skin);
              this.spine.skeleton.setSlotsToSetupPose();
            }
          }
          
          // Force update to ensure bounds are correct
          this.spine.update(0);

          // Get local bounds of the spine object itself
          const localBounds = this.spine.getLocalBounds();
          const w = localBounds.width;
          const h = localBounds.height;
          const maxDim = Math.max(w, h);
          
          // STRICT SCALING: Fit within the hex tile diameter (2 * tileSize)
          // Use 90% of the diameter to leave a small margin
          const targetSize = this.tileSize * 2.0 * 0.9; 
          
          if (maxDim > 0) {
              const scale = targetSize / maxDim;
              this.spine.scale.set(scale);
              
              // Center the spine using pivot
              // localBounds.x/y is the top-left corner relative to the spine's origin
              // We want the center of the bounding box to be at (0,0) of the Monster container
              const cx = localBounds.x + w / 2;
              const cy = localBounds.y + h / 2;
              this.spine.pivot.set(cx, cy);
              
              console.log(`Monster ${this.type} scaled: ${scale.toFixed(2)}, centered at pivot (${cx.toFixed(1)}, ${cy.toFixed(1)})`);
          }

          // Start the animation loop instead of just playing Idle
          this.startAnimationLoop();
          
        } else {
            console.error(`Failed to create Spine instance for ${this.type}`);
        }
      } else {
          console.error(`Failed to load resource for ${this.type}`);
      }
    } catch (e) {
      console.error(`Error initializing monster ${this.type}:`, e);
    }
  }

  startAnimationLoop() {
    console.log(`[Monster] startAnimationLoop for ${this.type}`);
    
    if (!this.spine) {
        console.error(`[Monster] Cannot start loop: Spine not loaded for ${this.type}`);
        return;
    }
    
    const animations = this.spine.spineData.animations.map(a => a.name);
    console.log(`[Monster] Available animations for ${this.type}:`, animations);
    
    // Play Idle initially
    this.playAnimation('Idle', true);
    this.currentAnim = 'Idle';
  }

  playAnimation(name, loop = false, onComplete = null) {
    if (!this.spine || !this.spine.state) return;
    
    // Check if animation exists
    let animName = name;
    // Helper to find animation
    const findAnim = (n) => this.spine.spineData.animations.find(a => a.name === n);

    if (!findAnim(animName)) {
       // Try lowercase or other common variants
       if (findAnim(name.toLowerCase())) {
         animName = name.toLowerCase();
       } else if (findAnim('idle')) {
         animName = 'idle';
       } else if (findAnim('Idle')) {
         animName = 'Idle';
       } else {
         // Fallback to first animation
         const first = this.spine.spineData.animations[0];
         if (first) {
             animName = first.name;
             // console.log(`Animation ${name} not found, falling back to ${animName}`);
         } else {
             console.warn(`No animations found for monster ${this.type}`);
             return;
         }
       }
    }
    
    try {
        // console.log(`Playing animation ${animName} for ${this.type}`);
        const entry = this.spine.state.setAnimation(0, animName, loop);
        if (onComplete) {
            entry.listener = {
                complete: () => {
                    onComplete();
                }
            };
        }
    } catch (e) {
        console.warn(`Failed to play animation ${animName} for monster ${this.type}`, e);
    }
  }

  syncFromServer(data) {
    // Debug output for coordinates
    if (data.x !== undefined && data.y !== undefined) {
        console.log(`[Monster ${this.id}] Sync pos: (${data.x.toFixed(2)}, ${data.y.toFixed(2)})`);
    }

    // data: { x, y, state, alive, direction, col, row }
    // Interpolation is handled in update() using this.targetPos
    
    // Priority: use col/row if available to ensure grid alignment
    if (data.col !== undefined && data.row !== undefined) {
         // Import offsetToPixel dynamically or assume global? 
         // Better to rely on x,y IF Watch.jsx layers are aligned.
         // But user asked for grid based coords.
         // Let's use the provided x,y which are now consistent with server grid calculation (0,0 based).
         // AND since we fixed Watch.jsx layers, 0,0 based pixels will display correctly on the map.
         
         // However, to be absolutely safe and "grid based", we can recalculate.
         // But Monster.js doesn't know tileSize easily unless passed in constructor.
         // Constructor has tileSize.
         
         // Let's trust x/y for smooth movement, but we could snap to grid if needed.
         // For now, standard interpolation with x/y is best for visuals.
         // The key fix was aligning the layers in Watch.jsx.
         
         this.targetPos = { x: data.x, y: data.y };
         this.isMoving = true;
    } else if (data.x !== undefined && data.y !== undefined) {
        this.targetPos = { x: data.x, y: data.y };
        this.isMoving = true; // Enable interpolation
    }
    
    // Always force animation update if state is provided, or if we haven't set an initial animation
    if (data.state !== undefined || !this.currentAnim) {
        const state = data.state || 'idle';
        const alive = data.alive !== undefined ? data.alive : this.alive;
        
        // Handle revival
        if (!this.alive && alive) {
            this.alive = true;
            this.playAnimation('Idle', true);
            this.currentAnim = 'Idle';
        }
        
        // Handle death
        if (this.alive && !alive) {
            this.alive = false;
            this.playAnimation('Death', false);
            this.currentAnim = 'Death';
        }
        
        if (this.alive) {
            if (state === 'moving') {
                if (this.currentAnim !== 'Walk') {
                    this.playAnimation('Walk', true);
                    this.currentAnim = 'Walk';
                }
            } else {
                // Default to Idle for any other state (idle, doing_task, etc.)
                if (this.currentAnim !== 'Idle') {
                    this.playAnimation('Idle', true);
                    this.currentAnim = 'Idle';
                }
            }
        }
    }
  }

  update(delta) {
    if (this.isMoving && this.targetPos) {
      const dx = this.targetPos.x - this.x;
      const dy = this.targetPos.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Interpolate
      const speed = 0.2 * delta; // Adjust smoothing
      
      if (dist < 1.0) {
        this.x = this.targetPos.x;
        this.y = this.targetPos.y;
        // this.isMoving = false; // Keep enabled for continuous updates
      } else {
        // Lerp
        this.x += (dx * 0.1); // Simple lerp factor
        this.y += (dy * 0.1);
        
        // Update direction
        if (dx > 0 && this.direction !== 1) this.setDirection(1);
        else if (dx < 0 && this.direction !== -1) this.setDirection(-1);
      }
    }
  }

  moveTo(x, y, onComplete) {
    this.targetPos = { x, y };
    this.isMoving = true;
    this.onMoveComplete = onComplete;
    this.playAnimation('Walk', true);
  }

  setDirection(dir) {
    this.direction = dir;
    if (this.spine) {
      this.spine.scale.x = Math.abs(this.spine.scale.x) * dir;
    }
  }
}
