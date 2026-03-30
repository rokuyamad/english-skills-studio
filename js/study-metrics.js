function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round1(value) {
  return Math.round(value * 10) / 10;
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

function buildTodayBreakdown(events, timezone) {
  const todayLabel = dateLabel(new Date(), timezone);
  const perPageSeconds = {
    imitation: 0,
    slash: 0,
    shadowing: 0,
    srs: 0,
    external: 0
  };

  events.forEach((ev) => {
    const occurred = new Date(ev.occurredAt || ev.occurred_at);
    if (Number.isNaN(occurred.getTime())) return;
    if (dateLabel(occurred, timezone) !== todayLabel) return;

    const pageKey = ev.pageKey || ev.page_key;
    if (!Object.prototype.hasOwnProperty.call(perPageSeconds, pageKey)) return;
    perPageSeconds[pageKey] += toNumber(ev.estimatedSeconds ?? ev.estimated_seconds, 0);
  });

  const totalSeconds = Object.values(perPageSeconds).reduce((sum, value) => sum + value, 0);

  return {
    totalSeconds,
    perPageSeconds
  };
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

export function buildCumulativeInAppSeries(events, timezone, baselineSecondsTotal = 0) {
  const map = new Map();
  const eventDates = [];

  events.forEach((ev) => {
    const occurred = new Date(ev.occurredAt || ev.occurred_at);
    if (Number.isNaN(occurred.getTime())) return;

    const label = dateLabel(occurred, timezone);
    const seconds = toNumber(ev.estimatedSeconds ?? ev.estimated_seconds, 0);
    map.set(label, (map.get(label) || 0) + seconds);
    eventDates.push(occurred);
  });

  const now = new Date();
  const start = eventDates.length
    ? new Date(Math.min(...eventDates.map((d) => d.getTime())))
    : new Date(now);

  const series = [];
  let runningSeconds = 0;
  let isFirstDay = true;

  for (const cursor = new Date(start); cursor <= now; cursor.setDate(cursor.getDate() + 1)) {
    const label = dateLabel(cursor, timezone);
    if (isFirstDay) {
      runningSeconds += toNumber(baselineSecondsTotal, 0);
      isFirstDay = false;
    }
    runningSeconds += map.get(label) || 0;
    series.push({
      date: label,
      hours: round1(runningSeconds / 3600)
    });
  }

  return series;
}

export function buildCumulativeInAppPerPageSeries(events, timezone, baselineSecondsByPage = {}) {
  const map = new Map();
  const eventDates = [];
  const keys = ['imitation', 'slash', 'shadowing', 'srs'];

  events.forEach((ev) => {
    const occurred = new Date(ev.occurredAt || ev.occurred_at);
    if (Number.isNaN(occurred.getTime())) return;

    const pageKey = ev.pageKey || ev.page_key;
    if (!keys.includes(pageKey)) return;

    const label = dateLabel(occurred, timezone);
    const current = map.get(label) || { imitation: 0, slash: 0, shadowing: 0, srs: 0 };
    current[pageKey] += toNumber(ev.estimatedSeconds ?? ev.estimated_seconds, 0);
    map.set(label, current);
    eventDates.push(occurred);
  });

  const now = new Date();
  const start = eventDates.length
    ? new Date(Math.min(...eventDates.map((d) => d.getTime())))
    : new Date(now);

  const running = {
    imitation: 0,
    slash: 0,
    shadowing: 0,
    srs: 0
  };
  let isFirstDay = true;
  const series = [];

  for (const cursor = new Date(start); cursor <= now; cursor.setDate(cursor.getDate() + 1)) {
    const label = dateLabel(cursor, timezone);
    const day = map.get(label) || { imitation: 0, slash: 0, shadowing: 0, srs: 0 };

    if (isFirstDay) {
      running.imitation += toNumber(baselineSecondsByPage.imitation, 0);
      running.slash += toNumber(baselineSecondsByPage.slash, 0);
      running.shadowing += toNumber(baselineSecondsByPage.shadowing, 0);
      running.srs += toNumber(baselineSecondsByPage.srs, 0);
      isFirstDay = false;
    }

    running.imitation += day.imitation;
    running.slash += day.slash;
    running.shadowing += day.shadowing;
    running.srs += day.srs;

    const imitationHours = round1(running.imitation / 3600);
    const slashHours = round1(running.slash / 3600);
    const shadowingHours = round1(running.shadowing / 3600);
    const srsHours = round1(running.srs / 3600);
    const totalHours = round1((running.imitation + running.slash + running.shadowing + running.srs) / 3600);

    series.push({
      date: label,
      imitationHours,
      slashHours,
      shadowingHours,
      srsHours,
      totalHours
    });
  }

  return series;
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

  return [
    { id: 'first_step', label: 'First Step', unlocked: hours > 0 },
    { id: 'week_streak', label: '7-Day Streak', unlocked: streak >= 7 },
    { id: 'focused_imitation', label: 'Imitation 10h', unlocked: (page.imitation || 0) >= 10 },
    {
      id: 'balanced_learner',
      label: 'Balanced Learner',
      unlocked: (page.imitation || 0) >= 3 && (page.slash || 0) >= 3 && (page.shadowing || 0) >= 3
    },
    { id: 'century', label: '100h', unlocked: hours >= 100 },
    { id: 'halfway', label: 'Halfway', unlocked: hours >= 500 },
    { id: 'master_track', label: 'Goal Complete', unlocked: milestones.length ? hours >= milestones[milestones.length - 1] : hours >= 1000 }
  ];
}

function computeMomentum(dailySeries = []) {
  const values = dailySeries.map((d) => toNumber(d.minutes, 0));
  const latest7 = values.slice(-7);
  const prev7 = values.slice(-14, -7);
  const avg = (arr) => (arr.length ? arr.reduce((sum, v) => sum + v, 0) / arr.length : 0);
  const last7Avg = avg(latest7);
  const prev7Avg = avg(prev7);
  const delta = last7Avg - prev7Avg;
  const trend = delta > 0.2 ? 'up' : delta < -0.2 ? 'down' : 'flat';
  return {
    last7Avg: round1(last7Avg),
    prev7Avg: round1(prev7Avg),
    delta: round1(delta),
    trend
  };
}

function resolveMissionStage(goalProgress) {
  if (goalProgress >= 1) return 'Mission Complete';
  if (goalProgress >= 0.8) return 'Final Approach';
  if (goalProgress >= 0.5) return 'Deep Focus';
  if (goalProgress >= 0.2) return 'Orbit';
  return 'Launch';
}

const IN_APP_PAGE_KEYS = ['imitation', 'slash', 'shadowing', 'srs'];

function resolveEventSeconds(ev, settings) {
  const key = ev.pageKey || ev.page_key;
  if (!IN_APP_PAGE_KEYS.includes(key)) {
    return toNumber(ev.estimatedSeconds ?? ev.estimated_seconds, 0);
  }
  const unitCount = toNumber(ev.unitCount ?? ev.unit_count, 1);
  const secsPerCount = toNumber(settings?.seconds_per_count?.[key], 0);
  if (secsPerCount > 0) return unitCount * secsPerCount;
  return toNumber(ev.estimatedSeconds ?? ev.estimated_seconds, 0);
}

export function computeDashboardSnapshot({ events = [], baselineSecondsByPage = {} }, settings) {
  // in-appイベントのestimated_secondsを現在のsettingsで再換算した正規化済み配列を作成する。
  // これにより設定変更が過去のイベントを含む全ての集計に即座に反映される。
  const normalizedEvents = events.map((ev) => {
    const key = ev.pageKey || ev.page_key;
    if (!IN_APP_PAGE_KEYS.includes(key)) return ev;
    const resolvedSeconds = resolveEventSeconds(ev, settings);
    return { ...ev, estimatedSeconds: resolvedSeconds, estimated_seconds: resolvedSeconds };
  });

  const perPageSeconds = { imitation: 0, slash: 0, shadowing: 0, srs: 0, external: 0 };
  normalizedEvents.forEach((ev) => {
    const key = ev.pageKey || ev.page_key;
    if (!Object.prototype.hasOwnProperty.call(perPageSeconds, key)) return;
    perPageSeconds[key] += toNumber(ev.estimatedSeconds ?? ev.estimated_seconds, 0);
  });

  const externalEventSeconds = perPageSeconds.external;

  ['imitation', 'slash', 'shadowing', 'srs'].forEach((key) => {
    perPageSeconds[key] += toNumber(baselineSecondsByPage[key], 0);
  });

  const inAppTotalSeconds =
    perPageSeconds.imitation + perPageSeconds.slash + perPageSeconds.shadowing + perPageSeconds.srs;
  const baselineSecondsTotal = Object.values(baselineSecondsByPage).reduce((sum, v) => sum + toNumber(v, 0), 0);
  const externalCarryoverSeconds = toNumber(settings.external_carryover_hours, 0) * 3600;
  const totalSeconds = inAppTotalSeconds + externalCarryoverSeconds + externalEventSeconds;
  const totalHours = totalSeconds / 3600;
  const totalMinutes = totalSeconds / 60;
  const goalHours = Math.max(1, toNumber(settings.goal_hours, 1000));
  const streak = computeStreak(normalizedEvents, settings.streak_min_minutes_per_day, settings.timezone);
  const xp = computeXp(totalMinutes, settings.xp_per_minute);
  const level = computeLevel(xp, settings.level_curve_factor);
  const dailySeries = buildDailySeries(normalizedEvents, settings.timezone);
  const cumulativeInAppPerPageSeries = buildCumulativeInAppPerPageSeries(normalizedEvents, settings.timezone, baselineSecondsByPage);
  const cumulativeInAppSeries = cumulativeInAppPerPageSeries.map((d) => ({
    date: d.date,
    hours: d.totalHours
  }));
  const momentum = computeMomentum(dailySeries);
  const goalProgress = Math.max(0, Math.min(1, totalHours / goalHours));
  const todayBreakdown = buildTodayBreakdown(normalizedEvents, settings.timezone);

  const perPageHours = {
    imitation: perPageSeconds.imitation / 3600,
    slash: perPageSeconds.slash / 3600,
    shadowing: perPageSeconds.shadowing / 3600,
    srs: perPageSeconds.srs / 3600
  };

  const milestones = (settings.milestones_hours || []).slice().sort((a, b) => a - b);
  const nextMilestone = milestones.find((h) => totalHours < h) || null;

  return {
    totalHours: round1(totalHours),
    inAppHours: round1(inAppTotalSeconds / 3600),
    externalEventHours: round1(externalEventSeconds / 3600),
    externalCarryoverHours: round1(externalCarryoverSeconds / 3600),
    totalMinutes,
    todayBreakdown,
    goalHours,
    remainingHours: round1(Math.max(0, goalHours - totalHours)),
    goalProgress,
    perPageHours,
    streak,
    xp,
    level,
    nextMilestone,
    dailySeries,
    cumulativeInAppSeries,
    cumulativeInAppPerPageSeries,
    baselineInAppHours: round1(baselineSecondsTotal / 3600),
    momentum,
    missionStage: resolveMissionStage(goalProgress),
    achievements: computeAchievements(totalHours, streak, perPageHours, milestones)
  };
}
