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

