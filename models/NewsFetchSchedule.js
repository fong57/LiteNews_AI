// models/NewsFetchSchedule.js
const mongoose = require('mongoose');

// Single document: scheduleHours[0..23] = whether to run auto news fetch at that hour (local time).
const defaultSchedule = Array(24).fill(false);

const newsFetchScheduleSchema = new mongoose.Schema({
  scheduleHours: {
    type: [Boolean],
    default: defaultSchedule,
    validate: {
      validator: (v) => Array.isArray(v) && v.length === 24,
      message: 'scheduleHours must be an array of 24 booleans (one per hour 0-23)'
    }
  },
  lastRunAt: {
    type: Date
  }
}, {
  timestamps: true
});

newsFetchScheduleSchema.statics.getSchedule = async function () {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({ scheduleHours: [...defaultSchedule] });
  }
  return doc;
};

const NewsFetchSchedule = mongoose.models.NewsFetchSchedule || mongoose.model('NewsFetchSchedule', newsFetchScheduleSchema);
module.exports = NewsFetchSchedule;
