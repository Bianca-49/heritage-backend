const mysql = require('mysql2');
const fs = require('fs');
require('dotenv').config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: {
    ca: fs.readFileSync(__dirname + '/DigiCertGlobalRootCA.crt.pem')
  }
});

module.exports = db;
