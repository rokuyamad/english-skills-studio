function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function computeXp(totalMinutes, xpPerMinute) {
  return Math.floor(Math.max(0, totalMinutes) * Math.max(1, toNumber(xpPerMinute, 10)));
}

export function computeLevel(xp, levelCurveFactor) {
  const factor = Math.max(10, toNumber(levelCurveFactor, 120));
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / factor)) + 1;
  const currentBase = factor * ((level - 1) ** 2);
  const nextXp = factor * (level ** 2);
  return {
    level,
    nextXp,
    progress: nextXp > currentBase ? (xp - currentBase) / (nextXp - currentBase) : 0
  };
}

function dateLabel(date, timezone) {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(date);
}

export function buildDailySeries(events, timezone) {
  const map = new Map();
  events.forEach((ev) => {
    const label = dateLabel(new Date(ev.occurredAt || ev.occurred_at), timezone);
    const seconds = toNumber(ev.estimatedSeconds ?? ev.estimated_seconds, 0);
    map.set(label, (map.get(label) || 0) + seconds);
  });

  const days = [];
  const now = new Date();
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const label = dateLabel(d, timezone);
    days.push({
      date: label,
      minutes: Math.round(((map.get(label) || 0) / 60) * 10) / 10
    });
  }
  return days;
}

export function computeStreak(events, minMinutes, timezone) {
  const map = new Map();
  events.forEach((ev) => {
    const label = dateLabel(new Date(ev.occurredAt || ev.occurred_at), timezone);
    const seconds = toNumber(ev.estimatedSeconds ?? ev.estimated_seconds, 0);
    map.set(label, (map.get(label) || 0) + seconds);
  });

  const thresholdSeconds = Math.max(1, toNumber(minMinutes, 10)) * 60;
  let streak = 0;
  const cursor = new Date();

  while (true) {
    const label = dateLabel(cursor, timezone);
    const sec = map.get(label) || 0;
    if (sec >= thresholdSeconds) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    if (streak === 0) {
      cursor.setDate(cursor.getDate() - 1);
      const prevLabel = dateLabel(cursor, timezone);
      const prevSec = map.get(prevLabel) || 0;
      if (prevSec >= thresholdSeconds) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
    }

    break;
  }

  return streak;
}

function computeAchievements(totalHours, streak, perPageHours, milestones) {
  const hours = totalHours;
  const page = perPageHours;

  const milestoneSet = new Set((milestones || []).map((v) => Math.round(v)));

  return [
    { id: 'first_step', label: 'First Step', unlocked: hours > 0 },
    { id: 'week_streak', label: '7-Day Streak', unlocked: streak >= 7 },
    { id: 'focused_imitation', label: 'Imitation 10h', unlocked: (page.imitation || 0) >= 10 },
    {
      id: 'balanced_learner',
      label: 'Balanced Learner',
      unlocked: (page.imitation || 0) >= 3 && (page.slash || 0) >= 3 && (page.shadowing || 0) >= 3
    },
    { id: 'century', label: '100h', unlocked: hours >= 100 || milestoneSet.has(100) && hours >= 100 },
    { id: 'halfway', label: 'Halfway', unlocked: hours >= 500 },
    { id: 'master_track', label: 'Goal Complete', unlocked: milestones.length ? hours >= milestones[milestones.length - 1] : hours >= 1000 }
  ];
}

export function computeDashboardSnapshot({ events = [], baselineSecondsByPage = {} }, settings) {
  const perPageSeconds = { imitation: 0, slash: 0, shadowing: 0 };
  events.forEach((ev) => {
    const key = ev.pageKey || ev.page_key;
    if (!Object.prototype.hasOwnProperty.call(perPageSeconds, key)) return;
    perPageSeconds[key] += toNumber(ev.estimatedSeconds ?? ev.estimated_seconds, 0);
  });

  Object.keys(perPageSeconds).forEach((key) => {
    perPageSeconds[key] += toNumber(baselineSecondsByPage[key], 0);
  });

  const totalSeconds = Object.values(perPageSeconds).reduce((sum, v) => sum + v, 0);
  const totalHours = totalSeconds / 3600;
  const totalMinutes = totalSeconds / 60;
  const goalHours = Math.max(1, toNumber(settings.goal_hours, 1000));
  const streak = computeStreak(events, settings.streak_min_minutes_per_day, settings.timezone);
  const xp = computeXp(totalMinutes, settings.xp_per_minute);
  const level = computeLevel(xp, settings.level_curve_factor);

  const perPageHours = {
    imitation: perPageSeconds.imitation / 3600,
    slash: perPageSeconds.slash / 3600,
    shadowing: perPageSeconds.shadowing / 3600
  };

  const milestones = (settings.milestones_hours || []).slice().sort((a, b) => a - b);
  const nextMilestone = milestones.find((h) => totalHours < h) || null;

  return {
    totalHours,
    totalMinutes,
    goalHours,
    remainingHours: Math.max(0, goalHours - totalHours),
    goalProgress: Math.max(0, Math.min(1, totalHours / goalHours)),
    perPageHours,
    streak,
    xp,
    level,
    nextMilestone,
    dailySeries: buildDailySeries(events, settings.timezone),
    achievements: computeAchievements(totalHours, streak, perPageHours, milestones)
  };
}
