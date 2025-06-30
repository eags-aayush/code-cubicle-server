import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import fetch from 'node-fetch';
import 'dotenv/config';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

const app = express();
const port = 3000;

const LOCATIONIQ_API_KEY = process.env.LOCATION;

// ✅ Middleware
app.use(cors());
app.use(express.json());

// ✅ MongoDB Connection
mongoose.connect('mongodb+srv://aayushladdha001:BoMb6291@cluster0.xij51sp.mongodb.net/webhookdb', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ✅ Mongoose Schema & Model
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

// ✅ Geocoding Function (optional use)
async function geocodeAddress(address) {
  if (!address || address === 'Not provided') return null;

  const cleanAddress = address.trim().replace(/\s+/g, ' ');
  const url = `https://us1.locationiq.com/v1/search.php?key=${LOCATIONIQ_API_KEY}&q=${encodeURIComponent(cleanAddress)}&format=json&countrycodes=in&limit=1`;

  console.log('🌐 Geocoding:', cleanAddress);

  try {
    const res = await fetch(url);
    const data = await res.json();

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

// ✅ POST: Save Webhook Data
app.post('/data', async (req, res) => {
  try {
    const body = req.body;
    const callDateTime = body.call_date?.split(' ') || [];
    const extracted = body.call_report?.extracted_variables || {};

    const incident = new Incident({
      date: callDateTime[0] || '',
      time: callDateTime[1] || '',
      incident_type: extracted.incident_type || '',
      location: extracted.location || '',
      caller_name: extracted.caller_name || '',
      issue_description: extracted.issue_description || '',
      incident_time: extracted.incident_time || '',
      resolved: false
    });

    await incident.save();
    console.log('✅ Incident saved:', incident);

    // Optional: make the API call only if save was successful
    const token = process.env.VITE_AUTH_TOKEN;  // or hardcoded for now

    const fetchRes = await fetch("https://backend.omnidim.io/api/v1/calls/dispatch", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agent_id: 3035,
        to_number: +916291337240,
        call_context: {
          date: incident.date,
          time: incident.time,
          location: incident.location,
          description: incident.issue_description,
          incident_time: incident.incident_time
        }
      })
    });

    const fetchData = await fetchRes.json();
    console.log("📞 Call dispatch response:", fetchData);

    res.status(200).json({ message: 'Data saved and call dispatched' });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ GET: All Reports with Coordinates
app.get('/get-reports', async (req, res) => {
  try {
    const reports = await Incident.find({ resolved: false });
    const enrichedReports = [];

    for (const report of reports) {
      const coords = await geocodeAddress(report.location);
      enrichedReports.push({
        ...report._doc,
        coordinates: coords
      });

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    res.json(enrichedReports);
  } catch (error) {
    console.error('❌ Error fetching reports:', error.message);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// ✅ GET: Dashboard Stats Summary
app.get('/stats', async (req, res) => {
  try {
    const totalIssues = await Incident.countDocuments({ incident_type: 'Issue' });
    const solvedIssues = await Incident.countDocuments({ incident_type: 'Issue', resolved: true });

    const totalSuggestions = await Incident.countDocuments({ incident_type: 'Suggestion' });
    const solvedSuggestions = await Incident.countDocuments({ incident_type: 'Suggestion', resolved: true });

    const emergencyReported = await Incident.countDocuments({ incident_type: 'Emergency' });

    res.json({
      totalIssues,
      solvedIssues,
      totalSuggestions,
      solvedSuggestions,
      emergencyReported
    });
  } catch (err) {
    console.error('❌ Error getting stats:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ✅ PUT: Update Resolved Status by ID
app.put('/info/:id', async (req, res) => {
  try {
    const { resolved } = req.body;
    const updated = await Incident.findByIdAndUpdate(req.params.id, { resolved }, { new: true });

    if (!updated) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error updating incident:', error.message);
    res.status(500).send(error);
  }
});

app.get('/info', async (req, res) => {
  try {
    const allIncidents = await Incident.find({});
    res.json(allIncidents);
  } catch (err) {
    console.error('❌ Error in /info:', err.message);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

// ✅ Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
