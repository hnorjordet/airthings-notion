// netlify/functions/airthings-dual.js
exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Get credentials from environment variables
    const clientId = process.env.AIRTHINGS_CLIENT_ID;
    const clientSecret = process.env.AIRTHINGS_CLIENT_SECRET;
    const officeDeviceId = process.env.AIRTHINGS_DEVICE_ID;
    const bedroomDeviceId = process.env.AIRTHINGS_BEDROOM_DEVICE_ID;

    if (!clientId || !clientSecret || !officeDeviceId) {
      throw new Error('Missing API credentials');
    }

    // Step 1: Get access token
    const tokenResponse = await fetch('https://accounts-api.airthings.com/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'read:device:current_values'
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token request failed:', errorText);
      throw new Error(`Token request failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw new Error('No access token received');
    }

    // Step 2: Fetch data from both devices
    const fetchDeviceData = async (deviceId) => {
      if (!deviceId) return null;
      
      try {
        const deviceResponse = await fetch(`https://ext-api.airthings.com/v1/devices/${deviceId}/latest-samples`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        });

        if (!deviceResponse.ok) {
          console.error(`Device ${deviceId} request failed:`, deviceResponse.status);
          return null;
        }

        const deviceData = await deviceResponse.json();
        return deviceData.data;
      } catch (error) {
        console.error(`Error fetching device ${deviceId}:`, error);
        return null;
      }
    };

    // Fetch both devices
    const [officeRawData, bedroomRawData] = await Promise.all([
      fetchDeviceData(officeDeviceId),
      fetchDeviceData(bedroomDeviceId)
    ]);

    // Transform office data (View Plus - has all sensors)
    const officeData = officeRawData ? {
      humidity: {
        level: officeRawData.humidity || 0,
        rating: getHumidityRating(officeRawData.humidity || 0)
      },
      co2: {
        level: officeRawData.co2 || 0,
        rating: getCO2Rating(officeRawData.co2 || 0)
      },
      radon: {
        level: officeRawData.radonShortTermAvg || 0,
        rating: getRadonRating(officeRawData.radonShortTermAvg || 0)
      },
      voc: {
        level: officeRawData.voc || 0,
        rating: getVOCRating(officeRawData.voc || 0)
      },
      pm25: {
        level: officeRawData.pm25 || 0,
        rating: getPM25Rating(officeRawData.pm25 || 0)
      },
      temperature: {
        level: officeRawData.temp || 0
      }
    } : null;

    // Transform bedroom data (Wave Enhance - different sensors)
    const bedroomData = bedroomRawData ? {
      humidity: {
        level: bedroomRawData.humidity || 0,
        rating: getHumidityRating(bedroomRawData.humidity || 0)
      },
      co2: {
        level: bedroomRawData.co2 || 0,
        rating: getCO2Rating(bedroomRawData.co2 || 0)
      },
      voc: {
        level: bedroomRawData.voc || 0,
        rating: getVOCRating(bedroomRawData.voc || 0)
      },
      temperature: {
        level: bedroomRawData.temp || 0
      },
      // Wave Enhance specific sensors
      pressure: {
        level: bedroomRawData.pressure || 0
      },
      // Note: noise and light sensors may have different property names
      // Check actual API response and adjust accordingly
    } : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        office: officeData,
        bedroom: bedroomData,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch air quality data',
        details: error.message 
      })
    };
  }
};

// Rating functions based on common air quality standards
function getHumidityRating(humidity) {
  if (humidity >= 30 && humidity <= 60) return 'Good';
  if (humidity >= 25 && humidity <= 70) return 'Fair';
  return 'Poor';
}

function getCO2Rating(co2) {
  if (co2 <= 800) return 'Good';
  if (co2 <= 1000) return 'Fair';
  return 'Poor';
}

function getRadonRating(radon) {
  if (radon <= 100) return 'Good';
  if (radon <= 200) return 'Fair';
  return 'Poor';
}

function getVOCRating(voc) {
  if (voc <= 250) return 'Good';
  if (voc <= 2000) return 'Fair';
  return 'Poor';
}

function getPM25Rating(pm25) {
  if (pm25 <= 10) return 'Good';
  if (pm25 <= 25) return 'Fair';
  return 'Poor';
}