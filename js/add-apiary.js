(() => {
  'use strict';

  let map;
  let marker;
  let client;

  const form = document.getElementById('apiaryForm');
  const formMessage = document.getElementById('formMessage');
  const submitButton = document.getElementById('submitButton');
  const countySelect = document.getElementById('countySelect');
  const privateLat = document.getElementById('privateLat');
  const privateLng = document.getElementById('privateLng');
  const locationText = document.getElementById('locationText');

  function setLocation(lat, lng) {
    privateLat.value = Number(lat).toFixed(7);
    privateLng.value = Number(lng).toFixed(7);
    locationText.textContent = `Private point selected: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;

    if (!marker) {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', event => {
        const point = event.target.getLatLng();
        setLocation(point.lat, point.lng);
      });
    } else {
      marker.setLatLng([lat, lng]);
    }
  }

  function initMap() {
    map = L.map('locationMap').setView([42.75, -74.0], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    map.on('click', event => setLocation(event.latlng.lat, event.latlng.lng));
  }

  async function loadCounties() {
    const { data, error } = await client
      .from(window.MVBK_CONFIG.COUNTY_TABLE || 'counties')
      .select(window.MVBK_CONFIG.COUNTY_NAME_COLUMN || 'name')
      .order(window.MVBK_CONFIG.COUNTY_NAME_COLUMN || 'name');

    if (error) throw error;

    const column = window.MVBK_CONFIG.COUNTY_NAME_COLUMN || 'name';
    const names = [...new Set((data || []).map(row => row[column]).filter(Boolean))];

    countySelect.innerHTML =
      '<option value="">Choose a county</option>' +
      names.map(name => `<option value="${MVBKPortal.escapeHtml(name)}">${MVBKPortal.escapeHtml(name)}</option>`).join('');
  }

  function nullableNumber(value) {
    return value === '' ? null : Number(value);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    formMessage.textContent = '';

    if (!form.reportValidity()) return;
    if (!privateLat.value || !privateLng.value) {
      formMessage.textContent = 'Select the private apiary location on the map.';
      return;
    }

    const values = new FormData(form);
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting…';

    try {
      const payload = {
        p_apiary_name: values.get('apiary_name').trim(),
        p_owner_display_name: values.get('owner_display_name').trim(),
        p_yard_type: values.get('yard_type'),
        p_county_name: values.get('county_name'),
        p_hive_count: Number(values.get('hive_count')),
        p_mite_count: nullableNumber(values.get('mite_count')),
        p_treated: values.get('treated') === 'true',
        p_nys_inspected: values.get('nys_inspected') === 'true',
        p_mite_biter: values.get('mite_biter') === 'true',
        p_honey_produced_lbs: nullableNumber(values.get('honey_produced_lbs')),
        p_private_lat: Number(privateLat.value),
        p_private_lng: Number(privateLng.value)
      };

      const { error } = await client.rpc('submit_apiary', payload);
      if (error) throw error;

      formMessage.textContent = 'Apiary submitted for approval.';
      form.reset();
      privateLat.value = '';
      privateLng.value = '';
      locationText.textContent = 'No location selected.';
      if (marker) {
        map.removeLayer(marker);
        marker = null;
      }

      setTimeout(() => {
        window.location.href = './my-apiaries.html';
      }, 900);
    } catch (error) {
      console.error(error);
      formMessage.textContent = 'Submission failed: ' + error.message;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit for approval';
    }
  });

  document.getElementById('useLocationButton').addEventListener('click', () => {
    if (!navigator.geolocation) {
      formMessage.textContent = 'This browser does not support location services.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        map.setView([latitude, longitude], 16);
        setLocation(latitude, longitude);
      },
      error => {
        formMessage.textContent = 'Could not get your location: ' + error.message;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  MVBKPortal.initPage()
    .then(async context => {
      client = context.client;
      initMap();
      await loadCounties();
    })
    .catch(MVBKPortal.showFatalError);
})();
