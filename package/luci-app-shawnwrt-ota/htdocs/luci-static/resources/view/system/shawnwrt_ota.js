'use strict';
'require view';
'require fs';
'require ui';

var zh = (document.documentElement.getAttribute('lang') || navigator.language || '').toLowerCase().indexOf('zh') === 0;

var L = {
	title: zh ? '在线升级' : _('Online Upgrade'),
	subtitle: zh ? '管理 ShawnWrt 系统版本并保持更新。' : _('Manage ShawnWrt system versions and keep updated.'),
	checking: zh ? '正在检查更新...' : _('Checking...'),
	upToDate: zh ? '当前已是最新版本' : _('System is up to date'),
	updateAvailable: zh ? '发现新版本' : _('Update Available'),
	versionInfo: zh ? '版本信息' : _('Version Info'),
	installedVersion: zh ? '当前固件版本' : _('Installed Version'),
	latestVersion: zh ? '云端最新版本' : _('Latest Release'),
	boardInfo: zh ? '设备目标' : _('Board'),
	fileSize: zh ? '文件大小' : _('Size'),
	sha256: 'SHA256',
	checkedAt: zh ? '上次检查' : _('Last checked'),
	downloadAndInstall: zh ? '立即下载并安装' : _('Download & Install'),
	checkNow: zh ? '立即检查更新' : _('Check for Updates'),
	installing: zh ? '正在执行更新' : _('Updating'),
	downloading: zh ? '正在下载固件' : _('Downloading'),
	verifying: zh ? '正在验证固件' : _('Verifying'),
	rebooting: zh ? '准备重启' : _('Rebooting'),
	error: zh ? '更新失败' : _('Failed'),
	log: zh ? '执行日志' : _('Execution Log'),
	close: zh ? '关闭' : _('Close'),
	needCheck: zh ? '未获取到云端信息' : _('No Info'),
	rebootWarning: zh ? '更新过程中网络会短暂中断，完成后路由器将自动重启。建议在更新前备份配置。' : _('Network will disconnect briefly. The router will reboot automatically. Backup is recommended.')
};

function runOta(args) {
	return fs.exec('/usr/bin/shawnwrt-ota', args).then(function(res) {
		return { ok: true, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim(), code: res.code };
	}).catch(function(err) {
		return { ok: false, stdout: (err.stdout || '').trim(), stderr: (err.stderr || err.message || '').trim(), code: err.code };
	});
}

function parseInfo(text) {
	var info = {};
	(text || '').split(/\n/).forEach(function(line) {
		var pos = line.indexOf('=');
		if (pos > 0) info[line.slice(0, pos)] = line.slice(pos + 1);
	});
	return info;
}

