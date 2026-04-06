# Tug-of-War Character Sprites — Integration Guide

## Overview

This package contains 32×32 pixel art sprites for a multiplayer tug-of-war (rope war) game. There are two teams (blue and red), each with 9 animation states, plus horizontally flipped versions for both directions.

## File Naming Convention

```
{team}_{state}_{frame}.png        — facing right (pulling left)
{team}_{state}_{frame}_flip.png   — facing left (pulling right)
```

- **Teams**: `blue`, `red`
- **States**: `idle`, `pull`, `stumble`, `fallen`

## Sprite List

| File | Description |
|------|-------------|
| `{team}_idle_1.png` | Standing at rope, relaxed |
| `{team}_idle_2.png` | Standing at rope, slight arm shift |
| `{team}_pull_1.png` | Leaning back, starting pull |
| `{team}_pull_2.png` | Full effort pull, max lean |
| `{team}_pull_3.png` | Recovery after pull |
| `{team}_stumble_1.png` | Starting to lose balance |
| `{team}_stumble_2.png` | Mid stumble, sweat drops |
| `{team}_stumble_3.png` | Nearly falling |
| `{team}_fallen.png` | Fallen on the ground, dizzy eyes |

## Animation Sequences

Use these frame sequences for each game state. Recommended frame duration: **150–200ms** per frame.

```javascript
const ANIMATIONS = {
  idle:    ['idle_1', 'idle_2'],                                    // Loop
  pull:    ['pull_1', 'pull_2', 'pull_3', 'pull_2'],                // Loop while pulling
  stumble: ['stumble_1', 'stumble_2', 'stumble_3'],                 // Play once when losing ground
  fall:    ['stumble_1', 'stumble_2', 'stumble_3', 'fallen'],       // Play once on defeat
  recover: ['stumble_3', 'stumble_2', 'stumble_1', 'idle_1'],       // Play once after stumble
};
```

## Canvas Integration

### Loading Sprites

```javascript
// Preload all sprites for a team
async function loadTeamSprites(team, facing) {
  const suffix = facing === 'left' ? '_flip' : '';
  const states = [
    'idle_1', 'idle_2',
    'pull_1', 'pull_2', 'pull_3',
    'stumble_1', 'stumble_2', 'stumble_3',
    'fallen'
  ];

  const sprites = {};
  await Promise.all(states.map(state => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { sprites[state] = img; resolve(); };
      img.onerror = reject;
      img.src = `sprites/${team}_${state}${suffix}.png`;
    });
  }));
  return sprites;
}
```

### Drawing to Canvas

These are 32×32 pixel art sprites. Always disable image smoothing to keep them crisp when scaled up:

```javascript
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// Draw a sprite scaled up (e.g., 3x = 96×96 on screen)
const SCALE = 3;
function drawSprite(sprite, x, y) {
  ctx.drawImage(sprite, x, y, 32 * SCALE, 32 * SCALE);
}
```

### Animation Controller

```javascript
class CharacterAnimator {
  constructor(sprites) {
    this.sprites = sprites;
    this.currentAnim = 'idle';
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.frameDuration = 180; // ms per frame
    this.loop = true;
    this.onAnimEnd = null;
  }

  play(animName, { loop = true, onEnd = null } = {}) {
    this.currentAnim = animName;
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.loop = loop;
    this.onAnimEnd = onEnd;
  }

  update(dt) {
    const seq = ANIMATIONS[this.currentAnim];
    this.frameTimer += dt;
    if (this.frameTimer >= this.frameDuration) {
      this.frameTimer -= this.frameDuration;
      this.frameIndex++;
      if (this.frameIndex >= seq.length) {
        if (this.loop) {
          this.frameIndex = 0;
        } else {
          this.frameIndex = seq.length - 1;
          if (this.onAnimEnd) this.onAnimEnd();
        }
      }
    }
  }

  getCurrentSprite() {
    const seq = ANIMATIONS[this.currentAnim];
    const frameName = seq[this.frameIndex % seq.length];
    return this.sprites[frameName];
  }
}
```

### Game State → Animation Mapping

```javascript
// Suggested triggers for animation changes:
function updatePlayerAnimation(player, gameState) {
  if (gameState.winner) {
    // Losing team falls
    if (player.team !== gameState.winner) {
      player.animator.play('fall', { loop: false });
    }
  } else if (player.isStumbling) {
    // Player lost ground — play stumble, then recover
    player.animator.play('stumble', {
      loop: false,
      onEnd: () => player.animator.play('recover', {
        loop: false,
        onEnd: () => player.animator.play('idle')
      })
    });
  } else if (player.isPulling) {
    player.animator.play('pull');
  } else {
    player.animator.play('idle');
  }
}
```

## Technical Details

- **Size**: 32×32 pixels, transparent background (PNG with alpha)
- **Rope position**: Horizontal at y=16 (vertical center), drawn into each sprite
- **Anchor point**: Center of sprite (16, 16) aligns with the rope
- **Color palette**:
  - Blue team shirt: `rgb(74, 144, 217)` / `#4A90D9`
  - Red team shirt: `rgb(217, 74, 74)` / `#D94A4A`
  - Skin: `rgb(245, 196, 156)` / `#F5C49C`
  - Rope: `rgb(139, 115, 85)` / `#8B7355`
  - Pants: `rgb(58, 58, 106)` / `#3A3A6A`

## Tips

- The rope is baked into each sprite at y=16. If you draw a continuous rope across the game field, align it with sprite center Y.
- Use `_flip` variants for the team on the right side (pulling left). Non-flipped sprites face right and pull left.
- For multiplayer, you can programmatically tint the sprites to support more than 2 teams instead of using the red/blue variants.
- Stumble should trigger when the opposing team gains ground. The duration of the stumble animation gives a natural "recovery" window.
- Consider adding screen shake when a player transitions to `fallen`.
