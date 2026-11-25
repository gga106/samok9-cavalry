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
    safe("fill", function () {
        if (fill) {
            api.setFill(id, true);
            api.set(id, { "material.materialColor": fill });
        } else {
            api.setFill(id, false);
        }
    });
    safe("stroke", function () {
        if (stroke && sw > 0) {
            api.setStroke(id, true);
            api.set(id, { "stroke.strokeColor": stroke, "stroke.width": sw });
        } else {
            api.setStroke(id, false);
        }
    });
}

function setRectSize(id, w, h) {
    var safeW = Math.max(0.5, Number(w) || 0.5);
    var safeH = Math.max(0.5, Number(h) || 0.5);
    safe("rect size", function () {
        api.set(id, { "generator.dimensions": [safeW, safeH] });
    });
}

function setEllipseRadius(id, r) {
    var safeR = Math.max(0.5, Number(r) || 0.5);
    safe("ellipse radius", function () {
        api.set(id, { "generator.radius": [safeR, safeR] });
    });
}

function mkRect(parent, name, w, h, fill, stroke, sw) {
    var id = api.primitive("rectangle", name);
    styleShape(id, fill, stroke, sw);
    setRectSize(id, w, h);
    api.parent(id, parent);
    return id;
}

function mkEllipse(parent, name, r, fill, stroke, sw) {
    var id = api.primitive("ellipse", name);
    styleShape(id, fill, stroke, sw);
    setEllipseRadius(id, r);
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
                    safe("path dot pos", function () {
                        api.set(dot, { "position": [it.piv[d].x, it.piv[d].y] });
                    });
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
                safe("key marker pos", function () {
                    api.set(mk, {
                        "position": [it.piv[markers[m]].x, it.piv[markers[m]].y],
                        "rotation": 45
                    });
                });
            }
        });
    }

    var constSize = allSame(it.box, "w") && allSame(it.box, "h");
    var constCenter = allSame(it.box, "cx") && allSame(it.box, "cy");
    var bg = api.create("group", "Bounds_" + it.name);
    api.parent(bg, grp);

    if (constCenter) {
        safe("bounds pos", function () {
            api.set(bg, { "position": [it.box[0].cx, it.box[0].cy] });
        });
    } else {
        for (var a = 0; a < n; a++) {
            (function (idxA) {
                safe("bounds keyframe", function () {
                    api.keyframe(bg, frames[idxA], { "position.x": it.box[idxA].cx, "position.y": it.box[idxA].cy });
                });
            })(a);
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
                    api.set(fo.id, { "position": [res0.x, res0.y] });
                    if (fo.size) {
                        setRectSize(fo.id, res0.w, res0.h);
                    }
                } else {
                    for (var i = 0; i < n; i++) {
                        var b = it.box[i];
                        var res = fo.fn(b.w, b.h);
                        api.keyframe(fo.id, frames[i], { "position.x": res.x, "position.y": res.y });
                        if (fo.size) {
                            api.keyframe(fo.id, frames[i], {
                                "generator.dimensions.x": Math.max(0.5, res.w),
                                "generator.dimensions.y": Math.max(0.5, res.h)
                            });
                        }
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
                    var bi = it.box[i];
                    var pi = calcHudPos(bi.w, bi.h);
                    api.keyframe(hud, frames[i], {
                        "text": formatHudText(it.name, bi.w, bi.h),
                        "position.x": pi[0],
                        "position.y": pi[1]
                    });
                }
            }
        });
    }

    if (CFG.showAnchor) {
        safe("anchor", function () {
            var ag = api.create("group", "Anchor_" + it.name);
            api.parent(ag, grp);
            mkEllipse(ag, "AnchorRing", CFG.anchorRadius, null, col, CFG.anchorStroke);
            mkRect(ag, "AnchorH", CFG.anchorCross, CFG.anchorStroke, col, null, 0);
            mkRect(ag, "AnchorV", CFG.anchorStroke, CFG.anchorCross, col, null, 0);
            var constPiv = allSame(it.piv, "x") && allSame(it.piv, "y");
            if (constPiv) {
                safe("anchor pos", function () {
                    api.set(ag, { "position": [it.piv[0].x, it.piv[0].y] });
                });
            } else {
                for (var i = 0; i < n; i++) {
                    (function (idxP) {
                        safe("anchor keyframe", function () {
                            api.keyframe(ag, frames[idxP], { "position.x": it.piv[idxP].x, "position.y": it.piv[idxP].y });
                        });
                    })(i);
                }
            }
        });
    }
}

