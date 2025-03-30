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
    let gameW, gameH;
    if (isLandscape) {
      gameW = 1100;
      gameH = 600;
    } else {
      gameW = 600;
      gameH = 900;
    }

    // We'll use our chosen dimensions:
    const gameWidth  = gameW;
    const gameHeight = gameH;

    // Define paddings for portrait vs. landscape
    let topPaddingForUI, bottomPaddingForUI, sidePadding;
    if (isLandscape) {
      topPaddingForUI    = 50;
      bottomPaddingForUI = 50;
      sidePadding        = 150;
    } else {
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
    const maxCellSizeByWidth  = (availableWidth  - margin * (gridSize - 1)) / gridSize;
    const maxCellSizeByHeight = (availableHeight - margin * (gridSize - 1)) / gridSize;
    const cellSize = Math.floor(Math.min(maxCellSizeByWidth, maxCellSizeByHeight));

    const gridWidth  = gridSize * cellSize + margin * (gridSize - 1);
    const gridHeight = gridSize * cellSize + margin * (gridSize - 1);

    // Center the grid horizontally & position it at topPadding
    const startX = (gameWidth - gridWidth) / 2;
    const startY = topPaddingForUI;

    // --------------------------------------------------
    // 5) Place scoreboard text
    // --------------------------------------------------
    const scoreFontSize = Math.max(18, Math.floor(cellSize * 0.3));
    const smallFontSize = Math.max(16, Math.floor(cellSize * 0.25));
    const turnFontSize  = Math.max(20, Math.floor(cellSize * 0.3));

    if (isLandscape) {
      // LANDSCAPE: scoreboard left & right, turn text on top
      this.turnText = this.add.text(
        gameWidth / 2,
        5,
        `Turn: ${this.currentPlayer}`,
        { font: `${turnFontSize}px Arial`, fill: '#000000' }
      ).setOrigin(0.5, 0);

      // Green scoreboard on the left
      this.greenScoreText = this.add.text(
        sidePadding - 50,
        50,
        `Greens: ${this.greenScore}`,
        { font: `${scoreFontSize}px Arial`, fill: '#228B22' }
      );
      this.greenClaimsText = this.add.text(
        sidePadding - 50,
        50 + scoreFontSize,
        `Claims: ${this.availGreenClaims}`,
        { font: `${smallFontSize}px Arial`, fill: '#228B22' }
      );

      // Farmer scoreboard on the right
      this.farmerScoreText = this.add.text(
        gameWidth - sidePadding + 70,
        50,
        `Farmers: ${this.farmerScore}`,
        { font: `${scoreFontSize}px Arial`, fill: '#654321' }
      ).setOrigin(1, 0);
      this.farmerClaimsText = this.add.text(
        gameWidth - sidePadding + 20,
        50 + scoreFontSize,
        `Claims: ${this.availFarmerClaims}`,
        { font: `${smallFontSize}px Arial`, fill: '#654321' }
      ).setOrigin(1, 0);
    } else {
      // PORTRAIT: scoreboard near top
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

/****************************************************
 * displayFinalResults
 * Creates a full-screen HTML overlay that shows:
 *   1) Plain vanilla stats (left side)
 *   2) A color-coded 6x6 chart + star (right side)
 *   3) A short summary narrative from summary-lookup.json
 *   4) Two buttons: "Play Again" and "Start Over"
 ****************************************************/
export function displayFinalResults(scene) {
  // 1) Orientation check
  const isLandscape = window.innerWidth > window.innerHeight;

  // --- Helper: getCategoryIndices ---
  function getCategoryIndices(greenSuccessPct, welfareLossPct) {
    let greenIndex;
    if (greenSuccessPct < 70)      greenIndex = 0;
    else if (greenSuccessPct < 80) greenIndex = 1;
    else if (greenSuccessPct < 90) greenIndex = 2;
    else if (greenSuccessPct < 95) greenIndex = 3;
    else if (greenSuccessPct < 98) greenIndex = 4;
    else                           greenIndex = 5;

    let welfareIndex;
    if (welfareLossPct > 30)       welfareIndex = 0;
    else if (welfareLossPct > 20)  welfareIndex = 1;
    else if (welfareLossPct > 10)  welfareIndex = 2;
    else if (welfareLossPct > 5)   welfareIndex = 3;
    else if (welfareLossPct > 2)   welfareIndex = 4;
    else                           welfareIndex = 5;

    return { greenIndex, welfareIndex };
  }

  // --- Helper: getSummaryText ---
  function getSummaryText(greenIndex, welfareIndex) {
    const summaryData = JSON.parse(
      document.getElementById('summary-lookup-json').textContent
    );
    const conservationLabels = [
      "Ecocidal", "Biophobe", "Guardian",
      "Advocate", "Steward", "Eco-Champion"
    ];
    const welfareLabels = [
      "Welfare Wreckage",
      "Wasted Opportunity",
      "Loose Planning",
      "Solid Strategy",
      "Allocative Success",
      "Efficiency Maestro"
    ];
    const greenLabel   = conservationLabels[greenIndex];
    const welfareLabel = welfareLabels[welfareIndex];
    const narrative    = summaryData[greenLabel][welfareLabel];
    return { greenLabel, welfareLabel, narrative };
  }

  // --- Helper: drawResultsGraphicOnCanvas ---
  function drawResultsGraphicOnCanvas(canvas, greenIndex, welfareIndex) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const tickLabelFont = "12px sans-serif";
    const axisLabelFont = "16px sans-serif";

    ctx.clearRect(0, 0, width, height);

    const marginLeft   = 150;
    const marginRight  = 40;
    const marginTop    = 20;
    const marginBottom = 40;
    const chartWidth  = width - (marginLeft + marginRight);
    const chartHeight = height - (marginTop + marginBottom);
    const chartSize   = Math.min(chartWidth, chartHeight);
    const cellSize    = chartSize / 6;
    const offsetX = marginLeft;
    const offsetY = marginTop;

    const quadrantColors = {
      topRight:    "#A3C585",
      topLeft:     "#8EC9E8",
      bottomRight: "#6EA06E",
      bottomLeft:  "#C89F9C"
    };

    // Draw 6x6 colored squares
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        let color;
        if (col < 3 && row < 3) {
          color = quadrantColors.bottomLeft;
        } else if (col >= 3 && row < 3) {
          color = quadrantColors.bottomRight;
        } else if (col < 3 && row >= 3) {
          color = quadrantColors.topLeft;
        } else {
          color = quadrantColors.topRight;
        }
        ctx.fillStyle = color;
        const drawX = offsetX + col * cellSize;
        const drawY = offsetY + (5 - row) * cellSize;
        ctx.fillRect(drawX, drawY, cellSize, cellSize);
      }
    }

    // Draw star
    const starX = offsetX + (greenIndex + 0.5) * cellSize;
    const starY = offsetY + (5 - welfareIndex + 0.5) * cellSize;
    drawStar(ctx, starX, starY, 5, cellSize * 0.4, cellSize * 0.2, '#ff0000');

    // Axis tick labels
    const conservationLabels = [
      "Ecocidal", "Biophobe", "Guardian",
      "Advocate", "Steward", "Eco-Champion"
    ];
    const welfareLabels = [
      "Welfare Wreckage",
      "Wasted Opportunity",
      "Loose Planning",
      "Solid Strategy",
      "Allocative Success",
      "Efficiency Maestro"
    ];

    ctx.fillStyle   = "#000";
    ctx.font = tickLabelFont;
    ctx.textAlign   = 'center';
    ctx.textBaseline= 'middle';

    // Bottom axis (conservation)
    for (let col = 0; col < 6; col++) {
      const label = conservationLabels[col];
      const labelX = offsetX + (col + 0.5) * cellSize;
      const labelY = offsetY + chartSize + 5;
      ctx.save();
      ctx.translate(labelX, labelY);
      ctx.rotate(-60 * Math.PI / 180);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = tickLabelFont;
      if (label === "Eco-Champion") {
        // multi-line for "Eco-Champion"
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText("Eco-", -48, -8);
        ctx.fillText("Champion", -48, 4);
      } else {
        ctx.fillText(label, 0, 0);
      }
      ctx.restore();
    }

    // Left axis (welfare)
    for (let row = 0; row < 6; row++) {
      const label = welfareLabels[row];
      const labelX = offsetX - 10;
      const labelY = offsetY + (5 - row + 0.5) * cellSize;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, labelX, labelY);
    }

    // Axis labels
    const axisLabelX = offsetX + (chartSize / 2);
    const axisLabelY = offsetY + chartSize + 60;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.translate(axisLabelX, axisLabelY);
    ctx.font = axisLabelFont;
    ctx.fillText("Conservation", 0, 0);
    ctx.restore();

    const axisLabelLeftX = offsetX - 140;
    const axisLabelLeftY = offsetY + (chartSize / 2);
    ctx.save();
    ctx.translate(axisLabelLeftX, axisLabelLeftY);
    ctx.rotate(-90 * Math.PI / 180);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = axisLabelFont;
    ctx.fillText("Social Welfare", 0, 0);
    ctx.restore();

    // Star-drawing helper
    function drawStar(ctx, centerX, centerY, spikes, outerRadius, innerRadius, color) {
      ctx.save();
      ctx.beginPath();
      ctx.translate(centerX, centerY);
      ctx.moveTo(0, -outerRadius);
      for (let i = 0; i < spikes; i++) {
        ctx.rotate(Math.PI / spikes);
        ctx.lineTo(0, -innerRadius);
        ctx.rotate(Math.PI / spikes);
        ctx.lineTo(0, -outerRadius);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------------------------------------------------------
  // 0) Gather final stats from the scene
  // ---------------------------------------------------------
  const userTeam     = scene.userOptions.userTeam || 'farmer';
  const optimalSW    = calculateOptimalSocialWelfare(scene.grid);
  const actualSW     = calculateActualSocialWelfare(scene.grid);
  const welfareLoss  = calculateSocialWelfareDifference(actualSW, optimalSW);

  let greenSuccessFraction = null;
  if (userTeam === 'green' && scene.heuristicMaxGreenScore > 0) {
    greenSuccessFraction = (scene.greenScore / scene.heuristicMaxGreenScore) * 100;
  }

  let additionalityVal = 'N/A';
  if (userTeam === 'green') {
    const greenClaimedTotal = calculateGreenClaimedTotal(scene.grid);
    additionalityVal = calculateAdditionality(greenClaimedTotal, scene.greenBAU).toString();
  }

  // ---------------------------------------------------------
  // 1) Convert stats to 6×6 grid indices
  // ---------------------------------------------------------
  const gPct = greenSuccessFraction != null ? greenSuccessFraction : 0;
  const wPct = welfareLoss;
  const { greenIndex, welfareIndex } = getCategoryIndices(gPct, wPct);

  // ---------------------------------------------------------
  // 2) Retrieve summary text from JSON
  // ---------------------------------------------------------
  const { greenLabel, welfareLabel, narrative } = getSummaryText(greenIndex, welfareIndex);

  // ---------------------------------------------------------
  // 3) Build the full-screen HTML overlay
  // ---------------------------------------------------------
  const overlay = document.createElement('div');
  overlay.classList.add('final-overlay');
  overlay.style.position        = 'fixed';
  overlay.style.top             = '0';
  overlay.style.left            = '0';
  overlay.style.width           = '100%';
  overlay.style.height          = '100%';
  overlay.style.backgroundColor = '#EDE8E1';
  overlay.style.zIndex          = '9999';
  overlay.style.overflowY       = 'auto';
  overlay.style.display         = 'flex';
  overlay.style.flexDirection   = 'column';
  overlay.style.alignItems      = 'center';
  overlay.style.justifyContent  = 'flex-start';

  // Adjust top/bottom padding for overlay
  if (isLandscape) {
    overlay.style.padding = '20px'; 
  } else {
    overlay.style.padding = '5px 10px';
  }

  // --- Create stats container ---
  const statsContainer = document.createElement('div');
  statsContainer.style.backgroundColor = '#fff';
  statsContainer.style.border          = '1px solid #ccc';
  statsContainer.style.borderRadius    = '10px';

  // Different padding in portrait vs. landscape
  if (isLandscape) {
    statsContainer.style.padding = '20px';
    statsContainer.style.width   = '300px';
  } else {
    statsContainer.style.padding = '5px';
    statsContainer.style.width   = '45%'; 
  }

  // Title
  const title = document.createElement('h1');
  title.textContent = 'Final Results';
  statsContainer.appendChild(title);

  // Green Score
  const pGreen = document.createElement('p');
  pGreen.textContent = `Green Score: ${scene.greenScore}`;
  statsContainer.appendChild(pGreen);

  // Pure Strategy & Displacement
  const pPure = document.createElement('p');
  pPure.style.marginLeft = '25px';
  pPure.textContent = `  Pure Strategy: ${scene.greenPureScore}`;
  statsContainer.appendChild(pPure);

  const pDisp = document.createElement('p');
  pDisp.style.marginLeft = '25px';
  pDisp.textContent = `  Displacement: ${scene.greenDisplacementScore}`;
  statsContainer.appendChild(pDisp);

  if (userTeam === 'green') {
    const pAdd = document.createElement('p');
    pAdd.textContent = `Additionality: ${additionalityVal}`;
    statsContainer.appendChild(pAdd);
  }

  // Sub-heading: Performance
  const headingPerf = document.createElement('h3');
  headingPerf.textContent = 'Performance';
  statsContainer.appendChild(headingPerf);

  const pWelfare = document.createElement('p');
  pWelfare.textContent = `Social Welfare Loss: ${welfareLoss.toFixed(2)}%`;
  statsContainer.appendChild(pWelfare);

  if (greenSuccessFraction !== null) {
    const pGreenFrac = document.createElement('p');
    pGreenFrac.textContent = `Green Success: ${greenSuccessFraction.toFixed(1)}%`;
    statsContainer.appendChild(pGreenFrac);
  }

  // --- Create chart container ---
  const chartContainer = document.createElement('div');
  chartContainer.style.backgroundColor = '#fff';
  chartContainer.style.border          = '1px solid #ccc';
  chartContainer.style.borderRadius    = '10px';

  if (isLandscape) {
    chartContainer.style.padding = '20px';
    chartContainer.style.width   = '450px';
  } else {
    chartContainer.style.padding = '5px';
    chartContainer.style.width   = '88%'; 
  }

  // Canvas for the chart
  const chartCanvas = document.createElement('canvas');
  chartCanvas.width  = 400;
  chartCanvas.height = 330;
  chartContainer.appendChild(chartCanvas);

  // Draw the chart on the canvas
  drawResultsGraphicOnCanvas(chartCanvas, greenIndex, welfareIndex);

  // Summary heading and narrative
  const labelHeading = document.createElement('h3');
  labelHeading.textContent = `${greenLabel} & ${welfareLabel}`;
  chartContainer.appendChild(labelHeading);

  const pNarr = document.createElement('p');
  pNarr.textContent = narrative;
  chartContainer.appendChild(pNarr);

  // --- Create button container ---
  const btnContainer = document.createElement('div');
  btnContainer.style.marginTop       = '20px';
  if (!isLandscape) {
    // e.g. make it 10px or 5px in portrait
    chartContainer.style.paddingBottom = '1px';
    btnContainer.style.marginTop = '4px';
  }
  
  btnContainer.style.textAlign       = 'center';
  btnContainer.style.width           = '100%';
  btnContainer.style.display         = 'flex';
  btnContainer.style.justifyContent  = 'center';

  // Define a single btnStyle var in scope
  let btnStyle;
  if (isLandscape) {
    btnStyle = `
      margin: 10px;
      padding: 12px 20px;
      border: none;
      border-radius: 5px;
      background-color: #228B22;
      color: #ffffff;
      font-size: 1em;
      cursor: pointer;
    `;
  } else {
    btnStyle = `
      margin: 10px;
      padding: 6px 10px;
      border: none;
      border-radius: 5px;
      background-color: #228B22;
      color: #ffffff;
      font-size: 1em;
      cursor: pointer;
    `;
  }

  // "Play Again" button
  const playAgainBtn = document.createElement('button');
  playAgainBtn.textContent = 'Play Again';
  playAgainBtn.style.cssText = btnStyle;
  playAgainBtn.onclick = () => {
    document.querySelectorAll('.final-overlay').forEach(div => div.remove());
    scene.scene.restart();
    scene.input.enabled = true;
  };
  btnContainer.appendChild(playAgainBtn);

  // "Start Over" button
  const startOverBtn = document.createElement('button');
  startOverBtn.textContent = 'Start Over';
  startOverBtn.style.cssText = btnStyle;
  startOverBtn.onclick = () => {
    overlay.remove();
    scene.game.destroy(true, false);
    window.location.reload();
  };
  btnContainer.appendChild(startOverBtn);

  // --- Create a row container to hold the stats and chart side-by-side ---
  const rowContainer = document.createElement('div');
  rowContainer.style.display = 'flex';

  if (isLandscape) {
    // side-by-side
    rowContainer.style.flexDirection  = 'row';
    rowContainer.style.alignItems     = 'stretch';
    rowContainer.style.justifyContent = 'center';
    rowContainer.style.gap            = '20px';
  } else {
    // stacked
    rowContainer.style.flexDirection  = 'column';
    rowContainer.style.alignItems     = 'center';
    rowContainer.style.gap            = '10px';
  }

  rowContainer.appendChild(statsContainer);
  rowContainer.appendChild(chartContainer);

  // Append rowContainer and btnContainer to the overlay
  overlay.appendChild(rowContainer);
  overlay.appendChild(btnContainer);

  // --- Tighter font/spacing for portrait mode only ---
  if (!isLandscape) {
    [statsContainer, chartContainer].forEach(container => {
      container.querySelectorAll('h1, h2, h3, p').forEach(el => {
        el.style.fontSize     = '0.9em'; // or 0.85em, etc.
        el.style.lineHeight   = '1.2';
        el.style.marginTop    = '0.3em';
        el.style.marginBottom = '0.3em';
      });
    });
  }

  // Finally, add the overlay to the document body
  document.body.appendChild(overlay);

  // Disable input behind the overlay
  scene.input.enabled = false;
}

/**
 * Start the Phaser game with orientation-based default width/height.
 */
export function startPhaserGame(userOptions) {
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
  game.scene.start('MyScene', { ...userOptions });
}
