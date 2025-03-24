// UserInput.js
import { startPhaserGame } from './main.js';

const uiContainer = document.getElementById('ui-container');

function buildUI() {
  const isMobile = window.innerWidth < 768;
  uiContainer.style.width = isMobile ? '95%' : '300px';
  uiContainer.style.fontSize = isMobile ? '16px' : '16px';
  uiContainer.style.padding = isMobile ? '8px' : '10px';

  const heading = document.createElement('h3');
  heading.innerText = 'Game Setup';
  uiContainer.appendChild(heading);

  // 1) Human side
  const sideLabel = document.createElement('label');
  sideLabel.innerText = 'Which side do you want to play? ';
  uiContainer.appendChild(sideLabel);
  const sideSelect = document.createElement('select');
  sideSelect.id = 'humanSide';
  ['farmer', 'green'].forEach(side => {
    const opt = document.createElement('option');
    opt.value = side;
    opt.textContent = side.charAt(0).toUpperCase() + side.slice(1);
    sideSelect.appendChild(opt);
  });
  sideSelect.value = 'green';
  uiContainer.appendChild(sideSelect);
  uiContainer.appendChild(document.createElement('br'));
  uiContainer.appendChild(document.createElement('br'));

  // 2) Computer strategy
  const compStratLabel = document.createElement('label');
  compStratLabel.innerText = 'Computer Strategy: ';
  uiContainer.appendChild(compStratLabel);
  const compStratSelect = document.createElement('select');
  compStratSelect.id = 'computerStrategy';
  uiContainer.appendChild(compStratSelect);
  uiContainer.appendChild(document.createElement('br'));
  uiContainer.appendChild(document.createElement('br'));

  // 3) Correlation input
  const corrLabel = document.createElement('label');
  corrLabel.innerText = 'Correlation (-1 to 1): ';
  uiContainer.appendChild(corrLabel);
  const corrInput = document.createElement('input');
  corrInput.id = 'correlation';
  corrInput.type = 'number';
  corrInput.step = '0.1';
  corrInput.min = '-1';
  corrInput.max = '1';
  corrInput.value = '0';
  uiContainer.appendChild(corrInput);
  uiContainer.appendChild(document.createElement('br'));
  uiContainer.appendChild(document.createElement('br'));

  // 4) Leakage input
  const leakLabel = document.createElement('label');
  leakLabel.innerText = 'Leakage: ';
  uiContainer.appendChild(leakLabel);
  const leakSelect = document.createElement('select');
  leakSelect.id = 'leakage';
  ['1','0.5','0'].forEach(val => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    leakSelect.appendChild(opt);
  });
  leakSelect.value = '1';
  uiContainer.appendChild(leakSelect);
  uiContainer.appendChild(document.createElement('br'));
  uiContainer.appendChild(document.createElement('br'));

  // 5) Grid size dropdown
  const gridSizeLabel = document.createElement('label');
  gridSizeLabel.innerText = 'Grid Size (4,6,8,10): ';
  uiContainer.appendChild(gridSizeLabel);
  const gridSizeSelect = document.createElement('select');
  gridSizeSelect.id = 'gridSize';
  [4, 6, 8, 10].forEach(size => {
    const opt = document.createElement('option');
    opt.value = size;
    opt.textContent = size + ' x ' + size;
    gridSizeSelect.appendChild(opt);
  });
  uiContainer.appendChild(gridSizeSelect);
  uiContainer.appendChild(document.createElement('br'));
  uiContainer.appendChild(document.createElement('br'));

  // 6) Farmer Claims dropdown
  const fClaimsLabel = document.createElement('label');
  fClaimsLabel.innerText = 'Farmer Claims: ';
  uiContainer.appendChild(fClaimsLabel);
  const fClaimsSelect = document.createElement('select');
  fClaimsSelect.id = 'farmerClaims';
  uiContainer.appendChild(fClaimsSelect);
  uiContainer.appendChild(document.createElement('br'));
  uiContainer.appendChild(document.createElement('br'));

  // 7) Green Claims display (read-only)
  const gClaimsLabel = document.createElement('label');
  gClaimsLabel.innerText = 'Green Claims: ';
  uiContainer.appendChild(gClaimsLabel);
  const gClaimsDisplay = document.createElement('input');
  gClaimsDisplay.id = 'greenClaims';
  gClaimsDisplay.type = 'number';
  gClaimsDisplay.disabled = true;
  uiContainer.appendChild(gClaimsDisplay);
  uiContainer.appendChild(document.createElement('br'));
  uiContainer.appendChild(document.createElement('br'));

  function updateClaimOptions() {
    const gridSize = parseInt(gridSizeSelect.value, 10);
    const totalCells = gridSize * gridSize;
    fClaimsSelect.innerHTML = '';
    for (let i = 0; i <= totalCells; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = i;
      fClaimsSelect.appendChild(option);
    }
    fClaimsSelect.value = Math.floor(totalCells / 2);
    gClaimsDisplay.value = totalCells - parseInt(fClaimsSelect.value, 10);
  }
  gridSizeSelect.onchange = updateClaimOptions;
  fClaimsSelect.onchange = () => {
    const gridSize = parseInt(gridSizeSelect.value, 10);
    const totalCells = gridSize * gridSize;
    gClaimsDisplay.value = totalCells - parseInt(fClaimsSelect.value, 10);
  };
  updateClaimOptions();

  const startBtn = document.createElement('button');
  startBtn.innerText = 'Start Game';
  startBtn.onclick = () => {
    const userTeam = sideSelect.value;
    const computerStrategy = compStratSelect.value;
    const correlation = corrInput.value;
    const leakage = leakSelect.value;
    const farmerClaims = fClaimsSelect.value;
    const greenClaims = gClaimsDisplay.value;
    const gridSize = gridSizeSelect.value;
    uiContainer.style.display = 'none';
    document.getElementById('terrain-wrapper').style.display = 'none';
    startPhaserGame({ userTeam, computerStrategy, correlation, leakage, farmerClaims, greenClaims, gridSize });
  };
  uiContainer.appendChild(startBtn);

  function updateStrategyOptions() {
    const humanSide = sideSelect.value;
    compStratSelect.innerHTML = '';
    if (humanSide === 'green') {
      ['naive profit maximizer', 'strategic profit maximizer'].forEach(strat => {
        let opt = document.createElement('option');
        opt.value = strat;
        opt.textContent = strat;
        compStratSelect.appendChild(opt);
      });
    } else {
      ['maximize environmental score', 'block farmers', 'hot spot'].forEach(strat => {
        let opt = document.createElement('option');
        opt.value = strat;
        opt.textContent = strat;
        compStratSelect.appendChild(opt);
      });
    }
  }
  sideSelect.onchange = updateStrategyOptions;
  updateStrategyOptions();
}

buildUI();