function buildSamok9() {
    var sel = api.getSelection();
    if (!sel || sel.length === 0) {
        console.error("[Samok9] Select at least one layer first.");
        return;
    }

    var compLayers = api.getCompLayers(false);
    var orderedSel = [];
    for (var cIdx = 0; cIdx < compLayers.length; cIdx++) {
        if (sel.indexOf(compLayers[cIdx]) >= 0) {
            orderedSel.push(compLayers[cIdx]);
        }
    }
    for (var sIdx = 0; sIdx < sel.length; sIdx++) {
        if (orderedSel.indexOf(sel[sIdx]) < 0) {
            orderedSel.push(sel[sIdx]);
        }
    }
    TARGETS = orderedSel.slice();

    var old = findRoot();
    if (old) { api.deleteLayer(old); }

    var origFrame = api.getFrame();

    var fStart = 1000000, fEnd = -1000000;
    for (var s = 0; s < orderedSel.length; s++) {
        (function (id) {
            var a = safe("in frame", function () { return api.getInFrame(id); });
            var z = safe("out frame", function () { return api.getOutFrame(id); });
            if (a !== null && a < fStart) { fStart = a; }
            if (z !== null && z > fEnd) { fEnd = z; }
        })(orderedSel[s]);
    }
    if (CFG.startFrame !== null) { fStart = CFG.startFrame; }
    if (CFG.endFrame !== null) { fEnd = CFG.endFrame; }
    if (fStart > fEnd) { fStart = 0; fEnd = 100; }
    console.log("[Samok9] Sampling frames " + fStart + " - " + fEnd);

    var frames = [];
    var items = [];
    for (var i = 0; i < orderedSel.length; i++) {
        items.push({ id: orderedSel[i], name: api.getNiceName(orderedSel[i]), box: [], piv: [] });
    }
    for (var f = fStart; f <= fEnd; f += CFG.sampleStep) {
        api.setFrame(f);
        frames.push(f);
        for (var k = 0; k < items.length; k++) {
            var b = safe("read bounds", function () { return readBox(items[k].id); });
            if (!b) {
                b = items[k].box.length
                    ? items[k].box[items[k].box.length - 1]
                    : { cx: 0, cy: 0, w: CFG.nullSize, h: CFG.nullSize };
            }
            items[k].box.push(b);
            items[k].piv.push(readPivot(items[k].id, b));
        }
    }
    api.setFrame(origFrame);

    var root = api.create("group", ROOT_NAME);
    for (var j = 0; j < items.length; j++) {
        (function (it, idx) {
            safe("build " + it.name, function () { buildLayer(it, idx, root, frames); });
        })(items[j], j);
    }
    console.log("[Samok9] Done. " + items.length + " layer(s), " + frames.length + " frames.");
}

function removeSamok9() {
    var root = findRoot();
    if (root) {
        api.deleteLayer(root);
        console.log("[Samok9] Overlay removed.");
    } else {
        console.log("[Samok9] No overlay found.");
    }
}

function getTargets() {
    if (TARGETS.length > 0) { return TARGETS; }
    return api.getSelection();
}

function runPass(label, showOverlay, hideOriginals) {
    var root = findRoot();
    if (!root) {
        console.error("[Samok9] No overlay found. Click Build first.");
        return;
    }
    var tg = getTargets();
    try {
        api.set(root, { "hidden": !showOverlay });
        if (hideOriginals) {
            for (var i = 0; i < tg.length; i++) { api.set(tg[i], { "hidden": true }); }
        }
        var item = api.addRenderQueueItem(api.getActiveComp());
        safe("rename render item", function () { api.rename(item, label); });
        console.log("[Samok9] Rendering: " + label);
        api.render(item);
    } finally {
        for (var j = 0; j < tg.length; j++) {
            (function (layerId) {
                safe("restore target visibility", function () { api.set(layerId, { "hidden": false }); });
            })(tg[j]);
        }
        safe("restore overlay visibility", function () { api.set(root, { "hidden": false }); });
    }
}

function renderOverlay()   { runPass("Samok9_Overlay", true, false); }
function renderClean()     { runPass("Samok9_Clean", false, false); }
function renderWireframe() { runPass("Samok9_Wireframe", true, true); }
function renderAll3() {
    renderOverlay();
    renderClean();
    renderWireframe();
    console.log("[Samok9] All passes rendered.");
}

function addButton(text, fn, label) {
    var b = new ui.Button(text);
    b.onClick = function () { safe(label, fn); };
    ui.add(b);
}

function startUI() {
    ui.setTitle("Samok9");
    addButton("Build Samok9 Overlay (selected layers)", buildSamok9, "build");
    addButton("Remove Overlay", removeSamok9, "remove");
    addButton("Render Overlay", renderOverlay, "render overlay");
    addButton("Render Clean", renderClean, "render clean");
    addButton("Render Wireframe", renderWireframe, "render wireframe");
    addButton("Render All 3", renderAll3, "render all");
    ui.addStretch();
    ui.show();
}

try {
    startUI();
} catch (e) {
    console.error("[Samok9] UI failed (" + e + "). Building overlay directly instead.");
    safe("build", buildSamok9);
}
