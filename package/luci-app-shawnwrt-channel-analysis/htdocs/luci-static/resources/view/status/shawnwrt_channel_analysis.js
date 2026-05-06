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

var callSiteSurvey = rpc.declare({
	object: 'shawnwrt_channel',
	method: 'get_site_survey',
	params: [ 'device' ],
	expect: { results: {} }
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
		.replace(/\s*[\(（]+$/g, '')
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
		var match = String(value || '').match(/(20|40|80|160|320)/);
		var width = match ? Number(match[1]) : Number(value);

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

function spectrumTicks(radio, aps, subBand) {
	var band = radio.band || bandFromChannel(radio.info.channel);
	var seen = {};
	var ticks = [];

	function add(channel) {
		channel = Number(channel);
		if (channel && !seen[channel]) {
			if (subBand === '5low' && (channel < 36 || channel > 64)) return;
			if (subBand === '5high' && (channel < 149 || channel > 177)) return;
			seen[channel] = true;
			ticks.push(channel);
		}
	}

	if (band === '2g') {
		for (var ch = 1; ch <= 13; ch++)
			add(ch);
	}
	else if (subBand === '5low') {
		[36, 40, 44, 48, 52, 56, 60, 64].forEach(add);
	}
	else if (subBand === '5high') {
		[149, 153, 157, 161, 165, 169, 173].forEach(add);
	}
	else {
		[36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165, 169, 173].forEach(add);
	}

	(radio.freqs || []).forEach(function(freq) { add(freq.channel); });
	(aps || []).forEach(function(ap) { add(ap.channel); });
	var ownCh = Number(radio.info.channel || radio.configChannel);
	if (!subBand || (subBand === '5low' && ownCh >= 36 && ownCh <= 64) || (subBand === '5high' && ownCh >= 149 && ownCh <= 177) || band === '2g')
		add(ownCh);

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

function bandTitle(band) {
	if (band === '2g')
		return '2.4 GHz';
	if (band === '5g')
		return '5 GHz';
	if (band === '6g')
		return '6 GHz';
	return band || '-';
}

function boolValue(value) {
	return value === true || value === 1 || value === '1' || value === 'true';
}

function primaryIface(radio) {
	var ifaces = radio.ifaces || [];

	for (var i = 0; i < ifaces.length; i++) {
		if (uci.get('wireless', ifaces[i]['.name'], 'mode') === 'ap' && uci.get('wireless', ifaces[i]['.name'], 'disabled') !== '1')
			return ifaces[i];
	}

	return ifaces[0] || null;
}

function currentIfaceValue(iface, option, fallback) {
	return iface ? (uci.get('wireless', iface['.name'], option) || fallback || '') : (fallback || '');
}

function currentRadioValue(radio, option, fallback) {
	return radio ? (uci.get('wireless', radio.sid, option) || fallback || '') : (fallback || '');
}

function clampPct(value) {
	value = Number(value);
	if (!isFinite(value))
		value = 50;
	return Math.max(0, Math.min(100, value));
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('wireless'),
			uci.load('shawnwrt').catch(function() { return {}; })
		]).then(function() {
			var sections = uci.sections('wireless', 'wifi-device').filter(function(section) {
				return uci.get('wireless', section['.name'], 'type') === 'mtwifi';
			});
			var ifaces = uci.sections('wireless', 'wifi-iface');

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
							ifaces: ifaces.filter(function(iface) {
								return uci.get('wireless', iface['.name'], 'device') === sid;
							}),
							aps: [],
							scanned: false,
							scanning: false,
						scanError: null,
						subBand: null
					};
				});
			}));
		});
	},

	render: function(radios) {
		var activePage = 'analysis';
		if (window.location.hash === '#coverage') activePage = 'coverage';
		if (window.location.hash === '#roaming') activePage = 'roaming';

		function renderRoaming() {
			var enabled = uci.get('shawnwrt', 'steer', 'enabled') === '1';
			var thres2g = uci.get('shawnwrt', 'steer', 'threshold_2g') || '-80';
			var thres5g = uci.get('shawnwrt', 'steer', 'threshold_5g') || '-75';
			var interval = uci.get('shawnwrt', 'steer', 'interval') || '10';

			return E('div', { 'class': 'shawnwrt-coverage' }, [
				E('section', { 'class': 'shawnwrt-coverage-block' }, [
					E('div', { 'class': 'shawnwrt-coverage-head' }, [
						E('div', [
							E('h3', [ _('Smart Roaming Optimization') ]),
							E('p', { 'class': 'shawnwrt-channel-muted' }, [ _('Use user-space logic to guide weak-signal clients to roam, avoiding kernel instability.') ])
						]),
						E('div', { 'class': 'shawnwrt-toggle-field' }, [
							E('label', [ _('Enable') ]),
							E('input', {
								'type': 'checkbox',
								'checked': enabled ? 'checked' : null,
								'change': function(ev) {
									uci.set('shawnwrt', 'steer', 'enabled', ev.target.checked ? '1' : '0');
									refreshRoaming();
								}
							})
						])
					]),
					E('div', { 'class': 'shawnwrt-control-grid' }, [
						E('div', { 'class': 'shawnwrt-control-field' }, [
							E('label', [ _('2.4GHz Threshold (dBm)') ]),
							E('input', {
								'type': 'number',
								'value': thres2g,
								'min': -100,
								'max': -30,
								'input': function(ev) { uci.set('shawnwrt', 'steer', 'threshold_2g', ev.target.value); }
							})
						]),
						E('div', { 'class': 'shawnwrt-control-field' }, [
							E('label', [ _('5GHz Threshold (dBm)') ]),
							E('input', {
								'type': 'number',
								'value': thres5g,
								'min': -100,
								'max': -30,
								'input': function(ev) { uci.set('shawnwrt', 'steer', 'threshold_5g', ev.target.value); }
							})
						]),
						E('div', { 'class': 'shawnwrt-control-field' }, [
							E('label', [ _('Check Interval (sec)') ]),
							E('input', {
								'type': 'number',
								'value': interval,
								'min': 5,
								'max': 600,
								'input': function(ev) { uci.set('shawnwrt', 'steer', 'interval', ev.target.value); }
							})
						])
					]),
					E('div', { 'class': 'right', 'style': 'margin-top:1.25rem' }, [
						E('button', {
							'class': 'btn cbi-button-action important',
							'click': function(ev) {
								ev.currentTarget.classList.add('spinning');
								return uci.save()
									.then(L.bind(ui.changes.init, ui.changes))
									.then(L.bind(ui.changes.apply, ui.changes))
									.finally(function() { ev.currentTarget.classList.remove('spinning'); });
							}
						}, [ _('Save & Apply') ])
					])
				]),
				E('section', { 'class': 'shawnwrt-coverage-block' }, [
					E('h3', [ _('Connected Clients') ]),
					E('div', { 'class': 'shawnwrt-aplist', 'style': 'max-height:none' }, (function() {
						var rows = [];
						radios.forEach(function(radio) {
							(radio.info.assoclist || []).forEach(function(sta) {
								var sigPct = Math.min(100, Math.max(0, (Number(sta.signal || -100) + 100) * 1.25));
								var isWeak = false;
								if (radio.band === '2g' && sta.signal < thres2g) isWeak = true;
								if (radio.band === '5g' && sta.signal < thres5g) isWeak = true;

								rows.push(E('div', { 'class': 'shawnwrt-apitem' }, [
									E('span', { 'class': 'shawnwrt-apitem-ssid' }, [ (sta.remote_addr || sta.mac || '-') + (isWeak ? ' ⚠️' : '') ]),
									E('span', { 'class': 'shawnwrt-apitem-ch' }, [ bandTitle(radio.band) ]),
									E('span', { 'class': 'shawnwrt-apitem-sig' }, [
										E('span', { 'class': 'shawnwrt-apitem-bar', 'style': 'width:' + sigPct + '%; background:' + (isWeak ? '#e74c3c' : '#2ecc71') }),
										E('span', {}, [ sta.signal != null ? '%d dBm'.format(sta.signal) : '-' ])
									])
								]));
							});
						});
						return rows.length ? rows : [ E('p', { 'class': 'shawnwrt-channel-muted' }, [ _('No clients connected.') ]) ];
					})())
				])
			]);
		}

		function compactChildren(children) {
			return children.filter(function(child) {
				return child !== null && child !== undefined && child !== false;
			});
		}

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
			var cardBandTitle = radio.band === '2g' ? '2.4 GHz' : radio.band === '5g' ? '5 GHz' : radio.band;
			var canApply = radio.scanned && suggested && suggested !== '-';

				var btnAttrs = {
					'class': 'btn cbi-button cbi-button-action shawnwrt-channel-apply',
					'click': function() {
						return applySuggestedChannel(radio, suggested);
					}
				};
				
				if (!canApply)
					btnAttrs.disabled = 'disabled';

				return E('div', { 'class': 'shawnwrt-channel-card' }, [
					E('div', { 'class': 'shawnwrt-channel-card-head' }, [
						E('h3', [ radio.device, ' ', E('small', [ cardBandTitle ]) ]),
						E('span', { 'class': 'shawnwrt-channel-pill' }, [ radio.htmode ])
					]),
					E('div', { 'class': 'shawnwrt-channel-metrics' }, [
						E('div', [ E('b', [ radio.info.channel || '-' ]), E('span', [ _('Current channel') ]) ]),
						E('div', [ E('b', [ radio.scanned ? String(radio.aps.length) : '-' ]), E('span', [ _('Nearby APs') ]) ]),
						E('div', [ E('b', [ radio.scanned ? String(sameChannel) : '-' ]), E('span', [ _('Same-channel APs') ]) ]),
						E('div', [ E('b', [ suggested ]), E('span', [ _('Suggested channel') ]) ])
					]),
					E('button', btnAttrs, [ canApply ? _('Apply suggested channel') : _('No suggested channel') ])
				]);
			}

		function spectrumChart(radio) {
			var current = Number(radio.info.channel);
			var best = Number(scoreChannels(radio.freqs, radio.aps));
			var subBand = radio.subBand;
			var apList = radio.aps.filter(function(ap) {
				var ch = Number(ap.channel);
				if (subBand === '5low') return ch >= 36 && ch <= 64;
				if (subBand === '5high') return ch >= 149 && ch <= 177;
				return true;
			});
			var self = ownAp(radio);
			var ticks, minCh, maxCh, signalMin = -95, signalMax = -10;
			var width = 960, height = 470, padL = 42, padR = 16, padT = 24, padB = 44;
			var plotW = width - padL - padR;
			var plotH = height - padT - padB;
			var children = [];
			var tooltip = document.getElementById('shawnwrt-global-tooltip') || E('div', { 'class': 'shawnwrt-spectrum-tooltip is-hidden' });

			if (self) {
				var selfCh = Number(self.channel);
				var showSelf = !subBand || (subBand === '5low' && selfCh >= 36 && selfCh <= 64) || (subBand === '5high' && selfCh >= 149 && selfCh <= 177);
				if (showSelf) apList.push(self);
			}

			ticks = spectrumTicks(radio, apList, subBand);
			minCh = ticks.length ? ticks[0] : 1;
			maxCh = ticks.length ? ticks[ticks.length - 1] : 13;

			var is2g = (radio.band === '2g');
			minCh -= (is2g ? 2 : 6);
			maxCh += (is2g ? 2 : 6);

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

			function tooltipRows(ap, widthMHz) {
				return [
					E('b', [ ap.ssid || _('hidden') ]),
					E('span', [ _('BSSID'), ': ', ap.bssid || '-' ]),
					E('span', [ _('Channel'), ': ', String(ap.channel || '-') ]),
					E('span', [ _('Channel Width'), ': ', '%s MHz'.format(widthMHz) ]),
					E('span', [ _('Signal'), ': ', ap.signal != null ? '%s dBm'.format(ap.signal) : '-' ]),
					E('span', [ _('Quality'), ': ', ap.quality != null ? '%s/%s'.format(ap.quality, ap.quality_max || 100) : '-' ])
				];
			}

			function moveTooltip(ev) {
				tooltip.style.left = '%dpx'.format(ev.clientX + 14);
				tooltip.style.top = '%dpx'.format(ev.clientY + 14);
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
				var node = svgEl('g', { 'class': ap.isSelf ? 'shawnwrt-ap-shape is-self' : 'shawnwrt-ap-shape' }, [
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

				node.addEventListener('mouseenter', function(ev) {
					tooltip.replaceChildren.apply(tooltip, tooltipRows(ap, widthMHz));
					tooltip.classList.remove('is-hidden');
					moveTooltip(ev);
				});
				node.addEventListener('mousemove', moveTooltip);
				node.addEventListener('mouseleave', function() {
					tooltip.classList.add('is-hidden');
				});

				return node;
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
				return Number(b.signal || -95) - Number(a.signal || -95);
			}).forEach(function(ap, index) {
				svgNodes.push(apShape(ap, index));
			});

			svgNodes.push(svgEl('line', { 'x1': padL, 'x2': padL + plotW, 'y1': padT + plotH, 'y2': padT + plotH, 'class': 'shawnwrt-spectrum-axis' }));

			if (radio.band === '5g') {
				function mkTab(label, val) {
					return E('button', {
						'class': 'btn shawnwrt-tab' + (subBand === val ? ' active' : ''),
						'click': function(ev) {
							var oldSection = ev.currentTarget.closest('.shawnwrt-spectrum-section');
							var wasFullscreen = oldSection && oldSection.classList.contains('is-fullscreen');
							radio.subBand = val;
							var spectrum = document.getElementById(nodeId('shawnwrt-channel-spectrum', radio));
							if (spectrum) {
								spectrum.replaceChildren(spectrumChart(radio));
								if (wasFullscreen) {
									var newSection = spectrum.querySelector('.shawnwrt-spectrum-section');
									var overlay = document.querySelector('.shawnwrt-fs-overlay');
									if (overlay) {
										overlay.style.display = 'block';
										overlay.classList.remove('is-closing');
									}
									if (newSection)
										newSection.classList.add('is-fullscreen');
								}
							}
						}
					}, [ label ]);
				}
				children.push(E('div', { 'class': 'shawnwrt-spectrum-head' }, [
					E('h3', [ radio.device, ' ', E('small', [ '5 GHz' ]) ]),
					E('div', { 'class': 'shawnwrt-spectrum-actions' }, [
						E('div', { 'class': 'shawnwrt-tabs' }, [
							mkTab('5.2 GHz', '5low'),
							mkTab('5.8 GHz', '5high')
						]),
						E('button', { 'class': 'btn shawnwrt-zoom-btn', 'click': toggleFullscreen, 'title': _('Toggle fullscreen') }, [ '\u2922' ])
					])
				]));
			} else {
				children.push(E('div', { 'class': 'shawnwrt-spectrum-head' }, [
					E('h3', [ radio.device, ' ', E('small', [ '2.4 GHz' ]) ]),
					E('div', { 'class': 'shawnwrt-spectrum-actions' }, [
						E('span', { 'class': 'shawnwrt-channel-muted' }, [ _('Higher shapes mean stronger signal') ]),
						E('button', { 'class': 'btn shawnwrt-zoom-btn', 'click': toggleFullscreen, 'title': _('Toggle fullscreen') }, [ '\u2922' ])
					])
				]));
			}

			if (radio.scanning)
				children.push(E('p', { 'class': 'shawnwrt-channel-muted shawnwrt-scan-inline' }, [
					E('span', { 'class': 'shawnwrt-spinner', 'aria-hidden': 'true' }),
					_('Scanning nearby APs...')
				]));
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
			/* Tooltip appended to body so transform on section doesn't break fixed positioning */
			if (!document.getElementById('shawnwrt-global-tooltip')) {
				tooltip.id = 'shawnwrt-global-tooltip';
				document.body.appendChild(tooltip);
			}

			children.push(E('div', { 'class': 'shawnwrt-spectrum-legend' }, [
				E('span', { 'class': 'is-current' }, [ _('Current channel') ]),
				E('span', { 'class': 'is-best' }, [ _('Suggested channel') ])
			]));

			return E('section', { 'class': 'shawnwrt-spectrum-section' }, children);
		}

		function apListCompact(radio) {
			if (radio.scanning) {
				return E('div', { 'class': 'shawnwrt-aplist' }, [
					E('p', { 'class': 'shawnwrt-channel-muted shawnwrt-scan-inline' }, [
						E('span', { 'class': 'shawnwrt-spinner', 'aria-hidden': 'true' }),
						_('Scanning nearby APs...')
					])
				]);
			}
			var sorted = radio.aps.slice().sort(function(a, b) {
				return Number(b.signal || -100) - Number(a.signal || -100);
			});
			if (!sorted.length)
				return E('div', { 'class': 'shawnwrt-aplist' }, [ E('p', { 'class': 'shawnwrt-channel-muted' }, [ _('No scan results. Try refreshing after a few seconds.') ]) ]);
			var items = sorted.map(function(ap) {
				var sigPct = Math.min(100, Math.max(0, (Number(ap.signal || -100) + 100) * 1.25));
				return E('div', { 'class': 'shawnwrt-apitem' }, [
					E('span', { 'class': 'shawnwrt-apitem-ssid' }, [ ap.ssid || _('hidden') ]),
					E('span', { 'class': 'shawnwrt-apitem-ch' }, [ 'CH ' + (ap.channel || '-') ]),
					E('span', { 'class': 'shawnwrt-apitem-sig' }, [
						E('span', { 'class': 'shawnwrt-apitem-bar', 'style': 'width:' + sigPct + '%' }),
						E('span', {}, [ ap.signal != null ? '%d'.format(ap.signal) : '-' ])
					])
				]);
			});
			return E('div', { 'class': 'shawnwrt-aplist' }, items);
		}

		function closeFullscreen(section, overlay, keyHandler) {
			if (!section || !section.classList || !section.classList.contains('is-fullscreen'))
				section = document.querySelector('.shawnwrt-spectrum-section.is-fullscreen');
			if (!section)
				return;

			section.classList.add('is-closing');
			if (overlay) overlay.classList.add('is-closing');
			if (keyHandler) document.removeEventListener('keydown', keyHandler);
			setTimeout(function() {
				section.classList.remove('is-fullscreen', 'is-closing');
				if (overlay) { overlay.classList.remove('is-closing'); overlay.style.display = 'none'; }
			}, 220);
		}

		function toggleFullscreen(ev) {
			var section = ev.currentTarget.closest('.shawnwrt-spectrum-section');
			if (!section) return;
			var overlay = document.querySelector('.shawnwrt-fs-overlay');
			if (section.classList.contains('is-fullscreen')) {
				closeFullscreen(section, overlay, null);
				return;
			}
			if (!overlay) {
				overlay = E('div', { 'class': 'shawnwrt-fs-overlay' });
				document.body.appendChild(overlay);
			}
			overlay.style.display = 'block';
			overlay.classList.remove('is-closing');
			section.classList.add('is-fullscreen');
			var keyHandler = function(e) { if (e.key === 'Escape') closeFullscreen(null, overlay, keyHandler); };
			overlay.onclick = function() { closeFullscreen(null, overlay, keyHandler); };
			document.addEventListener('keydown', keyHandler);
		}

		function renderRadio(radio) {
			return E('div', { 'class': 'shawnwrt-radio-col' }, [
				E('div', { 'id': nodeId('shawnwrt-channel-card', radio) }, [ summaryCard(radio) ]),
				E('div', { 'id': nodeId('shawnwrt-channel-spectrum', radio) }, [ spectrumChart(radio) ]),
				E('div', { 'id': nodeId('shawnwrt-channel-table', radio) }, [ apListCompact(radio) ])
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
				table.replaceChildren(apListCompact(radio));
		}

		function scanRadio(radio) {
			radio.scanning = true;
			radio.scanError = null;
			updateRadio(radio);

			return L.resolveDefault(callScan(radio.device), []).then(function(results) {
				return L.resolveDefault(callSiteSurvey(radio.device), {}).then(function(siteSurveyResults) {
					radio.aps = (results || []).filter(function(ap) {
						return ap && ap.channel && bandFromChannel(ap.channel) === radio.band;
					}).map(function(ap) {
						var bssid = (ap.bssid || '').toUpperCase();
						if (siteSurveyResults && siteSurveyResults[bssid]) {
							ap.ssid = siteSurveyResults[bssid];
						}
						ap.ssid = cleanText(ap.ssid) || _('hidden');
						ap.band = ap.band || bandFromChannel(ap.channel);
						return ap;
					});
					radio.scanned = true;
				});
			}).catch(function(err) {
				radio.scanError = _('Scan failed: %s').format(err && err.message ? err.message : err);
			}).finally(function() {
				radio.scanning = false;
				updateRadio(radio);
			});
		}

		function scanAll(ev) {
			var btn = (ev && ev.currentTarget) || document.querySelector('.shawnwrt-channel-refresh');
			var startedAt = Date.now();

			function setScanButton(scanning) {
				if (!btn)
					return;

				btn.classList.toggle('is-scanning', scanning);
				btn.disabled = scanning;
				if (scanning) {
					btn.replaceChildren(
						E('span', { 'class': 'shawnwrt-spinner', 'aria-hidden': 'true' }),
						document.createTextNode(_('Scanning...'))
					);
				}
				else {
					btn.replaceChildren(document.createTextNode(_('Refresh Channels')));
				}
			}

			if (btn) {
				setScanButton(true);
			}
				return Promise.all(radios.map(scanRadio)).finally(function() {
					var wait = Math.max(0, 650 - (Date.now() - startedAt));
					return new Promise(function(resolve) {
						window.setTimeout(function() {
							setScanButton(false);
							resolve();
						}, wait);
					});
				});
			}

			function radioByBand(band) {
				for (var i = 0; i < radios.length; i++) {
					if (radios[i].band === band)
						return radios[i];
				}
				return null;
			}

			function apIfaces() {
				var result = [];

				radios.forEach(function(radio) {
					(radio.ifaces || []).forEach(function(iface) {
						if (uci.get('wireless', iface['.name'], 'mode') === 'ap')
							result.push(iface);
					});
				});

				return result;
			}

			function primaryApIfaces() {
				var result = [];

				radios.forEach(function(radio) {
					var iface = primaryIface(radio);

					if (iface && result.indexOf(iface) < 0)
						result.push(iface);
				});

				return result;
			}

			function firstApIface() {
				var list = primaryApIfaces();
				return list[0] || null;
			}

			function sameBandCredentials() {
				var first = firstApIface();
				var list = primaryApIfaces();

				if (!first || list.length < 2)
					return false;

				return list.every(function(iface) {
					return currentIfaceValue(iface, 'ssid') === currentIfaceValue(first, 'ssid') &&
						currentIfaceValue(iface, 'encryption') === currentIfaceValue(first, 'encryption') &&
						currentIfaceValue(iface, 'key') === currentIfaceValue(first, 'key');
				});
			}

			var coveragePoints = [
				{
					level: 0,
					id: 'performance',
					title: _('High-performance roaming'),
					desc: _('Prefer strong clients and fast roaming. Edge clients may disconnect earlier.'),
					tx2g: 35,
					tx5g: 100,
					kicklow: -72,
					assocthres: -78,
					steeringthresold: -62,
					steer_2g: -75,
					steer_5g: -72,
					steer_enabled: '1',
					bandsteering: '1',
					unify: '1',
					ieee80211k: '1',
					ieee80211v: '1',
					ieee80211r: '1'
				},
				{
					level: 25,
					id: 'small',
					title: _('Small room / dorm'),
					desc: _('Lower 2.4 GHz power and keep 5 GHz strong for close-range Apple-friendly roaming.'),
					tx2g: 50,
					tx5g: 100,
					kicklow: -78,
					assocthres: -82,
					steeringthresold: -66,
					steer_2g: -78,
					steer_5g: -75,
					steer_enabled: '1',
					bandsteering: '1',
					unify: '1',
					ieee80211k: '1',
					ieee80211v: '1',
					ieee80211r: '1'
				},
				{
					level: 50,
					id: 'balanced',
					title: _('Balanced home'),
					desc: _('General-purpose coverage and roaming balance for ordinary apartments.'),
					tx2g: 75,
					tx5g: 100,
					kicklow: -82,
					assocthres: -86,
					steeringthresold: -70,
					steer_2g: -82,
					steer_5g: -78,
					steer_enabled: '1',
					bandsteering: '1',
					unify: '1',
					ieee80211k: '1',
					ieee80211v: '1',
					ieee80211r: '0'
				},
				{
					level: 75,
					id: 'walls',
					title: _('Multi-wall home'),
					desc: _('Relax weak-signal rules and keep both radios strong for rooms behind walls.'),
					tx2g: 100,
					tx5g: 100,
					kicklow: -88,
					assocthres: -90,
					steeringthresold: -78,
					steer_2g: -86,
					steer_5g: -82,
					steer_enabled: '1',
					bandsteering: '1',
					unify: '1',
					ieee80211k: '1',
					ieee80211v: '1',
					ieee80211r: '0'
				},
				{
					level: 88,
					id: 'iot',
					title: _('IoT stability'),
					desc: _('Avoid kicking weak IoT clients and reduce roaming features that old devices dislike.'),
					tx2g: 100,
					tx5g: 75,
					kicklow: 0,
					assocthres: 0,
					steeringthresold: 0,
					steer_2g: 0,
					steer_5g: 0,
					steer_enabled: '0',
					bandsteering: '0',
					unify: '0',
					ieee80211k: '0',
					ieee80211v: '0',
					ieee80211r: '0'
				},
				{
					level: 100,
					id: 'maximum',
					title: _('Maximum coverage'),
					desc: _('Use maximum power and disable weak-signal kicking for the farthest corners.'),
					tx2g: 100,
					tx5g: 100,
					kicklow: 0,
					assocthres: 0,
					steeringthresold: 0,
					steer_2g: 0,
					steer_5g: 0,
					steer_enabled: '0',
					bandsteering: '0',
					unify: '0',
					ieee80211k: '0',
					ieee80211v: '0',
					ieee80211r: '0'
				}
			];

			function pointAt(level) {
				level = clampPct(level);

				for (var i = 0; i < coveragePoints.length; i++) {
					if (level === coveragePoints[i].level)
						return Object.assign({}, coveragePoints[i]);
					if (level < coveragePoints[i].level) {
						var left = coveragePoints[Math.max(0, i - 1)];
						var right = coveragePoints[i];
						var span = right.level - left.level || 1;
						var ratio = (level - left.level) / span;
						var nearest = ratio < .5 ? left : right;

						return {
							level: level,
							id: 'custom',
							title: _('Custom'),
							desc: _('Generated from the coverage slider.'),
							tx2g: Math.round(left.tx2g + (right.tx2g - left.tx2g) * ratio),
							tx5g: Math.round(left.tx5g + (right.tx5g - left.tx5g) * ratio),
							kicklow: Math.round(left.kicklow + (right.kicklow - left.kicklow) * ratio),
							assocthres: Math.round(left.assocthres + (right.assocthres - left.assocthres) * ratio),
							steeringthresold: Math.round(left.steeringthresold + (right.steeringthresold - left.steeringthresold) * ratio),
							steer_2g: Math.round((left.steer_2g || -85) + ((right.steer_2g || -85) - (left.steer_2g || -85)) * ratio),
							steer_5g: Math.round((left.steer_5g || -82) + ((right.steer_5g || -82) - (left.steer_5g || -82)) * ratio),
							steer_enabled: ratio < .5 ? left.steer_enabled : right.steer_enabled,
							bandsteering: nearest.bandsteering,
							unify: nearest.unify,
							ieee80211k: nearest.ieee80211k,
							ieee80211v: nearest.ieee80211v,
							ieee80211r: nearest.ieee80211r
						};
					}
				}

				return Object.assign({}, coveragePoints[coveragePoints.length - 1]);
			}

			function inferCoverageLevel(state) {
				var bestLevel = 50;
				var bestScore = Infinity;

				function numericScore(a, b, weight) {
					a = Number(a);
					b = Number(b);

					if (!isFinite(a) || !isFinite(b))
						return 0;

					return Math.abs(a - b) * weight;
				}

				function boolScore(a, b, weight) {
					return String(a) === String(b) ? 0 : weight;
				}

				for (var level = 0; level <= 100; level += 5) {
					var point = pointAt(level);
					var score =
						numericScore(state.tx2g, point.tx2g, .45) +
						numericScore(state.tx5g, point.tx5g, .35) +
						numericScore(state.steer_2g, point.steer_2g, .85) +
						numericScore(state.steer_5g, point.steer_5g, .85) +
						boolScore(state.bandsteering, point.bandsteering, 10) +
						boolScore(state.unify, point.unify, 6) +
						boolScore(state.ieee80211k, point.ieee80211k, 4) +
						boolScore(state.ieee80211r, point.ieee80211r, 4);

					if (score < bestScore) {
						bestScore = score;
						bestLevel = level;
					}
				}

				return bestLevel;
			}

			function coverageFromCurrent() {
				var radio2g = radioByBand('2g');
				var radio5g = radioByBand('5g');
				var first = firstApIface();

				var state = {
					level: 50,
					id: 'current',
					title: _('Current configuration'),
					desc: _('Loaded from current wireless settings.'),
					tx2g: Number(currentRadioValue(radio2g, 'txpower', '75')),
					tx5g: Number(currentRadioValue(radio5g, 'txpower', '100')),
					kicklow: Number(currentIfaceValue(first, 'kicklow', '0')),
					assocthres: Number(currentIfaceValue(first, 'assocthres', '0')),
					steeringthresold: Number(currentIfaceValue(first, 'steeringthresold', '0')),
					steer_enabled: uci.get('shawnwrt', 'steer', 'enabled') === '1',
					steer_2g: (uci.get('shawnwrt', 'steer', 'enabled') === '1') ? Number(uci.get('shawnwrt', 'steer', 'threshold_2g') || '-85') : 0,
					steer_5g: (uci.get('shawnwrt', 'steer', 'enabled') === '1') ? Number(uci.get('shawnwrt', 'steer', 'threshold_5g') || '-82') : 0,
					bandsteering: currentRadioValue(radio2g || radio5g, 'bandsteering', '0'),
					unify: sameBandCredentials() ? '1' : '0',
					ieee80211k: currentIfaceValue(first, 'ieee80211k', '0'),
					ieee80211v: currentIfaceValue(first, 'bss_transition', '0'),
					ieee80211r: currentIfaceValue(first, 'ieee80211r', '0'),
					ssid: currentIfaceValue(first, 'ssid'),
					encryption: currentIfaceValue(first, 'encryption', 'sae-mixed'),
					key: currentIfaceValue(first, 'key')
				};
				var inferredLevel = inferCoverageLevel(state);
				var preset = coveragePoints.filter(function(point) {
					return point.level === inferredLevel;
				})[0];

				state.level = inferredLevel;
				if (preset && Number(state.tx2g) === Number(preset.tx2g) &&
						Number(state.tx5g) === Number(preset.tx5g) &&
						Number(state.steer_2g) === Number(preset.steer_2g || 0) &&
						Number(state.steer_5g) === Number(preset.steer_5g || 0) &&
						String(state.bandsteering) === String(preset.bandsteering) &&
						String(state.unify) === String(preset.unify) &&
						String(state.ieee80211k) === String(preset.ieee80211k) &&
						String(state.ieee80211v) === String(preset.ieee80211v) &&
						String(state.ieee80211r) === String(preset.ieee80211r))
					state.id = preset.id;

				return state;
			}

			var coverageState = coverageFromCurrent();

			function withCredentials(state) {
				var first = firstApIface();

				state.ssid = state.ssid != null ? state.ssid : currentIfaceValue(first, 'ssid');
				state.encryption = state.encryption != null ? state.encryption : currentIfaceValue(first, 'encryption', 'sae-mixed');
				state.key = state.key != null ? state.key : currentIfaceValue(first, 'key');
				return state;
			}

			function setCoverageState(next) {
				coverageState = withCredentials(Object.assign({}, coverageState, next));
				refreshCoverage();
			}

			function addChange(changes, config, section, option, value) {
				if (!section || value == null)
					return;
				config = config || 'wireless';

				var oldValue = uci.get(config, section, option);
				var newValue = String(value);

				if (String(oldValue == null ? '' : oldValue) !== newValue) {
					changes.push({
						config: config,
						section: section,
						option: option,
						oldValue: oldValue == null ? '' : String(oldValue),
						newValue: newValue
					});
				}
			}

			function coverageChanges() {
				var changes = [];
				var radio2g = radioByBand('2g');
				var radio5g = radioByBand('5g');
				var ifaces = apIfaces();
				var primaryIfaces = primaryApIfaces();

				addChange(changes, 'wireless', radio2g && radio2g.sid, 'txpower', coverageState.tx2g);
				addChange(changes, 'wireless', radio5g && radio5g.sid, 'txpower', coverageState.tx5g);
				radios.forEach(function(radio) {
					addChange(changes, 'wireless', radio.sid, 'bandsteering', coverageState.bandsteering);
				});

				ifaces.forEach(function(iface) {
					var sid = iface['.name'];
					addChange(changes, 'wireless', sid, 'ieee80211k', coverageState.ieee80211k);
					addChange(changes, 'wireless', sid, 'bss_transition', coverageState.ieee80211v);
					addChange(changes, 'wireless', sid, 'ieee80211r', coverageState.ieee80211r);
					// Removed unstable kicklow/steering drivers
				});

				// Smart Roaming Linkage
				var steerEnabled = String(coverageState.steer_enabled) === '1' || coverageState.steer_enabled === true;
				addChange(changes, 'shawnwrt', 'steer', 'enabled', steerEnabled ? '1' : '0');
				if (steerEnabled) {
					addChange(changes, 'shawnwrt', 'steer', 'threshold_2g', coverageState.steer_2g);
					addChange(changes, 'shawnwrt', 'steer', 'threshold_5g', coverageState.steer_5g);
				}

				if (coverageState.unify === '1') {
					primaryIfaces.forEach(function(iface) {
						var sid = iface['.name'];

						addChange(changes, 'wireless', sid, 'ssid', coverageState.ssid);
						addChange(changes, 'wireless', sid, 'encryption', coverageState.encryption);
						addChange(changes, 'wireless', sid, 'key', coverageState.key);
					});
				}

				return changes;
			}

			function applyCoverageChanges() {
				var changes = coverageChanges();

				if (!changes.length) {
					ui.addNotification(null, E('p', [ _('No wireless changes to apply.') ]), 'info');
					return Promise.resolve();
				}

				return ui.showModal(_('Apply coverage control'), [
					E('p', [ _('The following wireless options will be changed. Wi-Fi clients may briefly disconnect.') ]),
					E('div', { 'class': 'shawnwrt-diff-list' }, changes.map(function(change) {
						return E('div', { 'class': 'shawnwrt-diff-row' }, [
							E('code', [ '%s.%s.%s'.format(change.config || 'wireless', change.section, change.option) ]),
							E('span', [ change.oldValue || '-' ]),
							E('span', [ '\u2192' ]),
							E('b', [ change.newValue || '-' ])
						]);
					})),
					E('div', { 'class': 'right' }, [
						E('button', { 'class': 'btn', 'click': ui.hideModal }, [ _('Cancel') ]),
						' ',
						E('button', {
							'class': 'btn cbi-button-action important',
							'click': function(ev) {
								ev.currentTarget.disabled = true;
								ev.currentTarget.classList.add('spinning');
								changes.forEach(function(change) {
									var cfg = change.config || 'wireless';
									if (cfg === 'shawnwrt' && !uci.get(cfg, change.section))
										uci.add(cfg, 'config', change.section);
									uci.set(cfg, change.section, change.option, change.newValue);
								});
								return uci.save()
									.then(L.bind(ui.changes.init, ui.changes))
									.then(L.bind(ui.changes.apply, ui.changes))
									.then(function() {
										ui.hideModal();
									})
									.catch(function(err) {
										ui.hideModal();
										ui.addNotification(null, E('p', [ _('Apply failed: %s').format(err && err.message ? err.message : err) ]), 'error');
									});
							}
						}, [ _('Apply changes') ])
					])
				]);
			}

			function selectControl(label, value, values, onChange) {
				return E('label', { 'class': 'shawnwrt-control-field' }, [
					E('span', [ label ]),
					E('select', {
						'change': function(ev) { onChange(ev.currentTarget.value); }
					}, values.map(function(item) {
						var attrs = { 'value': String(item.value) };

						if (String(item.value) === String(value))
							attrs.selected = 'selected';

						return E('option', attrs, [ item.label ]);
					}))
				]);
			}

			function numberControl(label, value, onChange) {
				return E('label', { 'class': 'shawnwrt-control-field' }, [
					E('span', [ label ]),
					E('input', {
						'type': 'number',
						'step': '1',
						'value': String(value),
						'change': function(ev) { onChange(Number(ev.currentTarget.value || 0)); }
					})
				]);
			}

			function textControl(label, value, type, disabled, onChange) {
				var attrs = {
					'type': type || 'text',
					'value': value || '',
					'change': function(ev) { onChange(ev.currentTarget.value); }
				};

				if (disabled)
					attrs.disabled = 'disabled';

				var inputEl = E('input', attrs);
				var children = [ E('span', [ label ]) ];

				if ((type || 'text') === 'password') {
					var wrapper = E('span', { 'style': 'position:relative;display:inline-flex;align-items:center;' }, [ inputEl ]);
					var eyeSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
					var toggleBtn = E('button', {
						'type': 'button',
						'class': 'shawnwrt-pw-toggle',
						'title': _('Long press to show password'),
						'style': 'position:absolute;right:6px;cursor:pointer;background:none;border:none;padding:2px;color:var(--foreground,currentColor);opacity:0.4;display:flex;align-items:center;'
					});
					toggleBtn.innerHTML = eyeSvg;

					var showPw = function() { inputEl.type = 'text'; toggleBtn.style.opacity = '0.7'; };
					var hidePw = function() { inputEl.type = 'password'; toggleBtn.style.opacity = '0.4'; };

					toggleBtn.addEventListener('mousedown', function(ev) { ev.preventDefault(); showPw(); });
					toggleBtn.addEventListener('mouseup', hidePw);
					toggleBtn.addEventListener('mouseleave', hidePw);
					toggleBtn.addEventListener('touchstart', function(ev) { ev.preventDefault(); showPw(); }, { passive: false });
					toggleBtn.addEventListener('touchend', hidePw);

					wrapper.appendChild(toggleBtn);
					children.push(wrapper);
				} else {
					children.push(inputEl);
				}

				return E('label', { 'class': 'shawnwrt-control-field' }, children);
			}

			function toggleControl(label, value, onChange) {
				var attrs = {
					'type': 'checkbox',
					'change': function(ev) { onChange(ev.currentTarget.checked ? '1' : '0'); }
				};

				if (boolValue(value))
					attrs.checked = 'checked';

				return E('label', { 'class': 'shawnwrt-toggle-field' }, [
					E('input', attrs),
					E('span', [ label ])
				]);
			}

			function renderCoverage() {
				var radio2g = radioByBand('2g');
				var radio5g = radioByBand('5g');
				var ifaces = apIfaces();
				var changes = coverageChanges();
				var disabledReason = null;
				var txValues = [
					{ value: 25, label: '25%' },
					{ value: 35, label: '35%' },
					{ value: 50, label: '50%' },
					{ value: 75, label: '75%' },
					{ value: 100, label: '100%' }
				];
				var encryptionValues = [
					{ value: 'sae-mixed', label: 'WPA2/WPA3 PSK/SAE' },
					{ value: 'psk2', label: 'WPA2-PSK' },
					{ value: 'sae', label: 'WPA3-SAE' },
					{ value: 'none', label: _('Open network') }
				];

				if (!radios.length)
					disabledReason = _('No MTK wireless radios were found.');
				else if (!ifaces.length)
					disabledReason = _('No AP interfaces were found.');
				else if (!radio2g || !radio5g)
					disabledReason = _('Both 2.4 GHz and 5 GHz radios are required for dual-band coverage presets.');

				return E('div', { 'class': 'shawnwrt-coverage' }, compactChildren([
					disabledReason ? E('p', { 'class': 'shawnwrt-channel-error' }, [ disabledReason ]) : null,
					E('section', { 'class': 'shawnwrt-coverage-block' }, [
						E('div', { 'class': 'shawnwrt-coverage-head' }, [
							E('div', [
								E('h3', [ _('Coverage tendency') ]),
								E('p', { 'class': 'shawnwrt-channel-muted' }, [ _('Move left to avoid long-tail weak clients, or right for maximum coverage.') ])
							]),
							E('strong', { 'class': 'shawnwrt-coverage-level' }, [ String(coverageState.level) ])
						]),
						E('input', {
							'class': 'shawnwrt-coverage-slider',
							'type': 'range',
							'min': '0',
							'max': '100',
							'step': '5',
							'value': String(coverageState.level),
							'input': function(ev) {
								var badge = ev.currentTarget.closest('.shawnwrt-coverage-block').querySelector('.shawnwrt-coverage-level');
								if (badge)
									badge.textContent = ev.currentTarget.value;
							},
							'change': function(ev) {
								setCoverageState(pointAt(ev.currentTarget.value));
							}
						}),
						E('div', { 'class': 'shawnwrt-coverage-scale' }, [
							E('span', [ _('Avoid long-tail') ]),
							E('span', [ _('Small room') ]),
							E('span', [ _('Balanced') ]),
							E('span', [ _('Multi-wall') ]),
							E('span', [ _('Maximum coverage') ])
						])
					]),
					E('section', { 'class': 'shawnwrt-coverage-block' }, [
						E('h3', [ _('Manual tuning') ]),
						E('div', { 'class': 'shawnwrt-coverage-status' }, radios.map(function(radio) {
							var iface = primaryIface(radio);
							return E('div', [
								E('b', [ radio.device, ' ', bandTitle(radio.band) ]),
								E('span', [ _('Tx power'), ': ', currentRadioValue(radio, 'txpower', '-'), '%' ]),
								E('span', [ _('SSID'), ': ', currentIfaceValue(iface, 'ssid', '-') ])
							]);
						})),
						E('div', { 'class': 'shawnwrt-control-grid' }, [
							selectControl(_('2.4 GHz power'), coverageState.tx2g, txValues, function(v) { coverageState.tx2g = Number(v); render(); }),
							selectControl(_('5 GHz power'), coverageState.tx5g, txValues, function(v) { coverageState.tx5g = Number(v); render(); }),
							numberControl(_('2.4GHz Roaming (dBm)'), coverageState.steer_2g, function(v) { coverageState.steer_2g = v; render(); }),
							numberControl(_('5GHz Roaming (dBm)'), coverageState.steer_5g, function(v) { coverageState.steer_5g = v; render(); })
						]),
						E('div', { 'class': 'shawnwrt-toggle-grid' }, [
							toggleControl(_('Smart Roaming'), coverageState.steer_enabled, function(v) { coverageState.steer_enabled = v; render(); }),
							toggleControl(_('Band steering'), coverageState.bandsteering, function(v) { coverageState.bandsteering = v; render(); }),
							toggleControl(_('Unify SSID'), coverageState.unify, function(v) { coverageState.unify = v; render(); }),
							toggleControl(_('802.11k neighbor report'), coverageState.ieee80211k, function(v) { coverageState.ieee80211k = v; render(); }),
							toggleControl(_('802.11v BSS Transition'), coverageState.ieee80211v, function(v) { coverageState.ieee80211v = v; render(); }),
							toggleControl(_('802.11r fast roaming'), coverageState.ieee80211r, function(v) { coverageState.ieee80211r = v; render(); })
						]),
						E('div', { 'class': 'shawnwrt-control-grid' }, [
							textControl(_('Unified SSID'), coverageState.ssid, 'text', coverageState.unify !== '1', function(value) { setCoverageState({ ssid: value, id: 'custom' }); }),
							selectControl(_('Unified encryption'), coverageState.encryption, encryptionValues, function(value) { setCoverageState({ encryption: value, id: 'custom' }); }),
							textControl(_('Unified password'), coverageState.key, 'password', coverageState.unify !== '1' || coverageState.encryption === 'none', function(value) { setCoverageState({ key: value, id: 'custom' }); })
						])
					]),
					E('section', { 'class': 'shawnwrt-coverage-block' }, compactChildren([
						E('div', { 'class': 'shawnwrt-coverage-head' }, [
							E('div', [
								E('h3', [ _('Change preview') ]),
								E('p', { 'class': 'shawnwrt-channel-muted' }, [ changes.length ? _('Review these UCI changes before applying.') : _('No wireless changes to apply.') ])
							]),
							E('button', (function() {
								var attrs = {
									'class': 'btn cbi-button cbi-button-action',
									'click': applyCoverageChanges
								};

								if (disabledReason || !changes.length)
									attrs.disabled = 'disabled';

								return attrs;
							})(), [ _('Apply changes') ])
						]),
						changes.length ? E('div', { 'class': 'shawnwrt-diff-list' }, changes.map(function(change) {
							return E('div', { 'class': 'shawnwrt-diff-row' }, [
								E('code', [ 'wireless.%s.%s'.format(change.section, change.option) ]),
								E('span', [ change.oldValue || '-' ]),
								E('span', [ '\u2192' ]),
								E('b', [ change.newValue || '-' ])
							]);
						})) : null
					]))
				]));
			}

			var coveragePanel, analysisPanel;

			function refreshCoverage() {
				if (coveragePanel)
					coveragePanel.replaceChildren(renderCoverage());
			}

			function switchPage(page) {
				var panels = document.querySelectorAll('.shawnwrt-page-panel');
				var tabs = document.querySelectorAll('.shawnwrt-page-tab');

				for (var i = 0; i < panels.length; i++)
					panels[i].classList.toggle('active', panels[i].getAttribute('data-page') === page);

				for (var j = 0; j < tabs.length; j++)
					tabs[j].classList.toggle('active', tabs[j].getAttribute('data-page') === page);

				activePage = page;
				if (window.history && window.history.replaceState) {
					var hash = '#analysis';
					if (page === 'coverage') hash = '#coverage';
					window.history.replaceState(null, '', hash);
				}
			}

			var root = E('div', { 'class': 'cbi-map shawnwrt-channel-analysis' }, [
				E('style', {}, [ `
				.shawnwrt-channel-analysis {
					--swrt-panel: rgba(255,255,255,.72);
					--swrt-panel-border: rgba(0,0,0,.10);
					--swrt-muted: rgba(0,0,0,.58);
					--swrt-spectrum-bg: rgba(0,0,0,.035);
					--swrt-spectrum-grid: rgba(0,0,0,.16);
					--swrt-spectrum-axis: rgba(0,0,0,.38);
					--swrt-spectrum-label: rgba(0,0,0,.62);
					--swrt-spectrum-label-strong: rgba(0,0,0,.82);
					--swrt-tooltip-bg: #ffffff;
					--swrt-tooltip-fg: rgba(0,0,0,.86);
					--swrt-tooltip-border: rgba(0,0,0,.14);
					max-width: 108rem;
					margin: 0 auto;
				}
				.shawnwrt-channel-titlebar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
				.shawnwrt-channel-titlebar h2 { margin: 0; }
				.shawnwrt-page-tabs { display: inline-flex; gap: 0; border: 1px solid var(--swrt-panel-border); border-radius: 8px; overflow: hidden; margin-bottom: 1rem; background: var(--swrt-panel); }
				.shawnwrt-page-tab { border: none; border-radius: 0; min-height: 2.35rem; padding: .45rem 1rem; background: transparent; color: var(--swrt-muted); cursor: pointer; font-weight: 700; }
				.shawnwrt-page-tab + .shawnwrt-page-tab { border-left: 1px solid var(--swrt-panel-border); }
				.shawnwrt-page-tab.active { background: rgba(52,152,219,.14); color: #1f6f9f; }
				.shawnwrt-page-tab:hover:not(.active) { background: rgba(0,0,0,.04); }
				.shawnwrt-page-panel { display: none; }
				.shawnwrt-page-panel.active { display: block; }
				.shawnwrt-channel-refresh { min-width: 7.5rem; display: inline-flex; align-items: center; justify-content: center; gap: .45rem; }
				.shawnwrt-channel-refresh.is-scanning { cursor: progress; opacity: .92; }
				.shawnwrt-scan-inline { display: inline-flex; align-items: center; gap: .45rem; margin: .35rem 0 .55rem; }
				.shawnwrt-dual-col { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .9rem; }
				@media (max-width: 960px) { .shawnwrt-dual-col { grid-template-columns: 1fr; } }
				.shawnwrt-radio-col { display: flex; flex-direction: column; gap: .75rem; min-width: 0; }
				.shawnwrt-channel-card { border: 1px solid var(--swrt-panel-border); border-radius: 10px; padding: .85rem 1rem; background: var(--swrt-panel); }
				.shawnwrt-channel-card-head { display: flex; justify-content: space-between; gap: 1rem; align-items: center; margin-bottom: .6rem; }
				.shawnwrt-channel-card h3 { margin: 0; font-size: 1rem; }
				.shawnwrt-channel-card small { opacity: .65; font-weight: 500; }
				.shawnwrt-channel-pill { border-radius: 999px; padding: .15rem .5rem; background: rgba(52,152,219,.14); color: #1f6f9f; font-weight: 700; font-size: .8rem; }
				.shawnwrt-channel-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: .5rem; }
				.shawnwrt-channel-metrics div { min-width: 0; }
				.shawnwrt-channel-metrics b { display: block; font-size: 1.15rem; line-height: 1.2; }
				.shawnwrt-channel-metrics span { color: var(--swrt-muted); font-size: .78rem; }
				.shawnwrt-channel-apply { margin-top: .6rem; width: 100%; }
				@keyframes shawnwrt-spin { to { transform: rotate(360deg); } }
				.shawnwrt-spinner { display: inline-block; width: 1.05em; height: 1.05em; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: shawnwrt-spin .72s linear infinite; vertical-align: -.12em; opacity: .86; transform-origin: center; }
				.shawnwrt-spectrum-section { border: 1px solid var(--swrt-panel-border); border-radius: 10px; padding: .68rem; background: var(--swrt-panel); position: relative; min-height: 24.5rem; display: flex; flex-direction: column; }
				@keyframes shawnwrt-fs-in { from { opacity: 0; } to { opacity: 1; } }
				@keyframes shawnwrt-fs-out { from { opacity: 1; } to { opacity: 0; } }
				@keyframes shawnwrt-ov-in { from { opacity: 0; } to { opacity: 1; } }
				@keyframes shawnwrt-ov-out { from { opacity: 1; } to { opacity: 0; } }
				.shawnwrt-spectrum-section.is-fullscreen { position: fixed; inset: 0; margin: auto; z-index: 9990; width: 92vw; max-width: 72rem; height: fit-content; min-height: 0; max-height: 88vh; border-radius: 12px; padding: 1.25rem; overflow-y: auto; box-shadow: 0 24px 80px rgba(0,0,0,.32); animation: shawnwrt-fs-in .22s ease forwards; background: #fff; }
				.shawnwrt-spectrum-section.is-closing { animation: shawnwrt-fs-out .18s ease forwards; }
				.shawnwrt-spectrum-section.is-fullscreen .shawnwrt-spectrum-svg { min-width: 0; height: auto; max-height: 66vh; }
				.shawnwrt-spectrum-section.is-fullscreen .shawnwrt-zoom-btn { font-size: 1rem; }
				.shawnwrt-fs-overlay { display: none; position: fixed; inset: 0; z-index: 9989; background: rgba(0,0,0,.45); animation: shawnwrt-ov-in .25s ease forwards; }
				.shawnwrt-fs-overlay.is-closing { animation: shawnwrt-ov-out .2s ease forwards; }
				.shawnwrt-spectrum-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: .5rem; min-height: 2.05rem; }
				.shawnwrt-spectrum-head h3 { margin: 0; font-size: 1rem; }
				.shawnwrt-spectrum-actions { display: flex; align-items: center; gap: .5rem; }
				.shawnwrt-spectrum-head small, .shawnwrt-channel-muted { color: var(--swrt-muted); font-weight: 500; font-size: .82rem; }
				.shawnwrt-zoom-btn { border: none; background: none; cursor: pointer; font-size: 1.2rem; padding: .1rem .3rem; opacity: .5; transition: opacity .15s; line-height: 1; }
				.shawnwrt-zoom-btn:hover { opacity: 1; }
				.shawnwrt-zoom-btn::after { content: ''; }
				.shawnwrt-spectrum-scroll { overflow: hidden; border-radius: 6px; background: #f5f5f7; flex: 1 1 auto; min-height: 0; }
				.shawnwrt-spectrum-svg { display: block; width: 100%; min-width: 0; height: 100%; min-height: 17.6rem; background: #f5f5f7; }
				.shawnwrt-spectrum-bg { fill: var(--swrt-spectrum-bg); }
				.shawnwrt-spectrum-grid { stroke: var(--swrt-spectrum-grid); stroke-dasharray: 3 5; }
				.shawnwrt-spectrum-axis, .shawnwrt-spectrum-tick { stroke: var(--swrt-spectrum-axis); }
				.shawnwrt-spectrum-y { fill: var(--swrt-spectrum-label); font-size: 1rem; font-weight: 700; }
				.shawnwrt-spectrum-x { fill: var(--swrt-spectrum-label); font-size: .98rem; font-weight: 700; }
				.shawnwrt-spectrum-x.is-current { fill: #f2994a; }
				.shawnwrt-spectrum-x.is-best { fill: #2ecc71; }
				.shawnwrt-ap-shape rect { fill-opacity: .20; stroke-opacity: .78; stroke-width: 2.2; }
				.shawnwrt-ap-shape:hover rect { fill-opacity: .34; stroke-opacity: .95; stroke-width: 3.4; }
				.shawnwrt-ap-shape.is-self rect { fill: url(#shawnwrt-hatch); fill-opacity: .72; stroke: #f2994a !important; stroke-width: 3; }
				.shawnwrt-ap-label { fill: var(--swrt-spectrum-label-strong); font-size: .98rem; font-weight: 780; text-anchor: middle; paint-order: stroke; stroke: var(--swrt-spectrum-bg); stroke-width: 3.5; stroke-linejoin: round; pointer-events: none; }
				.shawnwrt-ap-label.is-self { fill: #bf6b22; font-size: 1.06rem; }
				.shawnwrt-spectrum-tooltip { position: fixed; z-index: 9999; max-width: 18rem; padding: .65rem .75rem; border: 1px solid var(--swrt-tooltip-border); border-radius: 8px; background: var(--swrt-tooltip-bg); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); color: var(--swrt-tooltip-fg); box-shadow: 0 12px 28px rgba(0,0,0,.18); pointer-events: none; display: grid; gap: .18rem; font-size: .86rem; line-height: 1.35; }
				.shawnwrt-spectrum-tooltip b { font-size: .95rem; margin-bottom: .15rem; overflow-wrap: anywhere; }
				.shawnwrt-spectrum-tooltip span { color: inherit; opacity: .78; }
				.shawnwrt-spectrum-tooltip.is-hidden { display: none; }
				.shawnwrt-spectrum-legend { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem .8rem; margin-top: .5rem; min-height: 1.2rem; color: var(--swrt-muted); font-size: .8rem; }
				.shawnwrt-spectrum-legend span::before { content: ''; display: inline-block; width: .6rem; height: .6rem; border-radius: .15rem; background: #2e86de; margin-right: .3rem; vertical-align: -.03rem; }
				.shawnwrt-spectrum-legend .is-current::before { background: #f2994a; }
				.shawnwrt-spectrum-legend .is-best::before { background: #2ecc71; }
				.shawnwrt-aplist { border: 1px solid var(--swrt-panel-border); border-radius: 10px; background: var(--swrt-panel); padding: .5rem; max-height: 18rem; overflow-y: auto; }
				.shawnwrt-apitem { display: grid; grid-template-columns: 1fr auto 7rem; gap: .4rem; align-items: center; padding: .35rem .5rem; border-radius: 6px; font-size: .82rem; }
				.shawnwrt-apitem:hover { background: rgba(0,0,0,.04); }
				.shawnwrt-apitem-ssid { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
				.shawnwrt-apitem-ch { color: var(--swrt-muted); font-size: .75rem; font-weight: 600; white-space: nowrap; }
				.shawnwrt-apitem-sig { display: flex; align-items: center; gap: .3rem; position: relative; }
				.shawnwrt-apitem-sig > span:last-child { font-size: .72rem; color: var(--swrt-muted); min-width: 2rem; text-align: right; }
				.shawnwrt-apitem-bar { display: block; height: 4px; border-radius: 2px; background: #2ecc71; min-width: 2px; }
				.shawnwrt-channel-error { color: #c0392b; }
				.shawnwrt-channel-actions { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
				.shawnwrt-coverage { display: grid; gap: .9rem; }
				.shawnwrt-coverage-block { border: 1px solid var(--swrt-panel-border); border-radius: 10px; padding: 1rem; background: var(--swrt-panel); }
				.shawnwrt-coverage-block h3 { margin: 0 0 .65rem; font-size: 1rem; }
				.shawnwrt-coverage-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: .75rem; }
				.shawnwrt-coverage-head h3 { margin-bottom: .2rem; }
				.shawnwrt-coverage-head p { margin: 0; }
				.shawnwrt-coverage-level { min-width: 3rem; text-align: center; padding: .25rem .55rem; border-radius: 999px; background: rgba(52,152,219,.14); color: #1f6f9f; }
				.shawnwrt-coverage-slider { width: 100%; }
				.shawnwrt-coverage-scale { display: flex; justify-content: space-between; gap: .4rem; margin-top: .45rem; color: var(--swrt-muted); font-size: .78rem; }
				.shawnwrt-preset-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .7rem; }
				.shawnwrt-preset-card { min-height: 5.5rem; text-align: left; border: 1px solid var(--swrt-panel-border); border-radius: 8px; padding: .8rem; background: rgba(255,255,255,.42); color: inherit; cursor: pointer; transition: border-color .15s, background .15s, transform .15s; }
				.shawnwrt-preset-card:hover { border-color: rgba(52,152,219,.42); transform: translateY(-1px); }
				.shawnwrt-preset-card.active { border-color: rgba(52,152,219,.72); background: rgba(52,152,219,.12); }
				.shawnwrt-preset-card b { display: block; margin-bottom: .35rem; }
				.shawnwrt-preset-card span { display: block; color: var(--swrt-muted); font-size: .8rem; line-height: 1.35; }
				.shawnwrt-coverage-status { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .65rem; margin-bottom: .85rem; }
				.shawnwrt-coverage-status > div { display: grid; gap: .22rem; border: 1px solid var(--swrt-panel-border); border-radius: 8px; padding: .65rem; }
				.shawnwrt-coverage-status span { color: var(--swrt-muted); font-size: .82rem; }
				.shawnwrt-control-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .7rem; margin-top: .7rem; }
				.shawnwrt-control-field { display: grid; gap: .3rem; min-width: 0; font-weight: 700; color: var(--swrt-muted); font-size: .8rem; }
				.shawnwrt-control-field input, .shawnwrt-control-field select { width: 100%; min-height: 2.35rem; box-sizing: border-box; }
				.shawnwrt-toggle-grid { display: flex; flex-wrap: wrap; gap: .55rem .9rem; margin-top: .8rem; }
				.shawnwrt-toggle-field { display: inline-flex; align-items: center; gap: .38rem; min-height: 2.2rem; font-weight: 700; }
				.shawnwrt-diff-list { display: grid; gap: .4rem; max-height: 20rem; overflow-y: auto; }
				.shawnwrt-diff-row { display: grid; grid-template-columns: minmax(12rem, 1.4fr) minmax(4rem, .8fr) auto minmax(4rem, .8fr); gap: .45rem; align-items: center; border: 1px solid var(--swrt-panel-border); border-radius: 7px; padding: .45rem .55rem; }
				.shawnwrt-diff-row code { overflow-wrap: anywhere; }
				.shawnwrt-diff-row span { color: var(--swrt-muted); overflow-wrap: anywhere; }
				.shawnwrt-diff-row b { overflow-wrap: anywhere; }
				@media (max-width: 960px) {
					.shawnwrt-preset-grid, .shawnwrt-coverage-status, .shawnwrt-control-grid { grid-template-columns: 1fr; }
					.shawnwrt-coverage-scale { font-size: .7rem; }
					.shawnwrt-diff-row { grid-template-columns: 1fr; }
				}
				@media (prefers-color-scheme: dark) {
					.shawnwrt-channel-analysis {
						--swrt-panel: rgba(255,255,255,.06);
						--swrt-panel-border: rgba(255,255,255,.12);
						--swrt-muted: rgba(255,255,255,.62);
						--swrt-spectrum-bg: rgba(255,255,255,.055);
						--swrt-spectrum-grid: rgba(255,255,255,.16);
						--swrt-spectrum-axis: rgba(255,255,255,.34);
						--swrt-spectrum-label: rgba(255,255,255,.64);
						--swrt-spectrum-label-strong: rgba(255,255,255,.82);
						--swrt-tooltip-bg: #181b1f;
						--swrt-tooltip-fg: rgba(255,255,255,.88);
						--swrt-tooltip-border: rgba(255,255,255,.16);
					}
					.shawnwrt-ap-label.is-self { fill: #ffd1aa; }
					.shawnwrt-apitem:hover { background: rgba(255,255,255,.06); }
					.shawnwrt-spectrum-section.is-fullscreen { background: #1a1d21; }
					.shawnwrt-spectrum-scroll, .shawnwrt-spectrum-svg { background: #23272e; }
					.shawnwrt-page-tab.active { background: rgba(52,152,219,.22); color: #5dade2; }
					.shawnwrt-page-tab:hover:not(.active) { background: rgba(255,255,255,.06); }
					.shawnwrt-preset-card { background: rgba(255,255,255,.04); }
					.shawnwrt-preset-card.active { background: rgba(52,152,219,.18); }
				}
			` ]),
			E('div', { 'class': 'shawnwrt-channel-titlebar' }, [
				E('h2', [ _('Channel Analysis') ])
			]),
			E('div', { 'class': 'shawnwrt-page-tabs' }, [
				E('button', { 'class': 'shawnwrt-page-tab' + (activePage === 'analysis' ? ' active' : ''), 'data-page': 'analysis', 'click': function() { switchPage('analysis'); } }, [ _('Channel Analysis') ]),
				E('button', { 'class': 'shawnwrt-page-tab' + (activePage === 'coverage' ? ' active' : ''), 'data-page': 'coverage', 'click': function() { switchPage('coverage'); } }, [ _('Coverage Control') ])
			]),
			E('div', { 'class': 'shawnwrt-page-panels' }, [
				analysisPanel = E('div', { 'class': 'shawnwrt-page-panel' + (activePage === 'analysis' ? ' active' : ''), 'data-page': 'analysis' }, [
					E('div', { 'class': 'shawnwrt-channel-actions' }, [
						E('span', { 'class': 'shawnwrt-channel-muted' }, [ _('Scans nearby APs and suggests the best channels for your environment.') ]),
						E('button', {
							'class': 'btn cbi-button cbi-button-action shawnwrt-channel-refresh',
							'click': scanAll
						}, [ _('Refresh Channels') ])
					]),
					E('div', { 'class': 'shawnwrt-dual-col' }, radios.map(renderRadio))
				]),
				coveragePanel = E('div', { 'class': 'shawnwrt-page-panel' + (activePage === 'coverage' ? ' active' : ''), 'data-page': 'coverage' }, [ renderCoverage() ])
			])
		]);

		if (activePage === 'analysis')
			window.setTimeout(scanAll, 0);
		return root;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
