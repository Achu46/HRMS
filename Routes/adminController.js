require("dotenv").config();
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../db.js")
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const mysql = require('mysql2/promise');
const ExcelJS = require('exceljs');
// const multer = require("multer");

const sender = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_ID,
        pass: process.env.GMAIL_PASSKEY
    }
})

// Signup page
router.post("/admin_signup", async (req, res) => {
    const {
        name, email, password, companyName,
        industry, companyMail, companyPhone,
        headquarters, establishYear, numberofEmployees
    } = req.body;

    // Hashing Password
    const hashed_password = await bcrypt.hash(password, 10);

    // Phone Number Validation
    if (companyPhone.length !== 10) {
        return res.status(400).json({ message: "The Phone Number should be in 10 digit" });
    } else if (!["6", "7", "8", "9"].includes(companyPhone[0])) {
        return res.status(400).json({ message: "Please Enter the valid Mobile Number Starts with 6, 7, 8, 9" });
    }

    // Established year Validation
    const currentYear = new Date().getFullYear();
    const passedYear = parseInt(establishYear, 10);

    if (isNaN(passedYear) || passedYear > currentYear || passedYear < 1800) {
        return res.status(400).json({ message: "Please, Enter the valid Establish Year" });
    }

    // Checking in Database
    const checkQuery = "SELECT * FROM admin WHERE email = ? OR companyName = ?";
    db.query(checkQuery, [email, companyName], (err, result) => {
        if (err) {
            console.error("Check error:", err);
            return res.status(500).json({ message: "Database error on check" });
        }

        if (result.length > 0) {
            return res.status(400).json({ message: "Email or Company already exists" });
        }

        // Insert if no duplicate
        const insertQuery = "INSERT INTO admin (name, email, password, companyName, industry, companyMail, companyPhone, headquarters, establishYear, numberofEmployees) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        const values = [name, email, hashed_password, companyName, industry, companyMail, companyPhone, headquarters, establishYear, numberofEmployees];

        db.query(insertQuery, values, (insertErr, insertResult) => {
            if (insertErr) {
                console.error("Insert error:", insertErr);
                return res.status(500).json({ message: "Insert failed" });
            }

            return res.status(201).json({ message: "Account created successfully" });
        });
    });
});

// Send OTP
const OtpStorage = new Map();

router.post("/send-otp", async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiry

    OtpStorage.set(email, { otp, expiresAt });

    const mailOptions = {
        from: "hrms@gmail.com",
        to: email,
        subject: "OTP Verification",
        html: `
        <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OTP Message</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f8f9fa;
            padding: 20px;
        }
        .otp-container {
            background:     dient(to right, #ff80ab, #87cefa, #9370db); /* Pink, Skyblue, Violet */
            padding: 20px;
            border-radius: 10px;
            color: white;
            text-align: center;
            max-width: 400px;
            margin: 0 auto;
        }
        .otp-header {
            font-size: 24px;
            font-weight: bold;
        }
        .otp-message {
            font-size: 18px;
            margin-top: 10px;
        }
        .otp {
            font-size: 24px;
            font-weight: bold;
            color: yellow;
        }
        .expiry {
            font-size: 14px;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="otp-container">
        <div class="otp-header">OTP from HR Management Software</div>
        <div class="otp-message">
            Your OTP is: <span class="otp">${otp}</span>.
        </div>
        <div class="expiry">
            It will expire in 5 minutes.
        </div>
    </div>
</body>
</html>

        `
    };

    try {
        const result = await sender.sendMail(mailOptions);
        console.log(`✅ OTP ${otp} sent to ${email}`, result.response);
        return res.status(200).json({ message: `OTP sent to ${email}` });
    } catch (err) {
        console.error("Failed to send OTP", err);
        return res.status(500).json({ message: "Failed to send OTP" });
    }
});

// verify OTP
router.post("/verify-otp", (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: "Email and OTP are required" });
    }

    if (!OtpStorage.has(email)) {
        return res.status(400).json({ message: "OTP not found. Please request a new one." });
    }

    const { otp: storedOtp, expiresAt } = OtpStorage.get(email);

    if (Date.now() > expiresAt) {
        OtpStorage.delete(email);
        return res.status(400).json({ message: "OTP expired" });
    }

    if (Number(otp) === storedOtp) {
        OtpStorage.delete(email);
        return res.status(200).json({ message: "OTP verified successfully" });
    } else {
        return res.status(400).json({ message: "Invalid OTP" });
    }
});

