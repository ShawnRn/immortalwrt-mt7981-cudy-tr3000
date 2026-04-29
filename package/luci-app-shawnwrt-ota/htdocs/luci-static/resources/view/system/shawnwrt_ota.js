'use strict';
'require view';
'require fs';
'require ui';

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
		var output = E('pre', {
			'class': 'cbi-section',
			'style': 'white-space: pre-wrap; min-height: 9em; padding: 1em'
		}, [check.stdout || check.stderr || _('No OTA information available.')]);

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
				ui.addNotification(null, E('p', _('Command failed. Check the output below.')), 'danger');
		}

		function action(button, args) {
			setBusy(button, true);

			return runOta(args).then(showResult).finally(function() {
				setBusy(button, false);
			});
		}

		var checkButton = E('button', {
			'class': 'btn cbi-button cbi-button-action'
		}, [_('Check')]);

		var testButton = E('button', {
			'class': 'btn cbi-button cbi-button-neutral'
		}, [_('Test upgrade')]);

		var downloadButton = E('button', {
			'class': 'btn cbi-button cbi-button-neutral'
		}, [_('Download')]);

		var installButton = E('button', {
			'class': 'btn cbi-button cbi-button-negative'
		}, [_('Install update')]);

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
			return ui.showModal(_('Install update'), [
				E('p', _('The router will download, verify, test, and install the matching sysupgrade image while preserving configuration.')),
				E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'btn',
						'click': ui.hideModal
					}, [_('Cancel')]),
					' ',
					E('button', {
						'class': 'btn cbi-button-negative',
						'click': function() {
							ui.hideModal();
							return action(installButton, ['install']);
						}
					}, [_('Install update')])
				])
			]);
		});

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', _('ShawnWrt OTA')),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'table' }, [
					E('div', { 'class': 'tr' }, [
						E('div', { 'class': 'td left', 'width': '33%' }, _('Detected board')),
						E('div', { 'class': 'td left' }, [board.stdout.trim() || board.stderr.trim() || _('Unknown')])
					]),
					E('div', { 'class': 'tr' }, [
						E('div', { 'class': 'td left' }, _('Latest release')),
						E('div', { 'class': 'td left' }, [info.TAG || _('Unknown')])
					]),
					E('div', { 'class': 'tr' }, [
						E('div', { 'class': 'td left' }, _('Firmware image')),
						E('div', { 'class': 'td left' }, [info.ASSET || _('Unknown')])
					]),
					E('div', { 'class': 'tr' }, [
						E('div', { 'class': 'td left' }, _('SHA256')),
						E('div', { 'class': 'td left' }, [info.DIGEST || _('Unknown')])
					])
				])
			]),
			E('div', { 'class': 'cbi-section-actions' }, [
				checkButton, ' ', testButton, ' ', downloadButton, ' ', installButton
			]),
			output
		]);
	}
});
