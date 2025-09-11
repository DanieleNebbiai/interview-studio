// Test script per controllare l'API Daily.co
require('dotenv').config()

console.log('Daily API Key check:')
console.log('Key exists:', !!process.env.DAILY_API_KEY)
console.log('Key length:', process.env.DAILY_API_KEY?.length)
console.log('Key starts with:', process.env.DAILY_API_KEY?.substring(0, 10) + '...')

// Test API call
async function testDailyAPI() {
  try {
    const response = await fetch('https://api.daily.co/v1/recordings?room_name=room-434001-4wl', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
      },
    })
    
    console.log('Status:', response.status)
    console.log('StatusText:', response.statusText)
    
    const data = await response.json()
    console.log('Data:', JSON.stringify(data, null, 2))
    
  } catch (error) {
    console.error('Error:', error)
  }
}

testDailyAPI()