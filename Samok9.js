var CFG = {
    palette: [
        "#00E5FF",
        "#FF3D71",
        "#FFD60A",
        "#7CFF6B",
        "#B388FF",
        "#FF9F1C",
        "#00F5D4",
        "#F15BB5"
    ],
    singleColor: null,
    accentLight: "#FFFFFF",

    showBox: false,
    boxStroke: 2,
    padding: 6,
    showEndMarkers: false,

    showHandles: true,
    handleShape: "square",
    handleSize: 9,
    handleStroke: 0,
    edgeHandles: true,

    showLabel: true,
    showDimensions: true,
    hudSize: 13,
    hudGapY: 12,
    hudIndentX: 0,
    hudSeparator: "  |  ",
    dimensionDecimals: 0,

    showAnchor: true,
    anchorRadius: 8,
    anchorCross: 28,
    anchorStroke: 2,

    showPath: true,
    pathWidth: 2,
    pathDotEvery: 2,
    pathDotSize: 2.5,
    showPathDirection: true,
    pathDirEvery: 8,
    pathDirSize: 7,
    keyMarkerSize: 11,
    trackTransformKeys: true,

    nullSize: 60,
    sampleStep: 1,
    startFrame: null,
    endFrame: null
};

var ROOT_NAME = "Samok9 Overlay";
var TARGETS = [];

function safe(label, fn) {
    try {
        return fn();
    } catch (e) {
        console.error("[Samok9] " + label + " failed: " + e);
        return null;
    }
}

function colorFor(i) {
    if (CFG.singleColor) { return CFG.singleColor; }
    return CFG.palette[i % CFG.palette.length];
}

function findRoot() {
    var all = api.getCompLayers(false);
    for (var i = 0; i < all.length; i++) {
        if (api.getNiceName(all[i]) === ROOT_NAME) { return all[i]; }
    }
    return null;
}

function styleShape(id, fill, stroke, sw) {
    if (fill) {
        api.setFill(id, true);
        api.set(id, { "material.materialColor": fill });
    } else {
        api.setFill(id, false);
    }
    if (stroke && sw > 0) {
        api.setStroke(id, true);
        api.set(id, { "stroke.strokeColor": stroke, "stroke.width": sw });
    } else {
        api.setStroke(id, false);
    }
}

function mkRect(parent, name, w, h, fill, stroke, sw) {
    var id = api.primitive("rectangle", name);
    styleShape(id, fill, stroke, sw);
    api.set(id, { "generator.dimensions": [Math.max(0.5, w), Math.max(0.5, h)] });
    api.parent(id, parent);
    return id;
}

function mkEllipse(parent, name, r, fill, stroke, sw) {
    var id = api.primitive("ellipse", name);
    styleShape(id, fill, stroke, sw);
    api.set(id, { "generator.radius": [Math.max(0.5, r), Math.max(0.5, r)] });
    api.parent(id, parent);
    return id;
}

function mkHandle(parent, name, col) {
    var fillCol = CFG.handleStroke > 0 ? CFG.accentLight : col;
    if (CFG.handleShape === "circle") {
        return mkEllipse(parent, name, CFG.handleSize / 2, fillCol, col, CFG.handleStroke);
    }
    return mkRect(parent, name, CFG.handleSize, CFG.handleSize, fillCol, col, CFG.handleStroke);
}

function allSame(arr, key) {
    for (var i = 1; i < arr.length; i++) {
        if (Math.abs(arr[i][key] - arr[0][key]) > 0.01) { return false; }
    }
    return true;
}

function formatDimVal(val) {
    var factor = Math.pow(10, CFG.dimensionDecimals);
    return String(Math.round(val * factor) / factor);
}

function formatHudText(layerName, w, h) {
    var dimStr = formatDimVal(w) + " x " + formatDimVal(h);
    if (CFG.showLabel && CFG.showDimensions) {
        return layerName + CFG.hudSeparator + dimStr;
    }
    if (CFG.showLabel) { return layerName; }
    if (CFG.showDimensions) { return dimStr; }
    return "";
}

