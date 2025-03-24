// grid.js
import { computerChoosePlot } from './strategy.js';
import { displayFinalResults } from './main.js';

/**
 * Creates an interactive grid of cells and returns it as a 2D array (grid[row][col]).
 */
export function createGrid(scene, config) {
  const {
    gridSize,
    cellSize,
    margin,
    startX,
    startY,
    unsuitableProportion = 0,
    correlation = 0.0,
    maxValue = 20,
    BAUSet = []
  } = config;
  
  // Save grid start and height for later use in pointerdown animations.
  scene.userOptions.gridStartY = startY;
  const computedGridHeight = gridSize * cellSize + (gridSize - 1) * margin;
  scene.userOptions.gridHeight = computedGridHeight;
  
  const gridData = initializeGrid(gridSize, unsuitableProportion, correlation, maxValue);
  const cellValues = gridData.grid;
  let grid = [];
  
  for (let row = 0; row < gridSize; row++) {
    grid[row] = [];
    for (let col = 0; col < gridSize; col++) {
      const x = startX + col * (cellSize + margin);
      const y = startY + row * (cellSize + margin);
      const { ag, cons } = cellValues[row][col];
      const strokeColor = cons > ag ? 0x228B22 : cons < ag ? 0x654321 : 0xA9A9A9;
      
      let cell = scene.add.rectangle(x, y, cellSize, cellSize, 0xffffff)
        .setOrigin(0, 0)
        .setStrokeStyle(2, strokeColor)
        .setInteractive();
      cell.claimed = false;
      cell.row = row;
      cell.col = col;
      cell.cellData = cellValues[row][col];
      cell.cellData.isBAU = BAUSet.some(coord => coord.row === row && coord.col === col);
      
      let envText = scene.add.text(x + cellSize - 5, y + 5, cell.cellData.cons, {
        font: `${Math.floor(cellSize * 0.25)}px Arial`,
        fill: '#228B22'
      }).setOrigin(1, 0).setDepth(10);
      let agText = scene.add.text(x + 5, y + cellSize - 5, cell.cellData.ag, {
        font: `${Math.floor(cellSize * 0.25)}px Arial`,
        fill: '#5C4033'
      }).setOrigin(0, 1).setDepth(10);
      
      cell.envText = envText;
      cell.agText = agText;
      
      cell.on('pointerdown', () => {
        if (!cell.claimed) {
          const claimingTeam = scene.currentPlayer;
          const center = cell.getCenter();
          scene.input.enabled = false;
          let movingIcon;
          
          // On desktop (window.innerWidth >= 1024) use static sprites if available.
          // On devices, always use the off-screen anchor approach.
          if (window.innerWidth >= 1024) {
            if (claimingTeam === 'green' && scene.staticTree) {
              movingIcon = scene.add.image(scene.staticTree.x, scene.staticTree.y, 'tree')
                .setDisplaySize(cellSize, cellSize);
            } else if (claimingTeam === 'farmer' && scene.staticTractor) {
              movingIcon = scene.add.image(scene.staticTractor.x, scene.staticTractor.y, 'tractor')
                .setDisplaySize(cellSize, cellSize);
            } else {
              // Fallback to off-screen if static sprites are missing.
              movingIcon = getOffScreenSprite(scene, claimingTeam, cellSize, margin, gridSize);
            }
          } else {
            // For devices: use the off-screen anchor approach.
            movingIcon = getOffScreenSprite(scene, claimingTeam, cellSize, margin, gridSize);
          }
          
          scene.tweens.add({
            targets: movingIcon,
            x: center.x,
            y: center.y,
            duration: 600,
            onComplete: () => {
              movingIcon.destroy();
              const randomIndex = Phaser.Math.Between(1, 10);
              const claimKey = (claimingTeam === 'green')
                ? 'green' + randomIndex
                : 'farmer' + randomIndex;
              scene.add.image(center.x, center.y, claimKey)
                .setDisplaySize(cellSize, cellSize);
              scene.input.enabled = true;
              if (claimingTeam === 'green') {
                scene.greenPureScore += cell.cellData.cons;
                if (cell.cellData.isBAU) {
                  scene.cumGreenBAU = (scene.cumGreenBAU || 0) + 1;
                  const requiredDeduction = Math.floor(scene.cumGreenBAU * (1 - scene.leakage));
                  if (requiredDeduction > scene.cumFarmerDeduction) {
                    const diff = requiredDeduction - scene.cumFarmerDeduction;
                    scene.availFarmerClaims = Math.max(0, scene.availFarmerClaims - diff);
                    scene.cumFarmerDeduction += diff;
                  }
                }
                scene.greenScore = scene.greenPureScore + scene.greenDisplacementScore;
                scene.availGreenClaims = Math.max(0, scene.availGreenClaims - 1);
              } else {
                scene.farmerScore += cell.cellData.ag;
                scene.availFarmerClaims = Math.max(0, scene.availFarmerClaims - 1);
              }
              if (scene.farmerScoreText) scene.farmerScoreText.setText(`Farmer: ${scene.farmerScore}`);
              if (scene.greenScoreText) scene.greenScoreText.setText(`Green: ${scene.greenScore}`);
              if (scene.farmerClaimsText) scene.farmerClaimsText.setText(`Claims: ${scene.availFarmerClaims}`);
              if (scene.greenClaimsText) scene.greenClaimsText.setText(`Claims: ${scene.availGreenClaims}`);
              cell.claimed = true;
              cell.cellData.owner = claimingTeam;
              cell.envText.setColor('#ffffff');
              cell.agText.setColor('#ffffff');
              scene.currentPlayer = (claimingTeam === 'green') ? 'farmer' : 'green';
              scene.updateTurnText();
              skipIfNoClaims(scene);
              if (scene.currentPlayer === scene.computerTeam) {
                scene.input.enabled = false;
                scene.time.delayedCall(500, () => {
                  const claimParam = (scene.currentPlayer === 'green')
                    ? scene.availGreenClaims
                    : scene.availFarmerClaims;
                  const move = computerChoosePlot(scene.computerStrategy, scene.grid, claimParam);
                  if (move) {
                    scene.grid[move.row][move.col].emit('pointerdown');
                  } else {
                    scene.input.enabled = true;
                    maybeEndGame(scene);
                  }
                });
              } else {
                scene.input.enabled = true;
                maybeEndGame(scene);
              }
            }
          });
          cell.claimed = true;
        }
      });
      
      grid[row][col] = cell;
    }
  }
  return grid;
}

