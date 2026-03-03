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
}

function makeAnimationOption() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? { duration: 0 }
    : { duration: 500 };
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
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#cfd8ea' } },
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.08)' }, ticks: { color: '#cfd8ea' } }
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
      labels: ['Imitation', 'Slash', 'Shadowing'],
      datasets: [
        {
          data: [perPageHours.imitation, perPageHours.slash, perPageHours.shadowing],
          backgroundColor: ['#4ecbff', '#ffc46b', '#ff9f8b'],
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: makeAnimationOption(),
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e0e8f8' } }
      }
    }
  });
}

export function renderDashboard(snapshot) {
  if (!snapshot) return;

  setText('kpiTotalHours', hoursLabel(snapshot.totalHours));
  setText('kpiTotalBreakdown', `In-app ${hoursLabel(snapshot.inAppHours)} + External ${hoursLabel(snapshot.externalCarryoverHours)}`);
  setText('kpiRemaining', hoursLabel(snapshot.remainingHours));
  setText('kpiGoalProgress', percentLabel(snapshot.goalProgress));
  setText('kpiImitation', hoursLabel(snapshot.perPageHours.imitation));
  setText('kpiSlash', hoursLabel(snapshot.perPageHours.slash));
  setText('kpiShadowing', hoursLabel(snapshot.perPageHours.shadowing));
  setText('kpiNextMilestone', snapshot.nextMilestone ? `${snapshot.nextMilestone}h` : 'Complete');

  const fill = document.getElementById('goalProgressFill');
  if (fill) fill.style.width = `${Math.round(snapshot.goalProgress * 100)}%`;

  renderAchievements(snapshot.achievements);
  renderLineChart(snapshot.dailySeries);
  renderDonutChart(snapshot.perPageHours);
}

export function clearDashboardCharts() {
  destroyCharts();
}
