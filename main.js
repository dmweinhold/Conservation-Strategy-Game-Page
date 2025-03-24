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
    // Let the grid take up ~95% of the smaller dimension.
    const available = Math.min(screenWidth * 0.95, screenHeight * 0.95);
    const cellSize = Math.floor((available - (gridSize - 1) * margin) / gridSize);
    const gridWidth = gridSize * cellSize + (gridSize - 1) * margin;
    const gridHeight = gridWidth;
    return { gameWidth: screenWidth, gameHeight: screenHeight, gridWidth, gridHeight, cellSize };
  } else if (mode === 'results') {
    // In results mode, let the grid occupy ~60% of the screen width.
    const gridWidth = screenWidth * 0.6;
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
    // Start in "game" mode.
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

    // Detect mobile.
    const isMobile = window.innerWidth < 768;

    // Define UI margins and font sizes for desktop; on mobile we want minimal extra UI.
    const uiMarginX = gameWidth * 0.05;
    const uiMarginY = gameHeight * 0.05;
    const scoreFontSize = isMobile ? 18 : 24;
    const textFontSize = isMobile ? 16 : 20;

    // Set defaults.
    this.currentPlayer = 'farmer';
    if (!userTeam) userTeam = 'farmer';
    if (!computerStrategy) computerStrategy = 'naive profit maximizer';

    let correlationVal = parseFloat(correlation);
    if (isNaN(correlationVal)) correlationVal = 0;
    correlationVal = Math.max(-1, Math.min(correlationVal, 1));

    let requestedLeak = parseFloat(leakage);
    if (isNaN(requestedLeak)) requestedLeak = 0.5;

    farmerClaims = parseInt(farmerClaims, 10);
    if (isNaN(farmerClaims)) farmerClaims = 8;
    greenClaims = parseInt(greenClaims, 10);
    if (isNaN(greenClaims)) greenClaims = 8;
    gridSize = parseInt(gridSize, 10);
    if (![4, 6, 8, 10].includes(gridSize)) gridSize = 4;

    // Decide computer side.
    if (userTeam === 'farmer') {
      this.computerTeam = 'green';
      this.computerStrategy = computerStrategy;
      this.leakage = 1.0;
    } else {
      this.computerTeam = 'farmer';
      this.computerStrategy = computerStrategy;
      this.leakage = requestedLeak;
    }

    this.cameras.main.setBackgroundColor(0xEDE8E1);

    // Initialize scores/claims.
    this.greenScore = 0;
    this.farmerScore = 0;
    this.greenPureScore = 0;
    this.greenDisplacementScore = 0;
    this.availFarmerClaims = farmerClaims;
    this.availGreenClaims = greenClaims;
    this.cumGreenBAU = 0;
    this.cumFarmerDeduction = 0;

    // For desktop, show scoreboard UI.
    if (!isMobile) {
      this.farmerScoreText = this.add.text(
        gameWidth - uiMarginX - 200, uiMarginY,
        `Farmer Score: 0`,
        { font: `${scoreFontSize}px Arial`, fill: '#654321' }
      );
      this.greenScoreText = this.add.text(
        uiMarginX, uiMarginY,
        `Green Score: 0`,
        { font: `${scoreFontSize}px Arial`, fill: '#228B22' }
      );
      this.farmerClaimsText = this.add.text(
        gameWidth - uiMarginX - 200, uiMarginY + scoreFontSize + 10,
        `Farmer Claims: ${this.availFarmerClaims}`,
        { font: `${textFontSize}px Arial`, fill: '#654321' }
      );
      this.greenClaimsText = this.add.text(
        uiMarginX, uiMarginY + scoreFontSize + 10,
        `Green Claims: ${this.availGreenClaims}`,
        { font: `${textFontSize}px Arial`, fill: '#228B22' }
      );
    }

    // Always display current turn (centered at top).
    const turnOffsetY = uiMarginY + scoreFontSize + 20;
    this.turnText = this.add.text(
      gameWidth / 2,
      turnOffsetY,
      `Current Turn: ${this.currentPlayer}`,
      { font: `${scoreFontSize}px Arial`, fill: '#ffffff' }
    ).setOrigin(0.5, 0);
    this.updateTurnText();

    // Use "game" mode dimensions for gameplay.
    const dims = computeGameDimensions(gridSize, 'game');
    gameWidth = dims.gameWidth;
    gridWidth = dims.gridWidth;
    gridHeight = dims.gridHeight;
    cellSize = dims.cellSize;

    let startX = (gameWidth - gridWidth) / 2;
    let startY = turnOffsetY + 50; // position grid below header

    const gridConfig = {
      gridSize,
      cellSize,
      margin: 5,
      startX,
      startY,
      unsuitableProportion: 0,
      correlation: correlationVal,
      maxValue: 20,
      BAUSet: []
    };

    this.grid = createGrid(this, gridConfig);

    // Compute BAU if needed.
    if (this.computerTeam === 'farmer') {
      const farmerBAUSet = calculateFarmerBAUSet(
        this.grid,
        farmerClaims,
        this.computerStrategy,
        greenClaims
      );
      farmerBAUSet.forEach(coord => {
        this.grid[coord.row][coord.col].cellData.isBAU = true;
      });
      this.greenBAU = calculateGreenBAUScore(this.grid, farmerBAUSet);
    } else {
      this.greenBAU = 0;
    }

    if (userTeam === 'green') {
      const farmerClaimsOriginal = parseInt(farmerClaims, 10);
      const greenClaimsOriginal = parseInt(greenClaims, 10);
      this.heuristicMaxGreenScore = calculateHeuristicMaxGreenScore(
        this.grid,
        greenClaimsOriginal,
        farmerClaimsOriginal,
        this.leakage
      );
    } else {
      this.heuristicMaxGreenScore = 0;
    }

    // On desktop show decorative static images.
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
    
    // If AI starts, trigger its move.
    if (this.currentPlayer === this.computerTeam) {
      this.input.enabled = false;
      this.time.delayedCall(300, () => {
        const claimParam = (this.currentPlayer === 'green')
          ? this.availGreenClaims
          : this.availFarmerClaims;
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
    const turnColor = (this.currentPlayer === 'green') ? '#228B22' : '#654321';
    const displayTeam = this.currentPlayer.charAt(0).toUpperCase() + this.currentPlayer.slice(1);
    this.turnText.setText(`Current Turn: ${displayTeam}`);
    this.turnText.setFill(turnColor);
  }

  update() {
    // No continuous loop logic needed.
  }
}

/**
 * Displays the final results overlay.
 * In mobile (results mode), the grid is assumed to shrink/reposition (or at least the results overlay appears clearly).
 */
export function displayFinalResults(scene) {
  // Switch to results mode and recalc dimensions.
  scene.mode = 'results';
  const gridSize = scene.userOptions.gridSize;
  const dims = computeGameDimensions(gridSize, 'results');
  const { gameWidth, gridWidth, gridHeight, cellSize } = dims;

  // (Optionally, animate the repositioning of grid cells here.)
  const optimalSW = calculateOptimalSocialWelfare(scene.grid);
  const actualSW = calculateActualSocialWelfare(scene.grid);
  const welfareLoss = calculateSocialWelfareDifference(actualSW, optimalSW);
  let additionalityVal = 'N/A';
  if (scene.userOptions.userTeam === 'green') {
    const greenClaimedTotal = calculateGreenClaimedTotal(scene.grid);
    additionalityVal = calculateAdditionality(greenClaimedTotal, scene.greenBAU).toString();
  }

  // Position the overlay below the (now repositioned) grid.
  // For results mode we assume the grid is moved near the top.
  const overlayOffset = cellSize * 0.5;
  const resultsY = scene.grid[0][0].y + gridHeight + overlayOffset;
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
  ).setOrigin(0.5, 0);

  const leftColX = bg.x - overlayWidth * 0.45;
  const rightColX = bg.x + overlayWidth * 0.1;
  const headerFontSize = cellSize * 0.35;
  const textFontSize = cellSize * 0.25;

  scene.add.text(leftColX, bg.y + overlayHeight * 0.07, 'Final Metrics:', {
    font: `${headerFontSize}px Arial`,
    fill: '#4D341A'
  });
  const colStartY = bg.y + overlayHeight * 0.3;
  const lineSpacing = cellSize * 0.8;
  scene.add.text(leftColX, colStartY, 
    `Green Conservation Score: ${scene.greenScore}`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  );
  scene.add.text(leftColX + cellSize * 0.2, colStartY + lineSpacing, 
    `Pure Strategy: ${scene.greenPureScore}`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  );
  scene.add.text(leftColX + cellSize * 0.2, colStartY + 2 * lineSpacing,
    `Displacement: ${scene.greenDisplacementScore}`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  );
  scene.add.text(leftColX, colStartY + 3 * lineSpacing,
    `Additionality: ${additionalityVal}`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  );
  scene.add.text(rightColX, bg.y + overlayHeight * 0.07, 'Performance:', {
    font: `${headerFontSize}px Arial`,
    fill: '#4D341A'
  });
  scene.add.text(rightColX, colStartY, 
    `Welfare Loss: ${welfareLoss.toFixed(2)}%`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  );
  if (scene.userOptions.userTeam === 'green' && scene.heuristicMaxGreenScore > 0) {
    const fraction = (scene.greenScore / scene.heuristicMaxGreenScore) * 100;
    scene.add.text(rightColX, colStartY + lineSpacing,
      `Green Success: ${fraction.toFixed(1)}%`,
      { font: `${textFontSize}px Arial`, fill: '#4D341A' }
    );
  }

  scene.input.enabled = true;
  const btnY = bg.y + overlayHeight + cellSize * 0.5;
  const btnFontSize = cellSize * 0.3;
  let playAgainBtn = scene.add.text(bg.x - overlayWidth * 0.2, btnY, 'Play Again', {
    font: `${btnFontSize}px Arial`,
    fill: '#ffffff',
    backgroundColor: '#228B22',
    padding: { x: 10, y: 5 }
  }).setInteractive();
  playAgainBtn.setDepth(100);
  playAgainBtn.on('pointerdown', () => {
    scene.scene.restart();
  });
  let exitBtn = scene.add.text(bg.x + overlayWidth * 0.1, btnY, 'End & Exit', {
    font: `${btnFontSize}px Arial`,
    fill: '#ffffff',
    backgroundColor: '#228B22',
    padding: { x: 10, y: 5 }
  }).setInteractive();
  exitBtn.setDepth(100);
  exitBtn.on('pointerdown', () => {
    window.location.reload();
  });
  
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
