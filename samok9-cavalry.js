var CFG = {
    // colors (distinct per selected layer; cycled if more layers than colors)
    palette: [
        "#00E5FF", // Cyan
        "#FF3D71", // Crimson Pink
        "#FFD60A", // Amber Yellow
        "#7CFF6B", // Neon Green
        "#B388FF", // Violet
        "#FF9F1C", // Orange
        "#00F5D4", // Mint Teal
        "#F15BB5"  // Magenta
    ],
    singleColor: null,
    accentLight: "#FFFFFF",

    // bounding box & outer line embellishments (off for clean layout)
    showBox: false,
    boxStroke: 2,
    padding: 6,
    showEndMarkers: false,     // corner brackets & outer edge ticks disabled

    // solid handles on box corners & edge midpoints
    showHandles: true,
    handleShape: "square",     // "square" or "circle"
    handleSize: 9,
    handleStroke: 0,           // 0 = solid filled handle without outer stroke
    edgeHandles: true,         // place solid square handles on edge midpoints

    // compact single-line HUD at bottom-left ("LayerName  |  W x H")
    showLabel: true,
    showDimensions: true,
    hudSize: 13,               // compact font size for bottom-left readout
    hudGapY: 12,               // gap below bottom edge of bounds
    hudIndentX: 0,             // horizontal offset from left edge (0 = flush left)
    hudSeparator: "  |  ",     // separator between layer name and W x H
    dimensionDecimals: 0,

    // anchor marker (circle + crosshair)
    showAnchor: true,
    anchorRadius: 8,
    anchorCross: 28,
    anchorStroke: 2,

    // motion path & keyframes
    showPath: true,
    pathWidth: 2,
    pathDotEvery: 2,           // small dot every N frames on the path (0 = off)
    pathDotSize: 2.5,          // dot radius
    showPathDirection: true,   // directional ticks along the motion path
    pathDirEvery: 8,           // place a direction tick every N sampled frames
    pathDirSize: 7,
    keyMarkerSize: 11,         // diamond marker size at keyframes
    trackTransformKeys: true,  // also inspect scale & rotation keyframes

    nullSize: 60,              // box size for layers with no bounds (nulls)
    sampleStep: 1,             // sample every N frames (keep 1 for smooth motion)
    startFrame: null,          // null = auto from layer clips
    endFrame: null
};

var ROOT_NAME = "Samok9 Overlay";
var TARGETS = [];

// ---------- helpers ----------
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

// ---------- per-layer build ----------
function buildLayer(it, idx, root, frames) {
    var col = colorFor(idx);
    var n = frames.length;
    var grp = api.create("group", "Samok9_" + it.name);
    api.parent(grp, root);

    // 1) motion path layer (bottom-most inside Samok9_<layer>)
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

    // 2) bounds group (follows box centre)
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

    // 3) optional bounding box & solid corner / edge-midpoint handles
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

    // 4) single-line compact HUD at bottom-left ("LayerName  |  W x H")
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

    // 5) anchor marker (top-most visual reference for pivot/anchor)
    if (CFG.showAnchor) {
        safe("anchor", function () {
            var ag = api.create("group", "Anchor_" + it.name);
            api.parent(ag, grp);
            mkEllipse(ag, "AnchorRing", CFG.anchorRadius, null, col, CFG.anchorStroke);
            mkRect(ag, "AnchorH", CFG.anchorCross, CFG.anchorStroke, col, null, 0);
            mkRect(ag, "AnchorV", CFG.anchorStroke, CFG.anchorCross, col, null, 0);
            var constPiv = allSame(it.piv, "x") && allSame(it.piv, "y");
            if (constPiv) {
                api.set(ag, { "position": [it.piv[0].x, it.piv[0].y] });
            } else {
                for (var i = 0; i < n; i++) {
                    api.keyframe(ag, frames[i], { "position.x": it.piv[i].x, "position.y": it.piv[i].y });
                }
            }
        });
    }
}

// ---------- build ----------
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

    // 1) sample everything first
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

    // 2) build overlays
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

// ---------- render automation ----------
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

// ---------- UI ----------
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
