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
						scanError: null,
						subBand: null
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
						E('h3', [ radio.device, ' ', E('small', [ bandTitle ]) ]),
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
				return Number(a.signal || -95) - Number(b.signal || -95);
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
				.shawnwrt-tabs { display: inline-flex; gap: 0; border: 1px solid var(--swrt-panel-border); border-radius: 6px; overflow: hidden; }
				.shawnwrt-tab { border: none; border-radius: 0; padding: .25rem .65rem; font-size: .78rem; font-weight: 600; background: transparent; color: var(--swrt-muted); cursor: pointer; transition: background .15s, color .15s; }
				.shawnwrt-tab + .shawnwrt-tab { border-left: 1px solid var(--swrt-panel-border); }
				.shawnwrt-tab.active { background: rgba(52,152,219,.14); color: #1f6f9f; }
				.shawnwrt-tab:hover:not(.active) { background: rgba(0,0,0,.04); }
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
					.shawnwrt-tab.active { background: rgba(52,152,219,.22); color: #5dade2; }
					.shawnwrt-tab:hover:not(.active) { background: rgba(255,255,255,.06); }
				}
			` ]),
			E('div', { 'class': 'shawnwrt-channel-titlebar' }, [
				E('h2', [ _('Channel Analysis') ]),
				E('button', {
					'class': 'btn cbi-button cbi-button-action shawnwrt-channel-refresh',
					'click': scanAll
				}, [ _('Refresh Channels') ])
			]),
			E('div', { 'class': 'shawnwrt-dual-col' }, radios.map(renderRadio))
		]);

		window.setTimeout(scanAll, 0);
		return root;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
