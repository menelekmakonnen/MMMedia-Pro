// main.js - Core frontend logic for the Premiere Pro Panel
var csInterface = new CSInterface();

function updateStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.style.display = 'block';

    statusEl.className = '';
    if (type === 'error') statusEl.classList.add('error');
    if (type === 'success') statusEl.classList.add('success');
}

// 1. Initialize Event Listeners
document.getElementById('importBtn').addEventListener('click', function () {
    updateStatus('Waiting for file selection...', 'info');

    // Call ExtendScript to open native file dialog, which returns the file path
    csInterface.evalScript('$._mmmedia.openFileDialog()', function (filePath) {
        if (!filePath || filePath === "null") {
            updateStatus('Import cancelled.', 'info');
            return;
        }

        updateStatus('Parsing manifest...', 'info');

        // Call ExtendScript again to read and build the sequence
        // We pass the file path, and ExtendScript parses and executes it
        const scriptCall = '$._mmmedia.buildFromManifestFile("' + filePath.replace(/\\/g, '\\\\') + '")';

        csInterface.evalScript(scriptCall, function (response) {
            try {
                const res = JSON.parse(response);
                if (res.success) {
                    updateStatus('Project imported successfully!', 'success');
                } else {
                    updateStatus('Error: ' + res.error, 'error');
                }
            } catch (e) {
                updateStatus('Unknown error occurred.', 'error');
            }
        });
    });
});
