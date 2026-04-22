/*************************************************************************
 * Edia Pro -> Premiere Pro Builder (v2.0)
 * 
 * Usage:
 * 1. Open this script in Adobe ExtendScript Toolkit (or VS Code with Plugin)
 * 2. Run it targeting Adobe Premiere Pro
 * 3. Select the .json manifest file exported from Edia Pro
 *************************************************************************/

var project = app.project;

function main() {
    var manifestFile = File.openDialog("Select Edia Pro Manifest (.json)");
    if (!manifestFile) return;

    manifestFile.open("r");
    var content = manifestFile.read();
    manifestFile.close();

    try {
        var manifest = JSON.parse(content);
        buildProject(manifest);
    } catch (e) {
        alert("Error parsing manifest: " + e.toString());
    }
}

function buildProject(manifest) {
    if (!manifest.project) {
        alert("Invalid manifest format.");
        return;
    }

    // 1. Create Main Sequence -------------------------------------------
    var seqName = manifest.project.name + "_" + new Date().getTime();
    var sequence = project.createNewSequence(seqName, ""); // Uses default preset

    // 2. Import Assets --------------------------------------------------
    project.rootItem.createBin("Edia Assets");
    var assetBin = findOrCreateBin("Edia_Assets_" + new Date().getTime());

    var assetMap = {}; // path -> projectItem
    var missingAssets = [];
    var filesToImport = [];

    function addFileToImport(filePath) {
        if (!filePath) return;
        var formattedPath = filePath.replace(/\\/g, "/"); // Normalize slashes for ExtendScript
        if (!assetMap[formattedPath]) {
            var file = new File(formattedPath);
            if (file.exists) {
                filesToImport.push(formattedPath);
                assetMap[formattedPath] = "pending";
            } else {
                missingAssets.push(formattedPath);
            }
        }
    }

    // Collect all unique files
    for (var i = 0; i < manifest.clips.length; i++) {
        var clipDef = manifest.clips[i];
        if (clipDef.type !== 'grid') {
            addFileToImport(clipDef.file);
        } else if (clipDef.cells) {
            for (var j = 0; j < clipDef.cells.length; j++) {
                if (clipDef.cells[j].clip) {
                    addFileToImport(clipDef.cells[j].clip.file);
                }
            }
        }
    }

    if (filesToImport.length > 0) {
        project.importFiles(filesToImport, 1, assetBin, 0); // Suppress UI = 1

        // Map imported items
        for (var i = 0; i < filesToImport.length; i++) {
            var f = new File(filesToImport[i]);
            var item = findItemInBin(assetBin, f.name);
            if (item) {
                assetMap[filesToImport[i]] = item;
            }
        }
    }

    if (missingAssets.length > 0) {
        alert("Missing " + missingAssets.length + " files. Check console/log.");
    }

    // 3. Populate Timeline ----------------------------------------------

    // Ensure we have enough video tracks for up to 12 grid cells (just in case, default is usually 3)
    // ExtendScript doesn't officially support adding tracks cleanly, so we'll just try to use existing ones or fail gracefully if we run out.
    // Modern Premiere has 3 video tracks by default.

    // Sort clips by timelineIn
    var clipsToProcess = manifest.clips.slice().sort(function (a, b) { return a.timelineIn - b.timelineIn; });

    for (var i = 0; i < clipsToProcess.length; i++) {
        var clipDef = clipsToProcess[i];
        var fps = manifest.project.fps || 30;

        if (clipDef.type !== 'grid') {
            var projectItem = assetMap[clipDef.file.replace(/\\/g, "/")];
            if (!projectItem) continue;

            // Simple Video/Image insertion
            var trackIndex = clipDef.track || 0;
            if (trackIndex >= sequence.videoTracks.numTracks) trackIndex = 0;
            var videoTrack = sequence.videoTracks[trackIndex];

            var timeSeconds = clipDef.timelineIn / fps;
            videoTrack.insertClip(projectItem, timeSeconds);

            var trackItem = getTrackItemAtTime(videoTrack, timeSeconds);
            if (trackItem) {
                applyClipTiming(trackItem, clipDef, fps);
                applyTransforms(trackItem, 1.0, 0.5, 0.5); // Default full center
            }
        } else {
            // Grid Clip Processing
            var gridTimeSeconds = clipDef.timelineIn / fps;
            var gridDurationSeconds = (clipDef.timelineOut - clipDef.timelineIn) / fps;

            if (clipDef.cells) {
                for (var j = 0; j < clipDef.cells.length; j++) {
                    var cell = clipDef.cells[j];
                    if (!cell.clip) continue;

                    var fileKey = cell.clip.file.replace(/\\/g, "/");
                    var projectItem = assetMap[fileKey];
                    if (!projectItem) continue;

                    // Put each cell on a different track, starting from V2 (index 1) to layer over regular timeline
                    var targetTrackIdx = 1 + j;
                    if (targetTrackIdx < sequence.videoTracks.numTracks) {
                        var cTrack = sequence.videoTracks[targetTrackIdx];
                        cTrack.insertClip(projectItem, gridTimeSeconds);

                        var trackItem = getTrackItemAtTime(cTrack, gridTimeSeconds);
                        if (trackItem) {
                            // Trim the cell clip to match the grid duration
                            var cIn = cell.clip.sourceIn / fps;
                            trackItem.inPoint = cIn;
                            trackItem.end = trackItem.start.seconds + gridDurationSeconds;

                            // Apply Grid Layout Transforms
                            // Center points
                            var centerX = cell.x + (cell.width / 2);
                            var centerY = cell.y + (cell.height / 2);

                            // Scale to fit the smallest dimension of the cell to ensure no black bars
                            var scaleFactor = Math.max(cell.width, cell.height);

                            applyTransforms(trackItem, scaleFactor, centerX, centerY);
                        }
                    }
                }
            }
        }
    }

    alert("MMMedia Premiere Export Complete!");
}

