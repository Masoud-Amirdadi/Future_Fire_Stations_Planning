window.addEventListener("load", () => {
    /* =====================================================
       MAP
    ===================================================== */
    let stationsLayer = null;
    let coverageLayer = null;
    let activeRaster = null;
    let coverageChartsActive = false;

    const map = L.map("map", { minZoom: 9, maxZoom: 16, zoomDelta: 0.5 }).setView(
        [43.59, -79.64],
        11
    );
    window.map = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    requestAnimationFrame(() => requestAnimationFrame(() => map.invalidateSize(true)));

    /* =====================================================
       PANES
    ===================================================== */
    map.createPane("rasters"); map.getPane("rasters").style.zIndex = 200;
    map.createPane("coverage"); map.getPane("coverage").style.zIndex = 700;
    map.createPane("stations"); map.getPane("stations").style.zIndex = 900;

    const cacheBuster = "?v=" + Date.now();

    /* =====================================================
       CHART DATA
    ===================================================== */
    const DRIVE_TIME_DATA = {
        COVERAGE: { "21_24": [10.8, 7.14, 5.68], "24_27": [9.67, 6.41, 3.8] },

        "Incidents Heatmap": { "21_24": [13.88, 7.36, 7.02], "24_27": [9.43, 7.59, 4.51] },
        "Incidents Response Time": { "21_24": [17.93, 5.72, 5.12], "24_27": [15.38, 5.38, 3.34] },
        "Population Density": { "21_24": [13.05, 7.29, 8.06], "24_27": [12.72, 8.37, 6.1] },

        CRITIC: { "21_24": [12.82, 7.17, 6.56], "24_27": [11, 7.28, 4.45] },
        RF: { "21_24": [12.3, 7.4, 8.04], "24_27": [8.08, 7.94, 4.75] },
        XGB: { "21_24": [11.78, 7.48, 7.53], "24_27": [8.6, 7.69, 4.41] }
    };

    const HIGH_VERYHIGH_DATA = {
        CRITIC: {
            "21_24": { High: [12.66, 8.81, 6.7], VeryHigh: [20.74, 6.72, 9.13] },
            "24_27": { High: [13.53, 8.85, 5.07], VeryHigh: [13.62, 8.33, 6.46] }
        },
        RF: {
            "21_24": { High: [13.44, 8.76, 5.4], VeryHigh: [14.26, 7.2, 10.61] },
            "24_27": { High: [9.0, 6.6, 5.34], VeryHigh: [5.5, 9.61, 4.96] }
        },
        XGB: {
            "21_24": { High: [14.98, 8.2, 6.84], VeryHigh: [13.11, 8.48, 10.66] },
            "24_27": { High: [9.21, 7.5, 4.91], VeryHigh: [5.21, 9.11, 4.5] }
        }
    };

    /* =====================================================
       CHARTS (single responsibility helpers)
    ===================================================== */
    let driveChartCoverage = null;
    let driveChartRaster = null; // drive-time chart linked to active raster
    let chart2124 = null;
    let chart2427 = null;
    let chartsVisible = true;

    const el = (id) => document.getElementById(id);
    const setShow = (id, show) => { const n = el(id); if (n) n.style.display = show ? "block" : "none"; };

    function destroyChart(refSetter, chart) {
        if (chart) chart.destroy();
        refSetter(null);
    }

    function makeDriveTimeChart(canvasId, title, d21, d27) {
        const canvas = el(canvasId);
        if (!canvas) return null;

        return new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels: ["0–4", "4–6", "6+"],
                datasets: [
                    { label: "21–24 Stations", data: d21, backgroundColor: "#6ec1ff" },
                    { label: "24–27 Stations", data: d27, backgroundColor: "#2ecc71" }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { title: { display: true, text: title }, legend: { position: "bottom" } },
                scales: {
                    x: { title: { display: true, text: "Minutes" } },
                    y: { beginAtZero: true, title: { display: true, text: "Coverage (%)" } }
                }
            }
        });
    }

    function makeHighChart(canvasId, title, high, veryHigh, palette) {
        const canvas = el(canvasId);
        if (!canvas) return null;

        return new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels: ["0–4", "4–6", "6+"],
                datasets: [
                    { label: "High", data: high, backgroundColor: palette.light },
                    { label: "Very High", data: veryHigh, backgroundColor: palette.dark }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { title: { display: true, text: title }, legend: { position: "bottom" } },
                scales: {
                    x: { title: { display: true, text: "Minutes" } },
                    y: { beginAtZero: true, title: { display: true, text: "Coverage (%)" } }
                }
            }
        });
    }

    function rasterDriveKey(active) {
        if (active === "CRITIC Composite") return "CRITIC";
        if (active === "Random Forest Composite") return "RF";
        if (active === "XGBoost Composite") return "XGB";
        if (active === "Incidents Heatmap") return "Incidents Heatmap";
        if (active === "Incidents Response Time") return "Incidents Response Time";
        if (active === "Population Density") return "Population Density";
        return null;
    }

    const rasterTitle = (k) =>
        k === "CRITIC" ? "CRITIC" : k === "RF" ? "Random Forest" : k === "XGB" ? "XGBoost" : k;

    function clearRasterChartsOnly() {
        if (driveChartRaster) driveChartRaster.destroy();
        driveChartRaster = null;
        if (chart2124) chart2124.destroy();
        if (chart2427) chart2427.destroy();
        chart2124 = chart2427 = null;

        setShow("chartWrap_drive_composite", false);
        setShow("chartWrap_2124", false);
        setShow("chartWrap_2427", false);

        if (!coverageChartsActive) setShow("chartPanel", false);
    }

    function renderRasterCharts(active) {
        clearRasterChartsOnly();

        const key = rasterDriveKey(active);
        if (!key || !DRIVE_TIME_DATA[key]) return;

        setShow("chartPanel", true);
        setShow("chartWrap_drive_composite", chartsVisible);

        driveChartRaster = makeDriveTimeChart(
            "chart_drive_composite",
            `${rasterTitle(key)} – Drive-Time Coverage (minutes)`,
            DRIVE_TIME_DATA[key]["21_24"],
            DRIVE_TIME_DATA[key]["24_27"]
        );

        const isComposite = key === "CRITIC" || key === "RF" || key === "XGB";
        if (isComposite && HIGH_VERYHIGH_DATA[key]) {
            setShow("chartWrap_2124", chartsVisible);
            setShow("chartWrap_2427", chartsVisible);

            chart2124 = makeHighChart(
                "chart_2124",
                `${rasterTitle(key)} – High vs Very High (21–24)`,
                HIGH_VERYHIGH_DATA[key]["21_24"].High,
                HIGH_VERYHIGH_DATA[key]["21_24"].VeryHigh,
                { light: "#6ec1ff", dark: "#1e90ff" }
            );

            chart2427 = makeHighChart(
                "chart_2427",
                `${rasterTitle(key)} – High vs Very High (24–27)`,
                HIGH_VERYHIGH_DATA[key]["24_27"].High,
                HIGH_VERYHIGH_DATA[key]["24_27"].VeryHigh,
                { light: "#7fe0a3", dark: "#2ecc71" }
            );
        }
    }

    /* =====================================================
       SAFE TILE LAYER + RASTER LAYERS
    ===================================================== */
    const SafeTileLayer = L.TileLayer.extend({
        initialize(root, options) {
            this._root = root;
            L.TileLayer.prototype.initialize.call(this, "{z}/{x}/{y}.png", options || {});
        },
        getTileUrl(coords) {
            return `${this._root}/${coords.z}/${coords.x}/${coords.y}.png${cacheBuster}`;
        }
    });

    const layers = {
        "Incidents Heatmap": new SafeTileLayer("./data/Incidents_Heatmap", { pane: "rasters" }),
        "Population Density": new SafeTileLayer("./data/Pop_Density", { pane: "rasters" }),
        "Fire Hydrants": new SafeTileLayer("./data/Fire_Hydrants", { pane: "rasters" }),
        "Road Mobility": new SafeTileLayer("./data/Road_Mobility", { pane: "rasters" }),
        "Number of Trucks Dispatched to Incidents": new SafeTileLayer("./data/Trucks", { pane: "rasters" }),
        "Incidents Response Time": new SafeTileLayer("./data/Response_Time", { pane: "rasters" }),
        "Land Use Risk": new SafeTileLayer("./data/Land_Use", { pane: "rasters" }),
        "CRITIC Composite": new SafeTileLayer("./data/CRITIC", { pane: "rasters" }),
        "Random Forest Composite": new SafeTileLayer("./data/RF", { pane: "rasters" }),
        "XGBoost Composite": new SafeTileLayer("./data/XGB", { pane: "rasters" })
    };

    /* =====================================================
       MANUAL COMPOSITE (kept as you had; no logic repetition)
    ===================================================== */
    const colorSources = {
        "Incidents Heatmap": layers["Incidents Heatmap"],
        "Incidents Response Time": layers["Incidents Response Time"],
        "Number of Trucks Dispatched to Incidents": layers["Number of Trucks Dispatched to Incidents"],
        "Population Density": layers["Population Density"],
        "Fire Hydrants": layers["Fire Hydrants"],
        "Land Use Risk": layers["Land Use Risk"],
        "Road Mobility": layers["Road Mobility"]
    };

    function turbo(t) {
        t = Math.max(0, Math.min(1, t));

        // Polynomial approximation for Turbo colormap
        const r = 0.13572138 + t * (4.61539260 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))));
        const g = 0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))));
        const b = 0.10667330 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))));

        // Clamp to [0,1] then convert to 0..255
        const R = Math.round(255 * Math.max(0, Math.min(1, r)));
        const G = Math.round(255 * Math.max(0, Math.min(1, g)));
        const B = Math.round(255 * Math.max(0, Math.min(1, b)));

        return [R, G, B];
    }

    const CompositeLayer = L.GridLayer.extend({
        createTile(coords, done) {
            const tile = L.DomUtil.create("canvas", "leaflet-tile");
            const size = this.getTileSize();
            tile.width = size.x;
            tile.height = size.y;

            const ctx = tile.getContext("2d");
            const keys = Object.keys(colorSources);

            Promise.all(
                keys.map(
                    (k) =>
                        new Promise((res) => {
                            const img = new Image();
                            img.crossOrigin = "anonymous";
                            img.onload = () => res({ k, img });
                            img.onerror = () => res({ k, img: null });
                            img.src = colorSources[k].getTileUrl(coords);
                        })
                )
            ).then((parts) => {
                const off = document.createElement("canvas");
                off.width = size.x;
                off.height = size.y;
                const octx = off.getContext("2d");

                const raw = {};
                document.querySelectorAll('#weights input[type="range"]').forEach((r) => {
                    raw[r.dataset.key] = parseFloat(r.value);
                });

                const sum = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
                const weights = {};
                for (const k in raw) weights[k] = raw[k] / sum;

                document.querySelectorAll('#weights input[type="range"]').forEach((r) => {
                    const out = document.querySelector(`span[data-out="${r.dataset.key}"]`);
                    if (out) out.textContent = weights[r.dataset.key].toFixed(2);
                });

                const acc = new Float32Array(size.x * size.y);

                parts.forEach(({ k, img }) => {
                    const w = weights[k] || 0;
                    if (!img || w === 0) return;

                    octx.clearRect(0, 0, size.x, size.y);
                    octx.drawImage(img, 0, 0, size.x, size.y);
                    const d = octx.getImageData(0, 0, size.x, size.y).data;

                    for (let i = 0, p = 0; i < acc.length; i++, p += 4) {
                        if (d[p + 3] === 0) continue;
                        acc[i] += ((0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) / 255) * w;
                    }
                });

                const outImg = ctx.createImageData(size.x, size.y);
                for (let i = 0, p = 0; i < acc.length; i++, p += 4) {
                    let t = acc[i];
                    t = Math.pow(t, 1.6);  
                    t = Math.min(1, Math.max(0, (t - 0.05) / 0.95));
                    const [r, g, b] = turbo(t);
                    outImg.data[p] = r;
                    outImg.data[p + 1] = g;
                    outImg.data[p + 2] = b;
                    outImg.data[p + 3] = t > 0 ? 255 : 0;
                }

                ctx.putImageData(outImg, 0, 0);
                done(null, tile);
            });

            return tile;
        }
    });

    const compositeLayer = new CompositeLayer({ pane: "rasters", opacity: 0.9 });
    document.querySelectorAll('#weights input[type="range"]').forEach((sl) =>
        sl.addEventListener("input", () => map.hasLayer(compositeLayer) && compositeLayer.redraw())
    );

    /* =====================================================
       RASTER CONTROL
    ===================================================== */
    function clearRasters() {
        Object.values(layers).forEach((l) => map.removeLayer(l));
        map.removeLayer(compositeLayer);
        activeRaster = null;
    }

    function applyRasterSelection(name) {
        clearRasters();
        activeRaster = name;

        const hideBox = el("chkHideRasters");
        if (hideBox) hideBox.checked = false;

        if (activeRaster === "__COMPOSITE__") {
            setShow("weights", true);
            compositeLayer.addTo(map);
        } else {
            setShow("weights", false);
            if (layers[activeRaster]) layers[activeRaster].addTo(map);
        }

        renderRasterCharts(activeRaster);
    }

    document.querySelectorAll('input[name="r"]').forEach((radio) => {
        radio.addEventListener("change", (e) => {
            if (e.target.checked) applyRasterSelection(e.target.value);
        });
    });

    const chkHideRasters = el("chkHideRasters");
    if (chkHideRasters) {
        chkHideRasters.addEventListener("change", (e) => {
            if (!e.target.checked) return;

            clearRasters();
            setShow("weights", false);
            document.querySelectorAll('input[name="r"]').forEach((r) => (r.checked = false));
            clearRasterChartsOnly();
        });
    }

    /* =====================================================
       COVERAGE POLYGON + COVERAGE CHART
    ===================================================== */
    function driveTimeColor(dt) {
        if (dt === "0 - 4") return "#ff2f92";
        if (dt === "4 - 6") return "#ff7bbd";
        if (dt === "6+") return "#ffd1e6";
        return "#ccc";
    }

    fetch("./data/Fire_Stations_Service_Coverage.geojson?v=" + Date.now())
        .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status} while loading coverage geojson`);
            return r.text();
        })
        .then((t) => {
            if (!t || t.trim().length === 0) throw new Error("Coverage geojson is empty");
            if (t.trim().startsWith("<")) throw new Error("HTML returned instead of GeoJSON");
            return JSON.parse(t);
        })
        .then((d) => {
            d.features.sort((a, b) => {
                const order = { "6+": 0, "4 - 6": 1, "0 - 4": 2 };
                return (order[a.properties?.Drive_Time] ?? 0) - (order[b.properties?.Drive_Time] ?? 0);
            });

            coverageLayer = L.geoJSON(d, {
                pane: "coverage",
                style: (f) => ({
                    color: "#444",
                    weight: 1.2,
                    fillColor: driveTimeColor(f.properties?.Drive_Time),
                    fillOpacity: 0.45
                })
            });
        })
        .catch((err) => console.error("🔥 Coverage GeoJSON load failed:", err));

    const legend = el("coverage-legend");
    const chkCoverage = el("chkCoverage");

    function enforceStationZOrder() {
        const chkStations = el("chkStations");
        if (!chkStations || !chkStations.checked) return;
        if (stationsLayer && map.hasLayer(stationsLayer)) stationsLayer.bringToFront();
    }

    if (chkCoverage) {
        chkCoverage.addEventListener("change", (e) => {
            const on = e.target.checked;

            if (on) {
                if (coverageLayer) coverageLayer.addTo(map);
                enforceStationZOrder();
                if (legend) legend.style.display = "block";

                coverageChartsActive = true;
                setShow("chartPanel", true);
                setShow("chartWrap_drive_coverage", chartsVisible);

                if (driveChartCoverage) driveChartCoverage.destroy();
                driveChartCoverage = makeDriveTimeChart(
                    "chart_drive_coverage",
                    "Service Coverage Drive-Time",
                    DRIVE_TIME_DATA.COVERAGE["21_24"],
                    DRIVE_TIME_DATA.COVERAGE["24_27"]
                );
            } else {
                if (coverageLayer) map.removeLayer(coverageLayer);
                if (legend) legend.style.display = "none";

                coverageChartsActive = false;
                if (driveChartCoverage) driveChartCoverage.destroy();
                driveChartCoverage = null;
                setShow("chartWrap_drive_coverage", false);

                // hide panel if no raster charts exist
                if (!driveChartRaster && !chart2124 && !chart2427) setShow("chartPanel", false);
            }
        });
    }

    /* =====================================================
       STATIONS (unchanged behavior, slightly de-duplicated)
    ===================================================== */
    const flashingBlue = [];
    const flashingGreen = [];

    function makeStationIcon(color, opacity = 1) {
        return L.icon({
            iconUrl:
                "data:image/svg+xml;utf8," +
                encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
          <path fill="${color}" fill-opacity="${opacity}" stroke="#111" stroke-width="1"
            d="M13.5 0C14 3 12 4 12 6c0 1.5 1 3 3 4
               0-2 2-3 2-6 3 3 5 6 5 10a8 8 0 1 1-16 0
               c0-5 4-7 6-14z"/>
        </svg>`),
            iconSize: [26, 26],
            iconAnchor: [13, 26]
        });
    }

    const defaultStationIcon = makeStationIcon("#ffffff", 1);
    const blueOn = makeStationIcon("#1e90ff", 1);
    const blueOff = makeStationIcon("#1e90ff", 0.25);
    const greenOn = makeStationIcon("#2ecc71", 1);
    const greenOff = makeStationIcon("#2ecc71", 0.25);

    fetch("./data/Fire_Stations.geojson?v=" + Date.now())
        .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status} while loading stations geojson`);
            return r.text();
        })
        .then((t) => {
            if (!t || t.trim().length === 0) throw new Error("Stations geojson is empty");
            if (t.trim().startsWith("<")) throw new Error("HTML returned instead of GeoJSON");
            return JSON.parse(t);
        })
        .then((d) => {
            stationsLayer = L.geoJSON(d, {
                pane: "stations",
                pointToLayer: (f, latlng) => {
                    const id = f.properties?.Station_ID;

                    let icon = defaultStationIcon;
                    if ([123, 124, 125].includes(id)) icon = blueOn;
                    if ([126, 127, 128].includes(id)) icon = greenOn;

                    const m = L.marker(latlng, { icon, pane: "stations" });

                    if ([123, 124, 125].includes(id)) flashingBlue.push(m);
                    if ([126, 127, 128].includes(id)) flashingGreen.push(m);

                    return m;
                }
            });

            const chkStations = el("chkStations");
            if (!chkStations || chkStations.checked) {
                stationsLayer.addTo(map);
                enforceStationZOrder();
            }
        })
        .catch((err) => console.error("🔥 Fire Stations load failed:", err));

    const chkStations = el("chkStations");
    if (chkStations) {
        chkStations.addEventListener("change", (e) => {
            const pane = map.getPane("stations");
            if (e.target.checked) {
                if (stationsLayer && !map.hasLayer(stationsLayer)) stationsLayer.addTo(map);
                if (pane) pane.style.display = "";
                enforceStationZOrder();
            } else {
                if (stationsLayer) map.removeLayer(stationsLayer);
                if (pane) pane.style.display = "none";
            }
        });
    }

    setInterval(() => {
        flashingBlue.forEach((m) => m.setIcon(m.options.icon === blueOn ? blueOff : blueOn));
        flashingGreen.forEach((m) => m.setIcon(m.options.icon === greenOn ? greenOff : greenOn));
    }, 600);

    /* =====================================================
       TOGGLE CHART VISIBILITY (no repeated logic)
    ===================================================== */
    const btnToggle = el("toggleCharts");
    if (btnToggle) {
        btnToggle.addEventListener("click", () => {
            chartsVisible = !chartsVisible;

            setShow("chartWrap_drive_coverage", chartsVisible && coverageChartsActive);
            setShow("chartWrap_drive_composite", chartsVisible && !!driveChartRaster);
            setShow("chartWrap_2124", chartsVisible && !!chart2124);
            setShow("chartWrap_2427", chartsVisible && !!chart2427);

            btnToggle.textContent = chartsVisible ? "📊 Hide Charts" : "📊 Show Charts";
        });
    }
});
