'use strict';
'require view';
'require fs';
'require ui';

var zh = (document.documentElement.getAttribute('lang') || navigator.language || '').toLowerCase().indexOf('zh') === 0;

var L = {
	title: zh ? 'ShawnWrt 在线升级' : _('ShawnWrt OTA'),
	subtitle: zh ? '自动匹配当前设备的 sysupgrade 固件，下载后校验 SHA256，并在安装前执行升级测试。' : _('Automatically matches the sysupgrade image for this router, verifies SHA256, and tests it before installation.'),
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
			runOta(['check'])
		]);
	},

	render: function(data) {
		var board = data[0];
		var check = data[1];
		var info = parseInfo(check.stdout);
		var output = E('pre', { 'class': 'shawnwrt-ota-output' }, [
			check.stdout || check.stderr || L.noInfo
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

			output.textContent = text || _('Done.');

			if (!result.ok)
				ui.addNotification(null, E('p', L.failed), 'danger');
		}

		function action(button, args) {
			setBusy(button, true);

			return runOta(args).then(showResult).finally(function() {
				setBusy(button, false);
			});
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

		checkButton.addEventListener('click', function() {
			return action(checkButton, ['check']);
		});

		testButton.addEventListener('click', function() {
			return action(testButton, ['test']);
		});

		downloadButton.addEventListener('click', function() {
			return action(downloadButton, ['download']);
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
				.shawnwrt-ota .cbi-map-descr { margin-bottom: 1.25rem; max-width: 780px; }
				.shawnwrt-ota-panel { border: 1px solid var(--border-color-medium, #ddd); border-radius: 10px; padding: 1rem; background: var(--background-color-high, #fff); }
				.shawnwrt-ota-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem 1rem; }
				.shawnwrt-ota-row { min-width: 0; border-bottom: 1px solid rgba(0,0,0,.08); padding-bottom: .65rem; }
				.shawnwrt-ota-row:nth-last-child(-n+2) { border-bottom: 0; padding-bottom: 0; }
				.shawnwrt-ota-label { color: var(--text-color-medium, #666); font-size: .9rem; margin-bottom: .2rem; }
				.shawnwrt-ota-value { min-width: 0; overflow-wrap: anywhere; word-break: break-word; line-height: 1.35; }
				.shawnwrt-ota-mono, .shawnwrt-ota-output { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .88rem; }
				.shawnwrt-ota-actions { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0; }
				.shawnwrt-ota-output-wrap { margin-top: .75rem; }
				.shawnwrt-ota-output-title { color: var(--text-color-medium, #666); font-weight: 600; margin-bottom: .45rem; }
				.shawnwrt-ota-output { white-space: pre-wrap; max-height: 16rem; overflow: auto; padding: .85rem; border-radius: 8px; border: 1px solid rgba(0,0,0,.08); background: rgba(0,0,0,.035); }
				@media (max-width: 900px) { .shawnwrt-ota-grid { grid-template-columns: 1fr; } .shawnwrt-ota-row { border-bottom: 1px solid rgba(0,0,0,.08) !important; padding-bottom: .65rem !important; } }
			`]),
			E('h2', L.title),
			E('div', { 'class': 'cbi-map-descr' }, [L.subtitle]),
			E('div', { 'class': 'shawnwrt-ota-panel' }, [
				E('div', { 'class': 'shawnwrt-ota-grid' }, [
					row(L.detectedBoard, board.stdout.trim() || board.stderr.trim(), true),
					row(L.latestRelease, info.TAG, false),
					row(L.firmwareImage, info.ASSET, true),
					row(L.fileSize, fileSize(info.SIZE), false),
					row(L.sha256, digestValue(info.DIGEST), true)
				]),
				E('div', { 'class': 'shawnwrt-ota-actions' }, [
					checkButton, testButton, downloadButton, installButton
				]),
				E('div', { 'class': 'shawnwrt-ota-output-wrap' }, [
					E('div', { 'class': 'shawnwrt-ota-output-title' }, [L.statusTitle]),
					output
				])
			]),
		]);
	}
});