/**
 * Returns a moving sprite (tree for green, tractor for farmer) starting off-screen,
 * with its Y coordinate chosen randomly within a vertical band centered on the grid.
 */
function getOffScreenSprite(scene, claimingTeam, cellSize, margin, gridSize) {
  // Retrieve grid starting Y and height from userOptions.
  const gridStartY = scene.userOptions.gridStartY;
  const gridHeight = scene.userOptions.gridHeight || (gridSize * cellSize + (gridSize - 1) * margin);
  const gridCenterY = gridStartY + gridHeight / 2;
  // Define a vertical band covering 2/3 of the grid height, centered on the grid.
  const bandFraction = 2 / 3;
  const bandHeight = gridHeight * bandFraction;
  const halfBand = bandHeight / 2;
  const minY = gridCenterY - halfBand;
  const maxY = gridCenterY + halfBand;
  
  let startX, startY;
  if (claimingTeam === 'green') {
    startX = -cellSize;  // off-screen left
    startY = Phaser.Math.Between(minY, maxY);
  } else {
    startX = scene.userOptions.gameWidth + cellSize;  // off-screen right
    startY = Phaser.Math.Between(minY, maxY);
  }
  
  const spriteKey = (claimingTeam === 'green') ? 'tree' : 'tractor';
  return scene.add.image(startX, startY, spriteKey).setDisplaySize(cellSize, cellSize);
}

/**
 * If the current player has 0 claims, switch to the other side or end the game.
 */
function skipIfNoClaims(scene) {
  if (scene.currentPlayer === 'farmer' && scene.availFarmerClaims <= 0) {
    if (scene.availGreenClaims <= 0) {
      maybeEndGame(scene);
    } else {
      scene.currentPlayer = 'green';
      scene.updateTurnText();
    }
  } else if (scene.currentPlayer === 'green' && scene.availGreenClaims <= 0) {
    if (scene.availFarmerClaims <= 0) {
      maybeEndGame(scene);
    } else {
      scene.currentPlayer = 'farmer';
      scene.updateTurnText();
    }
  }
}

/**
 * Check if the game should end (if both sides have no claims left or there are no unclaimed cells).
 * Then, assign all leftover cells to green (displacement) and display final results.
 */
function maybeEndGame(scene) {
  let anyUnclaimed = false;
  for (let row of scene.grid) {
    for (let cell of row) {
      if (!cell.claimed) {
        anyUnclaimed = true;
        break;
      }
    }
    if (anyUnclaimed) break;
  }
  if ((scene.availFarmerClaims === 0 && scene.availGreenClaims === 0) || !anyUnclaimed) {
    // Assign any unclaimed cells to green.
    for (let row of scene.grid) {
      for (let cell of row) {
        if (!cell.claimed) {
          cell.claimed = true;
          cell.cellData.owner = 'green';
          scene.greenDisplacementScore += cell.cellData.cons;
          let center = cell.getCenter();
          scene.add.image(center.x, center.y, 'green' + Phaser.Math.Between(1, 10))
            .setDisplaySize(cell.width, cell.height);
          cell.envText.setColor('#ffffff');
          cell.agText.setColor('#ffffff');
        }
      }
    }
    scene.greenScore = scene.greenPureScore + scene.greenDisplacementScore;
    scene.greenScoreText.setText(`Green Score: ${scene.greenScore}`);
    scene.farmerScoreText.setText(`Farmer Score: ${scene.farmerScore}`);
    // For mobile, use the mobile final results display.
    if (window.innerWidth < 1024) {
      displayFinalResults(scene); // This function should now detect mobile mode and replace the page.
    } else {
      // Desktop version: show the overlay as before.
      displayFinalResults(scene);
    }
  }
}

/**
 * Initializes the numeric grid.
 */
function initializeGrid(gridSize, unsuitableProportion, correlation, maxValue) {
  const grid = [];
  for (let i = 0; i < gridSize; i++) {
    const row = [];
    for (let j = 0; j < gridSize; j++) {
      const [u1, u2] = generateUniformCorrelatedPair(correlation);
      const ag_value = Math.round(rescaleToRange(u1, 1, maxValue));
      const cons_value = Math.round(rescaleToRange(u2, 1, maxValue));
      row.push({ ag: ag_value, cons: cons_value, owner: '' });
    }
    grid.push(row);
  }
  return { grid };
}

/* --- Helper Math Functions --- */
function erf(x) {
  const sign = (x >= 0) ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normCDF(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function randomNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function generateUniformCorrelatedPair(rho) {
  const z1 = randomNormal(), z2 = randomNormal();
  const x = z1;
  const y = rho * z1 + Math.sqrt(1 - rho * rho) * z2;
  return [normCDF(x), normCDF(y)];
}

function rescaleToRange(u, minVal, maxVal) {
  return minVal + (maxVal - minVal) * u;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
