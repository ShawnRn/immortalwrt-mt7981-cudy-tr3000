'use strict';
'require view';
'require fs';
'require ui';

var zh = (document.documentElement.getAttribute('lang') || navigator.language || '').toLowerCase().indexOf('zh') === 0;

var L = {
	title: zh ? 'ShawnWrt 在线升级' : _('ShawnWrt OTA'),
	subtitle: zh ? '自动判断当前系统是否已是最新版本。有更新时再下载、校验并安装。' : _('Automatically checks whether this router is current. Download, verify, and install only when an update is available.'),
	currentTitle: zh ? '已是最新版本' : _('Already up to date'),
	currentText: zh ? '当前系统已经安装最新发布版本，无需操作。' : _('This router is already running the latest release. No action is needed.'),
	updateTitle: zh ? '发现新版本' : _('Update available'),
	updateText: zh ? '可以先测试升级，确认通过后再安装。安装会保留配置并重启路由器。' : _('Run the upgrade test first, then install. Configuration will be preserved and the router will reboot.'),
	pendingTitle: zh ? '安装已启动' : _('Installation started'),
	pendingText: zh ? '固件刷写已经交给系统后台执行。请等待路由器自动重启，期间不要断电。' : _('Firmware installation is running in the background. Wait for the router to reboot and do not power it off.'),
	unknownTitle: zh ? '无法判断当前版本' : _('Current version unknown'),
	unknownText: zh ? '这是旧版 OTA 首次记录前的状态。若你刚刚手动刷入了最新固件，可以点击“标记为已安装”。' : _('This can happen before the OTA helper has recorded an installed release. If you just flashed the latest image manually, mark it as installed.'),
	installedRelease: zh ? '当前已安装' : _('Installed release'),
	detectedBoard: zh ? '设备目标' : _('Detected board'),
	latestRelease: zh ? '最新版本' : _('Latest release'),
	firmwareImage: zh ? '固件文件' : _('Firmware image'),
	fileSize: zh ? '文件大小' : _('File size'),
	sha256: 'SHA256',
	unknown: zh ? '未知' : _('Unknown'),
	noInfo: zh ? '暂无 OTA 信息。' : _('No OTA information available.'),
	done: zh ? '完成。' : _('Done.'),
	failed: zh ? '命令执行失败，请查看下方输出。' : _('Command failed. Check the output below.'),
	checkOk: zh ? '检查完成。' : _('Update check completed.'),
	testOk: zh ? '测试通过，可以安装。' : _('Upgrade test passed. You can install the update.'),
	downloadOk: zh ? '下载并校验完成。' : _('Download and verification completed.'),
	installStarted: zh ? '已开始安装，路由器会重启。' : _('Installation started. The router will reboot.'),
	installStartedLine: zh ? '安装已启动：后台正在执行 sysupgrade，路由器稍后会自动重启。' : _('Installation started: sysupgrade is running in the background and the router will reboot shortly.'),
	pendingLine: zh ? '待完成安装' : _('Pending install'),
	installLogLine: zh ? '安装日志' : _('Install log'),
	forceTr3000: zh ? 'TR3000 512MB 兼容性检查已通过：当前系统报告 cudy,tr3000-v1，固件目标为 cudy,tr3000-512mb-v1，这是 ShawnWrt 512MB 固件的预期差异，已安全使用强制兼容测试。' : _('TR3000 512MB compatibility check passed: the running system reports cudy,tr3000-v1 while the image target is cudy,tr3000-512mb-v1. This is expected for ShawnWrt 512MB images, so the forced compatibility test was used safely.'),
	testPassedLine: zh ? '测试通过：固件已通过 sysupgrade 兼容性检查。' : _('Test passed: the firmware passed the sysupgrade compatibility check.'),
	shaLine: zh ? 'SHA256 校验通过' : _('SHA256 verified'),
	downloadLine: zh ? '固件路径' : _('Firmware path'),
	stateLine: zh ? '状态' : _('State'),
	installedLine: zh ? '当前已安装' : _('Installed'),
	latestLine: zh ? '最新版本' : _('Latest'),
	check: zh ? '检查更新' : _('Check'),
	test: zh ? '测试升级' : _('Test upgrade'),
	download: zh ? '下载固件' : _('Download'),
	install: zh ? '安装更新' : _('Install update'),
	markInstalled: zh ? '标记为已安装' : _('Mark installed'),
	cancel: zh ? '取消' : _('Cancel'),
	close: zh ? '关闭' : _('Close'),
	help: zh ? '说明' : _('Help'),
	helpTitle: zh ? '在线升级说明' : _('OTA help'),
	helpIntro: zh ? '这个页面会自动匹配当前设备对应的 sysupgrade 固件，下载后校验 SHA256，并在安装前执行升级测试。' : _('This page automatically matches the sysupgrade image for this device, verifies SHA256 after download, and runs an upgrade test before installation.'),
	helpFlowTitle: zh ? '推荐流程' : _('Recommended flow'),
	helpFlow: zh ? [
		'点击“检查更新”，确认是否发现新版本。',
		'有新版本时先点“测试升级”，确认镜像与当前设备匹配。',
		'测试通过后点“安装更新”。系统会保留配置并自动重启。',
		'只想提前保存固件文件时，使用“下载固件”。'
	] : [
		'Click “Check” to see whether a newer release exists.',
		'When an update is available, run “Test upgrade” first to verify image compatibility.',
		'After the test passes, click “Install update”. Configuration is preserved and the router reboots.',
		'Use “Download” only when you want to keep the firmware file without installing it.'
	],
	helpButtonsTitle: zh ? '按钮含义' : _('Buttons'),
	helpButtons: zh ? [
		'检查更新：读取 GitHub Release，比较当前记录版本与最新版。',
		'测试升级：下载并校验固件，然后执行 sysupgrade 测试，不会真正刷入。',
		'下载固件：只下载和校验固件，不安装。',
		'安装更新：下载、校验、测试并执行 sysupgrade，保留配置。'
	] : [
		'Check: reads GitHub Releases and compares the installed release with the latest one.',
		'Test upgrade: downloads and verifies the image, then runs sysupgrade test without flashing.',
		'Download: downloads and verifies the image only.',
		'Install update: downloads, verifies, tests, then runs sysupgrade while preserving configuration.'
	],
	helpNotesTitle: zh ? '注意事项' : _('Notes'),
	helpNotes: zh ? [
		'安装期间网络会中断，页面可能暂时失去连接。',
		'TR3000 512MB 会自动选择 cudy_tr3000-512mb-v1 固件；360T7 会自动选择 qihoo_360t7 固件。',
		'不要手动混刷其他设备或其他分区布局的镜像。'
	] : [
		'Network access is interrupted during installation and the page may temporarily disconnect.',
		'TR3000 512MB automatically selects the cudy_tr3000-512mb-v1 image; 360T7 selects the qihoo_360t7 image.',
		'Do not manually flash images for other devices or partition layouts.'
	],
	confirmTitle: zh ? '安装更新' : _('Install update'),
	confirmBody: zh ? '路由器将下载、校验、测试并安装匹配的 sysupgrade 固件，现有配置会被保留。安装期间网络会中断。' : _('The router will download, verify, test, and install the matching sysupgrade image while preserving configuration. Network access will be interrupted during installation.'),
	statusTitle: zh ? '执行输出' : _('Output')
};

