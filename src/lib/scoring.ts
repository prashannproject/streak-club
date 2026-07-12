export const DAILY_MAX_SCORE = 100;

export function dailyConsistencyScore(completed: number, activeHabits: number): number {
  if (activeHabits <= 0 || completed <= 0) return 0;
  const boundedCompleted = Math.min(completed, activeHabits);
  return Math.round((boundedCompleted / activeHabits) * DAILY_MAX_SCORE);
}

export function averageConsistencyScore(dailyScores: number[]): number {
  if (dailyScores.length === 0) return 0;
  return Math.round(
    dailyScores.reduce((total, score) => total + score, 0) / dailyScores.length,
  );
}

export function currentStreak(completedDates: string[], today: string): number {
  const dates = new Set(completedDates);
  const cursor = new Date(`${today}T12:00:00Z`);
  let streak = 0;

  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}
