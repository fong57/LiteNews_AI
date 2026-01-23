const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function generateAdminJSON() {
  try {
    console.log('Generating admin user JSON for MongoDB Compass import...\n');
    
    // Hash the password
    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create admin user document
    const adminUser = {
      name: 'admin',
      password: hashedPassword,
      role: 'ADMIN',
      email: '',
      preferences: {
        sources: [],
        categories: ['general', 'technology', 'politics', 'business', 'sports'],
        defaultTimeframe: '24h'
      },
      topicPreferences: {
        likedTopics: [],
        dislikedTopics: [],
        topicScores: {}
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Convert to JSON array (MongoDB Compass expects array format)
    const jsonArray = [adminUser];
    
    // Write to file in project root
    const outputPath = path.join(__dirname, '..', 'admin-user.json');
    fs.writeFileSync(outputPath, JSON.stringify(jsonArray, null, 2));
    
    console.log('✅ JSON file created successfully!');
    console.log(`📄 File location: ${outputPath}\n`);
    console.log('📝 Import Instructions for MongoDB Compass:');
    console.log('   1. Open MongoDB Compass');
    console.log('   2. Connect to your MongoDB Atlas cluster');
    console.log('   3. Select your database (or create "litenews" if it doesn\'t exist)');
    console.log('   4. Click on "users" collection (or create it if it doesn\'t exist)');
    console.log('   5. Click "Add Data" → "Import File"');
    console.log('   6. Select the file: admin-user.json');
    console.log('   7. Choose format: JSON');
    console.log('   8. Click "Import"\n');
    console.log('🔐 Admin credentials:');
    console.log('   Username: admin');
    console.log('   Password: admin123\n');
    
    // Also create a single document version (alternative format)
    const singleDocPath = path.join(__dirname, '..', 'admin-user-single.json');
    fs.writeFileSync(singleDocPath, JSON.stringify(adminUser, null, 2));
    console.log(`📄 Alternative single-document format: ${singleDocPath}\n`);
    
  } catch (error) {
    console.error('❌ Error generating JSON:', error.message);
    process.exit(1);
  }
}

generateAdminJSON();