function readBox(id) {
    var b = api.getBoundingBox(id, true);
    var w = b.width, h = b.height, cx = b.centre.x, cy = b.centre.y;
    if (w === 0 && h === 0) {
        var p = api.getPivotPosition(id, true);
        cx = p.x; cy = p.y; w = CFG.nullSize; h = CFG.nullSize;
    }
    return { cx: cx, cy: cy, w: w, h: h };
}

function readPivot(id, fallback) {
    var p = safe("pivot", function () { return api.getPivotPosition(id, true); });
    if (p) { return { x: p.x, y: p.y }; }
    return { x: fallback.cx, y: fallback.cy };
}

function keyframeFrames(id) {
    var found = {};
    var attrs = ["position.x", "position.y"];
    if (CFG.trackTransformKeys) {
        attrs.push("scale.x", "scale.y", "rotation");
    }
    for (var a = 0; a < attrs.length; a++) {
        (function (attrName) {
            var times = safe("keyframe times (" + attrName + ")", function () {
                return api.getKeyframeTimes(id, attrName);
            });
            if (times) {
                for (var t = 0; t < times.length; t++) { found[times[t]] = true; }
            }
        })(attrs[a]);
    }
    var out = [];
    for (var k in found) {
        if (found.hasOwnProperty(k)) { out.push(Number(k)); }
    }
    out.sort(function (x, y) { return x - y; });
    return out;
}

function buildLayer(it, idx, root, frames) {
    var col = colorFor(idx);
    var n = frames.length;
    var grp = api.create("group", "Samok9_" + it.name);
    api.parent(grp, root);

    if (CFG.showPath && n > 1) {
        safe("motion path", function () {
            var moved = false;
            var totalLen = 0;
            for (var i = 1; i < n; i++) {
                var dx = it.piv[i].x - it.piv[i - 1].x;
                var dy = it.piv[i].y - it.piv[i - 1].y;
                totalLen += Math.sqrt(dx * dx + dy * dy);
                if (Math.abs(it.piv[i].x - it.piv[0].x) > 0.5 || Math.abs(it.piv[i].y - it.piv[0].y) > 0.5) {
                    moved = true;
                }
            }
            if (!moved || totalLen < 1) { return; }

            var pathGrp = api.create("group", "PathGroup_" + it.name);
            api.parent(pathGrp, grp);

            var path = new cavalry.Path();
            path.moveTo(it.piv[0].x, it.piv[0].y);
            for (var j = 1; j < n; j++) { path.lineTo(it.piv[j].x, it.piv[j].y); }
            var line = api.createEditable(path, "Path_" + it.name);
            styleShape(line, null, col, CFG.pathWidth);
            api.parent(line, pathGrp);

            var kfs = keyframeFrames(it.id);
            var isKey = {};
            var markers = [];
            for (var k = 0; k < kfs.length; k++) {
                var fi = frames.indexOf(kfs[k]);
                if (fi >= 0 && !isKey[fi]) {
                    markers.push(fi);
                    isKey[fi] = true;
                }
            }
            if (markers.length === 0) {
                markers = [0, n - 1];
                isKey[0] = true;
                isKey[n - 1] = true;
            }

            if (CFG.showPathDirection && CFG.pathDirEvery > 0) {
                for (var dIdx = CFG.pathDirEvery; dIdx < n; dIdx += CFG.pathDirEvery) {
                    var pPrev = it.piv[dIdx - 1];
                    var pCurr = it.piv[dIdx];
                    var vx = pCurr.x - pPrev.x;
                    var vy = pCurr.y - pPrev.y;
                    var len = Math.sqrt(vx * vx + vy * vy);
                    if (len < 2) { continue; }
                    var ux = vx / len;
                    var uy = vy / len;
                    var nx = -uy;
                    var ny = ux;
                    var arm = CFG.pathDirSize;
                    var back = arm * 0.75;
                    var tipX = pCurr.x;
                    var tipY = pCurr.y;
                    var w1x = tipX - ux * back + nx * (arm * 0.65);
                    var w1y = tipY - uy * back + ny * (arm * 0.65);
                    var w2x = tipX - ux * back - nx * (arm * 0.65);
                    var w2y = tipY - uy * back - ny * (arm * 0.65);

                    var dirPath = new cavalry.Path();
