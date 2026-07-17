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
