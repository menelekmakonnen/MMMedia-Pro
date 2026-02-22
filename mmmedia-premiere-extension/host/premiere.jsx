// premiere.jsx - ExtendScript backend for MMMedia Pro Integration

if (typeof $ === 'undefined') {
    $ = {};
}

$._mmmedia = {
    // ------------------------------------------------------------------------
    // Utility functions
    // ------------------------------------------------------------------------

    // Open native File Dialog
    openFileDialog: function () {
        var filter = "JSON Files:*.json";
        if (Folder.fs === 'Macintosh') {
            filter = function (f) { return (f instanceof Folder) || f.name.match(/\.json$/i); };
        }
        var file = File.openDialog("Select MMMedia Pro Manifest JSON", filter, false);
        if (file) {
            return file.fsName;
        }
        return "null";
    },

    // Convert seconds to ticks (Premiere Pro uses 254016000000 ticks per second)
    secondsToTicks: function (seconds) {
        return (seconds * 254016000000).toString();
    },

    // Clean up paths for cross-platform
    normalizePath: function (path) {
        if (!path) return "";
        var cleanPath = path;
        // Fix spaces explicitly if needed, but File() constructor usually handles it
        // Ensure forward slashes for internal consistency
        cleanPath = cleanPath.replace(/\\/g, "/");
        if (cleanPath.indexOf("file://") === 0) {
            cleanPath = cleanPath.substring(7);
            // On Windows, handle leading slash 'file:///C:/'
            if (cleanPath.charAt(0) === '/' && cleanPath.charAt(2) === ':') {
                cleanPath = cleanPath.substring(1);
            }
        }
        return cleanPath;
    },

    // Evaluate JSON parsing safely using polyfill if necessary
    // ExtendScript doesn't have native JSON, so we use eval
    parseJSON: function (jsonString) {
        try {
            // Remove potential BOM, line breaks from string
            var cleanString = jsonString.replace(/^\uFEFF/, '');
            var obj;
            eval("obj = " + cleanString);
            return obj;
        } catch (e) {
            throw new Error("JSON Parse Error: " + e.message);
        }
    },

    // ------------------------------------------------------------------------
    // Core Engine Logic
    // ------------------------------------------------------------------------

    buildFromManifestFile: function (filePath) {
        try {
            var file = new File(filePath);
            if (!file.exists) {
                return '{"success":false,"error":"File not found: ' + filePath + '"}';
            }

            file.open('r');
            file.encoding = 'UTF-8';
            var content = file.read();
            file.close();

            if (!content) {
                return '{"success":false,"error":"File is empty"}';
            }

            var manifest = this.parseJSON(content);
            this.buildTimeline(manifest);

            return '{"success":true}';

        } catch (e) {
            return '{"success":false,"error":"' + e.toString().replace(/"/g, "'").replace(/\n/g, " ") + '"}';
        }
    },

    buildTimeline: function (manifest) {
        app.enableQE(); // Enable Quality Engineering DOM (needed for some advanced ops)

        var proj = app.project;
        if (!proj) throw new Error("No active Premiere project found.");

        app.setExtensionCommandString("Building MMMedia Pro Composition", "Undo");

        var settings = manifest.settings;
        var mediaList = manifest.media || [];
        var sequences = manifest.sequences || [];
        var clips = manifest.clips || [];

        // 1. Create a Bin for imported media
        var binName = settings.name ? settings.name + "_Media" : "MMMedia_Assets";
        var rootBin = proj.rootItem;
        var newBin = null;
        for (var i = 0; i < rootBin.children.numItems; i++) {
            if (rootBin.children[i].name === binName && rootBin.children[i].type === ProjectItemType.BIN) {
                newBin = rootBin.children[i];
                break;
            }
        }
        if (!newBin) {
            newBin = rootBin.createBin(binName);
        }

        // 2. Import Media files and cache their ProjectItems
        var mediaMap = {}; // Maps media UUID to Premiere ProjectItem
        var importArray = [];
        for (var i = 0; i < mediaList.length; i++) {
            var m = mediaList[i];
            var normPath = this.normalizePath(m.path);
            var f = new File(normPath);
            if (f.exists) {
                importArray.push(f.fsName);
            } else {
                // Ignore missing file for now, perhaps log it
            }
        }

        if (importArray.length > 0) {
            proj.importFiles(importArray, 1, newBin, false);
            // Re-scan bin to match paths to item nodes
            for (var i = 0; i < newBin.children.numItems; i++) {
                var pItem = newBin.children[i];
                var sysPath = pItem.getMediaPath();
                // Map back to our manifest media object
                for (var j = 0; j < mediaList.length; j++) {
                    var m = mediaList[j];
                    var normListPath = this.normalizePath(m.path);
                    var normSysPath = this.normalizePath(sysPath);
                    if (normSysPath === normListPath) {
                        mediaMap[m.id] = pItem;
                        break;
                    }
                }
            }
        }

        // 3. Create Sequence
        var seqName = settings.name || "MMMedia_Sequence";
        // To precisely match the FPS/Resolution, the easiest API approach in ExtendScript
        // is to create a sequence from a matching clip, or construct empty timeline.
        // For MMMedia, let's just create an empty standard sequence first to guarantee it mounts.
        // We look for a preset or use a boilerplate one, or if we imported media, use the first media item.
        var seq = null;
        for (var i = 0; i < proj.sequences.numSequences; i++) {
            if (proj.sequences[i].name === seqName) {
                seq = proj.sequences[i];
                break;
            }
        }

        if (!seq) {
            // Create empty sequence and set settings (Requires Premiere Pro 2022+ for direct API)
            app.project.createNewSequence(seqName, "");

            // Find it
            for (var i = 0; i < proj.sequences.numSequences; i++) {
                if (proj.sequences[i].name === seqName) {
                    seq = proj.sequences[i];
                    break;
                }
            }

            if (seq) {
                var seqSettings = seq.getSettings();
                seqSettings.videoFrameRate = settings.fps; // Set to whatever manifest says
                // For a 16:9 vertical sequence, we swap dims
                var w = settings.resolution === 'vertical' ? 1080 : 1920;
                var h = settings.resolution === 'vertical' ? 1920 : 1080;
                seqSettings.videoFrameWidth = w;
                seqSettings.videoFrameHeight = h;
                seq.setSettings(seqSettings);
            }
        }

        // 4. Place Clips on Timeline
        if (seq && clips.length > 0) {
            var videoTrack = seq.videoTracks[0];
            var audioTrack = seq.audioTracks[0];

            for (var i = 0; i < clips.length; i++) {
                var c = clips[i];
                var pItem = mediaMap[c.mediaId];
                if (!pItem) continue;

                var fps = settings.fps || 30;

                // MMMedia passes frames, we must inject them as Premiere Ticks
                var inTicks = this.secondsToTicks(c.trimStartFrame / fps);
                var outTicks = this.secondsToTicks(c.trimEndFrame / fps);

                // Track targeting (naive for v1: all to track 0)
                var insertTime = this.secondsToTicks(c.startFrame / fps);

                videoTrack.insertClip(pItem, insertTime);

                // Note: The ExtendScript `insertClip` does not let us set IN/OUT trims at insertion. 
                // We must find the newly inserted track item and modify its in-Point/out-Point.
                // We also must adjust speed.

                var tItem = null;
                for (var j = 0; j < videoTrack.clips.numItems; j++) {
                    var checkClip = videoTrack.clips[j];
                    if (checkClip.start.ticks === insertTime) {
                        tItem = checkClip;
                        break;
                    }
                }

                if (tItem) {
                    tItem.inPoint = inTicks;
                    tItem.outPoint = outTicks;

                    if (c.speed && c.speed !== 1.0) {
                        tItem.speedMultiplier = c.speed;
                    }

                    // Properties (Scale)
                    if (c.zoom) {
                        var comps = tItem.components;
                        for (var k = 0; k < comps.numItems; k++) {
                            var comp = comps[k];
                            if (comp.displayName === "Motion") {
                                var props = comp.properties;
                                for (var p = 0; p < props.numItems; p++) {
                                    var prop = props[p];
                                    if (prop.displayName === "Scale") {
                                        prop.setValue(c.zoom * 100);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};
