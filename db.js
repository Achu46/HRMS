require("dotenv").config();
const mysql = require("mysql2");

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
})

db.connect((err) => {
    if (err) {
        console.error("⚠️ Database has not connected");
    } else {
        console.log("✅ Database is connected Successfully");
    }
})

module.exports=db;