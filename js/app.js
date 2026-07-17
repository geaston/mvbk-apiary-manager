
const mapCenter = [42.69, -74.40];
    const map = L.map('map').setView(mapCenter, 11);

    // Supabase auth settings.
    // Replace these two values with your own Supabase project URL and anon public key.
    const { SUPABASE_URL, SUPABASE_ANON_KEY, ENABLE_LANDCOVER_FEATURES, ENABLE_DCA_FEATURES } = window.MVBK_CONFIG;
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const authScreen = document.getElementById('authScreen');
    const authEmail = document.getElementById('authEmail');
    const magicLinkBtn = document.getElementById('magicLinkBtn');
    const authMessage = document.getElementById('authMessage');
    const signOutBtn = document.getElementById('signOutBtn');

    let currentUser = null;
    let mapDataHasLoaded = false;

    function showAuthScreen(message = '') {
      authScreen.style.display = 'flex';
      if (message) authMessage.textContent = message;
    }

    function hideAuthScreen() {
      authScreen.style.display = 'none';
      authMessage.textContent = '';
    }

    async function sendMagicLink() {
      const email = authEmail.value.trim();
      if (!email) {
        authMessage.textContent = 'Enter your email address first.';
        return;
      }

      authMessage.textContent = 'Sending magic link...';

      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) {
        console.error('Magic link error:', error);
        authMessage.textContent = error.message;
        return;
      }

      authMessage.textContent = 'Check your email for the login link.';
    }

    async function signOut() {
      await supabaseClient.auth.signOut();
      currentUser = null;
      mapDataHasLoaded = false;
      showAuthScreen('Signed out.');
    }

    async function isApprovedMember(email) {
      if (!email) return false;

      const normalizedEmail = email.trim().toLowerCase();

      const { data, error } = await supabaseClient
        .from('members')
        .select('email')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (error) {
        console.error('Member allowlist check failed:', error);
        authMessage.textContent = 'Could not verify membership. Contact the club admin.';
        return false;
      }

      return !!data;
    }

    async function allowMemberOrSignOut(session) {
      const email = session && session.user && session.user.email;
      const allowed = await isApprovedMember(email);

      if (!allowed) {
        await supabaseClient.auth.signOut();
        currentUser = null;
        mapDataHasLoaded = false;
        showAuthScreen('This email is not approved for access. Contact the club admin.');
        return false;
      }

      currentUser = session.user;
      hideAuthScreen();

      if (!mapDataHasLoaded) {
        mapDataHasLoaded = true;
        loadData();
      }

      return true;
    }

    async function requireSupabaseSession() {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) {
        console.error('Session check failed:', error);
        showAuthScreen(error.message);
        return;
      }

      const session = data.session;
      if (!session) {
        showAuthScreen();
        return;
      }

      await allowMemberOrSignOut(session);
    }

    magicLinkBtn.addEventListener('click', sendMagicLink);
    authEmail.addEventListener('keydown', event => {
      if (event.key === 'Enter') sendMagicLink();
    });
    if (signOutBtn) signOutBtn.addEventListener('click', signOut);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      currentUser = session ? session.user : null;

      if (currentUser && session) {
        allowMemberOrSignOut(session)
          .catch(error => {
            console.error('Membership check failed:', error);
            currentUser = null;
            mapDataHasLoaded = false;
            showAuthScreen('Unable to verify membership. Contact the club admin.');
          });
      } else {
        showAuthScreen();
      }
    });
    map.createPane('countyLabels');
    map.getPane('countyLabels').style.zIndex = 650;
    map.getPane('countyLabels').style.pointerEvents = 'none';

    const customBloomEditLayer = new L.FeatureGroup().addTo(map);

    const drawControl = new L.Control.Draw({
      edit: {
        featureGroup: customBloomEditLayer,
        edit: true,
        remove: true
      },
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: '#1b5e20',
            weight: 2,
            dashArray: '6,4',
            fillOpacity: 0.20
          }
        },
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false
      }
    });
    if (ENABLE_LANDCOVER_FEATURES) {
      map.addControl(drawControl);
    }

    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    });

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
    );

    satellite.addTo(map);
    L.control.layers({ "Street Map": streets, "Satellite": satellite }).addTo(map);

    let bloomAreaData = { type: 'FeatureCollection', features: [] };
    let countiesGeoData = { type: 'FeatureCollection', features: [] };
    const bloomGeoJsonPath = './landcover.geojson';
    // County boundaries are loaded from Supabase/PostGIS.
    const COUNTY_TABLE = 'counties';
    const COUNTY_ID_COLUMN = 'id';
    const COUNTY_NAME_COLUMN = 'name';
    const COUNTY_GEOMETRY_COLUMN = 'geom';

    const dcaHotspots = [
      { id: 'dca-1', name: 'Esperance Ridge Gap', lat: 42.774, lng: -74.262, confidence: 'high', terrainCue: 'ridge gap / open saddle', notes: 'Open gap between wooded edges with room for drone flight loops.' },
      { id: 'dca-2', name: 'Central Bridge Air Lane', lat: 42.747, lng: -74.346, confidence: 'medium', terrainCue: 'field corridor', notes: 'Field opening bordered by tree lines that may funnel drone traffic.' },
      { id: 'dca-3', name: 'Middleburgh South Opening', lat: 42.606, lng: -74.345, confidence: 'high', terrainCue: 'valley edge clearing', notes: 'Sunny opening near mixed edge habitat and sheltered wind pattern.' },
      { id: 'dca-4', name: 'Cobleskill Orchard Gap', lat: 42.687, lng: -74.492, confidence: 'medium', terrainCue: 'orchard / hedgerow break', notes: 'Open lane near orchard edges with good line-of-flight visibility.' },
      { id: 'dca-5', name: 'Richmondville Meadow Saddle', lat: 42.644, lng: -74.562, confidence: 'high', terrainCue: 'meadow saddle', notes: 'Likely drone gathering pocket between slight rises and open meadow.' },
      { id: 'dca-6', name: 'Breakabeen Creek Opening', lat: 42.531, lng: -74.429, confidence: 'medium', terrainCue: 'creekside clearing', notes: 'Open patch with surrounding tree structure but clear central airspace.' }
    ];

    const bloomScoringRules = {
      shrub_scrub: { spring: 2, summer: 3, fall: 3, overall: 3, label: 'Shrub / scrub' },
      pasture_hay: { spring: 2, summer: 2, fall: 2, overall: 2, label: 'Pasture / hay' },
      cultivated_crops: { spring: 1, summer: 1, fall: 0, overall: 1, label: 'Cultivated crops' },
      forest_edge: { spring: 3, summer: 2, fall: 2, overall: 2, label: 'Forest edge' },
      wetland_edge: { spring: 3, summer: 2, fall: 1, overall: 2, label: 'Wetland edge' },
      orchard_edge: { spring: 3, summer: 2, fall: 1, overall: 2, label: 'Orchard edge' },
      forest_interior: { spring: 1, summer: 0, fall: 0, overall: 0, label: 'Forest interior' },
      grassland_herbaceous: { spring: 1, summer: 2, fall: 3, overall: 2, label: 'Grassland / herbaceous' }
    };

    const statusColors = {
      active: '#2e7d32',
      planned: '#1565c0',
      'needs attention': '#ef6c00',
      inactive: '#757575'
    };

    const typeColors = {
      'honey yard': '#d4a017',
      'nuc yard': '#00897b',
      'drone flood': '#8e24aa',
      'queen mating': '#3949ab'
    };

    const markers = [];
    const forageCircles = [];
    const dcaMarkers = [];
    const miteBiterInfluenceCircles = [];
    let bloomPolygonLayer = null;
    let countyBaseLayer = null;
    let countyLabelLayer = null;
    let customBloomData = { type: 'FeatureCollection', features: [] };
    const CUSTOM_BLOOM_STORAGE_KEY = 'mvbk_custom_bloom_overrides_v1';

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

    function renderCountyBaseLayer() {
      if (countyBaseLayer) {
        map.removeLayer(countyBaseLayer);
        countyBaseLayer = null;
      }
      if (countyLabelLayer) {
        map.removeLayer(countyLabelLayer);
        countyLabelLayer = null;
      }

      if (!countiesGeoData || !Array.isArray(countiesGeoData.features) || countiesGeoData.features.length === 0) return;

      countyBaseLayer = L.geoJSON(countiesGeoData, {
        style: feature => ({
          color: '#5f6368',
          weight: 1.5,
          fillOpacity: 0
        }),
        interactive: false
      }).addTo(map);

      countyBaseLayer.bringToBack();

      countyLabelLayer = L.layerGroup();

      countiesGeoData.features.forEach(feature => {
        try {
          const tempLayer = L.geoJSON(feature);
          const bounds = tempLayer.getBounds();
          if (!bounds.isValid()) return;

          const center = bounds.getCenter();
          const label = (feature.properties && (feature.properties.NAME || feature.properties.name || feature.properties.county || feature.properties.County)) || 'County';

          const labelMarker = L.marker(center, {
            interactive: false,
            icon: L.divIcon({
              className: 'county-label-icon',
              html: '<div class="county-label" style="' + getCountyLabelStyleForZoom(map.getZoom()) + '">' + label + '</div>',
              iconSize: null
            }),
            pane: 'countyLabels'
          });

          countyLabelLayer.addLayer(labelMarker);
        } catch (err) {
          console.warn('Could not place county label', err);
        }
      });

      if (map.getZoom() >= countyLabelMinZoom) {
        countyLabelLayer.addTo(map);
        updateCountyLabelSizes();
      }
    }

    function clearBloomPolygonLayer() {
      if (bloomPolygonLayer) {
        map.removeLayer(bloomPolygonLayer);
        bloomPolygonLayer = null;
      }
    }

    function renderBloomPolygonLayer() {
      clearBloomPolygonLayer();
      if (!showBloomPolygons) return;
      if (map.getZoom() < landcoverZoomThreshold) return;

      bloomPolygonLayer = L.layerGroup();

      const baseLayer = L.geoJSON(bloomAreaData, {
        style: feature => {
          const score = getScoreForFeature(feature);
          const color = scoreToColor(score);
          return {
            color: color,
            weight: 1,
            fillColor: color,
            fillOpacity: 0.22
          };
        },
        onEachFeature: (feature, layer) => {
          const rule = getRuleForFeature(feature);
          const score = getScoreForFeature(feature);
          const seasonName = currentSeason.charAt(0).toUpperCase() + currentSeason.slice(1);
          layer.bindPopup(
            '<div>' +
              '<div class="apiary-title">' + getFeatureDisplayLabel(feature) + '</div>' +
              '<div><strong>Forage type:</strong> ' + rule.label + '</div>' +
              '<div><strong>' + seasonName + ' bloom potential:</strong> ' + scoreToLabel(score) + '</div>' +
            '</div>'
          );
        }
      });

      const customLayer = L.geoJSON(customBloomData, {
        style: createCustomBloomStyle,
        onEachFeature: (feature, layer) => {
          const rule = getRuleForFeature(feature);
          const score = getScoreForFeature(feature);
          const seasonName = currentSeason.charAt(0).toUpperCase() + currentSeason.slice(1);
          layer.bindPopup(
            '<div>' +
              '<div class="apiary-title">' + getFeatureDisplayLabel(feature) + '</div>' +
              '<div><strong>Custom override:</strong> Yes</div>' +
              '<div><strong>Forage type:</strong> ' + rule.label + '</div>' +
              '<div><strong>' + seasonName + ' bloom potential:</strong> ' + scoreToLabel(score) + '</div>' +
            '</div>'
          );
        }
      });

      bloomPolygonLayer.addLayer(baseLayer);
      bloomPolygonLayer.addLayer(customLayer);
      bloomPolygonLayer.addTo(map);
    }

    function summarizeBloomOverlap(apiary, forageRadiusMeters) {
      const circle = turf.circle([apiary.lng, apiary.lat], forageRadiusMeters / 1000, {
        steps: 96,
        units: 'kilometers'
      });

      const overlaps = [];
      const typeBuckets = {};
      let weightedScoreSum = 0;
      let totalOverlapArea = 0;

      const customIntersections = [];
      (customBloomData.features || []).forEach(feature => {
        try {
          const intersection = turf.intersect(circle, feature);
          if (!intersection) return;
          const areaSqKm = turf.area(intersection) / 1000000;
          if (areaSqKm <= 0) return;

          const rule = getRuleForFeature(feature);
          const score = getScoreForFeature(feature);
          const typeLabel = getFeatureDisplayLabel(feature);

          totalOverlapArea += areaSqKm;
          weightedScoreSum += score * areaSqKm;
          overlaps.push({ name: typeLabel, classLabel: rule.label, score, overlapAreaSqKm: areaSqKm });

          if (!typeBuckets[typeLabel]) {
            typeBuckets[typeLabel] = { typeLabel, score, totalAreaSqKm: 0 };
          }
          typeBuckets[typeLabel].totalAreaSqKm += areaSqKm;
          customIntersections.push(intersection);
        } catch (err) {
          console.warn('Skipping custom overlap calc', err);
        }
      });

      const customUnion = unionFeatures(customIntersections);

      (bloomAreaData.features || []).forEach(feature => {
        try {
          let intersection = turf.intersect(circle, feature);
          if (!intersection) return;

          if (customUnion) {
            try {
              const diff = turf.difference(intersection, customUnion);
              if (!diff) return;
              intersection = diff;
            } catch (err) {
              console.warn('Difference failed for base bloom feature', err);
            }
          }

          const overlapAreaSqKm = turf.area(intersection) / 1000000;
          if (overlapAreaSqKm <= 0) return;

          const rule = getRuleForFeature(feature);
          const score = getScoreForFeature(feature);
          const typeLabel = getFeatureDisplayLabel(feature);

          totalOverlapArea += overlapAreaSqKm;
          weightedScoreSum += score * overlapAreaSqKm;
          overlaps.push({ name: typeLabel, classLabel: rule.label, score, overlapAreaSqKm });

          if (!typeBuckets[typeLabel]) {
            typeBuckets[typeLabel] = { typeLabel, score, totalAreaSqKm: 0 };
          }
          typeBuckets[typeLabel].totalAreaSqKm += overlapAreaSqKm;
        } catch (err) {
          console.warn('Skipping overlap calc for feature:', getFeatureDisplayLabel(feature), err);
        }
      });

      overlaps.sort((a, b) => b.overlapAreaSqKm - a.overlapAreaSqKm);

      const ringAreaSqKm = getRingAreaSqKm(forageRadiusMeters);
      const groupedTypes = Object.values(typeBuckets)
        .map(bucket => ({
          ...bucket,
          percentOfRing: ringAreaSqKm > 0 ? (bucket.totalAreaSqKm / ringAreaSqKm) * 100 : 0
        }))
        .sort((a, b) => b.percentOfRing - a.percentOfRing);

      const averageScore = totalOverlapArea > 0 ? weightedScoreSum / totalOverlapArea : 0;
      return {
        averageScore,
        overallLabel: scoreToLabel(averageScore),
        overlapCount: overlaps.length,
        totalOverlapAreaSqKm: totalOverlapArea,
        ringAreaSqKm,
        topAreas: overlaps.slice(0, 3),
        groupedTypes: groupedTypes.slice(0, 6)
      };
    }


    function getMiteIndicator(miteCount) {
      const count = Number(miteCount);
      if (!Number.isFinite(count)) {
        return { label: 'Mites N/A', color: '#757575' };
      }
      if (count <= 2) {
        return { label: 'Low mites', color: '#2e7d32' };
      }
      if (count <= 4) {
        return { label: 'Watch mites', color: '#f9a825' };
      }
      return { label: 'High mites', color: '#c62828' };
    }

    function buildApiarySummaries() {
      apiarySummaries = loadedApiaries
        .filter(apiary => typeof apiary.lat === 'number' && typeof apiary.lng === 'number')
        .map(apiary => {
          const forageRadiusMeters = typeof apiary.forageRadiusMeters === 'number' ? apiary.forageRadiusMeters : currentForagePresetMeters;
          const bloomSummary = ENABLE_LANDCOVER_FEATURES
            ? summarizeBloomOverlap(apiary, forageRadiusMeters)
            : {
                averageScore: 0,
                overallLabel: 'Disabled',
                overlapCount: 0,
                totalOverlapAreaSqKm: 0,
                ringAreaSqKm: getRingAreaSqKm(forageRadiusMeters),
                topAreas: [],
                groupedTypes: []
              };
          return { apiary, forageRadiusMeters, bloomSummary };
        });
    }

    function populateOwnerFilter() {
      const previous = ownerFilter.value;
      const owners = [...new Set(loadedApiaries.map(a => a.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      ownerFilter.innerHTML = '<option value="">All owners</option>' +
        owners.map(owner => '<option value="' + owner + '">' + owner + '</option>').join('');
      if (owners.includes(previous)) ownerFilter.value = previous;
    }

    function populateCountyFilter() {
      const previous = countyFilter.value;
      const counties = [...new Set(loadedApiaries.map(a => getCountyNameForApiary(a)).filter(Boolean).filter(c => c !== 'Unknown'))]
        .sort((a, b) => a.localeCompare(b));
      countyFilter.innerHTML = '<option value="">All counties</option>' +
        counties.map(county => '<option value="' + county + '">' + county + '</option>').join('');
      if (counties.includes(previous)) countyFilter.value = previous;
    }


    function getFilteredSummaries() {
      const q = searchInput.value.trim().toLowerCase();
      const owner = ownerFilter.value;
      const status = statusFilter.value;
      const county = countyFilter.value;
      const bloom = bloomFilter.value;
      const type = typeFilter.value;
      const minHives = minHivesFilter.value === '' ? null : Number(minHivesFilter.value);
      const treated = treatedFilter.value;
      const inspected = inspectedFilter.value;
      const miteThreshold = miteThresholdFilter.value === '' ? null : Number(miteThresholdFilter.value);
      const miteBiter = miteBiterFilter.value;

      return apiarySummaries.filter(({ apiary, bloomSummary }) => {
        const haystack = [apiary.name || '', apiary.owner || '', apiary.notes || '', apiary.status || '', apiary.type || ''].join(' ').toLowerCase();
        const matchesSearch = !q || haystack.includes(q);
        const matchesOwner = !owner || apiary.owner === owner;
        const matchesStatus = !status || apiary.status === status;
        const matchesCounty = !county || getCountyNameForApiary(apiary) === county;
        const matchesBloom = !ENABLE_LANDCOVER_FEATURES || !bloom || bloomSummary.overallLabel === bloom;
        const matchesType = !type || apiary.type === type;
        const matchesMinHives = minHives === null || Number(apiary.hives || 0) >= minHives;
        const matchesTreated = !treated || (treated === 'yes' ? apiary.treated === true : apiary.treated === false);
        const matchesInspected = !inspected || (inspected === 'yes' ? apiary.nysInspected === true : apiary.nysInspected === false);
        const matchesMiteThreshold = miteThreshold === null || Number(apiary.miteCount ?? -1) >= miteThreshold;
        const matchesMiteBiter = !miteBiter || (miteBiter === 'yes' ? apiary.miteBiter === true : apiary.miteBiter === false);
        return matchesSearch && matchesOwner && matchesStatus && matchesCounty && matchesBloom && matchesType && matchesMinHives && matchesTreated && matchesInspected && matchesMiteThreshold && matchesMiteBiter;
      });
    }

    function getDcaColor(confidence) {
      return confidence === 'high' ? '#7b1fa2' : '#ab47bc';
    }

    function getFilteredDcas() {
      if (!ENABLE_DCA_FEATURES) return [];
      const conf = dcaFilter.value;
      return dcaHotspots.filter(dca => !conf || dca.confidence === conf);
    }

    function renderDcaLayer() {
      clearDcaMarkers();
      if (!ENABLE_DCA_FEATURES || !showDcaLayer) return;

      getFilteredDcas().forEach(dca => {
        const color = getDcaColor(dca.confidence);
        const marker = L.circleMarker([dca.lat, dca.lng], {
          radius: dca.confidence === 'high' ? 9 : 7,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.35
        }).addTo(map);

        marker.bindPopup(
          '<div>' +
            '<div class="apiary-title">' + dca.name + '</div>' +
            '<div><strong>Type:</strong> Candidate drone congregation area</div>' +
            '<div><strong>Confidence:</strong> ' + dca.confidence.charAt(0).toUpperCase() + dca.confidence.slice(1) + '</div>' +
            '<div><strong>Terrain cue:</strong> ' + dca.terrainCue + '</div>' +
            '<div><strong>Notes:</strong> ' + dca.notes + '</div>' +
          '</div>'
        );

        dcaMarkers.push(marker);
      });
    }

    function getNearestDca(apiary) {
      let best = null;
      dcaHotspots.forEach(dca => {
        const dist = map.distance([apiary.lat, apiary.lng], [dca.lat, dca.lng]);
        if (!best || dist < best.distanceMeters) best = { ...dca, distanceMeters: dist };
      });
      return best;
    }

    function getCountyNameForApiary(apiary) {
      if (!countiesGeoData || !Array.isArray(countiesGeoData.features)) return 'Unknown';
      const pt = turf.point([apiary.lng, apiary.lat]);

      for (const feature of countiesGeoData.features) {
        try {
          if (turf.booleanPointInPolygon(pt, feature)) {
            return (feature.properties && (feature.properties.NAME || feature.properties.name || feature.properties.county || feature.properties.County)) || 'Unknown';
          }
        } catch (err) {
          console.warn('County lookup failed for feature', err);
        }
      }
      return 'Unknown';
    }


    function closeMobileMenu() {
      if (window.innerWidth <= 900) {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('open');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
      }
    }

    function openMobileMenu() {
      if (window.innerWidth <= 900) {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('open');
        hamburgerBtn.setAttribute('aria-expanded', 'true');
      }
    }

    function renderFilteredApiaries() {
      clearMapAndList();
      const filtered = getFilteredSummaries();
      resultsCount.textContent = filtered.length + ' apiar' + (filtered.length === 1 ? 'y' : 'ies') + ' shown';

      filtered.forEach(({ apiary, forageRadiusMeters, bloomSummary }) => {
        const color = getMarkerColor(apiary);
        const nearestDca = ENABLE_DCA_FEATURES ? getNearestDca(apiary) : null;

        const bloomTopHtml = bloomSummary.groupedTypes.length
          ? '<table class="popup-mini-table">' +
              '<thead><tr><th>Type</th><th>% Ring</th><th>Score</th></tr></thead>' +
              '<tbody>' +
              bloomSummary.groupedTypes.slice(0, 5).map(areaType =>
                '<tr>' +
                  '<td>' + areaType.typeLabel + '</td>' +
                  '<td>' + areaType.percentOfRing.toFixed(1) + '%</td>' +
                  '<td>' + scoreToLabel(areaType.score) + '</td>' +
                '</tr>'
              ).join('') +
              '</tbody></table>'
          : '<div>No bloom-source polygons overlap this forage ring.</div>';

        const popupHtml =
          '<div>' +
            '<div class="apiary-title">' + (apiary.name || 'Unnamed Apiary') + '</div>' +
            '<div><strong>Owner:</strong> ' + (apiary.owner || 'Unknown') + '</div>' +
            '<div><strong>County:</strong> ' + getCountyNameForApiary(apiary) + '</div>' +
            '<div><strong>Hives:</strong> ' + (apiary.hives ?? 'N/A') + '</div>' +
            '<div><strong>Status:</strong> ' + (apiary.status || 'Unknown') + '</div>' +
            '<div><strong>Type:</strong> ' + (apiary.type || 'Unknown') + '</div>' +
            '<div><strong>Mite count:</strong> ' + (apiary.miteCount ?? 'N/A') + '</div>' +
            '<div><strong>Mite-biter:</strong> ' + (apiary.miteBiter === true ? 'Yes 🧬' : (apiary.miteBiter === false ? 'No' : 'N/A')) + '</div>' +
            '<div><strong>NYS inspected:</strong> ' + ((apiary.nysInspected === true) ? 'Yes' : (apiary.nysInspected === false ? 'No' : 'N/A')) + '</div>' +
            '<div><strong>Treated:</strong> ' + ((apiary.treated === true) ? 'Yes' : (apiary.treated === false ? 'No' : 'N/A')) + '</div>' +
            '<div><strong>Honey produced:</strong> ' + ((apiary.honeyProducedLbs == null) ? 'N/A' : apiary.honeyProducedLbs + ' lbs') + '</div>' +
            '<div><strong>Forage radius:</strong> ' + formatRadiusLabel(forageRadiusMeters) + '</div>' +

            (ENABLE_DCA_FEATURES ? '<div><strong>Nearest candidate DCA:</strong> ' + (nearestDca ? nearestDca.name + ' (' + (nearestDca.distanceMeters / 1000).toFixed(1) + ' km)' : 'None') + '</div>' : '') +

            '<div style="margin-top:8px;"><strong>Notes:</strong> ' + (apiary.notes || 'None') + '</div>' +
          '</div>';

        const forageCircle = L.circle([apiary.lat, apiary.lng], {
          radius: forageRadiusMeters,
          color: color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.12
        });

        if (showForageRings) forageCircle.addTo(map);
        forageCircles.push(forageCircle);

        const marker = L.marker([apiary.lat, apiary.lng], { icon: createDivIcon(color) }).addTo(map).bindPopup(popupHtml);
        marker.on('click', () => setActiveCard(apiary.id));

        markers.push(marker);
        markerMap.set(apiary.id, marker);

        const card = document.createElement('div');
        card.className = 'apiary-card';
        card.innerHTML =
          '<div class="apiary-card-header">' +
            '<div class="apiary-name">' + (apiary.name || 'Unnamed Apiary') + '</div>' +
            '<div class="pill-wrap">' +
              '<div class="status-pill"><span class="dot" style="background:' + (apiary.miteBiter ? '#1b5e20' : '#9e9e9e') + '"></span><span>' + (apiary.miteBiter ? 'Mite-biter' : 'Non-biter') + '</span></div>' +
              '<div class="status-pill"><span class="dot" style="background:' + (statusColors[apiary.status] || '#999') + '"></span><span>' + (apiary.status || 'Unknown') + '</span></div>' +
              '<div class="status-pill"><span class="dot" style="background:' + (typeColors[apiary.type] || color) + '"></span><span>' + (apiary.type || 'Unknown') + '</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="apiary-meta">' +
            '<div><strong>Owner:</strong> ' + (apiary.owner || 'Unknown') + '</div>' +
            '<div><strong>County:</strong> ' + getCountyNameForApiary(apiary) + '</div>' +
            '<div><strong>Hives:</strong> ' + (apiary.hives ?? 'N/A') + '</div>' +
            '<div><strong>Type:</strong> ' + (apiary.type || 'Unknown') + '</div>' +
            '<div><strong>Mite count:</strong> ' + (apiary.miteCount ?? 'N/A') + '</div>' +
            '<div><strong>NYS inspected:</strong> ' + ((apiary.nysInspected === true) ? 'Yes' : (apiary.nysInspected === false ? 'No' : 'N/A')) + '</div>' +
            '<div><strong>Treated:</strong> ' + ((apiary.treated === true) ? 'Yes' : (apiary.treated === false ? 'No' : 'N/A')) + '</div>' +
            '<div><strong>Honey produced:</strong> ' + ((apiary.honeyProducedLbs == null) ? 'N/A' : apiary.honeyProducedLbs + ' lbs') + '</div>' +
            '<div><strong>Forage:</strong> ' + formatRadiusLabel(forageRadiusMeters) + '</div>' +
            '<div>' + (apiary.notes || '') + '</div>' +
          '</div>' +
          '<div class="apiary-submeta">' +

            (ENABLE_DCA_FEATURES ? '<div><strong>Nearest candidate DCA:</strong> ' + (nearestDca ? nearestDca.name : 'None') + '</div>' : '') +
          '</div>';

        card.addEventListener('click', () => {
          const selectedMarker = markerMap.get(apiary.id);
          if (!selectedMarker) return;
          map.setView([apiary.lat, apiary.lng], 14, { animate: true });
          selectedMarker.openPopup();
          setActiveCard(apiary.id);
          closeMobileMenu();
        });

        listContainer.appendChild(card);
        cardMap.set(apiary.id, card);
      });

      const boundsLayers = [];
      if (markers.length > 0) boundsLayers.push(...markers);
      if (showForageRings && forageCircles.length > 0) boundsLayers.push(...forageCircles);
      if (ENABLE_DCA_FEATURES && showDcaLayer && dcaMarkers.length > 0) boundsLayers.push(...dcaMarkers);
      if (showBloomPolygons && bloomPolygonLayer) boundsLayers.push(bloomPolygonLayer);
      if (showMiteBiterInfluence && miteBiterInfluenceCircles.length > 0) boundsLayers.push(...miteBiterInfluenceCircles);

      if (boundsLayers.length > 0) {
        const featureGroup = L.featureGroup(boundsLayers);
        map.fitBounds(featureGroup.getBounds().pad(0.1));
      }
    }

    function showError(message) {
      listContainer.innerHTML =
        '<div class="apiary-card">' +
          '<div class="apiary-name">Unable to load apiaries</div>' +
          '<div class="apiary-meta" style="margin-top: 8px;">' + message + '</div>' +
        '</div>';
      resultsCount.textContent = '';
    }


    function clearMiteBiterInfluenceCircles() {
      miteBiterInfluenceCircles.forEach(circle => map.removeLayer(circle));
      miteBiterInfluenceCircles.length = 0;
    }

    function renderMiteBiterInfluence() {
      clearMiteBiterInfluenceCircles();
      if (!showMiteBiterInfluence) return;

      loadedApiaries
        .filter(apiary => apiary.miteBiter === true && typeof apiary.lat === 'number' && typeof apiary.lng === 'number')
        .forEach(apiary => {
          const circle = L.circle([apiary.lat, apiary.lng], {
            radius: miteBiterInfluenceRadiusMeters,
            color: '#1b5e20',
            weight: 2,
            dashArray: '6,6',
            fillColor: '#2e7d32',
            fillOpacity: 0.08
          }).bindPopup(
            '<div>' +
              '<div class="apiary-title">' + (apiary.name || 'Mite-biter yard') + '</div>' +
              '<div><strong>Overlay:</strong> Mite-biter influence zone</div>' +
              '<div><strong>Radius:</strong> ' + formatRadiusLabel(miteBiterInfluenceRadiusMeters) + '</div>' +
              '<div><strong>Owner:</strong> ' + (apiary.owner || 'Unknown') + '</div>' +
              '<div><strong>Type:</strong> ' + (apiary.type || 'Unknown') + '</div>' +
              '<div><strong>Mite-biter:</strong> Yes</div>' +            '</div>'
          );

          circle.addTo(map);
          miteBiterInfluenceCircles.push(circle);
        });
    }

    function refreshView() {
      buildApiarySummaries();
      if (ENABLE_LANDCOVER_FEATURES) renderBloomPolygonLayer();
      if (ENABLE_DCA_FEATURES) renderDcaLayer();
      renderMiteBiterInfluence();
      renderFilteredApiaries();
    }

    async function loadCountiesFromSupabase() {
      const selectColumns = [
        COUNTY_ID_COLUMN,
        COUNTY_NAME_COLUMN,
        COUNTY_GEOMETRY_COLUMN
      ].join(',');

      const { data, error } = await supabaseClient
        .from(COUNTY_TABLE)
        .select(selectColumns);

      if (error) {
        throw new Error('County database query failed: ' + error.message);
      }

      if (!Array.isArray(data)) {
        throw new Error('County database query did not return an array.');
      }

      const features = data
        .map(row => {
          let geometry = row[COUNTY_GEOMETRY_COLUMN];

          if (typeof geometry === 'string') {
            try {
              geometry = JSON.parse(geometry);
            } catch (error) {
              console.warn('Skipping county with invalid geometry JSON:', row, error);
              return null;
            }
          }

          if (!geometry || !geometry.type || !geometry.coordinates) {
            console.warn('Skipping county with missing geometry:', row);
            return null;
          }

          const countyName =
            row[COUNTY_NAME_COLUMN] ||
            row.NAME ||
            row.name ||
            row.county ||
            row.County ||
            'County';

          return {
            type: 'Feature',
            id: row[COUNTY_ID_COLUMN],
            properties: {
              id: row[COUNTY_ID_COLUMN],
              name: countyName,
              NAME: countyName
            },
            geometry
          };
        })
        .filter(Boolean);

      return {
        type: 'FeatureCollection',
        features
      };
    }

    async function loadData() {
      try {
        const [apiaryResponse, countiesGeoJson] = await Promise.all([
          fetch('./apiaries.json'),
          loadCountiesFromSupabase()
        ]);

        if (!apiaryResponse.ok) {
          throw new Error('HTTP ' + apiaryResponse.status + ' while loading apiaries.json');
        }

        const apiaries = await apiaryResponse.json();

        if (!Array.isArray(apiaries)) {
          throw new Error('apiaries.json must contain a JSON array.');
        }
        if (!countiesGeoJson || countiesGeoJson.type !== 'FeatureCollection' || !Array.isArray(countiesGeoJson.features)) {
          throw new Error('County database query must produce a GeoJSON FeatureCollection.');
        }

        loadedApiaries = apiaries;
        bloomAreaData = { type: 'FeatureCollection', features: [] };
        countiesGeoData = countiesGeoJson;

        if (ENABLE_LANDCOVER_FEATURES) {
          loadCustomBloomPolygons();
          loadCustomBloomData();
          refreshCustomBloomEditLayer();
        }
        renderCountyBaseLayer();
        populateOwnerFilter();
        populateCountyFilter();
        refreshView();
      } catch (error) {
        console.error('Failed to load map data:', error);
        showError(
          'Could not load the map data. Confirm apiaries.json is available and that the Supabase counties table and RLS policy are configured. ' +
          'Details: ' + error.message
        );
      }
    }

    foragePresetSelect.addEventListener('change', () => {
      currentForagePresetMeters = Number(foragePresetSelect.value);
      refreshView();
    });

    showForageRingsCheckbox.addEventListener('change', () => {
      showForageRings = showForageRingsCheckbox.checked;
      renderFilteredApiaries();
    });

    if (ENABLE_LANDCOVER_FEATURES) seasonSelect.addEventListener('change', () => {
      currentSeason = seasonSelect.value;
      refreshView();
    });

    if (ENABLE_DCA_FEATURES) showDcaLayerCheckbox.addEventListener('change', () => {
      showDcaLayer = showDcaLayerCheckbox.checked;
      renderDcaLayer();
      renderFilteredApiaries();
    });


    showMiteBiterInfluenceCheckbox.addEventListener('change', () => {
      showMiteBiterInfluence = showMiteBiterInfluenceCheckbox.checked;
      renderMiteBiterInfluence();
      renderFilteredApiaries();
    });

    miteBiterInfluenceRadiusSelect.addEventListener('change', () => {
      miteBiterInfluenceRadiusMeters = Number(miteBiterInfluenceRadiusSelect.value);
      renderMiteBiterInfluence();
      renderFilteredApiaries();
    });

    if (ENABLE_LANDCOVER_FEATURES) showBloomPolygonsCheckbox.addEventListener('change', () => {
      showBloomPolygons = showBloomPolygonsCheckbox.checked;
      renderBloomPolygonLayer();
      renderFilteredApiaries();
    });

    map.on('zoomend', () => {
      if (countyLabelLayer) {
        if (map.getZoom() >= countyLabelMinZoom) {
          map.addLayer(countyLabelLayer);
          updateCountyLabelSizes();
        } else {
          map.removeLayer(countyLabelLayer);
        }
      }
      if (ENABLE_LANDCOVER_FEATURES) renderBloomPolygonLayer();
    });

    if (ENABLE_DCA_FEATURES) dcaFilter.addEventListener('change', () => {
      renderDcaLayer();
      renderFilteredApiaries();
    });

    [searchInput, ownerFilter, statusFilter, countyFilter, bloomFilter, typeFilter, minHivesFilter, treatedFilter, inspectedFilter, miteThresholdFilter, miteBiterFilter].forEach(el => {
      el.addEventListener('input', renderFilteredApiaries);
      el.addEventListener('change', renderFilteredApiaries);
    });

    resetFiltersBtn.addEventListener('click', () => {
      searchInput.value = '';
      ownerFilter.value = '';
      statusFilter.value = '';
      countyFilter.value = '';
      bloomFilter.value = '';
      typeFilter.value = '';
      minHivesFilter.value = '';
      treatedFilter.value = '';
      inspectedFilter.value = '';
      miteThresholdFilter.value = '';
      miteBiterFilter.value = '';
      dcaFilter.value = '';
      if (ENABLE_DCA_FEATURES) renderDcaLayer();
      renderFilteredApiaries();
    });

    hamburgerBtn.addEventListener('click', () => {
      const isOpen = sidebar.classList.contains('open');
      if (isOpen) closeMobileMenu();
      else openMobileMenu();
    });

    sidebarOverlay.addEventListener('click', closeMobileMenu);

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('open');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
      }
    });


    if (ENABLE_LANDCOVER_FEATURES) map.on(L.Draw.Event.CREATED, function(event) {
      const layer = event.layer;
      const props = promptForCustomBloomProperties();
      if (!props) return;
      const feature = normalizeCustomBloomFeature(layer.toGeoJSON());
      feature.properties = props;
      layer.feature = feature;
      layer.setStyle(createCustomBloomStyle(feature));
      layer.bindPopup(
        '<div>' +
          '<div class="apiary-title">' + getFeatureDisplayLabel(feature) + '</div>' +
          '<div><strong>Custom override:</strong> Yes</div>' +
          '<div><strong>Forage type:</strong> ' + feature.properties.forage_type + '</div>' +
          '<div><strong>Bloom potential:</strong> ' + scoreToLabel(feature.properties.bloom_score) + '</div>' +
        '</div>'
      );
      customBloomEditLayer.addLayer(layer);
      saveCustomBloomPolygons();
      refreshView();
    });

    if (ENABLE_LANDCOVER_FEATURES) map.on(L.Draw.Event.EDITED, function(event) {
      event.layers.eachLayer(function(layer) {
        if (layer.feature) {
          layer.feature = normalizeCustomBloomFeature(layer.toGeoJSON());
        }
      });
      saveCustomBloomPolygons();
      refreshView();
    });

    if (ENABLE_LANDCOVER_FEATURES) map.on(L.Draw.Event.DELETED, function() {
      saveCustomBloomPolygons();
      refreshView();
    });

    if (ENABLE_LANDCOVER_FEATURES) exportCustomBloomBtn.addEventListener('click', () => {
      saveCustomBloomPolygons();
      const blob = new Blob([JSON.stringify(customBloomData, null, 2)], { type: 'application/geo+json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'custom-bloom-overrides.geojson';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    if (ENABLE_LANDCOVER_FEATURES) clearCustomBloomBtn.addEventListener('click', () => {
      if (!window.confirm('Clear all custom bloom override polygons?')) return;
      customBloomEditLayer.clearLayers();
      customBloomData = { type: 'FeatureCollection', features: [] };
      localStorage.removeItem(CUSTOM_BLOOM_STORAGE_KEY);
      refreshView();
    });

    requireSupabaseSession();
