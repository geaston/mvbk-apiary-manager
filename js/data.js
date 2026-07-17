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

