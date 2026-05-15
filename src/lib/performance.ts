export const chooseCheckpointInterval = (
  commitCount: number,
  fileCount: number,
): number => {
  if (commitCount > 300 || fileCount > 10_000) {
    return 50;
  }

  if (commitCount > 100 || fileCount > 5_000) {
    return 25;
  }

  if (commitCount > 50 || fileCount > 1_000) {
    return 10;
  }

  return 5;
};
