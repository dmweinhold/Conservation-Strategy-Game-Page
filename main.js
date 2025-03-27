import { createGrid } from './grid.js';
import { computerChoosePlot } from './strategy.js';
import {
  calculateFarmerBAUSet,
  calculateGreenBAUScore,
  calculateHeuristicMaxGreenScore,
  calculateActualSocialWelfare,
  calculateOptimalSocialWelfare,
  calculateSocialWelfareDifference,
  calculateGreenClaimedTotal,
  calculateAdditionality
} from './gameLogic.js';

/**
 * A single scene class for the main game.
 */
class MyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MyScene' });
  }

  init(data) {
    this.userOptions = data || {};
  }

  preload() {
    // Load icons
    for (let i = 1; i <= 10; i++) {
      this.load.image('green' + i, 'images/C' + i + '.png');
      this.load.image('farmer' + i, 'images/A' + i + '.png');
    }
    // Tree + tractor images
    this.load.image('tree', 'images/tree.png');
    this.load.image('tractor', 'images/tractor.png');
  }

  create() {
    // --------------------------------------------------
    // 1) Extract user options
    // --------------------------------------------------
    let { userTeam, computerStrategy, correlation, leakage, farmerClaims, greenClaims, gridSize } = this.userOptions;
    userTeam         = userTeam         || 'farmer';
    computerStrategy = computerStrategy || 'naive profit maximizer';

    this.currentPlayer = 'farmer'; // farmer goes first
    let corrVal  = parseFloat(correlation) || 0;
    this.leakage = parseFloat(leakage)     || 0.5;
    farmerClaims = parseInt(farmerClaims, 10) || 8;
    greenClaims  = parseInt(greenClaims, 10)  || 8;
    gridSize     = parseInt(gridSize, 10);
    if (![4,6,8,10].includes(gridSize)) {
      gridSize = 4;
    }

    // Decide AI side
    if (userTeam === 'farmer') {
      this.computerTeam     = 'green';
      this.computerStrategy = computerStrategy;
      // If user is farmer, override leakage
      this.leakage = 1.0;
    } else {
      this.computerTeam     = 'farmer';
      this.computerStrategy = computerStrategy;
    }

    // Background
    this.cameras.main.setBackgroundColor(0xEDE8E1);

    // --------------------------------------------------
    // 2) Initialize score/claim tracking
    // --------------------------------------------------
    this.greenScore             = 0;
    this.farmerScore            = 0;
    this.greenPureScore         = 0;
    this.greenDisplacementScore = 0;
    this.availFarmerClaims      = farmerClaims;
    this.availGreenClaims       = greenClaims;
    this.cumGreenBAU            = 0;
    this.cumFarmerDeduction     = 0;

    // Precompute BAU if farmer is AI
    if (this.computerTeam === 'farmer') {
      this.precomputedFarmerBAU = calculateFarmerBAUSet([], farmerClaims, this.computerStrategy, greenClaims);
    } else {
      this.precomputedFarmerBAU = null;
    }

    // If user is green => compute heuristic after grid
    if (userTeam === 'green') {
      this.computeHeuristicAfterGrid = true;
    } else {
      this.heuristicMaxGreenScore    = 0;
      this.computeHeuristicAfterGrid = false;
    }

    // --------------------------------------------------
    // 3) Orientation detection & dynamic layout
    // --------------------------------------------------
    const isLandscape = window.innerWidth > window.innerHeight;

    // We'll define separate "virtual" dims for portrait vs. landscape
    // so the game is bigger/wider in landscape mode.
    let gameW, gameH;
    if (isLandscape) {
      gameW = 1100; // for a wide layout
      gameH = 600; // less tall
    } else {
      gameW = 600; // narrower
      gameH = 900; // taller
    }

    // But note: We actually ALREADY have a config for width/height in the game,
    // which might be set to (800x1200). We can ignore that if we want,
    // or we can do the orientation logic before startPhaserGame instead.
    // For demonstration, let's read actual dimension from Phaser scale (if you prefer).
    const phaserWidth  = this.sys.game.scale.gameSize.width;
    const phaserHeight = this.sys.game.scale.gameSize.height;

    // We'll forcibly assume the "virtual" dims are (gameW, gameH) for calculations,
    // but if you'd rather rely on phaserWidth/Height, you can do that.
    let finalWidth  = phaserWidth;
    let finalHeight = phaserHeight;

    // For clarity, let's unify:
    // finalWidth  = gameW;
    // finalHeight = gameH;
    // But if your startPhaserGame used (800x1200), let's do:
    // finalWidth = this.sys.game.scale.gameSize.width;
    // finalHeight= this.sys.game.scale.gameSize.height;

    // We'll demonstrate using "our" chosen w/h:
    const gameWidth  = gameW;
    const gameHeight = gameH;

    // Define top/bottom/side padding differently for portrait vs. landscape
    let topPaddingForUI, bottomPaddingForUI, sidePadding;
    if (isLandscape) {
      // For desktops/laptops
      topPaddingForUI    = 50;
      bottomPaddingForUI = 50;
      sidePadding        = 150; // bigger side margin so we can put scoreboard on left/right if we want
    } else {
      // For phones/tablets in portrait
      topPaddingForUI    = 200;
      bottomPaddingForUI = 40;
      sidePadding        = 40;
    }

    // --------------------------------------------------
    // 4) Compute dynamic grid size
    // --------------------------------------------------
    const availableWidth  = gameWidth  - sidePadding * 2;
    const availableHeight = gameHeight - topPaddingForUI - bottomPaddingForUI;

    const margin = 5;
    const maxCellSizeByWidth  = (availableWidth  - margin*(gridSize - 1)) / gridSize;
    const maxCellSizeByHeight = (availableHeight - margin*(gridSize - 1)) / gridSize;
    const cellSize = Math.floor(Math.min(maxCellSizeByWidth, maxCellSizeByHeight));

    const gridWidth  = gridSize * cellSize + margin*(gridSize - 1);
    const gridHeight = gridSize * cellSize + margin*(gridSize - 1);

    // Let's center the grid horizontally & put it at topPadding
    const startX = (gameWidth - gridWidth) / 2;
    const startY = topPaddingForUI;

    // --------------------------------------------------
    // 5) Place scoreboard text
    // --------------------------------------------------
    const scoreFontSize = Math.max(18, Math.floor(cellSize * 0.3));
    const smallFontSize = Math.max(16, Math.floor(cellSize * 0.25));
    const turnFontSize  = Math.max(20, Math.floor(cellSize * 0.3));

    if (isLandscape) {
      // LANDSCAPE: Let's place scoreboard left & right, turn text up top
      this.turnText = this.add.text(
        gameWidth / 2,
        5,
        `Turn: ${this.currentPlayer}`,
        { font: `${turnFontSize}px Arial`, fill: '#000000' }
      ).setOrigin(0.5, 0);

      // Green scoreboard on the left
      this.greenScoreText = this.add.text(
        sidePadding - 50, // left side
        50,
        `Greens: ${this.greenScore}`,
        { font: `${scoreFontSize}px Arial`, fill: '#228B22' }
      );
      this.greenClaimsText = this.add.text(
        sidePadding -50,
        50 + scoreFontSize,
        `Claims: ${this.availGreenClaims}`,
        { font: `${smallFontSize}px Arial`, fill: '#228B22' }
      );

      // Farmer scoreboard on the right
      this.farmerScoreText = this.add.text(
        gameWidth - sidePadding +70, // right side
        50,
        `Farmers: ${this.farmerScore}`,
        { font: `${scoreFontSize}px Arial`, fill: '#654321' }
      ).setOrigin(1, 0);

      this.farmerClaimsText = this.add.text(
        gameWidth - sidePadding +20,
        50 + scoreFontSize,
        `Claims: ${this.availFarmerClaims}`,
        { font: `${smallFontSize}px Arial`, fill: '#654321' }
      ).setOrigin(1, 0);

    } else {
      // PORTRAIT: scoreboard near top, with big top padding
      this.turnText = this.add.text(
        gameWidth / 2,
        10,
        `Turn: ${this.currentPlayer}`,
        { font: `${turnFontSize}px Arial`, fill: '#000000' }
      ).setOrigin(0.5, 0);

      this.greenScoreText = this.add.text(
        startX,
        75,
        `Green: ${this.greenScore}`,
        { font: `${scoreFontSize}px Arial`, fill: '#228B22' }
      );
      this.greenClaimsText = this.add.text(
        startX,
        75 + scoreFontSize,
        `Claims: ${this.availGreenClaims}`,
        { font: `${smallFontSize}px Arial`, fill: '#228B22' }
      );

      this.farmerScoreText = this.add.text(
        startX + gridWidth - 200,
        75,
        `Farmer: ${this.farmerScore}`,
        { font: `${scoreFontSize}px Arial`, fill: '#654321' }
      );
      this.farmerClaimsText = this.add.text(
        startX + gridWidth - 200,
        75 + scoreFontSize,
        `Claims: ${this.availFarmerClaims}`,
        { font: `${smallFontSize}px Arial`, fill: '#654321' }
      );
    }

    // --------------------------------------------------
    // 6) Create the grid
    // --------------------------------------------------
    const gridConfig = {
      gridSize,
      cellSize,
      margin,
      startX,
      startY,
      correlation: corrVal,
      BAUSet: [],
      maxValue: 20
    };
    this.grid = createGrid(this, gridConfig);

    // If farmer is AI, finalize BAU
    if (this.precomputedFarmerBAU) {
      const realFarmerBAU = calculateFarmerBAUSet(
        this.grid,
        farmerClaims,
        this.computerStrategy,
        greenClaims
      );
      realFarmerBAU.forEach(({ row, col }) => {
        this.grid[row][col].cellData.isBAU = true;
      });
      this.greenBAU = calculateGreenBAUScore(this.grid, realFarmerBAU);
    } else {
      this.greenBAU = 0;
    }

    // If user is green, compute heuristic
    if (this.computeHeuristicAfterGrid) {
      this.heuristicMaxGreenScore = calculateHeuristicMaxGreenScore(
        this.grid,
        greenClaims,
        farmerClaims,
        this.leakage
      );
    }

    // --------------------------------------------------
    // 7) Check if AI goes first
    // --------------------------------------------------
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
    this.turnText.setFill(this.currentPlayer === 'green' ? '#228B22' : '#654321');
  }
}

