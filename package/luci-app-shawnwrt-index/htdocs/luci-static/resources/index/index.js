(function() {
    function formatSpeed(bytes) {
        if (!bytes || bytes === 0) return '0 B/s';
        const k = 1024, sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    const canvas = document.getElementById('sw-main-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const MAX_PTS = 60;
    const history = { down: new Array(MAX_PTS).fill(0), up: new Array(MAX_PTS).fill(0) };

    function drawChart() {
        const w = canvas.width = canvas.parentElement.clientWidth * window.devicePixelRatio;
        const h = canvas.height = canvas.parentElement.clientHeight * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        const dw = canvas.parentElement.clientWidth, dh = canvas.parentElement.clientHeight;
        ctx.clearRect(0, 0, dw, dh);
        const maxVal = Math.max(...history.down, ...history.up, 1024 * 50);
        const stepX = dw / (MAX_PTS - 1);

        function drawLine(data, color, fill) {
            ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round';
            for (let i = 0; i < MAX_PTS; i++) {
                const x = i * stepX, y = dh - (data[i] / maxVal) * (dh - 40) - 20;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke(); ctx.lineTo(dw, dh); ctx.lineTo(0, dh); ctx.fillStyle = fill; ctx.fill();
        }

        const gD = ctx.createLinearGradient(0, 0, 0, dh); gD.addColorStop(0, 'rgba(0,122,255,0.2)'); gD.addColorStop(1, 'transparent');
        const gU = ctx.createLinearGradient(0, 0, 0, dh); gU.addColorStop(0, 'rgba(88,86,214,0.2)'); gU.addColorStop(1, 'transparent');

        drawLine(history.down, '#007aff', gD);
        drawLine(history.up, '#5856d6', gU);
    }

    let lastT = null, lastM = Date.now();
    async function update() {
        if (!window.SW_API || !window.SW_API.status) return;
        try {
            const res = await fetch(window.SW_API.status, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const r = data.result || {};

            if (r.hostname) document.getElementById('sw-dev-name').textContent = r.hostname;
            if (r.uptime) {
                const s = parseInt(r.uptime), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sc = s%60;
                document.getElementById('sw-uptime-val').textContent = `Uptime: ${h}h ${m}m ${sc}s`;
            }
            if (r.cpuUsage !== undefined) {
                document.getElementById('sw-cpu-label').textContent = r.cpuUsage + '%';
                document.getElementById('sw-cpu-fill').style.width = r.cpuUsage + '%';
            }
            if (r.memoryUsage !== undefined) {
                document.getElementById('sw-mem-label').textContent = r.memoryUsage + '%';
                document.getElementById('sw-mem-fill').style.width = r.memoryUsage + '%';
            }
            if (r.cpuTemperature) document.getElementById('sw-temp-label').textContent = parseFloat(r.cpuTemperature).toFixed(1) + ' °C';

            const nI = document.getElementById('sw-net-status');
            const nT = nI.querySelector('.sw-status-text');
            if (r.wan_ip && r.wan_ip !== '0.0.0.0') {
                nI.className = 'sw-status online'; nT.textContent = '网络已连接';
            } else {
                nI.className = 'sw-status offline'; nT.textContent = '检测互联网连接...';
            }

            if (r.traffic) {
                const now = Date.now(), dt = (now - lastM) / 1000;
                if (lastT && dt > 0) {
                    const dS = (r.traffic.rx_bytes - lastT.rx_bytes) / dt, uS = (r.traffic.tx_bytes - lastT.tx_bytes) / dt;
                    history.down.shift(); history.down.push(dS); history.up.shift(); history.up.push(uS);
                    document.getElementById('sw-down-speed').textContent = formatSpeed(dS);
                    document.getElementById('sw-up-speed').textContent = formatSpeed(uS);
                    drawChart();
                }
                lastT = r.traffic; lastM = now;
            }

            if (r.interfaces) {
                document.getElementById('sw-if-list-box').innerHTML = r.interfaces.map(i => `
                    <div class="sw-if-row">
                        <div class="sw-if-data">
                            <div class="sw-if-name">${i.name} <small style="opacity:0.6">${i.device||''}</small></div>
                            <div class="sw-if-ip">${i.ip||'--'}</div>
                        </div>
                        <div style="font-weight:600">${i.speed?i.speed+'M':''}</div>
                    </div>
                `).join('');
            }
        } catch (e) {
            console.error(e);
            document.getElementById('sw-net-status').querySelector('.sw-status-text').textContent = 'API 连接失败';
        }
    }

    async function checkOTA() {
        if (!window.SW_API || !window.SW_API.checkUpdate) return;
        try {
            const res = await fetch(window.SW_API.checkUpdate);
            const data = await res.json();
            if (data.update_available) document.getElementById('sw-ota-badge').classList.remove('hidden');
        } catch (e) {}
    }

    setInterval(update, 2000); update();
    checkOTA();
    window.addEventListener('resize', drawChart);
})();
