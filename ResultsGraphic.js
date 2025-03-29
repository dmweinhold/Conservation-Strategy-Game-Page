// ResultsGraphic.js

export function getCategoryIndices(greenSuccessPct, welfareLossPct) {
  // We'll assume 0-100 for greenSuccessPct, 0-100 for welfareLossPct
  // but you might want to clamp or handle edge cases if negative or >100.
  let greenIndex;
  if (greenSuccessPct < 70) greenIndex = 0;
  else if (greenSuccessPct < 80) greenIndex = 1;
  else if (greenSuccessPct < 90) greenIndex = 2;
  else if (greenSuccessPct < 95) greenIndex = 3;
  else if (greenSuccessPct < 98) greenIndex = 4;
  else greenIndex = 5;

  let welfareIndex;
  if (welfareLossPct > 30) welfareIndex = 0;
  else if (welfareLossPct > 20) welfareIndex = 1;
  else if (welfareLossPct > 10) welfareIndex = 2;
  else if (welfareLossPct > 5) welfareIndex = 3;
  else if (welfareLossPct > 2) welfareIndex = 4;
  else welfareIndex = 5;

  return { greenIndex, welfareIndex };
}


export function getSummaryText(greenIndex, welfareIndex) {
  const summaryData = JSON.parse(
    document.getElementById('summary-lookup-json').textContent
  );
  
  const conservationLabels = [
    "Ecocidal","Biophobe","Guardian",
    "Advocate","Steward","Eco-Champion"
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
