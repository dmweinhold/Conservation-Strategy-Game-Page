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
 * Compute dimensions for the "game" layout.
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

class MyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MyScene' });
  }

  init(data) {
    this.userOptions = data || {};
  }

  preload() {
    // Load images
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
      this.leakage = 1.0;  // Always 1 if user is farmer
    } else {
      this.computerTeam = 'farmer';
      this.computerStrategy = computerStrategy;
      this.leakage = requestedLeak;
    }

    // Background color
    this.cameras.main.setBackgroundColor(0xEDE8E1);

    // Initialize scores/claims
    this.greenScore = 0;
    this.farmerScore = 0;
    // We'll track "pure" vs. "displacement" for Greens
    this.greenPureScore = 0;
    this.greenDisplacementScore = 0;

    this.availFarmerClaims = farmerClaims;
    this.availGreenClaims = greenClaims;
    this.cumGreenBAU = 0;
    this.cumFarmerDeduction = 0;

    // Compute "game" dimensions
    const dims = computeGameDimensions(gridSize);
    const { gameWidth, gameHeight, gridWidth, gridHeight, cellSize } = dims;
    this.gameWidth = gameWidth;
    this.gameHeight = gameHeight;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.cellSize = cellSize;

    // Position the grid
    const isMobile = window.innerWidth < 768;
    let startX = (gameWidth - gridWidth) / 2;
    let startY = isMobile ? 80 : 120;

    // ---------- Scoreboard Text ----------
    if (isMobile) {
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
    // -------------------------------------

    // Create the grid
    const gridConfig = {
      gridSize,
      cellSize,
      margin: 5,
      startX,
      startY,
      // Hard-coded 0 => no 'unsuitable for agriculture'
      unsuitableProportion: 0,
      correlation: correlationVal,
      maxValue: 20,
      BAUSet: []
    };
    this.grid = createGrid(this, gridConfig);

    // If computer is farmer, define BAU
    if (this.computerTeam === 'farmer') {
      const farmerBAUSet = calculateFarmerBAUSet(this.grid, farmerClaims, this.computerStrategy, greenClaims);
      farmerBAUSet.forEach(coord => {
        this.grid[coord.row][coord.col].cellData.isBAU = true;
      });
      this.greenBAU = calculateGreenBAUScore(this.grid, farmerBAUSet);
    } else {
      this.greenBAU = 0;
    }

    // If user is green, pre-calc heuristic
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
 * Completely destroys the Phaser game and replaces the entire page with a 
 * brand-new "results" page in plain HTML/JS, now also showing "pure" and 
 * "displacement" (if the user is Green).
 */
// ✅ Final updated displayFinalResults function with left-aligned subheadings
export function displayFinalResults(scene) {
  const optimalSW = calculateOptimalSocialWelfare(scene.grid);
  const actualSW = calculateActualSocialWelfare(scene.grid);
  const welfareLoss = calculateSocialWelfareDifference(actualSW, optimalSW);

  let additionalityVal = 'N/A';
  if (scene.userOptions.userTeam === 'green') {
    const greenClaimedTotal = calculateGreenClaimedTotal(scene.grid);
    additionalityVal = calculateAdditionality(greenClaimedTotal, scene.greenBAU).toString();
  }

  let greenSuccessFraction = null;
  if (scene.userOptions.userTeam === 'green' && scene.heuristicMaxGreenScore > 0) {
    greenSuccessFraction = (scene.greenScore / scene.heuristicMaxGreenScore) * 100;
  }

  const phaserGame = scene.game;
  phaserGame.destroy(true, false);

  document.body.innerHTML = '';

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.background = '#6EA06E';
  container.style.color = '#4D341A';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.fontFamily = 'Arial, sans-serif';
  container.style.padding = '10px';

  const title = document.createElement('h1');
  title.textContent = 'Final Results';
  container.appendChild(title);

  const statsArea = document.createElement('div');
  statsArea.style.fontSize = '1.2em';
  statsArea.style.textAlign = 'left';
  statsArea.style.margin = '20px';
  statsArea.style.width = '320px';
  statsArea.style.padding = '10px';

  const metricsHeading = document.createElement('div');
  metricsHeading.textContent = 'Metrics';
  metricsHeading.style.fontSize = '1.4em';
  metricsHeading.style.marginTop = '20px';
  metricsHeading.style.fontWeight = 'bold';
  metricsHeading.style.textAlign = 'left';
  statsArea.appendChild(metricsHeading);

  const greenScoreLine = document.createElement('p');
  greenScoreLine.textContent = `Green Score: ${scene.greenScore}`;
  statsArea.appendChild(greenScoreLine);

  const pureLine = document.createElement('p');
  pureLine.textContent = `  Pure Strategy: ${scene.greenPureScore}`;
  pureLine.style.marginLeft = '25px';
  statsArea.appendChild(pureLine);

  const dispLine = document.createElement('p');
  dispLine.textContent = `  Displacement: ${scene.greenDisplacementScore}`;
  dispLine.style.marginLeft = '25px';
  statsArea.appendChild(dispLine);

  if (scene.userOptions.userTeam === 'green') {
    let addLine = document.createElement('p');
    addLine.textContent = `Additionality: ${additionalityVal}`;
    statsArea.appendChild(addLine);
  }

  const performanceHeading = document.createElement('div');
  performanceHeading.textContent = 'Performance';
  performanceHeading.style.fontSize = '1.4em';
  performanceHeading.style.marginTop = '20px';
  performanceHeading.style.fontWeight = 'bold';
  performanceHeading.style.textAlign = 'left';
  statsArea.appendChild(performanceHeading);

  let welfareLine = document.createElement('p');
  welfareLine.textContent = `Social Welfare Loss (%): ${welfareLoss.toFixed(2)}%`;
  statsArea.appendChild(welfareLine);

  if (greenSuccessFraction !== null) {
    let successLine = document.createElement('p');
    successLine.textContent = `Green Success (%): ${greenSuccessFraction.toFixed(1)}%`;
    statsArea.appendChild(successLine);
  }

  container.appendChild(statsArea);

  const btnStyle = `
    display: inline-block;
    margin: 10px;
    padding: 15px 25px;
    border: none;
    border-radius: 5px;
    background-color: #228B22;
    color: #ffffff;
    font-size: 1em;
    cursor: pointer;
  `;

  const buttonArea = document.createElement('div');

  const playAgainBtn = document.createElement('button');
  playAgainBtn.textContent = 'Play Again';
  playAgainBtn.style.cssText = btnStyle;
  playAgainBtn.onclick = () => {
    window.location.reload();
  };
  buttonArea.appendChild(playAgainBtn);

  const exitBtn = document.createElement('button');
  exitBtn.textContent = 'End & Exit';
  exitBtn.style.cssText = btnStyle;
  exitBtn.onclick = () => {
    window.location.href = 'about:blank';
  };
  buttonArea.appendChild(exitBtn);

  container.appendChild(buttonArea);
  document.body.appendChild(container);
}

/**
 * Start the Phaser game in "game" mode.
 */
export function startPhaserGame(userOptions) {
  const gridSize = parseInt(userOptions.gridSize, 10);
  const dims = computeGameDimensions(gridSize);
  const { gameWidth, gameHeight } = dims;

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
    ...userOptions
    // We don't strictly need to pass gameWidth, gameHeight, etc. 
    // because computeGameDimensions is re-run in create().
  });
}
