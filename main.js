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
 * Compute dimensions for the "game" mode only
 * (we are no longer using the "results" mode logic).
 */
function computeGameDimensions(gridSize, margin = 5) {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  // For gameplay, use 95% of the smaller dimension
  const available = Math.min(screenWidth * 0.95, screenHeight * 0.95);
  const cellSize = Math.floor((available - (gridSize - 1) * margin) / gridSize);
  const gridWidth = gridSize * cellSize + (gridSize - 1) * margin;
  const gridHeight = gridWidth;

  return {
    gameWidth: screenWidth,
    gameHeight: screenHeight,
    gridWidth,
    gridHeight,
    cellSize
  };
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
    // Unpack user options
    let {
      userTeam,
      computerStrategy,
      correlation,
      leakage,
      farmerClaims,
      greenClaims,
      gridSize
    } = this.userOptions;

    // Basic defaults
    this.currentPlayer = 'farmer'; // Farmer always goes first (per your instructions)
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
      this.leakage = 1.0; // always 1 if user is farmer
    } else {
      this.computerTeam = 'farmer';
      this.computerStrategy = computerStrategy;
      this.leakage = requestedLeak;
    }

    // Set background color
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

    // Compute dimensions for "game" layout
    const dims = computeGameDimensions(gridSize);
    const { gameWidth, gameHeight, gridWidth, gridHeight, cellSize } = dims;

    // Store them in the scene in case we need references
    this.gameWidth = gameWidth;
    this.gameHeight = gameHeight;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.cellSize = cellSize;

    // Decide where the grid starts
    const isMobile = window.innerWidth < 768;
    let startX = (gameWidth - gridWidth) / 2;
    let startY = isMobile ? 80 : 120;

    // ---------- Add scoreboard texts ----------
    if (isMobile) {
      // Mobile scoreboard
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

      const turnFontSize = Math.max(20, Math.floor(cellSize * 0.3));
      this.turnText = this.add.text(
        gameWidth / 2,
        startY + gridHeight + 10,
        `Turn: ${this.currentPlayer}`,
        { font: `${turnFontSize}px Arial`, fill: '#000000' }
      ).setOrigin(0.5, 0).setDepth(9999);

    } else {
      // Desktop scoreboard
      this.greenScoreText = this.add.text(
        20, 10,
        `Green: ${this.greenScore}`,
        { font: '24px Arial', fill: '#228B22' }
      ).setDepth(9999);

      this.greenClaimsText = this.add.text(
        20, 40,
        `Claims: ${this.availGreenClaims}`,
        { font: '20px Arial', fill: '#228B22' }
      ).setDepth(9999);

      this.farmerScoreText = this.add.text(
        gameWidth - 100, 10,
        `Farmer: ${this.farmerScore}`,
        { font: '24px Arial', fill: '#654321' }
      ).setDepth(9999);

      this.farmerClaimsText = this.add.text(
        gameWidth - 100, 40,
        `Claims: ${this.availFarmerClaims}`,
        { font: '20px Arial', fill: '#654321' }
      ).setDepth(9999);

      this.turnText = this.add.text(
        gameWidth / 2, 10,
        `Turn: ${this.currentPlayer}`,
        { font: '24px Arial', fill: '#000000' }
      ).setOrigin(0.5, 0).setDepth(9999);
    }
    // ------------------------------------------

    // Create grid
    const gridConfig = {
      gridSize,
      cellSize,
      margin: 5,
      startX,
      startY,
      // Hard-coded 0 => no unsuitable farmland
      unsuitableProportion: 0,
      correlation: correlationVal,
      maxValue: 20,
      BAUSet: []
    };
    this.grid = createGrid(this, gridConfig);

    // If computer is farmer, mark BAU
    if (this.computerTeam === 'farmer') {
      const farmerBAUSet = calculateFarmerBAUSet(this.grid, farmerClaims, this.computerStrategy, greenClaims);
      farmerBAUSet.forEach(coord => {
        this.grid[coord.row][coord.col].cellData.isBAU = true;
      });
      this.greenBAU = calculateGreenBAUScore(this.grid, farmerBAUSet);
    } else {
      this.greenBAU = 0;
    }

    // If user is green, pre-calc a near-optimal green reference
    if (userTeam === 'green') {
      this.heuristicMaxGreenScore = calculateHeuristicMaxGreenScore(
        this.grid, greenClaims, farmerClaims, this.leakage
      );
    } else {
      this.heuristicMaxGreenScore = 0;
    }

    // Decorative images on desktop
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

    // If AI starts
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
    if (!this.turnText) return;
    const displayTeam = this.currentPlayer.charAt(0).toUpperCase() + this.currentPlayer.slice(1);
    this.turnText.setText(`Turn: ${displayTeam}`);
    this.turnText.setFill(
      this.currentPlayer === 'green' ? '#228B22' : '#654321'
    );
  }

  update() {
    // No continuous loop logic needed
  }
}

