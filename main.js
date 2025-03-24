// main.js

import { createGrid } from './grid.js';
import { computerChoosePlot } from './strategy.js';
import {
  calculateOptimalSocialWelfare,
  calculateFarmerBAUSet,
  calculateGreenBAUScore,
  calculateActualSocialWelfare,
  calculateGreenClaimedTotal,
  calculateSocialWelfareDifference,
  calculateAdditionality,
  calculateHeuristicMaxGreenScore
} from './gameLogic.js';

/**
 * Computes dimensions based on a given mode.
 * - mode "game": For gameplay, use nearly the full viewport.
 * - mode "results": For game-over, shrink the grid so the results overlay can appear.
 */
function computeGameDimensions(gridSize, mode = 'game', margin = 5) {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  if (mode === 'game') {
    // For gameplay, use 95% of the smaller dimension.
    const available = Math.min(screenWidth * 0.95, screenHeight * 0.95);
    const cellSize = Math.floor((available - (gridSize - 1) * margin) / gridSize);
    const gridWidth = gridSize * cellSize + (gridSize - 1) * margin;
    const gridHeight = gridWidth;
    return { gameWidth: screenWidth, gameHeight: screenHeight, gridWidth, gridHeight, cellSize };
  } else if (mode === 'results') {
    // For results, let the grid occupy ~60% of the screen width.
    const gridWidth = Math.floor(screenWidth * 0.6);
    const cellSize = Math.floor((gridWidth - (gridSize - 1) * margin) / gridSize);
    const gridHeight = gridSize * cellSize + (gridSize - 1) * margin;
    return { gameWidth: screenWidth, gameHeight: screenHeight, gridWidth, gridHeight, cellSize };
  }
}

/**
 * Phaser scene class.
 */
class MyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MyScene' });
  }

  init(data) {
    this.userOptions = data || {};
    // Start in game mode
    this.mode = 'game';
  }

  preload() {
    for (let i = 1; i <= 10; i++) {
      this.load.image('green' + i, 'images/C' + i + '.png');
      this.load.image('farmer' + i, 'images/A' + i + '.png');
    }
    this.load.image('tree', 'images/tree.png');
    this.load.image('tractor', 'images/tractor.png');
  }

  create() {
    let {
      userTeam,
      computerStrategy,
      correlation,
      leakage,
      farmerClaims,
      greenClaims,
      gridSize,
      gameWidth,
      gameHeight,
      gridWidth,
      gridHeight,
      cellSize
    } = this.userOptions;

    const isMobile = window.innerWidth < 768;

    // Set defaults.
    this.currentPlayer = 'farmer'; // Farmer always goes first per your instructions
    if (!userTeam) userTeam = 'farmer';
    if (!computerStrategy) computerStrategy = 'naive profit maximizer';
    let correlationVal = parseFloat(correlation) || 0;
    correlationVal = Math.max(-1, Math.min(correlationVal, 1));
    let requestedLeak = parseFloat(leakage) || 0.5;
    farmerClaims = parseInt(farmerClaims, 10) || 8;
    greenClaims = parseInt(greenClaims, 10) || 8;
    gridSize = parseInt(gridSize, 10);
    if (![4, 6, 8, 10].includes(gridSize)) gridSize = 4;

    // Decide computer side & final leakage
    if (userTeam === 'farmer') {
      this.computerTeam = 'green';
      this.computerStrategy = computerStrategy;
      this.leakage = 1.0; // If user is farmer, fix leakage=1
    } else {
      this.computerTeam = 'farmer';
      this.computerStrategy = computerStrategy;
      this.leakage = requestedLeak;
    }

    this.cameras.main.setBackgroundColor(0xEDE8E1);

    // Initialize scores/claims
    this.greenScore = 0;
    this.farmerScore = 0;
    this.greenPureScore = 0;
    this.greenDisplacementScore = 0;
    this.availFarmerClaims = farmerClaims;
    this.availGreenClaims = greenClaims;
    this.cumGreenBAU = 0;
    this.cumFarmerDeduction = 0;

    // Use game-mode dimensions for initial layout
    const dims = computeGameDimensions(gridSize, 'game');
    gameWidth = dims.gameWidth;
    gameHeight = dims.gameHeight;
    gridWidth = dims.gridWidth;
    gridHeight = dims.gridHeight;
    cellSize = dims.cellSize;

    // Determine grid start position
    let startX = (gameWidth - gridWidth) / 2;
    let startY;
    if (isMobile) {
      startY = 80; // space on top for scoreboard
    } else {
      startY = 120; // place it somewhat lower on desktop
    }

    // Create scoreboard text
    if (isMobile) {
      // Mobile scoreboard layout
      const scoreFontSize = Math.max(18, Math.floor(cellSize * 0.3));
      const smallFontSize = Math.max(16, Math.floor(cellSize * 0.25));
      this.greenScoreText = this.add.text(
        startX,
        startY - 50,
        `Green: ${this.greenScore}`,
        { font: `${scoreFontSize}px Arial`, fill: '#228B22' }
      ).setDepth(9999);

      this.greenClaimsText = this.add.text(
        startX,
        startY - 50 + scoreFontSize,
        `Claims: ${this.availGreenClaims}`,
        { font: `${smallFontSize}px Arial`, fill: '#228B22' }
      ).setDepth(9999);

      this.farmerScoreText = this.add.text(
        startX + gridWidth - 150,
        startY - 50,
        `Farmer: ${this.farmerScore}`,
        { font: `${scoreFontSize}px Arial`, fill: '#654321' }
      ).setDepth(9999);

      this.farmerClaimsText = this.add.text(
        startX + gridWidth - 150,
        startY - 50 + scoreFontSize,
        `Claims: ${this.availFarmerClaims}`,
        { font: `${smallFontSize}px Arial`, fill: '#654321' }
      ).setDepth(9999);

      // Turn text at bottom of grid
      const turnFontSize = Math.max(20, Math.floor(cellSize * 0.3));
      this.turnText = this.add.text(
        gameWidth / 2,
        startY + gridHeight + 10,
        `Turn: ${this.currentPlayer}`,
        { font: `${turnFontSize}px Arial`, fill: '#ffffff' }
      ).setOrigin(0.5, 0).setDepth(9999);

    } else {
      // Desktop scoreboard layout
      // CHANGED: put scoreboard in simpler coords
      this.greenScoreText = this.add.text(
        20, 10,  // left side
        `Green: ${this.greenScore}`,
        { font: '24px Arial', fill: '#228B22' }
      ).setDepth(9999);

      this.greenClaimsText = this.add.text(
        20, 40,
        `Claims: ${this.availGreenClaims}`,
        { font: '20px Arial', fill: '#228B22' }
      ).setDepth(9999);

      this.farmerScoreText = this.add.text(
        gameWidth - 100, 10,  // near right edge
        `Farmer: ${this.farmerScore}`,
        { font: '24px Arial', fill: '#654321' }
      ).setDepth(9999);

      this.farmerClaimsText = this.add.text(
        gameWidth - 100, 40,
        `Claims: ${this.availFarmerClaims}`,
        { font: '20px Arial', fill: '#654321' }
      ).setDepth(9999);

      // CHANGED: add turn text in the top middle
      this.turnText = this.add.text(
        gameWidth / 2, 10,
        `Turn: ${this.currentPlayer}`,
        { font: '24px Arial', fill: '#000000' }
      ).setOrigin(0.5, 0).setDepth(9999);
    }

    // Create the grid
    const gridConfig = {
      gridSize,
      cellSize,
      margin: 5,
      startX,
      startY,
      // CHANGED: Hard-coded zero so no "unsuitable" farmland
      unsuitableProportion: 0,
      correlation: correlationVal,
      maxValue: 20,
      BAUSet: []
    };
    this.grid = createGrid(this, gridConfig);

    // If the computer is farmer, compute BAU set
    if (this.computerTeam === 'farmer') {
      const farmerBAUSet = calculateFarmerBAUSet(this.grid, farmerClaims, this.computerStrategy, greenClaims);
      farmerBAUSet.forEach(coord => {
        this.grid[coord.row][coord.col].cellData.isBAU = true;
      });
      this.greenBAU = calculateGreenBAUScore(this.grid, farmerBAUSet);
    } else {
      this.greenBAU = 0;
    }

    // If user is green, estimate heuristic max green score
    if (userTeam === 'green') {
      const farmerClaimsOriginal = farmerClaims;
      const greenClaimsOriginal = greenClaims;
      this.heuristicMaxGreenScore = calculateHeuristicMaxGreenScore(
        this.grid, greenClaimsOriginal, farmerClaimsOriginal, this.leakage
      );
    } else {
      this.heuristicMaxGreenScore = 0;
    }

    // Optionally place decorative sprites (desktop only)
    if (!isMobile) {
      const imageOffset = cellSize * 1.3;
      this.staticTree = this.add.image(
        startX - imageOffset,
        startY + gridHeight / 2,
        'tree'
      ).setDisplaySize(cellSize, cellSize);

      this.staticTractor = this.add.image(
        startX + gridWidth + imageOffset,
        startY + gridHeight / 2,
        'tractor'
      ).setDisplaySize(cellSize, cellSize);
    }

    this.updateTurnText();

    // If AI starts (i.e., if currentPlayer === computerTeam), do immediate move
    // But your code always sets currentPlayer='farmer', so only relevant if userTeam='green'
    if (this.currentPlayer === this.computerTeam) {
      this.input.enabled = false;
      this.time.delayedCall(300, () => {
        const claimParam = (this.currentPlayer === 'green') ? this.availGreenClaims : this.availFarmerClaims;
        const move = computerChoosePlot(this.computerStrategy, this.grid, claimParam);
        if (move) {
          this.grid[move.row][move.col].emit('pointerdown');
        } else {
          this.input.enabled = true;
        }
      });
    } else {
      this.input.enabled = true;
    }
  }

  updateTurnText() {
    if (!this.turnText) return;
    const displayTeam = this.currentPlayer.charAt(0).toUpperCase() + this.currentPlayer.slice(1);
    this.turnText.setText(`Turn: ${displayTeam}`);
    // Color it green or brown
    if (this.currentPlayer === 'green') {
      this.turnText.setFill('#228B22');
    } else {
      this.turnText.setFill('#654321');
    }
  }

  update() {
    // No continuous loop logic needed
  }
}

