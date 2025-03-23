// UserInput.js
import { startPhaserGame } from './main.js';

const uiContainer = document.getElementById('ui-container');

function buildUI() {
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
// Set the default value to 'green'
sideSelect.value = 'green';

uiContainer.appendChild(sideSelect);


  uiContainer.appendChild(document.createElement('br'));
  uiContainer.appendChild(document.createElement('br'));

  // 2) Computer strategy (depends on which side the user chooses)
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
  corrInput.value = '0'; // default
  uiContainer.appendChild(corrInput);

  uiContainer.appendChild(document.createElement('br'));
  uiContainer.appendChild(document.createElement('br'));

  // 4) Leakage
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
  leakSelect.value = '1'; // default
  uiContainer.appendChild(leakSelect);

  uiContainer.appendChild(document.createElement('br'));
  uiContainer.appendChild(document.createElement('br'));

    // Create Grid Size dropdown
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

// Create Farmer Claims dropdown
const fClaimsLabel = document.createElement('label');
fClaimsLabel.innerText = 'Farmer Claims: ';
uiContainer.appendChild(fClaimsLabel);

const fClaimsSelect = document.createElement('select');
fClaimsSelect.id = 'farmerClaims';
uiContainer.appendChild(fClaimsSelect);

uiContainer.appendChild(document.createElement('br'));
uiContainer.appendChild(document.createElement('br'));

// Create Green Claims display (read-only)
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

// Now, define the updateClaimOptions function
function updateClaimOptions() {
  const gridSize = parseInt(gridSizeSelect.value, 10);
  const totalCells = gridSize * gridSize;

  // Clear and populate Farmer Claims options
  fClaimsSelect.innerHTML = '';
  for (let i = 0; i <= totalCells; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i;
    fClaimsSelect.appendChild(option);
  }
  
  // Set default to half the cells (optional)
  fClaimsSelect.value = Math.floor(totalCells / 2);
  
  // Update Green Claims accordingly
  gClaimsDisplay.value = totalCells - parseInt(fClaimsSelect.value, 10);
}

// Attach event listeners to update claims when grid size or farmer claims change
gridSizeSelect.onchange = updateClaimOptions;
fClaimsSelect.onchange = () => {
  const gridSize = parseInt(gridSizeSelect.value, 10);
  const totalCells = gridSize * gridSize;
  gClaimsDisplay.value = totalCells - parseInt(fClaimsSelect.value, 10);
};

// Initialize claims options on page load
updateClaimOptions();

// "Start Game" button
const startBtn = document.createElement('button');
startBtn.innerText = 'Start Game';
startBtn.onclick = () => {
  // Gather user input
  const userTeam         = sideSelect.value;
  const computerStrategy = compStratSelect.value;
  const correlation      = corrInput.value; 
  const leakage          = leakSelect.value;
  const farmerClaims     = fClaimsSelect.value;  // Updated variable
  const greenClaims      = gClaimsDisplay.value; // Updated variable
  const gridSize         = gridSizeSelect.value;

  // Hide UI (optional)
  uiContainer.style.display = 'none';
  document.getElementById('terrain-wrapper').style.display = 'none';
  
  // Call main.js function
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
uiContainer.appendChild(startBtn);


  // Quick function to update the strategy list based on user side
  function updateStrategyOptions() {
    const humanSide = sideSelect.value;
    compStratSelect.innerHTML = ''; // clear old
    if (humanSide === 'green') {
      // Computer is Farmer => show Farmer strategies
      ['naive profit maximizer', 'strategic profit maximizer']
        .forEach(strat => {
          let opt = document.createElement('option');
          opt.value = strat;
          opt.textContent = strat;
          compStratSelect.appendChild(opt);
        });
    } else {
      // User = Farmer => Computer = Green => show Green strategies
      ['maximize environmental score', 'block farmers', 'hot spot']
        .forEach(strat => {
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

// Build the UI on load
buildUI();
