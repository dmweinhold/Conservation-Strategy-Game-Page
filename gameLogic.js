// gameLogic.js

/**
 * Calculate the maximum social welfare possible.
 * For each cell, take the maximum of the agricultural and environmental values.
 * @param {Array} grid - The 2D array of cells, each with cellData { ag, cons }.
 * @returns {number} The sum of max(ag, cons) for each cell.
 */
export function calculateOptimalSocialWelfare(grid) {
  let total = 0;
  const gridSize = grid.length;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const { ag, cons } = grid[r][c].cellData;
      total += Math.max(ag, cons);
    }
  }
  return total;
}

/**
 * Calculate the Farmer BAU set given the grid, 
 * the Farmer's number of claims (fClaims),
 * the Farmer strategy ("naive profit maximizer" or "strategic profit maximizer"), 
 * and the number of Green claims (gClaims).
 * 
 * "strategic profit maximizer" uses the logic:
 *   - Sort all environmental values descending
 *   - Take the gClaims-th highest env as the "cutoff"
 *   - "Risky" = cells with cons > cutoff (and ag >= 0)
 *   - "Safe"  = cells with cons <= cutoff (and ag >= 0)
 *   - Sort risky descending by ag, then safe descending by ag
 *   - The first fClaims of risky+safe become BAU
 * 
 * Returns an array of objects, each with { row, col }.
 */
export function calculateFarmerBAUSet(grid, fClaims, farmerStrategy, gClaims = 8) {
  const gridSize = grid.length;
  let bau = [];

  // Gather all cells with non-negative agricultural value
  let cells = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c].cellData.ag >= 0) {
        cells.push({ row: r, col: c });
      }
    }
  }

  // Naive approach: just sort by ag descending
  if (farmerStrategy === 'naive profit maximizer') {
    cells.sort((a, b) =>
      grid[b.row][b.col].cellData.ag - grid[a.row][a.col].cellData.ag
    );
    bau = cells.slice(0, fClaims);
  }

  // Strategic approach
  else if (farmerStrategy === 'strategic profit maximizer') {
    // 1) Collect all environmental values
    const allEnv = [];
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        allEnv.push(grid[r][c].cellData.cons);
      }
    }
    // 2) Sort descending
    allEnv.sort((a, b) => b - a);

    // 3) The cutoff is the gClaims-th highest environment (or last if out of range)
    let cutoffIndex = Math.min(gClaims, allEnv.length - 1);
    const cutoff = allEnv[cutoffIndex];

    // 4) Split into risky vs. safe
    let risky = [];
    let safe = [];
    for (let cell of cells) {
      const consVal = grid[cell.row][cell.col].cellData.cons;
      if (consVal > cutoff) {
        risky.push(cell);
      } else {
        safe.push(cell);
      }
    }

    // 5) Sort each group by ag descending
    risky.sort((a, b) =>
      grid[b.row][b.col].cellData.ag - grid[a.row][a.col].cellData.ag
    );
    safe.sort((a, b) =>
      grid[b.row][b.col].cellData.ag - grid[a.row][a.col].cellData.ag
    );

    // 6) Merge, take top fClaims
    const combo = risky.concat(safe);
    bau = combo.slice(0, fClaims);
  }

  return bau;
}

/**
 * Calculate the Green BAU score: sum of the environmental values of the
 * cells in the Farmer BAU set.
 * @param {Array} grid - The 2D grid array.
 * @param {Array} farmerBAUSet - Array of {row, col} in the BAU set.
 * @returns {number} The total environmental value of that BAU set.
 */
export function calculateGreenBAUScore(grid, farmerBAUSet) {
  let total = 0;
  for (let cell of farmerBAUSet) {
    total += grid[cell.row][cell.col].cellData.cons;
  }
  return total;
}

/**
 * Calculate the actual social welfare after the game:
 *   - Sum of AG of all farmer-owned cells
 *   - plus sum of CONS of all green-owned cells
 * @param {Array} grid - The 2D grid array, with cellData.owner = 'farmer' or 'green'
 * @returns {number} The total realized social welfare
 */
export function calculateActualSocialWelfare(grid) {
  let total = 0;
  for (let row of grid) {
    for (let cell of row) {
      const { ag, cons, owner } = cell.cellData;
      if (owner === 'green') {
        total += cons;
      } else if (owner === 'farmer') {
        total += ag;
      }
    }
  }
  return total;
}

/**
 * Calculate how many total environmental points the Greens ended up with,
 * i.e. sum of cons of green-owned cells.
 * @param {Array} grid
 * @returns {number} 
 */
