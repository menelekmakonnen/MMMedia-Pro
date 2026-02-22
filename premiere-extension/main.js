const csInterface = new CSInterface();

document.getElementById('load-btn').addEventListener('click', () => {
    // Open File Dialog via ExtendScript
    csInterface.evalScript('$._edia.openFileDialog()', (path) => {
        if (path && path !== "null" && path !== "undefined" && path !== "EvalScript error.") {
            try {
                // Display status
                document.getElementById('status').innerText = "Building timeline...";
                document.getElementById('build-log').style.display = 'block';
                document.getElementById('build-log').innerHTML = '<div class="log-entry log-info">Loading manifest file...</div>';

                // Escape path for ExtendScript
                var safePath = path.replace(/\\/g, '\\\\');

                // Call buildFromFile function in host script
                var scriptCall = '$._edia.buildFromFile("' + safePath + '")';

                csInterface.evalScript(scriptCall, (resp) => {
                    // Check for general evalScript error
                    if (resp === "EvalScript error.") {
                        document.getElementById('status').innerText = "⚠ Script Execution Error";
                        document.getElementById('status').className = 'status-error';
                        document.getElementById('build-log').innerHTML += '<div class="log-entry log-error">The ExtendScript engine failed. The manifest might be too large or corrupted.</div>';
                        return;
                    }

                    try {
                        const result = JSON.parse(resp);

                        // Display build log
                        let logHtml = '';
                        if (result.log && result.log.length > 0) {
                            for (let i = 0; i < result.log.length; i++) {
                                const entry = result.log[i];
                                const levelClass = 'log-' + entry.level;
                                logHtml += `<div class="log-entry ${levelClass}">${entry.message}</div>`;
                            }
                        } else {
                            logHtml = '<div class="log-entry log-info">Sequence built.</div>';
                        }

                        document.getElementById('build-log').innerHTML = logHtml;

                        // Display status
                        if (result.success) {
                            document.getElementById('status').innerText = "✓ Build completed!";
                            document.getElementById('status').className = 'status-success';
                        } else {
                            document.getElementById('status').innerText = "⚠ Build failed";
                            document.getElementById('status').className = 'status-error';
                        }

                        // Show stats/errors
                        if (result.errors && result.errors.length > 0) {
                            let errorHtml = '<div class="error-summary" style="color: #ef4444; margin-top: 10px; font-size: 11px;"><h4>Errors:</h4><ul>';
                            for (let i = 0; i < Math.min(result.errors.length, 5); i++) {
                                errorHtml += '<li>' + (result.errors[i].step || 'BUILD') + ': ' + result.errors[i].error + '</li>';
                            }
                            errorHtml += '</ul></div>';
                            document.getElementById('build-log').innerHTML += errorHtml;
                        }

                    } catch (e) {
                        console.error("Parse Error. Raw response:", resp);
                        document.getElementById('status').innerText = "Parse Error";
                        document.getElementById('status').className = 'status-error';
                        document.getElementById('build-log').innerHTML += `<div class="log-entry log-error">Failed to parse result: ${e.message}</div>`;
                    }
                });
            } catch (e) {
                document.getElementById('status').innerText = "Error: " + e.message;
                document.getElementById('status').className = 'status-error';
            }
        }
    });
});
