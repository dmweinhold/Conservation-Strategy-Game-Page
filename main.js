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
  // Make sure this is exported from gameLogic.js
  calculateHeuristicMaxGreenScore
} from './gameLogic.js';

/**
 * A helper function to compute how large the game should be,
 * and how large the grid is, given user-selected gridSize.
 */
function computeGameDimensions(gridSize, baseCellSize = 100, margin = 5) {
  const isMobile = window.innerWidth < 768;
  const cellSize = isMobile ? 70 : baseCellSize; // dynamically set cell size

  const gridWidth  = gridSize * cellSize + (gridSize - 1) * margin;
  const gridHeight = gridSize * cellSize + (gridSize - 1) * margin;

  const extraSide   = isMobile ? 100 : 500;
  const extraTop    = isMobile ? 80 : 150;
  const extraBottom = isMobile ? 200 : 450;

  const screenHeight = window.innerHeight;
  const screenWidth = window.innerWidth;

  const gameWidth  = Math.max(gridWidth + extraSide, screenWidth);
  const gameHeight = Math.min(screenHeight, gridHeight + extraTop + extraBottom);

  return { gameWidth, gameHeight, gridWidth, gridHeight, cellSize };
}

/**
 * Phaser scene class.
 */
class MyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MyScene' });
  }

  init(data) {
    // data from startPhaserGame(...) => includes userOptions + computed dims
    this.userOptions = data || {};
  }

  preload() {
    // Load images for green and farmer icons
    for (let i = 1; i <= 10; i++) {
      this.load.image('green' + i, 'images/C' + i + '.png');
      this.load.image('farmer' + i, 'images/A' + i + '.png');
    }
    this.load.image('tree', 'images/tree.png');
    this.load.image('tractor', 'images/tractor.png');
  }

  create() {
    // 1) Extract data from userOptions
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

    // Define helper variables for responsive UI elements
    const isMobile = window.innerWidth < 768;
    const paddingY = gameHeight * 0.05;
    const scoreFontSize = isMobile ? 20 : 24;

    // 2) Basic defaults and constraints
    this.currentPlayer = 'farmer';  // farmer goes first by definition
    if (!userTeam)          userTeam          = 'farmer';
    if (!computerStrategy)  computerStrategy  = 'naive profit maximizer';
    
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
    if (![4, 6, 8, 10].includes(gridSize)) {
      gridSize = 4;
    }

    // 3) Decide which side is computer
    if (userTeam === 'farmer') {
      this.computerTeam = 'green';
      this.computerStrategy = computerStrategy;
      // If user is farmer => no BAU => set leakage=1 => no penalty
      this.leakage = 1.0;
    } else {
      this.computerTeam = 'farmer';
      this.computerStrategy = computerStrategy;
      this.leakage = requestedLeak;
    }

    // 4) Camera background
    this.cameras.main.setBackgroundColor(0xEDE8E1);

    // 5) Initialize scoreboard variables
    this.greenScore             = 0;
    this.farmerScore            = 0;
    this.greenPureScore         = 0; // actively claimed green
    this.greenDisplacementScore = 0; // leftover unclaimed => green

    // Keep track of how many claims remain
    this.availFarmerClaims = farmerClaims;
    this.availGreenClaims  = greenClaims;

    // For partial leakage penalty
    this.cumGreenBAU        = 0;
    this.cumFarmerDeduction = 0;

    // 6) Place scoreboard text near corners
    const farmerScoreStyle   = { font: `${scoreFontSize}px Arial`, fill: '#654321' };
    const greenScoreStyle    = { font: `${scoreFontSize}px Arial`, fill: '#228B22' };
    const claimsStyleFarmer  = { font: `${scoreFontSize * 0.83}px Arial`, fill: '#654321' };
    const claimsStyleGreen   = { font: `${scoreFontSize * 0.83}px Arial`, fill: '#228B22' };

    this.farmerScoreText = this.add.text(
      gameWidth - 220, 60,
      `Farmer Score: 0`,
      farmerScoreStyle
    );

    this.greenScoreText = this.add.text(
      20, 60,
      `Green Score: 0`,
      greenScoreStyle
    );

    this.farmerClaimsText = this.add.text(
      gameWidth - 220, 90,
      `Farmer Claims: ${this.availFarmerClaims}`,
      claimsStyleFarmer
    );

    this.greenClaimsText = this.add.text(
      20, 90,
      `Green Claims: ${this.availGreenClaims}`,
      claimsStyleGreen
    );

    // 7) "Current Turn" text in center near top
    const turnOffsetY = paddingY + (scoreFontSize + 20);
    this.turnText = this.add.text(
      gameWidth / 2,
      turnOffsetY,
      `Current Turn: ${this.currentPlayer}`,
      { font: `${scoreFontSize}px Arial`, fill: '#ffffff' }
    ).setOrigin(0.5, 0);

    this.updateTurnText();

    // 8) Create the grid
    let startX = (gameWidth - gridWidth) / 2;
    let startY = 120; // You could also compute this relative to gameHeight if desired

    const gridConfig = {
      gridSize,
      cellSize,  // Now using the dynamically computed cellSize
      margin: 5,
      startX,
      startY,
      unsuitableProportion: 0,
      correlation: correlationVal,
      maxValue: 20,
      BAUSet: []
    };

    this.grid = createGrid(this, gridConfig);  // (Ensure only one call here)

    // 9) If computer is farmer => define BAU
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

    // 10) Possibly compute the theoretical max green score
    if (userTeam === 'green') {
      const farmerClaimsOriginal = parseInt(farmerClaims, 10);
      const greenClaimsOriginal  = parseInt(greenClaims, 10);
      this.heuristicMaxGreenScore = calculateHeuristicMaxGreenScore(
        this.grid,
        greenClaimsOriginal,
        farmerClaimsOriginal,
        this.leakage
      );
    } else {
      this.heuristicMaxGreenScore = 0;
    }

    // 11) Place static images (tree, tractor)
    const treeOffset = isMobile ? 70 : 130;
    const tractorOffset = isMobile ? 70 : 130;

    this.staticTree = this.add.image(
      startX - treeOffset,
      startY + gridHeight / 2,
      'tree'
    ).setDisplaySize(cellSize, cellSize);

    this.staticTractor = this.add.image(
      startX + gridWidth + tractorOffset,
      startY + gridHeight / 2,
      'tractor'
    ).setDisplaySize(cellSize, cellSize);

    // 12) If AI starts, do the first move
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
    let turnColor;
    if (this.currentPlayer === 'green') {
      turnColor = '#228B22';  // forest green
    } else {
      turnColor = '#654321';  // dark brown
    }
    const displayTeam = this.currentPlayer.charAt(0).toUpperCase() + this.currentPlayer.slice(1);
    this.turnText.setText(`Current Turn: ${displayTeam}`);
    this.turnText.setFill(turnColor);
  }

  update() {
    // No continuous loop logic needed
  }
}

