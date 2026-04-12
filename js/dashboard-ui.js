import ApexCharts from 'https://esm.sh/apexcharts@4.5.0';

let dailyChart = null;
let ratioChart = null;
let cumulativeChart = null;
let didPrimeDashboard = false;
const animatedNumbers = new Map();

const CONTENT_COLORS = {
  imitation: '#4ea8b7',
  slash: '#f1a85b',
  shadowing: '#ef7d6c',
  srs: '#77b26d',
  external: '#a78ae8'
};

function isDesktopDashboardViewport() {
  return window.matchMedia('(min-width: 961px)').matches;
}

function hoursLabel(hours) {
  return `${hours.toFixed(1)}h`;
}

function minutesLabelFromSeconds(seconds) {
  const totalMinutes = Math.round(Math.max(0, Number(seconds || 0)) / 60);
  if (totalMinutes >= 60) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m > 0 ? `${h}時間${m}分` : `${h}時間`;
  }
  return `${totalMinutes}分`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getChartAnimation() {
  if (prefersReducedMotion()) return { enabled: false };
  return {
    enabled: true,
    easing: 'easeinout',
    speed: 860,
    animateGradually: {
      enabled: true,
      delay: 65
    },
    dynamicAnimation: {
      enabled: true,
      speed: 520
    }
  };
}

function getSharedChartOptions() {
  const desktop = isDesktopDashboardViewport();
  return {
    chart: {
      background: 'transparent',
      toolbar: { show: false },
      zoom: { enabled: false },
      foreColor: '#56463f',
      animations: getChartAnimation(),
      parentHeightOffset: 0,
      sparkline: { enabled: false }
    },
    grid: {
      borderColor: 'rgba(127, 100, 86, 0.16)',
      strokeDashArray: 5,
      padding: {
        top: desktop ? 4 : 2,
        right: desktop ? 10 : 4,
        bottom: desktop ? 0 : 2,
        left: desktop ? 6 : 2
      }
    },
    legend: {
      fontFamily: 'JetBrains Mono, monospace',
      labels: { colors: '#6d5a52' }
    },
    tooltip: {
      theme: 'dark',
      style: {
        fontSize: desktop ? '12px' : '11px',
        fontFamily: 'JetBrains Mono, monospace'
      }
    },
    dataLabels: {
      enabled: false
    },
    stroke: {
      curve: 'smooth'
    },
    xaxis: {
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: {
          colors: '#7e6559',
          fontSize: desktop ? '10px' : '11px',
          fontFamily: 'JetBrains Mono, monospace'
        }
      }
    },
    yaxis: {
      labels: {
        style: {
          colors: '#7e6559',
          fontSize: desktop ? '10px' : '11px',
          fontFamily: 'JetBrains Mono, monospace'
        }
      }
    }
  };
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

function renderTodayGauges(todayBreakdown = {}) {
  const perPageSeconds = todayBreakdown.perPageSeconds || {};
  const totalSeconds = Math.max(0, Number(todayBreakdown.totalSeconds || 0));
  const totalShareBase = totalSeconds > 0 ? totalSeconds : 0;

  setText('todayStudyTotal', minutesLabelFromSeconds(totalSeconds));

  [
    ['Imitation', 'imitation'],
    ['Slash', 'slash'],
    ['Shadowing', 'shadowing'],
    ['Srs', 'srs'],
    ['External', 'external']
  ].forEach(([prefix, key]) => {
    const seconds = Math.max(0, Number(perPageSeconds[key] || 0));
    setText(`today${prefix}Value`, minutesLabelFromSeconds(seconds));
    const fill = document.getElementById(`today${prefix}Fill`);
    if (fill) {
      const ratio = totalShareBase > 0 ? seconds / totalShareBase : 0;
      fill.style.width = `${Math.round(ratio * 100)}%`;
    }
  });
}

