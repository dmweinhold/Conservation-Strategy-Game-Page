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
function computeGameDimensions(gridSize, cellSize = 100, margin = 5) {
  const gridWidth  = gridSize * cellSize + (gridSize - 1) * margin;
  const gridHeight = gridSize * cellSize + (gridSize - 1) * margin;

  // Minimum dimensions
  const minWidth  = 1024;
  const minHeight = 900;

  const extraSide   = 500;
  const extraTop    = 150;
  const extraBottom = 450;

  // Detect window height to prevent overflow on mobile
  const screenHeight = window.innerHeight;
  const screenWidth = window.innerWidth;

  const gameWidth  = Math.max(minWidth, gridWidth + extraSide, screenWidth);
  const gameHeight = Math.min(screenHeight, Math.max(minHeight, gridHeight + extraTop + extraBottom));

  return { gameWidth, gameHeight, gridWidth, gridHeight };
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
      gridHeight
    } = this.userOptions;

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
    const farmerScoreStyle   = { font: '24px Arial', fill: '#654321' };
    const greenScoreStyle    = { font: '24px Arial', fill: '#228B22' };
    const claimsStyleFarmer  = { font: '20px Arial', fill: '#654321' };
    const claimsStyleGreen   = { font: '20px Arial', fill: '#228B22' };

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
    this.turnText = this.add.text(
      gameWidth / 2,
      30,
      `Current Turn: ${this.currentPlayer}`,
      { font: '24px Arial', fill: '#ffffff' }
    ).setOrigin(0.5, 0);

    this.updateTurnText();

    // 8) Create the grid
    let startX = (gameWidth - gridWidth) / 2;
    let startY = 120;

    const gridConfig = {
      gridSize,
      cellSize: 100,
      margin: 5,
      startX,
      startY,
      unsuitableProportion: 0,
      correlation: correlationVal,
      maxValue: 20,
      BAUSet: [] // We'll assign BAU after grid creation if necessary
    };

    this.grid = createGrid(this, gridConfig);

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
      // If user is farmer => no BAU
      this.greenBAU = 0;
    }

    // 10) Possibly compute the theoretical max green score
    // ONLY if the userTeam is green do we care.
    if (userTeam === 'green') {
      // We'll store it on the scene so we can use in final display
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
    this.staticTree = this.add.image(
      startX - 130,
      startY + gridHeight / 2,
      'tree'
    ).setDisplaySize(100, 100);

    this.staticTractor = this.add.image(
      startX + gridWidth + 130,
      startY + gridHeight / 2,
      'tractor'
    ).setDisplaySize(100, 100);

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
      // Otherwise, user goes first
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

  // 1) Position overlay below bottom row of grid
  const lastRow = scene.grid[scene.grid.length - 1];
  const gridBottom = lastRow[0].y + lastRow[0].height;
  const offset = 50;
  const resultsY = gridBottom + offset;

  // 2) Create a wider rectangle so we can have two columns
  let bg = scene.add.rectangle(
    scene.cameras.main.centerX, // horizontally center
    resultsY,                   // y position
    850,                        // width (increased for 2 columns)
    290,                        // height
    0x6EA06E,                   // fill color
    0.7                         // alpha
  );
  bg.setOrigin(0.5, 0);

  // 4) Define two column anchors
  const leftColX = bg.x - 390;
  const rightColX = bg.x + 100;

  // 3) Title in the center near the top of the rectangle
  scene.add.text(leftColX, bg.y + 20, 'Final Metrics:', {
    font: '32px Arial',
    fill: '#4D341A'
  });

  // Start Y for the columns (further down from the title)
  const colStartY = bg.y + 80;
  const lineSpacing = 40; // vertical spacing between lines

  // 5) Left column items
  scene.add.text(leftColX, colStartY, 
    `Green Conservation Score: ${scene.greenScore}`,
    { font: '28px Arial', fill: '#4D341A' }
  );
  scene.add.text(leftColX + 20, colStartY + lineSpacing, 
    `Pure Strategy: ${scene.greenPureScore}`,
    { font: '24px Arial', fill: '#4D341A' }
  );
  scene.add.text(leftColX + 20, colStartY + 2 * lineSpacing,
    `Displacement: ${scene.greenDisplacementScore}`,
    { font: '24px Arial', fill: '#4D341A' }
  );
  scene.add.text(leftColX, colStartY + 3 * lineSpacing,
    `Additionality: ${additionalityVal}`,
    { font: '28px Arial', fill: '#4D341A' }
  );

  // 6) Right column items
  scene.add.text(rightColX, bg.y + 20, 'Performance:', {
    font: '32px Arial',
    fill: '#4D341A'
  });
  scene.add.text(rightColX, colStartY, 
    `Welfare Loss: ${welfareLoss.toFixed(2)}%`,
    { font: '28px Arial', fill: '#4D341A' }
  );
  if (userTeam === 'green' && scene.heuristicMaxGreenScore && scene.heuristicMaxGreenScore > 0) {
    const fraction = (scene.greenScore / scene.heuristicMaxGreenScore) * 100;
    scene.add.text(rightColX, colStartY + lineSpacing,
      `Green Success: ${fraction.toFixed(1)}%`,
      { font: '28px Arial', fill: '#4D341A' }
    );
  }

  // Ensure input is enabled for button interactions
  scene.input.enabled = true;

  // Create "Play Again" button
  let playAgainBtn = scene.add.text(bg.x - 150, bg.y + 340, 'Play Again', {
    font: '28px Arial',
    fill: '#ffffff',
    backgroundColor: '#228B22',
    padding: { x: 10, y: 5 }
  }).setInteractive();
  playAgainBtn.setDepth(100);
  playAgainBtn.on('pointerdown', () => {
    console.log("Play Again clicked");
    scene.scene.restart();
  });

  // Create "End & Exit" button
  let exitBtn = scene.add.text(bg.x + 50, bg.y + 340, 'End & Exit', {
    font: '28px Arial',
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

  // 2) compute final game + grid dims
  const { gameWidth, gameHeight, gridWidth, gridHeight } =
    computeGameDimensions(gridSize);

  // 3) build the Phaser config
  const config = {
    type: Phaser.AUTO,
    width: gameWidth,
    height: gameHeight,
    scene: [ MyScene ],
    parent: 'game-container'
  };

  // 4) create the game
  const game = new Phaser.Game(config);

  // 5) pass all data (including computed widths/heights) to the scene
  game.scene.start('MyScene', {
    ...userOptions,
    gameWidth,
    gameHeight,
    gridWidth,
    gridHeight
  });
}
