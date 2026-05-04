'use strict';
'require view';
'require rpc';
'require uci';
'require ui';

var callScan = rpc.declare({
	object: 'iwinfo',
	method: 'scan',
	params: [ 'device' ],
	expect: { results: [] }
});

var callInfo = rpc.declare({
	object: 'iwinfo',
	method: 'info',
	params: [ 'device' ],
	expect: {}
});

var callFreqList = rpc.declare({
	object: 'iwinfo',
	method: 'freqlist',
	params: [ 'device' ],
	expect: { results: [] }
});

function cleanText(value) {
	return String(value || '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
}

function bandFromChannel(channel) {
	channel = Number(channel);
	if (channel >= 1 && channel <= 14)
		return '2g';
	if (channel >= 32 && channel <= 177)
		return '5g';
	if (channel > 177)
		return '6g';
	return 'unknown';
}

function channelWidth(ap) {
	var width = ap && ap.channel_width;

	if (width)
		return width;

	if (ap && ap.he_operation && ap.he_operation.channel_width)
		return '%d MHz'.format(ap.he_operation.channel_width);

	if (ap && ap.vht_operation && ap.vht_operation.channel_width) {
		if (ap.vht_operation.channel_width == 80)
			return '80 MHz';
		if (ap.vht_operation.channel_width == 160)
			return '160 MHz';
	}

	if (ap && ap.ht_operation && ap.ht_operation.channel_width)
		return '%d MHz'.format(ap.ht_operation.channel_width);

	return '20 MHz';
}

function scoreChannels(freqs, aps) {
	var scores = {};

	freqs.forEach(function(freq) {
		scores[freq.channel] = 0;
	});

	aps.forEach(function(ap) {
		var channel = Number(ap.channel);
		var signal = Number(ap.signal || -100);
		var weight = Math.max(1, 120 + signal);

		Object.keys(scores).forEach(function(ch) {
			var distance = Math.abs(Number(ch) - channel);
			if (distance === 0)
				scores[ch] += weight;
			else if (distance <= 4)
				scores[ch] += Math.max(1, weight / (distance + 1));
		});
	});

	return Object.keys(scores).sort(function(a, b) {
		return scores[a] - scores[b];
	})[0] || '-';
}

function radioSectionName(section) {
	return uci.get('wireless', section, 'phy') || section;
}

return view.extend({
	load: function() {
		return uci.load('wireless').then(function() {
			var sections = uci.sections('wireless', 'wifi-device').filter(function(section) {
				return uci.get('wireless', section['.name'], 'type') === 'mtwifi';
			});

			return Promise.all(sections.map(function(section) {
				var sid = section['.name'];
				var device = radioSectionName(sid);

				return Promise.all([
					L.resolveDefault(callInfo(device), {}),
					L.resolveDefault(callFreqList(device), []),
					L.resolveDefault(callScan(device), [])
				]).then(function(data) {
					return {
						sid: sid,
						device: device,
						band: uci.get('wireless', sid, 'band') || bandFromChannel(data[0].channel),
						configChannel: uci.get('wireless', sid, 'channel') || '-',
						htmode: uci.get('wireless', sid, 'htmode') || data[0].htmode || '-',
						info: data[0],
						freqs: data[1] || [],
						aps: (data[2] || []).filter(function(ap) {
							return ap && ap.channel;
						}).map(function(ap) {
							ap.ssid = cleanText(ap.ssid) || _('hidden');
							ap.band = ap.band || bandFromChannel(ap.channel);
							return ap;
						})
					};
				});
			}));
		});
	},

	render: function(radios) {
		function summaryCard(radio) {
			var sameChannel = radio.aps.filter(function(ap) {
				return Number(ap.channel) === Number(radio.info.channel);
			}).length;
			var suggested = scoreChannels(radio.freqs, radio.aps);
			var bandTitle = radio.band === '2g' ? '2.4 GHz' : radio.band === '5g' ? '5 GHz' : radio.band;

			return E('div', { 'class': 'shawnwrt-channel-card' }, [
				E('div', { 'class': 'shawnwrt-channel-card-head' }, [
					E('h3', [ radio.device, ' ', E('small', [ bandTitle ]) ]),
					E('span', { 'class': 'shawnwrt-channel-pill' }, [ radio.htmode ])
				]),
				E('div', { 'class': 'shawnwrt-channel-metrics' }, [
					E('div', [ E('b', [ radio.info.channel || '-' ]), E('span', [ _('Current channel') ]) ]),
					E('div', [ E('b', [ String(radio.aps.length) ]), E('span', [ _('Nearby APs') ]) ]),
					E('div', [ E('b', [ String(sameChannel) ]), E('span', [ _('Same-channel APs') ]) ]),
					E('div', [ E('b', [ suggested ]), E('span', [ _('Suggested channel') ]) ])
				])
			]);
		}

		function scanTable(radio) {
			var rows = radio.aps.slice().sort(function(a, b) {
				if (Number(a.channel) !== Number(b.channel))
					return Number(a.channel) - Number(b.channel);
				return Number(b.signal || -100) - Number(a.signal || -100);
			}).map(function(ap) {
				return [
					ap.ssid,
					ap.bssid || '-',
					ap.channel || '-',
					channelWidth(ap),
					ap.signal != null ? '%d dBm'.format(ap.signal) : '-',
					ap.quality != null ? '%d/%d'.format(ap.quality, ap.quality_max || 100) : '-'
				];
			});

			return E('section', { 'class': 'shawnwrt-channel-section' }, [
				E('h3', [ radio.device, ' ', radio.band === '2g' ? '2.4 GHz' : radio.band === '5g' ? '5 GHz' : radio.band ]),
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th' }, [ _('SSID') ]),
						E('th', { 'class': 'th' }, [ _('BSSID') ]),
						E('th', { 'class': 'th' }, [ _('Channel') ]),
						E('th', { 'class': 'th' }, [ _('Channel Width') ]),
						E('th', { 'class': 'th' }, [ _('Signal') ]),
						E('th', { 'class': 'th' }, [ _('Quality') ])
					])
				].concat(rows.map(function(row) {
					return E('tr', { 'class': 'tr' }, row.map(function(cell) {
						return E('td', { 'class': 'td' }, [ cell ]);
					}));
				})).concat(rows.length ? [] : [
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td', 'colspan': '6' }, [ _('No scan results. Try refreshing after a few seconds.') ])
					])
				]))
			]);
		}

		return E('div', { 'class': 'cbi-map shawnwrt-channel-analysis' }, [
			E('style', {}, [ `
				.shawnwrt-channel-analysis { max-width: 96rem; margin: 0 auto; }
				.shawnwrt-channel-titlebar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
				.shawnwrt-channel-titlebar h2 { margin: 0; }
				.shawnwrt-channel-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 1rem; margin-bottom: 1.25rem; }
				.shawnwrt-channel-card { border: 1px solid rgba(0,0,0,.10); border-radius: 10px; padding: 1rem; background: rgba(255,255,255,.72); }
				.shawnwrt-channel-card-head { display: flex; justify-content: space-between; gap: 1rem; align-items: center; margin-bottom: .75rem; }
				.shawnwrt-channel-card h3 { margin: 0; }
				.shawnwrt-channel-card small { opacity: .65; font-weight: 500; }
				.shawnwrt-channel-pill { border-radius: 999px; padding: .2rem .55rem; background: rgba(52,152,219,.14); color: #1f6f9f; font-weight: 700; }
				.shawnwrt-channel-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
				.shawnwrt-channel-metrics div { min-width: 0; }
				.shawnwrt-channel-metrics b { display: block; font-size: 1.35rem; line-height: 1.2; }
				.shawnwrt-channel-metrics span { color: rgba(0,0,0,.58); font-size: .9rem; }
				.shawnwrt-channel-section { margin-top: 1rem; overflow-x: auto; }
				.shawnwrt-channel-section h3 { margin: 0 0 .6rem; }
				@media (prefers-color-scheme: dark) {
					.shawnwrt-channel-card { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.12); }
					.shawnwrt-channel-metrics span { color: rgba(255,255,255,.62); }
				}
			` ]),
			E('div', { 'class': 'shawnwrt-channel-titlebar' }, [
				E('h2', [ _('Channel Analysis') ]),
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'click': function() { location.reload(); }
				}, [ _('Refresh Channels') ])
			]),
			E('div', { 'class': 'shawnwrt-channel-grid' }, radios.map(summaryCard)),
			E('div', {}, radios.map(scanTable))
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
