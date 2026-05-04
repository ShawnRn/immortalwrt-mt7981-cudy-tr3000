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
			var stats = channelStats(radio.freqs, radio.aps);
			var current = Number(radio.info.channel);
			var maxScore = Math.max.apply(Math, stats.map(function(item) {
				return item.score;
			}).concat([1]));
			var best = Number(scoreChannels(radio.freqs, radio.aps));

			return E('section', { 'class': 'shawnwrt-spectrum-section' }, [
				E('div', { 'class': 'shawnwrt-spectrum-head' }, [
					E('h3', [
						radio.device,
						' ',
						E('small', [ radio.band === '2g' ? '2.4 GHz' : radio.band === '5g' ? '5 GHz' : radio.band ])
					]),
					E('span', { 'class': 'shawnwrt-channel-muted' }, [ _('Lower bars mean cleaner channels') ])
				]),
				radio.scanning ? E('p', { 'class': 'shawnwrt-channel-muted' }, [ _('Scanning nearby APs...') ]) : null,
				radio.scanError ? E('p', { 'class': 'shawnwrt-channel-error' }, [ radio.scanError ]) : null,
				E('div', { 'class': 'shawnwrt-spectrum-chart' }, stats.map(function(item) {
					var height = Math.max(8, Math.round((item.score / maxScore) * 100));
					var cls = 'shawnwrt-spectrum-bar';

					if (item.channel === current)
						cls += ' is-current';
					if (item.channel === best)
						cls += ' is-best';

					return E('div', {
						'class': cls,
						'title': _('Channel') + ' ' + item.channel + ': ' + item.aps + ' APs, ' + _('strongest') + ' ' + item.strongest + ' dBm'
					}, [
						E('div', { 'class': 'shawnwrt-spectrum-column' }, [
							E('span', { 'style': 'height:%d%%'.format(height) })
						]),
						E('b', [ String(item.channel) ]),
						E('em', [ String(item.aps) ])
					]);
				})),
				E('div', { 'class': 'shawnwrt-spectrum-legend' }, [
					E('span', { 'class': 'is-current' }, [ _('Current channel') ]),
					E('span', { 'class': 'is-best' }, [ _('Suggested channel') ]),
					E('span', [ _('Number below each bar is nearby AP count') ])
				])
			]);
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
				.shawnwrt-spectrum-chart { display: flex; align-items: end; gap: .35rem; height: 15rem; padding: .75rem .5rem .35rem; border-radius: 8px; background: linear-gradient(to top, rgba(0,0,0,.06), rgba(0,0,0,.015)); overflow-x: auto; }
				.shawnwrt-spectrum-bar { flex: 1 0 2.2rem; min-width: 2.2rem; display: grid; grid-template-rows: 1fr auto auto; gap: .2rem; text-align: center; color: rgba(0,0,0,.68); }
				.shawnwrt-spectrum-column { display: flex; align-items: end; justify-content: center; min-height: 0; }
				.shawnwrt-spectrum-column span { width: 70%; min-height: .35rem; border-radius: 6px 6px 2px 2px; background: linear-gradient(180deg, #5dade2, #2874a6); box-shadow: 0 6px 16px rgba(40,116,166,.20); }
				.shawnwrt-spectrum-bar.is-current .shawnwrt-spectrum-column span { background: linear-gradient(180deg, #f39c12, #d35400); }
				.shawnwrt-spectrum-bar.is-best .shawnwrt-spectrum-column span { background: linear-gradient(180deg, #58d68d, #229954); }
				.shawnwrt-spectrum-bar b { font-size: .82rem; line-height: 1.1; }
				.shawnwrt-spectrum-bar em { font-size: .75rem; font-style: normal; opacity: .62; }
				.shawnwrt-spectrum-legend { display: flex; flex-wrap: wrap; gap: .6rem 1rem; margin-top: .7rem; color: rgba(0,0,0,.6); font-size: .9rem; }
				.shawnwrt-spectrum-legend span::before { content: ''; display: inline-block; width: .7rem; height: .7rem; border-radius: .2rem; background: #2874a6; margin-right: .35rem; vertical-align: -.05rem; }
				.shawnwrt-spectrum-legend .is-current::before { background: #d35400; }
				.shawnwrt-spectrum-legend .is-best::before { background: #229954; }
				.shawnwrt-channel-section { margin-top: 1rem; overflow-x: auto; }
				.shawnwrt-channel-section h3 { margin: 0 0 .6rem; }
				.shawnwrt-channel-error { color: #c0392b; }
				@media (prefers-color-scheme: dark) {
					.shawnwrt-channel-card { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.12); }
					.shawnwrt-channel-metrics span { color: rgba(255,255,255,.62); }
					.shawnwrt-spectrum-section { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.12); }
					.shawnwrt-spectrum-chart { background: linear-gradient(to top, rgba(255,255,255,.08), rgba(255,255,255,.02)); }
					.shawnwrt-spectrum-head small, .shawnwrt-channel-muted, .shawnwrt-spectrum-legend { color: rgba(255,255,255,.62); }
					.shawnwrt-spectrum-bar { color: rgba(255,255,255,.72); }
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
