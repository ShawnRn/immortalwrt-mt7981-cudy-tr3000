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
	return String(value || '')
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
		.replace(/[\ufffd�]+/g, '')
		.replace(/\s+/g, ' ')
		.trim();
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
	var widths = [];

	function addWidth(value) {
		var width = Number(value);

		if ([20, 40, 80, 160, 320].indexOf(width) >= 0)
			widths.push(width);
	}

	if (!ap)
		return '20 MHz';

	addWidth(ap.channel_width);

	if (ap.he_operation)
		addWidth(ap.he_operation.channel_width);

	if (ap.vht_operation)
		addWidth(ap.vht_operation.channel_width);

	if (ap.ht_operation)
		addWidth(ap.ht_operation.channel_width);

	if (widths.length)
		return '%d MHz'.format(Math.max.apply(Math, widths));

	return '20 MHz';
}

function channelWidthMHz(ap) {
	var width = channelWidth(ap);
	var match = String(width || '').match(/([0-9]+)/);
	return match ? Number(match[1]) : 20;
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

function channelStats(freqs, aps) {
	var stats = {};

	freqs.forEach(function(freq) {
		stats[freq.channel] = {
			channel: Number(freq.channel),
			aps: 0,
			strongest: -110,
			score: 0
		};
	});

	aps.forEach(function(ap) {
		var channel = Number(ap.channel);
		var signal = Number(ap.signal || -100);
		var weight = Math.max(1, 120 + signal);

		if (!stats[channel])
			stats[channel] = { channel: channel, aps: 0, strongest: -110, score: 0 };

		stats[channel].aps += 1;
		stats[channel].strongest = Math.max(stats[channel].strongest, signal);

		Object.keys(stats).forEach(function(ch) {
			var distance = Math.abs(Number(ch) - channel);
			if (distance === 0)
				stats[ch].score += weight;
			else if (distance <= 4)
				stats[ch].score += Math.max(1, weight / (distance + 1));
		});
	});

	return Object.keys(stats).map(function(ch) {
		return stats[ch];
	}).sort(function(a, b) {
		return a.channel - b.channel;
	});
}

function colorFor(value) {
	var hash = 0;
	var palette = [
		'#2e86de', '#00a8a8', '#6ab04c', '#f0932b',
		'#be2edd', '#eb4d4b', '#22a6b3', '#badc58',
		'#e056fd', '#686de0', '#ff7979', '#7ed6df'
	];

	value = String(value || '');
	for (var i = 0; i < value.length; i++)
		hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;

	return palette[Math.abs(hash) % palette.length];
}

function spectrumTicks(radio, aps) {
	var band = radio.band || bandFromChannel(radio.info.channel);
	var seen = {};
	var ticks = [];

	function add(channel) {
		channel = Number(channel);
		if (channel && !seen[channel]) {
			seen[channel] = true;
			ticks.push(channel);
		}
	}

	if (band === '2g') {
		for (var ch = 1; ch <= 13; ch++)
			add(ch);
	}
	else {
		[36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165, 169, 173].forEach(add);
	}

	(radio.freqs || []).forEach(function(freq) { add(freq.channel); });
	(aps || []).forEach(function(ap) { add(ap.channel); });
	add(radio.info.channel || radio.configChannel);

	return ticks.sort(function(a, b) { return a - b; });
}

function ownAp(radio) {
	var channel = Number(radio.info.channel || radio.configChannel);
	if (!channel)
		return null;

	return {
		ssid: cleanText(radio.info.ssid) || _('Current AP'),
		bssid: radio.info.bssid || radio.device,
		channel: channel,
		signal: -35,
		channel_width: radio.htmode || channelWidth({}),
		isSelf: true
	};
}

function radioSectionName(section) {
	return uci.get('wireless', section, 'phy') || section;
}

function nodeId(prefix, radio) {
	return prefix + '-' + String(radio.device || radio.sid).replace(/[^A-Za-z0-9_-]/g, '_');
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
					L.resolveDefault(callFreqList(device), [])
				]).then(function(data) {
					return {
						sid: sid,
						device: device,
						band: uci.get('wireless', sid, 'band') || bandFromChannel(data[0].channel),
						configChannel: uci.get('wireless', sid, 'channel') || '-',
						htmode: uci.get('wireless', sid, 'htmode') || data[0].htmode || '-',
						info: data[0],
						freqs: data[1] || [],
						aps: [],
						scanned: false,
						scanning: false,
						scanError: null
					};
				});
			}));
		});
	},

	render: function(radios) {
		function applySuggestedChannel(radio, suggested) {
			return ui.showModal(_('Apply suggested channel'), [
				E('p', [
					_('This will set %s to channel %s and apply wireless changes. Wi-Fi clients may briefly disconnect.').format(radio.device, suggested)
				]),
				E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'btn',
						'click': ui.hideModal
					}, [ _('Cancel') ]),
					' ',
					E('button', {
						'class': 'btn cbi-button-action important',
						'click': function(ev) {
							ev.currentTarget.disabled = true;
							ev.currentTarget.classList.add('spinning');
							uci.set('wireless', radio.sid, 'channel', String(suggested));
							return uci.save()
								.then(L.bind(ui.changes.init, ui.changes))
								.then(L.bind(ui.changes.apply, ui.changes))
								.finally(ui.hideModal);
						}
					}, [ _('Apply suggested channel') ])
				])
			]);
		}

		function summaryCard(radio) {
			var sameChannel = radio.aps.filter(function(ap) {
				return Number(ap.channel) === Number(radio.info.channel);
			}).length;
			var suggested = radio.scanned ? scoreChannels(radio.freqs, radio.aps) : '-';
			var bandTitle = radio.band === '2g' ? '2.4 GHz' : radio.band === '5g' ? '5 GHz' : radio.band;

			return E('div', { 'class': 'shawnwrt-channel-card' }, [
				E('div', { 'class': 'shawnwrt-channel-card-head' }, [
					E('h3', [ radio.device, ' ', E('small', [ bandTitle ]) ]),
					E('span', { 'class': 'shawnwrt-channel-pill' }, [ radio.htmode ])
				]),
				E('div', { 'class': 'shawnwrt-channel-metrics' }, [
					E('div', [ E('b', [ radio.info.channel || '-' ]), E('span', [ _('Current channel') ]) ]),
					E('div', [ E('b', [ radio.scanned ? String(radio.aps.length) : '-' ]), E('span', [ _('Nearby APs') ]) ]),
					E('div', [ E('b', [ radio.scanned ? String(sameChannel) : '-' ]), E('span', [ _('Same-channel APs') ]) ]),
					E('div', [ E('b', [ suggested ]), E('span', [ _('Suggested channel') ]) ])
				]),
				E('button', {
					'class': 'btn cbi-button cbi-button-action shawnwrt-channel-apply',
					'disabled': !radio.scanned || !suggested || suggested === '-' || Number(suggested) === Number(radio.info.channel),
					'click': function() {
						return applySuggestedChannel(radio, suggested);
					}
				}, [ _('Apply suggested channel') ])
			]);
		}

		function spectrumChart(radio) {
			var current = Number(radio.info.channel);
			var best = Number(scoreChannels(radio.freqs, radio.aps));
			var apList = radio.aps.slice();
			var self = ownAp(radio);
			var ticks, minCh, maxCh, signalMin = -95, signalMax = -10;
			var width = 1200, height = 330, padL = 46, padR = 22, padT = 28, padB = 42;
			var plotW = width - padL - padR;
			var plotH = height - padT - padB;
			var children = [];

			if (self)
				apList.push(self);

			ticks = spectrumTicks(radio, apList);
			minCh = ticks.length ? ticks[0] : 1;
			maxCh = ticks.length ? ticks[ticks.length - 1] : 13;

			if (minCh === maxCh) {
				minCh -= 1;
				maxCh += 1;
			}

			function xFor(channel) {
				channel = Number(channel);
				return padL + ((channel - minCh) / (maxCh - minCh)) * plotW;
			}

			function yFor(signal) {
				signal = Math.max(signalMin, Math.min(signalMax, Number(signal || signalMin)));
				return padT + ((signalMax - signal) / (signalMax - signalMin)) * plotH;
			}

			function svgEl(name, attrs, children) {
				var node = document.createElementNS('http://www.w3.org/2000/svg', name);

				Object.keys(attrs || {}).forEach(function(key) {
					node.setAttribute(key, attrs[key]);
				});

				(children || []).forEach(function(child) {
					if (child == null)
						return;
					if (typeof child === 'string')
						node.appendChild(document.createTextNode(child));
					else
						node.appendChild(child);
				});

				return node;
			}

			function apShape(ap, index) {
				var signal = Number(ap.signal);
				var widthMHz = channelWidthMHz(ap);
				var span = (widthMHz / 20) * 2;
				var left = Math.max(minCh, Number(ap.channel) - span);
				var right = Math.min(maxCh, Number(ap.channel) + span);
				var x1 = xFor(left);
				var x2 = xFor(right);
				var y = yFor(signal);
				var color = ap.isSelf ? '#f2994a' : colorFor(ap.bssid || ap.ssid || index);
				var title = [
					ap.ssid || _('hidden'),
					'Ch. %s'.format(ap.channel),
					'%s MHz'.format(widthMHz),
					'%s dBm'.format(signal)
				].join(', ');

				return svgEl('g', { 'class': ap.isSelf ? 'shawnwrt-ap-shape is-self' : 'shawnwrt-ap-shape' }, [
					svgEl('title', {}, [ title ]),
					svgEl('rect', {
						'x': x1.toFixed(1),
						'y': y.toFixed(1),
						'width': Math.max(6, x2 - x1).toFixed(1),
						'height': (padT + plotH - y).toFixed(1),
						'rx': '7',
						'style': ap.isSelf ? 'fill:url(#shawnwrt-hatch);stroke:#f2994a' : 'fill:%s;stroke:%s'.format(color, color)
					}),
					svgEl('text', {
						'x': ((x1 + x2) / 2).toFixed(1),
						'y': Math.max(18, y - 7).toFixed(1),
						'class': ap.isSelf ? 'shawnwrt-ap-label is-self' : 'shawnwrt-ap-label'
					}, [ ap.ssid || _('hidden') ])
				]);
			}

			var svgNodes = [
				svgEl('defs', {}, [
					svgEl('pattern', { 'id': 'shawnwrt-hatch', 'width': '8', 'height': '8', 'patternUnits': 'userSpaceOnUse', 'patternTransform': 'rotate(35)' }, [
						svgEl('rect', { 'width': '8', 'height': '8', 'fill': 'rgba(242,153,74,.42)' }),
						svgEl('line', { 'x1': '0', 'y1': '0', 'x2': '0', 'y2': '8', 'stroke': 'rgba(255,255,255,.62)', 'stroke-width': '3' })
					])
				]),
				svgEl('rect', { 'x': padL, 'y': padT, 'width': plotW, 'height': plotH, 'rx': '8', 'class': 'shawnwrt-spectrum-bg' })
			];

			[-10, -20, -30, -40, -50, -60, -70, -80, -90].forEach(function(dbm) {
				var y = yFor(dbm);
				svgNodes.push(svgEl('g', {}, [
					svgEl('line', { 'x1': padL, 'x2': padL + plotW, 'y1': y, 'y2': y, 'class': 'shawnwrt-spectrum-grid' }),
					svgEl('text', { 'x': padL - 10, 'y': y + 4, 'class': 'shawnwrt-spectrum-y', 'text-anchor': 'end' }, [ String(dbm) ])
				]));
			});

			ticks.forEach(function(channel) {
				var x = xFor(channel);
				svgNodes.push(svgEl('g', {}, [
					svgEl('line', { 'x1': x, 'x2': x, 'y1': padT + plotH, 'y2': padT + plotH + 6, 'class': 'shawnwrt-spectrum-tick' }),
					svgEl('text', {
						'x': x,
						'y': padT + plotH + 26,
						'class': Number(channel) === current ? 'shawnwrt-spectrum-x is-current' : Number(channel) === best ? 'shawnwrt-spectrum-x is-best' : 'shawnwrt-spectrum-x',
						'text-anchor': 'middle'
					}, [ String(channel) ])
				]));
			});

			apList.sort(function(a, b) {
				return Number(a.signal || -95) - Number(b.signal || -95);
			}).forEach(function(ap, index) {
				svgNodes.push(apShape(ap, index));
			});

			svgNodes.push(svgEl('line', { 'x1': padL, 'x2': padL + plotW, 'y1': padT + plotH, 'y2': padT + plotH, 'class': 'shawnwrt-spectrum-axis' }));

			children.push(E('div', { 'class': 'shawnwrt-spectrum-head' }, [
				E('h3', [
					radio.device,
					' ',
					E('small', [ radio.band === '2g' ? '2.4 GHz' : radio.band === '5g' ? '5 GHz' : radio.band ])
				]),
				E('span', { 'class': 'shawnwrt-channel-muted' }, [ _('Higher shapes mean stronger signal') ])
			]));

			if (radio.scanning)
				children.push(E('p', { 'class': 'shawnwrt-channel-muted' }, [ _('Scanning nearby APs...') ]));
			if (radio.scanError)
				children.push(E('p', { 'class': 'shawnwrt-channel-error' }, [ radio.scanError ]));

			children.push(E('div', { 'class': 'shawnwrt-spectrum-scroll' }, [
				svgEl('svg', {
					'class': 'shawnwrt-spectrum-svg',
					'viewBox': '0 0 %d %d'.format(width, height),
					'preserveAspectRatio': 'none',
					'role': 'img',
					'aria-label': _('Wireless spectrum chart')
				}, svgNodes)
			]));

			children.push(E('div', { 'class': 'shawnwrt-spectrum-legend' }, [
				E('span', { 'class': 'is-current' }, [ _('Current channel') ]),
				E('span', { 'class': 'is-best' }, [ _('Suggested channel') ]),
				E('span', [ _('Each shape shows one AP by channel width and signal strength') ])
			]));

			return E('section', { 'class': 'shawnwrt-spectrum-section' }, children);
		}

		function scanTable(radio) {
			if (radio.scanning) {
				return E('section', { 'class': 'shawnwrt-channel-section' }, [
					E('h3', [ radio.device, ' ', radio.band === '2g' ? '2.4 GHz' : radio.band === '5g' ? '5 GHz' : radio.band ]),
					E('p', { 'class': 'shawnwrt-channel-muted' }, [ _('Scanning nearby APs...') ])
				]);
			}

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

		function renderRadio(radio) {
			return E('div', { 'class': 'shawnwrt-radio-block' }, [
				E('div', { 'id': nodeId('shawnwrt-channel-card', radio) }, [ summaryCard(radio) ]),
				E('div', { 'id': nodeId('shawnwrt-channel-spectrum', radio) }, [ spectrumChart(radio) ]),
				E('div', { 'id': nodeId('shawnwrt-channel-table', radio) }, [ scanTable(radio) ])
			]);
		}

		function updateRadio(radio) {
			var card = document.getElementById(nodeId('shawnwrt-channel-card', radio));
			var spectrum = document.getElementById(nodeId('shawnwrt-channel-spectrum', radio));
			var table = document.getElementById(nodeId('shawnwrt-channel-table', radio));

			if (card)
				card.replaceChildren(summaryCard(radio));
			if (spectrum)
				spectrum.replaceChildren(spectrumChart(radio));
			if (table)
				table.replaceChildren(scanTable(radio));
		}

		function scanRadio(radio) {
			radio.scanning = true;
			radio.scanError = null;
			updateRadio(radio);

			return L.resolveDefault(callScan(radio.device), []).then(function(results) {
				radio.aps = (results || []).filter(function(ap) {
					return ap && ap.channel;
				}).map(function(ap) {
					ap.ssid = cleanText(ap.ssid) || _('hidden');
					ap.band = ap.band || bandFromChannel(ap.channel);
					return ap;
				});
				radio.scanned = true;
			}).catch(function(err) {
				radio.scanError = _('Scan failed: %s').format(err && err.message ? err.message : err);
			}).finally(function() {
				radio.scanning = false;
				updateRadio(radio);
			});
		}

		function scanAll() {
			radios.forEach(scanRadio);
		}

		var root = E('div', { 'class': 'cbi-map shawnwrt-channel-analysis' }, [
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
				.shawnwrt-channel-apply { margin-top: .9rem; }
				.shawnwrt-spectrum-section { margin: 1rem 0 1.25rem; border: 1px solid rgba(0,0,0,.10); border-radius: 10px; padding: 1rem; background: rgba(255,255,255,.62); }
				.shawnwrt-spectrum-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: .75rem; }
				.shawnwrt-spectrum-head h3 { margin: 0; }
				.shawnwrt-spectrum-head small, .shawnwrt-channel-muted { color: rgba(0,0,0,.56); font-weight: 500; }
				.shawnwrt-spectrum-scroll { overflow-x: auto; border-radius: 8px; background: #050a2f; }
				.shawnwrt-spectrum-svg { display: block; width: 100%; min-width: 54rem; height: 21rem; }
				.shawnwrt-spectrum-bg { fill: #050a2f; }
				.shawnwrt-spectrum-grid { stroke: rgba(255,255,255,.18); stroke-dasharray: 3 5; }
				.shawnwrt-spectrum-axis, .shawnwrt-spectrum-tick { stroke: rgba(255,255,255,.52); }
				.shawnwrt-spectrum-y { fill: #20e34b; font-size: .9rem; font-weight: 700; }
				.shawnwrt-spectrum-x { fill: rgba(255,255,255,.62); font-size: .85rem; font-weight: 650; }
				.shawnwrt-spectrum-x.is-current { fill: #f2994a; }
				.shawnwrt-spectrum-x.is-best { fill: #2ecc71; }
				.shawnwrt-ap-shape rect { fill-opacity: .20; stroke-opacity: .78; stroke-width: 2.2; }
				.shawnwrt-ap-shape.is-self rect { fill: url(#shawnwrt-hatch); fill-opacity: .72; stroke: #f2994a !important; stroke-width: 3; }
				.shawnwrt-ap-label { fill: rgba(255,255,255,.72); font-size: .86rem; font-weight: 750; text-anchor: middle; paint-order: stroke; stroke: rgba(5,10,47,.62); stroke-width: 3; stroke-linejoin: round; pointer-events: none; }
				.shawnwrt-ap-label.is-self { fill: #ffd9bd; font-size: .95rem; }
				.shawnwrt-spectrum-legend { display: flex; flex-wrap: wrap; gap: .6rem 1rem; margin-top: .7rem; color: rgba(0,0,0,.6); font-size: .9rem; }
				.shawnwrt-spectrum-legend span::before { content: ''; display: inline-block; width: .7rem; height: .7rem; border-radius: .2rem; background: #2e86de; margin-right: .35rem; vertical-align: -.05rem; }
				.shawnwrt-spectrum-legend .is-current::before { background: #f2994a; }
				.shawnwrt-spectrum-legend .is-best::before { background: #2ecc71; }
				.shawnwrt-channel-section { margin-top: 1rem; overflow-x: auto; }
				.shawnwrt-channel-section h3 { margin: 0 0 .6rem; }
				.shawnwrt-channel-error { color: #c0392b; }
				@media (prefers-color-scheme: dark) {
					.shawnwrt-channel-card { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.12); }
					.shawnwrt-channel-metrics span { color: rgba(255,255,255,.62); }
					.shawnwrt-spectrum-section { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.12); }
					.shawnwrt-spectrum-head small, .shawnwrt-channel-muted, .shawnwrt-spectrum-legend { color: rgba(255,255,255,.62); }
				}
			` ]),
			E('div', { 'class': 'shawnwrt-channel-titlebar' }, [
				E('h2', [ _('Channel Analysis') ]),
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'click': scanAll
				}, [ _('Refresh Channels') ])
			]),
			E('div', {}, radios.map(renderRadio))
		]);

		window.setTimeout(scanAll, 0);
		return root;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