/**
 * Displays the final results overlay.
 * In mobile, the grid is animated to shrink and reposition to make space for results.
 */
export function displayFinalResults(scene) {
  const isMobile = window.innerWidth < 768;
  const gridSize = scene.userOptions.gridSize;
  const dims = computeGameDimensions(gridSize, 'results');
  const { gameWidth, gridWidth, gridHeight, cellSize } = dims;

  // For mobile, animate each cell to reposition
  if (isMobile) {
    const newStartX = gameWidth * 0.05;
    const newStartY = 20;
    const margin = 5;
    scene.grid.forEach((row, r) => {
      row.forEach((cell, c) => {
        const newX = newStartX + c * (cellSize + margin);
        const newY = newStartY + r * (cellSize + margin);
        scene.tweens.add({
          targets: cell,
          x: newX,
          y: newY,
          duration: 500
        });
        // Move the text objects as well:
        scene.tweens.add({
          targets: [cell.envText, cell.agText],
          x: {
            getEnd: () => {
              // You could tweak the positioning logic here if needed
              return (cell.envText ? newX + cellSize - 5 : newX + 5);
            }
          },
          y: {
            getEnd: () => {
              return (cell.envText ? newY + 5 : newY + cellSize - 5);
            }
          },
          duration: 500
        });
        // ❌ Removed: cell.setDisplaySize(...) because rectangles don't support that
        // If you really need to resize, do: cell.setSize(cellSize, cellSize);
      });
    });
    // After tween completes, show results
    scene.time.delayedCall(600, () => {
      showResultsOverlay(scene, cellSize, gameWidth);
    });
  } else {
    // Desktop: show overlay immediately
    showResultsOverlay(scene, cellSize, gameWidth);
  }
}

/**
 * Helper to display the results overlay.
 */
