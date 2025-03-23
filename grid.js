
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

  // 1) Generate the numeric data for each cell
  const gridData = initializeGrid(gridSize, unsuitableProportion, correlation, maxValue);
  const cellValues = gridData.grid; // a 2D array of { ag, cons, owner: '' }

  let grid = [];

  // 2) Build interactive rectangles
  for (let row = 0; row < gridSize; row++) {
    grid[row] = [];
    for (let col = 0; col < gridSize; col++) {
      const x = startX + col * (cellSize + margin);
      const y = startY + row * (cellSize + margin);

      // Determine stroke color based on cons vs. ag
      const { ag, cons } = cellValues[row][col];
      let strokeColor;
      if (cons > ag) {
        strokeColor = 0x228B22; // green
      } else if (cons < ag) {
        strokeColor = 0x654321; // brown
      } else {
        strokeColor = 0xA9A9A9; // grey if tie
      }

      // Create the clickable rectangle with the chosen stroke color
      let cell = scene.add.rectangle(x, y, cellSize, cellSize, 0xffffff)
        .setOrigin(0, 0)
        .setStrokeStyle(2, strokeColor)
        .setInteractive();

      // Attach custom data to the cell
      cell.claimed = false;
      cell.row = row;
      cell.col = col;
      cell.cellData = cellValues[row][col];

      // Mark BAU if in config.BAUSet
      cell.cellData.isBAU = BAUSet.some(coord => coord.row === row && coord.col === col);

      // Add text for environmental value in the top-right
      let envText = scene.add.text(x + cellSize - 5, y + 5, cell.cellData.cons, {
        font: '24px Arial',
        fill: '#228B22' // greenish
      })
      .setOrigin(1, 0)
      .setDepth(10);

      // Add text for agricultural value in the bottom-left
      let agText = scene.add.text(x + 5, y + cellSize - 5, cell.cellData.ag, {
        font: '24px Arial',
        fill: '#5C4033' // brownish
      })
      .setOrigin(0, 1)
      .setDepth(10);

      cell.envText = envText;
      cell.agText = agText;

      // 3) On pointerdown
      cell.on('pointerdown', () => {
        if (!cell.claimed) {
          let claimingTeam = scene.currentPlayer;
          let center = cell.getCenter();
          scene.input.enabled = false; // disable input during animation

          // Animate icon from the tree or tractor
          let movingIcon;
          if (claimingTeam === 'green') {
            movingIcon = scene.add
              .image(scene.staticTree.x, scene.staticTree.y, 'tree')
              .setDisplaySize(cellSize, cellSize);
          } else {
            movingIcon = scene.add
              .image(scene.staticTractor.x, scene.staticTractor.y, 'tractor')
              .setDisplaySize(cellSize, cellSize);
          }

          // Tween from the static icon to the cell center
          scene.tweens.add({
            targets: movingIcon,
            x: center.x,
            y: center.y,
            duration: 600,
            onComplete: () => {
              // Remove the moving icon
              movingIcon.destroy();

              // Place the final sprite (e.g. green1..green10 or farmer1..10)
              let randomIndex = Phaser.Math.Between(1, 10);
              let claimKey = (claimingTeam === 'green')
                ? 'green' + randomIndex
                : 'farmer' + randomIndex;

              scene.add.image(center.x, center.y, claimKey)
                   .setDisplaySize(cell.width, cell.height);

              // Re-enable input by default
              scene.input.enabled = true;

              // 4) Update scores/claims
              if (claimingTeam === 'green') {
                // "Active" green claim => greenPureScore
                scene.greenPureScore += cell.cellData.cons;

                // If cell is in BAU, partial penalty might reduce farmer claims
                if (cell.cellData.isBAU) {
                  scene.cumGreenBAU = (scene.cumGreenBAU || 0) + 1;
                  let requiredDeduction = Math.floor(
                    scene.cumGreenBAU * (1 - scene.leakage)
                  );
                  if (requiredDeduction > scene.cumFarmerDeduction) {
                    let diff = requiredDeduction - scene.cumFarmerDeduction;
                    scene.availFarmerClaims = Math.max(0, scene.availFarmerClaims - diff);
                    scene.cumFarmerDeduction += diff;
                  }
                }

                scene.greenScore = scene.greenPureScore + scene.greenDisplacementScore;
                scene.availGreenClaims = Math.max(0, scene.availGreenClaims - 1);

              } else {
                // Farmer claims
                scene.farmerScore += cell.cellData.ag;
                scene.availFarmerClaims = Math.max(0, scene.availFarmerClaims - 1);
              }

              // Update scoreboard text
              scene.farmerScoreText.setText(`Farmer Score: ${scene.farmerScore}`);
              scene.greenScoreText.setText(`Green Score: ${scene.greenScore}`);
              scene.farmerClaimsText.setText(`Farmer Claims: ${scene.availFarmerClaims}`);
              scene.greenClaimsText.setText(`Green Claims: ${scene.availGreenClaims}`);

              // Mark the cell as claimed
              cell.claimed = true;
              cell.cellData.owner = claimingTeam;
              cell.envText.setColor('#ffffff');
              cell.agText.setColor('#ffffff');

              // 5) Switch turns
              scene.currentPlayer = (claimingTeam === 'green') ? 'farmer' : 'green';
              scene.updateTurnText();

              // 6) Possibly skip if new currentPlayer has no claims
              skipIfNoClaims(scene);

              // 7) If AI turn
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
                // If it's the human's turn, re-enable
                scene.input.enabled = true;
                maybeEndGame(scene);
              }
            }
          });

          // Mark the cell as claimed so we do not double-click in the same cycle
          cell.claimed = true;
        }
      });

      // Store the cell in the grid array
      grid[row][col] = cell;
    }
  }

  return grid;
}

