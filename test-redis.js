// Quick Redis connection test
const Redis = require('ioredis');
require('dotenv').config({ path: '.env.local' });

const redisUrl = process.env.REDIS_URL;
console.log('🔗 Redis URL format:', redisUrl);

// Handle different Redis URL formats
const redis = redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://') 
  ? new Redis(redisUrl) 
  : new Redis({
      host: redisUrl.split(':')[0],
      port: parseInt(redisUrl.split(':')[1]),
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null
    });

async function testRedis() {
  try {
    console.log('🔌 Testing Redis connection...');
    
    // Test basic connection
    const result = await redis.ping();
    console.log('✅ Redis PING:', result);
    
    // Test set/get
    await redis.set('test', 'hello');
    const value = await redis.get('test');
    console.log('✅ Redis SET/GET:', value);
    
    // Clean up
    await redis.del('test');
    
    console.log('🎉 Redis connection successful!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    process.exit(1);
  }
}

testRedis();