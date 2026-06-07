const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Webhook Aktif");
});

app.post("/saweria", (req, res) => {
    console.log("DONASI MASUK");
    console.log(req.body);

    res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});
