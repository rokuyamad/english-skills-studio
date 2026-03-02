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
  if (lineChart) lineChart.destroy();

  lineChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: series.map((d) => d.date.slice(5)),
      datasets: [
        {
          label: 'Daily Minutes',
          data: series.map((d) => d.minutes),
          borderColor: '#2e7d32',
          backgroundColor: 'rgba(46, 125, 50, 0.16)',
          fill: true,
          tension: 0.35,
          pointRadius: 2
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
        x: { grid: { display: false } },
        y: { beginAtZero: true }
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
          backgroundColor: ['#1b5e20', '#ef6c00', '#0d47a1'],
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: makeAnimationOption(),
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

export function renderDashboard(snapshot, settings) {
  if (!snapshot) return;

  setText('kpiTotalHours', hoursLabel(snapshot.totalHours));
  setText('kpiGoalHours', `${Math.round(settings.goal_hours)}h`);
  setText('kpiRemaining', hoursLabel(snapshot.remainingHours));
  setText('kpiStreak', `${snapshot.streak} days`);
  setText('kpiLevel', `Lv.${snapshot.level.level}`);
  setText('kpiXp', `${snapshot.xp} XP`);
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
