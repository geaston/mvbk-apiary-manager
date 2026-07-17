    function saveCustomBloomData() {
      try {
        localStorage.setItem(CUSTOM_BLOOM_STORAGE_KEY, JSON.stringify(customBloomData));
      } catch (err) {
        console.warn('Failed to save custom bloom overrides', err);
      }
    }

    function loadCustomBloomData() {
      try {
        const raw = localStorage.getItem(CUSTOM_BLOOM_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
          customBloomData = parsed;
        }
      } catch (err) {
        console.warn('Failed to load custom bloom overrides', err);
      }
    }

    function refreshCustomBloomEditLayer() {
      customBloomEditLayer.clearLayers();
      (customBloomData.features || []).forEach(feature => {
        try {
          const layer = L.geoJSON(feature, {
            style: {
              color: '#1b5e20',
              weight: 2,
              dashArray: '6,4',
              fillOpacity: 0.20
            }
          });
          layer.eachLayer(l => customBloomEditLayer.addLayer(l));
        } catch (err) {
          console.warn('Failed to load custom bloom feature into edit layer', err);
        }
      });
    }
    
    const countyLabelMinZoom = 12;

    function getCountyLabelStyleForZoom(zoom) {
      const sizeMap = {
        12: 11,
        13: 12,
        14: 13,
        15: 14,
        16: 15,
        17: 16,
        18: 17
      };
      const clampedZoom = Math.max(12, Math.min(18, zoom));
      const fontSize = sizeMap[clampedZoom] || 11;
      const paddingY = clampedZoom >= 15 ? 3 : 2;
      const paddingX = clampedZoom >= 15 ? 7 : 6;
      return `font-size:${fontSize}px;padding:${paddingY}px ${paddingX}px;`;
    }
    const markerMap = new Map();
    const cardMap = new Map();

    const listContainer = document.getElementById('apiaryList');
    const resultsCount = document.getElementById('resultsCount');
    const foragePresetSelect = document.getElementById('foragePreset');
    const showForageRingsCheckbox = document.getElementById('showForageRings');
    const seasonSelect = document.getElementById('seasonSelect');
    const showBloomPolygonsCheckbox = document.getElementById('showBloomPolygons');
    const showDcaLayerCheckbox = document.getElementById('showDcaLayer');
    const dcaFilter = document.getElementById('dcaFilter');
    const searchInput = document.getElementById('searchInput');
    const ownerFilter = document.getElementById('ownerFilter');
    const statusFilter = document.getElementById('statusFilter');
    const countyFilter = document.getElementById('countyFilter');
    const bloomFilter = document.getElementById('bloomFilter');
    const typeFilter = document.getElementById('typeFilter');
    const minHivesFilter = document.getElementById('minHivesFilter');
    const treatedFilter = document.getElementById('treatedFilter');
    const inspectedFilter = document.getElementById('inspectedFilter');
    const miteThresholdFilter = document.getElementById('miteThresholdFilter');
    const miteBiterFilter = document.getElementById('miteBiterFilter');
    const showMiteBiterInfluenceCheckbox = document.getElementById('showMiteBiterInfluence');
    const miteBiterInfluenceRadiusSelect = document.getElementById('miteBiterInfluenceRadius');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');
    const exportCustomBloomBtn = document.getElementById('exportCustomBloomBtn');
    const clearCustomBloomBtn = document.getElementById('clearCustomBloomBtn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const hamburgerBtn = document.getElementById('hamburgerBtn');

    if (!ENABLE_LANDCOVER_FEATURES) {
      document.querySelectorAll('.bloom-feature').forEach(el => el.classList.add('feature-disabled'));
    }
    if (!ENABLE_DCA_FEATURES) {
      document.querySelectorAll('.dca-feature').forEach(el => el.classList.add('feature-disabled'));
    }

    let currentForagePresetMeters = Number(foragePresetSelect.value);
    let showForageRings = showForageRingsCheckbox.checked;
    let showDcaLayer = showDcaLayerCheckbox.checked;
    let currentSeason = seasonSelect.value;
    let showBloomPolygons = showBloomPolygonsCheckbox.checked;
    const landcoverZoomThreshold = 15;
    let showMiteBiterInfluence = showMiteBiterInfluenceCheckbox.checked;
    let miteBiterInfluenceRadiusMeters = Number(miteBiterInfluenceRadiusSelect.value);
    let loadedApiaries = [];
    let apiarySummaries = [];

    function getRuleForFeature(feature) {
      const props = feature.properties || {};

      if (typeof props.bloom_score === 'number') {
        const raw = props.bloom_score;
        const clamped = Math.max(0, Math.min(3, raw));
        const label = props.forage_type || props.class_name || props.landCoverClass || 'forage area';
        return { spring: clamped, summer: clamped, fall: clamped, overall: clamped, label: label };
      }

      const cls = String(props.class_name || props.forage_type || props.landCoverClass || '').toLowerCase();

      if (cls.includes('woody wetland')) {
        return { spring: 3.0, summer: 2.3, fall: 1.6, overall: 2.3, label: props.class_name || 'Woody Wetlands' };
      }
      if (cls.includes('emergent herbaceous wetland')) {
        return { spring: 2.3, summer: 3.0, fall: 2.0, overall: 2.5, label: props.class_name || 'Emergent Herbaceous Wetlands' };
      }
      if (cls.includes('shrub') || cls.includes('scrub')) {
        return { spring: 2.0, summer: 3.0, fall: 3.0, overall: 2.7, label: props.class_name || 'Shrub/Scrub' };
      }
      if (cls.includes('grassland') || cls.includes('herbaceous')) {
        return { spring: 1.4, summer: 2.4, fall: 3.0, overall: 2.3, label: props.class_name || 'Grassland/Herbaceous' };
      }
      if (cls.includes('pasture') || cls.includes('hay')) {
        return { spring: 1.5, summer: 2.4, fall: 2.0, overall: 2.0, label: props.class_name || 'Pasture/Hay' };
      }
      if (cls.includes('cultivated crops')) {
        return { spring: 0.6, summer: 1.4, fall: 0.4, overall: 0.9, label: props.class_name || 'Cultivated Crops' };
      }
      if (cls.includes('deciduous forest')) {
        return { spring: 1.8, summer: 0.9, fall: 0.7, overall: 1.1, label: props.class_name || 'Deciduous Forest' };
      }
      if (cls.includes('mixed forest')) {
        return { spring: 1.4, summer: 0.8, fall: 0.6, overall: 0.9, label: props.class_name || 'Mixed Forest' };
      }
      if (cls.includes('evergreen forest')) {
        return { spring: 0.6, summer: 0.4, fall: 0.3, overall: 0.4, label: props.class_name || 'Evergreen Forest' };
      }
      if (cls.includes('developed, open space')) {
        return { spring: 0.8, summer: 1.2, fall: 0.8, overall: 0.9, label: props.class_name || 'Developed, Open Space' };
      }
      if (cls.includes('developed, low intensity')) {
        return { spring: 0.4, summer: 0.6, fall: 0.3, overall: 0.4, label: props.class_name || 'Developed, Low Intensity' };
      }
      if (cls.includes('developed, medium intensity')) {
        return { spring: 0.2, summer: 0.3, fall: 0.2, overall: 0.2, label: props.class_name || 'Developed, Medium Intensity' };
      }
      if (cls.includes('developed, high intensity')) {
        return { spring: 0.0, summer: 0.1, fall: 0.0, overall: 0.0, label: props.class_name || 'Developed, High Intensity' };
      }
      if (cls.includes('barren')) {
        return { spring: 0.1, summer: 0.1, fall: 0.1, overall: 0.1, label: props.class_name || 'Barren Land' };
      }
      if (cls.includes('open water')) {
        return { spring: 0.0, summer: 0.0, fall: 0.0, overall: 0.0, label: props.class_name || 'Open Water' };
      }

      return { spring: 0.5, summer: 0.5, fall: 0.5, overall: 0.5, label: props.class_name || props.forage_type || props.landCoverClass || 'unknown' };
    }

    function getScoreForFeature(feature) {
      const props = feature.properties || {};
      if (typeof props.bloom_score === 'number') {
        return Math.max(0, Math.min(3, props.bloom_score));
      }
      const rule = getRuleForFeature(feature);
      return rule[currentSeason] ?? rule.overall ?? 0;
    }

    function scoreToLabel(score) {
      if (score >= 2.5) return 'High';
      if (score >= 1.5) return 'Medium';
      if (score >= 0.5) return 'Low';
      return 'Poor';
    }

    function getMarkerColor(apiary) {
      return apiary.markerColor || typeColors[apiary.type] || statusColors[apiary.status] || '#8e24aa';
    }

    function createDivIcon(color) {
      return L.divIcon({
        className: 'custom-div-icon',
        html: '<div class="marker-pin" style="background:' + color + '"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 18],
        popupAnchor: [0, -18]
      });
    }

    function setActiveCard(apiaryId) {
      cardMap.forEach((card, id) => card.classList.toggle('active', id === apiaryId));
    }

    function clearMapAndList() {
      markers.forEach(marker => map.removeLayer(marker));
      forageCircles.forEach(circle => map.removeLayer(circle));
      markers.length = 0;
      forageCircles.length = 0;
      markerMap.clear();
      cardMap.clear();
      listContainer.innerHTML = '';
    }

    function clearDcaMarkers() {
      dcaMarkers.forEach(marker => map.removeLayer(marker));
      dcaMarkers.length = 0;
    }

    function formatRadiusLabel(meters) {
      const km = meters / 1000;
      const miles = meters / 1609.34;
      return km.toFixed(1) + ' km / ' + miles.toFixed(1) + ' mi';
    }

    function formatAreaLabel(sqKm) {
      const acres = sqKm * 247.105;
      return sqKm.toFixed(2) + ' km² / ' + acres.toFixed(0) + ' acres';
    }

    function getRingAreaSqKm(radiusMeters) {
      return Math.PI * Math.pow(radiusMeters / 1000, 2);
    }


    function scoreToColor(score) {
      if (score >= 2.5) return '#2e7d32';
      if (score >= 1.5) return '#f9a825';
      if (score >= 0.5) return '#9e9e9e';
      return '#d32f2f';
    }

    function getPopupScorePill(score) {
      const label = scoreToLabel(score);
      const color = scoreToColor(score);
      return '<div class="popup-score-pill" style="background:' + color + ';">' +
        '<span class="popup-score-dot"></span><span>' + label + ' bloom potential</span>' +
      '</div>';
    }

    
    function createCustomBloomStyle(feature) {
      const score = getScoreForFeature(feature);
      const color = scoreToColor(score);
      return {
        color: color,
        weight: 2,
        dashArray: '6,4',
        fillColor: color,
        fillOpacity: 0.30
      };
    }

    function normalizeCustomBloomFeature(feature) {
      const props = feature.properties || {};
      const rawScore = Number(props.bloom_score);
      const clampedScore = Number.isFinite(rawScore) ? Math.max(0, Math.min(3, rawScore)) : 1.5;
      return {
        type: 'Feature',
        properties: {
          source: 'custom',
          name: props.name || props.forage_type || props.class_name || '',
          forage_type: props.forage_type || props.class_name || 'custom override',
          class_name: props.class_name || props.forage_type || 'custom override',
          bloom_score: clampedScore,
          notes: props.notes || ''
        },
        geometry: feature.geometry
      };
    }

    function saveCustomBloomPolygons() {
      try {
        const geojson = customBloomEditLayer.toGeoJSON();
        customBloomData = {
          type: 'FeatureCollection',
          features: (geojson.features || []).map(normalizeCustomBloomFeature)
        };
        localStorage.setItem(CUSTOM_BLOOM_STORAGE_KEY, JSON.stringify(customBloomData));
      } catch (err) {
        console.warn('Could not save custom bloom polygons', err);
      }
    }

    function loadCustomBloomPolygons() {
      try {
        const raw = localStorage.getItem(CUSTOM_BLOOM_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) return;
        customBloomData = {
          type: 'FeatureCollection',
          features: parsed.features.map(normalizeCustomBloomFeature)
        };
        customBloomEditLayer.clearLayers();
        L.geoJSON(customBloomData, {
          style: createCustomBloomStyle,
          onEachFeature: function(feature, layer) {
            layer.feature = normalizeCustomBloomFeature(feature);
            customBloomEditLayer.addLayer(layer);
          }
        });
      } catch (err) {
        console.warn('Could not load custom bloom polygons', err);
      }
    }

    function promptForCustomBloomProperties(existingProps) {
      const base = existingProps || {};
      const forageType = window.prompt('Custom bloom type / forage type:', base.forage_type || base.class_name || 'custom override');
      if (forageType === null) return null;
      const scoreInput = window.prompt('Bloom score (0–3, matching land cover) (0 to 3):', base.bloom_score != null ? String(base.bloom_score) : '2');
      if (scoreInput === null) return null;
      const parsed = Number(scoreInput);
      if (!Number.isFinite(parsed)) {
        alert('Bloom score must be a number from 0 to 3.');
        return null;
      }
      const clamped = Math.max(0, Math.min(3, parsed));
      const name = window.prompt('Optional name:', base.name || '') || '';
      const notes = window.prompt('Optional notes:', base.notes || '') || '';
      return {
        source: 'custom',
        forage_type: forageType,
        class_name: forageType,
        bloom_score: clamped,
        name: name,
        notes: notes
      };
    }

    function getAllBloomFeatures() {
      return [
        ...(bloomAreaData.features || []),
        ...(customBloomData.features || [])
      ];
    }

    function getFeatureDisplayLabel(feature) {
      const props = feature.properties || {};
      return props.name || props.forage_type || props.class_name || props.landcover || 'Unnamed bloom area';
    }

    function unionFeatures(features) {
      let current = null;
      for (const feat of features) {
        try {
          current = current ? turf.union(current, feat) : feat;
        } catch (err) {
          console.warn('Union failed for custom override geometry', err);
        }
      }
      return current;
    }

function updateCountyLabelSizes() {
      if (!countyLabelLayer) return;
      countyLabelLayer.eachLayer(layer => {
        const el = layer.getElement ? layer.getElement() : null;
        if (!el) return;
        const labelEl = el.querySelector('.county-label');
        if (!labelEl) return;
        labelEl.style.cssText += getCountyLabelStyleForZoom(map.getZoom());
      });
    }

