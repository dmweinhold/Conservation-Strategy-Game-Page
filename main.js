// main.js

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
 * A single scene for the main game. 
 * All references to device/desktop differences have been removed—Phaser will scale for us.
 */
class MyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MyScene' });
  }

  init(data) {
    // Data from startPhaserGame()
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

    // Set defaults if not provided
    this.currentPlayer   = 'farmer'; // Farmer goes first
    userTeam            = userTeam || 'farmer';
    computerStrategy    = computerStrategy || 'naive profit maximizer';
    let corrVal         = parseFloat(correlation) || 0;
    this.leakage        = parseFloat(leakage) || 0.5;
    farmerClaims        = parseInt(farmerClaims, 10) || 8;
    greenClaims         = parseInt(greenClaims, 10) || 8;
    gridSize            = parseInt(gridSize, 10);
    if (![4,6,8,10].includes(gridSize)) {
      gridSize = 4;
    }

    // Decide AI side
    if (userTeam === 'farmer') {
      this.computerTeam    = 'green';
      this.computerStrategy= computerStrategy;
      // If user is farmer, we override leakage to 1 (no partial offset)
      this.leakage = 1.0;
    } else {
      this.computerTeam    = 'farmer';
      this.computerStrategy= computerStrategy;
    }

    // Set background
    this.cameras.main.setBackgroundColor(0xEDE8E1);

    // Score / claim tracking
    this.greenScore             = 0;
    this.farmerScore            = 0;
    this.greenPureScore         = 0;
    this.greenDisplacementScore = 0;
    this.availFarmerClaims      = farmerClaims;
    this.availGreenClaims       = greenClaims;
    this.cumGreenBAU            = 0;
    this.cumFarmerDeduction     = 0;

    // Pre-calc if Farmer is AI => define BAU
    if (this.computerTeam === 'farmer') {
      const farmerBAUSet = calculateFarmerBAUSet([], farmerClaims, this.computerStrategy, greenClaims);
      // We'll set the actual BAU flags below, after the grid is created
      this.precomputedFarmerBAU = farmerBAUSet;
    } else {
      this.precomputedFarmerBAU = null;
    }

    // If user is green => compute a heuristic best possible green
    if (userTeam === 'green') {
      this.computeHeuristicAfterGrid = true; 
    } else {
      this.heuristicMaxGreenScore = 0;
      this.computeHeuristicAfterGrid = false;
    }

    // Place scoreboard near the top
    // Because our virtual size is (800x1200), pick x/y coordinates that fit nicely
    this.greenScoreText = this.add.text(
      50, 20,
      'Green: 0',
      { font: '32px Arial', fill: '#228B22' }
    );

    this.farmerScoreText = this.add.text(
      400, 20,
      'Farmer: 0',
      { font: '32px Arial', fill: '#654321' }
    );

    this.turnText = this.add.text(
      700, 20,
      `Turn: ${this.currentPlayer}`,
      { font: '28px Arial', fill: '#000000' }
    ).setOrigin(1, 0);

    // We'll create the grid below the scoreboard area
    // The scoreboard is ~60 px tall, so let's start at y=80 or so
    const startX = 50;
    const startY = 80;
    const maxGridWidth = 700; // we have 800 total, minus side margins
    const margin = 5;

    // We'll choose a cell size so the grid fits in about 700px wide
    const cellSize = Math.floor((maxGridWidth - margin*(gridSize-1)) / gridSize);

    // Create the grid
    const gridConfig = {
      gridSize,
      cellSize,
      margin,
      startX,
      startY,
      correlation: corrVal,
      BAUSet: [], // we will update later if precomputedFarmerBAU
      maxValue: 20
    };
    this.grid = createGrid(this, gridConfig);

    // Mark BAU if the AI was farmer
    if (this.precomputedFarmerBAU) {
      // Now that the grid is built, let's recalc the actual farmerBAUSet 
      // with real cell data (the earlier call was a placeholder).
      // Or we can compute it fresh using the grid + strategy function:
      const realFarmerBAU = calculateFarmerBAUSet(
        this.grid, 
        farmerClaims, 
        this.computerStrategy, 
        greenClaims
      );
      realFarmerBAU.forEach(({ row, col }) => {
        this.grid[row][col].cellData.isBAU = true;
      });
      // Then compute greenBAU
      this.greenBAU = calculateGreenBAUScore(this.grid, realFarmerBAU);
    } else {
      this.greenBAU = 0;
    }

    // If user is green, compute heuristicMaxGreenScore
    if (this.computeHeuristicAfterGrid) {
      this.heuristicMaxGreenScore = calculateHeuristicMaxGreenScore(
        this.grid,
        greenClaims,
        farmerClaims,
        this.leakage
      );
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
    this.turnText.setText(`Turn: ${displayTeam}`);
    this.turnText.setFill(this.currentPlayer === 'green' ? '#228B22' : '#654321');
  }

}

