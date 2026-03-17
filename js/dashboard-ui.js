import {
  Chart,
  ArcElement,
  Tooltip,
  Legend,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Filler,
  DoughnutController,
  LineController
} from 'https://esm.sh/chart.js@4';

Chart.register(
  ArcElement,
  Tooltip,
  Legend,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Filler,
  DoughnutController,
  LineController
);

let lineChart = null;
let donutChart = null;
let cumulativeChart = null;
let didPrimeDashboard = false;
const animatedNumbers = new Map();

function isDesktopDashboardViewport() {
  return window.matchMedia('(min-width: 961px)').matches;
}

function hoursLabel(hours) {
  return `${hours.toFixed(1)}h`;
}

function percentLabel(v) {
  return `${Math.round(v * 100)}%`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function renderAchievements(items = []) {
  const wrap = document.getElementById('achievementList');
  if (!wrap) return;
  wrap.innerHTML = '';
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = `achievement-chip${item.unlocked ? ' unlocked' : ''}`;
    card.textContent = item.label;
    wrap.appendChild(card);
  });
}

function destroyCharts() {
  if (lineChart) {
    lineChart.destroy();
    lineChart = null;
  }
  if (donutChart) {
    donutChart.destroy();
    donutChart = null;
  }
  if (cumulativeChart) {
    cumulativeChart.destroy();
    cumulativeChart = null;
  }
}

function makeAnimationOption() {
  return prefersReducedMotion()
    ? { duration: 0 }
    : {
        duration: 820,
        easing: 'easeOutQuart'
      };
}

function animateTextNumber(id, nextValue, formatter, options = {}) {
  const el = document.getElementById(id);
  if (!el) return;

  const duration = options.duration ?? 700;
  const decimals = options.decimals ?? 0;
  const currentValue = animatedNumbers.has(id) ? animatedNumbers.get(id) : nextValue;

  if (prefersReducedMotion()) {
    animatedNumbers.set(id, nextValue);
    el.textContent = formatter(nextValue);
    return;
  }

  if (Math.abs(currentValue - nextValue) < 0.001) {
    el.textContent = formatter(nextValue);
    return;
  }

  const start = performance.now();
  const from = currentValue;
  const delta = nextValue - from;

  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = from + (delta * eased);
    const rounded = Number(value.toFixed(decimals));
    el.textContent = formatter(rounded);
    if (progress < 1) {
      requestAnimationFrame(step);
      return;
    }
    animatedNumbers.set(id, nextValue);
    el.textContent = formatter(nextValue);
  };

  requestAnimationFrame(step);
}

function primeDashboardMotion() {
  const panel = document.querySelector('.dashboard-panel');
  if (!panel) return;

  const animatedEls = panel.querySelectorAll('.dashboard-head, .dashboard-kpis > *, .goal-progress-shell, .dashboard-charts > *, .achievement-list');
  animatedEls.forEach((el, index) => {
    el.classList.add('dashboard-animate');
    el.style.setProperty('--enter-delay', `${Math.min(index * 70, 420)}ms`);
  });

  if (didPrimeDashboard || prefersReducedMotion()) {
    panel.classList.add('is-ready');
    didPrimeDashboard = true;
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.classList.add('is-ready');
      didPrimeDashboard = true;
    });
  });
}

function renderLineChart(series = []) {
  const canvas = document.getElementById('dailyMinutesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (lineChart) lineChart.destroy();
  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, 'rgba(108, 229, 255, 0.42)');
  gradient.addColorStop(1, 'rgba(108, 229, 255, 0.02)');

  lineChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: series.map((d) => d.date.slice(5)),
      datasets: [
        {
          label: 'Daily Minutes',
          data: series.map((d) => d.minutes),
          borderColor: '#6ce5ff',
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointRadius: 2.5,
          pointHoverRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: makeAnimationOption(),
      layout: {
        padding: isDesktopDashboardViewport() ? { top: 2, right: 4, bottom: 0, left: 0 } : { top: 6, right: 8, bottom: 0, left: 0 }
      },
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: '#cfd8ea', maxTicksLimit: isDesktopDashboardViewport() ? 7 : 10, font: { size: isDesktopDashboardViewport() ? 10 : 11 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.08)' },
          ticks: { color: '#cfd8ea', maxTicksLimit: isDesktopDashboardViewport() ? 4 : 6, font: { size: isDesktopDashboardViewport() ? 10 : 11 } }
        }
      }
    }
  });
}

function renderDonutChart(perPageHours) {
  const canvas = document.getElementById('contentRatioChart');
  if (!canvas) return;
  if (donutChart) donutChart.destroy();

  donutChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Imitation', 'Slash', 'Shadowing', 'SRS'],
      datasets: [
        {
          data: [perPageHours.imitation, perPageHours.slash, perPageHours.shadowing, perPageHours.srs],
          backgroundColor: ['#4ecbff', '#ffc46b', '#ff9f8b', '#91f2a2'],
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: isDesktopDashboardViewport() ? '68%' : '62%',
      animation: makeAnimationOption(),
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#e0e8f8',
            boxWidth: isDesktopDashboardViewport() ? 9 : 12,
            boxHeight: isDesktopDashboardViewport() ? 9 : 12,
            padding: isDesktopDashboardViewport() ? 10 : 16,
            font: { size: isDesktopDashboardViewport() ? 10 : 12 }
          }
        }
      }
    }
  });
}

