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
 * - For desktop (screenWidth >= 1024): fixed cell size (100px)
 * - For devices: scale grid to ~95% of the smaller dimension
 */
function computeGameDimensions(gridSize, margin = 5) {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  
  if (screenWidth >= 1024) {
    // Desktop
    const cellSize = 100;
    const gridWidth  = gridSize * cellSize + (gridSize - 1) * margin;
    const gridHeight = gridWidth;
    const minWidth   = 1024;
    const minHeight  = 900;
    const extraSide   = 500; 
    const extraTop    = 150; 
    const extraBottom = 450;
    const gameWidth  = Math.max(minWidth, gridWidth + extraSide);
    const gameHeight = Math.max(minHeight, gridHeight + extraTop + extraBottom);
    return { gameWidth, gameHeight, gridWidth, gridHeight, cellSize };
  } else {
    // Mobile / tablet
    const available  = Math.min(screenWidth * 0.95, screenHeight * 0.95);
    const cellSize   = Math.floor((available - (gridSize - 1) * margin) / gridSize);
    const gridWidth  = gridSize * cellSize + (gridSize - 1) * margin;
    const gridHeight = gridWidth;
    return {
      gameWidth:  screenWidth,
      gameHeight: screenHeight,
      gridWidth,
      gridHeight,
      cellSize
    };
  }
}

class MyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MyScene' });
  }

  init(data) {
    // Data from startPhaserGame
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
    // Extract user options
    let { userTeam, computerStrategy, correlation, leakage, farmerClaims, greenClaims, gridSize } = this.userOptions;

    // Defaults
    this.currentPlayer = 'farmer'; // Farmer goes first by default
    if (!userTeam) userTeam = 'farmer';
    if (!computerStrategy) computerStrategy = 'naive profit maximizer';

    let corrVal = parseFloat(correlation) || 0;
    corrVal = Math.max(-1, Math.min(corrVal, 1));
    let requestedLeak = parseFloat(leakage) || 0.5;
    farmerClaims = parseInt(farmerClaims, 10) || 8;
    greenClaims  = parseInt(greenClaims, 10) || 8;
    gridSize     = parseInt(gridSize, 10);
    if (![4,6,8,10].includes(gridSize)) {
      gridSize = 4;
    }

    // Decide AI side + final leakage
    if (userTeam === 'farmer') {
      this.computerTeam   = 'green';
      this.computerStrategy = computerStrategy;
      this.leakage        = 1.0;  // farmer side => no partial offset
    } else {
      this.computerTeam   = 'farmer';
      this.computerStrategy = computerStrategy;
      this.leakage        = requestedLeak;
    }

    // Background color
    this.cameras.main.setBackgroundColor(0xEDE8E1);

    // Score / claim tracking
    this.greenScore              = 0;
    this.farmerScore             = 0;
    this.greenPureScore          = 0;
    this.greenDisplacementScore  = 0;
    this.availFarmerClaims       = farmerClaims;
    this.availGreenClaims        = greenClaims;
    this.cumGreenBAU             = 0; 
    this.cumFarmerDeduction      = 0;

    const isDesktop = (window.innerWidth >= 1024);
    const dims = computeGameDimensions(gridSize);
    let { gameWidth, gameHeight, gridWidth, gridHeight, cellSize } = dims;

    // Save in userOptions (used for sprite animations)
    this.userOptions.gameWidth   = gameWidth;
    this.userOptions.gameHeight  = gameHeight;
    this.userOptions.gridWidth   = gridWidth;
    this.userOptions.gridHeight  = gridHeight;
    this.userOptions.cellSize    = cellSize;

    let startX = (gameWidth - gridWidth) / 2;
    let startY = isDesktop ? 120 : 80;

    // Scoreboard
    if (isDesktop) {
      const farmerScoreStyle  = { font: '24px Arial', fill: '#654321' };
      const greenScoreStyle   = { font: '24px Arial', fill: '#228B22' };
      const claimsStyleFarmer = { font: '20px Arial', fill: '#654321' };
      const claimsStyleGreen  = { font: '20px Arial', fill: '#228B22' };

      this.farmerScoreText = this.add.text(gameWidth - 220, 60, `Farmer Score: 0`, farmerScoreStyle);
      this.greenScoreText  = this.add.text(20, 60, `Green Score: 0`, greenScoreStyle);
      this.farmerClaimsText= this.add.text(gameWidth - 220, 90, `Farmer Claims: ${this.availFarmerClaims}`, claimsStyleFarmer);
      this.greenClaimsText = this.add.text(20, 90, `Green Claims: ${this.availGreenClaims}`, claimsStyleGreen);

      this.turnText = this.add.text(
        gameWidth / 2, 30,
        `Current Turn: ${this.currentPlayer}`,
        { font: '24px Arial', fill: '#ffffff' }
      ).setOrigin(0.5, 0);

    } else {
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
    }

    this.updateTurnText();

    // Create the grid
    const gridConfig = {
      gridSize,
      cellSize: (isDesktop ? 100 : cellSize),
      margin: 5,
      startX,
      startY,
      unsuitableProportion: 0,
      correlation: corrVal,
      maxValue: 20,
      BAUSet: []
    };
    this.grid = createGrid(this, gridConfig);

    // If computer is farmer => define BAU
    if (this.computerTeam === 'farmer') {
      const farmerBAUSet = calculateFarmerBAUSet(this.grid, farmerClaims, this.computerStrategy, greenClaims);
      farmerBAUSet.forEach(coord => {
        this.grid[coord.row][coord.col].cellData.isBAU = true;
      });
      this.greenBAU = calculateGreenBAUScore(this.grid, farmerBAUSet);
    } else {
      this.greenBAU = 0;
    }
    // If user is green => pre-calc heuristic
    if (userTeam === 'green') {
      this.heuristicMaxGreenScore = calculateHeuristicMaxGreenScore(
        this.grid,
        greenClaims,
        farmerClaims,
        this.leakage
      );
    } else {
      this.heuristicMaxGreenScore = 0;
    }

    // Decorative images on desktop
    if (isDesktop) {
      const imageOffset = 130;
      this.staticTree = this.add.image(startX - imageOffset, startY + gridHeight / 2, 'tree')
        .setDisplaySize(100, 100);
      this.staticTractor = this.add.image(startX + gridWidth + imageOffset, startY + gridHeight / 2, 'tractor')
        .setDisplaySize(100, 100);
    }

    // If AI goes first
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
    if (window.innerWidth >= 1024) {
      this.turnText.setText(`Current Turn: ${displayTeam}`);
      this.turnText.setFill(this.currentPlayer === 'green' ? '#228B22' : '#654321');
    } else {
      this.turnText.setText(`Turn: ${displayTeam}`);
      this.turnText.setFill(this.currentPlayer === 'green' ? '#228B22' : '#654321');
    }
  }

  update() {
    // no continuous update needed
  }
}

