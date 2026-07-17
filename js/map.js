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

