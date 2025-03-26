// gameLogic.js

export function calculateOptimalSocialWelfare(grid) {
  let total = 0;
  for (let row of grid) {
    for (let cell of row) {
      const { ag, cons } = cell.cellData;
      total += Math.max(ag, cons);
    }
  }
  return total;
}

export function calculateFarmerBAUSet(grid, fClaims, farmerStrategy, gClaims=8) {
  // If grid is a 2D array of Phaser rectangles, we gather potential cells
  let cells = [];
  if (Array.isArray(grid) && grid.length && grid[0].length) {
    // real grid
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c].cellData.ag >= 0) {
          cells.push({ row: r, col: c });
        }
      }
    }
  }

  // If it's empty, fallback: just return empty or something
  if (!cells.length && !Array.isArray(grid)) {
    // Possibly the user is passing an empty array as a placeholder
    // We'll do a placeholder approach
    return [];
  }

  // Sort logic
  if (farmerStrategy === 'naive profit maximizer') {
    // sort by ag descending
    cells.sort((a, b) => grid[b.row][b.col].cellData.ag - grid[a.row][a.col].cellData.ag);
    return cells.slice(0, fClaims);
  }
  else if (farmerStrategy === 'strategic profit maximizer') {
    // 1) get all env values
    let allEnv = [];
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        allEnv.push(grid[r][c].cellData.cons);
      }
    }
    allEnv.sort((a, b) => b - a);

    let cutoffIndex = Math.min(gClaims, allEnv.length - 1);
    const cutoff = allEnv[cutoffIndex];

    let risky = [];
    let safe = [];
    for (let cell of cells) {
      const consVal = grid[cell.row][cell.col].cellData.cons;
      if (consVal > cutoff) risky.push(cell);
      else safe.push(cell);
    }
    risky.sort((a, b) => grid[b.row][b.col].cellData.ag - grid[a.row][a.col].cellData.ag);
    safe.sort((a, b) => grid[b.row][b.col].cellData.ag - grid[a.row][a.col].cellData.ag);

    const combo = risky.concat(safe);
    return combo.slice(0, fClaims);
  }

  // default fallback
  return [];
}

export function calculateGreenBAUScore(grid, farmerBAUSet) {
  let total = 0;
  for (let c of farmerBAUSet) {
    total += grid[c.row][c.col].cellData.cons;
  }
  return total;
}

export function calculateActualSocialWelfare(grid) {
  let total = 0;
  for (let row of grid) {
    for (let cell of row) {
      const { ag, cons, owner } = cell.cellData;
      if (owner === 'green') total += cons;
      else if (owner === 'farmer') total += ag;
    }
  }
  return total;
}

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

export function calculateSocialWelfareDifference(actual, optimal) {
  if (optimal === 0) return 0;
  return ((optimal - actual) / optimal) * 100;
}

export function calculateAdditionality(greenClaimedTotal, greenBAU) {
  return greenClaimedTotal - greenBAU;
}

export function calculateHeuristicMaxGreenScore(grid, greenClaims, farmerClaims, leakage) {
  // separate BAU from non-BAU
  let BAUCells = [];
  let nonBAUCells = [];
  for (let row of grid) {
    for (let cell of row) {
      if (cell.cellData.isBAU) {
        BAUCells.push(cell);
      } else {
        nonBAUCells.push(cell);
      }
    }
  }
  BAUCells.sort((a, b) => b.cellData.cons - a.cellData.cons);
  nonBAUCells.sort((a, b) => b.cellData.cons - a.cellData.cons);

  let bestGreenScore = 0;

  for (let X = 0; X <= greenClaims; X++) {
    const claimedByGreen = [
      ...BAUCells.slice(0, X),
      ...nonBAUCells.slice(0, greenClaims - X)
    ];

    let claimedSet = new Set(claimedByGreen);

    const deduction = Math.floor(X * (1 - leakage));
    const finalFarmerClaims = Math.max(0, farmerClaims - deduction);

    // leftover for Farmer
    let leftover = [];
    for (let row of grid) {
      for (let cell of row) {
        if (!claimedSet.has(cell)) {
          leftover.push(cell);
        }
      }
    }

    leftover.sort((a, b) => b.cellData.ag - a.cellData.ag);
    let farmerClaimed = leftover.slice(0, finalFarmerClaims);

    // the rest is unclaimed => green
    let trulyUnclaimed = leftover.slice(finalFarmerClaims);

    let greenActiveEnv = 0;
    for (let c of claimedByGreen) {
      greenActiveEnv += c.cellData.cons;
    }
    let greenLeftoverEnv = 0;
    for (let c of trulyUnclaimed) {
      greenLeftoverEnv += c.cellData.cons;
    }
    const totalGreenEnv = greenActiveEnv + greenLeftoverEnv;
    if (totalGreenEnv > bestGreenScore) {
      bestGreenScore = totalGreenEnv;
    }
  }

  return bestGreenScore;
}
