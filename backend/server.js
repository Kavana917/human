const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

let latestIMU = {
    pitch: 0, roll: 0,
    ax: 0, ay: 0, az: 0,
    gx: 0, gy: 0, gz: 0
};

// Start the Python Graphing Engine child process
const pythonLogicPath = path.join(__dirname, 'logic', 'app.py');
const pyProcess = spawn('python', [pythonLogicPath]);

pyProcess.stdout.on('data', (data) => {
    console.log(`[Python]: ${data.toString().trim()}`);
});

pyProcess.stderr.on('data', (data) => {
    console.error(`[Python stderr]: ${data.toString().trim()}`);
});

pyProcess.on('close', (code) => {
    console.log(`[Python] process exited with code ${code}`);
});

// Auto-cleanup child process if Node closes
process.on('SIGINT', () => {
    pyProcess.kill();
    process.exit();
});

process.on('SIGTERM', () => {
    pyProcess.kill();
    process.exit();
});

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
    console.log(`[Node] Relay Server running on port ${PORT}`);
    console.log(`[Node] Automatically spawned Python logic server in the background!`);
});