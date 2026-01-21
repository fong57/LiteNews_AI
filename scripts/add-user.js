const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

// Load environment variables
dotenv.config(); // Load environment variables from .env file

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI is not set in .env file');
  process.exit(1);
}

// Generate unique test email with timestamp
const testEmail = `test-db-validation-${Date.now()}@test.com`;
const testData = {
  name: 'Test User',
  email: testEmail,
  password: 'testpassword123', // Simple password for test (will be stored as-is in test)
};

async function testDatabaseWrite() {
  let testUser = null;
  
  try {
    // Step 1: Connect to MongoDB Atlas
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB Atlas\n');

    // Step 2: Perform write test
    console.log('Writing test document to database...');
    testUser = new User(testData);
    await testUser.save();
    console.log(`✓ Test user created with ID: ${testUser._id}\n`);

    // Step 3: Perform read test
    console.log('Reading test document from database...');
    const foundUser = await User.findById(testUser._id);
    
    if (!foundUser) {
      throw new Error('Test document not found after write');
    }
    
    if (foundUser.name !== testData.name || foundUser.email !== testData.email) {
      throw new Error('Test document data does not match written data');
    }
    
    console.log(`✓ Test document retrieved successfully`);
    console.log(`  - Name: ${foundUser.name}`);
    console.log(`  - Email: ${foundUser.email}\n`);


    // Success
    console.log('═══════════════════════════════════════');
    console.log('✓ Database write test PASSED');
    console.log('═══════════════════════════════════════');
    
    process.exit(0);
  } catch (error) {
    console.error('\n═══════════════════════════════════════');
    console.error('✗ Database write test FAILED');
    console.error('═══════════════════════════════════════');
    console.error('Error:', error.message);
    
    // Attempt cleanup on error
    if (testUser && testUser._id) {
      try {
        console.log('\nAttempting to clean up test document...');
        await User.findByIdAndDelete(testUser._id);
        console.log('✓ Cleanup completed');
      } catch (cleanupError) {
        console.error('⚠ Cleanup failed:', cleanupError.message);
      }
    }
    
    process.exit(1);
  } finally {
    // Close database connection
    try {
      await mongoose.connection.close();
      console.log('\nDatabase connection closed');
    } catch (closeError) {
      console.error('Error closing connection:', closeError.message);
    }
  }
}

// Run the test
testDatabaseWrite();

