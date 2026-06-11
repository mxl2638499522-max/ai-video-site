// Netlify Function - wraps Express server
const serverless = require('serverless-http');
const app = require('../../server');
exports.handler = serverless(app);