/**
 * Show final results.
 * - Desktop (>=1024): same as before (green rectangle below the grid, text metrics).
 * - Mobile (<1024): a DOM overlay with final stats + "Play Again" + "Start Over".
 */
export function displayFinalResults(scene) {
  // Gather final stats
  const userTeam     = scene.userOptions.userTeam || 'farmer';
  const optimalSW    = calculateOptimalSocialWelfare(scene.grid);
  const actualSW     = calculateActualSocialWelfare(scene.grid);
  const welfareLoss  = calculateSocialWelfareDifference(actualSW, optimalSW);

  let additionalityVal = 'N/A';
  if (userTeam === 'green') {
    const greenClaimedTotal = calculateGreenClaimedTotal(scene.grid);
    additionalityVal = calculateAdditionality(greenClaimedTotal, scene.greenBAU).toString();
  }

  let greenSuccessFraction = null;
  if (userTeam === 'green' && scene.heuristicMaxGreenScore > 0) {
    greenSuccessFraction = (scene.greenScore / scene.heuristicMaxGreenScore) * 100;
  }

  // 1) Mobile => approach A overlay
  if (window.innerWidth < 1024) {
    // Create an overlay <div>
    const overlay = document.createElement('div');
    overlay.style.position        = 'absolute';
    overlay.style.top             = '0';
    overlay.style.left            = '0';
    overlay.style.width           = '100%';
    overlay.style.height          = '100%';
    overlay.style.background      = '#6EA06E';
    overlay.style.color           = '#4D341A';
    overlay.style.display         = 'flex';
    overlay.style.flexDirection   = 'column';
    overlay.style.alignItems      = 'center';
    overlay.style.justifyContent  = 'center';
    overlay.style.fontFamily      = 'Arial, sans-serif';
    overlay.style.padding         = '20px';
    overlay.style.zIndex          = '9999';

    // Title
    const title = document.createElement('h1');
    title.textContent = 'Final Results';
    overlay.appendChild(title);

    // Results container
    const statsDiv = document.createElement('div');
    statsDiv.style.background    = '#EDE8E1';
    statsDiv.style.padding       = '20px';
    statsDiv.style.borderRadius  = '10px';
    statsDiv.style.color         = '#4D341A';
    statsDiv.style.maxWidth      = '350px';
    statsDiv.style.textAlign     = 'left';
    overlay.appendChild(statsDiv);

    const headingMetrics = document.createElement('h3');
    headingMetrics.textContent = 'Metrics';
    statsDiv.appendChild(headingMetrics);

    // Show same lines as desktop:
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

    // Buttons container
    const btnContainer = document.createElement('div');
    btnContainer.style.textAlign = 'center';
    btnContainer.style.marginTop = '20px';

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

    // PLAY AGAIN => restart the same scene
    const playAgainBtn = document.createElement('button');
    playAgainBtn.textContent = 'Play Again';
    playAgainBtn.style.cssText = btnStyle;
    playAgainBtn.onclick = () => {
      // Remove the overlay from the DOM
      overlay.remove();
      // Re-start the Phaser scene with same userOptions
      scene.scene.restart();
    };
    btnContainer.appendChild(playAgainBtn);

    // START OVER => go back to landing page
    const startOverBtn = document.createElement('button');
    startOverBtn.textContent = 'Start Over';
    startOverBtn.style.cssText = btnStyle;
    startOverBtn.onclick = () => {
      // Remove overlay
      overlay.remove();
      // Destroy Phaser
      scene.game.destroy(true, false);
      // Show landing page, hide game UI
      document.getElementById('game-ui').style.display = 'none';
      document.getElementById('landing-page').style.display = 'block';
    };
    btnContainer.appendChild(startOverBtn);

    statsDiv.appendChild(btnContainer);

    document.body.appendChild(overlay);

    // Disable scene input if you like:
    scene.input.enabled = false;

    return;
  }

  // 2) Desktop => original approach: draw green rectangle below grid, place text
  const lastRow  = scene.grid[scene.grid.length - 1];
  const gridBottom = lastRow[0].y + lastRow[0].height;
  const offset   = 50;
  const resultsY = gridBottom + offset;

  let bg = scene.add.rectangle(
    scene.cameras.main.centerX, 
    resultsY,
    850,
    290,
    0x6EA06E, 
    0.7
  );
  bg.setOrigin(0.5, 0);

  const leftColX  = bg.x - 390;
  const rightColX = bg.x + 100;
  scene.add.text(leftColX, bg.y + 20, 'Final Metrics:', 
    { font: '32px Arial', fill: '#4D341A' });

  const colStartY = bg.y + 80;
  const lineH     = 40;

  scene.add.text(leftColX, colStartY,
    `Green Conservation Score: ${scene.greenScore}`,
    { font: '28px Arial', fill: '#4D341A' }
  );
  scene.add.text(leftColX + 20, colStartY + lineH,
    `Pure Strategy: ${scene.greenPureScore}`,
    { font: '24px Arial', fill: '#4D341A' }
  );
  scene.add.text(leftColX + 20, colStartY + 2*lineH,
    `Displacement: ${scene.greenDisplacementScore}`,
    { font: '24px Arial', fill: '#4D341A' }
  );
  scene.add.text(leftColX, colStartY + 3*lineH,
    `Additionality: ${additionalityVal}`,
    { font: '28px Arial', fill: '#4D341A' }
  );

  scene.add.text(rightColX, bg.y + 20, 'Performance:',
    { font: '32px Arial', fill: '#4D341A' }
  );
  scene.add.text(rightColX, colStartY,
    `Welfare Loss: ${welfareLoss.toFixed(2)}%`,
    { font: '28px Arial', fill: '#4D341A' }
  );
  if (userTeam === 'green' && scene.heuristicMaxGreenScore > 0) {
    const fraction = (scene.greenScore / scene.heuristicMaxGreenScore) * 100;
    scene.add.text(rightColX, colStartY + lineH,
      `Green Success: ${fraction.toFixed(1)}%`,
      { font: '28px Arial', fill: '#4D341A' }
    );
  }

  scene.input.enabled = true;

  let playAgainBtn = scene.add.text(
    bg.x - 150, 
    bg.y + 340,
    'Play Again',
    { font: '28px Arial', fill: '#ffffff', backgroundColor: '#228B22', padding: { x:10, y:5 } }
  ).setInteractive();
  playAgainBtn.setDepth(100);
  playAgainBtn.on('pointerdown', () => {
    scene.scene.restart();
  });

  let exitBtn = scene.add.text(
    bg.x + 50, 
    bg.y + 340,
    'End & Exit',
    { font: '28px Arial', fill: '#ffffff', backgroundColor: '#228B22', padding: { x:10, y:5 } }
  ).setInteractive();
  exitBtn.setDepth(100);
  exitBtn.on('pointerdown', () => {
    window.location.reload();
  });
}

/**
 * Start the Phaser game
 */
export function startPhaserGame(userOptions) {
  const { gridSize } = userOptions;
  const dims = computeGameDimensions(gridSize);
  const { gameWidth, gameHeight } = dims;

  const config = {
    type: Phaser.AUTO,
    width: gameWidth,
    height: gameHeight,
    scene: [ MyScene ],
    parent: 'game-container'
  };

  const game = new Phaser.Game(config);
  game.scene.start('MyScene', { ...userOptions });
}