/**
 * Show final results in a simple full-screen overlay after clearing the old display.
 */
export function displayFinalResults(scene) {
  // Calculate final metrics
  const optimalSW = calculateOptimalSocialWelfare(scene.grid);
  const actualSW = calculateActualSocialWelfare(scene.grid);
  const welfareLoss = calculateSocialWelfareDifference(actualSW, optimalSW);
  let additionalityVal = 'N/A';
  if (scene.userOptions.userTeam === 'green') {
    const greenClaimedTotal = calculateGreenClaimedTotal(scene.grid);
    additionalityVal = calculateAdditionality(greenClaimedTotal, scene.greenBAU).toString();
  }
  
  // Destroy all existing game objects (grid cells, scoreboard texts, etc.)
  // This is the simplest approach: no leftover overlaps.
  scene.children.removeAll(); 
  
  // Optionally reset camera background color
  scene.cameras.main.setBackgroundColor(0xEDE8E1);
  
  // Dimensions
  const width = scene.cameras.main.width;
  const height = scene.cameras.main.height;
  
  // A full-screen rectangle for background
  const overlay = scene.add.rectangle(
    0, 0,
    width, height,
    0x6EA06E,
    0.7
  ).setOrigin(0,0).setDepth(9999);

  // Title text
  const headerFontSize = Math.floor(Math.max(24, width * 0.05));
  const textFontSize = Math.max(20, Math.floor(width * 0.04));
  let startY = 50;

  scene.add.text(
    width / 2, startY,
    'Final Results',
    { font: `${headerFontSize}px Arial`, fill: '#4D341A' }
  ).setOrigin(0.5).setDepth(10000);
  
  startY += headerFontSize + 20;
  
  // Show the main stats
  scene.add.text(
    width / 2, startY,
    `Green Score: ${scene.greenScore}`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  ).setOrigin(0.5).setDepth(10000);
  startY += textFontSize + 10;
  
  scene.add.text(
    width / 2, startY,
    `Farmer Score: ${scene.farmerScore}`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  ).setOrigin(0.5).setDepth(10000);
  startY += textFontSize + 10;
  
  if (scene.userOptions.userTeam === 'green') {
    scene.add.text(
      width / 2, startY,
      `Additionality: ${additionalityVal}`,
      { font: `${textFontSize}px Arial`, fill: '#4D341A' }
    ).setOrigin(0.5).setDepth(10000);
    startY += textFontSize + 10;
  }
  
  scene.add.text(
    width / 2, startY,
    `Social Welfare Loss: ${welfareLoss.toFixed(2)}%`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  ).setOrigin(0.5).setDepth(10000);
  startY += textFontSize + 20;
  
  // If user was green, show "Green Success" fraction if known
  if (scene.userOptions.userTeam === 'green' && scene.heuristicMaxGreenScore > 0) {
    const fraction = (scene.greenScore / scene.heuristicMaxGreenScore) * 100;
    scene.add.text(
      width / 2, startY,
      `Green Success: ${fraction.toFixed(1)}%`,
      { font: `${textFontSize}px Arial`, fill: '#4D341A' }
    ).setOrigin(0.5).setDepth(10000);
    startY += textFontSize + 20;
  }

  // Buttons
  const btnFontSize = Math.max(18, Math.floor(width * 0.04));
  const spacing = 60;

  // Play Again
  let playAgainBtn = scene.add.text(
    width / 2, height - spacing - 60,
    'Play Again',
    {
      font: `${btnFontSize}px Arial`,
      fill: '#ffffff',
      backgroundColor: '#228B22',
      padding: { x: 12, y: 8 }
    }
  ).setOrigin(0.5).setDepth(10001).setInteractive();

  playAgainBtn.on('pointerdown', () => {
    scene.scene.restart();
  });

  // End & Exit
  let exitBtn = scene.add.text(
    width / 2, height - spacing,
    'End & Exit',
    {
      font: `${btnFontSize}px Arial`,
      fill: '#ffffff',
      backgroundColor: '#228B22',
      padding: { x: 12, y: 8 }
    }
  ).setOrigin(0.5).setDepth(10001).setInteractive();

  exitBtn.on('pointerdown', () => {
    window.location.reload();
  });
}

/**
 * Start the Phaser game (in "game" mode).
 */
export function startPhaserGame(userOptions) {
  const gridSize = parseInt(userOptions.gridSize, 10);
  const dims = computeGameDimensions(gridSize);
  const { gameWidth, gameHeight, cellSize } = dims;

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
    cellSize
  });
}
