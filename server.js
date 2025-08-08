require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const admin=require("./Routes/adminController")

app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

app.use(admin);

app.use("/", (req, res) => {
    res.status(404).json({ message: "404-Page not Found" })
});

app.listen(process.env.PORT, () => {
    console.log(`server runs at http://localhost:${process.env.PORT}`)
});