return view.extend({
	load: function() {
		return Promise.all([
			runOta(['board']),
			runOta(['status']),
			runOta(['job-status'])
		]);
	},

	render: function(data) {
		var self = this;
		var boardId = data[0].stdout || 'unknown';
		var statusInfo = parseInfo(data[1].stdout);
		var jobInfo = parseInfo(data[2].stdout);
		
		var container = E('div', { 'id': 'swrt-ota-root', 'class': 'swrt-ota-wrap' });
		
		var style = E('style', {}, [`
			/* ===== Aurora Theme Native Integration =====
			 * Aurora uses [data-darkmode=true] on <html> and
			 * CSS vars: --page-bg, --foreground, --panel-bg, --border
			 */
			#swrt-ota-root {
				width: 100%;
				margin: 0;
				padding: 1rem 0;
				color: var(--foreground, #1d1d1f);
			}

			.swrt-ota-header h2 {
				font-size: 1.8rem; font-weight: 800; margin: 0;
				color: var(--foreground, #1d1d1f);
				border: none !important;
			}
			.swrt-ota-header p {
				color: var(--foreground, #1d1d1f);
				opacity: 0.5; font-size: 0.9rem; margin-top: 0.3rem;
			}

			.swrt-ota-main-card {
				background: var(--panel-bg, #fff);
				border: 1px solid var(--border, rgba(0,0,0,0.1));
				border-radius: 20px;
				padding: 1.8rem;
				display: flex;
				flex-direction: column;
				gap: 1.8rem;
				margin-top: 1.5rem;
				color: var(--foreground, #1d1d1f);
			}

			.swrt-ota-status-section {
				display: flex;
				align-items: center;
				gap: 1.2rem;
			}

			.swrt-ota-icon-box {
				width: 48px; height: 48px;
				background: rgba(127,127,127,0.1);
				border-radius: 14px;
				display: flex; align-items: center; justify-content: center;
				flex-shrink: 0;
			}
			.swrt-ota-icon-box svg {
				width: 28px; height: 28px;
				fill: var(--foreground, #555);
			}

			.swrt-ota-status-content { flex: 1; }
			.swrt-ota-status-title {
				font-size: 1.25rem; font-weight: 700; margin-bottom: 0.2rem;
				color: var(--foreground, #1d1d1f);
			}
			.swrt-ota-status-desc {
				font-size: 0.9rem; opacity: 0.5;
				font-family: ui-monospace, monospace;
				color: var(--foreground, #1d1d1f);
			}

			.swrt-ota-info-grid {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
				gap: 1.2rem;
				padding: 1.5rem;
				background: rgba(127,127,127,0.04);
				border-radius: 16px;
				border: 1px solid var(--border, rgba(0,0,0,0.05));
			}

			.swrt-ota-info-item { display: flex; flex-direction: column; gap: 0.4rem; }
			.swrt-ota-info-label {
				font-size: 0.75rem; opacity: 0.5;
				text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;
				color: var(--foreground, #1d1d1f);
			}
			.swrt-ota-info-value {
				font-size: 0.95rem; font-weight: 600;
				font-family: ui-monospace, monospace; word-break: break-all;
				color: var(--foreground, #1d1d1f);
			}
			.swrt-ota-info-value.is-latest { color: #34c759 !important; }

			.swrt-ota-actions { display: flex; gap: 1.2rem; align-items: center; margin-top: 1rem; }

			.swrt-ota-btn-primary {
				background: #007aff !important;
				color: #ffffff !important;
				border: none !important;
				padding: 12px 28px;
				border-radius: 12px;
				font-size: 0.95rem;
				font-weight: 700;
				cursor: pointer;
			}
			.swrt-ota-btn-primary:hover { background: #0062cc !important; }
			.swrt-ota-btn-primary:disabled { background: #888 !important; cursor: not-allowed; }

			.swrt-ota-btn-secondary {
				background: rgba(127,127,127,0.1);
				color: var(--foreground, #1d1d1f);
				border: 1px solid var(--border, rgba(0,0,0,0.1));
				padding: 12px 24px;
				border-radius: 12px;
				font-size: 0.95rem;
				font-weight: 600;
				cursor: pointer;
			}

			.swrt-ota-progress-container { width: 100%; max-width: 500px; display: none; margin-top: 1rem; }
			.swrt-ota-progress-label {
				display: flex; justify-content: space-between;
				font-size: 0.85rem; color: var(--foreground, #888);
				opacity: 0.6; margin-bottom: 0.5rem;
			}
			.swrt-ota-progress-track { height: 6px; background: rgba(127,127,127,0.15); border-radius: 10px; overflow: hidden; }
			.swrt-ota-progress-fill { height: 100%; background: #007aff; width: 0%; transition: width 0.3s ease; }
		`]);

		var iconCheck = '<svg viewBox="0 0 24 24"><path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>';
		var iconUpdate = '<svg viewBox="0 0 24 24"><path d="M12,18A6,6 0 0,1 6,12C6,11 6.25,10.03 6.7,9.2L5.24,7.74C4.46,8.97 4,10.43 4,12A8,8 0 0,0 12,20V23L16,19L12,15V18M12,4V1L8,5L12,9V6A6,6 0 0,1 18,12C18,13 17.75,13.97 17.3,14.8L18.76,16.26C19.54,15.03 20,13.57 20,12A8,8 0 0,0 12,4Z"/></svg>';
		var iconWait = '<svg viewBox="0 0 24 24"><path d="M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg>';

		var statusTitle = E('div', { 'class': 'swrt-ota-status-title' }, [L.checking]);
		var statusDesc = E('div', { 'class': 'swrt-ota-status-desc' }, ['---']);
		var iconBox = E('div', { 'class': 'swrt-ota-icon-box' }, [E('div', { 'innerHTML': iconWait })]);

		function infoItem(label, value, isLatest) {
			return E('div', { 'class': 'swrt-ota-info-item' }, [
				E('div', { 'class': 'swrt-ota-info-label' }, [label]),
				E('div', { 'class': 'swrt-ota-info-value' + (isLatest ? ' is-latest' : '') }, [value || '---'])
			]);
		}

		var grid = E('div', { 'class': 'swrt-ota-info-grid' }, [
			infoItem(L.installedVersion, statusInfo.INSTALLED_TAG),
			infoItem(L.latestVersion, statusInfo.CLOUD_TAG),
			infoItem(L.boardInfo, boardId),
			infoItem(L.fileSize, statusInfo.SIZE ? (statusInfo.SIZE / 1048576).toFixed(1) + ' MB' : '---'),
			infoItem(L.sha256, (statusInfo.DIGEST || '').replace('sha256:', '')),
			infoItem(L.checkedAt, statusInfo.CHECKED_AT)
		]);

		var progressContainer = E('div', { 'class': 'swrt-ota-progress-container' }, [
			E('div', { 'class': 'swrt-ota-progress-label' }, [
				E('span', { 'id': 'swrt-ota-prog-task' }, [L.downloading]),
				E('span', { 'id': 'swrt-ota-prog-pct' }, ['0%'])
			]),
			E('div', { 'class': 'swrt-ota-progress-track' }, [
				E('div', { 'class': 'swrt-ota-progress-fill' })
			])
		]);

		var actionBtn = E('button', { 'class': 'swrt-ota-btn-primary', 'disabled': 'true' }, [L.checking]);
		var logBtn = E('button', { 'class': 'swrt-ota-btn-secondary', 'click': showLog }, [L.log]);

		var mainCard = E('div', { 'class': 'swrt-ota-main-card' }, [
			E('div', { 'class': 'swrt-ota-status-section' }, [
				iconBox,
				E('div', { 'class': 'swrt-ota-status-content' }, [
					statusTitle,
					statusDesc
				])
			]),
			grid,
			E('div', { 'class': 'swrt-ota-actions-row' }, [
				E('div', { 'class': 'swrt-ota-actions' }, [
					actionBtn,
					logBtn
				]),
				progressContainer
			])
		]);

		container.append(style,
			E('div', { 'class': 'swrt-ota-header' }, [
				E('h2', [L.title]),
				E('p', [L.subtitle])
			]),
			mainCard
		);

		function updateUI(info) {
			var state = info.STATE;
			grid.children[0].lastChild.textContent = info.INSTALLED_TAG || '---';
			grid.children[1].lastChild.textContent = info.CLOUD_TAG || '---';
			grid.children[3].lastChild.textContent = info.SIZE ? (info.SIZE / 1048576).toFixed(1) + ' MB' : '---';
			grid.children[4].lastChild.textContent = (info.DIGEST || '').replace('sha256:', '');
			grid.children[5].lastChild.textContent = info.CHECKED_AT || '---';
			
			if (state === 'current') {
				statusTitle.textContent = L.upToDate;
				statusDesc.textContent = info.CLOUD_TAG;
				iconBox.innerHTML = iconCheck;
				actionBtn.textContent = L.checkNow;
				actionBtn.disabled = false;
				actionBtn.onclick = function() { startCheck(); };
			} else if (state === 'update') {
				statusTitle.textContent = L.updateAvailable;
				statusDesc.textContent = info.CLOUD_TAG;
				grid.children[1].lastChild.classList.add('is-latest');
				iconBox.innerHTML = iconUpdate;
				actionBtn.textContent = L.downloadAndInstall;
				actionBtn.disabled = false;
				actionBtn.onclick = function() { confirmInstall(); };
			} else if (state === 'need_check') {
				statusTitle.textContent = L.needCheck;
				statusDesc.textContent = L.checkNow;
				actionBtn.textContent = L.checkNow;
				actionBtn.disabled = false;
				actionBtn.onclick = function() { startCheck(); };
			} else if (state === 'pending') {
				statusTitle.textContent = L.rebooting;
				actionBtn.style.display = 'none';
			}
		}

		function startCheck() {
			if (actionBtn.disabled) return;
			actionBtn.disabled = true;
			actionBtn.textContent = L.checking;
			runOta(['start', 'check']).then(function() {
				pollJob();
			});
		}

		function confirmInstall() {
			ui.showModal(L.downloadAndInstall, [
				E('p', [L.rebootWarning]),
				E('div', { 'class': 'right' }, [
					E('button', { 'class': 'btn', 'click': ui.hideModal }, [L.close]),
					' ',
					E('button', { 'class': 'btn cbi-button-negative', 'click': function() {
						ui.hideModal();
						startInstall();
					}}, [L.downloadAndInstall])
				])
			]);
		}

		function startInstall() {
			if (actionBtn.disabled) return;
			actionBtn.disabled = true;
			actionBtn.style.display = 'none';
			progressContainer.style.display = 'block';
			statusTitle.textContent = L.downloading;
			runOta(['start', 'all']).then(function() {
				pollJob();
			});
		}

		function pollJob() {
			runOta(['job-status']).then(function(res) {
				var job = parseInfo(res.stdout);
				var running = job.JOB_RUNNING === '1';
				var cmd = job.JOB_COMMAND;
				var progress = parseInt(job.JOB_PROGRESS || '0');
				var exitCode = job.JOB_EXIT;

				if (running) {
					if (cmd === 'all' || cmd === 'download') {
						if (progress > 0 && progress < 100) {
							statusTitle.textContent = L.downloading + ' (' + progress + '%)';
							document.getElementById('swrt-ota-prog-task').textContent = L.downloading;
						} else if (progress === 100) {
							statusTitle.textContent = L.verifying;
							document.getElementById('swrt-ota-prog-task').textContent = L.verifying;
						}
						progressContainer.querySelector('.swrt-ota-progress-fill').style.width = progress + '%';
						document.getElementById('swrt-ota-prog-pct').textContent = progress + '%';
					} else if (cmd === 'check') {
						statusTitle.textContent = L.checking;
					}
					
					if (res.stdout.indexOf('ACTION=test_ok') !== -1) {
						statusTitle.textContent = L.rebooting;
					}

					setTimeout(pollJob, 1500);
				} else {
					if (exitCode === '0') {
						runOta(['status']).then(function(s) {
							var info = parseInfo(s.stdout);
							updateUI(info);
							progressContainer.style.display = 'none';
							actionBtn.style.display = 'block';
						});
					} else if (exitCode !== '') {
						statusTitle.textContent = L.error;
						statusTitle.style.color = '#ff3b30';
						actionBtn.disabled = false;
						actionBtn.textContent = L.checkNow;
						actionBtn.style.display = 'block';
						progressContainer.style.display = 'none';
						ui.addNotification(null, E('p', [L.error + ' (Code ' + exitCode + ')']), 'danger');
					}
				}
			});
		}

		function showLog() {
			runOta(['job-status']).then(function(res) {
				ui.showModal(L.log, [
					E('pre', { 'style': 'max-height:400px; overflow:auto; font-size:12px; font-family:monospace; background:rgba(0,0,0,0.05); padding:1rem; border-radius:8px;' }, [res.stdout]),
					E('div', { 'class': 'right', 'style': 'margin-top:1rem' }, [
						E('button', { 'class': 'btn', 'click': ui.hideModal }, [L.close])
					])
				]);
			});
		}

		if (jobInfo.JOB_RUNNING === '1') {
			var cmd = jobInfo.JOB_COMMAND;
			if (cmd === 'all' || cmd === 'download' || cmd === 'install' || cmd === 'test') {
				actionBtn.style.display = 'none';
				progressContainer.style.display = 'block';
			}
			pollJob();
		} else if (statusInfo.STATE === 'need_check' || !statusInfo.CLOUD_TAG) {
			startCheck();
		} else {
			updateUI(statusInfo);
		}

		return container;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