router.post("/adminlogin", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "All Fields are required" });
    }

    const sql_query = "SELECT * FROM admin WHERE email=?";
    db.query(sql_query, [email], (err, results) => {
        if (err || results.length === 0) {
            return res.status(400).json({ message: "Email not found" });
        }

        const user = results[0];

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                return res.status(500).json({ message: "Error Occurred during login" });
            }

            if (!isMatch) {
                return res.status(401).json({ message: "Invalid credentials" });
            }

            const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_KEY, { expiresIn: '1h' });
            console.log(`Token for the ${email}:`, token);

            const { password: hashedPassword, ...userWithoutPassword } = user;

            return res.status(201).json({
                success: true,
                message: "Login Successfully",
                token,
                user: userWithoutPassword
            });
        });
    });
});

// Adding Employees
// router.post("/adding-employee", (req, res) => {
//     const {
//         employeeid,
//         fullName,
//         department,
//         designation,
//         employmentType,
//         dateOfJoining,
//         active,
//         email,
//         phoneNumber,
//         location
//     } = req.body;

//     // // 🔍 Basic Validation
//     // if (
//     //     !employeeid || !fullName || !department || !designation ||
//     //     !employmentType || !dateOfJoining || !active ||
//     //     !email || !phoneNumber || !location
//     // ) {
//     //     return res.status(400).json({ message: "All fields are required." });
//     // }

//     // // 🔢 Employee ID: Exactly 4 digits
//     // if (!/^\d{4}$/.test(employeeid)) {
//     //     return res.status(400).json({ message: "Employee ID must be exactly 4 digits." });
//     // }

//     // // 📅 Valid Date
//     // const joiningYear = new Date(dateOfJoining).getFullYear();
//     // const currentYear = new Date().getFullYear();
//     // if (joiningYear > currentYear || joiningYear < 1800) {
//     //     return res.status(400).json({ message: "Enter a valid Joining Date." });
//     // }

//     // // 📧 Email Format
//     // const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     // if (!emailRegex.test(email)) {
//     //     return res.status(400).json({ message: "Invalid email format." });
//     // }

//     // // 📱 Phone Number: 10 digits, starts with 6–9
//     // if (phoneNumber.length !== 10 || !['6', '7', '8', '9'].includes(phoneNumber[0])) {
//     //     return res.status(400).json({ message: "Invalid phone number." });
//     // }

//     // 🆔 Check for Duplicate Employee ID
//     db.query("SELECT * FROM employeesdetails WHERE employeeid = ?", [employeeid], (err, result) => {
//         if (err) {
//             console.error("Error checking employee ID:", err);
//             return res.status(500).json({ message: "Database Error (check employee ID)." });
//         }

//         if (result.length > 0) {
//             return res.status(409).json({ message: "Employee ID already exists." });
//         }

//         // ✅ All Good: Insert into DB
//         const insertQuery = `
//             INSERT INTO employeesdetails (
//                 employeeid, fullName, department, designation,
//                 employmentType, dateOfJoining, active,
//                 email, phoneNumber, location
//             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

//         const values = [
//             employeeid, fullName, department, designation,
//             employmentType, dateOfJoining, active,
//             email, phoneNumber, location
//         ];

//         db.query(insertQuery, values, (err, result) => {
//             if (err) {
//                 console.error("Error inserting into DB:", err);
//                 return res.status(500).json({ message: "Error inserting into database." });
//             }

//             console.log("✅ Employee added:", employeeid);
//             return res.status(201).json({ message: "Employee added successfully!" });
//         });
//     });
// });

