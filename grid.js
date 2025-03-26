// grid.js

import { computerChoosePlot } from './strategy.js';
import { displayFinalResults } from './main.js';

export function createGrid(scene, config) {
  const {
    gridSize,
    cellSize,
    margin,
    startX,
    startY,
    correlation = 0,
    maxValue = 20,
    BAUSet = []
  } = config;

  scene.userOptions.gridSize = gridSize; // optional, for debugging

  // Initialize random-based cell data
  const gridData = initializeGrid(gridSize, correlation, maxValue);
  const cellValues = gridData.grid;

  let grid = [];

  for (let row = 0; row < gridSize; row++) {
    grid[row] = [];
    for (let col = 0; col < gridSize; col++) {
      const x = startX + col * (cellSize + margin);
      const y = startY + row * (cellSize + margin);
      const { ag, cons } = cellValues[row][col];

      let strokeColor = 0xA9A9A9;
      if (cons > ag) strokeColor = 0x228B22;
      else if (ag > cons) strokeColor = 0x654321;

      let cell = scene.add.rectangle(x, y, cellSize, cellSize, 0xffffff)
        .setOrigin(0, 0)
        .setStrokeStyle(2, strokeColor)
        .setInteractive();

      cell.claimed = false;
      cell.row = row;
      cell.col = col;
      cell.cellData = cellValues[row][col];
      cell.cellData.isBAU = BAUSet.some(c => c.row === row && c.col === col);

      // Environment + Ag text
      let envText = scene.add.text(
        x + cellSize - 5,
        y + 5,
        cell.cellData.cons,
        { font: `${Math.floor(cellSize * 0.25)}px Arial`, fill: '#228B22' }
      ).setOrigin(1, 0).setDepth(10);

      let agText = scene.add.text(
        x + 5,
        y + cellSize - 5,
        cell.cellData.ag,
        { font: `${Math.floor(cellSize * 0.25)}px Arial`, fill: '#5C4033' }
      ).setOrigin(0, 1).setDepth(10);

      cell.envText = envText;
      cell.agText  = agText;

      // On click => claim
      cell.on('pointerdown', () => {
        if (!cell.claimed) {
          handleCellClaim(scene, cell);
        }
      });

      grid[row][col] = cell;
    }
  }

  return grid;
}

function handleCellClaim(scene, cell) {
  const claimingTeam = scene.currentPlayer;
  cell.claimed = true;
  scene.input.enabled = false;

  // Animate from off-screen or from side sprite
  const movingIcon = getOffScreenSprite(scene, claimingTeam, cell.width, cell.height);
  const center = cell.getCenter();

  scene.tweens.add({
    targets: movingIcon,
    x: center.x,
    y: center.y,
    duration: 600,
    onComplete: () => {
      movingIcon.destroy();
      const rIndex = Phaser.Math.Between(1, 10);
      const claimKey = (claimingTeam === 'green') ? 'green' + rIndex : 'farmer' + rIndex;

      // Place final icon
      scene.add.image(center.x, center.y, claimKey).setDisplaySize(cell.width, cell.height);

      // Update scores
      if (claimingTeam === 'green') {
        scene.greenPureScore += cell.cellData.cons;
        if (cell.cellData.isBAU) {
          scene.cumGreenBAU += 1;
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

      scene.farmerScoreText.setText(`Farmer: ${scene.farmerScore}`);
      scene.greenScoreText.setText(`Green: ${scene.greenScore}`);

      cell.cellData.owner = claimingTeam;
      cell.envText.setColor('#ffffff');
      cell.agText.setColor('#ffffff');

      // Switch turn
      scene.currentPlayer = (claimingTeam === 'green') ? 'farmer' : 'green';
      scene.updateTurnText();

      skipIfNoClaims(scene);

      // If AI turn, do AI move
      if (scene.currentPlayer === scene.computerTeam) {
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
}

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
 * If both out of claims or no unclaimed cells remain => leftover => green => displacement => final results
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
    // leftover => green => displacement
    for (let row of scene.grid) {
      for (let cell of row) {
        if (!cell.claimed) {
          cell.claimed        = true;
          cell.cellData.owner = 'green';
          scene.greenDisplacementScore += cell.cellData.cons;
          let center = cell.getCenter();
          scene.add.image(center.x, center.y, 'green' + Phaser.Math.Between(1,10))
            .setDisplaySize(cell.width, cell.height);
          
          cell.envText.setColor('#ffffff');
          cell.agText.setColor('#ffffff');
        }
      }
    }
    scene.greenScore = scene.greenPureScore + scene.greenDisplacementScore;
    scene.greenScoreText.setText(`Green: ${scene.greenScore}`);
    scene.farmerScoreText.setText(`Farmer: ${scene.farmerScore}`);

    // Show final results overlay
    import('./main.js').then(mod => {
      mod.displayFinalResults(scene);
    });
  }
}

function getOffScreenSprite(scene, claimingTeam, w, h) {
  // Just animate from left or right edge
  const gameW = scene.sys.game.canvas.width;
  const gameH = scene.sys.game.canvas.height;
  const midY  = gameH / 2;
  const bandH = Math.floor(gameH * 0.6);

  let startX, startY;
  if (claimingTeam === 'green') {
    startX = -w; // off-screen left
  } else {
    startX = gameW + w; // off-screen right
  }
  startY = Phaser.Math.Between(midY - bandH/2, midY + bandH/2);

  const spriteKey = (claimingTeam === 'green') ? 'tree' : 'tractor';
  const icon = scene.add.image(startX, startY, spriteKey).setDisplaySize(w, h);
  return icon;
}

/**
 * Initialize the grid with correlated random (ag, cons) values in [1..maxValue].
 */
function initializeGrid(gridSize, correlation, maxValue) {
  const grid = [];
  for (let i = 0; i < gridSize; i++) {
    const row = [];
    for (let j = 0; j < gridSize; j++) {
      const [u1, u2] = generateUniformCorrelatedPair(correlation);
      const ag_value   = Math.round(rescaleToRange(u1, 1, maxValue));
      const cons_value = Math.round(rescaleToRange(u2, 1, maxValue));
      row.push({ ag: ag_value, cons: cons_value, owner: '' });
    }
    grid.push(row);
  }
  return { grid };
}

// Utility functions for correlation, random, etc.
function erf(x) {
  const sign = (x >= 0) ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1.0 / (1.0 + p*x);
  const y = 1.0 - ((((a5*t + a4)*t) + a3)*t + a2)*t * Math.exp(-x*x);
  return sign * y;
}
function normCDF(x) {
  return 0.5*(1 + erf(x/Math.sqrt(2)));
}
function randomNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
function generateUniformCorrelatedPair(rho) {
  const z1 = randomNormal(), z2 = randomNormal();
  const x  = z1;
  const y  = rho * z1 + Math.sqrt(1 - rho*rho)*z2;
  return [ normCDF(x), normCDF(y) ];
}
function rescaleToRange(u, minVal, maxVal) {
  return minVal + (maxVal-minVal)*u;
}