function escapeText(value) {
	return value == null ? '' : String(value);
}

function parseInfo(text) {
	var info = {};

	escapeText(text).trim().split(/\n/).forEach(function(line) {
		var pos = line.indexOf('=');

		if (pos > 0)
			info[line.slice(0, pos)] = line.slice(pos + 1);
	});

	return info;
}

function runOta(args) {
	return fs.exec('/usr/bin/shawnwrt-ota', args).then(function(res) {
		return {
			ok: true,
			stdout: escapeText(res.stdout),
			stderr: escapeText(res.stderr),
			code: res.code
		};
	}).catch(function(err) {
		return {
			ok: false,
			stdout: escapeText(err.stdout),
			stderr: escapeText(err.stderr || err.message),
			code: err.code
		};
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			runOta(['board']),
			runOta(['status'])
		]);
	},

	render: function(data) {
		var board = data[0];
		var status = data[1];
		var info = parseInfo(status.stdout);
		var state = info.STATE || 'unknown';
		var output = E('pre', { 'class': 'shawnwrt-ota-output' }, [
			status.stdout || status.stderr || L.noInfo
		]);

		function fileSize(bytes) {
			var value = Number(bytes);

			if (!value)
				return L.unknown;

			return (value / 1048576).toFixed(1) + ' MB';
		}

		function digestValue(value) {
			return escapeText(value).replace(/^sha256:/, '');
		}

		function row(label, value, mono) {
			return E('div', { 'class': 'shawnwrt-ota-row' }, [
				E('div', { 'class': 'shawnwrt-ota-label' }, [label]),
				E('div', {
					'class': mono ? 'shawnwrt-ota-value shawnwrt-ota-mono' : 'shawnwrt-ota-value'
				}, [value || L.unknown])
			]);
		}

		function stateMeta() {
			if (state === 'current')
				return { cls: 'is-current', title: L.currentTitle, text: L.currentText };

			if (state === 'update')
				return { cls: 'has-update', title: L.updateTitle, text: L.updateText };

			if (state === 'pending')
				return { cls: 'is-pending', title: L.pendingTitle, text: L.pendingText };

			return { cls: 'is-unknown', title: L.unknownTitle, text: L.unknownText };
		}

		function setBusy(button, busy) {
			button.disabled = busy;
			button.classList.toggle('spinning', busy);
		}

		function showResult(result) {
			return showResultWithMessage(result);
		}

		function formatOutput(text) {
			var lines = escapeText(text).trim().split(/\n/);
			var mapped = [];

			lines.forEach(function(line) {
				var value;

				if (!line)
					return;

				if (line === 'TEST=ok') {
					mapped.push(L.testPassedLine);
					return;
				}

				if (line === 'INFO_FORCE_TR3000=1') {
					mapped.push(L.forceTr3000);
					return;
				}

				if (line === 'INSTALL=started') {
					mapped.push(L.installStartedLine);
					return;
				}

				if (line.indexOf('LOG=') === 0) {
					mapped.push(L.installLogLine + ': ' + line.slice(4));
					return;
				}

				if (line.indexOf('SHA256=') === 0) {
					mapped.push(L.shaLine + ': ' + line.slice(7));
					return;
				}

				if (line.indexOf('DOWNLOAD=') === 0) {
					mapped.push(L.downloadLine + ': ' + line.slice(9));
					return;
				}

				if (line.indexOf('STATE=') === 0) {
					value = line.slice(6);
					mapped.push(L.stateLine + ': ' + (value === 'current' ? L.currentTitle : value === 'update' ? L.updateTitle : value === 'pending' ? L.pendingTitle : L.unknownTitle));
					return;
				}

				if (line.indexOf('INSTALLED_TAG=') === 0) {
					mapped.push(L.installedLine + ': ' + (line.slice(14) || L.unknown));
					return;
				}

				if (line.indexOf('PENDING_TAG=') === 0) {
					value = line.slice(12);
					if (value)
						mapped.push(L.pendingLine + ': ' + value);
					return;
				}

				if (line.indexOf('TAG=') === 0) {
					mapped.push(L.latestLine + ': ' + line.slice(4));
					return;
				}

				mapped.push(line);
			});

			return mapped.join('\n');
		}

		function showResultWithMessage(result, successMessage) {
			var text = '';

			if (result.stdout)
				text += result.stdout.trim();

			if (result.stderr)
				text += (text ? '\n\n' : '') + result.stderr.trim();

			output.textContent = formatOutput(text) || successMessage || L.done;

			if (!result.ok)
				ui.addNotification(null, E('p', L.failed), 'danger');
			else if (successMessage)
				ui.addNotification(null, E('p', successMessage), 'success');
		}

		function helpSection(title, items) {
			return E('section', { 'class': 'shawnwrt-ota-help-section' }, [
				E('h4', [title]),
				E('ul', items.map(function(item) {
					return E('li', [item]);
				}))
			]);
		}

		function showHelp() {
			return ui.showModal(L.helpTitle, [
				E('div', { 'class': 'shawnwrt-ota-help-modal' }, [
					E('p', { 'class': 'shawnwrt-ota-help-intro' }, [L.helpIntro]),
					helpSection(L.helpFlowTitle, L.helpFlow),
					helpSection(L.helpButtonsTitle, L.helpButtons),
					helpSection(L.helpNotesTitle, L.helpNotes)
				]),
				E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'btn cbi-button',
						'click': ui.hideModal
					}, [L.close])
				])
			]);
		}

		function action(button, args, successMessage) {
			setBusy(button, true);

			return runOta(args).then(function(result) {
				showResultWithMessage(result, successMessage);
			}).finally(function() {
				setBusy(button, false);
			});
		}

		function refreshStatus(result) {
			showResult(result);
			if (result.ok) {
				var next = parseInfo(result.stdout);
				location.reload();
				return next;
			}
		}

		var checkButton = E('button', {
			'class': 'btn cbi-button cbi-button-action'
		}, [L.check]);

		var testButton = E('button', {
			'class': 'btn cbi-button cbi-button-neutral'
		}, [L.test]);

		var downloadButton = E('button', {
			'class': 'btn cbi-button cbi-button-neutral'
		}, [L.download]);

		var installButton = E('button', {
			'class': 'btn cbi-button cbi-button-negative'
		}, [L.install]);

		var markButton = E('button', {
			'class': 'btn cbi-button cbi-button-neutral'
		}, [L.markInstalled]);

		var helpButton = E('button', {
			'class': 'btn cbi-button shawnwrt-ota-help-button',
			'title': L.help,
			'aria-label': L.help
		}, ['?']);

		helpButton.addEventListener('click', showHelp);

		checkButton.addEventListener('click', function() {
			setBusy(checkButton, true);
			return runOta(['status']).then(refreshStatus).finally(function() {
				setBusy(checkButton, false);
			});
		});

		testButton.addEventListener('click', function() {
			return action(testButton, ['test'], L.testOk);
		});

		downloadButton.addEventListener('click', function() {
			return action(downloadButton, ['download'], L.downloadOk);
		});

		markButton.addEventListener('click', function() {
			setBusy(markButton, true);
			return runOta(['mark-installed']).then(refreshStatus).finally(function() {
				setBusy(markButton, false);
			});
		});

		installButton.addEventListener('click', function() {
			return ui.showModal(L.confirmTitle, [
				E('p', L.confirmBody),
				E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'btn',
						'click': ui.hideModal
					}, [L.cancel]),
					' ',
					E('button', {
						'class': 'btn cbi-button-negative',
						'click': function() {
							ui.hideModal();
							return action(installButton, ['install'], L.installStarted);
						}
					}, [L.install])
				])
			]);
		});

		return E('div', { 'class': 'cbi-map shawnwrt-ota' }, [
			E('style', {}, [`
				.shawnwrt-ota {
					--swrt-map-bg: var(--panel-bg, var(--background-color-high, #fff));
					--swrt-surface: var(--panel-bg, var(--background-color-high, #fff));
					--swrt-surface-muted: var(--secondary, rgba(0,0,0,.035));
					--swrt-border: var(--border, rgba(0,0,0,.10));
					--swrt-border-soft: color-mix(in srgb, var(--swrt-border), transparent 35%);
					--swrt-text: var(--foreground, var(--text-color, #222));
					--swrt-text-muted: var(--muted-foreground, var(--text-color-medium, #666));
					--swrt-current-bg: rgba(46, 160, 67, .12);
					--swrt-current-border: rgba(46, 160, 67, .30);
					--swrt-update-bg: rgba(217, 119, 6, .14);
					--swrt-update-border: rgba(217, 119, 6, .34);
					--swrt-unknown-bg: rgba(59, 130, 246, .12);
					--swrt-unknown-border: rgba(59, 130, 246, .30);
					--swrt-button-bg: rgba(0,0,0,.045);
					color: var(--swrt-text);
				}
				.shawnwrt-ota.cbi-map { background: var(--swrt-map-bg); border-color: var(--swrt-border); color: var(--swrt-text); }
				@media (prefers-color-scheme: dark) {
					.shawnwrt-ota {
						--swrt-map-bg: var(--panel-bg, #1d293d);
						--swrt-surface: rgba(255,255,255,.06);
						--swrt-surface-muted: rgba(255,255,255,.055);
						--swrt-border: rgba(255,255,255,.14);
						--swrt-border-soft: rgba(255,255,255,.11);
						--swrt-text: rgba(255,255,255,.88);
						--swrt-text-muted: rgba(255,255,255,.64);
						--swrt-current-bg: rgba(46, 160, 67, .18);
						--swrt-current-border: rgba(74, 222, 128, .36);
						--swrt-update-bg: rgba(217, 119, 6, .20);
						--swrt-update-border: rgba(251, 191, 36, .40);
						--swrt-unknown-bg: rgba(59, 130, 246, .18);
						--swrt-unknown-border: rgba(147, 197, 253, .38);
						--swrt-button-bg: rgba(255,255,255,.09);
					}
				}
				html[data-theme="dark"] .shawnwrt-ota,
				html[data-darkmode="true"] .shawnwrt-ota,
				body[data-theme="dark"] .shawnwrt-ota,
				body[data-darkmode="true"] .shawnwrt-ota,
				body.dark .shawnwrt-ota,
				.dark .shawnwrt-ota {
					--swrt-map-bg: var(--panel-bg, #1d293d);
					--swrt-surface: rgba(255,255,255,.06);
					--swrt-surface-muted: rgba(255,255,255,.055);
					--swrt-border: rgba(255,255,255,.14);
					--swrt-border-soft: rgba(255,255,255,.11);
					--swrt-text: rgba(255,255,255,.88);
					--swrt-text-muted: rgba(255,255,255,.64);
					--swrt-current-bg: rgba(46, 160, 67, .18);
					--swrt-current-border: rgba(74, 222, 128, .36);
					--swrt-update-bg: rgba(217, 119, 6, .20);
					--swrt-update-border: rgba(251, 191, 36, .40);
					--swrt-unknown-bg: rgba(59, 130, 246, .18);
					--swrt-unknown-border: rgba(147, 197, 253, .38);
					--swrt-button-bg: rgba(255,255,255,.09);
				}
				.shawnwrt-ota-titlebar { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
				.shawnwrt-ota-titlebar h2 { margin-right: auto; }
				.shawnwrt-ota-help-button {
					display: inline-flex;
					align-items: center;
					justify-content: center;
					width: 2rem;
					height: 2rem;
					min-width: 2rem;
					padding: 0;
					border-radius: 999px;
					background: var(--swrt-button-bg);
					color: var(--swrt-text);
					font-weight: 700;
				}
				.shawnwrt-ota-help-button:hover { border-color: var(--swrt-border); filter: brightness(1.05); }
				.shawnwrt-ota-help-modal { max-width: 46rem; color: var(--swrt-text, var(--foreground, var(--text-color, #222))); }
				.shawnwrt-ota-help-intro { margin-top: 0; color: var(--swrt-text-muted, var(--muted-foreground, var(--text-color-medium, #666))); }
				.shawnwrt-ota-help-section { margin-top: 1rem; }
				.shawnwrt-ota-help-section h4 { margin: 0 0 .45rem; color: var(--swrt-text, var(--foreground, var(--text-color, #222))); }
				.shawnwrt-ota-help-section ul { margin: 0; padding-left: 1.25rem; }
				.shawnwrt-ota-help-section li { margin: .28rem 0; line-height: 1.45; color: var(--swrt-text, var(--foreground, var(--text-color, #222))); }
				.shawnwrt-ota .cbi-map-descr { margin-bottom: 1.25rem; max-width: 780px; color: var(--swrt-text-muted); }
				.shawnwrt-ota-panel { border: 1px solid var(--swrt-border); border-radius: 10px; padding: 1rem; background: var(--swrt-surface); }
				.shawnwrt-ota-state { border-radius: 10px; padding: 1rem; margin-bottom: 1rem; border: 1px solid var(--swrt-border-soft); }
				.shawnwrt-ota-state h3 { margin: 0 0 .3rem; font-size: 1.2rem; color: var(--swrt-text); }
				.shawnwrt-ota-state p { margin: 0; color: var(--swrt-text-muted); }
				.shawnwrt-ota-state.is-current { background: var(--swrt-current-bg); border-color: var(--swrt-current-border); }
				.shawnwrt-ota-state.has-update { background: var(--swrt-update-bg); border-color: var(--swrt-update-border); }
				.shawnwrt-ota-state.is-pending { background: var(--swrt-update-bg); border-color: var(--swrt-update-border); }
				.shawnwrt-ota-state.is-unknown { background: var(--swrt-unknown-bg); border-color: var(--swrt-unknown-border); }
				.shawnwrt-ota-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem 1rem; }
				.shawnwrt-ota-row { min-width: 0; border-bottom: 1px solid var(--swrt-border-soft); padding-bottom: .65rem; }
				.shawnwrt-ota-row:nth-last-child(-n+2) { border-bottom: 0; padding-bottom: 0; }
				.shawnwrt-ota-label { color: var(--swrt-text-muted); font-size: .9rem; margin-bottom: .2rem; }
				.shawnwrt-ota-value { min-width: 0; overflow-wrap: anywhere; word-break: break-word; line-height: 1.35; color: var(--swrt-text); }
				.shawnwrt-ota-mono, .shawnwrt-ota-output { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .88rem; }
				.shawnwrt-ota-actions { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0; }
				.shawnwrt-ota-output-wrap { margin-top: .75rem; }
				.shawnwrt-ota-output-title { color: var(--swrt-text-muted); font-weight: 600; margin-bottom: .45rem; }
				.shawnwrt-ota-output { white-space: pre-wrap; max-height: 16rem; overflow: auto; padding: .85rem; border-radius: 8px; border: 1px solid var(--swrt-border-soft); background: var(--swrt-surface-muted); color: var(--swrt-text); }
				@media (max-width: 900px) { .shawnwrt-ota-grid { grid-template-columns: 1fr; } .shawnwrt-ota-row { border-bottom: 1px solid var(--swrt-border-soft) !important; padding-bottom: .65rem !important; } }
			`]),
			E('div', { 'class': 'shawnwrt-ota-titlebar' }, [
				E('h2', L.title),
				helpButton
			]),
			E('div', { 'class': 'cbi-map-descr' }, [L.subtitle]),
			E('div', { 'class': 'shawnwrt-ota-panel' }, [
				E('div', { 'class': 'shawnwrt-ota-state ' + stateMeta().cls }, [
					E('h3', [stateMeta().title]),
					E('p', [stateMeta().text])
				]),
				E('div', { 'class': 'shawnwrt-ota-grid' }, [
					row(L.installedRelease, info.INSTALLED_TAG || L.unknown, false),
					row(L.detectedBoard, board.stdout.trim() || board.stderr.trim(), true),
					row(L.latestRelease, info.TAG, false),
					row(L.firmwareImage, info.ASSET, true),
					row(L.fileSize, fileSize(info.SIZE), false),
					row(L.sha256, digestValue(info.DIGEST), true)
				]),
				E('div', { 'class': 'shawnwrt-ota-actions' }, [
					checkButton
				].concat(state === 'update' ? [
					testButton, downloadButton, installButton
				] : []).concat(state === 'unknown' ? [
					markButton
				] : [])),
				E('div', { 'class': 'shawnwrt-ota-output-wrap' }, [
					E('div', { 'class': 'shawnwrt-ota-output-title' }, [L.statusTitle]),
					output
				])
			]),
		]);
	}
});
