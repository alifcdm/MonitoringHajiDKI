// Konfigurasi URL CSV dari Google Sheets
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1ZilRO7mP_FYiSOWK1-59h7g3xT9kZeg3p-mMtWUazes/export?format=csv';

let monitoringChart = null;

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
        tr.className = 'hover:bg-slate-50 transition-colors duration-200';
        appendCell(tr, row.kota, 'p-3 font-semibold text-slate-800');
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
        tr.className = 'hover:bg-slate-50 transition-colors duration-200';
        appendCell(tr, row.tanggal);
        appendCell(tr, row.kota, 'p-3 font-semibold text-slate-800');
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
        tr.className = 'hover:bg-slate-50 transition-colors duration-200';
        appendCell(tr, row.kota, 'p-3 font-semibold text-slate-800');
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
                    backgroundColor: '#3b82f6',
                    borderRadius: 4
                },
                {
                    label: 'Passport',
                    data: rows.map(row => row.passport),
                    backgroundColor: '#10b981',
                    borderRadius: 4
                },
                {
                    label: 'BPJS',
                    data: rows.map(row => row.bpjs),
                    backgroundColor: '#f59e0b',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top' } },
            scales: {
                x: { grid: { display: false } },
                y: {
                    beginAtZero: true,
                    ticks: { callback: value => `${value}` }
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

document.addEventListener('DOMContentLoaded', initDashboard);
setInterval(initDashboard, 300000);
