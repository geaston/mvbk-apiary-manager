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

