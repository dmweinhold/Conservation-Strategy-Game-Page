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
 * Compute dimensions based on the window size.
 * 
 * - For desktop (screenWidth >= 1024): use fixed cell size (100px) and add extra margins.
 * - For devices: scale grid so that it takes up ~95% of the smaller viewport dimension.
 */
function computeGameDimensions(gridSize, margin = 5) {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  
  if (screenWidth >= 1024) {
    // Desktop settings
    const cellSize = 100;
    const gridWidth  = gridSize * cellSize + (gridSize - 1) * margin;
    const gridHeight = gridSize * cellSize + (gridSize - 1) * margin;
    const minWidth  = 1024;
    const minHeight = 900;
    const extraSide   = 500; 
    const extraTop    = 150; 
    const extraBottom = 450;
    const gameWidth  = Math.max(minWidth, gridWidth + extraSide);
    const gameHeight = Math.max(minHeight, gridHeight + extraTop + extraBottom);
    return { gameWidth, gameHeight, gridWidth, gridHeight, cellSize };
  } else {
    // Device settings: scale grid to 95% of the smaller viewport dimension
    const available = Math.min(screenWidth * 0.95, screenHeight * 0.95);
    const cellSize = Math.floor((available - (gridSize - 1) * margin) / gridSize);
    const gridWidth  = gridSize * cellSize + (gridSize - 1) * margin;
    const gridHeight = gridWidth;
    return { gameWidth: screenWidth, gameHeight: screenHeight, gridWidth, gridHeight, cellSize };
  }
}

class MyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MyScene' });
  }

  init(data) {
    // Data passed from startPhaserGame
    this.userOptions = data || {};
  }

  preload() {
    // Load icons for both teams
    for (let i = 1; i <= 10; i++) {
      this.load.image('green' + i, 'images/C' + i + '.png');
      this.load.image('farmer' + i, 'images/A' + i + '.png');
    }
    // Also load tree and tractor (used only in desktop or claim animations)
    this.load.image('tree', 'images/tree.png');
    this.load.image('tractor', 'images/tractor.png');
  }

  create() {
    // Unpack user options (these come from UserInput.js)
    let {
      userTeam,
      computerStrategy,
      correlation,
      leakage,
      farmerClaims,
      greenClaims,
      gridSize
    } = this.userOptions;

    // Set defaults
    this.currentPlayer = 'farmer';
    if (!userTeam) userTeam = 'farmer';
    if (!computerStrategy) computerStrategy = 'naive profit maximizer';
    let correlationVal = parseFloat(correlation) || 0;
    correlationVal = Math.max(-1, Math.min(correlationVal, 1));
    let requestedLeak = parseFloat(leakage) || 0.5;
    farmerClaims = parseInt(farmerClaims, 10) || 8;
    greenClaims = parseInt(greenClaims, 10) || 8;
    gridSize = parseInt(gridSize, 10);
    if (![4, 6, 8, 10].includes(gridSize)) gridSize = 4;

    // Decide computer team and leakage
    if (userTeam === 'farmer') {
      this.computerTeam = 'green';
      this.computerStrategy = computerStrategy;
      this.leakage = 1.0;
    } else {
      this.computerTeam = 'farmer';
      this.computerStrategy = computerStrategy;
      this.leakage = requestedLeak;
    }

    // Set background color
    this.cameras.main.setBackgroundColor(0xEDE8E1);

    // Initialize scores and claims
    this.greenScore = 0;
    this.farmerScore = 0;
    this.greenPureScore = 0;
    this.greenDisplacementScore = 0;
    this.availFarmerClaims = farmerClaims;
    this.availGreenClaims = greenClaims;
    this.cumGreenBAU = 0;
    this.cumFarmerDeduction = 0;

    // Determine mode based on screen width
    const isDesktop = window.innerWidth >= 1024;
    const dims = computeGameDimensions(gridSize);
    let { gameWidth, gameHeight, gridWidth, gridHeight, cellSize } = dims;
    // Save computed values for later use
    this.userOptions.gameWidth = gameWidth;
    this.userOptions.gameHeight = gameHeight;
    this.userOptions.gridWidth = gridWidth;
    this.userOptions.gridHeight = gridHeight;
    this.userOptions.cellSize = cellSize;

    // Determine grid starting coordinates.
    let startX = (gameWidth - gridWidth) / 2;
    let startY = isDesktop ? 120 : 80;

    // Scoreboard positioning
    if (isDesktop) {
      // Desktop: use fixed positions near top
      const farmerScoreStyle = { font: '24px Arial', fill: '#654321' };
      const greenScoreStyle = { font: '24px Arial', fill: '#228B22' };
      const claimsStyleFarmer = { font: '20px Arial', fill: '#654321' };
      const claimsStyleGreen = { font: '20px Arial', fill: '#228B22' };
      this.farmerScoreText = this.add.text(gameWidth - 220, 60, `Farmer Score: 0`, farmerScoreStyle);
      this.greenScoreText = this.add.text(20, 60, `Green Score: 0`, greenScoreStyle);
      this.farmerClaimsText = this.add.text(gameWidth - 220, 90, `Farmer Claims: ${this.availFarmerClaims}`, claimsStyleFarmer);
      this.greenClaimsText = this.add.text(20, 90, `Green Claims: ${this.availGreenClaims}`, claimsStyleGreen);
      this.turnText = this.add.text(gameWidth / 2, 30, `Current Turn: ${this.currentPlayer}`, { font: '24px Arial', fill: '#ffffff' }).setOrigin(0.5, 0);
    } else {
      // Mobile: scoreboard above grid and turn text below grid
      const scoreFontSize = Math.max(18, Math.floor(cellSize * 0.3));
      const smallFontSize = Math.max(16, Math.floor(cellSize * 0.25));
      this.greenScoreText = this.add.text(startX, startY - 50, `Green: ${this.greenScore}`, { font: `${scoreFontSize}px Arial`, fill: '#228B22' }).setDepth(9999);
      this.greenClaimsText = this.add.text(startX, startY - 50 + scoreFontSize, `Claims: ${this.availGreenClaims}`, { font: `${smallFontSize}px Arial`, fill: '#228B22' }).setDepth(9999);
      this.farmerScoreText = this.add.text(startX + gridWidth - 150, startY - 50, `Farmer: ${this.farmerScore}`, { font: `${scoreFontSize}px Arial`, fill: '#654321' }).setDepth(9999);
      this.farmerClaimsText = this.add.text(startX + gridWidth - 150, startY - 50 + scoreFontSize, `Claims: ${this.availFarmerClaims}`, { font: `${smallFontSize}px Arial`, fill: '#654321' }).setDepth(9999);
      const turnFontSize = Math.max(20, Math.floor(cellSize * 0.3));
      this.turnText = this.add.text(gameWidth / 2, startY + gridHeight + 10, `Turn: ${this.currentPlayer}`, { font: `${turnFontSize}px Arial`, fill: '#000000' }).setOrigin(0.5, 0).setDepth(9999);
    }
    this.updateTurnText();

    // Create the grid – note: on desktop we want fixed cellSize (100) as before
    const gridConfig = {
      gridSize,
      cellSize: isDesktop ? 100 : cellSize,
      margin: 5,
      startX,
      startY,
      unsuitableProportion: 0,
      correlation: correlationVal,
      maxValue: 20,
      BAUSet: []
    };
    this.grid = createGrid(this, gridConfig);

    // Compute BAU if computer is farmer.
    if (this.computerTeam === 'farmer') {
      const farmerBAUSet = calculateFarmerBAUSet(this.grid, farmerClaims, this.computerStrategy, greenClaims);
      farmerBAUSet.forEach(coord => {
        this.grid[coord.row][coord.col].cellData.isBAU = true;
      });
      this.greenBAU = calculateGreenBAUScore(this.grid, farmerBAUSet);
    } else {
      this.greenBAU = 0;
    }
    if (userTeam === 'green') {
      this.heuristicMaxGreenScore = calculateHeuristicMaxGreenScore(this.grid, greenClaims, farmerClaims, this.leakage);
    } else {
      this.heuristicMaxGreenScore = 0;
    }
    // For desktop, show decorative images.
    if (isDesktop) {
      const imageOffset = 130;
      this.staticTree = this.add.image(startX - imageOffset, startY + gridHeight / 2, 'tree').setDisplaySize(100, 100);
      this.staticTractor = this.add.image(startX + gridWidth + imageOffset, startY + gridHeight / 2, 'tractor').setDisplaySize(100, 100);
    }
    this.updateTurnText();

    // Trigger AI move if needed.
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
    const displayTeam = this.currentPlayer.charAt(0).toUpperCase() + this.currentPlayer.slice(1);
    if (window.innerWidth >= 1024) {
      this.turnText.setText(`Current Turn: ${displayTeam}`);
      this.turnText.setFill(this.currentPlayer === 'green' ? '#228B22' : '#654321');
    } else {
      this.turnText.setText(`Turn: ${displayTeam}`);
      this.turnText.setFill(this.currentPlayer === 'green' ? '#228B22' : '#654321');
    }
  }

  update() {}
}