function renderCumulativeChart(series = []) {
  const canvas = document.getElementById('cumulativeInAppChart');
  if (!canvas) return;
  if (cumulativeChart) cumulativeChart.destroy();
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imitationGradient = ctx.createLinearGradient(0, 0, 0, 220);
  imitationGradient.addColorStop(0, 'rgba(78, 203, 255, 0.42)');
  imitationGradient.addColorStop(1, 'rgba(78, 203, 255, 0.03)');

  const slashGradient = ctx.createLinearGradient(0, 0, 0, 220);
  slashGradient.addColorStop(0, 'rgba(255, 196, 107, 0.38)');
  slashGradient.addColorStop(1, 'rgba(255, 196, 107, 0.03)');

  const shadowingGradient = ctx.createLinearGradient(0, 0, 0, 220);
  shadowingGradient.addColorStop(0, 'rgba(255, 159, 139, 0.34)');
  shadowingGradient.addColorStop(1, 'rgba(255, 159, 139, 0.03)');

  const srsGradient = ctx.createLinearGradient(0, 0, 0, 220);
  srsGradient.addColorStop(0, 'rgba(145, 242, 162, 0.34)');
  srsGradient.addColorStop(1, 'rgba(145, 242, 162, 0.03)');

  cumulativeChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: series.map((d) => d.date),
      datasets: [
        {
          label: 'Imitation',
          data: series.map((d) => d.imitationHours),
          borderColor: '#4ecbff',
          backgroundColor: imitationGradient,
          stack: 'inAppHours',
          fill: true,
          tension: 0.24,
          pointRadius: 0,
          pointHoverRadius: 3
        },
        {
          label: 'Slash',
          data: series.map((d) => d.slashHours),
          borderColor: '#ffc46b',
          backgroundColor: slashGradient,
          stack: 'inAppHours',
          fill: true,
          tension: 0.24,
          pointRadius: 0,
          pointHoverRadius: 3
        },
        {
          label: 'Shadowing',
          data: series.map((d) => d.shadowingHours),
          borderColor: '#ff9f8b',
          backgroundColor: shadowingGradient,
          stack: 'inAppHours',
          fill: true,
          tension: 0.24,
          pointRadius: 0,
          pointHoverRadius: 3
        },
        {
          label: 'SRS',
          data: series.map((d) => d.srsHours),
          borderColor: '#91f2a2',
          backgroundColor: srsGradient,
          stack: 'inAppHours',
          fill: true,
          tension: 0.24,
          pointRadius: 0,
          pointHoverRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: makeAnimationOption(),
      layout: {
        padding: isDesktopDashboardViewport() ? { top: 2, right: 4, bottom: 0, left: 0 } : { top: 6, right: 8, bottom: 0, left: 0 }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#e0e8f8',
            boxWidth: isDesktopDashboardViewport() ? 9 : 12,
            boxHeight: isDesktopDashboardViewport() ? 9 : 12,
            padding: isDesktopDashboardViewport() ? 10 : 16,
            font: { size: isDesktopDashboardViewport() ? 10 : 12 }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: {
            color: '#cfd8ea',
            autoSkip: true,
            maxTicksLimit: isDesktopDashboardViewport() ? 7 : 10,
            font: { size: isDesktopDashboardViewport() ? 10 : 11 }
          },
          stacked: true
        },
        y: {
          beginAtZero: true,
          stacked: true,
          grid: { color: 'rgba(255,255,255,0.08)' },
          ticks: {
            color: '#cfd8ea',
            maxTicksLimit: isDesktopDashboardViewport() ? 4 : 6,
            font: { size: isDesktopDashboardViewport() ? 10 : 11 },
            callback: (value) => `${value}h`
          }
        }
      }
    }
  });
}

export function renderDashboard(snapshot) {
  if (!snapshot) return;

  primeDashboardMotion();

  animateTextNumber('kpiTotalHours', snapshot.totalHours, hoursLabel, { decimals: 1, duration: 900 });
  const breakdownParts = [`In-app ${hoursLabel(snapshot.inAppHours)}`];
  if ((snapshot.externalEventHours || 0) > 0) breakdownParts.push(`Logged ${hoursLabel(snapshot.externalEventHours)}`);
  if ((snapshot.externalCarryoverHours || 0) > 0) breakdownParts.push(`Carryover ${hoursLabel(snapshot.externalCarryoverHours)}`);
  setText('kpiTotalBreakdown', breakdownParts.join(' + '));
  animateTextNumber('kpiRemaining', snapshot.remainingHours, hoursLabel, { decimals: 1, duration: 820 });
  animateTextNumber('kpiGoalProgress', snapshot.goalProgress * 100, (value) => `${Math.round(value)}%`, { duration: 840 });
  animateTextNumber('kpiImitation', snapshot.perPageHours.imitation, hoursLabel, { decimals: 1, duration: 760 });
  animateTextNumber('kpiSlash', snapshot.perPageHours.slash, hoursLabel, { decimals: 1, duration: 760 });
  animateTextNumber('kpiShadowing', snapshot.perPageHours.shadowing, hoursLabel, { decimals: 1, duration: 760 });
  animateTextNumber('kpiSrs', snapshot.perPageHours.srs, hoursLabel, { decimals: 1, duration: 760 });
  setText('kpiNextMilestone', snapshot.nextMilestone ? `${snapshot.nextMilestone}h` : 'Complete');

  const fill = document.getElementById('goalProgressFill');
  if (fill) fill.style.width = `${Math.round(snapshot.goalProgress * 100)}%`;

  renderAchievements(snapshot.achievements);
  renderLineChart(snapshot.dailySeries);
  renderDonutChart(snapshot.perPageHours);
  renderCumulativeChart(snapshot.cumulativeInAppPerPageSeries || []);
}

export function clearDashboardCharts() {
  destroyCharts();
}