function destroyCharts() {
  [dailyChart, ratioChart, cumulativeChart].forEach((chart) => {
    if (chart) chart.destroy();
  });
  dailyChart = null;
  ratioChart = null;
  cumulativeChart = null;
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
    const eased = 1 - ((1 - progress) ** 3);
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

  const animatedEls = panel.querySelectorAll('.dashboard-head, .dashboard-kpis > *, .goal-progress-shell, .today-focus-card, .dashboard-charts > *, .achievement-list');
  animatedEls.forEach((el, index) => {
    el.classList.add('dashboard-animate');
    el.style.setProperty('--enter-delay', `${Math.min(index * 80, 520)}ms`);
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

function findPeakDay(series = []) {
  return series.reduce((best, item) => {
    if (!best || Number(item.minutes || 0) > Number(best.minutes || 0)) return item;
    return best;
  }, null);
}

function topContentEntries(perPageHours = {}) {
  return [
    ['Imitation', Number(perPageHours.imitation || 0)],
    ['Slash', Number(perPageHours.slash || 0)],
    ['Shadowing', Number(perPageHours.shadowing || 0)],
    ['SRS', Number(perPageHours.srs || 0)]
  ].sort((a, b) => b[1] - a[1]);
}

function renderChartMeta(snapshot) {
  const peakDay = findPeakDay(snapshot.dailySeries || []);
  const ordered = topContentEntries(snapshot.perPageHours || {});
  const leader = ordered[0] || ['Imitation', 0];
  const runner = ordered[1] || ['Slash', 0];
  const latestCumulative = snapshot.cumulativeInAppPerPageSeries?.at?.(-1) || null;

  setText(
    'dailyMinutesMeta',
    peakDay ? `Peak ${peakDay.date.slice(5)} · ${Math.round(Number(peakDay.minutes || 0))}m` : 'No activity yet'
  );
  setText('dailyMinutesGlow', snapshot.momentum?.trend === 'up' ? 'Momentum Up' : snapshot.momentum?.trend === 'down' ? 'Momentum Cooling' : 'Steady');

  setText('contentRatioLead', `${leader[0]} leads`);
  setText('contentRatioMix', `${hoursLabel(leader[1])} / ${hoursLabel(runner[1] || 0)}`);

  if (latestCumulative) {
    setText('cumulativeInAppMeta', `${hoursLabel(latestCumulative.totalHours || 0)} total`);
    setText(
      'cumulativeInAppBreakdown',
      `I ${hoursLabel(latestCumulative.imitationHours || 0)} · S ${hoursLabel(latestCumulative.slashHours || 0)} · Sh ${hoursLabel(latestCumulative.shadowingHours || 0)} · R ${hoursLabel(latestCumulative.srsHours || 0)}`
    );
    return;
  }

  setText('cumulativeInAppMeta', '0.0h total');
  setText('cumulativeInAppBreakdown', 'I 0.0h · S 0.0h · Sh 0.0h · R 0.0h');
}

function renderDailyChart(series = []) {
  const mount = document.getElementById('dailyMinutesChart');
  if (!mount) return;

  const shared = getSharedChartOptions();
  const labels = series.map((d) => d.date.slice(5));
  const values = series.map((d) => Number(d.minutes || 0));

  dailyChart = new ApexCharts(mount, {
    ...shared,
    chart: {
      ...shared.chart,
      type: 'area',
      height: '100%',
      dropShadow: prefersReducedMotion() ? { enabled: false } : {
        enabled: true,
        top: 16,
        blur: 24,
        color: CONTENT_COLORS.imitation,
        opacity: 0.24
      }
    },
    series: [
      {
        name: 'Daily Minutes',
        data: values
      }
    ],
    colors: [CONTENT_COLORS.imitation],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 0.5,
        opacityFrom: 0.62,
        opacityTo: 0.04,
        stops: [0, 68, 100]
      }
    },
    stroke: {
      curve: 'smooth',
      width: 3
    },
    markers: {
      size: 0,
      hover: {
        size: 6
      }
    },
    xaxis: {
      ...shared.xaxis,
      categories: labels,
      tickAmount: isDesktopDashboardViewport() ? 6 : 5
    },
    yaxis: {
      ...shared.yaxis,
      min: 0,
      forceNiceScale: true,
      decimalsInFloat: 0,
      title: {
        text: 'Minutes',
        style: {
          color: '#dbe6ff',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '11px'
        }
      }
    },
    tooltip: {
      ...shared.tooltip,
      y: {
        formatter: (value) => `${Number(value || 0).toFixed(1)} min`
      }
    }
  });

  dailyChart.render();
}

function renderRatioChart(perPageHours = {}) {
  const mount = document.getElementById('contentRatioChart');
  if (!mount) return;

  const shared = getSharedChartOptions();
  const values = [
    Number(perPageHours.imitation || 0),
    Number(perPageHours.slash || 0),
    Number(perPageHours.shadowing || 0),
    Number(perPageHours.srs || 0)
  ];
  const total = values.reduce((sum, value) => sum + value, 0);

  ratioChart = new ApexCharts(mount, {
    ...shared,
    chart: {
      ...shared.chart,
      type: 'donut',
      height: '100%'
    },
    labels: ['Imitation', 'Slash', 'Shadowing', 'SRS'],
    series: values,
    colors: [
      CONTENT_COLORS.imitation,
      CONTENT_COLORS.slash,
      CONTENT_COLORS.shadowing,
      CONTENT_COLORS.srs
    ],
    legend: {
      ...shared.legend,
      position: isDesktopDashboardViewport() ? 'bottom' : 'bottom',
      horizontalAlign: 'center',
      itemMargin: {
        horizontal: 10,
        vertical: 6
      }
    },
    plotOptions: {
      pie: {
        expandOnClick: !prefersReducedMotion(),
        donut: {
          size: isDesktopDashboardViewport() ? '72%' : '68%',
          labels: {
            show: true,
            name: {
              show: true,
              offsetY: 18,
              color: '#c6d6f4',
              fontFamily: 'JetBrains Mono, monospace'
            },
            value: {
              show: true,
              offsetY: -18,
              color: '#f5f7ff',
              fontSize: isDesktopDashboardViewport() ? '22px' : '18px',
              fontWeight: '700',
              formatter: (value) => hoursLabel(Number(value || 0))
            },
            total: {
              show: true,
              label: 'In-app',
              color: '#93a8cf',
              fontFamily: 'JetBrains Mono, monospace',
              formatter: () => hoursLabel(total)
            }
          }
        }
      }
    },
    dataLabels: {
      enabled: isDesktopDashboardViewport(),
      formatter: (_, opts) => opts.w.config.labels[opts.seriesIndex]
    },
    stroke: {
      width: 0
    },
    tooltip: {
      ...shared.tooltip,
      y: {
        formatter: (value) => hoursLabel(Number(value || 0))
      }
    }
  });

  ratioChart.render();
}

function renderCumulativeChart(series = []) {
  const mount = document.getElementById('cumulativeInAppChart');
  if (!mount) return;

  const shared = getSharedChartOptions();

  cumulativeChart = new ApexCharts(mount, {
    ...shared,
    chart: {
      ...shared.chart,
      type: 'area',
      stacked: true,
      height: '100%',
      dropShadow: prefersReducedMotion() ? { enabled: false } : {
        enabled: true,
        top: 22,
        blur: 28,
        color: '#4f8fff',
        opacity: 0.16
      }
    },
    series: [
      { name: 'Imitation', data: series.map((d) => Number(d.imitationHours || 0)) },
      { name: 'Slash', data: series.map((d) => Number(d.slashHours || 0)) },
      { name: 'Shadowing', data: series.map((d) => Number(d.shadowingHours || 0)) },
      { name: 'SRS', data: series.map((d) => Number(d.srsHours || 0)) }
    ],
    colors: [
      CONTENT_COLORS.imitation,
      CONTENT_COLORS.slash,
      CONTENT_COLORS.shadowing,
      CONTENT_COLORS.srs
    ],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 0.5,
        opacityFrom: 0.58,
        opacityTo: 0.06,
        stops: [0, 92, 100]
      }
    },
    stroke: {
      curve: 'smooth',
      width: 2.6
    },
    markers: {
      size: 0,
      hover: {
        size: 4
      }
    },
    legend: {
      ...shared.legend,
      position: 'top',
      horizontalAlign: 'left',
      floating: false
    },
    xaxis: {
      ...shared.xaxis,
      categories: series.map((d) => d.date),
      tickAmount: isDesktopDashboardViewport() ? 7 : 5
    },
    yaxis: {
      ...shared.yaxis,
      min: 0,
      title: {
        text: 'Hours',
        style: {
          color: '#dbe6ff',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '11px'
        }
      },
      labels: {
        ...shared.yaxis.labels,
        formatter: (value) => `${Number(value || 0).toFixed(0)}h`
      }
    },
    tooltip: {
      ...shared.tooltip,
      shared: true,
      intersect: false,
      y: {
        formatter: (value) => hoursLabel(Number(value || 0))
      }
    }
  });

  cumulativeChart.render();
}

export function renderDashboard(snapshot) {
  if (!snapshot) return;

  primeDashboardMotion();
  destroyCharts();

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

  renderTodayGauges(snapshot.todayBreakdown);
  renderAchievements(snapshot.achievements);
  renderChartMeta(snapshot);
  renderDailyChart(snapshot.dailySeries || []);
  renderRatioChart(snapshot.perPageHours || {});
  renderCumulativeChart(snapshot.cumulativeInAppPerPageSeries || []);
}

export function clearDashboardCharts() {
  destroyCharts();
}
