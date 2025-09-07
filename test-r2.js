// Quick R2 connection test
const { S3Client, ListBucketsCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: '.env.local' });

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

async function testR2() {
  try {
    console.log('☁️ Testing R2 connection...');
    console.log('Endpoint:', process.env.R2_ENDPOINT);
    console.log('Bucket:', process.env.R2_BUCKET_NAME);
    
    // Test bucket access (instead of listing all buckets)
    const { HeadBucketCommand } = require('@aws-sdk/client-s3');
    const headCommand = new HeadBucketCommand({
      Bucket: process.env.R2_BUCKET_NAME
    });
    await s3Client.send(headCommand);
    console.log('✅ R2 bucket access successful!');
    
    // Test upload
    const testKey = `test-${Date.now()}.txt`;
    const putCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: testKey,
      Body: 'Hello from Interview Studio!',
      ContentType: 'text/plain'
    });
    
    await s3Client.send(putCommand);
    console.log('✅ Test file uploaded successfully!');
    
    console.log('🎉 R2 setup working perfectly!');
    
  } catch (error) {
    console.error('❌ R2 connection failed:', error.message);
    console.error('Details:', error);
  }
}

testR2();