router.post("/adding-employee", (req, res) => {
    const {
        employeeid,
        fullName,
        department,
        designation,
        employmentType,
        dateOfJoining,
        active,
        email,
        phoneNumber,
        location
    } = req.body;

    const sql_query = `
        INSERT INTO employeesdetails 
        (employeeid, fullName, department, designation, employmentType, dateOfJoining, active, email, phoneNumber, location) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        employeeid,
        fullName,
        department,
        designation,
        employmentType,
        dateOfJoining,
        active,
        email,
        phoneNumber,
        location
    ];

    // Validate Employee ID: Exactly 4 digits
    if (!/^\d{4}$/.test(employeeid)) {
        return res.status(400).json({ message: "Employee ID must be exactly 4 digits." });
    }

    // Validate Joining Date
    const joiningYear = new Date(dateOfJoining).getFullYear();
    const currentYear = new Date().getFullYear();
    if (joiningYear > currentYear || joiningYear < 1800) {
        return res.status(400).json({ message: "Enter a valid Joining Date." });
    }

    // Validate Email Format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format." });
    }

    // Validate Phone Number
    if (!/^[6-9]\d{9}$/.test(phoneNumber)) {
        return res.status(400).json({ message: "Invalid phone number." });
    }

    // Check for Duplicate Employee ID
    db.query("SELECT * FROM employeesdetails WHERE employeeid = ?", [employeeid], (err, result) => {
        if (err) {
            console.error("Error checking employee ID:", err);
            return res.status(500).json({ message: "Database Error (check employee ID)." });
        }

        if (result.length > 0) {
            return res.status(409).json({ message: "Employee ID already exists." });
        }

        // Insert New Employee
        db.query(sql_query, values, (err, results) => {
            if (err) {
                console.error("Error occurred in inserting into DB:", err);
                return res.status(500).json({ message: "Error occurred while inserting data." });
            }

            return res.status(201).json({ message: "Inserted Successfully" });
        });
    });
});

// DELETE Employee from the DB
router.delete("/adding-employee/:id", (req, res) => {
    const { id } = req.params;

    const sql_query = "DELETE FROM employeesdetails WHERE id=?";
    db.query(sql_query, [id], (err, results) => {
        if (err) {
            console.error("Error Occurred:", err);
            return res.status(400).json({ message: "Issues Occured during Deleting Data" });
        }

        console.log("Successfully Deleted:", results);
        return res.status(200).json({ message: "Employee Data is Deleted Successfully" });
    })
});

// UPDATE Employee from the DB
router.put("/adding-employee/:id", (req, res) => {
    const {
        employeeid,
        fullName,
        department,
        designation,
        employmentType,
        dateOfJoining,
        active,
        email,
        phoneNumber,
        location,
    } = req.body;

    const { id } = req.params;

    const sql_query = "UPDATE employeesdetails SET employeeid=?, fullName=?, department=?, designation=?, employmentType=?, dateOfJoining=?, active=?, email=?, phoneNumber=?, location=? WHERE id=?";
    const values = [
        employeeid,
        fullName,
        department,
        designation,
        employmentType,
        dateOfJoining,
        active,
        email,
        phoneNumber,
        location,
        id
    ]

    db.query(sql_query, values, (err, results) => {
        if (err) {
            console.error("Error Occurred in Updation Employees Details");
            return res.status(400).json({ message: "No updation is Occurred" });
        }

        console.log("Update Successfully Done");
        return res.status(200).json({ message: "Successfully Updated Employees Details" });
    })
});

// Fetching the database
router.get('/adding-employee', async (req, res) => {
    try {
        const connection = await mysql.createConnection({
            host: "localhost",
            user: "root",
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const [rows] = await connection.query('SELECT * FROM employeesdetails');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Download Employee Details in Excel fromat
router.get("/download-employees", async (req, res) => {
    const sql_query = "SELECT * FROM employeesdetails";

    db.query(sql_query, async (err, results) => {
        if (err) {
            console.error("DB Error:", err);
            return res.status(500).send("Error fetching employee data");
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Employees");

        // 👇 Define header row
        worksheet.columns = [
            { header: "ID", key: "id", width: 10 },
            { header: "Employee ID", key: "employeeid", width: 15 },
            { header: "Full Name", key: "fullName", width: 20 },
            { header: "Department", key: "department", width: 15 },
            { header: "Designation", key: "designation", width: 15 },
            { header: "Employment Type", key: "employmentType", width: 15 },
            { header: "Date of Joining", key: "dateOfJoining", width: 20 },
            { header: "Active", key: "active", width: 10 },
            { header: "Email", key: "email", width: 25 },
            { header: "Phone Number", key: "phoneNumber", width: 15 },
            { header: "Location", key: "location", width: 15 }
        ];

        // 👇 Add data rows
        results.forEach(emp => {
            worksheet.addRow(emp);
        });

        // 👇 Send Excel file
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=employees.xlsx");

        await workbook.xlsx.write(res);
        res.end();
    });
});

module.exports = router;