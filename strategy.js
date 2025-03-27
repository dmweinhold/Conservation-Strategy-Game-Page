// strategy.js

export function computerChoosePlot(strategy, grid, claimParam) {
  // Gather all unclaimed cells
  let unclaimedCells = [];
  grid.forEach(row => {
    row.forEach(cell => {
      if (!cell.claimed) {
        unclaimedCells.push(cell);
      }
    });
  });

  if (unclaimedCells.length === 0) return null;

  let chosenCell = null;

  // Farmer strategy
  if (strategy.toLowerCase().includes("profit maximizer")) {
    // e.g. "naive profit maximizer"
    let bestVal = -Infinity;
    unclaimedCells.forEach(cell => {
      if (cell.cellData.ag > bestVal) {
        bestVal = cell.cellData.ag;
        chosenCell = cell;
      }
    });
  }
  else {
    // Green strategy
    if (strategy === 'maximize environmental score') {
      let bestVal = -Infinity;
      unclaimedCells.forEach(cell => {
        if (cell.cellData.cons > bestVal) {
          bestVal = cell.cellData.cons;
          chosenCell = cell;
        }
      });
    } 
    else if (strategy === 'block farmers') {
      let bestVal = -Infinity;
      unclaimedCells.forEach(cell => {
        if (cell.cellData.ag > bestVal) {
          bestVal = cell.cellData.ag;
          chosenCell = cell;
        } else if (cell.cellData.ag === bestVal && chosenCell) {
          // tie-break: pick higher env
          if (cell.cellData.cons > chosenCell.cellData.cons) {
            chosenCell = cell;
          }
        }
      });
    } 
    else if (strategy === 'hot spot') {
      let bestVal = -Infinity;
      unclaimedCells.forEach(cell => {
        const hsVal = cell.cellData.ag * cell.cellData.cons;
        if (hsVal > bestVal) {
          bestVal = hsVal;
          chosenCell = cell;
        }
      });
    } 
    else {
      // random fallback
      const randIndex = Math.floor(Math.random() * unclaimedCells.length);
      chosenCell = unclaimedCells[randIndex];
    }
  }

  if (chosenCell) {
    return { row: chosenCell.row, col: chosenCell.col };
  }
  return null;
}
