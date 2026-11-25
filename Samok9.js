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
                    dirPath.moveTo(w1x, w1y);
                    dirPath.lineTo(tipX, tipY);
                    dirPath.lineTo(w2x, w2y);
                    var dirLine = api.createEditable(dirPath, "PathDir_" + frames[dIdx]);
                    styleShape(dirLine, null, col, Math.max(1.5, CFG.pathWidth));
                    api.parent(dirLine, pathGrp);
                }
            }

            if (CFG.pathDotEvery > 0) {
                for (var d = 0; d < n; d += CFG.pathDotEvery) {
                    if (isKey[d]) { continue; }
                    var dot = mkEllipse(pathGrp, "PathDot_" + d, CFG.pathDotSize, col, null, 0);
                    api.set(dot, { "position": [it.piv[d].x, it.piv[d].y] });
                }
            }

            for (var m = 0; m < markers.length; m++) {
                var mk = mkRect(
                    pathGrp,
                    "KeyMarker_" + frames[markers[m]],
                    CFG.keyMarkerSize,
                    CFG.keyMarkerSize,
                    col,
                    CFG.accentLight,
                    2
                );
                api.set(mk, {
                    "position": [it.piv[markers[m]].x, it.piv[markers[m]].y],
                    "rotation": 45
                });
            }
        });
    }

    var constSize = allSame(it.box, "w") && allSame(it.box, "h");
    var constCenter = allSame(it.box, "cx") && allSame(it.box, "cy");
    var bg = api.create("group", "Bounds_" + it.name);
    api.parent(bg, grp);

    if (constCenter) {
        api.set(bg, { "position": [it.box[0].cx, it.box[0].cy] });
    } else {
        for (var a = 0; a < n; a++) {
            api.keyframe(bg, frames[a], { "position.x": it.box[a].cx, "position.y": it.box[a].cy });
        }
    }

    var followers = [];
    function addFollower(fo) { followers.push(fo); }

    if (CFG.showBox) {
        safe("box", function () {
            var r = mkRect(bg, "Box", 10, 10, null, col, CFG.boxStroke);
            addFollower({
                id: r,
                size: true,
                fn: function (w, h) {
                    return {
                        x: 0,
                        y: 0,
                        w: w + CFG.padding * 2,
                        h: h + CFG.padding * 2
                    };
                }
            });
        });
    }

    if (CFG.showHandles) {
        safe("handles", function () {
            var pts = [
                [-1, 1], [1, 1], [1, -1], [-1, -1]
            ];
            if (CFG.edgeHandles) { pts.push([0, 1], [1, 0], [0, -1], [-1, 0]); }
            for (var p = 0; p < pts.length; p++) {
                (function (sx, sy, pi) {
                    var hnd = mkHandle(bg, "Handle_" + pi, col);
                    addFollower({
                        id: hnd,
                        size: false,
                        fn: function (w, h) {
                            return {
                                x: sx * (w / 2 + CFG.padding),
                                y: sy * (h / 2 + CFG.padding)
                            };
                        }
                    });
                })(pts[p][0], pts[p][1], p);
            }
        });
    }

    for (var f = 0; f < followers.length; f++) {
        (function (fo) {
            safe("place " + fo.id, function () {
                if (constSize) {
                    var b0 = it.box[0];
                    var res0 = fo.fn(b0.w, b0.h);
                    var setObj = { "position": [res0.x, res0.y] };
                    if (fo.size) {
                        setObj["generator.dimensions"] = [res0.w, res0.h];
                    }
                    api.set(fo.id, setObj);
                } else {
                    for (var i = 0; i < n; i++) {
                        var b = it.box[i];
                        var res = fo.fn(b.w, b.h);
                        var k = { "position.x": res.x, "position.y": res.y };
                        if (fo.size) {
                            k["generator.dimensions.x"] = res.w;
                            k["generator.dimensions.y"] = res.h;
                        }
                        api.keyframe(fo.id, frames[i], k);
                    }
                }
            });
        })(followers[f]);
    }

    if (CFG.showLabel || CFG.showDimensions) {
        safe("hud readout", function () {
            var hud = api.create("textShape", "HUD_" + it.name);
            api.parent(hud, bg);
            safe("hud color", function () { api.set(hud, { "material.materialColor": col }); });
            safe("hud size", function () { api.set(hud, { "fontSize": CFG.hudSize }); });
            safe("hud align", function () { api.set(hud, { "horizontalAlignment": 0 }); });

            function calcHudPos(w, h) {
                var leftX = -(w / 2 + CFG.padding) + CFG.hudIndentX;
                var bottomY = -(h / 2 + CFG.padding + CFG.hudGapY + CFG.hudSize * 0.5);
                return [leftX, bottomY];
            }

            if (constSize) {
                var b0 = it.box[0];
                var p0 = calcHudPos(b0.w, b0.h);
                api.set(hud, {
                    "text": formatHudText(it.name, b0.w, b0.h),
                    "position": p0
                });
            } else {
                for (var i = 0; i < n; i++) {
                    var bi = it
