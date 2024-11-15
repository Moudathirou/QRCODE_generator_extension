// db.js
const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',      // Replace with your MySQL host
  user: 'your_username',  // Replace with your MySQL username
  password: 'your_password', // Replace with your MySQL password
  database: 'your_database'  // Replace with your MySQL database name
});

connection.connect((err) => {
  if (err) throw err;
  console.log('Connected to MySQL Database');
});

module.exports = connection;
