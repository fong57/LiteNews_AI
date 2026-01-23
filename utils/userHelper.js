// utils/userHelper.js
const mongoose = require('mongoose');
const User = require('../models/User');

/**
 * Find user by ID or name
 * If userId is a valid ObjectId, find by ID
 * Otherwise, find by name
 * 
 * @param {string} userId - User ID (ObjectId) or user name
 * @returns {Promise<Object|null>} User document or null if not found
 */
async function findUserByIdOrName(userId) {
  if (!userId) {
    return null;
  }

  // Check if userId is a valid ObjectId
  if (mongoose.Types.ObjectId.isValid(userId) && userId.length === 24) {
    const user = await User.findById(userId);
    if (user) {
      return user;
    }
  }

  // If not found by ID or not a valid ObjectId, try finding by name
  const user = await User.findOne({ name: userId });
  
  if (!user && userId === 'admin') {
    // Provide helpful error message for admin user
    console.warn(`Warning: User "admin" not found. Please create an admin user with name "admin" in the database.`);
  }
  
  return user;
}

module.exports = {
  findUserByIdOrName
};
