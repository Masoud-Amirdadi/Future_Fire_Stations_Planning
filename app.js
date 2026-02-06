window.addEventListener('load', () => {

    /* =====================================================
       MAP
    ===================================================== */
    let stationsLayer = null;
    let coverageLayer = null;
    let activeRaster = null;
    let coverageChartsActive = false;
    const map = L.map('map', {
        minZoom: 9,
        maxZoom: 16,
        zoomDelta: 0.5
    }).setView([43.59, -79.64], 11);

    window.map = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(map);

    requestAnimationFrame(() =>
        requestAnimationFrame(() => map.invalidateSize(true))
    );

    /* =====================================================
   CHART DATA (Drive-Time & Risk Coverage)
===================================================== */

    const DRIVE_TIME_DATA = {
        COVERAGE: {
            "21_24": [10.8, 7.14, 5.68],
            "24_27": [9.67, 6.41, 3.8]
        },
        CRITIC: {
            "21_24": [12.82, 7.17, 6.56],
            "24_27": [11, 7.28, 4.45]
        },
        RF: {
            "21_24": [12.30, 7.4, 8.04],
            "24_27": [8.08, 7.94, 4.75]
        },
        XGB: {
            "21_24": [11.78, 7.48, 7.53],
            "24_27": [8.6, 7.69, 4.41]
        }
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
       PANES
    ===================================================== */
    map.createPane('rasters');
    map.getPane('rasters').style.zIndex = 200;

    map.createPane('coverage');
    map.getPane('coverage').style.zIndex = 700;

    map.createPane('stations');
    map.getPane('stations').style.zIndex = 900;

    const cacheBuster = '?v=' + Date.now();

    /* =====================================================
       STATION ICONS
    ===================================================== */
    const flashingBlue = [];
    const flashingGreen = [];

    function makeStationIcon(color, opacity = 1) {
        return L.icon({
            iconUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
                <path fill="${color}" fill-opacity="${opacity}"
                    stroke="#111" stroke-width="1"
                    d="M13.5 0C14 3 12 4 12 6c0 1.5 1 3 3 4
                       0-2 2-3 2-6 3 3 5 6 5 10a8 8 0 1 1-16 0
                       c0-5 4-7 6-14z"/>
            </svg>
        `),
            iconSize: [26, 26],
            iconAnchor: [13, 26]
        });
    }


    const defaultStationIcon = makeStationIcon('#ffffff', 1);
    const blueOn = makeStationIcon('#1e90ff', 1);
    const blueOff = makeStationIcon('#1e90ff', 0.25);
    const greenOn = makeStationIcon('#2ecc71', 1);
    const greenOff = makeStationIcon('#2ecc71', 0.25);
    function enforceStationZOrder() {
    const chkStations = document.getElementById('chkStations');

    // do nothing if stations are unchecked
    if (!chkStations || !chkStations.checked) return;

    if (stationsLayer && map.hasLayer(stationsLayer)) {
        stationsLayer.bringToFront();
    }
}
  
    /* =====================================================
   CHARTS
===================================================== */

    let driveChartCoverage = null;
    let driveChartComposite = null;
    let chart2124 = null;
    let chart2427 = null;

    function makeDriveTimeChart(canvasId, title, d21, d27) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        return new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['0–4', '4–6', '6+'],
                datasets: [
                    { label: '21–24 Stations', data: d21, backgroundColor: '#6ec1ff' },
                    { label: '24–27 Stations', data: d27, backgroundColor: '#2ecc71' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: title },
                    legend: { position: 'bottom' }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Minutes'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Coverage (%)'
                        }
                    }
                }

            }
        });
    }

    function makeHighChart(canvasId, title, high, veryHigh, palette) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        return new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['0–4', '4–6', '6+'],
                datasets: [
                    { label: 'High', data: high, backgroundColor: palette.light },
                    { label: 'Very High', data: veryHigh, backgroundColor: palette.dark }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: title },
                    legend: { position: 'bottom' }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Minutes'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Coverage (%)'
                        }
                    }
                }

            }
        });
    }
    const DISPLAY_NAME = {
        Fire_Stations: "Fire Stations",
        Fire_Stations_Service_Coverage: "Fire Stations Service Coverage"
    };

    function uiName(key) {
        return DISPLAY_NAME[key] || key.replace(/_/g, " ");
    }

    function clearCharts() {

        // coverage drive-time
        driveChartCoverage?.destroy();
        driveChartCoverage = null;
        document.getElementById('chartWrap_drive_coverage').style.display = 'none';

        // composite drive-time
        driveChartComposite?.destroy();
        driveChartComposite = null;
        document.getElementById('chartWrap_drive_composite').style.display = 'none';

        // composite risk charts
        chart2124?.destroy();
        chart2427?.destroy();
        chart2124 = chart2427 = null;

        document.getElementById('chartWrap_2124').style.display = 'none';
        document.getElementById('chartWrap_2427').style.display = 'none';
    }
    function showCharts(type, titlePrefix) {
        document.getElementById('chartPanel').style.display = 'block';

        driveChart = makeDriveTimeChart(
            'chart_drive',
            `${titlePrefix} – Drive-Time Coverage (minutes)`,
            DRIVE_TIME_DATA[type]["21_24"],
            DRIVE_TIME_DATA[type]["24_27"]
        );

        if (HIGH_VERYHIGH_DATA[type]) {
            document.getElementById('chartWrap_2124').style.display = 'block';
            document.getElementById('chartWrap_2427').style.display = 'block';

            chart2124 = makeHighChart(
                'chart_2124',
                `${titlePrefix} – High vs Very High (21–24)`,
                HIGH_VERYHIGH_DATA[type]["21_24"].High,
                HIGH_VERYHIGH_DATA[type]["21_24"].VeryHigh,
                { light: '#6ec1ff', dark: '#1e90ff' }
            );

            chart2427 = makeHighChart(
                'chart_2427',
                `${titlePrefix} – High vs Very High (24–27)`,
                HIGH_VERYHIGH_DATA[type]["24_27"].High,
                HIGH_VERYHIGH_DATA[type]["24_27"].VeryHigh,
                { light: '#7fe0a3', dark: '#2ecc71' }
            );
        }
    }


    /* =====================================================
       SAFE TILE LAYER
    ===================================================== */
    const SafeTileLayer = L.TileLayer.extend({
        initialize(root, options) {
            this._root = root;
            L.TileLayer.prototype.initialize.call(this, '{z}/{x}/{y}.png', options || {});
        },
        getTileUrl(coords) {
            return `${this._root}/${coords.z}/${coords.x}/${coords.y}.png${cacheBuster}`;

        }
    });

    /* =====================================================
       RASTER LAYERS
    ===================================================== */
    const layers = {
        "Incidents Heatmap": new SafeTileLayer('./data/Incidents_Heatmap', { pane: 'rasters' }),
        "Population Density": new SafeTileLayer('./data/Pop_Density', { pane: 'rasters' }),
        "Fire Hydrants": new SafeTileLayer('./data/Fire_Hydrants', { pane: 'rasters' }),
        "Road Mobility": new SafeTileLayer('./data/Road_Mobility', { pane: 'rasters' }),
        "Number of Trucks Dispatched to Incidents": new SafeTileLayer('./data/Trucks', { pane: 'rasters' }),
        "Incidents Response Time": new SafeTileLayer('./data/Response_Time', { pane: 'rasters' }),
        "Land Use Risk": new SafeTileLayer('./data/Land_Use', { pane: 'rasters' }),
        "CRITIC Composite": new SafeTileLayer('./data/CRITIC', { pane: 'rasters' }),
        "Random Forest Composite": new SafeTileLayer('./data/RF', { pane: 'rasters' }),
        "XGBoost Composite": new SafeTileLayer('./data/XGB', { pane: 'rasters' })
    };

    /* =====================================================
       MANUAL COMPOSITE
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

    function ramp(t) {
        t = Math.max(0, Math.min(1, t));
        t = Math.pow(t, 0.75);

        const stops = [
            [48, 18, 59],
            [65, 68, 170],
            [45, 178, 203],
            [246, 246, 90],
            [242, 128, 36],
            [180, 4, 38]
        ];

        const n = stops.length - 1;
        const x = t * n;
        const i = Math.min(Math.floor(x), n - 1);
        const f = x - i;

        const [r1, g1, b1] = stops[i];
        const [r2, g2, b2] = stops[i + 1];

        return [
            Math.round(r1 + f * (r2 - r1)),
            Math.round(g1 + f * (g2 - g1)),
            Math.round(b1 + f * (b2 - b1))
        ];
    }

    const CompositeLayer = L.GridLayer.extend({
        createTile(coords, done) {
            const tile = L.DomUtil.create('canvas', 'leaflet-tile');
            const size = this.getTileSize();
            tile.width = size.x;
            tile.height = size.y;

            const ctx = tile.getContext('2d');
            const keys = Object.keys(colorSources);

            Promise.all(keys.map(k => new Promise(res => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => res({ k, img });
                img.onerror = () => res({ k, img: null });
                img.src = colorSources[k].getTileUrl(coords);
            }))).then(parts => {

                const off = document.createElement('canvas');
                off.width = size.x;
                off.height = size.y;
                const octx = off.getContext('2d');

                const raw = {};
                document.querySelectorAll('#weights input[type="range"]').forEach(r => {
                    raw[r.dataset.key] = parseFloat(r.value);
                });

                const sum = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
                const weights = {};
                for (const k in raw) weights[k] = raw[k] / sum;

                document.querySelectorAll('#weights input[type="range"]').forEach(r => {
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
                    const t = Math.max(0, Math.min(1, acc[i]));
                    const [r, g, b] = ramp(t);
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

    const compositeLayer = new CompositeLayer({ pane: 'rasters', opacity: 0.9 });

    document.querySelectorAll('#weights input[type="range"]').forEach(sl =>
        sl.addEventListener('input', () => {
            if (map.hasLayer(compositeLayer)) compositeLayer.redraw();
        })
    );

    /* =====================================================
       CLEAR RASTERS
    ===================================================== */
    function clearRasters() {
        Object.values(layers).forEach(l => map.removeLayer(l));
        map.removeLayer(compositeLayer);
        activeRaster = null;
    }

    /* =====================================================
       RASTER RADIO LOGIC
    ===================================================== */
    document.querySelectorAll('input[name="r"]').forEach(radio => {
        radio.addEventListener('change', e => {

            // only act when checked
            if (!e.target.checked) return;

            // -------------------------------
            // RASTER STATE
            // -------------------------------
            clearRasters();
            activeRaster = e.target.value;

            const hideBox = document.getElementById('chkHideRasters');
            if (hideBox) hideBox.checked = false;

            if (activeRaster === '__COMPOSITE__') {
                document.getElementById('weights').style.display = 'block';
                compositeLayer.addTo(map);
            } else {
                document.getElementById('weights').style.display = 'none';
                if (layers[activeRaster]) layers[activeRaster].addTo(map);
            }

            

            // -------------------------------
            // COMPOSITE CHART CONTROL (ONLY PLACE)
            // -------------------------------

            // destroy old composite charts
            driveChartComposite?.destroy();
            chart2124?.destroy();
            chart2427?.destroy();

            driveChartComposite = null;
            chart2124 = null;
            chart2427 = null;

            document.getElementById('chartWrap_drive_composite').style.display = 'none';
            document.getElementById('chartWrap_2124').style.display = 'none';
            document.getElementById('chartWrap_2427').style.display = 'none';

            // build charts ONLY for composite rasters
            if (
                activeRaster === 'CRITIC Composite' ||
                activeRaster === 'Random Forest Composite' ||
                activeRaster === 'XGBoost Composite'
            ) {

                document.getElementById('chartPanel').style.display = 'block';

                document.getElementById('chartWrap_drive_composite').style.display = 'block';
                document.getElementById('chartWrap_2124').style.display = 'block';
                document.getElementById('chartWrap_2427').style.display = 'block';

                const key =
                    activeRaster === 'CRITIC Composite' ? 'CRITIC' :
                        activeRaster === 'Random Forest Composite' ? 'RF' :
                            'XGB';

                const title =
                    key === 'CRITIC' ? 'CRITIC' :
                        key === 'RF' ? 'Random Forest' :
                            'XGBoost';

                driveChartComposite = makeDriveTimeChart(
                    'chart_drive_composite',
                    key === 'CRITIC'
                        ? 'CRITIC Indicator'
                        : key === 'RF'
                            ? 'RF Indicator'
                            : 'XGB Indicator',
                    DRIVE_TIME_DATA[key]["21_24"],
                    DRIVE_TIME_DATA[key]["24_27"]
                );

                chart2124 = makeHighChart(
                    'chart_2124',
                    `${title} – High vs Very High (21–24)`,
                    HIGH_VERYHIGH_DATA[key]["21_24"].High,
                    HIGH_VERYHIGH_DATA[key]["21_24"].VeryHigh,
                    { light: '#6ec1ff', dark: '#1e90ff' }
                );

                chart2427 = makeHighChart(
                    'chart_2427',
                    `${title} – High vs Very High (24–27)`,
                    HIGH_VERYHIGH_DATA[key]["24_27"].High,
                    HIGH_VERYHIGH_DATA[key]["24_27"].VeryHigh,
                    { light: '#7fe0a3', dark: '#2ecc71' }
                );
            }
            else {
                // no composite raster → hide panel if coverage also off
                if (!coverageChartsActive) {
                    document.getElementById('chartPanel').style.display = 'none';
                }
            }
        });
   
    });               
        /* =====================================================
           GLOBAL HIDE-ALL-RASTERS CHECKBOX
        ===================================================== */
        const chkHideRasters = document.getElementById('chkHideRasters');
        if (chkHideRasters) {
            chkHideRasters.addEventListener('change', e => {
                if (e.target.checked) {

                    // 1️⃣ Hide raster layers
                    clearRasters();
                    document.getElementById('weights').style.display = 'none';
                    document.querySelectorAll('input[name="r"]').forEach(r => r.checked = false);
                    

                    // 2️⃣ Remove ONLY composite charts
                    driveChartComposite?.destroy();
                    driveChartComposite = null;

                    chart2124?.destroy();
                    chart2427?.destroy();
                    chart2124 = chart2427 = null;

                    document.getElementById('chartWrap_drive_composite').style.display = 'none';
                    document.getElementById('chartWrap_2124').style.display = 'none';
                    document.getElementById('chartWrap_2427').style.display = 'none';

                    // 3️⃣ If coverage charts are not active, hide panel
                    if (!coverageChartsActive) {
                        document.getElementById('chartPanel').style.display = 'none';
                    }
                }
            });
        }


        /* =====================================================
           COVERAGE POLYGON
        ===================================================== */
        function driveTimeColor(dt) {
            if (dt === "0 - 4") return "#ff2f92";
            if (dt === "4 - 6") return "#ff7bbd";
            if (dt === "6+") return "#ffd1e6";
            return "#ccc";
        }

        fetch('./data/Fire_Stations_Service_Coverage.geojson?v=' + Date.now())
            .then(r => {
                if (!r.ok) {
                    throw new Error(`HTTP ${r.status} while loading Fire_Stations_Service_Coverage.geojson`);
                }
                return r.text();
            })
            .then(t => {
                if (!t || t.trim().length === 0) {
                    throw new Error('Fire_Stations_Service_Coverage.geojson is empty');
                }
                if (t.trim().startsWith('<')) {
                    throw new Error('HTML returned instead of GeoJSON');
                }
                return JSON.parse(t);
            })
            .then(d => {

                d.features.sort((a, b) => {
                    const order = { "6+": 0, "4 - 6": 1, "0 - 4": 2 };
                    return (order[a.properties?.Drive_Time] ?? 0)
                        - (order[b.properties?.Drive_Time] ?? 0);
                });

                coverageLayer = L.geoJSON(d, {
                    pane: 'coverage',
                    style: f => ({
                        color: '#444',
                        weight: 1.2,
                        fillColor: driveTimeColor(f.properties?.Drive_Time),
                        fillOpacity: 0.45
                    })
                });

            })
            .catch(err => {
                console.error('🔥 Coverage GeoJSON load failed:', err);
            });



                const legend = document.getElementById('coverage-legend');
                const chk = document.getElementById('chkCoverage');

                chk.addEventListener('change', e => {

                    if (e.target.checked) {

                        // 1️⃣ show coverage layer on map
                        if (coverageLayer) {
                            coverageLayer.addTo(map);
                        }

                        enforceStationZOrder();

                        // 2️⃣ show coverage legend ✅
                        legend.style.display = 'block';

                        // 3️⃣ coverage chart state
                        coverageChartsActive = true;

                        document.getElementById('chartPanel').style.display = 'block';
                        document.getElementById('chartWrap_drive_coverage').style.display = 'block';

                        // 4️⃣ create coverage chart
                        driveChartCoverage?.destroy();
                        driveChartCoverage = makeDriveTimeChart(
                            'chart_drive_coverage',
                            'Service Coverage Drive-Time',
                            DRIVE_TIME_DATA.COVERAGE["21_24"],
                            DRIVE_TIME_DATA.COVERAGE["24_27"]
                        );

                    } else {

                        // 5️⃣ remove coverage layer
                        map.removeLayer(coverageLayer);

                        // 6️⃣ hide coverage legend ✅
                        legend.style.display = 'none';

                        // 7️⃣ remove coverage chart
                        coverageChartsActive = false;
                        driveChartCoverage?.destroy();
                        driveChartCoverage = null;
                        document.getElementById('chartWrap_drive_coverage').style.display = 'none';

                        // 8️⃣ hide chart panel only if no composite charts exist
                        if (!driveChartComposite && !chart2124 && !chart2427) {
                            document.getElementById('chartPanel').style.display = 'none';
                        }
                    }
               

                });

              /* =====================================================
   FIRE STATIONS
===================================================== */
    fetch('./data/Fire_Stations.geojson?v=' + Date.now())
        .then(r => {
            if (!r.ok) {
                throw new Error(`HTTP ${r.status} while loading Fire_Stations.geojson`);
            }
            return r.text();
        })
        .then(t => {
            if (!t || t.trim().length === 0) {
                throw new Error('Fire_Stations.geojson is empty');
            }
            if (t.trim().startsWith('<')) {
                throw new Error('HTML returned instead of GeoJSON (check deployment/path)');
            }
            return JSON.parse(t);
        })
        .then(d => {

            stationsLayer = L.geoJSON(d, {
                pane: 'stations',
                pointToLayer: (f, latlng) => {
                    const id = f.properties?.Station_ID;

                    let icon = defaultStationIcon;
                    if ([123, 124, 125].includes(id)) icon = blueOn;
                    if ([126, 127, 128].includes(id)) icon = greenOn;

                    const m = L.marker(latlng, {
                        icon,
                        pane: 'stations'
                    });

                    if ([123, 124, 125].includes(id)) flashingBlue.push(m);
                    if ([126, 127, 128].includes(id)) flashingGreen.push(m);

                    return m;
                }
            });

            const chkStations = document.getElementById('chkStations');
            if (!chkStations || chkStations.checked) {
                if (stationsLayer) {
                    stationsLayer.addTo(map);
                    enforceStationZOrder();
                }
            }
        })
        .catch(err => {
            console.error('🔥 Fire Stations load failed:', err);
        });


    // ===============================
    // STATION CHECKBOX CONTROL
    // ===============================
    const chkStations = document.getElementById('chkStations');

    if (!chkStations || chkStations.checked) {
        if (stationsLayer) {
            stationsLayer.addTo(map);
            enforceStationZOrder();
        }

    }

    if (chkStations) {
        chkStations.addEventListener('change', e => {
            const pane = map.getPane('stations');

            if (e.target.checked) {
                if (!map.hasLayer(stationsLayer)) {
                    stationsLayer.addTo(map);
                }
                if (pane) pane.style.display = '';
                enforceStationZOrder();
            } else {
                map.removeLayer(stationsLayer);
                if (pane) pane.style.display = 'none';
            }
        });
    }


    // ===============================
    // FLASHING ICONS
    // ===============================
    setInterval(() => {
        flashingBlue.forEach(m =>
            m.setIcon(m.options.icon === blueOn ? blueOff : blueOn)
        );
        flashingGreen.forEach(m =>
            m.setIcon(m.options.icon === greenOn ? greenOff : greenOn)
        );
    }, 600);


    let chartsVisible = true;

    document.getElementById('toggleCharts').addEventListener('click', () => {
        chartsVisible = !chartsVisible;

        const cov = document.getElementById('chartWrap_drive_coverage');
        if (cov) cov.style.display = chartsVisible && coverageChartsActive ? 'block' : 'none';

        const compDrive = document.getElementById('chartWrap_drive_composite');
        const c2124 = document.getElementById('chartWrap_2124');
        const c2427 = document.getElementById('chartWrap_2427');

        if (compDrive) compDrive.style.display = chartsVisible && driveChartComposite ? 'block' : 'none';
        if (c2124) c2124.style.display = chartsVisible && chart2124 ? 'block' : 'none';
        if (c2427) c2427.style.display = chartsVisible && chart2427 ? 'block' : 'none';

        document.getElementById('toggleCharts').textContent =
            chartsVisible ? '📊 Hide Charts' : '📊 Show Charts';
    });

}); 

