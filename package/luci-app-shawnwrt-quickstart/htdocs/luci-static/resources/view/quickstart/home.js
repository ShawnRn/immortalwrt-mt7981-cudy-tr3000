'use strict';
'require view';
'require rpc';
'require poll';
'require dom';
'require fs';

return view.extend({
	callSystemBoard: rpc.declare({ object: 'system', method: 'board' }),
	callSystemInfo: rpc.declare({ object: 'system', method: 'info', noCache: true }),
	callTempInfo: rpc.declare({ object: 'luci', method: 'getTempInfo', noCache: true }),
	callNetworkDevices: rpc.declare({ object: 'network.device', method: 'status', noCache: true }),
	callNetworkInterfaceDump: rpc.declare({ object: 'network.interface', method: 'dump', noCache: true }),
	callDHCPLeases: rpc.declare({ object: 'luci-rpc', method: 'getDHCPLeases', noCache: true }),

	history: {
		down: Array(40).fill(0),
		up: Array(40).fill(0),
		lastRx: 0,
		lastTx: 0,
		lastAt: 0,
		devices: {}
	},

	t: function(en, zh) {
		var translated = _(en);

		if (translated && translated !== en)
			return translated;

		return ((navigator.language || '').indexOf('zh') === 0) ? zh : en;
	},

	guard: function(promise, fallback) {
		return promise.catch(function() {
			return fallback;
		});
	},

	load: function() {
		return Promise.all([
			this.guard(this.callSystemBoard(), {}),
			this.guard(this.callSystemInfo(), {}),
			this.guard(this.callTempInfo(), {}),
			this.guard(this.callNetworkDevices(), {}),
			this.guard(this.callNetworkInterfaceDump(), {}),
			this.guard(this.callDHCPLeases(), {}),
			this.guard(fs.exec('/usr/bin/shawnwrt-ota', [ 'status' ]), { stdout: '' })
		]);
	},

	loadSlow: function() {
		return Promise.all([
			this.guard(this.callSystemInfo(), {}),
			this.guard(this.callTempInfo(), {}),
			this.guard(this.callNetworkInterfaceDump(), {}),
			this.guard(this.callDHCPLeases(), {}),
			this.guard(fs.exec('/usr/bin/shawnwrt-ota', [ 'status' ]), { stdout: '' })
		]);
	},

	render: function(data) {
		this.injectStyle();

		var tr = L.bind(this.t, this);

		var page = E('div', { 'class': 'qs-page' }, [
			E('section', { 'class': 'qs-card qs-top' }, [
				E('div', { 'class': 'qs-router-title' }, [
					E('div', { 'class': 'qs-kicker' }, [ 'ShawnWrt QuickStart' ]),
					E('div', { 'class': 'qs-title-line' }, [
						E('span', { 'class': 'qs-icon qs-icon-router' }),
						E('h1', { 'id': 'qs-router-name' }, [ 'ShawnWrt' ])
					]),
					E('p', { 'id': 'qs-router-model' }, [ 'Cudy TR3000' ])
				]),
				E('div', { 'class': 'qs-top-right' }, [
					E('div', { 'id': 'qs-ota-pill', 'class': 'qs-pill qs-ota-pill hidden' }, [ tr('OTA update', 'OTA 可更新') ]),
					E('div', { 'id': 'qs-online-pill', 'class': 'qs-pill qs-online-pill' }, [
						E('span'),
						E('b', [ tr('Checking', '检测中') ])
					]),
					E('div', { 'class': 'qs-uptime-box' }, [
						E('span', [ tr('Uptime', '启动时间') ]),
						E('strong', { 'id': 'qs-uptime' }, [ '--' ])
					])
				])
			]),

			E('section', { 'class': 'qs-card qs-traffic-card' }, [
				E('div', { 'class': 'qs-section-head' }, [
						E('div', [
							E('h2', [ E('span', { 'class': 'qs-icon qs-icon-traffic' }), tr('Realtime Speed', '实时速度') ]),
							E('p', [ tr('Download and upload update automatically', '下载与上传速度动态更新') ])
						]),
					E('div', { 'class': 'qs-speed-readout' }, [
						E('span', { 'id': 'qs-down-speed', 'class': 'down' }, [ '↓ 0 B/s' ]),
						E('span', { 'id': 'qs-up-speed', 'class': 'up' }, [ '↑ 0 B/s' ])
					])
				]),
				E('div', { 'class': 'qs-speed-chart' }, [
					E('canvas', { 'id': 'qs-speed-canvas', 'width': '960', 'height': '240' })
				])
			]),

			E('section', { 'class': 'qs-two-col' }, [
				E('article', { 'class': 'qs-card qs-interfaces-card' }, [
					E('div', { 'class': 'qs-section-head' }, [
						E('div', [
							E('h2', [ E('span', { 'class': 'qs-icon qs-icon-port' }), tr('Network Interfaces', '网络接口情况') ]),
							E('p', [ tr('IP address, negotiated speed and device name', 'IP 地址、协商速率与接口设备名') ])
						])
					]),
					E('div', { 'id': 'qs-interface-list', 'class': 'qs-interface-list' })
				]),
				E('article', { 'class': 'qs-card qs-hardware-card' }, [
					E('div', { 'class': 'qs-section-head' }, [
						E('div', [
							E('h2', [ E('span', { 'class': 'qs-icon qs-icon-chip' }), tr('Hardware Resources', '硬件资源') ]),
							E('p', [ tr('CPU, memory and temperature', 'CPU、内存与温度') ])
						])
					]),
					E('div', { 'class': 'qs-resource-grid' }, [
						this.resourceCard('cpu', tr('CPU Load', 'CPU 负载'), '--%'),
						this.resourceCard('memory', tr('Memory Used', '内存占用'), '--%'),
						this.resourceCard('temp', tr('Temperature', '温度'), '-- C'),
						this.resourceCard('clients', tr('Clients', '在线设备'), '--')
					])
				])
			]),

			E('section', { 'class': 'qs-card qs-actions' }, [
				E('a', { 'href': L.url('admin/network/network') }, [ tr('Network', '网络设置') ]),
				E('a', { 'href': L.url('admin/network/wireless') }, [ tr('Wireless', '无线网络') ]),
				E('a', { 'href': L.url('admin/status/channel_analysis') }, [ tr('Channel Analysis', '信道分析') ]),
				E('a', { 'href': L.url('admin/system/shawnwrt_ota') }, [ tr('OTA', '在线升级') ]),
				E('a', { 'href': L.url('admin/system/admin') }, [ tr('System', '系统设置') ])
			])
		]);

		this.update(page, data);
		poll.add(L.bind(function() {
			return this.guard(this.callNetworkDevices(), {}).then(L.bind(function(devices) {
				this.renderTraffic(page, devices || {});
			}, this));
		}, this), 2);
		poll.add(L.bind(function() {
			return this.loadSlow().then(L.bind(function(next) {
				this.updateSlow(page, next);
			}, this));
		}, this), 12);

		return page;
	},

	resourceCard: function(key, label, value) {
		return E('div', { 'class': 'qs-resource qs-resource-' + key }, [
			E('div', { 'class': 'qs-resource-top' }, [
				E('span', [ label ]),
				E('i')
			]),
			E('strong', { 'id': 'qs-resource-' + key }, [ value ]),
			E('div', { 'class': 'qs-meter' }, [
				E('em', { 'id': 'qs-resource-' + key + '-bar', 'style': 'width:0%' })
			])
		]);
	},

	update: function(page, data) {
		var board = data[0] || {};
		var info = data[1] || {};
		var temp = data[2] || {};
		var devices = data[3] || {};
		var dump = data[4] || {};
		var leases = data[5] || {};
		var ota = data[6] || {};
		var clients = this.clients(leases);
		var online = this.isOnline(dump);

		this.text(page, '#qs-router-name', board.hostname || 'ShawnWrt');
		this.text(page, '#qs-router-model', board.model || 'Cudy TR3000');
		this.text(page, '#qs-uptime', this.formatUptime(info.uptime || 0));
		this.renderOnline(page, online);
		this.renderOta(page, ota);
		this.renderTraffic(page, devices);
		this.history.devices = devices;
		this.renderInterfaces(page, dump, devices);
		this.renderResources(page, info, temp, clients.length);
	},

	updateSlow: function(page, data) {
		var info = data[0] || {};
		var temp = data[1] || {};
		var dump = data[2] || {};
		var leases = data[3] || {};
		var ota = data[4] || {};
		var clients = this.clients(leases);

		this.text(page, '#qs-uptime', this.formatUptime(info.uptime || 0));
		this.renderOnline(page, this.isOnline(dump));
		this.renderOta(page, ota);
		this.renderInterfaces(page, dump, this.history.devices || {});
		this.renderResources(page, info, temp, clients.length);
	},

	renderOnline: function(page, online) {
		var node = page.querySelector('#qs-online-pill');

		if (!node)
			return;

		node.classList.toggle('is-online', online);
		node.classList.toggle('is-offline', !online);
		node.querySelector('b').textContent = online ? this.t('Network OK', '网络正常') : this.t('Offline', '未联网');
	},

	renderOta: function(page, ota) {
		var node = page.querySelector('#qs-ota-pill');
		var info = {};

		if (!node)
			return;

		((ota && ota.stdout) || '').split(/\n/).forEach(function(line) {
			var pos = line.indexOf('=');
			if (pos > 0)
				info[line.slice(0, pos)] = line.slice(pos + 1);
		});

		if (info.STATE === 'update') {
			node.classList.remove('hidden');
			node.textContent = this.t('OTA update', 'OTA 可更新') + ' ' + (info.CLOUD_TAG || info.TAG || '');
		}
		else {
			node.classList.add('hidden');
		}
	},

	renderTraffic: function(page, devices) {
		var rx = 0;
		var tx = 0;
		var now = Date.now();

		this.history.devices = devices || {};

		for (var name in devices) {
			if (!devices.hasOwnProperty(name) || name === 'lo' || name.indexOf('tailscale') === 0)
				continue;

			var stat = (devices[name] && devices[name].statistics) || {};
			rx += stat.rx_bytes || 0;
			tx += stat.tx_bytes || 0;
		}

		if (!this.history.lastAt) {
			this.history.lastRx = rx;
			this.history.lastTx = tx;
			this.history.lastAt = now;
			return;
		}

		var seconds = Math.max(1, (now - this.history.lastAt) / 1000);
		var down = Math.max(0, (rx - this.history.lastRx) / seconds);
		var up = Math.max(0, (tx - this.history.lastTx) / seconds);

		this.history.lastRx = rx;
		this.history.lastTx = tx;
		this.history.lastAt = now;
		this.history.down.push(down);
		this.history.up.push(up);
		this.history.down.shift();
		this.history.up.shift();

		this.text(page, '#qs-down-speed', '↓ ' + this.formatSpeed(down));
		this.text(page, '#qs-up-speed', '↑ ' + this.formatSpeed(up));

		this.drawTraffic(page);
	},

	drawTraffic: function(page) {
		var canvas = page.querySelector('#qs-speed-canvas');
		if (!canvas || !canvas.getContext)
			return;

		var box = canvas.parentNode.getBoundingClientRect();
		var ratio = window.devicePixelRatio || 1;
		var width = Math.max(320, Math.floor(box.width));
		var height = Math.max(160, Math.floor(box.height));

		if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
			canvas.width = Math.floor(width * ratio);
			canvas.height = Math.floor(height * ratio);
			canvas.style.width = width + 'px';
			canvas.style.height = height + 'px';
		}

		var ctx = canvas.getContext('2d');
		var down = this.history.down;
		var up = this.history.up;
		var max = Math.max.apply(null, down.concat(up).concat([ 1024 ]));
		var pad = 18 * ratio;
		var plotW = canvas.width - pad * 2;
		var plotH = canvas.height - pad * 2;
		var step = plotW / Math.max(1, down.length - 1);

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.lineWidth = ratio;
		ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--qs-border') || 'rgba(148,163,184,.22)';

		for (var g = 0; g < 4; g++) {
			var gy = pad + (plotH / 3) * g;
			ctx.beginPath();
			ctx.moveTo(pad, gy);
			ctx.lineTo(canvas.width - pad, gy);
			ctx.stroke();
		}

		this.drawTrafficLine(ctx, down, max, pad, plotW, plotH, ratio, '#0891b2');
		this.drawTrafficLine(ctx, up, max, pad, plotW, plotH, ratio, '#2563eb');
	},

	drawTrafficLine: function(ctx, values, max, pad, plotW, plotH, ratio, color) {
		var step = plotW / Math.max(1, values.length - 1);
		var gradient = ctx.createLinearGradient(0, pad, 0, pad + plotH);
		var points = [];

		for (var i = 0; i < values.length; i++) {
			points.push({
				x: pad + step * i,
				y: pad + plotH - (values[i] / max) * plotH
			});
		}

		ctx.beginPath();
		ctx.moveTo(points[0].x, points[0].y);
		for (var p = 1; p < points.length; p++)
			ctx.lineTo(points[p].x, points[p].y);

		ctx.lineWidth = 2.5 * ratio;
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';
		ctx.strokeStyle = color;
		ctx.stroke();

		ctx.lineTo(pad + plotW, pad + plotH);
		ctx.lineTo(pad, pad + plotH);
		ctx.closePath();
		gradient.addColorStop(0, color.replace(')', ', .16)').replace('rgb', 'rgba'));
		gradient.addColorStop(1, color.replace(')', ', 0)').replace('rgb', 'rgba'));
		ctx.fillStyle = gradient;
		ctx.fill();
	},

	renderInterfaces: function(page, dump, devices) {
		var list = page.querySelector('#qs-interface-list');
		var rows = [];

		if (!list)
			return;

		(dump.interface || []).forEach(L.bind(function(iface) {
			if (!iface || iface.interface === 'loopback' || iface.interface === 'wan6')
				return;

			var device = iface.l3_device || iface.device || '--';
			var ipv4 = this.firstAddress(iface['ipv4-address']);
			var ipv6 = this.firstAddress(iface['ipv6-address']);
			var ip = ipv4 || ipv6 || '--';
			var speed = '--';
			var up = !!iface.up;

			if (devices && devices[device] && devices[device].speed)
				speed = devices[device].speed + ' Mbit/s';

			rows.push(E('div', { 'class': 'qs-iface-row' }, [
				E('div', { 'class': 'qs-iface-badge ' + (up ? 'up' : 'down') }, [ (iface.interface || '?').slice(0, 1).toUpperCase() ]),
				E('div', { 'class': 'qs-iface-main' }, [
					E('div', { 'class': 'qs-iface-title' }, [
						E('strong', [ (iface.interface || '--').toUpperCase() ]),
						E('span', [ up ? this.t('Connected', '已连接') : this.t('Disconnected', '未连接') ])
					]),
					E('div', { 'class': 'qs-iface-meta' }, [
						E('span', [ this.t('IP', 'IP') + ': ' + ip ]),
						E('span', [ this.t('Device', '设备') + ': ' + device ])
					])
				]),
				E('div', { 'class': 'qs-iface-speed' }, [
					E('span', [ this.t('Speed', '速率') ]),
					E('strong', [ speed ])
				])
			]));
		}, this));

		dom.content(list, rows.length ? rows : [
			E('div', { 'class': 'qs-empty' }, [ this.t('No interface data', '暂无接口信息') ])
		]);
	},

	renderResources: function(page, info, temp, clientCount) {
		var cpu = this.cpuPercent(info);
		var memory = this.memoryPercent(info.memory || {});
		var temperature = this.temperature(temp);

		this.setResource(page, 'cpu', cpu + '%', cpu);
		this.setResource(page, 'memory', memory + '%', memory);
		this.setResource(page, 'temp', temperature ? temperature.toFixed(1) + ' C' : '-- C', Math.min(100, Math.round(temperature)));
		this.setResource(page, 'clients', String(clientCount), Math.min(100, clientCount * 8));
	},

	setResource: function(page, key, value, percent) {
		this.text(page, '#qs-resource-' + key, value);

		var bar = page.querySelector('#qs-resource-' + key + '-bar');
		if (bar)
			bar.style.width = Math.max(0, Math.min(100, percent || 0)) + '%';
	},

	isOnline: function(dump) {
		var interfaces = dump.interface || [];

		for (var i = 0; i < interfaces.length; i++) {
			var iface = interfaces[i] || {};

			if (iface.interface === 'loopback' || iface.interface === 'lan' || iface.interface === 'wan6')
				continue;

			if (iface.up && ((iface['ipv4-address'] || []).length || (iface['ipv6-address'] || []).length))
				return true;
		}

		return false;
	},

	firstAddress: function(list) {
		return (list && list[0] && list[0].address) ? list[0].address : '';
	},

	clients: function(leases) {
		var items = [];

		if (Array.isArray(leases.dhcp_leases))
			items = items.concat(leases.dhcp_leases);
		if (Array.isArray(leases.dhcp6_leases))
			items = items.concat(leases.dhcp6_leases);

		var seen = {};
		return items.filter(function(item) {
			var key = item.macaddr || item.ipaddr || item.hostname || JSON.stringify(item);

			if (seen[key])
				return false;

			seen[key] = true;
			return true;
		});
	},

	cpuPercent: function(info) {
		var load = info.load && info.load[0] ? info.load[0] : 0;
		return Math.max(0, Math.min(100, Math.round(load / 65535 * 50)));
	},

	memoryPercent: function(memory) {
		var total = memory.total || 0;
		var free = (memory.free || 0) + (memory.buffered || 0);

		if (!total)
			return 0;

		return Math.max(0, Math.min(100, Math.round((total - free) / total * 100)));
	},

	temperature: function(temp) {
		var value = 0;

		if (typeof temp.cpuTemperature === 'number')
			value = temp.cpuTemperature;
		else if (typeof temp.temperature === 'number')
			value = temp.temperature;
		else if (typeof temp.tempinfo === 'string') {
			var match = temp.tempinfo.match(/([0-9]+(?:\.[0-9]+)?)/);
			if (match)
				value = parseFloat(match[1]);
		}

		return value > 1000 ? value / 1000 : value;
	},

	text: function(page, selector, value) {
		var node = page.querySelector(selector);

		if (node)
			node.textContent = value;
	},

	formatSpeed: function(bytes) {
		if (bytes < 1024)
			return bytes.toFixed(0) + ' B/s';
		if (bytes < 1048576)
			return (bytes / 1024).toFixed(1) + ' KB/s';
		return (bytes / 1048576).toFixed(2) + ' MB/s';
	},

	formatUptime: function(seconds) {
		var total = Math.max(0, Math.floor(seconds || 0));
		var days = Math.floor(total / 86400);
		var hours = Math.floor((total % 86400) / 3600);
		var minutes = Math.floor((total % 3600) / 60);

		if (days > 0)
			return days + this.t('d ', '天 ') + hours + this.t('h', '小时');
		if (hours > 0)
			return hours + this.t('h ', '小时 ') + minutes + this.t('m', '分钟');
		return minutes + this.t('m', '分钟');
	},

	injectStyle: function() {
		var old = document.getElementById('qs-home-inline-style');
		if (old)
			old.parentNode.removeChild(old);

		var style = document.createElement('style');
		style.id = 'qs-home-inline-style';
		style.textContent = [
			':root{--qs-bg:#f6f7f4;--qs-card:#fffdf8;--qs-border:rgba(42,39,31,.1);--qs-text:#2d2a22;--qs-muted:#756f61;--qs-soft:#f0eee6;--qs-blue:#2563eb;--qs-cyan:#0891b2;--qs-green:#16a34a;--qs-red:#dc2626;--qs-amber:#d97706;--qs-shadow:0 18px 42px rgba(48,43,32,.09)}',
			'@media(prefers-color-scheme:dark){:root{--qs-bg:#12151a;--qs-card:#1a1e25;--qs-border:rgba(255,255,255,.12);--qs-text:#f8fafc;--qs-muted:#a8b0bc;--qs-soft:rgba(255,255,255,.08);--qs-shadow:0 18px 42px rgba(0,0,0,.32)}}',
			'.qs-page{max-width:1360px;margin:0 auto;padding:24px;color:var(--qs-text);display:flex;flex-direction:column;gap:18px}',
			'.qs-page,.qs-page *{box-sizing:border-box;letter-spacing:0}',
			'.qs-card{background:var(--qs-card);border:1px solid var(--qs-border);border-radius:18px;box-shadow:var(--qs-shadow);min-width:0}',
			'.qs-top{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:22px;padding:26px 28px}',
			'.qs-kicker{font-size:12px;font-weight:800;color:var(--qs-blue);text-transform:uppercase}',
			'.qs-title-line{display:flex;align-items:center;gap:12px;margin-top:8px}.qs-router-title h1{font-size:32px;line-height:1.12;margin:0;color:var(--qs-text);font-weight:850}',
			'.qs-router-title p{margin:8px 0 0;color:var(--qs-muted);font-size:14px;font-weight:650}',
			'.qs-icon{display:inline-flex;align-items:center;justify-content:center;position:relative;flex:0 0 auto}.qs-title-line .qs-icon{width:38px;height:38px;border-radius:13px;background:rgba(37,99,235,.1)}.qs-section-head h2 .qs-icon{width:22px;height:22px;margin-right:8px;vertical-align:-4px}',
			'.qs-icon-router:before{content:"";width:18px;height:14px;border:2px solid var(--qs-blue);border-radius:5px;box-shadow:0 7px 0 -3px var(--qs-blue)}.qs-icon-traffic:before{content:"";width:19px;height:15px;border-left:3px solid var(--qs-cyan);border-bottom:3px solid var(--qs-cyan);transform:skewX(-12deg)}.qs-icon-traffic:after{content:"";position:absolute;width:15px;height:9px;border-top:3px solid var(--qs-blue);border-right:3px solid var(--qs-blue);transform:translate(2px,-2px) skewX(-12deg)}.qs-icon-port:before{content:"";width:18px;height:14px;border:2px solid var(--qs-cyan);border-radius:5px}.qs-icon-port:after{content:"";position:absolute;width:12px;height:2px;background:var(--qs-cyan);bottom:4px}.qs-icon-chip:before{content:"";width:15px;height:15px;border:2px solid var(--qs-amber);border-radius:4px;box-shadow:0 -6px 0 -4px var(--qs-amber),0 6px 0 -4px var(--qs-amber),6px 0 0 -4px var(--qs-amber),-6px 0 0 -4px var(--qs-amber)}',
			'.qs-top-right{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:10px;flex-wrap:wrap;margin-left:auto}',
			'.qs-pill{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:9px 12px;font-size:13px;font-weight:800;background:var(--qs-soft);white-space:nowrap}',
			'.qs-online-pill span{width:8px;height:8px;border-radius:999px;background:var(--qs-muted)}',
			'.qs-online-pill.is-online{color:var(--qs-green);background:rgba(22,163,74,.1)}.qs-online-pill.is-online span{background:var(--qs-green);box-shadow:0 0 0 5px rgba(22,163,74,.13)}',
			'.qs-online-pill.is-offline{color:var(--qs-red);background:rgba(220,38,38,.1)}.qs-online-pill.is-offline span{background:var(--qs-red);box-shadow:0 0 0 5px rgba(220,38,38,.12)}',
			'.qs-ota-pill{background:rgba(217,119,6,.13);color:var(--qs-amber)}',
			'.qs-uptime-box{min-width:148px;border-radius:16px;background:var(--qs-soft);padding:10px 13px;text-align:right}.qs-uptime-box span{display:block;color:var(--qs-muted);font-size:12px;font-weight:720}.qs-uptime-box strong{display:block;margin-top:3px;color:var(--qs-text);font-size:15px;font-weight:850}',
			'.qs-traffic-card,.qs-interfaces-card,.qs-hardware-card,.qs-actions{padding:22px}',
			'.qs-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}.qs-section-head h2{margin:0;color:var(--qs-text);font-size:20px;line-height:1.2;font-weight:850}.qs-section-head p{margin:5px 0 0;color:var(--qs-muted);font-size:13px;font-weight:650}',
			'.qs-speed-readout{display:flex;gap:12px;flex-wrap:wrap;justify-content:flex-end;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:850}.qs-speed-readout .down{color:var(--qs-cyan)}.qs-speed-readout .up{color:var(--qs-blue)}',
			'.qs-speed-chart{height:260px;padding:0;border-radius:16px;border:1px solid var(--qs-border);background:linear-gradient(180deg,rgba(37,99,235,.07),rgba(8,145,178,.04));overflow:hidden}',
			'.qs-speed-chart canvas{display:block!important;width:100%!important;height:100%!important}',
			'.qs-two-col{display:grid!important;grid-template-columns:minmax(0,1.38fr) minmax(320px,.82fr);gap:18px}',
			'.qs-interface-list{display:grid;gap:12px}.qs-iface-row{display:flex;align-items:center;gap:13px;padding:14px;border-radius:16px;border:1px solid var(--qs-border);background:rgba(15,23,42,.03);min-width:0}',
			'.qs-iface-badge{width:42px;height:42px;flex:0 0 42px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-weight:850;background:rgba(220,38,38,.1);color:var(--qs-red)}.qs-iface-badge.up{background:rgba(22,163,74,.1);color:var(--qs-green)}',
			'.qs-iface-main{flex:1;min-width:0}.qs-iface-title{display:flex;align-items:center;gap:10px}.qs-iface-title strong{font-size:15px;font-weight:850;color:var(--qs-text)}.qs-iface-title span{font-size:12px;font-weight:800;color:var(--qs-muted)}',
			'.qs-iface-meta{display:flex;gap:12px;flex-wrap:wrap;margin-top:5px;color:var(--qs-muted);font-size:12px;font-weight:650}.qs-iface-speed{text-align:right;flex:0 0 auto}.qs-iface-speed span{display:block;color:var(--qs-muted);font-size:12px;font-weight:720}.qs-iface-speed strong{display:block;margin-top:4px;color:var(--qs-text);font-size:14px;font-weight:850}',
			'.qs-resource-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.qs-resource{position:relative;padding:16px;border-radius:16px;border:1px solid var(--qs-border);background:rgba(15,23,42,.03);overflow:hidden}.qs-resource-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.qs-resource-top span{color:var(--qs-muted);font-size:12px;font-weight:780}.qs-resource-top i{width:12px;height:12px;border-radius:999px;background:var(--qs-blue)}.qs-resource strong{display:block;margin-top:12px;font-size:28px;line-height:1;font-weight:850;color:var(--qs-text)}',
			'.qs-resource-memory .qs-resource-top i{background:var(--qs-cyan)}.qs-resource-temp .qs-resource-top i{background:var(--qs-red)}.qs-resource-clients .qs-resource-top i{background:var(--qs-amber)}',
			'.qs-meter{height:6px;background:var(--qs-soft);border-radius:999px;overflow:hidden;margin-top:16px}.qs-meter em{display:block;height:100%;border-radius:inherit;background:var(--qs-blue);transition:width .2s ease}.qs-resource-memory .qs-meter em{background:var(--qs-cyan)}.qs-resource-temp .qs-meter em{background:var(--qs-red)}.qs-resource-clients .qs-meter em{background:var(--qs-amber)}',
			'.qs-actions{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.qs-actions a{display:flex;align-items:center;justify-content:center;min-height:42px;padding:10px 12px;border-radius:13px;background:var(--qs-soft);color:var(--qs-text)!important;text-decoration:none;font-size:13px;font-weight:820;white-space:nowrap}.qs-actions a:hover{transform:translateY(-1px)}',
			'.qs-empty{min-height:100px;border-radius:16px;background:var(--qs-soft);display:flex;align-items:center;justify-content:center;color:var(--qs-muted);font-size:13px;font-weight:750}.hidden{display:none!important}',
			'@media(max-width:1100px){.qs-two-col{grid-template-columns:1fr!important}.qs-actions{grid-template-columns:repeat(3,minmax(0,1fr))}}',
			'@media(max-width:760px){.qs-page{padding:14px}.qs-top,.qs-section-head{flex-direction:column!important;align-items:stretch!important}.qs-top-right{justify-content:flex-start!important;margin-left:0}.qs-speed-chart{height:210px;gap:3px;padding:14px}.qs-resource-grid,.qs-actions{grid-template-columns:1fr!important}.qs-iface-row{align-items:flex-start}.qs-iface-speed{text-align:left}}'
		].join('\\n');

		document.head.appendChild(style);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
