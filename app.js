// Konfigurasi URL CSV dari Google Sheets
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1ZilRO7mP_FYiSOWK1-59h7g3xT9kZeg3p-mMtWUazes/export?format=csv';
const VISITOR_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1Pb9PX6o4Xg2oniZQ_KidfibG5dpvQuoSHOMuhSUXsxc/export?format=csv';

let monitoringChart = null;
let visitorChart = null;

async function fetchSheetData() {
    return new Promise((resolve, reject) => {
        Papa.parse(SHEET_CSV_URL, {
            download: true,
            header: false,
            complete: results => resolve(results.data),
            error: error => reject(error)
        });
    });
}

async function fetchVisitorData() {
    return new Promise((resolve, reject) => {
        Papa.parse(VISITOR_SHEET_CSV_URL, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: results => resolve(results.data),
            error: error => reject(error)
        });
    });
}

function getVisitorCountsByDay(rows, today = new Date()) {
    const dates = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        date.setDate(date.getDate() - (6 - index));
        return date;
    });
    const counts = new Map(dates.map(date => [date.toDateString(), 0]));

    rows.forEach(row => {
        const timestamp = Date.parse(row.Timestamp);
        if (!Number.isFinite(timestamp)) return;
        const date = new Date(timestamp);
        const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toDateString();
        if (counts.has(key)) counts.set(key, counts.get(key) + 1);
    });

    return dates.map(date => ({
        date,
        count: counts.get(date.toDateString())
    }));
}

function renderVisitorChart(dailyCounts) {
    const canvas = document.getElementById('visitorChart');
    if (visitorChart) visitorChart.destroy();

    const valueLabels = {
        id: 'visitorValueLabels',
        afterDatasetsDraw(chart) {
            const { ctx, chartArea } = chart;
            const dataset = chart.data.datasets[0];
            const bars = chart.getDatasetMeta(0).data;

            ctx.save();
            ctx.fillStyle = '#f0dca6';
            ctx.font = '600 12px sans-serif';
            ctx.textAlign = 'center';
            bars.forEach((bar, index) => {
                ctx.fillText(formatNumber(dataset.data[index]), bar.x, Math.max(chartArea.top + 14, bar.y - 8));
            });
            ctx.restore();
        }
    };

    visitorChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        plugins: [valueLabels],
        data: {
            labels: dailyCounts.map(({ date }) => new Intl.DateTimeFormat('id-ID', {
                weekday: 'short', day: 'numeric', month: 'short'
            }).format(date)),
            datasets: [{
                label: 'Jumlah pengunjung',
                data: dailyCounts.map(({ count }) => count),
                backgroundColor: '#c8a858',
                borderRadius: 4,
                maxBarThickness: 48
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#b9ad8f' } },
                y: {
                    beginAtZero: true,
                    grace: '12%',
                    grid: { color: 'rgba(212, 180, 99, 0.14)' },
                    ticks: { color: '#b9ad8f', precision: 0 }
                }
            }
        }
    });
}

async function initVisitorDashboard() {
    const countElement = document.getElementById('visitorCount');
    const dateElement = document.getElementById('visitorCountDate');
    const weekCountElement = document.getElementById('visitorWeekCount');

    try {
        const rows = await fetchVisitorData();
        const dailyCounts = getVisitorCountsByDay(rows);
        const todayCount = dailyCounts[dailyCounts.length - 1].count;
        const weekCount = dailyCounts.reduce((total, day) => total + day.count, 0);

        countElement.textContent = formatNumber(todayCount);
        weekCountElement.textContent = formatNumber(weekCount);
        dateElement.textContent = new Intl.DateTimeFormat('id-ID', {
            dateStyle: 'full'
        }).format(new Date());
        renderVisitorChart(dailyCounts);
    } catch (error) {
        console.error('Gagal memuat data pengunjung:', error);
        countElement.textContent = '—';
        weekCountElement.textContent = '—';
        dateElement.textContent = 'Data pengunjung gagal dimuat.';
    }
}

function parseNumber(value) {
    if (typeof value === 'number') return value;
    const number = Number(String(value || '').replace(/,/g, '').trim());
    return Number.isFinite(number) ? number : 0;
}

function isNumber(value) {
    return value !== '' && Number.isFinite(Number(String(value).replace(/,/g, '').trim()));
}

function formatNumber(value) {
    return new Intl.NumberFormat('id-ID').format(value);
}

function formatPercent(value) {
    return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;
}

function calculatePercentage(value, total) {
    if (!total || total === 0) return 0;
    return (value / total) * 100;
}

function findQuotaRows(rows, knownCities) {
    const quotaRows = [];

    rows.forEach(row => {
        for (let index = 0; index <= row.length - 2; index += 1) {
            const kota = String(row[index] || '').trim();
            const kuota = row[index + 1];

            if (knownCities.has(kota) && isNumber(kuota)) {
                quotaRows.push({ kota, kuota: parseNumber(kuota) });
                break;
            }
        }
    });

    return quotaRows;
}

function aggregateSubmissionRows(rows) {
    const cities = new Map();

    rows.forEach(row => {
        const kota = String(row[1] || '').trim();
        const tanggal = String(row[2] || '').trim();

        if (!kota || kota === 'ASAL KOTA' || !tanggal || Number.isNaN(Date.parse(tanggal))) return;

        const current = cities.get(kota) || {
            kota,
            tanggal,
            svb: 0,
            passport: 0,
            bpjs: 0
        };

        if (Date.parse(tanggal) > Date.parse(current.tanggal)) current.tanggal = tanggal;
        current.svb += parseNumber(row[3]);
        current.passport += parseNumber(row[4]);
        current.bpjs += parseNumber(row[6]);
        cities.set(kota, current);
    });

    return Array.from(cities.values());
}