/**
 * Display final results overlay.
 */
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

  // Retrieve dynamic dimensions passed from startPhaserGame
  const gameWidth = scene.userOptions.gameWidth;
  const gameHeight = scene.userOptions.gameHeight;
  const cellSize = scene.userOptions.cellSize;

  const lastRow = scene.grid[scene.grid.length - 1];
  const gridBottom = lastRow[0].y + lastRow[0].height;
  const overlayOffset = cellSize * 0.5; // offset relative to cell size
  const resultsY = gridBottom + overlayOffset;

  // Define overlay dimensions based on the game width and cell size
  const overlayWidth = gameWidth * 0.8;
  const overlayHeight = cellSize * 3.0; // adjust multiplier as needed
  const overlayX = scene.cameras.main.centerX;
  
  // Create the overlay background rectangle
  let bg = scene.add.rectangle(
    overlayX,
    resultsY,
    overlayWidth,
    overlayHeight,
    0x6EA06E,
    0.7
  ).setOrigin(0.5, 0);

  // Define column anchors relative to the overlay width
  const leftColX = bg.x - overlayWidth * 0.45;
  const rightColX = bg.x + overlayWidth * 0.1;

  // Set dynamic font sizes relative to cellSize
  const headerFontSize = cellSize * 0.35;
  const textFontSize = cellSize * 0.25;

  // Title for the left column
  scene.add.text(leftColX, bg.y + overlayHeight * 0.07, 'Final Metrics:', {
    font: `${headerFontSize}px Arial`,
    fill: '#4D341A'
  });

  // Starting Y for the columns within the overlay and line spacing
  const colStartY = bg.y + overlayHeight * 0.3;
  const lineSpacing = cellSize * 0.8;

  // Left column items (Final Metrics)
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

  // Right column items (Performance metrics)
  scene.add.text(rightColX, bg.y + overlayHeight * 0.07, 'Performance:', {
    font: `${headerFontSize}px Arial`,
    fill: '#4D341A'
  });
  scene.add.text(rightColX, colStartY, 
    `Welfare Loss: ${welfareLoss.toFixed(2)}%`,
    { font: `${textFontSize}px Arial`, fill: '#4D341A' }
  );
  if (userTeam === 'green' && scene.heuristicMaxGreenScore && scene.heuristicMaxGreenScore > 0) {
    const fraction = (scene.greenScore / scene.heuristicMaxGreenScore) * 100;
    scene.add.text(rightColX, colStartY + lineSpacing,
      `Green Success: ${fraction.toFixed(1)}%`,
      { font: `${textFontSize}px Arial`, fill: '#4D341A' }
    );
  }

  // Re-enable input for further interactions
  scene.input.enabled = true;

  // Create interactive buttons relative to the overlay position
  const btnY = bg.y + overlayHeight + cellSize * 0.5;
  const btnFontSize = cellSize * 0.3;

  // "Play Again" button
  let playAgainBtn = scene.add.text(bg.x - overlayWidth * 0.2, btnY, 'Play Again', {
    font: `${btnFontSize}px Arial`,
    fill: '#ffffff',
    backgroundColor: '#228B22',
    padding: { x: 10, y: 5 }
  }).setInteractive();
  playAgainBtn.setDepth(100);
  playAgainBtn.on('pointerdown', () => {
    console.log("Play Again clicked");
    scene.scene.restart();
  });

  // "End & Exit" button
  let exitBtn = scene.add.text(bg.x + overlayWidth * 0.1, btnY, 'End & Exit', {
    font: `${btnFontSize}px Arial`,
    fill: '#ffffff',
    backgroundColor: '#228B22',
    padding: { x: 10, y: 5 }
  }).setInteractive();
  exitBtn.setDepth(100);
  exitBtn.on('pointerdown', () => {
    console.log("End & Exit clicked");
    window.location.reload();
  });
  
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

/**
 * Start the Phaser game with dynamically computed dimensions.
 */
export function startPhaserGame(userOptions) {
  // 1) read gridSize from user input
  const { gridSize } = userOptions;

  // 2) compute final game + grid dimensions, including cellSize
  const { gameWidth, gameHeight, gridWidth, gridHeight, cellSize } = computeGameDimensions(gridSize);

  // 3) build the Phaser config with scale options for responsiveness
  const config = {
    type: Phaser.AUTO,
    width: gameWidth,
    height: gameHeight,
    scale: {
      mode: Phaser.Scale.FIT,             // scales the game to fit the screen
      autoCenter: Phaser.Scale.CENTER_BOTH  // centers the game on the page
    },
    scene: [ MyScene ],
    parent: 'game-container'
  };

  // 4) create the game
  const game = new Phaser.Game(config);

  // 5) pass all data (including computed dimensions) to the scene
  game.scene.start('MyScene', {
    ...userOptions,
    gameWidth,
    gameHeight,
    gridWidth,
    gridHeight,
    cellSize
  });
}