export function calculateGreenClaimedTotal(grid) {
  let total = 0;
  for (let row of grid) {
    for (let cell of row) {
      if (cell.cellData.owner === 'green') {
        total += cell.cellData.cons;
      }
    }
  }
  return total;
}

/**
 * Calculate the percentage difference between the optimal and actual social welfare.
 * E.g. if actual=80 and optimal=100, difference = 20%. 
 * @param {number} actual 
 * @param {number} optimal 
 * @returns {number} 
 */
export function calculateSocialWelfareDifference(actual, optimal) {
  if (optimal === 0) return 0;
  return ((optimal - actual) / optimal) * 100;
}

/**
 * Additionality = (total environment from green-claimed) - (Green BAU score).
 * If we are unsure of the BAU (e.g. if user is the Farmer), we can pass greenBAU=0.
 * @param {number} greenClaimedTotal 
 * @param {number} greenBAU 
 * @returns {number}
 */
export function calculateAdditionality(greenClaimedTotal, greenBAU) {
  return greenClaimedTotal - greenBAU;
}

/**
 * Calculate a near-optimal final Green score given:
 *   - grid (each cell has { ag, cons, isBAU? })
 *   - greenClaims = how many total claims Greens have
 *   - farmerClaims = how many claims Farmer has
 *   - leakage = partial fraction allowed (0..1)
 *
 * The function tries all splits X = 0..greenClaims
 *   -> X BAU cells + (greenClaims - X) nonBAU cells
 * Farmer then claims farmland from the remainder,
 * leftover cells go to Greens, compute final env total.
 */
export function calculateHeuristicMaxGreenScore(grid, greenClaims, farmerClaims, leakage) {
  // Separate BAU from non-BAU
  let BAUCells = [];
  let nonBAUCells = [];

  grid.forEach(row => {
    row.forEach(cell => {
      if (cell.cellData.isBAU) {
        BAUCells.push(cell);
      } else {
        nonBAUCells.push(cell);
      }
    });
  });

  // Sort BAU by environmental desc
  BAUCells.sort((a, b) => b.cellData.cons - a.cellData.cons);
  // Sort non-BAU by environmental desc
  nonBAUCells.sort((a, b) => b.cellData.cons - a.cellData.cons);

  // Sort *all* remaining cells for the Farmer by AG desc as needed
  // Actually, we do that "on the fly" each iteration (or once globally).

  // We'll store the best outcome found
  let bestGreenScore = 0;

  for (let X = 0; X <= greenClaims; X++) {
    // 1) Greens claim X from BAU (top env) + (greenClaims - X) from NonBAU
    const claimedByGreen = [
      ...BAUCells.slice(0, X),
      ...nonBAUCells.slice(0, greenClaims - X)
    ];

    // 2) Mark these as green for the simulation
    //    We'll do a shallow copy approach rather than mutate the real grid
    //    so we can revert after. Or we can gather "IDs" of claimed cells in sets.
    let claimedSet = new Set();
    claimedByGreen.forEach(cell => {
      claimedSet.add(cell);
    });

    // 3) The partial deduction: X BAU claims => floor(X * (1 - leakage))
    const deduction = Math.floor(X * (1 - leakage));
    const finalFarmerClaims = Math.max(0, farmerClaims - deduction);

    // 4) Now the *Farmer* claims finalFarmerClaims from leftover
    //    leftover = all cells not in claimedSet
    //    farmer picks top by AG
    let leftover = [];
    grid.forEach(row => {
      row.forEach(cell => {
        if (!claimedSet.has(cell)) {
          leftover.push(cell);
        }
      });
    });

    // Sort leftover by AG desc for Farmer's picking
    leftover.sort((a, b) => b.cellData.ag - a.cellData.ag);

    const farmerClaimed = leftover.slice(0, finalFarmerClaims);
    let farmerClaimedSet = new Set(farmerClaimed);

    // 5) The *unclaimed* leftover => Greens
    const trulyUnclaimed = leftover.slice(finalFarmerClaims); // after Farmer picks
    // The environmental sum of these is the "displacement leftover"

    // 6) Compute final Green env total:
    //    a) from the X + (greenClaims - X) actively claimed
    let greenActiveEnv = 0;
    claimedByGreen.forEach(cell => {
      greenActiveEnv += cell.cellData.cons;
    });

    //    b) from leftover unclaimed
    let greenLeftoverEnv = 0;
    trulyUnclaimed.forEach(cell => {
      greenLeftoverEnv += cell.cellData.cons;
    });

    let totalGreenEnv = greenActiveEnv + greenLeftoverEnv;

    // 7) Check if best
    if (totalGreenEnv > bestGreenScore) {
      bestGreenScore = totalGreenEnv;
    }
  }

  return bestGreenScore;
}
