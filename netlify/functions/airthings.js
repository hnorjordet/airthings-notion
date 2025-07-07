// netlify/functions/airthings.js
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
    const deviceId = process.env.AIRTHINGS_DEVICE_ID;

    if (!clientId || !clientSecret) {
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

    // Step 2: Get device data
    const deviceResponse = await fetch(`https://ext-api.airthings.com/v1/devices/${deviceId}/latest-samples`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!deviceResponse.ok) {
      const errorText = await deviceResponse.text();
      console.error('Device request failed:', errorText);
      throw new Error(`Device request failed: ${deviceResponse.status}`);
    }

    const deviceData = await deviceResponse.json();
    console.log('Raw device data:', deviceData);

    // Step 3: Transform data to match widget format
    const transformedData = {
      humidity: {
        level: deviceData.data?.humidity || 0,
        rating: getHumidityRating(deviceData.data?.humidity || 0)
      },
      co2: {
        level: deviceData.data?.co2 || 0,
        rating: getCO2Rating(deviceData.data?.co2 || 0)
      },
      radon: {
        level: deviceData.data?.radonShortTermAvg || 0,
        rating: getRadonRating(deviceData.data?.radonShortTermAvg || 0)
      },
      voc: {
        level: deviceData.data?.voc || 0,
        rating: getVOCRating(deviceData.data?.voc || 0)
      },
      pm25: {
        level: deviceData.data?.pm25 || 0,
        rating: getPM25Rating(deviceData.data?.pm25 || 0)
      },
      temperature: {
        level: deviceData.data?.temp || 0
      },
      timestamp: new Date().toISOString()
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(transformedData)
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
