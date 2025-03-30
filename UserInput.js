import { startPhaserGame } from './main.js';

const uiContainer = document.getElementById('ui-container');

function buildUI() {
  // ================================================
  // 1) Container styling: fixed height, vertical flex
  // ================================================
  uiContainer.style.width            = '250px';
  uiContainer.style.height           = '480px';   // or 400px, 500px, etc.
  uiContainer.style.fontSize         = '16px';
  uiContainer.style.padding          = '10px';

  // Use a vertical Flex layout. We'll place inputs at the top,
  // and push the button to the bottom so there's no huge blank space in the middle
  uiContainer.style.display          = 'flex';
  uiContainer.style.flexDirection    = 'column';
  uiContainer.style.alignItems       = 'stretch'; // inputs + button stretch horizontally
  // no 'justifyContent: space-between' so we don't stretch the middle region

  // If you want small spacing between elements:
  uiContainer.style.gap = '8px';

  // ================================================
  // 2) A sub-container for all the fields
  // ================================================
  // We'll keep the fields together at the top
  const fieldsContainer = document.createElement('div');
  fieldsContainer.style.display       = 'flex';
  fieldsContainer.style.flexDirection = 'column';
  fieldsContainer.style.alignItems    = 'flex-start'; 
  fieldsContainer.style.gap           = '8px';
  uiContainer.appendChild(fieldsContainer);

  // Everything below goes into fieldsContainer
  const heading = document.createElement('h3');
  heading.innerText = 'Game Setup';
  fieldsContainer.appendChild(heading);

  // (1) Human side
  const sideLabel = document.createElement('label');
  sideLabel.innerText = 'Which side do you want to play? ';
  fieldsContainer.appendChild(sideLabel);
  const sideSelect = document.createElement('select');
  sideSelect.id = 'humanSide';
  ['farmer', 'green'].forEach(side => {
    const opt = document.createElement('option');
    opt.value = side;
    opt.textContent = side.charAt(0).toUpperCase() + side.slice(1);
    sideSelect.appendChild(opt);
  });
  sideSelect.value = 'green';
  fieldsContainer.appendChild(sideSelect);

  // (2) Computer strategy
  const compStratLabel = document.createElement('label');
  compStratLabel.innerText = 'Computer Strategy: ';
  fieldsContainer.appendChild(compStratLabel);
  const compStratSelect = document.createElement('select');
  compStratSelect.id = 'computerStrategy';
  fieldsContainer.appendChild(compStratSelect);

  // (3) Correlation
  const corrLabel = document.createElement('label');
  corrLabel.innerText = 'Correlation (-1 to 1): ';
  fieldsContainer.appendChild(corrLabel);
  const corrInput = document.createElement('input');
  corrInput.id = 'correlation';
  corrInput.type = 'number';
  corrInput.step = '0.1';
  corrInput.min = '-1';
  corrInput.max = '1';
  corrInput.value = '0';
  fieldsContainer.appendChild(corrInput);

  // (4) Leakage
  const leakLabel = document.createElement('label');
  leakLabel.innerText = 'Leakage: ';
  fieldsContainer.appendChild(leakLabel);
  const leakSelect = document.createElement('select');
  leakSelect.id = 'leakage';
  ['1','0.5','0'].forEach(val => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    leakSelect.appendChild(opt);
  });
  leakSelect.value = '1';
  fieldsContainer.appendChild(leakSelect);

  // (5) Grid size
  const gridSizeLabel = document.createElement('label');
  gridSizeLabel.innerText = 'Grid Size (4,6,8,10): ';
  fieldsContainer.appendChild(gridSizeLabel);
  const gridSizeSelect = document.createElement('select');
  gridSizeSelect.id = 'gridSize';
  [4, 6, 8, 10].forEach(size => {
    const opt = document.createElement('option');
    opt.value = size;
    opt.textContent = size + ' x ' + size;
    gridSizeSelect.appendChild(opt);
  });
  fieldsContainer.appendChild(gridSizeSelect);

  // (6) Farmer Claims
  const fClaimsLabel = document.createElement('label');
  fClaimsLabel.innerText = 'Farmer Claims: ';
  fieldsContainer.appendChild(fClaimsLabel);
  const fClaimsSelect = document.createElement('select');
  fClaimsSelect.id = 'farmerClaims';
  fieldsContainer.appendChild(fClaimsSelect);

  // (7) Green Claims display (read-only)
  const gClaimsLabel = document.createElement('label');
  gClaimsLabel.innerText = 'Green Claims: ';
  fieldsContainer.appendChild(gClaimsLabel);
  const gClaimsDisplay = document.createElement('input');
  gClaimsDisplay.id = 'greenClaims';
  gClaimsDisplay.type = 'number';
  gClaimsDisplay.disabled = true;
  fieldsContainer.appendChild(gClaimsDisplay);

  // Update claims function
  function updateClaimOptions() {
    const gs = parseInt(gridSizeSelect.value, 10);
    const totalCells = gs * gs;
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
  fClaimsSelect.onchange  = () => {
    const gs = parseInt(gridSizeSelect.value, 10);
    const totalCells = gs * gs;
    gClaimsDisplay.value = totalCells - parseInt(fClaimsSelect.value, 10);
  };
  updateClaimOptions();

  // Computer strategy depends on side
  function updateStrategyOptions() {
    const humanSide = sideSelect.value;
    compStratSelect.innerHTML = '';
    if (humanSide === 'green') {
      // Farmer is AI
      ['naive profit maximizer', 'strategic profit maximizer'].forEach(strat => {
        let opt = document.createElement('option');
        opt.value = strat;
        opt.textContent = strat;
        compStratSelect.appendChild(opt);
      });
    } else {
      // Green is AI
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

  // ================================================
  // 3) The "Start Game" button: pinned at bottom
  // ================================================
  const startBtn = document.createElement('button');
  startBtn.innerText = 'Start Game';

  // Make it bigger, green outline, etc.
  startBtn.style.fontSize       = '1em';
  startBtn.style.padding        = '6px 12px';
  startBtn.style.border         = '7px solid #5C4033';  // dark brown outline
  startBtn.style.borderRadius   = '8px';
  startBtn.style.backgroundColor= '#228B22';               // green fill
  startBtn.style.color          = '#ffff';            // white text
  startBtn.style.cursor         = 'pointer';

  // marginTop = 'auto' pushes the button down within the flex container
  startBtn.style.marginTop      = 'auto';  

  startBtn.onclick = () => {
    const userTeam         = sideSelect.value;
    const computerStrategy = compStratSelect.value;
    const correlation      = corrInput.value;
    const leakage          = leakSelect.value;
    const farmerClaims     = fClaimsSelect.value;
    const greenClaims      = gClaimsDisplay.value;
    const gridSize         = gridSizeSelect.value;

    uiContainer.style.display = 'none';
    document.getElementById('terrain-wrapper').style.display = 'none';

    startPhaserGame({
      userTeam,
      computerStrategy,
      correlation,
      leakage,
      farmerClaims,
      greenClaims,
      gridSize
    });
  };

  // Finally, add the button to the container
  uiContainer.appendChild(startBtn);
}

buildUI();