function getMonitoringRows(rows) {
    return rows
        .filter(row => {
            const kota = String(row[1] || '').trim();
            const tanggal = String(row[2] || '').trim();
            return kota && kota !== 'ASAL KOTA' && tanggal && !Number.isNaN(Date.parse(tanggal));
        })
        .map(row => ({
            tanggal: String(row[2]).trim(),
            kota: String(row[1]).trim(),
            svb: parseNumber(row[3]),
            passport: parseNumber(row[4]),
            bpjs: parseNumber(row[6])
        }));
}

function createPercentageRows(submissionRows, quotaRows) {
    const submissions = new Map(submissionRows.map(row => [row.kota, row]));

    return quotaRows
        .map(({ kota, kuota }) => {
            const submission = submissions.get(kota) || { svb: 0, passport: 0, bpjs: 0 };
            return {
                kota,
                kuota,
                svb: calculatePercentage(submission.svb, kuota),
                passport: calculatePercentage(submission.passport, kuota),
                bpjs: calculatePercentage(submission.bpjs, kuota)
            };
        })
        .sort((a, b) => a.kota.localeCompare(b.kota, 'id'));
}

function appendCell(row, value, className = 'p-3') {
    const cell = document.createElement('td');
    cell.className = className;
    cell.textContent = value;
    row.appendChild(cell);
}

function renderSubmissionTable(rows) {
    const tbody = document.getElementById('submissionTableBody');
    tbody.innerHTML = '';

    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-[#29251b] transition-colors duration-200';
        appendCell(tr, row.kota, 'p-3 font-semibold text-[#e3c66d]');
        appendCell(tr, formatNumber(row.svb), 'p-3 text-right font-medium');
        appendCell(tr, formatNumber(row.passport), 'p-3 text-right font-medium');
        appendCell(tr, formatNumber(row.bpjs), 'p-3 text-right font-medium');
        tbody.appendChild(tr);
    });
}

function renderMonitoringTable(rows) {
    const tbody = document.getElementById('monitoringTableBody');
    tbody.innerHTML = '';

    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-[#29251b] transition-colors duration-200';
        appendCell(tr, row.tanggal);
        appendCell(tr, row.kota, 'p-3 font-semibold text-[#e3c66d]');
        appendCell(tr, formatNumber(row.svb), 'p-3 text-right font-medium');
        appendCell(tr, formatNumber(row.passport), 'p-3 text-right font-medium');
        appendCell(tr, formatNumber(row.bpjs), 'p-3 text-right font-medium');
        tbody.appendChild(tr);
    });
}

function renderPercentageTable(rows) {
    const tbody = document.getElementById('percentageTableBody');
    tbody.innerHTML = '';

    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-[#29251b] transition-colors duration-200';
        appendCell(tr, row.kota, 'p-3 font-semibold text-[#e3c66d] color-[#e3c66d]');
        appendCell(tr, formatNumber(row.kuota), 'p-3 text-right font-medium');
        appendCell(tr, formatPercent(row.svb), 'p-3 text-right font-medium');
        appendCell(tr, formatPercent(row.passport), 'p-3 text-right font-medium');
        appendCell(tr, formatPercent(row.bpjs), 'p-3 text-right font-medium');
        tbody.appendChild(tr);
    });
}

function renderChart(rows) {
    const canvas = document.getElementById('dailyChart');
    if (monitoringChart) monitoringChart.destroy();

    monitoringChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: rows.map(row => row.kota),
            datasets: [
                {
                    label: 'SVB',
                    data: rows.map(row => row.svb),
                    backgroundColor: '#c8a858',
                    borderRadius: 4
                },
                {
                    label: 'Passport',
                    data: rows.map(row => row.passport),
                    backgroundColor: '#efe4c9',
                    borderRadius: 4
                },
                {
                    label: 'BPJS',
                    data: rows.map(row => row.bpjs),
                    backgroundColor: '#a95e49',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top', labels: { color: '#ded6c4' } } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#b9ad8f' } },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(212, 180, 99, 0.14)' },
                    ticks: { color: '#b9ad8f', callback: value => `${value}` }
                }
            }
        }
    });
}

async function initDashboard() {
    try {
        const rows = await fetchSheetData();
        const monitoringRows = getMonitoringRows(rows)
            .sort((a, b) => Date.parse(b.tanggal) - Date.parse(a.tanggal));
        const submissionRows = aggregateSubmissionRows(rows)
            .sort((a, b) => a.kota.localeCompare(b.kota, 'id'));
        const quotaRows = findQuotaRows(rows, new Set(submissionRows.map(row => row.kota)));
        const percentageRows = createPercentageRows(submissionRows, quotaRows);

        if (!monitoringRows.length || !submissionRows.length || !percentageRows.length) {
            throw new Error('Data kota atau kuota tidak ditemukan.');
        }

        renderMonitoringTable(monitoringRows);
        renderSubmissionTable(submissionRows);
        renderPercentageTable(percentageRows);
        renderChart(submissionRows);
    } catch (error) {
        console.error('Gagal memuat dashboard:', error);
        document.querySelectorAll('tbody').forEach(tbody => {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-600">Data gagal dimuat.</td></tr>';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    initVisitorDashboard();
});
setInterval(() => {
    initDashboard();
    initVisitorDashboard();
}, 30000);