function applyClipTiming(trackItem, clipDef, fps) {
    var inPointSec = clipDef.sourceIn / fps;
    var durationSec = (clipDef.timelineOut - clipDef.timelineIn) / fps;

    trackItem.inPoint = inPointSec;
    trackItem.end = trackItem.start.seconds + durationSec;
}

function findOrCreateBin(name) {
    var found = findItemInProject(name);
    if (found && found.type === 2) return found;
    return project.rootItem.createBin(name);
}

function findItemInProject(name) {
    for (var i = 0; i < project.rootItem.children.numItems; i++) {
        var item = project.rootItem.children[i];
        if (item.name === name) return item;
    }
    return null;
}

function findItemInBin(bin, name) {
    for (var i = 0; i < bin.children.numItems; i++) {
        var item = bin.children[i];
        if (item.name === name) return item;
    }
    return null;
}

function getTrackItemAtTime(track, timeSeconds) {
    for (var i = 0; i < track.clips.numItems; i++) {
        var item = track.clips[i];
        if (Math.abs(item.start.seconds - timeSeconds) < 0.1) {
            return item;
        }
    }
    return null;
}

function applyTransforms(trackItem, scaleMultiplier, posX, posY) {
    trackItem.setScaleToFrameSize(); // Set to sequence frame size first

    var components = trackItem.getComponents();
    var motionComp = null;

    for (var i = 0; i < components.numItems; i++) {
        if (components[i].displayName === "Motion") {
            motionComp = components[i];
            break;
        }
    }

    if (!motionComp) return;

    // Position (Property index 0 is typically Position)
    // ExtendScript represents Position as an array [x, y] where coordinates are 0.0 to 1.0 (0.5 is center)
    var posProp = motionComp.properties[0];
    if (posProp) posProp.setValue([posX, posY], true);

    // Scale (Property index 1 is typically Scale)
    // Scale is 0 to 100 for normal, so scaleMultiplier * 100
    var scaleProp = motionComp.properties[1];
    var baseScale = scaleProp.getValue();
    if (scaleProp) scaleProp.setValue(baseScale * scaleMultiplier, true);
}

// Polyfill for JSON if needed in older ExtendScript
if (typeof JSON !== 'object') {
    JSON = {};
    JSON.parse = function (s) { return eval('(' + s + ')'); };
}

main();
