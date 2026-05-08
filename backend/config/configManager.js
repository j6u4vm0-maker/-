const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
let config = { GEMINI_API_KEY: '' };

// Load initial config
if (fs.existsSync(CONFIG_PATH)) {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.error('Error reading config.json:', err.message);
  }
}

const getConfig = () => config;

const updateConfig = (newConfig) => {
  config = { ...config, ...newConfig };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  return config;
};

module.exports = {
  getConfig,
  updateConfig,
  CONFIG_PATH
};
