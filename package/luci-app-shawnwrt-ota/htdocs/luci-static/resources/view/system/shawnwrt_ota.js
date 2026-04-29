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
	check: zh ? '检查更新' : _('Check'),
	test: zh ? '测试升级' : _('Test upgrade'),
	download: zh ? '下载固件' : _('Download'),
	install: zh ? '安装更新' : _('Install update'),
	markInstalled: zh ? '标记为已安装' : _('Mark installed'),
	cancel: zh ? '取消' : _('Cancel'),
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

			return { cls: 'is-unknown', title: L.unknownTitle, text: L.unknownText };
		}

		function setBusy(button, busy) {
			button.disabled = busy;
			button.classList.toggle('spinning', busy);
		}

		function showResult(result) {
			var text = '';

			if (result.stdout)
				text += result.stdout.trim();

			if (result.stderr)
				text += (text ? '\n\n' : '') + result.stderr.trim();

			output.textContent = text || L.done;

			if (!result.ok)
				ui.addNotification(null, E('p', L.failed), 'danger');
		}

		function action(button, args) {
			setBusy(button, true);

			return runOta(args).then(showResult).finally(function() {
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

		checkButton.addEventListener('click', function() {
			setBusy(checkButton, true);
			return runOta(['status']).then(refreshStatus).finally(function() {
				setBusy(checkButton, false);
			});
		});

		testButton.addEventListener('click', function() {
			return action(testButton, ['test']);
		});

		downloadButton.addEventListener('click', function() {
			return action(downloadButton, ['download']);
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
							return action(installButton, ['install']);
						}
					}, [L.install])
				])
			]);
		});

		return E('div', { 'class': 'cbi-map shawnwrt-ota' }, [
			E('style', {}, [`
				.shawnwrt-ota {
					--swrt-surface: var(--background-color-high, #fff);
					--swrt-surface-muted: rgba(0,0,0,.035);
					--swrt-border: rgba(0,0,0,.10);
					--swrt-border-soft: rgba(0,0,0,.08);
					--swrt-text: var(--text-color, #222);
					--swrt-text-muted: var(--text-color-medium, #666);
					--swrt-current-bg: rgba(46, 160, 67, .12);
					--swrt-current-border: rgba(46, 160, 67, .30);
					--swrt-update-bg: rgba(217, 119, 6, .14);
					--swrt-update-border: rgba(217, 119, 6, .34);
					--swrt-unknown-bg: rgba(59, 130, 246, .12);
					--swrt-unknown-border: rgba(59, 130, 246, .30);
					color: var(--swrt-text);
				}
				@media (prefers-color-scheme: dark) {
					.shawnwrt-ota {
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
					}
				}
				html[data-theme="dark"] .shawnwrt-ota,
				html[data-darkmode="true"] .shawnwrt-ota,
				body[data-theme="dark"] .shawnwrt-ota,
				body.dark .shawnwrt-ota,
				.dark .shawnwrt-ota {
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
				}
				.shawnwrt-ota .cbi-map-descr { margin-bottom: 1.25rem; max-width: 780px; color: var(--swrt-text-muted); }
				.shawnwrt-ota-panel { border: 1px solid var(--swrt-border); border-radius: 10px; padding: 1rem; background: var(--swrt-surface); }
				.shawnwrt-ota-state { border-radius: 10px; padding: 1rem; margin-bottom: 1rem; border: 1px solid var(--swrt-border-soft); }
				.shawnwrt-ota-state h3 { margin: 0 0 .3rem; font-size: 1.2rem; color: var(--swrt-text); }
				.shawnwrt-ota-state p { margin: 0; color: var(--swrt-text-muted); }
				.shawnwrt-ota-state.is-current { background: var(--swrt-current-bg); border-color: var(--swrt-current-border); }
				.shawnwrt-ota-state.has-update { background: var(--swrt-update-bg); border-color: var(--swrt-update-border); }
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
			E('h2', L.title),
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
