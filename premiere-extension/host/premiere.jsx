/**
 * Edia Premiere Pro Builder - ExtendScript (CEP)
 * Comprehensive build pipeline using QE DOM for effects and transforms
 * Namespace: $._edia
 */

if (typeof $._edia === 'undefined') {
    $._edia = {};
}

/**
 * JSON Polyfill for ExtendScript
 */
if (typeof JSON !== 'object') {
    JSON = {};
}
(function () {
    'use strict';
    var rx_one = /^[\],:{}\s]*$/, rx_two = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, rx_three = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, rx_four = /(?:^|:|,)(?:\s*\[)+/g, rx_escapable = /[\\"\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g, rx_dangerous = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    function f(n) { return n < 10 ? '0' + n : n; }
    function this_value() { return this.valueOf(); }
    if (typeof Date.prototype.toJSON !== 'function') {
        Date.prototype.toJSON = function () {
            return isFinite(this.valueOf()) ? this.getUTCFullYear() + '-' + f(this.getUTCMonth() + 1) + '-' + f(this.getUTCDate()) + 'T' + f(this.getUTCHours()) + ':' + f(this.getUTCMinutes()) + ':' + f(this.getUTCSeconds()) + 'Z' : null;
        };
        Boolean.prototype.toJSON = this_value;
        Number.prototype.toJSON = this_value;
        String.prototype.toJSON = this_value;
    }
    var gap, indent, meta, rep;
    function quote(string) {
        rx_escapable.lastIndex = 0;
        return rx_escapable.test(string) ? '"' + string.replace(rx_escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }
    function str(key, holder) {
        var i, k, v, length, mind = gap, partial, value = holder[key];
        if (value && typeof value === 'object' && typeof value.toJSON === 'function') { value = value.toJSON(key); }
        if (typeof rep === 'function') { value = rep.call(holder, key, value); }
        switch (typeof value) {
            case 'string': return quote(value);
            case 'number': return isFinite(value) ? String(value) : 'null';
            case 'boolean':
            case 'null': return String(value);
            case 'object':
                if (!value) { return 'null'; }
                gap += indent; partial = [];
                if (Object.prototype.toString.apply(value) === '[object Array]') {
                    length = value.length;
                    for (i = 0; i < length; i += 1) { partial[i] = str(i, value) || 'null'; }
                    v = partial.length === 0 ? '[]' : gap ? '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']' : '[' + partial.join(',') + ']';
                    gap = mind; return v;
                }
                if (rep && typeof rep === 'object') {
                    length = rep.length;
                    for (i = 0; i < length; i += 1) { if (typeof rep[i] === 'string') { k = rep[i]; v = str(k, value); if (v) { partial.push(quote(k) + (gap ? ': ' : ':') + v); } } }
                } else {
                    for (k in value) { if (Object.prototype.hasOwnProperty.call(value, k)) { v = str(k, value); if (v) { partial.push(quote(k) + (gap ? ': ' : ':') + v); } } }
                }
                v = partial.length === 0 ? '{}' : gap ? '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}' : '{' + partial.join(',') + '}';
                gap = mind; return v;
        }
    }
    if (typeof JSON.stringify !== 'function') {
        meta = { '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r', '"': '\\"', '\\': '\\\\' };
        JSON.stringify = function (value, replacer, space) {
            var i; gap = ''; indent = '';
            if (typeof space === 'number') { for (i = 0; i < space; i += 1) { indent += ' '; } } else if (typeof space === 'string') { indent = space; }
            rep = replacer;
            if (replacer && typeof replacer !== 'function' && (typeof replacer !== 'object' || typeof replacer.length !== 'number')) { throw new Error('JSON.stringify'); }
            return str('', { '': value });
        };
    }
    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text, reviver) {
            var j;
            function walk(holder, key) {
                var k, v, value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) { holder[k] = v; } else { delete holder[k]; }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }
            text = String(text);
            rx_dangerous.lastIndex = 0;
            if (rx_dangerous.test(text)) {
                text = text.replace(rx_dangerous, function (a) {
                    return '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }
            if (rx_one.test(text.replace(rx_two, '@').replace(rx_three, ']').replace(rx_four, ''))) {
                j = eval('(' + text + ')');
                return typeof reviver === 'function' ? walk({ '': j }, '') : j;
            }
            throw new SyntaxError('JSON.parse');
        };
    }
}());

// Date.toISOString Polyfill
if (!Date.prototype.toISOString) {
    (function () {
        function pad(number) {
            if (number < 10) { return '0' + number; }
            return number;
        }
        Date.prototype.toISOString = function () {
            return this.getUTCFullYear() +
                '-' + pad(this.getUTCMonth() + 1) +
                '-' + pad(this.getUTCDate()) +
                'T' + pad(this.getUTCHours()) +
                ':' + pad(this.getUTCMinutes()) +
                ':' + pad(this.getUTCSeconds()) +
                '.' + (this.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5) +
                'Z';
        };
    }());
}

// Object.keys Polyfill
if (!Object.keys) {
    Object.keys = function (obj) {
        var keys = [];
        for (var i in obj) {
            if (obj.hasOwnProperty(i)) {
                keys.push(i);
            }
        }
        return keys;
    };
}

// Enable QE DOM for effects
app.enableQE();

/**
 * Open File Dialog for JSON
 */
$._edia.openFileDialog = function () {
    var filter = "JSON Files:*.json";
    if (Folder.fs === 'Macintosh') {
        filter = function (f) { return (f instanceof Folder) || f.name.match(/\.json$/i); };
    }

    var file = File.openDialog("Select Edia Manifest JSON", filter, false);
    if (file) {
        return file.fsName;
    }
    return null;
};

$._edia.getComponentByMatchName = function (trackItem, matchName) {
    if (!trackItem || !trackItem.components) return null;
    for (var i = 0; i < trackItem.components.numItems; i++) {
        var c = trackItem.components[i];
        if (c && c.matchName === matchName) return c;
    }
    return null;
};

$._edia.getPropByDisplayName = function (component, displayName) {
    if (!component || !component.properties) return null;
    for (var i = 0; i < component.properties.numItems; i++) {
        var p = component.properties[i];
        if (p && p.displayName === displayName) return p;
    }
    return null;
};

/**
 * Entry point: Build from file path
 */
$._edia.buildFromFile = function (filePath) {
    try {
        var file = new File(filePath);
        if (!file.exists) {
            return JSON.stringify({ success: false, log: [], errors: [{ step: 'INIT', error: 'File not found: ' + filePath }] });
        }

        file.open('r');
        file.encoding = 'UTF-8';
        var content = file.read();
        file.close();

        if (!content) {
            return JSON.stringify({ success: false, log: [], errors: [{ step: 'INIT', error: 'File is empty' }] });
        }

        return $._edia.buildFromManifest(content);
    } catch (e) {
        return JSON.stringify({ success: false, log: [], errors: [{ step: 'INIT', error: e.toString() }] });
    }
};

/**
 * Main build function - processes Edia manifest v2.0
 */
$._edia.buildFromManifest = function (manifestJson) {
    var buildLog = [];
    var errors = [];

    function log(message, level) {
        level = level || 'info';
        var timestamp = new Date().toString();
        buildLog.push({ timestamp: timestamp, level: level, message: message });
        $.writeln('[Edia] [' + level + '] ' + message);
    }

    try {
        var manifest = JSON.parse(manifestJson);
        log('=== PREMIERE PRO BUILD STARTED ===', 'info');
        log('Manifest Version: ' + manifest.version, 'info');
        log('Project: ' + manifest.metadata.projectName, 'info');

        // Step 1: Validate Assets
        log('STEP 1: Validating Assets...', 'step');
        var assetMap = {}; // uid -> ProjectItem
        for (var i = 0; i < manifest.assets.length; i++) {
            var asset = manifest.assets[i];
            log('  Asset ' + asset.uid + ': ' + asset.originalFileName + ' (' + asset.type + ')', 'info');

            // Find in project
            var projectItem = $._edia.findFileInProject(asset.originalFileName);
            if (projectItem) {
                assetMap[asset.uid] = projectItem;
            } else {
                log('  Warning: Asset not found in project: ' + asset.originalFileName, 'warn');
                errors.push({ step: 'VALIDATE', asset: asset.uid, error: 'Not found in project' });
            }
        }
        log('✓ Validated ' + manifest.assets.length + ' assets', 'success');

        // Step 2: Create Main Sequence
        log('STEP 2: Creating Main Sequence...', 'step');
        var seqSettings = manifest.sequenceSettings;
        log('  Name: ' + seqSettings.name, 'info');
        log('  FPS: ' + seqSettings.fps, 'info');
        log('  Resolution: ' + seqSettings.frameWidth + 'x' + seqSettings.frameHeight, 'info');

        var sequence = app.project.createNewSequence(seqSettings.name, '');
        app.project.activeSequence = sequence;
        log('✓ Main sequence created', 'success');

        // Step 3: Build Containers (Grids as Nested Sequences)
        log('STEP 3: Building Grid Containers...', 'step');
        var containerMap = {}; // uid -> Nested Sequence ProjectItem
        for (var i = 0; i < manifest.containers.length; i++) {
            var container = manifest.containers[i];
            if (container.type === 'grid') {
                try {
                    var nestedSeq = $._edia.buildGridAsNestedSequence(container, manifest, assetMap, log);
                    if (nestedSeq) {
                        containerMap[container.uid] = nestedSeq;
                        log('✓ Built grid ' + container.uid + ' (' + container.gridDefinition.template + ')', 'success');
                    }
                } catch (e) {
                    log('✗ Failed to build grid ' + container.uid + ': ' + e.toString(), 'error');
                    errors.push({ step: 'GRID_BUILD', container: container.uid, error: e.toString() });
                }
            }
        }
        log('✓ Built ' + Object.keys(containerMap).length + ' containers', 'success');

        // Step 4: Insert Timeline Items
        log('STEP 4: Inserting Timeline Items...', 'step');
        var activeClips = [];
        for (var i = 0; i < manifest.clips.length; i++) {
            var clipInstance = manifest.clips[i];
            if (!clipInstance.isDisabled) {
                activeClips.push(clipInstance);
            }
        }

        for (var i = 0; i < activeClips.length; i++) {
            var clipInstance = activeClips[i];
            try {
                var insertedItem = null;
                if (clipInstance.type === 'grid-container') {
                    var nestedSeq = containerMap[clipInstance.containerUid];
                    if (nestedSeq) {
                        log('  Inserting grid container at ' + clipInstance.sequenceStart + 's', 'info');
                        insertedItem = $._edia.insertClipToTimeline(sequence, nestedSeq, clipInstance, log);
                    }
                } else {
                    var projectItem = assetMap[clipInstance.assetUid];
                    if (projectItem) {
                        log('  Inserting clip at ' + clipInstance.sequenceStart + 's', 'info');
                        insertedItem = $._edia.insertClipToTimeline(sequence, projectItem, clipInstance, log);

                        // Apply the calculated transform (Scale, Position, Rotation)
                        if (insertedItem) {
                            $._edia.applyTransform(insertedItem, clipInstance.transform, log);
                        }

                        // Apply speed
                        if (insertedItem && clipInstance.speed && clipInstance.speed !== 1.0) {
                            $._edia.applySpeed(insertedItem, clipInstance.speed, log);
                        }

                        // Apply special fill modes (like dual-track blur)
                        $._edia.applyFillMode(sequence, clipInstance, manifest.sequenceSettings, log);
                    }
                }

                // Apply Transition if requested
                if (insertedItem && clipInstance.transition) {
                    $._edia.applyTransition(sequence, clipInstance.trackIndex || 0, insertedItem, clipInstance.transition, log);
                }
            } catch (e) {
                log('✗ Failed to insert clip ' + clipInstance.uid + ': ' + e.toString(), 'error');
                errors.push({ step: 'INSERT', clip: clipInstance.uid, error: e.toString() });
            }
        }
        log('✓ Inserted ' + activeClips.length + ' clips', 'success');

        // Final Report
        log('=== BUILD STATISTICS ===', 'info');
        log('  Assets: ' + manifest.assets.length, 'info');
        log('  Containers: ' + manifest.containers.length, 'info');
        log('  Clips: ' + manifest.clips.length, 'info');
        log('  Errors: ' + errors.length, errors.length > 0 ? 'warn' : 'info');

        if (errors.length > 0) {
            log('⚠ Build completed with errors - review log for details', 'warn');
        } else {
            log('✓ Build completed successfully with no errors', 'success');
        }

        log('=== BUILD COMPLETED ===', 'success');

        return JSON.stringify({ success: true, log: buildLog, errors: errors });

    } catch (e) {
        log('CRITICAL ERROR: ' + e.toString(), 'error');
        errors.push({ step: 'BUILD', error: e.toString() });
        return JSON.stringify({ success: false, log: buildLog, errors: errors });
    }
};

/**
 * Build a grid as a nested sequence
 */
$._edia.buildGridAsNestedSequence = function (container, manifest, assetMap, log) {
    var gridDef = container.gridDefinition;
    var nestedSeqName = 'GRID__' + gridDef.template + '__' + container.uid.substr(0, 8);
    log('    Creating nested sequence: ' + nestedSeqName, 'info');

    var nestedSeq = app.project.createNewSequence(nestedSeqName, '');

    // Calculate tile layout pixel geometry
    var frameW = manifest.sequenceSettings.frameWidth;
    var frameH = manifest.sequenceSettings.frameHeight;
    var gutter = gridDef.gutter || 0;
    var layout = $._edia.calculateGridLayout(gridDef.template, gridDef.tiles.length, frameW, frameH, gutter);

    // Track Counter for dual-layer blur (Each tile gets BG and FG track if needed)
    var currentTrack = 0;
    var stats = { expected: gridDef.tiles.length, resolved: 0, inserted: 0 };

    for (var i = 0; i < gridDef.tiles.length; i++) {
        var tile = gridDef.tiles[i];
        var tileRect = layout[i];
        if (!tileRect) continue;

        var projectItem = assetMap[tile.assetUid];
        if (!projectItem) {
            log('      Warning: Tile ' + i + ' missing asset ' + tile.assetUid, 'warn');
            continue;
        }
        stats.resolved++;

        log('      Tile ' + i + ': Positioning at (' + tileRect.x + ', ' + tileRect.y + ') size=' + tileRect.w + 'x' + tileRect.h, 'info');

        // Handle Blur Mode: Two layers (BG + FG)
        if (tile.fillMode === 'blur') {
            // Layer 1: Background Blur
            var bgTrack = $._edia.getOrCreateTrack(nestedSeq, currentTrack++, log);
            projectItem.setInPoint(tile.sourceIn, 4);
            projectItem.setOutPoint(tile.sourceOut, 4);
            bgTrack.overwriteClip(projectItem, 0);
            var bgItem = bgTrack.clips[bgTrack.clips.numItems - 1];
            if (bgItem) {
                $._edia.applyTileTransform(bgItem, tileRect, tile, 'cover', log);
                $._edia.applyBlurEffect(bgItem, 30, log);
            }

            // Layer 2: Foreground Contain
            var fgTrack = $._edia.getOrCreateTrack(nestedSeq, currentTrack++, log);
            projectItem.setInPoint(tile.sourceIn, 4);
            projectItem.setOutPoint(tile.sourceOut, 4);
            fgTrack.overwriteClip(projectItem, 0);
            var fgItem = fgTrack.clips[fgTrack.clips.numItems - 1];
            if (fgItem) {
                $._edia.applyTileTransform(fgItem, tileRect, tile, 'contain', log);
            }
        } else {
            // Standard Mode: Single layer
            var track = $._edia.getOrCreateTrack(nestedSeq, currentTrack++, log);
            projectItem.setInPoint(tile.sourceIn, 4);
            projectItem.setOutPoint(tile.sourceOut, 4);
            track.overwriteClip(projectItem, 0);
            var item = track.clips[track.clips.numItems - 1];
            if (item) {
                $._edia.applyTileTransform(item, tileRect, tile, tile.fillMode, log);
            }
        }
        stats.inserted++;
    }

    log('    Grid Result: ' + stats.inserted + '/' + stats.expected + ' tiles (' + stats.resolved + ' resolved)', stats.inserted === stats.expected ? 'success' : 'warn');

    return $._edia.findFileInProject(nestedSeqName);
};

$._edia.getOrCreateTrack = function (sequence, index, log) {
    // If track doesn't exist, try to create it using QE
    if (index >= sequence.videoTracks.numTracks) {
        log('      Checking tracks... Need index ' + index + ', have ' + sequence.videoTracks.numTracks, 'info');

        // Switch active sequence to the target one for QE to work
        var previousSeq = app.project.activeSequence;
        app.project.activeSequence = sequence;

        var qeSeq = qe.project.getActiveSequence();
        if (qeSeq) {
            var needed = (index + 1) - sequence.videoTracks.numTracks;
            for (var i = 0; i < needed; i++) {
                try {
                    // Try different QE APIs safely
                    if (typeof qeSeq.addVideoTrack === 'function') {
                        qeSeq.addVideoTrack();
                    } else if (typeof qeSeq.addTracks === 'function') {
                        // addTracks(video, audio, submix) 
                        qeSeq.addTracks(1, 0, 0);
                    } else {
                        log('      Warning: No QE API found to add tracks.', 'warn');
                    }
                } catch (e) {
                    log('      Error adding track via QE: ' + e.toString(), 'error');
                }
            }
        }

        // Restore active sequence
        app.project.activeSequence = previousSeq;
    }

    // Return track if exists (or null if creation failed)
    return index < sequence.videoTracks.numTracks ? sequence.videoTracks[index] : null;
};

/**
 * Calculate grid tile layout
 */
$._edia.calculateGridLayout = function (template, tileCount, frameW, frameH, gutter) {
    // Normalize Edia template names to internal layout keys
    if (template === '4-grid') template = '2x2';
    if (template === '9-grid') template = '3x3';
    if (template === '2-row') template = '2row';
    if (template === '2-col') template = '2col';

    var cellW, cellH;
    var result = [];

    if (template === '2row' || template === '2x1') {
        cellW = (frameW - 2 * gutter);
        cellH = (frameH - 3 * gutter) / 2;
        for (var r = 0; r < 2; r++) {
            result.push({
                x: gutter + cellW / 2,
                y: gutter + cellH / 2 + r * (cellH + gutter),
                w: cellW, h: cellH
            });
        }
        return result;
    }

    if (template === '2col' || template === '1x2') {
        cellW = (frameW - 3 * gutter) / 2;
        cellH = (frameH - 2 * gutter);
        for (var c = 0; c < 2; c++) {
            result.push({
                x: gutter + cellW / 2 + c * (cellW + gutter),
                y: gutter + cellH / 2,
                w: cellW, h: cellH
            });
        }
        return result;
    }

    if (template === '2x2') {
        cellW = (frameW - 3 * gutter) / 2;
        cellH = (frameH - 3 * gutter) / 2;
        for (var r = 0; r < 2; r++) {
            for (var c = 0; c < 2; c++) {
                result.push({
                    x: gutter + cellW / 2 + c * (cellW + gutter),
                    y: gutter + cellH / 2 + r * (cellH + gutter),
                    w: cellW, h: cellH
                });
            }
        }
    } else if (template === '3x3') {
        cellW = (frameW - 4 * gutter) / 3;
        cellH = (frameH - 4 * gutter) / 3;
        for (var r = 0; r < 3; r++) {
            for (var c = 0; c < 3; c++) {
                result.push({
                    x: gutter + cellW / 2 + c * (cellW + gutter),
                    y: gutter + cellH / 2 + r * (cellH + gutter),
                    w: cellW, h: cellH
                });
            }
        }
    } else if (template === 'hero') {
        var bigW = (frameW - 3 * gutter) * 0.66;
        var smallW = (frameW - 3 * gutter) * 0.33;
        var smallH = (frameH - 4 * gutter) / 3;

        // Big one
        result.push({ x: gutter + bigW / 2, y: frameH / 2, w: bigW, h: frameH - 2 * gutter });
        // Side ones
        for (var i = 0; i < 3; i++) {
            result.push({
                x: gutter * 2 + bigW + smallW / 2,
                y: gutter + smallH / 2 + i * (smallH + gutter),
                w: smallW, h: smallH
            });
        }
    }

    return result;
};

$._edia.applyTransform = function (trackItem, transform, log) {
    try {
        var motion = $._edia.getComponentByMatchName(trackItem, "ADBE Motion");
        if (!motion) return;

        var posProp = $._edia.getPropByDisplayName(motion, "Position");
        var scaleProp = $._edia.getPropByDisplayName(motion, "Scale");
        var rotProp = $._edia.getPropByDisplayName(motion, "Rotation");

        if (posProp) posProp.setValue([transform.position.x, transform.position.y], 0);
        if (scaleProp) scaleProp.setValue(transform.scale.x, 0);
        if (rotProp && transform.rotation) rotProp.setValue(transform.rotation, 0);

    } catch (e) {
        log('      Warning: Transform failed: ' + e.toString(), 'warn');
    }
};

$._edia.applyTileTransform = function (trackItem, tileRect, tile, overrideFillMode, log) {
    try {
        var motion = $._edia.getComponentByMatchName(trackItem, "ADBE Motion");
        if (!motion) {
            log('      Warning: Motion component not found', 'warn');
            return;
        }

        var posProp = $._edia.getPropByDisplayName(motion, "Position");
        var scaleProp = $._edia.getPropByDisplayName(motion, "Scale");
        var rotProp = $._edia.getPropByDisplayName(motion, "Rotation");

        var fillMode = overrideFillMode || tile.fillMode || 'contain';
        if (fillMode === "fit") fillMode = "contain";

        // Position
        if (posProp) posProp.setValue([tileRect.x, tileRect.y], 0);

        // Scale Math
        var srcW = tile.assetDimensions ? tile.assetDimensions.width : 1920;
        var srcH = tile.assetDimensions ? tile.assetDimensions.height : 1080;

        var scaleX = tileRect.w / srcW;
        var scaleY = tileRect.h / srcH;
        var s;

        if (fillMode === 'cover') {
            s = Math.max(scaleX, scaleY);
        } else {
            s = Math.min(scaleX, scaleY);
        }

        if (scaleProp) scaleProp.setValue(s * 100, 0);

        if (rotProp && tile.rotation) {
            rotProp.setValue(tile.rotation, 0);
        }

        // Apply Speed if present
        if (tile.speed && tile.speed !== 1.0) {
            $._edia.applySpeed(trackItem, tile.speed, log);
        }
    } catch (e) {
        log('      Warning: Transform failed: ' + e.toString(), 'warn');
    }
};

$._edia.applySpeed = function (trackItem, speed, log) {
    try {
        if (!trackItem || speed === 1.0) return;

        // Premiere Pro 2020+ API for constant speed
        if (typeof trackItem.setSpeed === 'function') {
            // setSpeed(speedMultiplier, -1 (new duration), keepAudioPitch, rippling)
            trackItem.setSpeed(speed, -1, true, false);
            log('      ✓ Speed applied: ' + speed + 'x', 'success');
        } else {
            log('      Warning: trackItem.setSpeed not supported in this Premiere version', 'warn');
        }
    } catch (e) {
        log('      Warning: Speed failed: ' + e.toString(), 'warn');
    }
};

$._edia.applyBlurEffect = function (trackItem, amount, log) {
    try {
        var blurEffect = trackItem.components.addVideoEffect('AE.ADBE Gaussian Blur 2');
        if (blurEffect) {
            var blurProp = blurEffect.properties.getParamForDisplayName('Blurriness');
            if (blurProp) {
                blurProp.setValue(amount, true);
            }
        }
    } catch (e) {
        log('      Warning: Blur effect failed: ' + e.toString(), 'warn');
    }
};

/**
 * Insert clip to timeline
 */
$._edia.insertClipToTimeline = function (sequence, projectItem, clipInstance, log) {
    var vTrack = sequence.videoTracks[clipInstance.trackIndex || 0];

    // Set in/out points
    if (clipInstance.sourceIn !== undefined && clipInstance.sourceOut !== undefined) {
        projectItem.setInPoint(clipInstance.sourceIn, 4);
        projectItem.setOutPoint(clipInstance.sourceOut, 4);
    }

    // Insert at sequence start time
    vTrack.overwriteClip(projectItem, clipInstance.sequenceStart);
    return vTrack.clips[vTrack.clips.numItems - 1];
};

/**
 * Apply native Premiere transition via QE DOM
 */
$._edia.applyTransition = function (sequence, trackIndex, trackItem, transition, log) {
    try {
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(trackIndex);

        // Locate the QE track item that corresponds to our inserted item
        // trackItem.name and trackItem.start are useful for matching
        var foundQeItem = null;
        for (var i = 0; i < qeTrack.numItems; i++) {
            var qeItem = qeTrack.getItemAt(i);
            // Checking start time (QE time has high precision, so we use a small delta)
            if (Math.abs(qeItem.start.seconds - trackItem.start.seconds) < 0.1) {
                foundQeItem = qeItem;
                break;
            }
        }

        if (foundQeItem) {
            var transMap = {
                'fade': 'Cross Dissolve',
                'dissolve': 'Cross Dissolve',
                'push': 'Push',
                'slide': 'Slide',
                'wipe-left': 'Wipe',
                'wipe-right': 'Wipe',
                'cross-zoom': 'Cross Zoom'
            };

            var transName = transMap[transition.type] || "Cross Dissolve";

            // alignment: 0=center, 1=start, 2=end
            // We usually want center alignment (0) for edit points
            foundQeItem.addTransition(transName, "0", (transition.duration || 1.0).toString());
            log('    ✓ Applied ' + transName + ' transition (' + transition.duration + 's) at boundary', 'success');
        }
    } catch (e) {
        log('    Warning: Transition failed: ' + e.toString(), 'warn');
    }
};

/**
 * Apply fill mode (contain/cover/blur)
 */
$._edia.applyFillMode = function (sequence, clipInstance, seqSettings, log) {
    if (clipInstance.fillMode === 'blur') {
        try {
            log('    Applying blur fill mode (Dual Track)...', 'info');

            var vTrack = sequence.videoTracks[clipInstance.trackIndex || 0];
            var fgItem = vTrack.clips[vTrack.clips.numItems - 1];

            if (fgItem) {
                // Background Track (V + 1)
                var bgTrack = $._edia.getOrCreateTrack(sequence, (clipInstance.trackIndex || 0) + 1, log);

                // Insert same source for background
                bgTrack.overwriteClip(fgItem.projectItem, clipInstance.sequenceStart);
                var bgItem = bgTrack.clips[bgTrack.clips.numItems - 1];

                if (bgItem) {
                    // 1. BG Scale (Cover)
                    var bgMotion = bgItem.components[0];
                    var fgMotion = fgItem.components[0];
                    var sFG = fgMotion.properties[1].getValue();

                    bgMotion.properties[1].setValue(sFG * 1.5, 0); // Background is always larger
                    fgMotion.properties[1].setValue(sFG, 0);

                    // 2. BG Blur
                    $._edia.applyBlurEffect(bgItem, 30, log);
                }
            }
        } catch (e) {
            log('    Warning: Blur mode failed: ' + e.toString(), 'warn');
        }
    }
};

/**
 * Find file in project by name (recursive)
 */
$._edia.findFileInProject = function (fileName) {
    var project = app.project;
    var root = project.rootItem;
    return $._edia.searchForItem(root, fileName);
};

$._edia.searchForItem = function (item, name) {
    if (item.name === name) return item;

    if (item.children && item.children.numItems > 0) {
        for (var i = 0; i < item.children.numItems; i++) {
            var found = $._edia.searchForItem(item.children[i], name);
            if (found) return found;
        }
    }
    return null;
};