function showResultsOverlay(scene, cellSize, gameWidth) {
  const optimalSW = calculateOptimalSocialWelfare(scene.grid);
  const actualSW = calculateActualSocialWelfare(scene.grid);
  const welfareLoss = calculateSocialWelfareDifference(actualSW, optimalSW);
  let additionalityVal = 'N/A';
  if (scene.userOptions.userTeam === 'green') {
    const greenClaimedTotal = calculateGreenClaimedTotal(scene.grid);
    additionalityVal = calculateAdditionality(greenClaimedTotal, scene.greenBAU).toString();
  }

  // Position an overlay rectangle & text
  const overlayOffset = cellSize * 0.5;
  // Find the bottom of the last row
  const lastRow = scene.grid[scene.grid.length - 1];
  const gridBottom = lastRow[0].y + cellSize;
  const resultsY = gridBottom + overlayOffset;
  const overlayWidth = gameWidth * 0.9;
  const overlayHeight = cellSize * 3;
  const overlayX = scene.cameras.main.centerX;

  let bg = scene.add.rectangle(
    overlayX,
    resultsY,
    overlayWidth,
    overlayHeight,
    0x6EA06E,
    0.7
  ).setOrigin(0.5, 0).setDepth(2000);

  const leftColX = bg.x - overlayWidth * 0.45;
  const rightColX = bg.x + overlayWidth * 0.1;
  const headerFontSize = Math.floor(cellSize * 0.35);
  const textFontSize = Math.floor(cellSize * 0.25);

  scene.add.text(leftColX, bg.y + overlayHeight * 0.07, 'Final Metrics:', {
    font: `${headerFontSize}px Arial`,
    fill: '#4D341A'
  }).setDepth(2001);

  const colStartY = bg.y + overlayHeight * 0.3;
  const lineSpacing = cellSize * 0.8;

  scene.add.text(leftColX, colStartY,
    `Green Conservation: ${scene.greenScore}`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  ).setDepth(2001);

  scene.add.text(leftColX + cellSize * 0.2, colStartY + lineSpacing,
    `Pure: ${scene.greenPureScore}`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  ).setDepth(2001);

  scene.add.text(leftColX + cellSize * 0.2, colStartY + 2 * lineSpacing,
    `Disp.: ${scene.greenDisplacementScore}`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  ).setDepth(2001);

  scene.add.text(leftColX, colStartY + 3 * lineSpacing,
    `Additionality: ${additionalityVal}`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  ).setDepth(2001);

  scene.add.text(rightColX, bg.y + overlayHeight * 0.07, 'Performance:', {
    font: `${headerFontSize}px Arial`,
    fill: '#4D341A'
  }).setDepth(2001);

  scene.add.text(rightColX, colStartY,
    `Welfare Loss: ${welfareLoss.toFixed(2)}%`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  ).setDepth(2001);

  if (scene.userOptions.userTeam === 'green' && scene.heuristicMaxGreenScore > 0) {
    const fraction = (scene.greenScore / scene.heuristicMaxGreenScore) * 100;
    scene.add.text(rightColX, colStartY + lineSpacing,
      `Green Success: ${fraction.toFixed(1)}%`,
      { font: `${textFontSize}px Arial`, fill: '#4D341A' }
    ).setDepth(2001);
  }

  scene.input.enabled = true;

  // "Play Again" and "End & Exit" buttons
  const btnY = bg.y + overlayHeight + cellSize * 0.5;
  const btnFontSize = Math.floor(cellSize * 0.3);

  let playAgainBtn = scene.add.text(bg.x - overlayWidth * 0.2, btnY, 'Play Again', {
    font: `${btnFontSize}px Arial`,
    fill: '#ffffff',
    backgroundColor: '#228B22',
    padding: { x: 10, y: 5 }
  }).setInteractive().setDepth(3000);

  playAgainBtn.on('pointerdown', () => {
    scene.scene.restart();
  });

  let exitBtn = scene.add.text(bg.x + overlayWidth * 0.1, btnY, 'End & Exit', {
    font: `${btnFontSize}px Arial`,
    fill: '#ffffff',
    backgroundColor: '#228B22',
    padding: { x: 10, y: 5 }
  }).setInteractive().setDepth(3000);

  exitBtn.on('pointerdown', () => {
    window.location.reload();
  });

  // Scroll down so mobile users see the results
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

/**
 * Start the Phaser game with dimensions computed in game mode.
 */
export function startPhaserGame(userOptions) {
  const { gridSize } = userOptions;
  const dims = computeGameDimensions(gridSize, 'game');
  const { gameWidth, gameHeight, gridWidth, gridHeight, cellSize } = dims;

  const config = {
    type: Phaser.AUTO,
    width: gameWidth,
    height: gameHeight,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [ MyScene ],
    parent: 'game-container'
  };

  const game = new Phaser.Game(config);
  game.scene.start('MyScene', {
    ...userOptions,
    gameWidth,
    gameHeight,
    gridWidth,
    gridHeight,
    cellSize
  });
}