/**
 * A more detailed final results overlay.
 */

export function displayFinalResults(scene) {
  // Gather final stats
  const userTeam   = scene.userOptions.userTeam || 'farmer';
  const optimalSW  = calculateOptimalSocialWelfare(scene.grid);
  const actualSW   = calculateActualSocialWelfare(scene.grid);
  const welfareLoss= calculateSocialWelfareDifference(actualSW, optimalSW);

  // Additionality
  let additionalityVal = 'N/A';
  if (userTeam === 'green') {
    const greenClaimedTotal = calculateGreenClaimedTotal(scene.grid);
    additionalityVal = calculateAdditionality(greenClaimedTotal, scene.greenBAU).toString();
  }

  // Green success fraction
  let greenSuccessFraction = null;
  if (userTeam === 'green' && scene.heuristicMaxGreenScore > 0) {
    greenSuccessFraction = (scene.greenScore / scene.heuristicMaxGreenScore) * 100;
  }

  // Create overlay <div>
  const overlay = document.createElement('div');
  overlay.style.position        = 'fixed';
  overlay.style.top             = '0';
  overlay.style.left            = '0';
  overlay.style.width           = '100%';
  overlay.style.height          = '100%';
  overlay.style.backgroundColor = 'rgba(110,160,110,0.95)';
  overlay.style.zIndex          = '9999';
  overlay.style.overflowY       = 'auto';
  overlay.style.display         = 'flex';
  overlay.style.flexDirection   = 'column';
  overlay.style.alignItems      = 'center';
  overlay.style.justifyContent  = 'center';
  overlay.style.fontFamily      = 'Arial, sans-serif';
  overlay.style.padding         = '20px';

  // Container for the final results box
  const container = document.createElement('div');
  container.style.maxWidth        = '400px';
  container.style.backgroundColor = '#EDE8E1';
  container.style.padding         = '20px';
  container.style.borderRadius    = '10px';
  container.style.color           = '#4D341A';

  // Title
  const title = document.createElement('h1');
  title.textContent = 'Final Results';
  container.appendChild(title);

  // A statsDiv for metrics
  const statsDiv = document.createElement('div');
  statsDiv.style.background    = '#EDE8E1';
  statsDiv.style.padding       = '20px';
  statsDiv.style.borderRadius  = '10px';
  statsDiv.style.color         = '#4D341A';
  statsDiv.style.maxWidth      = '350px';
  statsDiv.style.textAlign     = 'left';
  container.appendChild(statsDiv);

  // Metrics heading
  const headingMetrics = document.createElement('h3');
  headingMetrics.textContent = 'Metrics';
  statsDiv.appendChild(headingMetrics);

  // Green Score
  let lineGreenScore = document.createElement('p');
  lineGreenScore.textContent = `Green Score: ${scene.greenScore}`;
  statsDiv.appendChild(lineGreenScore);

  let linePure = document.createElement('p');
  linePure.textContent = `  Pure Strategy: ${scene.greenPureScore}`;
  linePure.style.marginLeft = '25px';
  statsDiv.appendChild(linePure);

  let lineDisp = document.createElement('p');
  lineDisp.textContent = `  Displacement: ${scene.greenDisplacementScore}`;
  lineDisp.style.marginLeft = '25px';
  statsDiv.appendChild(lineDisp);

  if (userTeam === 'green') {
    let lineAdd = document.createElement('p');
    lineAdd.textContent = `Additionality: ${additionalityVal}`;
    statsDiv.appendChild(lineAdd);
  }

  let lineFarmerScore = document.createElement('p');
  lineFarmerScore.textContent = `Farmer Score: ${scene.farmerScore}`;
  statsDiv.appendChild(lineFarmerScore);

  // Performance heading
  const headingPerf = document.createElement('h3');
  headingPerf.textContent = 'Performance';
  statsDiv.appendChild(headingPerf);

  let lineWelfare = document.createElement('p');
  lineWelfare.textContent = `Social Welfare Loss: ${welfareLoss.toFixed(2)}%`;
  statsDiv.appendChild(lineWelfare);

  if (greenSuccessFraction !== null) {
    let lineSuccess = document.createElement('p');
    lineSuccess.textContent = `Green Success: ${greenSuccessFraction.toFixed(1)}%`;
    statsDiv.appendChild(lineSuccess);
  }

  // Buttons
  const btnContainer = document.createElement('div');
  btnContainer.style.marginTop = '20px';
  btnContainer.style.textAlign = 'center';

  const btnStyle = `
    margin: 10px;
    padding: 12px 20px;
    border: none;
    border-radius: 5px;
    background-color: #228B22;
    color: #ffffff;
    font-size: 1em;
    cursor: pointer;
  `;

  // "Play Again" button => restart the scene

  const playAgainBtn = document.createElement('button');
  overlay.classList.add('final-overlay');
  playAgainBtn.textContent = 'Play Again';
  playAgainBtn.style.cssText = btnStyle;

  playAgainBtn.onclick = () => {
    document.querySelectorAll('.final-overlay').forEach(div => div.remove());
    scene.scene.restart();
    scene.input.enabled = true;
  };
  btnContainer.appendChild(playAgainBtn);

  // "Start Over" button => destroy game, show landing page
  const startOverBtn = document.createElement('button');
  startOverBtn.textContent = 'Start Over';
  startOverBtn.style.cssText = btnStyle;
  startOverBtn.onclick = () => {
    overlay.remove();
    scene.game.destroy(true, false);
    window.location.reload();
  };
  btnContainer.appendChild(startOverBtn);

  container.appendChild(btnContainer);
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  // Disable current scene input
  scene.input.enabled = false;
}


/**
 * Start the Phaser game with orientation-based default width/height.
 * This is just one approach; you can also do all orientation logic inside the scene.
 */
export function startPhaserGame(userOptions) {
  // Check orientation before building config
  const isLandscape = window.innerWidth > window.innerHeight;
  let gameWidth, gameHeight;
  if (isLandscape) {
    gameWidth  = 1100;
    gameHeight = 600;
  } else {
    gameWidth  = 600;
    gameHeight = 900;
  }

  const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: gameWidth,
    height: gameHeight,
    scale: {
      mode: Phaser.Scale.FIT, 
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [ MyScene ]
  };

  const game = new Phaser.Game(config);
  // Pass userOptions to the scene
  game.scene.start('MyScene', { ...userOptions });
}
