const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

let latestIMU = {
    pitch: 0, roll: 0,
    ax: 0, ay: 0, az: 0,
    gx: 0, gy: 0, gz: 0
};

// Receive data from ESP32
app.post('/update', (req, res) => {
    latestIMU = req.body;
    // Log to console so you know it's working
    console.log(`P: ${latestIMU.pitch.toFixed(2)} | R: ${latestIMU.roll.toFixed(2)}`);
    res.status(200).send("OK");
});

// Send data to Frontend
app.get('/data', (req, res) => {
    res.json(latestIMU);
});

const PORT = 7777;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});