/**
 * Show final results in a universal HTML overlay (for ALL devices).
 */
export function displayFinalResults(scene) {
  // Gather final stats
  const userTeam = scene.userOptions.userTeam || 'farmer';
  const optimalSW = calculateOptimalSocialWelfare(scene.grid);
  const actualSW  = calculateActualSocialWelfare(scene.grid);
  const welfareLoss = calculateSocialWelfareDifference(actualSW, optimalSW);

  let additionalityVal = 'N/A';
  if (userTeam === 'green') {
    const greenClaimedTotal = calculateGreenClaimedTotal(scene.grid);
    additionalityVal = calculateAdditionality(greenClaimedTotal, scene.greenBAU).toString();
  }

  let greenSuccessFraction = null;
  if (userTeam === 'green' && scene.heuristicMaxGreenScore > 0) {
    greenSuccessFraction = (scene.greenScore / scene.heuristicMaxGreenScore) * 100;
  }

  // Create an overlay <div>
  const overlay = document.createElement('div');
  overlay.style.position        = 'fixed';
  overlay.style.top             = '0';
  overlay.style.left            = '0';
  overlay.style.width           = '100%';
  overlay.style.height          = '100%';
  overlay.style.backgroundColor = 'rgba(110, 160, 110, 0.95)';
  overlay.style.zIndex          = '9999';
  overlay.style.overflowY       = 'auto';
  overlay.style.display         = 'flex';
  overlay.style.flexDirection   = 'column';
  overlay.style.alignItems      = 'center';
  overlay.style.justifyContent  = 'center';
  overlay.style.fontFamily      = 'Arial, sans-serif';
  overlay.style.padding         = '20px';

  // Build HTML content
  const container = document.createElement('div');
  container.style.maxWidth        = '400px';
  container.style.backgroundColor = '#EDE8E1';
  container.style.padding         = '20px';
  container.style.borderRadius    = '10px';
  container.style.color           = '#4D341A';

  const title = document.createElement('h1');
  title.textContent = 'Final Results';
  container.appendChild(title);

  // Show final metrics
  let gScore = document.createElement('p');
  gScore.textContent = `Green Score: ${scene.greenScore}`;
  container.appendChild(gScore);

  let pScore = document.createElement('p');
  pScore.textContent = `Farmer Score: ${scene.farmerScore}`;
  container.appendChild(pScore);

  if (userTeam === 'green') {
    let addLine = document.createElement('p');
    addLine.textContent = `Additionality: ${additionalityVal}`;
    container.appendChild(addLine);
  }

  let swLoss = document.createElement('p');
  swLoss.textContent = `Social Welfare Loss: ${welfareLoss.toFixed(2)}%`;
  container.appendChild(swLoss);

  if (greenSuccessFraction !== null) {
    let gsf = document.createElement('p');
    gsf.textContent = `Green Success: ${greenSuccessFraction.toFixed(1)}%`;
    container.appendChild(gsf);
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

  // Play Again
  const playAgainBtn = document.createElement('button');
  playAgainBtn.textContent = 'Play Again';
  playAgainBtn.style.cssText = btnStyle;
  playAgainBtn.onclick = () => {
    overlay.remove();
    // Re-start the Phaser scene with same userOptions
    scene.scene.restart();
  };
  btnContainer.appendChild(playAgainBtn);

  // Start Over
  const startOverBtn = document.createElement('button');
  startOverBtn.textContent = 'Start Over';
  startOverBtn.style.cssText = btnStyle;
  startOverBtn.onclick = () => {
    overlay.remove();
    scene.game.destroy(true, false);
    document.getElementById('game-ui').style.display = 'none';
    document.getElementById('landing-page').style.display = 'block';
  };
  btnContainer.appendChild(startOverBtn);

  container.appendChild(btnContainer);
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  // Disable scene input
  scene.input.enabled = false;
}

/**
 * Start the Phaser game.
 */
export function startPhaserGame(userOptions) {
  // Create (or reuse) a Phaser game with scaling
  const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 800,   // "virtual" width
    height: 1200, // "virtual" height
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [ MyScene ]
  };

  const game = new Phaser.Game(config);
  game.scene.start('MyScene', { ...userOptions });
}
