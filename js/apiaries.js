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


