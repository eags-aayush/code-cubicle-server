const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));


const app = express();
const port = 3000;

// 🔑 Replace this with your actual LocationIQ API key
const LOCATIONIQ_API_KEY = 'pk.dd82e50dab62e8671c15878a51a18046';

// ✅ MongoDB connection
mongoose.connect('mongodb://localhost:27017/webhookdb', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ✅ Mongoose Schema
const incidentSchema = new mongoose.Schema({
  date: String,
  time: String,
  incident_type: String,
  location: String,
  caller_name: String,
  issue_description: String,
  incident_time: String,
  resolved: Boolean
});

const Incident = mongoose.model('Incident', incidentSchema, 'incidents');

// ✅ Middleware
app.use(cors());
app.use(express.json());

// ✅ Geocode function using LocationIQ
async function geocodeAddress(address) {
  if (!address || address === 'Not provided') return null;

  const cleanAddress = address.trim().replace(/\s+/g, ' ');
  const url = `https://us1.locationiq.com/v1/search.php?key=${LOCATIONIQ_API_KEY}&q=${encodeURIComponent(cleanAddress)}&format=json&countrycodes=in&limit=1`;

  console.log('🌐 Geocoding:', cleanAddress);

  try {
    const res = await fetch(url);
    const data = await res.json();

    console.log('📦 Response from LocationIQ:', data);

    if (!Array.isArray(data) || data.length === 0) return null;

    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon)
    };
  } catch (err) {
    console.error(`❌ Error geocoding "${address}":`, err.message);
    return null;
  }
}


// ✅ POST endpoint to save webhook data
app.post('/data', async (req, res) => {
  try {
    const body = req.body;
    const callDateTime = body.call_date?.split(' ');
    const extracted = body.call_report?.extracted_variables || {};

    const incident = new Incident({
      date: callDateTime?.[0] || '',
      time: callDateTime?.[1] || '',
      incident_type: extracted.incident_type || '',
      location: extracted.location || '',
      caller_name: extracted.caller_name || '',
      issue_description: extracted.issue_description || '',
      incident_time: extracted.incident_time || '',
      resolved: false
    });

    await incident.save();
    console.log('✅ Incident saved:', incident);
    res.status(200).json({ message: 'Data saved to database' });
  } catch (error) {
    console.error('❌ Error saving incident:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ GET endpoint to fetch all reports with geocoded coordinates
app.get('/get-reports', async (req, res) => {
  try {
    const reports = await Incident.find({});

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const enrichedReports = [];

    for (let i = 0; i < reports.length; i++) {
      const report = reports[i];
      const coords = await geocodeAddress(report.location);

      console.log(`📌 Report #${i + 1}: ${report.location}`);
      console.log(`📍 Coordinates:`, coords);

      enrichedReports.push({
        ...report._doc,
        coordinates: coords
      });

      await delay(500); // Wait 500ms to avoid rate limit
    }

    res.json(enrichedReports);
  } catch (error) {
    console.error('❌ Error fetching reports:', error.message);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// ✅ Start the server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
