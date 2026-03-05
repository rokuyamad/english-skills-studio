const AGAIN_MINUTES = 10;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function addMinutes(base, minutes) {
  const next = new Date(base);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function addDays(base, days) {
  const next = new Date(base);
  next.setDate(next.getDate() + Math.max(1, Math.round(days)));
  return next;
}

export function computeNextState(currentState, grade, now = new Date()) {
  const safeGrade = String(grade || '').toLowerCase();
  if (!['again', 'good', 'easy'].includes(safeGrade)) {
    throw new Error(`Unsupported grade: ${grade}`);
  }

  const currentReps = Number(currentState?.reps || 0);
  const currentLapses = Number(currentState?.lapses || 0);
  const currentDifficulty = clamp(Number(currentState?.difficulty || 5), 1, 10);
  const currentStability = Math.max(0, Number(currentState?.stability_days || 0));

  let nextDifficulty = currentDifficulty;
  let nextStability = currentStability;
  let nextDueAt = new Date(now);
  let nextLapses = currentLapses;

  if (currentReps <= 0) {
    if (safeGrade === 'again') {
      nextStability = 0.25;
      nextDifficulty = clamp(currentDifficulty + 0.4, 1, 10);
      nextLapses += 1;
      nextDueAt = addMinutes(now, AGAIN_MINUTES);
    } else if (safeGrade === 'good') {
      nextStability = 1;
      nextDifficulty = clamp(currentDifficulty - 0.15, 1, 10);
      nextDueAt = addDays(now, 1);
    } else {
      nextStability = 3;
      nextDifficulty = clamp(currentDifficulty - 0.3, 1, 10);
      nextDueAt = addDays(now, 3);
    }
  } else if (safeGrade === 'again') {
    nextStability = Math.max(0.25, currentStability * 0.5);
    nextDifficulty = clamp(currentDifficulty + 0.4, 1, 10);
    nextLapses += 1;
    nextDueAt = addMinutes(now, AGAIN_MINUTES);
  } else if (safeGrade === 'good') {
    nextStability = Math.max(1, currentStability * (1.2 + ((10 - currentDifficulty) * 0.03)));
    nextDifficulty = clamp(currentDifficulty - 0.15, 1, 10);
    nextDueAt = addDays(now, nextStability);
  } else {
    nextStability = Math.max(1.5, currentStability * (1.45 + ((10 - currentDifficulty) * 0.04)));
    nextDifficulty = clamp(currentDifficulty - 0.3, 1, 10);
    nextDueAt = addDays(now, nextStability * 1.3);
  }

  return {
    reps: currentReps + 1,
    lapses: nextLapses,
    difficulty: round2(nextDifficulty),
    stability_days: round2(nextStability),
    due_at: nextDueAt.toISOString(),
    last_reviewed_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString()
  };
}
