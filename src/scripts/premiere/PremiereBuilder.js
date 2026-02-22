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
    app.enableQE(); // Enable Quality Engineering API for Effects

    // 1. Create Main Sequence -------------------------------------------
    var seqName = manifest.metadata.projectName + "_" + new Date().getTime();
    var sequence = project.createNewSequence(seqName, ""); // Uses default preset, adjusted later

    // 2. Import Assets --------------------------------------------------
    project.rootItem.createBin("Edia Assets");
    // Find or create bin
    var assetBin = findOrCreateBin("Edia_Assets_" + manifest.metadata.timestamp);

    var assetMap = {}; // uid -> projectItem
    var missingAssets = [];

    for (var i = 0; i < manifest.assets.length; i++) {
        var assetDef = manifest.assets[i];
        var file = new File(assetDef.originalPath);

        if (file.exists) {
            project.importFiles([assetDef.originalPath], 1, assetBin, 0);
            var item = findItemInBin(assetBin, file.name);
            if (item) {
                assetMap[assetDef.uid] = item;
            }
        } else {
            missingAssets.push(assetDef.originalPath);
        }
    }

    if (missingAssets.length > 0) {
        alert("Missing " + missingAssets.length + " files. Check console/log.");
    }

    // 3. Populate Timeline ----------------------------------------------
    var videoTrack = sequence.videoTracks[0]; // V1
    // var audioTrack = sequence.audioTracks[0]; // A1

    // Sort clips by time
    manifest.clips.sort(function (a, b) { return a.sequenceStart - b.sequenceStart; });

    for (var i = 0; i < manifest.clips.length; i++) {
        var clipDef = manifest.clips[i];
        var projectItem = assetMap[clipDef.assetUid];

        if (!projectItem) continue;

        // Insert at correct time
        var time = clipDef.sequenceStart;

        videoTrack.insertClip(projectItem, time);

        var trackItem = getTrackItemAtTime(videoTrack, time);

        if (trackItem) {
            // Trim
            var inPoint = clipDef.sourceIn;
            var outPoint = clipDef.sourceOut;
            var duration = outPoint - inPoint;

            trackItem.inPoint = inPoint;
            trackItem.end = trackItem.start.seconds + duration;

            // Transforms (Scale to Fit)
            applyTransforms(trackItem, clipDef);
        }
    }

    alert("Build Complete!");
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
        // Allow small margin of error
        if (Math.abs(item.start.seconds - timeSeconds) < 0.1) {
            return item;
        }
    }
    return null;
}

function applyTransforms(trackItem, clipDef) {
    var components = trackItem.getComponents();
    var motionComp = null;

    // Find Motion component
    for (var i = 0; i < components.numItems; i++) {
        if (components[i].displayName === "Motion") {
            motionComp = components[i];
            break;
        }
    }

    if (!motionComp) return;

    // Scale
    trackItem.setScaleToFrameSize();

    // Explicit scale from manifest if needed
    if (clipDef.transform && clipDef.transform.scale !== 100) {
        var scaleProp = motionComp.properties[1]; // Typically ID 1 is Scale
        if (scaleProp) scaleProp.setValue(clipDef.transform.scale);
    }
}

// Polyfill for JSON if needed in older ExtendScript
if (typeof JSON !== 'object') {
    JSON = {};
    JSON.parse = function (s) { return eval('(' + s + ')'); };
}

main();