/**
 * If the current player has 0 claims, switch immediately to the other side,
 * or if both are 0, call maybeEndGame.
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
 * Check if the game should end:
 *  - if both sides are out of claims, OR
 *  - if there are no unclaimed cells left.
 * Then leftover => green => displacement, call displayFinalResults.
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

  if (
    (scene.availFarmerClaims === 0 && scene.availGreenClaims === 0) ||
    !anyUnclaimed
  ) {
    // leftover => green => displacement
    for (let row of scene.grid) {
      for (let cell of row) {
        if (!cell.claimed) {
          cell.claimed = true;
          cell.cellData.owner = 'green';
          scene.greenDisplacementScore += cell.cellData.cons;

          let center = cell.getCenter();
          scene.add.image(
            center.x,
            center.y,
            'green' + Phaser.Math.Between(1, 10)
          ).setDisplaySize(cell.width, cell.height);

          cell.envText.setColor('#ffffff');
          cell.agText.setColor('#ffffff');
        }
      }
    }

    scene.greenScore = scene.greenPureScore + scene.greenDisplacementScore;
    scene.greenScoreText.setText(`Green Score: ${scene.greenScore}`);
    scene.farmerScoreText.setText(`Farmer Score: ${scene.farmerScore}`);

    displayFinalResults(scene);
    // scene.input.enabled = false;
  }
}

// ---------- Initialization of the numeric grid ----------
function initializeGrid(gridSize, unsuitableProportion, correlation, maxValue) {
  const numCells = gridSize * gridSize;
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

  if (unsuitableProportion > 0) {
    let count = Math.round((unsuitableProportion / 100) * numCells);
    if (count >= numCells) count = numCells - 1;
    if (count > 0) {
      let indices = Array.from({ length: numCells }, (_, i) => i);
      indices = shuffleArray(indices);
      const chosen = indices.slice(0, count);
      chosen.forEach(index => {
        const r = Math.floor(index / gridSize);
        const c = index % gridSize;
        grid[r][c].ag = -grid[r][c].ag;
      });
    }
  }

  console.log('Final initialized grid:', grid);
  return { grid };
}

// Helper math
function erf(x) {
  const sign = (x >= 0) ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) *
                t * Math.exp(-x*x);
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
  const z1 = randomNormal();
  const z2 = randomNormal();
  const x = z1;
  const y = rho * z1 + Math.sqrt(1 - rho*rho) * z2;
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
