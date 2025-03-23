// strategy.js

// Export a function for the computer to choose an unclaimed plot.
// The parameter 'strategy' is a string indicating the strategy to use.
// For Farmer strategies, use: 'naive profit maximizer' or 'strategic profit maximizer'.
// For Green strategies, use one of: 'maximize environmental score', 'maximize difference', 'block farmers', 'hot spot', or 'random protection'.
// The parameter 'claimParam' is used for Green strategies (number of claims available), though it's not used for Farmer strategies.
export function computerChoosePlot(strategy, grid, claimParam) {
    // Gather all unclaimed cells from the grid.
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
    
    // Check for Farmer strategies by testing if the strategy string contains "profit maximizer".
    if (strategy.toLowerCase().includes("profit maximizer")) {
      // Farmer strategy:
      if (strategy === 'naive profit maximizer') {
        let bestVal = -Infinity;
        unclaimedCells.forEach(cell => {
          // Only consider cells with non-negative agricultural value.
          if (cell.cellData.ag >= 0 && cell.cellData.ag > bestVal) {
            bestVal = cell.cellData.ag;
            chosenCell = cell;
          }
        });
      } else if (strategy === 'strategic profit maximizer') {
        // For simplicity, we'll implement the same as naive.
        let bestVal = -Infinity;
        unclaimedCells.forEach(cell => {
          if (cell.cellData.ag >= 0 && cell.cellData.ag > bestVal) {
            bestVal = cell.cellData.ag;
            chosenCell = cell;
          }
        });
      }
    } else {
      // Assume Green strategy.
      if (strategy === 'maximize environmental score') {
        let bestVal = -Infinity;
        unclaimedCells.forEach(cell => {
          if (cell.cellData.cons > bestVal) {
            bestVal = cell.cellData.cons;
            chosenCell = cell;
          }
        });
      } else if (strategy === 'maximize difference') {
        let bestVal = -Infinity;
        unclaimedCells.forEach(cell => {
          let diff = cell.cellData.cons - cell.cellData.ag;
          if (diff > bestVal) {
            bestVal = diff;
            chosenCell = cell;
          }
        });
      } else if (strategy === 'block farmers') {
        let bestVal = -Infinity;
        unclaimedCells.forEach(cell => {
          if (cell.cellData.ag > bestVal) {
            bestVal = cell.cellData.ag;
            chosenCell = cell;
          } else if (cell.cellData.ag === bestVal && chosenCell) {
            // Use the higher environmental value as a tiebreaker.
            if (cell.cellData.cons > chosenCell.cellData.cons) {
              chosenCell = cell;
            }
          }
        });
      } else if (strategy === 'hot spot') {
        let bestVal = -Infinity;
        unclaimedCells.forEach(cell => {
          let hsVal = cell.cellData.ag * cell.cellData.cons;
          if (hsVal > bestVal) {
            bestVal = hsVal;
            chosenCell = cell;
          }
        });
      } else if (strategy === 'random protection') {
        const randIndex = Math.floor(Math.random() * unclaimedCells.length);
        chosenCell = unclaimedCells[randIndex];
      }
    }
    
    if (chosenCell) {
      return { row: chosenCell.row, col: chosenCell.col };
    }
    return null;
  }
  