export function displayFinalResults(scene) {
  const userTeam = scene.userOptions.userTeam || 'farmer';
  const optimalSW = calculateOptimalSocialWelfare(scene.grid);
  const actualSW  = calculateActualSocialWelfare(scene.grid);
  const welfareLoss = calculateSocialWelfareDifference(actualSW, optimalSW);
  let additionalityVal = 'N/A';
  if (userTeam === 'green') {
    const greenClaimedTotal = calculateGreenClaimedTotal(scene.grid);
    additionalityVal = calculateAdditionality(greenClaimedTotal, scene.greenBAU).toString();
  }
  const lastRow = scene.grid[scene.grid.length - 1];
  const gridBottom = lastRow[0].y + lastRow[0].height;
  const offset = 50;
  const resultsY = gridBottom + offset;
  let bg = scene.add.rectangle(scene.cameras.main.centerX, resultsY, 850, 290, 0x6EA06E, 0.7);
  bg.setOrigin(0.5, 0);
  const leftColX = bg.x - 390;
  const rightColX = bg.x + 100;
  scene.add.text(leftColX, bg.y + 20, 'Final Metrics:', { font: '32px Arial', fill: '#4D341A' });
  const colStartY = bg.y + 80;
  const lineSpacing = 40;
  scene.add.text(leftColX, colStartY, `Green Conservation Score: ${scene.greenScore}`, { font: '28px Arial', fill: '#4D341A' });
  scene.add.text(leftColX + 20, colStartY + lineSpacing, `Pure Strategy: ${scene.greenPureScore}`, { font: '24px Arial', fill: '#4D341A' });
  scene.add.text(leftColX + 20, colStartY + 2 * lineSpacing, `Displacement: ${scene.greenDisplacementScore}`, { font: '24px Arial', fill: '#4D341A' });
  scene.add.text(leftColX, colStartY + 3 * lineSpacing, `Additionality: ${additionalityVal}`, { font: '28px Arial', fill: '#4D341A' });
  scene.add.text(rightColX, bg.y + 20, 'Performance:', { font: '32px Arial', fill: '#4D341A' });
  scene.add.text(rightColX, colStartY, `Welfare Loss: ${welfareLoss.toFixed(2)}%`, { font: '28px Arial', fill: '#4D341A' });
  if (userTeam === 'green' && scene.heuristicMaxGreenScore > 0) {
    const fraction = (scene.greenScore / scene.heuristicMaxGreenScore) * 100;
    scene.add.text(rightColX, colStartY + lineSpacing, `Green Success: ${fraction.toFixed(1)}%`, { font: '28px Arial', fill: '#4D341A' });
  }
  scene.input.enabled = true;
  let playAgainBtn = scene.add.text(bg.x - 150, bg.y + 340, 'Play Again', { font: '28px Arial', fill: '#ffffff', backgroundColor: '#228B22', padding: { x: 10, y: 5 } }).setInteractive();
  playAgainBtn.setDepth(100);
  playAgainBtn.on('pointerdown', () => {
    console.log("Play Again clicked");
    scene.scene.restart();
  });
  let exitBtn = scene.add.text(bg.x + 50, bg.y + 340, 'End & Exit', { font: '28px Arial', fill: '#ffffff', backgroundColor: '#228B22', padding: { x: 10, y: 5 } }).setInteractive();
  exitBtn.setDepth(100);
  exitBtn.on('pointerdown', () => {
    console.log("End & Exit clicked");
    window.location.reload();
  });
}

export function startPhaserGame(userOptions) {
  const { gridSize } = userOptions;
  const dims = computeGameDimensions(gridSize);
  const { gameWidth, gameHeight, gridWidth, gridHeight } = dims;
  const config = {
    type: Phaser.AUTO,
    width: gameWidth,
    height: gameHeight,
    scene: [ MyScene ],
    parent: 'game-container'
  };
  const game = new Phaser.Game(config);
  game.scene.start('MyScene', { ...userOptions, gameWidth, gameHeight, gridWidth, gridHeight });
}
